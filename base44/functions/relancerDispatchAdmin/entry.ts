import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// RELANCER DISPATCH ADMIN — Reset propre du dispatch par l'admin
// ═══════════════════════════════════════════════════════════════════════════
//
// Utilisé par :
//   - CourseDetailDialog (handleRelancerVague0) → mode="vague0"
//   - CoursesRedispatch (relaunchMutation) → mode="redispatch"
//
// Sécurité :
//   - Valide l'identité admin (base44.auth.me)
//   - mode="vague0" : reset complet + vide livreur_id + livreur_user_email=null
//   - mode="redispatch" : reset dispatch sans vider livreur_id (comportement existant)
//   - Strip TOUS les champs financiers (prix_final, commission_silga, etc.)
//   - Utilise les mécanismes V2 existants (dispatchExterneAuto)
//   - Ne recrée aucune logique parallèle
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, mode, motif } = body;

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    const resetMode = mode || 'redispatch'; // "vague0" | "redispatch"

    // ── Récupérer la course ──
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    if (['livree', 'annulee'].includes(course.statut)) {
      return Response.json({ error: 'Course terminée ou annulée' }, { status: 400 });
    }

    // ── Construire le reset dispatch ──
    const now = new Date().toISOString();
    const noteLabel = motif || `RELANCE ADMIN → recherche_livreur (${resetMode})`;

    const resetData: any = {
      statut: 'recherche_livreur',
      dispatch_status: 'en_attente',
      dispatch_wave: 0,
      dispatch_cycle_count: 0,
      dispatch_notified_ids: '[]',
      dispatch_wave_notified_ids: '[]',
      dispatch_refused_ids: '[]',
      dispatch_locked_until: null,
      timeout_expires_at: null,
      dispatch_next_wave_at: null,
      dispatch_v2_secours_phase: 0,
      notes: (course.notes || '') + ` | [${noteLabel}]`,
    };

    // ── Mode "vague0" : reset complet + libération du livreur ──
    if (resetMode === 'vague0') {
      resetData.livreur_id = '';
      resetData.livreur_nom = '';
      resetData.livreur_telephone = '';
      resetData.livreur_photo_url = '';
      resetData.livreur_vehicule = '';
      resetData.livreur_note_moyenne = 0;
      resetData.livreur_nombre_avis = 0;
      resetData.livreur_user_email = null; // ⚠️ Retrait livreur → null
      resetData.heure_acceptation = null;
    }

    // ── Mettre à jour la course ──
    await base44.asServiceRole.entities.CourseExterne.update(course_id, resetData);

    // ── Nettoyage ciblé des anciennes DispatchNotification ──────────────
    // RÈGLE MÉTIER : préserver l'exclusion du livreur ayant ANNULÉ la course
    // et des refus explicites. Seules les notifications de sollicitation
    // (notifie, push_succes, push_tente, sans_token, push_echec, expire)
    // sont supprimées pour permettre aux autres livreurs d'être reproposés.
    //
    // ⚠️ NE JAMAIS utiliser .catch(() => null) silencieusement ici.
    // Si le nettoyage échoue, le redispatch ne doit pas continuer comme si
    // tout avait réussi — cela créerait le bug de redispatch bloqué.
    // ────────────────────────────────────────────────────────────────────

    // 1. Identifier les livreurs à PRÉSERVER (exclusion permanente)
    const [annulations, refusNotifs] = await Promise.all([
      base44.asServiceRole.entities.AnnulationLivreur
        .filter({ course_id }, '-created_date', 50)
        .catch((err: any) => {
          console.error('[RELANCE_DISPATCH] Erreur lecture AnnulationLivreur:', err?.message || String(err));
          return [];
        }),
      base44.asServiceRole.entities.DispatchNotification
        .filter({ course_id, statut: 'refuse' }, '-date_notification', 50)
        .catch((err: any) => {
          console.error('[RELANCE_DISPATCH] Erreur lecture DispatchNotification(refuse):', err?.message || String(err));
          return [];
        }),
    ]);

    const livreursAExclure = new Set<string>();
    for (const a of annulations || []) {
      if (a.livreur_id) livreursAExclure.add(a.livreur_id);
    }
    for (const n of refusNotifs || []) {
      if (n.livreur_id) livreursAExclure.add(n.livreur_id);
    }

    // 2. Supprimer uniquement les notifications de sollicitation (PAS les refus)
    const STATUTS_SOLICITATION = ['notifie', 'push_succes', 'push_tente', 'sans_token', 'push_echec', 'expire'];

    let nettoyageReussi = false;
    let derniereErreurNettoyage: string | null = null;

    for (let attempt = 1; attempt <= 3 && !nettoyageReussi; attempt++) {
      try {
        const result = await base44.asServiceRole.entities.DispatchNotification
          .deleteMany({ course_id, statut: { $in: STATUTS_SOLICITATION } });

        nettoyageReussi = true;
        console.log(`[RELANCE_DISPATCH] Nettoyage DispatchNotification réussi (attempt ${attempt}) — ${livreursAExclure.size} livreur(s) préservé(s)`);
      } catch (err: any) {
        derniereErreurNettoyage = err?.message || String(err);
        console.error(`[RELANCE_DISPATCH] Erreur deleteMany attempt ${attempt}/3:`, derniereErreurNettoyage);

        if (attempt === 3) break;
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }

    // 3. Fallback : suppression individuelle si deleteMany a échoué
    if (!nettoyageReussi) {
      console.warn('[RELANCE_DISPATCH] deleteMany a échoué — fallback suppression individuelle');
      try {
        const anciennesNotifs = await base44.asServiceRole.entities.DispatchNotification
          .filter({ course_id, statut: { $in: STATUTS_SOLICITATION } }, '-date_notification', 200);

        let supprimees = 0;
        for (const n of anciennesNotifs || []) {
          try {
            await base44.asServiceRole.entities.DispatchNotification.delete(n.id);
            supprimees++;
          } catch (err: any) {
            console.error(`[RELANCE_DISPATCH] Fallback: échec suppression notif ${n.id}:`, err?.message || String(err));
          }
        }
        nettoyageReussi = supprimees > 0 || (anciennesNotifs || []).length === 0;
        console.log(`[RELANCE_DISPATCH] Fallback individuel: ${supprimees}/${anciennesNotifs?.length || 0} supprimées`);
      } catch (err: any) {
        console.error('[RELANCE_DISPATCH] Fallback individuel a échoué:', err?.message || String(err));
      }
    }

    // 4. Si le nettoyage a échoué malgré les retries et le fallback, on NE LANCE PAS
    //    le redispatch comme si tout avait réussi. Retourner une erreur explicite.
    if (!nettoyageReussi) {
      console.error(`[RELANCE_DISPATCH] ABANDON — nettoyage DispatchNotification impossible pour course ${course_id}. Dernière erreur: ${derniereErreurNettoyage}`);
      return Response.json({
        error: 'Impossible de réinitialiser les notifications de dispatch. Redispatch annulé pour éviter un blocage (livreurs exclus à tort).',
        course_id,
        detail: derniereErreurNettoyage,
      }, { status: 500 });
    }

    // 5. Préservation des exclusions légitimes : s'assurer que chaque livreur
    //    dans `livreursAExclure` (AnnulationLivreur + refus explicites) a une
    //    DispatchNotification avec statut='refuse' — c'est ce que le dispatch
    //    engine (dispatchV2.ts → getLivreursRefuses) utilise pour exclure.
    //
    //    Cas Judicaël Tago : il avait accepté puis annulé. Sa notification était
    //    'push_succes' (pas 'refuse'). Le nettoyage l'a supprimée. Sans cette
    //    étape, il pourrait être re-notifié et re-accepter la même course.
    if (livreursAExclure.size > 0) {
      try {
        const refusExistants = await base44.asServiceRole.entities.DispatchNotification
          .filter({ course_id, statut: 'refuse' }, '-date_notification', 50)
          .catch(() => []);
        const refusIdsExistants = new Set((refusExistants || []).map(n => n.livreur_id));
        const manquants = [...livreursAExclure].filter(id => !refusIdsExistants.has(id));

        if (manquants.length > 0) {
          console.log(`[RELANCE_DISPATCH] 🔒 Recréation de ${manquants.length} exclusion(s) permanente(s) (AnnulationLivreur + refus)`);

          // Résoudre les user_email des livreurs exclus pour la RLS
          const livreurEmails = new Map<string, string>();
          for (const livreurId of manquants) {
            const ancienRefus = (refusNotifs || []).find(n => n.livreur_id === livreurId);
            if (ancienRefus?.livreur_user_email) {
              livreurEmails.set(livreurId, ancienRefus.livreur_user_email);
            }
          }

          // Pour les livreurs sans user_email résolu (cas AnnulationLivreur),
          // récupérer depuis l'entité Livreur
          const sansEmail = manquants.filter(id => !livreurEmails.has(id));
          if (sansEmail.length > 0) {
            const livreursData = await base44.asServiceRole.entities.Livreur
              .filter({ id: { $in: sansEmail } }, undefined, sansEmail.length)
              .catch(() => []);
            for (const l of livreursData || []) {
              if (l.user_email) livreurEmails.set(l.id, l.user_email);
            }
          }

          // Créer les exclusions permanentes
          const nowIso = new Date().toISOString();
          for (const livreurId of manquants) {
            const annulation = (annulations || []).find(a => a.livreur_id === livreurId);
            await base44.asServiceRole.entities.DispatchNotification.create({
              course_id,
              livreur_id: livreurId,
              livreur_user_email: livreurEmails.get(livreurId) || null,
              country_code: course.country_code || '',
              vague: 0,
              statut: 'refuse',
              date_notification: nowIso,
              date_reponse: nowIso,
              raison_refus: annulation?.motif || 'Annulé par le livreur (préservé par relancerDispatchAdmin)',
            }).catch((err: any) => {
              console.error(`[RELANCE_DISPATCH] Erreur recréation exclusion ${livreurId}:`, err?.message || String(err));
            });
          }
        }
      } catch (err: any) {
        console.error('[RELANCE_DISPATCH] Erreur préservation exclusions:', err?.message || String(err));
      }
    }

    console.log(`[RELANCE_DISPATCH] Course ${course_id} — nettoyage terminé: ${livreursAExclure.size} livreur(s) exclu(s), anciennes sollicitations supprimées`);

    // ── Déclencher le dispatch immédiatement (mécanisme V2 existant) ──
    await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {}).catch((err: any) => {
      console.error('[RELANCE_DISPATCH] Erreur dispatchExterneAuto:', err?.message || String(err));
    });

    // ── Si mode vague0, libérer le livreur ──
    if (resetMode === 'vague0' && course.livreur_id) {
      const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
      if (livreur) {
        await base44.asServiceRole.entities.Livreur.update(course.livreur_id, {
          statut: livreur.manual_hors_ligne === true ? 'hors_ligne' : 'disponible',
        }).catch(() => null);
      }
    }

    console.log(`[RELANCE_DISPATCH] Course ${course_id} relancée (mode=${resetMode}) par ${user.email}`);

    return Response.json({
      success: true,
      course_id,
      mode: resetMode,
      message: `Course relancée (${resetMode}) — dispatch en cours`,
    });

  } catch (error) {
    console.error('[RELANCE_DISPATCH] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}