import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * PAIEMENT LIVREUR — Enregistre un paiement de commission Silga
 *
 * Crée OBLIGATOIREMENT un enregistrement PaiementSilgapp traçable.
 * Supporte 4 modes de paiement :
 *   - course_unique  : 1 course spécifique (course_id fourni)
 *   - multi_courses : plusieurs courses spécifiques (courses_ids fourni)
 *   - solde_global   : toutes les courses impayées (aucun course_id/courses_ids)
 *   - partiel        : paiement partiel sur le solde (montant < solde total)
 *
 * Idempotent via request_id : un même request_id ne crée pas de double paiement.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      livreur_id,
      montant,           // montant réellement encaissé
      course_id,         // optionnel : 1 course
      courses_ids,       // optionnel : plusieurs courses
      request_id,        // optionnel : idempotence
      commentaire,
    } = payload;

    if (!livreur_id || !montant || montant <= 0) {
      return Response.json({ error: 'livreur_id et montant (>0) requis' }, { status: 400 });
    }

    // ── Récupérer le livreur ──
    const livreur = await base44.entities.Livreur.get(livreur_id);
    if (!livreur) {
      return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
    }

    // ── Idempotence via request_id ──
    if (request_id) {
      const existing = await base44.asServiceRole.entities.PaiementSilgapp
        .filter({ request_id, user_id: livreur_id })
        .catch(() => []);
      if (existing && existing.length > 0) {
        return Response.json({
          success: true,
          skipped: true,
          reason: 'request_id_already_processed',
          paiement_id: existing[0].id,
          message: 'Ce paiement a déjà été enregistré.',
        });
      }
    }

    const now = new Date().toISOString();
    const ancienSolde = livreur.montant_du_silga ?? livreur.encours ?? 0;

    // ── Déterminer les courses concernées et le type de paiement ──
    let coursesConcernees: string[] = [];
    let typePaiement: string;

    if (course_id) {
      // Paiement pour 1 course spécifique
      typePaiement = 'course_unique';
      coursesConcernees = [course_id];
      // Vérifier que la course existe et appartient au livreur
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });
      if (course.livreur_id !== livreur_id) {
        return Response.json({ error: 'Course n\'appartient pas à ce livreur' }, { status: 403 });
      }
    } else if (Array.isArray(courses_ids) && courses_ids.length > 0) {
      // Paiement pour plusieurs courses spécifiques
      typePaiement = 'multi_courses';
      coursesConcernees = courses_ids;
    } else {
      // Paiement global sur le solde — identifier les courses impayées
      typePaiement = montant >= ancienSolde ? 'solde_global' : 'partiel';
      const coursesImpayees = await base44.asServiceRole.entities.CourseExterne.filter(
        { livreur_id, statut: 'livree', statut_paiement_livreur: 'non_paye' },
        'heure_livraison', 200
      );
      // Répartir le montant sur les courses (FIFO : anciennes d'abord)
      let reste = montant;
      for (const c of (coursesImpayees || [])) {
        if (reste <= 0) break;
        coursesConcernees.push(c.id);
        reste -= (c.commission_silga ?? 0);
      }
    }

    // ── Refuser un paiement supérieur au solde dû ──
    //    Pas de crédit/avance implicite — si le montant dépasse la dette,
    //    le paiement est refusé. L'admin doit d'abord corriger le solde.
    if (montant > ancienSolde) {
      return Response.json({
        error: `Montant (${montant} FCFA) supérieur au solde dû (${ancienSolde} FCFA). Paiement refusé — aucun système de crédit/avance livreur n'est activé.`,
        solde_du: ancienSolde,
        montant_demande: montant,
      }, { status: 400 });
    }
    const nouveauSolde = ancienSolde - montant;

    // ── Créer l'enregistrement PaiementSilgapp (TRAÇABILITÉ OBLIGATOIRE) ──
    const paiementRecord = await base44.asServiceRole.entities.PaiementSilgapp.create({
      user_email: livreur.user_email || `livreur_${livreur_id}@silgapp.local`,
      user_type: 'livreur',
      user_id: livreur_id,
      user_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
      user_telephone: livreur.telephone || '',
      type_dette: 'commission_livreur',
      montant_du: ancienSolde,
      montant_paye: montant,
      ancien_solde: ancienSolde,
      nouveau_solde: nouveauSolde,
      courses_concernees: JSON.stringify(coursesConcernees),
      type_paiement: typePaiement,
      reference_paiement: `PAY-${livreur_id.slice(-8)}-${now.slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      request_id: request_id || `REQ-${livreur_id.slice(-8)}-${now}`,
      statut: 'traite',           // paiement admin = traité immédiatement
      traite_par: user.full_name || user.email || 'admin',
      traite_at: now,
      date_envoi: now,
      country_code: livreur.country_code,
    });

    // ── Marquer les courses concernées comme payées (si solde soldé) ──
    if (nouveauSolde <= 0 && coursesConcernees.length > 0) {
      await base44.asServiceRole.entities.CourseExterne.updateMany(
        { id: { $in: coursesConcernees } },
        { $set: { statut_paiement_livreur: 'paye', heure_paiement: now } }
      );
    } else if (course_id) {
      // Paiement d'une course unique — la marquer comme payée
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        statut_paiement_livreur: 'paye',
        heure_paiement: now,
      });
    }

    // ── Mettre à jour le livreur ──
    const updateData = {
      statut_paiement: nouveauSolde <= 0 ? 'paye' : 'non_paye',
      montant_paye: (livreur.montant_paye || 0) + montant,
      encours: nouveauSolde,
      montant_du_silga: nouveauSolde,
      dernier_paiement_date: now,
      heure_paiement: now,
      admin_paiement: user.full_name || user.email || 'admin',
    };

    // Débloquer si l'encours repasse sous le seuil
    if (livreur.bloque_encours && nouveauSolde > 0) {
      const countries = await base44.asServiceRole.entities.Country
        .filter({ code: livreur.country_code }).catch(() => []);
      const seuil = countries?.[0]?.seuil_encours_max || 5000;
      if (nouveauSolde < seuil) {
        Object.assign(updateData, {
          bloque_encours: false,
          encours_bloque_at: null,
          admin_hors_ligne: false,
          admin_statut_log: 'Déblocage après paiement validé par admin',
        });
      }
    } else if (livreur.bloque_encours && nouveauSolde <= 0) {
      Object.assign(updateData, {
        bloque_encours: false,
        encours_bloque_at: null,
        admin_hors_ligne: false,
        admin_statut_log: 'Déblocage après paiement intégral',
      });
    }

    await base44.entities.Livreur.update(livreur_id, updateData);

    // ── Historique encours ──
    try {
      await base44.asServiceRole.entities.HistoriqueEncours.create({
        type_action: 'paiement_valide',
        livreur_id,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
        livreur_telephone: livreur.telephone || '',
        pays_code: livreur.country_code,
        encours_avant: ancienSolde,
        encours_apres: nouveauSolde,
        action_par: user.email,
        commentaire: commentaire || `Paiement de ${montant} FCFA (${typePaiement}, ${coursesConcernees.length} course(s))`,
        date_action: now,
      });
    } catch (_) {}

    console.log(`[PAIEMENT] ${livreur_id} a payé ${montant}F (${typePaiement}) — solde: ${ancienSolde} → ${nouveauSolde}`);

    return Response.json({
      success: true,
      message: `Paiement de ${montant} FCFA enregistré`,
      paiement_id: paiementRecord.id,
      ancien_solde: ancienSolde,
      nouveau_solde: nouveauSolde,
      type_paiement: typePaiement,
      courses_concernees: coursesConcernees,
      montant,
    });

  } catch (error) {
    console.error('[PAIEMENT] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});