import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Nettoyage matinal automatique — 5h00 chaque jour
 * Nettoie les données obsolètes accumulées sur les courses terminées/annulées.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Autoriser automation (pas d'user) ou admin
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user?.role === 'admin') isAdmin = true;
    } catch (_) {
      isAdmin = true; // Appel depuis automation
    }
    if (!isAdmin) {
      return Response.json({ error: 'Accès refusé — admin uniquement' }, { status: 403 });
    }

    const sr = base44.asServiceRole;
    const results = [];

    // ── 1. Courses annulées : nettoyer dispatch_status, garder livreur_nom ──
    const annuleesNettoyees = await sr.entities.CourseExterne.updateMany(
      {
        statut: 'annulee',
        dispatch_status: { $in: ['propose', 'cycle_epuise', 'redispatch', 'en_attente', 'accepte', 'expire'] }
      },
      {
        $set: {
          dispatch_status: '',
          dispatch_wave: 0,
          timeout_expires_at: null,
          dispatch_notified_ids: '[]'
        }
      }
    ).catch((e) => { results.push({ module: 'annulees', error: e.message }); return null; });

    if (annuleesNettoyees) {
      results.push({ module: 'annulees_dispatch_cleaned', count: annuleesNettoyees.modified_count || 0 });
    }

    // ── 2. Courses livrées : nettoyer dispatch_status ET livreur_id ──
    const livreesNettoyees = await sr.entities.CourseExterne.updateMany(
      {
        statut: 'livree',
        dispatch_status: { $in: ['propose', 'cycle_epuise', 'redispatch', 'en_attente', 'accepte', 'expire'] }
      },
      {
        $set: {
          dispatch_status: '',
          dispatch_wave: 0,
          timeout_expires_at: null,
          dispatch_notified_ids: '[]'
        }
      }
    ).catch((e) => { results.push({ module: 'livrees', error: e.message }); return null; });

    if (livreesNettoyees) {
      results.push({ module: 'livrees_dispatch_cleaned', count: livreesNettoyees.modified_count || 0 });
    }

    // ── 3. Courses livrées : effacer livreur_id (déjà livrées, plus besoin) ──
    const livreesLivreurCleared = await sr.entities.CourseExterne.updateMany(
      { statut: 'livree', livreur_id: { $ne: '' } },
      { $set: { livreur_id: '', livreur_telephone: '' } }
    ).catch((e) => { results.push({ module: 'livrees_livreur', error: e.message }); return null; });

    if (livreesLivreurCleared) {
      results.push({ module: 'livrees_livreur_cleared', count: livreesLivreurCleared.modified_count || 0 });
    }

    // ── 4. Livreurs orphelins en_course sans course active ──
    const STATUTS_ACTIFS = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison'];
    const livreursEnCourse = await sr.entities.Livreur.filter({ statut: 'en_course' }, '-updated_date', 200).catch(() => []);
    let orphelinsCorriges = 0;
    if (livreursEnCourse.length > 0) {
      const coursesActives = await sr.entities.CourseExterne.filter(
        { statut: { $in: STATUTS_ACTIFS } }, '-created_date', 100
      ).catch(() => []);
      const livreurIdsAvecCourse = new Set(coursesActives.map(c => c.livreur_id).filter(Boolean));
      for (const l of livreursEnCourse) {
        if (!livreurIdsAvecCourse.has(l.id)) {
          await sr.entities.Livreur.update(l.id, { statut: 'disponible' }).catch(() => null);
          orphelinsCorriges++;
        }
      }
    }
    results.push({ module: 'livreurs_orphelins', count: orphelinsCorriges });

    // ── 5. Courses fantômes (nouvelle > 2h, jamais assignées) ──
    const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const fantomes = await sr.entities.CourseExterne.filter(
      { statut: 'nouvelle', livreur_id: '', created_date: { $lt: cutoff } },
      '-created_date', 50
    ).catch(() => []);
    let fantomesAnnulees = 0;
    for (const c of fantomes) {
      await sr.entities.CourseExterne.update(c.id, {
        statut: 'annulee',
        dispatch_status: '',
        notes: (c.notes || '') + ' | [AUTO] Course fantôme — annulée par nettoyage matinal'
      }).catch(() => null);
      fantomesAnnulees++;
    }
    results.push({ module: 'courses_fantomes', count: fantomesAnnulees });

    // ── 6. Notifications lues anciennes (> 30 jours) → nettoyage ──
    const notifCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    try {
      const notifsOld = await sr.entities.Notification.updateMany(
        { lue: true, updated_date: { $lt: notifCutoff } },
        { $set: { lue: true } }
      );
      results.push({ module: 'notifications_old_cleaned', count: notifsOld?.modified_count || 0 });
    } catch (e) {
      results.push({ module: 'notifications_old', error: e.message });
    }

    // ── 7. Rapport ──
    const resume = results.map(r => `${r.module}: ${r.count ?? r.error}`).join(' | ');
    console.log(`[NETTOYAGE_MATINAL] ${resume}`);

    return Response.json({ success: true, date: new Date().toISOString(), results, resume });
  } catch (error) {
    console.error('[NETTOYAGE_MATINAL] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});