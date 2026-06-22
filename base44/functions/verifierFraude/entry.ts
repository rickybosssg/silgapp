import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const R = 6371; // Rayon terrestre en km

function haversine(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dureeMinutes(debutIso, finIso) {
  if (!debutIso || !finIso) return null;
  return (new Date(finIso) - new Date(debutIso)) / 60000;
}

async function logAlerte(base44, alerte) {
  const exists = await base44.asServiceRole.entities.AlerteFraude.filter({
    type_fraude: alerte.type_fraude,
    course_id: alerte.course_id || '',
    livreur_id: alerte.livreur_id || '',
    statut: { $in: ['nouveau', 'en_cours'] }
  });
  if (exists.length > 0) return; // Déjà détecté
  await base44.asServiceRole.entities.AlerteFraude.create(alerte);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { mode = 'complet', country_code, livreur_id } = payload;

    const results = { analyses: [], alertes_creees: 0 };

    // Récupérer les courses récentes (dernières 24h pour le mode rapide, 7j pour complet)
    const joursRetour = mode === 'rapide' ? 1 : 7;
    const dateLimite = new Date(Date.now() - joursRetour * 24 * 3600 * 1000).toISOString();

    const courseQuery = {
      statut: "livree",
      heure_livraison: { $gte: dateLimite }
    };
    if (country_code) courseQuery.country_code = country_code;
    if (livreur_id) courseQuery.livreur_id = livreur_id;

    const courses = await base44.asServiceRole.entities.CourseExterne.filter(courseQuery, "-heure_livraison", 1000);
    results.analyses.push({ etape: 'courses_chargees', nb: courses.length });

    if (courses.length === 0) {
      return Response.json({ success: true, message: 'Aucune course à analyser', results });
    }

    // ─── 1. DÉTECTION VITESSE IMPOSSIBLE ───
    // Courses terminées trop vite par rapport à la distance
    let vitessesImpossibles = 0;
    for (const c of courses) {
      const dureeMin = dureeMinutes(c.heure_acceptation || c.created_date, c.heure_livraison);
      if (!dureeMin || dureeMin <= 0) continue;

      const distKm = c.distance_reelle_km || 0;
      // Si distance > 0 et durée très courte (< 2 min pour > 3 km = vitesse > 90 km/h en ville)
      const vitesseKmh = distKm > 0 ? (distKm / dureeMin) * 60 : 0;

      // Alerte si vitesse > 80 km/h en ville (moto) ou > 120 km/h
      if (vitesseKmh > 80 && distKm > 2) {
        await logAlerte(base44, {
          country_code: c.country_code,
          type_fraude: "vitesse_impossible",
          niveau: vitesseKmh > 120 ? "critique" : "eleve",
          score_risque: Math.min(100, Math.round(vitesseKmh)),
          livreur_id: c.livreur_id,
          livreur_nom: c.livreur_nom,
          course_id: c.id,
          details: JSON.stringify({ vitesse_kmh: Math.round(vitesseKmh), distance_km: Math.round(distKm * 10) / 10, duree_min: Math.round(dureeMin), heure_livraison: c.heure_livraison }),
          description: `Vitesse impossible: ${Math.round(vitesseKmh)} km/h sur ${Math.round(distKm * 10) / 10} km en ${Math.round(dureeMin)} min`,
          date_detection: new Date().toISOString(),
        });
        vitessesImpossibles++;
      }
    }
    results.analyses.push({ etape: 'vitesse_impossible', alertes: vitessesImpossibles });

    // ─── 2. DÉTECTION COURSES TROP RAPIDES (enchaînement) ───
    // Même livreur qui finit 2 courses à < 3 min d'intervalle (physiquement impossible si les courses sont éloignées)
    const coursesParLivreur = {};
    courses.forEach(c => {
      if (!c.livreur_id) return;
      if (!coursesParLivreur[c.livreur_id]) coursesParLivreur[c.livreur_id] = [];
      coursesParLivreur[c.livreur_id].push(c);
    });

    let coursesTropRapides = 0;
    for (const [lid, cs] of Object.entries(coursesParLivreur)) {
      const triees = cs.sort((a, b) => new Date(a.heure_livraison) - new Date(b.heure_livraison));
      for (let i = 1; i < triees.length; i++) {
        const prev = triees[i - 1];
        const curr = triees[i];
        const deltaMin = dureeMinutes(prev.heure_livraison, curr.heure_livraison);
        if (deltaMin === null || deltaMin > 120) continue;

        // Si les courses sont dans des quartiers différents et espacées de < 5 min → suspect
        const quartier1 = prev.quartier_arrivee || prev.adresse_arrivee || '';
        const quartier2 = curr.quartier_depart || curr.adresse_depart || '';
        const quartiersDifferents = quartier1 && quartier2 && quartier1 !== quartier2;

        if (quartiersDifferents && deltaMin < 5) {
          await logAlerte(base44, {
            country_code: curr.country_code,
            type_fraude: "course_trop_rapide",
            niveau: deltaMin < 2 ? "critique" : "eleve",
            score_risque: deltaMin < 2 ? 90 : 70,
            livreur_id: lid,
            livreur_nom: curr.livreur_nom,
            course_id: curr.id,
            details: JSON.stringify({
              course_precedente: prev.id,
              intervalle_min: Math.round(deltaMin),
              quartier_precedent: quartier1,
              quartier_courant: quartier2,
            }),
            description: `Enchaînement suspect: 2 courses en ${Math.round(deltaMin)} min (${quartier1} → ${quartier2})`,
            date_detection: new Date().toISOString(),
          });
          coursesTropRapides++;
        }
      }
    }
    results.analyses.push({ etape: 'courses_trop_rapides', alertes: coursesTropRapides });

    // ─── 3. DÉTECTION PRIX ANORMAL ───
    // Prix/km trop élevé (> 1000 FCFA/km) ou trop bas (< 30 FCFA/km)
    let prixAnormaux = 0;
    for (const c of courses) {
      const dist = c.distance_reelle_km || 0;
      const prix = c.prix_final || 0;
      if (dist <= 0.1 || prix <= 0) continue;
      const prixParKm = prix / dist;

      if (prixParKm > 2000) {
        await logAlerte(base44, {
          country_code: c.country_code,
          type_fraude: "prix_anormal",
          niveau: prixParKm > 5000 ? "critique" : "eleve",
          score_risque: Math.min(100, Math.round(prixParKm / 50)),
          livreur_id: c.livreur_id,
          livreur_nom: c.livreur_nom,
          course_id: c.id,
          details: JSON.stringify({ prix_final: prix, distance_km: Math.round(dist * 100) / 100, prix_par_km: Math.round(prixParKm) }),
          description: `Prix anormal: ${prix} FCFA pour ${Math.round(dist * 100) / 100} km (${Math.round(prixParKm)} FCFA/km)`,
          date_detection: new Date().toISOString(),
        });
        prixAnormaux++;
      }
    }
    results.analyses.push({ etape: 'prix_anormal', alertes: prixAnormaux });

    // ─── 4. DÉTECTION COLLUSION ───
    // Même client + même livreur = plusieurs courses, surtout si prix anormalement bas (complicité)
    const pairesClientLivreur = {};
    courses.forEach(c => {
      const clientId = c.expediteur_client_id || c.destinataire_client_id || c.client_nom || 'inconnu';
      const key = `${c.livreur_id}::${clientId}`;
      if (!pairesClientLivreur[key]) pairesClientLivreur[key] = [];
      pairesClientLivreur[key].push(c);
    });

    let collusions = 0;
    for (const [key, cs] of Object.entries(pairesClientLivreur)) {
      if (cs.length < 5) continue; // Seuil: 5 courses même paire sur la période
      const [lid, clientId] = key.split('::');
      const prixMoyen = cs.reduce((s, c) => s + (c.prix_final || 0), 0) / cs.length;
      const distMoyenne = cs.reduce((s, c) => s + (c.distance_reelle_km || 0), 0) / cs.length;
      const prixParKmMoyen = distMoyenne > 0 ? prixMoyen / distMoyenne : 0;

      // Suspect si beaucoup de courses ET prix/km anormalement bas (< 50 FCFA/km)
      if (cs.length >= 10 || (cs.length >= 5 && prixParKmMoyen < 50)) {
        await logAlerte(base44, {
          country_code: cs[0].country_code,
          type_fraude: "collusion",
          niveau: cs.length >= 15 ? "critique" : "eleve",
          score_risque: Math.min(100, cs.length * 8),
          livreur_id: lid,
          livreur_nom: cs[0].livreur_nom,
          client_id: clientId,
          client_nom: cs[0].client_nom || cs[0].expediteur_nom || 'Client',
          details: JSON.stringify({
            nb_courses: cs.length,
            prix_moyen: Math.round(prixMoyen),
            prix_par_km_moyen: Math.round(prixParKmMoyen),
            distance_moyenne: Math.round(distMoyenne * 100) / 100,
          }),
          description: `Collusion possible: ${cs.length} courses entre le livreur et le même client (${Math.round(prixParKmMoyen)} FCFA/km)`,
          date_detection: new Date().toISOString(),
        });
        collusions++;
      }
    }
    results.analyses.push({ etape: 'collusion', alertes: collusions });

    // ─── 5. DÉTECTION POSITIONS INCOHÉRENTES ───
    // Livreur qui "téléporte" entre deux positions GPS sur des courses consécutives
    let positionsIncoherentes = 0;
    for (const [lid, cs] of Object.entries(coursesParLivreur)) {
      const triees = cs.sort((a, b) => new Date(a.heure_livraison) - new Date(b.heure_livraison));
      for (let i = 1; i < triees.length; i++) {
        const prev = triees[i - 1];
        const curr = triees[i];
        const deltaMin = dureeMinutes(prev.heure_livraison, curr.heure_livraison);
        if (!deltaMin || deltaMin > 180) continue;

        const distLivraisons = haversine(
          prev.latitude_livraison || prev.latitude_arrivee_livraison,
          prev.longitude_livraison || prev.longitude_arrivee_livraison,
          curr.gps_depart_lat || curr.latitude_recuperation,
          curr.gps_depart_lng || curr.longitude_recuperation
        );

        if (distLivraisons === null || deltaMin <= 0) continue;

        const vitesseDeplacement = (distLivraisons / deltaMin) * 60;
        // Délai entre fin course 1 et début course 2 — en supposant que le livreur devait se déplacer
        // Si la vitesse de déplacement entre les deux points est > 100 km/h → suspect
        if (vitesseDeplacement > 100 && distLivraisons > 5) {
          await logAlerte(base44, {
            country_code: curr.country_code,
            type_fraude: "positions_incoherentes",
            niveau: vitesseDeplacement > 200 ? "critique" : "eleve",
            score_risque: Math.min(100, Math.round(vitesseDeplacement)),
            livreur_id: lid,
            livreur_nom: curr.livreur_nom,
            course_id: curr.id,
            details: JSON.stringify({
              course_precedente: prev.id,
              vitesse_deplacement_kmh: Math.round(vitesseDeplacement),
              distance_km: Math.round(distLivraisons * 10) / 10,
              intervalle_min: Math.round(deltaMin),
            }),
            description: `Déplacement impossible: ${Math.round(distLivraisons * 10) / 10} km en ${Math.round(deltaMin)} min (${Math.round(vitesseDeplacement)} km/h)`,
            date_detection: new Date().toISOString(),
          });
          positionsIncoherentes++;
        }
      }
    }
    results.analyses.push({ etape: 'positions_incoherentes', alertes: positionsIncoherentes });

    // ─── 6. DÉTECTION ANNULATIONS ABUSIVES ───
    if (mode === 'complet') {
      const annulations = await base44.asServiceRole.entities.AnnulationLivreur.filter(
        { date_annulation: { $gte: dateLimite } },
        "-date_annulation", 500
      );

      const annulationsParLivreur = {};
      annulations.forEach(a => {
        if (!annulationsParLivreur[a.livreur_id]) annulationsParLivreur[a.livreur_id] = [];
        annulationsParLivreur[a.livreur_id].push(a);
      });

      let annulationsAbusives = 0;
      for (const [lid, annuls] of Object.entries(annulationsParLivreur)) {
        if (annuls.length >= 5) {
          const motifs = annuls.map(a => a.motif);
          const motifPrincipal = motifs.sort((a,b) => motifs.filter(v => v===a).length - motifs.filter(v => v===b).length).pop();

          await logAlerte(base44, {
            country_code: annuls[0].country_code,
            type_fraude: "annulations_abusives",
            niveau: annuls.length >= 10 ? "critique" : "eleve",
            score_risque: Math.min(100, annuls.length * 10),
            livreur_id: lid,
            livreur_nom: annuls[0].livreur_nom,
            details: JSON.stringify({
              nb_annulations: annuls.length,
              motif_principal: motifPrincipal,
              periode_jours: joursRetour,
            }),
            description: `${annuls.length} annulations en ${joursRetour}j (motif principal: ${motifPrincipal})`,
            date_detection: new Date().toISOString(),
          });
          annulationsAbusives++;
        }
      }
      results.analyses.push({ etape: 'annulations_abusives', alertes: annulationsAbusives });
    }

    const total = vitessesImpossibles + coursesTropRapides + prixAnormaux + collusions + positionsIncoherentes;
    results.alertes_creees = total;
    results.resume = `${total} alerte(s) créée(s) sur ${courses.length} courses analysées`;

    return Response.json({ success: true, results });
  } catch (error) {
    console.error('[verifierFraude] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
