import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Module de synchronisation unifié — consolide les fonctions de sync
 * Recommendation architecturale #2 (priorité moyenne)
 *
 * Types: livreur_statut | client_gps | livreur_gps | commande_from_course | all
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const type = body?.type || 'all';
    const params = body?.params || {};
    const sr = base44.asServiceRole;
    const now = new Date();
    const results = [];

    // ── 1. Sync statut livreur sur course (livreur en_course ↔ course active) ──
    const syncStatutLivreur = async () => {
      const enCourse = await sr.entities.Livreur.filter({ statut: 'en_course', type_livreur: 'externe' }, '-updated_date', 200);
      const activeStatuts = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison'];
      let synchronises = 0;
      for (const l of enCourse) {
        const courses = await sr.entities.CourseExterne.filter({ livreur_id: l.id, statut: { $in: activeStatuts } }, '-created_date', 3);
        if (courses.length === 0) {
          await sr.entities.Livreur.update(l.id, { statut: 'disponible' });
          synchronises++;
        }
      }
      // Inverse: livreurs disponibles mais avec course active
      const dispo = await sr.entities.Livreur.filter({ statut: 'disponible', type_livreur: 'externe' }, '-updated_date', 200);
      for (const l of dispo) {
        const courses = await sr.entities.CourseExterne.filter({ livreur_id: l.id, statut: { $in: activeStatuts } }, '-created_date', 3);
        if (courses.length > 0) {
          await sr.entities.Livreur.update(l.id, { statut: 'en_course' });
          synchronises++;
        }
      }
      return { module: 'statut_livreur_on_course', success: true, synchronises, detail: `${synchronises} livreur(s) synchronisé(s)` };
    };

    // ── 2. Sync GPS client (copier GPS profil → courses destinataire) ──
    const syncClientGPS = async () => {
      const clientsAvecGPS = await sr.entities.ClientExterne.filter(
        { latitude: { $exists: true }, longitude: { $exists: true } },
        '-updated_date', 20
      );
      let maj = 0;
      const activeStatuts = ['nouvelle', 'recherche_livreur', 'livreur_en_route', 'colis_recupere', 'en_livraison'];
      for (const c of clientsAvecGPS) {
        if (!c.latitude || !c.longitude) continue;
        const courses = await sr.entities.CourseExterne.filter(
          { destinataire_client_id: c.id, statut: { $in: activeStatuts } },
          '-created_date', 10
        );
        for (const course of courses) {
          if (!course.gps_arrivee_lat || Math.abs(course.gps_arrivee_lat - c.latitude) > 0.001) {
            await sr.entities.CourseExterne.update(course.id, { gps_arrivee_lat: c.latitude, gps_arrivee_lng: c.longitude });
            maj++;
          }
        }
      }
      return { module: 'client_gps', success: true, maj, detail: `${maj} course(s) mise(s) à jour` };
    };

    // ── 3. Sync GPS livreur (copier GPS profil → course active) ──
    const syncLivreurGPS = async () => {
      const livreursAvecGPS = await sr.entities.Livreur.filter(
        { latitude: { $exists: true }, longitude: { $exists: true }, statut: 'en_course', type_livreur: 'externe' },
        '-updated_date', 20
      );
      let maj = 0;
      const activeStatuts = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'en_livraison'];
      for (const l of livreursAvecGPS) {
        if (!l.latitude || !l.longitude) continue;
        const courses = await sr.entities.CourseExterne.filter(
          { livreur_id: l.id, statut: { $in: activeStatuts } },
          '-created_date', 5
        );
        for (const course of courses) {
          if (!course.latitude_prise_en_charge || Math.abs(course.latitude_prise_en_charge - l.latitude) > 0.001) {
            await sr.entities.CourseExterne.update(course.id, { latitude_prise_en_charge: l.latitude, longitude_prise_en_charge: l.longitude });
            maj++;
          }
        }
      }
      return { module: 'livreur_gps', success: true, maj, detail: `${maj} course(s) mise(s) à jour` };
    };

    // ── 4. Sync commande from course (mettre à jour statut commande partenaire) ──
    const syncCommandeFromCourse = async () => {
      const livrees = await sr.entities.CourseExterne.filter(
        { statut: 'livree', commande_boutique_id: { $exists: true } },
        '-updated_date', 20
      );
      let maj = 0;
      for (const c of livrees) {
        if (c.commande_boutique_id) {
          const cmd = await sr.entities.CommandeBoutique.get(c.commande_boutique_id).catch(() => null);
          if (cmd && cmd.statut !== 'livree') {
            await sr.entities.CommandeBoutique.update(c.commande_boutique_id, { statut: 'livree', course_id: c.id });
            maj++;
          }
        }
        if (c.commande_restaurant_id) {
          const cmd = await sr.entities.CommandeRestaurant.get(c.commande_restaurant_id).catch(() => null);
          if (cmd && cmd.statut !== 'livree') {
            await sr.entities.CommandeRestaurant.update(c.commande_restaurant_id, { statut: 'livree', course_id: c.id });
            maj++;
          }
        }
      }
      return { module: 'commande_from_course', success: true, maj, detail: `${maj} commande(s) synchronisée(s)` };
    };

    const MODULES = {
      statut_livreur_on_course: syncStatutLivreur,
      client_gps: syncClientGPS,
      livreur_gps: syncLivreurGPS,
      commande_from_course: syncCommandeFromCourse,
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
      // Délai entre modules pour éviter le rate limiting
      if (toRun.length > 1) await new Promise(r => setTimeout(r, 1500));
    }

    const successCount = results.filter(r => r.success).length;
    return Response.json({
      success: true,
      resume: `${successCount}/${results.length} module(s) de sync exécuté(s) avec succès`,
      type_demande: type,
      modules_executes: results,
      date_execution: now.toISOString(),
      lance_par: user.email,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});