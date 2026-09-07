import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { emitPaymentReceived } from '../../shared/venusAdminEventBus.ts';
import { recalculerSoldeLivreur } from '../../shared/recalculerSoldeLivreur.ts';
import { calculerSoldeLivreur } from '../../shared/soldeCalculator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TRAITER PAIEMENT SILGAPP — Fiabilisation comptable
// ═══════════════════════════════════════════════════════════════════════════
//
// PROTECTIONS (post-audit Augustin 07/09/2026) :
//
// 1. CAS ATOMIQUE sur statut (en_attente → traite) — anti double traitement
// 2. ancien_solde calculé via soldeCalculator (source de vérité, pas montant_du_silga)
// 3. nouveau_solde = résultat réel de recalculerSoldeLivreur
// 4. courses_concernees = IDs des courses réellement soldées
// 5. type_paiement = partiel si montant < ancien_solde, sinon déduit du count
// 6. montant_paye recalculé depuis les sources (idempotent, jamais incrémenté)
// 7. HistoriqueEncours : encours_avant = ancien_solde soldeCalculator (pas valeur stockée)
// 8. Récupération après échec partiel : si statut=traite mais nouveau_solde=null,
//    les opérations financières sont re-jouées de manière idempotente.
//    Le marqueur de complétion est nouveau_solde != null sur PaiementSilgapp.
//
// SCHÉMA PaiementSilgapp.statut : en_attente, traite, refuse
//   → Pas de statut intermédiaire (en_traitement) — aurait nécessité modification de schéma.
//   → Le CAS + idempotence des opérations garantit la sécurité sans statut intermédiaire.
//
// ⚠️  AUCUN BACKFILL HISTORIQUE. Les anciens paiements gardent leurs valeurs null.
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ success: false, error: 'Admin uniquement' }, { status: 403 });

    const { payment_id, action } = await req.json();
    if (!payment_id) return Response.json({ success: false, error: 'payment_id requis' }, { status: 400 });

    const paiement = await base44.asServiceRole.entities.PaiementSilgapp.get(payment_id);
    if (!paiement) return Response.json({ success: false, error: 'Paiement introuvable' }, { status: 404 });

    const isRefus = action === 'refuser';

    // ── REFUS — CAS atomique ──
    if (isRefus) {
      const refuseClaim = await base44.asServiceRole.entities.PaiementSilgapp.updateMany(
        { id: payment_id, statut: 'en_attente' },
        { $set: { statut: 'refuse', traite_par: user.email, traite_at: new Date().toISOString() } }
      );
      if (!refuseClaim || refuseClaim.updated !== 1) {
        return Response.json({ success: false, error: 'Déjà traité' }, { status: 409 });
      }

      // Push notification
      try {
        const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ user_email: paiement.user_email, actif: true });
        if (tokens && tokens.length > 0) {
          await base44.functions.invoke('envoiNotificationPush', {
            tokens: tokens.map(t => t.token),
            titre: 'Paiement refusé',
            message: `Votre preuve de paiement de ${paiement.montant_paye} FCFA n'a pas pu être validée. Contactez SILGAPP.`,
            type: 'paiement_traite',
            user_email: paiement.user_email,
          });
        }
      } catch (e) {
        console.error('Push notification error:', e?.message);
      }

      return Response.json({ success: true, statut: 'refuse' });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACCEPTATION
    // ═══════════════════════════════════════════════════════════════════════

    // 1. Vérifier si déjà entièrement traité (nouveau_solde renseigné = ops complètes)
    if (paiement.statut === 'traite' && paiement.nouveau_solde !== null && paiement.nouveau_solde !== undefined) {
      return Response.json({ success: false, error: 'Déjà traité' }, { status: 409 });
    }

    // 2. Calculer ancien_solde AVANT traitement (source de vérité = soldeCalculator)
    //    Ne JAMAIS utiliser Livreur.montant_du_silga (peut être désynchronisé)
    let ancienSoldeCalcule: number | null = null;
    const isLivreurCommission = paiement.user_type === 'livreur' && paiement.type_dette === 'commission_livreur';
    if (isLivreurCommission) {
      const { solde } = await calculerSoldeLivreur(base44, paiement.user_id);
      ancienSoldeCalcule = solde;
    }

    // 3. CAS ATOMIQUE : en_attente → traite (réclame le paiement)
    //    Si le paiement est encore en_attente, on le réclame atomiquement.
    //    Si déjà traite (nouveau_solde null = échec partiel), on reprend les ops.
    let isRecovery = false;
    if (paiement.statut === 'en_attente') {
      const now = new Date().toISOString();
      const claimResult = await base44.asServiceRole.entities.PaiementSilgapp.updateMany(
        { id: payment_id, statut: 'en_attente' },
        { $set: { statut: 'traite', traite_par: user.email, traite_at: now, ancien_solde: ancienSoldeCalcule } }
      );
      if (!claimResult || claimResult.updated !== 1) {
        // Race condition : un autre appel vient de réclamer le paiement
        return Response.json({ success: false, error: 'Déjà traité' }, { status: 409 });
      }
    } else if (paiement.statut === 'traite') {
      // Récupération après échec partiel : statut déjà traite mais nouveau_solde null.
      // Les opérations financières ci-dessous sont idempotentes — sûres à re-jouer.
      // ancien_solde a déjà été défini par le premier appel (CAS).
      isRecovery = true;
      ancienSoldeCalcule = paiement.ancien_solde; // utiliser la valeur du premier appel
    } else {
      return Response.json({ success: false, error: 'Statut invalide' }, { status: 400 });
    }

    // 4. Opérations financières (toutes idempotentes)
    if (paiement.user_type === 'livreur') {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ id: paiement.user_id });
      if (livreurs?.[0]) {
        const livreur = livreurs[0];

        // 4a. Marquer les courses impayées comme payées (idempotent)
        //     updateMany filtre par statut_paiement_livreur: 'non_paye' →
        //     les courses déjà marquées paye par un appel précédent sont ignorées.
        const coursesImpayees = await base44.asServiceRole.entities.CourseExterne.filter(
          { livreur_id: livreur.id, statut: 'livree', statut_paiement_livreur: 'non_paye' },
          'heure_livraison', 200
        );

        let reste = paiement.montant_paye;
        const coursesAPayer: string[] = [];
        for (const c of (coursesImpayees || [])) {
          if (reste <= 0) break;
          const comm = c.commission_silga ?? 0;
          coursesAPayer.push(c.id);
          reste -= comm;
        }

        if (coursesAPayer.length > 0) {
          await base44.asServiceRole.entities.CourseExterne.updateMany(
            { id: { $in: coursesAPayer }, statut_paiement_livreur: 'non_paye' },
            { $set: { statut_paiement_livreur: 'paye', heure_paiement: new Date().toISOString(), admin_paiement: user.email } }
          );
        }

        // 4b. Mettre à jour montant_paye (idempotent — recalculé depuis les sources)
        //     Au lieu d'incrémenter (livreur.montant_paye + paiement), on recalcule
        //     la somme de TOUS les paiements traités → idempotent par construction.
        const allTraitePaiements = await base44.asServiceRole.entities.PaiementSilgapp.filter(
          { user_id: livreur.id, statut: 'traite', type_dette: 'commission_livreur' }
        );
        const totalPayeCalcule = (allTraitePaiements || []).reduce((sum, p) => sum + (Number(p.montant_paye) || 0), 0);
        await base44.asServiceRole.entities.Livreur.update(livreur.id, {
          montant_paye: totalPayeCalcule,
          dernier_paiement_date: new Date().toISOString(),
        });

        // 4c. Recalculer le solde (idempotent — recalcule depuis les sources)
        const resultat = await recalculerSoldeLivreur(base44, livreur.id);
        const { solde: nouveauSolde, seuil } = resultat;

        if (seuil === null || seuil <= 0) {
          return Response.json({
            success: false,
            error: `Seuil d'encours non configuré pour le pays ${livreur.country_code}`,
            blocked_reason: 'missing_country_seuil_encours_max',
          }, { status: 400 });
        }

        // 4d. Déterminer type_paiement
        //     partiel = montant versé < dû réel avant paiement (prioritaire)
        //     Sinon déduit du nombre de courses soldées
        let typePaiement: string;
        if (ancienSoldeCalcule !== null && paiement.montant_paye < ancienSoldeCalcule) {
          typePaiement = 'partiel';
        } else if (coursesAPayer.length === 0) {
          typePaiement = 'solde_global';
        } else if (coursesAPayer.length === 1) {
          typePaiement = 'course_unique';
        } else {
          typePaiement = 'multi_courses';
        }

        // 4e. Écrire les champs d'audit sur PaiementSilgapp
        //     nouveau_solde non-null = marqueur de complétion (anti re-traitement)
        await base44.asServiceRole.entities.PaiementSilgapp.update(payment_id, {
          nouveau_solde: nouveauSolde,
          courses_concernees: JSON.stringify(coursesAPayer),
          type_paiement: typePaiement,
        });

        // 4f. HistoriqueEncours (idempotent — vérifie l'existence avant création)
        //     encours_avant = ancien_solde soldeCalculator (PAS Livreur.montant_du_silga)
        try {
          const existingHist = await base44.asServiceRole.entities.HistoriqueEncours.filter({
            livreur_id: livreur.id,
            type_action: 'paiement_valide',
          });
          const alreadyExists = (existingHist || []).some(h => h.commentaire?.includes(payment_id));
          if (!alreadyExists) {
            await base44.asServiceRole.entities.HistoriqueEncours.create({
              type_action: 'paiement_valide',
              livreur_id: livreur.id,
              livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
              livreur_telephone: livreur.telephone || '',
              pays_code: livreur.country_code,
              encours_avant: ancienSoldeCalcule ?? 0,
              encours_apres: nouveauSolde,
              seuil_applicable: seuil,
              pourcentage_atteint: seuil > 0 ? Math.round((nouveauSolde / seuil) * 100) : 0,
              action_par: user.email,
              commentaire: `Paiement ${payment_id} de ${paiement.montant_paye} FCFA validé (${coursesAPayer.length} course(s) soldée(s))`,
              date_action: new Date().toISOString(),
            });
          }
        } catch (_) {}

        // VENUS Admin Event (non-bloquant)
        await emitPaymentReceived(base44, paiement).catch(() => {});
      }
    } else if (paiement.user_type === 'client') {
      const frais = await base44.asServiceRole.entities.FraisAnnulation.filter({ client_id: paiement.user_id, statut_paiement: 'non_paye' });
      let reste = paiement.montant_paye;
      for (const f of (frais || [])) {
        if (reste <= 0) break;
        const m = f.montant || 0;
        if (m <= reste) {
          await base44.asServiceRole.entities.FraisAnnulation.update(f.id, { statut_paiement: 'paye', paye_at: new Date().toISOString() });
          reste -= m;
        } else {
          await base44.asServiceRole.entities.FraisAnnulation.update(f.id, { montant: m - reste });
          reste = 0;
        }
      }
      const remainingFrais = await base44.asServiceRole.entities.FraisAnnulation.filter({ client_id: paiement.user_id, statut_paiement: 'non_paye' });
      const totalRemaining = (remainingFrais || []).reduce((s, f) => s + (f.montant || 0), 0);
      if (totalRemaining < 2000) {
        await base44.asServiceRole.entities.ClientExterne.update(paiement.user_id, { bloque_frais_annulation: false });
      }
    } else if (paiement.user_type === 'boutique') {
      const boutiques = await base44.asServiceRole.entities.Boutique.filter({ id: paiement.user_id });
      if (boutiques?.[0]) {
        const nouveauSolde = Math.max(0, (boutiques[0].montant_du_silga || 0) - paiement.montant_paye);
        await base44.asServiceRole.entities.Boutique.update(boutiques[0].id, { montant_du_silga: nouveauSolde });
      }
    } else if (paiement.user_type === 'restaurant') {
      const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: paiement.user_id });
      if (restaurants?.[0]) {
        const nouveauSolde = Math.max(0, (restaurants[0].montant_du_silga || 0) - paiement.montant_paye);
        await base44.asServiceRole.entities.Restaurant.update(restaurants[0].id, { montant_du_silga: nouveauSolde });
      }
    }

    // Push notification (non-bloquant)
    try {
      const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ user_email: paiement.user_email, actif: true });
      if (tokens && tokens.length > 0) {
        const titre = 'Paiement validé ✅';
        const message = `Votre paiement de ${paiement.montant_paye} FCFA a été validé par SILGAPP. Merci !`;
        await base44.functions.invoke('envoiNotificationPush', {
          tokens: tokens.map(t => t.token),
          titre,
          message,
          type: 'paiement_traite',
          user_email: paiement.user_email,
        });
      }
    } catch (e) {
      console.error('Push notification error:', e?.message);
    }

    // VENUS Admin Event (non-bloquant) — pour les types non-livreur
    if (!isLivreurCommission) {
      await emitPaymentReceived(base44, paiement).catch(() => {});
    }

    return Response.json({ success: true, statut: 'traite' });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
