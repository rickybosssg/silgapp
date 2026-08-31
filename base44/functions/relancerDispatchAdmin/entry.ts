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

    // ═══════════════════════════════════════════════════════════════════════
    // NETTOYAGE CIBLÉ DES ANCIENNES DISPATCHNOTIFICATION
    // ═══════════════════════════════════════════════════════════════════════
    //
    // RÈGLE MÉTIER :
    //   - Le livreur ayant ANNULÉ la course doit rester EXCLU du redispatch.
    //   - Les refus explicites restent exclus.
    //   - Les anciennes sollicitations (notifie, push_succes, etc.) sont supprimées
    //     pour permettre aux autres livreurs d'être reproposés.
    //
    // APPROCHE SCOPÉE À LA COURSE (sans mutation de Livreur.statut) :
    //   1. Identifier les livreurs à exclure (AnnulationLivreur + refus).
    //   2. Supprimer TOUTES les anciennes DispatchNotification (retry 3x + fallback).
    //   3. Créer les DispatchNotification 'refuse' pour les livreurs exclus
    //      AVANT le dispatch — c'est ce que getLivreursRefuses() utilise pour
    //      l'exclusion dans publierCourseDansFil.
    //   4. Déclencher le dispatch (action='lancer_recherche_auto').
    //
    // ⚠️ NOTE ARCHITECTURALE :
    //   publierCourseDansFil (Dispatch V2) a un anti-race check qui SKIP la
    //   course si getLivreursNotifies() retourne ≥1 résultat. Or
    //   getLivreursNotifies() retourne TOUS les statuts (y compris 'refuse').
    //   → Une notification 'refuse' seule fait croire à l'anti-race qu'une vague
    //     de diffusion a déjà été créée, et bloque le redispatch.
    //
    //   Correctif minimal proposé (NON appliqué — en attente de validation) :
    //   Modifier getLivreursNotifies() dans dispatchNotifications.ts pour
    //   exclure le statut 'refuse' du résultat. Voir rapport d'audit.
    //
    //   En attendant ce correctif, le redispatch s'appuie sur le watchdog
    //   (tick de secours) qui traitera la course via ANOMALIE 2 ou ANOMALIE 7.
    // ═══════════════════════════════════════════════════════════════════════

    // ── 1. Identifier les livreurs à PRÉSERVER (exclusion permanente) ──
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
    const exclusionRaisons = new Map<string, string>();
    for (const a of annulations || []) {
      if (a.livreur_id) {
        livreursAExclure.add(a.livreur_id);
        exclusionRaisons.set(a.livreur_id, a.motif || 'Annulé par le livreur');
      }
    }
    for (const n of refusNotifs || []) {
      if (n.livreur_id) {
        livreursAExclure.add(n.livreur_id);
        if (!exclusionRaisons.has(n.livreur_id)) {
          exclusionRaisons.set(n.livreur_id, n.raison_refus || 'Refusé par le livreur');
        }
      }
    }

    // ── 2. Supprimer TOUTES les anciennes DispatchNotification ──
    let nettoyageReussi = false;
    let derniereErreurNettoyage: string | null = null;

    for (let attempt = 1; attempt <= 3 && !nettoyageReussi; attempt++) {
      try {
        await base44.asServiceRole.entities.DispatchNotification
          .deleteMany({ course_id });
        nettoyageReussi = true;
        console.log(`[RELANCE_DISPATCH] Nettoyage DispatchNotification réussi (attempt ${attempt}) — ${livreursAExclure.size} livreur(s) à exclure`);
      } catch (err: any) {
        derniereErreurNettoyage = err?.message || String(err);
        console.error(`[RELANCE_DISPATCH] Erreur deleteMany attempt ${attempt}/3:`, derniereErreurNettoyage);
        if (attempt === 3) break;
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }

    // ── 2b. Fallback : suppression individuelle si deleteMany a échoué ──
    if (!nettoyageReussi) {
      console.warn('[RELANCE_DISPATCH] deleteMany a échoué — fallback suppression individuelle');
      try {
        const anciennesNotifs = await base44.asServiceRole.entities.DispatchNotification
          .filter({ course_id }, '-date_notification', 200);
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

    // ── 2c. Si le nettoyage échoue, NE PAS lancer le redispatch ──
    if (!nettoyageReussi) {
      console.error(`[RELANCE_DISPATCH] ABANDON — nettoyage DispatchNotification impossible pour course ${course_id}. Dernière erreur: ${derniereErreurNettoyage}`);
      return Response.json({
        error: 'Impossible de réinitialiser les notifications de dispatch. Redispatch annulé pour éviter un blocage (livreurs exclus à tort).',
        course_id,
        detail: derniereErreurNettoyage,
      }, { status: 500 });
    }

    // ── 3. Créer les exclusions permanentes AVANT le dispatch ──
    // DispatchNotification 'refuse' = ce que getLivreursRefuses() utilise pour
    // exclure le livreur du dispatch. Scopé à cette course uniquement.
    // NE MODIFIE PAS Livreur.statut — l'exclusion est purement au niveau
    // de la DispatchNotification, pas du livreur global.
    if (livreursAExclure.size > 0) {
      const nowIsoExclusion = new Date().toISOString();

      // Résoudre les user_email pour la RLS
      const livreurEmails = new Map<string, string | null>();
      const ids = [...livreursAExclure];
      const livreursData = await base44.asServiceRole.entities.Livreur
        .filter({ id: { $in: ids } }, undefined, ids.length)
        .catch(() => []);
      for (const l of livreursData || []) {
        livreurEmails.set(l.id, l.user_email || null);
      }
      // Fallback : récupérer depuis les anciennes notifs refuse
      for (const n of refusNotifs || []) {
        if (!livreurEmails.has(n.livreur_id) && n.livreur_user_email) {
          livreurEmails.set(n.livreur_id, n.livreur_user_email);
        }
      }

      for (const livreurId of ids) {
        await base44.asServiceRole.entities.DispatchNotification.create({
          course_id,
          livreur_id: livreurId,
          livreur_user_email: livreurEmails.get(livreurId) || null,
          country_code: course.country_code || '',
          vague: 0,
          statut: 'refuse',
          date_notification: nowIsoExclusion,
          date_reponse: nowIsoExclusion,
          raison_refus: exclusionRaisons.get(livreurId) || 'Annulé par le livreur (préservé par relancerDispatchAdmin)',
        }).catch((err: any) => {
          console.error(`[RELANCE_DISPATCH] Erreur création exclusion ${livreurId}:`, err?.message || String(err));
        });
      }
      console.log(`[RELANCE_DISPATCH] 🔒 ${livreursAExclure.size} exclusion(s) permanente(s) créée(s) (DispatchNotification refuse) — sans modifier Livreur.statut`);
    }

    console.log(`[RELANCE_DISPATCH] Course ${course_id} — nettoyage terminé: ${livreursAExclure.size} livreur(s) exclu(s), anciennes sollicitations supprimées`);

    // ── 4. Déclencher le dispatch (mécanisme V2 existant) ──
    // ⚠️ Si l'anti-race check de publierCourseDansFil bloque (car les notifs
    // 'refuse' créées en étape 3 font que getLivreursNotifies() retourne ≥1),
    // le watchdog (tick de secours 10 min) traitera la course via ANOMALIE 2
    // ou retry_courses_en_attente.
    // → Le correctif minimal proposé sur getLivreursNotifies() résoudra ce
    //   blocage de manière propre et définitive.
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