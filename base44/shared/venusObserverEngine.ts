/**
 * venusObserverEngine.ts — Moteur d'Observation Autonome VENUS
 *
 * Surveille en permanence: courses, livreurs, partenaires, paiements, notifications, GPS
 * Détecte les événements importants et déclenche des actions automatiques
 */

// ─── Cycle d'Observation Principal ───
export async function runObservationCycle(base44) {
  const now = new Date();
  const observations: any[] = [];

  // 1. Observer les courses actives
  const coursesObs = await observerCourses(base44, now);
  observations.push(...coursesObs);

  // 2. Observer les livreurs
  const livreursObs = await observerLivreurs(base44, now);
  observations.push(...livreursObs);

  // 3. Observer les paiements
  const paiementsObs = await observerPaiements(base44, now);
  observations.push(...paiementsObs);

  // 4. Observer les partenaires (boutiques/restaurants)
  const partenairesObs = await observerPartenaires(base44, now);
  observations.push(...partenairesObs);

  // 5. Évaluer les règles d'automatisation
  for (const obs of observations) {
    await evaluerReglesPourObservation(base44, obs);
  }

  return observations;
}

// ─── Observer les Courses ───
async function observerCourses(base44, now: Date) {
  const observations: any[] = [];
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  // Courses en cours avec retard potentiel
  const coursesEnCours = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: 'en_cours' }
  );

  for (const course of coursesEnCours) {
    if (course.date_prise_en_charge) {
      const priseEnCharge = new Date(course.date_prise_en_charge);
      const retardMin = Math.round((now.getTime() - priseEnCharge.getTime()) / 60000);

      if (retardMin > 45) {
        observations.push({
          type: 'livreur_retard',
          severity: retardMin > 60 ? 'critique' : 'haute',
          entity_type: 'course',
          entity_id: course.id,
          cible_id: course.client_telephone,
          data: {
            course_id: course.id,
            retard_minutes: retardMin,
            livreur_id: course.livreur_id,
            client_telephone: course.client_telephone,
          },
          message: `Course ${course.id}: livreur en retard de ${retardMin} minutes`,
        });
      }
    }
  }

  // Courses bloquées (proposées depuis trop longtemps)
  const coursesProposees = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: 'proposee' }
  );

  for (const course of coursesProposees) {
    const creation = new Date(course.created_date);
    const attenteMin = Math.round((now.getTime() - creation.getTime()) / 60000);

    if (attenteMin > 10) {
      observations.push({
        type: 'course_bloquee',
        severity: attenteMin > 20 ? 'critique' : 'haute',
        entity_type: 'course',
        entity_id: course.id,
        data: {
          course_id: course.id,
          attente_minutes: attenteMin,
          client_telephone: course.client_telephone,
        },
        message: `Course ${course.id}: en attente de livreur depuis ${attenteMin} minutes`,
      });
    }
  }

  // Courses annulées récemment → proposer re-dispatch
  const coursesAnnulees = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: 'annulee' }
  );

  for (const course of coursesAnnulees.slice(0, 5)) {
    if (course.updated_date) {
      const annulation = new Date(course.updated_date);
      const delai = (now.getTime() - annulation.getTime()) / 60000;
      if (delai < 5) {
        observations.push({
          type: 'course_annulee',
          severity: 'normale',
          entity_type: 'course',
          entity_id: course.id,
          data: {
            course_id: course.id,
            client_telephone: course.client_telephone,
            raison: course.raison_annulation || 'N/A',
          },
          message: `Course ${course.id} annulée — proposer nouvelle recherche au client`,
        });
      }
    }
  }

  return observations;
}

// ─── Observer les Livreurs ───
async function observerLivreurs(base44, now: Date) {
  const observations: any[] = [];

  const livreurs = await base44.asServiceRole.entities.Livreur.filter(
    { statut: 'en_ligne' }
  );

  for (const livreur of livreurs) {
    // Vérifier l'encours financier
    if (livreur.encours && livreur.encours > 5000) {
      observations.push({
        type: 'encours_depasse',
        severity: 'haute',
        entity_type: 'livreur',
        entity_id: livreur.id,
        cible_id: livreur.id,
        data: {
          livreur_id: livreur.id,
          livreur_nom: livreur.nom,
          encours: livreur.encours,
        },
        message: `Livreur ${livreur.nom}: encours élevé (${livreur.encours} FCFA)`,
      });
    }

    // Vérifier si le livreur est en ligne mais sans activité prolongée
    if (livreur.derniere_activite) {
      const derniereActivite = new Date(livreur.derniere_activite);
      const inactiviteMin = Math.round((now.getTime() - derniereActivite.getTime()) / 60000);
      if (inactiviteMin > 30 && livreur.statut === 'en_ligne') {
        observations.push({
          type: 'livreur_hors_ligne',
          severity: 'basse',
          entity_type: 'livreur',
          entity_id: livreur.id,
          data: {
            livreur_id: livreur.id,
            livreur_nom: livreur.nom,
            inactivite_minutes: inactiviteMin,
          },
          message: `Livreur ${livreur.nom}: en ligne mais inactif depuis ${inactiviteMin} min`,
        });
      }
    }
  }

  return observations;
}

// ─── Observer les Paiements ───
async function observerPaiements(base44, now: Date) {
  const observations: any[] = [];

  // Paiements récents échoués
  const paiements = await base44.asServiceRole.entities.PaiementSilgapp.filter(
    { statut: 'echec' }
  );

  for (const paiement of paiements.slice(0, 10)) {
    observations.push({
      type: 'paiement_refuse',
      severity: 'normale',
      entity_type: 'paiement',
      entity_id: paiement.id,
      cible_id: paiement.livreur_id || paiement.telephone,
      data: {
        paiement_id: paiement.id,
        montant: paiement.montant,
        livreur_id: paiement.livreur_id,
        telephone: paiement.telephone,
      },
      message: `Paiement échoué: ${paiement.montant} FCFA — proposer un autre moyen`,
    });
  }

  return observations;
}

// ─── Observer les Partenaires ───
async function observerPartenaires(base44, now: Date) {
  const observations: any[] = [];

  // Vérifier les boutiques avec commandes en attente
  const commandesBoutique = await base44.asServiceRole.entities.CommandeBoutique.filter(
    { statut: 'en_attente' }
  );

  const byBoutique: Record<string, number> = {};
  for (const cmd of commandesBoutique) {
    byBoutique[cmd.boutique_id] = (byBoutique[cmd.boutique_id] || 0) + 1;
  }

  for (const [boutiqueId, count] of Object.entries(byBoutique)) {
    if (count >= 3) {
      observations.push({
        type: 'zone_saturee',
        severity: 'haute',
        entity_type: 'boutique',
        entity_id: boutiqueId,
        data: {
          boutique_id: boutiqueId,
          nb_commandes_en_attente: count,
        },
        message: `Boutique ${boutiqueId}: ${count} commandes en attente — risque de saturation`,
      });
    }
  }

  return observations;
}

// ─── Évaluer les règles d'automatisation pour une observation ───
async function evaluerReglesPourObservation(base44, observation: any) {
  const rules = await base44.asServiceRole.entities.VenusAutomationRule.filter(
    { condition_type: observation.type, active: true }
  );

  for (const rule of rules) {
    const action = await base44.asServiceRole.entities.VenusAgentAction.create({
      type_action: 'auto_notification',
      declencheur: `observer:${observation.type}`,
      cible_type: observation.cible_id ? 'client' : 'admin',
      cible_id: observation.cible_id || '',
      contexte: JSON.stringify(observation),
      raisonnement: `Règle "${rule.nom}" déclenchée par observation: ${observation.message}`,
      action_executee: rule.action_type,
      niveau_autonomie: rule.niveau_autonomie,
      validation_requise: rule.niveau_autonomie === 'suggest_only',
      statut: rule.niveau_autonomie === 'auto_execute' ? 'executee' : 'proposee',
      priorite: rule.priorite,
      pays: observation.data?.pays || 'ALL',
      date_creation: new Date().toISOString(),
      date_execution: rule.niveau_autonomie === 'auto_execute' ? new Date().toISOString() : null,
    });

    // Incrémenter le compteur de déclenchements
    await base44.asServiceRole.entities.VenusAutomationRule.update(rule.id, {
      nb_declenchements: (rule.nb_declenchements || 0) + 1,
      dernier_declenchement: new Date().toISOString(),
    });

    // Logger la décision
    await base44.asServiceRole.entities.VenusDecisionLog.create({
      action_id: action.id,
      agent: 'observer',
      type_decision: 'automation_trigger',
      raisonnement: `Règle "${rule.nom}" déclenchée: ${observation.message}`,
      regles_appliquees: JSON.stringify([{
        regle_id: rule.id,
        regle_nom: rule.nom,
        condition: rule.condition_type,
        action: rule.action_type,
      }]),
      donnees_utilisees: JSON.stringify(observation.data),
      contexte: JSON.stringify(observation),
      niveau_confiance: 85,
      explication_simple: `VENUS a détecté "${observation.message}" et appliqué la règle automatique "${rule.nom}".`,
      date_creation: new Date().toISOString(),
    });
  }
}