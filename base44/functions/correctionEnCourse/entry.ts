import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * CORRECTION INVOLONTAIRE — Livreurs "en_course" sans course active
 * 
 * Problème : Certains livreurs ont statut = "en_course" mais aucune course active
 * dans les statuts ["livreur_en_route", "colis_recupere", "en_livraison"].
 * 
 * Solution : Remettre statut = "disponible" pour ces livreurs.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin only
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[CORRECTION EN COURSE] 🚀 Démarrage correction livreurs en_course sans course active');

    // 1. Récupérer TOUS les livreurs avec statut = "en_course"
    const livreursEnCourse = await base44.asServiceRole.entities.Livreur.filter({
      statut: 'en_course',
    });

    console.log(`[CORRECTION] 📊 ${livreursEnCourse.length} livreurs avec statut "en_course" en BDD`);

    // 2. Récupérer les courses VRAIMENT actives (statuts de livraison en cours)
    const STATUTS_LIVREUR_OCCUPE = ['livreur_en_route', 'colis_recupere', 'en_livraison'];
    const coursesActivesFilter = {}; // Toutes les courses
    const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter(coursesActivesFilter);
    
    const coursesVraimentActives = coursesActives.filter(c => 
      STATUTS_LIVREUR_OCCUPE.includes(c.statut) && c.livreur_id
    );

    console.log(`[CORRECTION] 📊 ${coursesVraimentActives.length} courses vraiment actives`);

    // 3. IDs des livreurs ayant une course vraiment active
    const livreurIdsAvecCourseActive = new Set(
      coursesVraimentActives.map(c => c.livreur_id)
    );

    console.log(`[CORRECTION] 📊 ${livreurIdsAvecCourseActive.size} livreurs avec course active confirmée`);

    // 4. Identifier les livreurs "en_course" SANS course active (incohérents)
    const livreursIncoherents = livreursEnCourse.filter(l => 
      !livreurIdsAvecCourseActive.has(l.id)
    );

    console.log(`[CORRECTION] ⚠️ ${livreursIncoherents.length} livreurs incohérents (en_course sans course active):`);
    livreursIncoherents.forEach(l => {
      console.log(`  - ${l.nom} (${l.id.slice(-8)}) — last_seen: ${l.last_seen_at || 'N/A'}`);
    });

    // 5. Corriger : remettre statut = "disponible" pour les livreurs incohérents
    let corriges = 0;
    for (const livreur of livreursIncoherents) {
      try {
        await base44.asServiceRole.entities.Livreur.update(livreur.id, {
          statut: 'disponible',
        });
        console.log(`[CORRECTION] ✅ ${livreur.nom} corrigé : en_course → disponible`);
        corriges++;
      } catch (err) {
        console.error(`[CORRECTION] ❌ Erreur correction ${livreur.nom}:`, err.message);
      }
    }

    // 6. Résumé
    const resultat = {
      total_livreurs_en_course: livreursEnCourse.length,
      avec_course_active: livreurIdsAvecCourseActive.size,
      incoherents: livreursIncoherents.length,
      corriges: corriges,
      details: livreursIncoherents.map(l => ({
        id: l.id,
        nom: `${l.prenom} ${l.nom}`,
        telephone: l.telephone,
      })),
    };

    console.log('[CORRECTION] 📊 Résumé:', resultat);

    return Response.json({
      success: true,
      message: `${corriges} livreur(s) corrigé(s) — statut "en_course" → "disponible"`,
      ...resultat,
    });

  } catch (error) {
    console.error('[CORRECTION] ❌ Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});