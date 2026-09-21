/**
 * venusObserverEngine.ts — Moteur d'Observation Autonome VENUS
 *
 * OPTIMISATION 2026-09-21 :
 *   - Suppression de la surveillance des courses annulées (décision métier)
 *   - Suppression des branches obsolètes (statuts en_cours, proposee, en_ligne — 0 résultat)
 *   - Chargement unique des VenusAutomationRule par cycle (élimine N+1)
 *   - Requêtes filtrées avec limite (pas de table complète)
 *
 * SURVEILLANCES SUPPRIMÉES (obsolètes, couvertes par d'autres moteurs) :
 *   - CourseExterne 'en_cours'   (livreur_retard)     → couverte par Détection Courses à Sauver
 *   - CourseExterne 'proposee'   (course_bloquee)      → couverte par Dispatch V2
 *   - CourseExterne 'annulee'    (course_annulee)      → supprimée par décision métier
 *   - Livreur 'en_ligne'         (encours_depasse)     → couverte par verifierEncoursLivreur + gestionPresenceLivreurs
 *
 * SURVEILLANCES CONSERVÉES :
 *   - PaiementSilgapp 'echec' (paiement_refuse) — retourne actuellement 0 résultat
 *   - CommandeBoutique 'en_attente' (zone_saturee) — retourne actuellement 0 résultat
 *
 * NOTE : Les deux surveillances conservées utilisent des statuts qui ne retournent
 * actuellement aucun résultat. Elles sont conservées telles quelles sans modification
 * (pas de remplacement de statut) conformément à la directive métier.
 */

// ─── Cycle d'Observation Principal ───
export async function runObservationCycle(base44) {
  const observations: any[] = [];

  // 1. Observer les paiements échoués
  const paiementsObs = await observerPaiements(base44);
  observations.push(...paiementsObs);

  // 2. Observer les partenaires (boutiques avec commandes en attente)
  const partenairesObs = await observerPartenaires(base44);
  observations.push(...partenairesObs);

  // 3. Évaluer les règles d'automatisation (chargement unique par cycle)
  if (observations.length > 0) {
    const rules = await base44.asServiceRole.entities.VenusAutomationRule.filter({ active: true });
    for (const obs of observations) {
      await evaluerReglesPourObservation(base44, obs, rules);
    }
  }

  return observations;
}

// ─── Observer les Paiements ───
async function observerPaiements(base44) {
  const observations: any[] = [];

  // Paiements récents échoués (limité à 10 pour éviter le chargement complet)
  const paiements = await base44.asServiceRole.entities.PaiementSilgapp.filter(
    { statut: 'echec' },
    '-created_date', 10
  );

  for (const paiement of paiements) {
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
async function observerPartenaires(base44) {
  const observations: any[] = [];

  // Vérifier les boutiques avec commandes en attente (limité à 100)
  const commandesBoutique = await base44.asServiceRole.entities.CommandeBoutique.filter(
    { statut: 'en_attente' },
    '-created_date', 100
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
async function evaluerReglesPourObservation(base44, observation: any, allRules: any[]) {
  // Filtrer les règles en mémoire (au lieu d'une requête DB par observation)
  const matchingRules = allRules.filter(r => r.condition_type === observation.type);

  for (const rule of matchingRules) {
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