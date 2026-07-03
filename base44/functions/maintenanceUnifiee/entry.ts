import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Module de maintenance unifié — consolide les 6 fonctions de correction/nettoyage
 * Recommendation architecturale #1 (priorité élevée)
 *
 * Types: correction_en_course | nettoyer_courses_fantomes | correction_courses_bloquees |
 *        nettoyer_course_annulee | correction_fallbacks | all
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const type = body?.type || 'all';
    const sr = base44.asServiceRole;
    const now = new Date();
    const results = [];

    // ── 1. Correction livreurs en_course sans course active ──
    const correctionEnCourse = async () => {
      const livreursEnCourse = await sr.entities.Livreur.filter({ statut: 'en_course' }, '-updated_date', 200);
      if (livreursEnCourse.length === 0) return { module: 'correction_en_course', success: true, corrige: 0, detail: 'Aucun livreur en_course' };

      const activeStatuts = ['nouvelle', 'recherche_livreur', 'livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison'];
      let corrige = 0;
      for (const l of livreursEnCourse) {
        const courses = await sr.entities.CourseExterne.filter({ livreur_id: l.id, statut: { $in: activeStatuts } }, '-created_date', 5);
        if (courses.length === 0) {
          await sr.entities.Livreur.update(l.id, { statut: 'disponible' });
          corrige++;
        }
      }
      return { module: 'correction_en_course', success: true, verifie: livreursEnCourse.length, corrige, detail: `${corrige} livreur(s) remis à disponible` };
    };

    // ── 2. Nettoyer courses fantômes (créées il y a >2h, jamais assignées) ──
    const nettoyerFantomes = async () => {
      const cutoff = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
      const candidates = await sr.entities.CourseExterne.filter(
        { statut: 'nouvelle', livreur_id: { $exists: false }, created_date: { $lt: cutoff } },
        '-created_date', 100
      );
      let annule = 0;
      for (const c of candidates) {
        await sr.entities.CourseExterne.update(c.id, { statut: 'annulee', dispatch_status: 'cycle_epuise', notes: 'Annulation auto: course fantôme (maintenanceUnifiee)' });
        annule++;
      }
      return { module: 'nettoyer_courses_fantomes', success: true, annule, detail: `${annule} course(s) fantôme(s) annulée(s)` };
    };

    // ── 3. Correction courses bloquées (en recherche_livreur depuis >30min) ──
    const correctionBloquees = async () => {
      const cutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
      const bloques = await sr.entities.CourseExterne.filter(
        { statut: 'recherche_livreur', dispatch_status: 'propose', timeout_expires_at: { $lt: cutoff } },
        '-created_date', 100
      );
      let corriges = 0;
      for (const c of bloques) {
        await sr.entities.CourseExterne.update(c.id, { dispatch_status: 'redispatch', dispatch_wave: (c.dispatch_wave || 0) + 1 });
        corriges++;
      }
      return { module: 'correction_courses_bloquees', success: true, corriges, detail: `${corriges} course(s) remise(s) en redispatch` };
    };

    // ── 4. Nettoyer courses annulées (libérer livreur si toujours assigné) ──
    const nettoyerAnnulee = async () => {
      const annulees = await sr.entities.CourseExterne.filter({ statut: 'annulee', livreur_id: { $exists: true } }, '-updated_date', 100);
      let libere = 0;
      for (const c of annulees) {
        if (c.livreur_id) {
          const livreur = await sr.entities.Livreur.get(c.livreur_id).catch(() => null);
          if (livreur && livreur.statut === 'en_course') {
            await sr.entities.Livreur.update(c.livreur_id, { statut: 'disponible' });
            libere++;
          }
        }
      }
      return { module: 'nettoyer_course_annulee', success: true, libere, detail: `${libere} livreur(s) libéré(s)` };
    };

    // ── 5. Correction fallbacks (livreurs hors_ligne avec session active récente) ──
    const correctionFallbacks = async () => {
      const cutoff = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const livreurs = await sr.entities.Livreur.filter({ statut: 'hors_ligne', type_livreur: 'externe' }, '-updated_date', 200);
      let corriges = 0;
      for (const l of livreurs) {
        if (l.derniere_activite && l.derniere_activite > cutoff) {
          await sr.entities.Livreur.update(l.id, { statut: 'disponible' });
          corriges++;
        }
      }
      return { module: 'correction_fallbacks', success: true, corriges, detail: `${corriges} livreur(s) réactivé(s)` };
    };

    const MODULES = {
      correction_en_course: correctionEnCourse,
      nettoyer_courses_fantomes: nettoyerFantomes,
      correction_courses_bloquees: correctionBloquees,
      nettoyer_course_annulee: nettoyerAnnulee,
      correction_fallbacks: correctionFallbacks,
    };

    const toRun = type === 'all' ? Object.keys(MODULES) : [type];
    const invalid = toRun.filter(t => !MODULES[t]);
    if (invalid.length > 0) {
      return Response.json({ error: `Type(s) invalide(s): ${invalid.join(', ')}` }, { status: 400 });
    }

    for (const t of toRun) {
      try {
        const res = await MODULES[t]();
        results.push(res);
      } catch (err) {
        results.push({ module: t, success: false, error: err.message?.slice(0, 200) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return Response.json({
      success: true,
      resume: `${successCount}/${results.length} module(s) exécuté(s) avec succès`,
      type_demande: type,
      modules_executes: results,
      date_execution: now.toISOString(),
      lance_par: user.email,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});