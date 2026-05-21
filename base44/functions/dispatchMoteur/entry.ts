import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Calcul distance Haversine en km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Trouver les coordonnées d'un quartier dans la table
function trouverQuartier(nom, quartiers) {
  if (!nom) return null;
  const nomLower = nom.toLowerCase().trim();
  for (const q of quartiers) {
    if (q.nom_quartier.toLowerCase() === nomLower) return q;
    if (q.variantes_nom) {
      const variantes = q.variantes_nom.split(",").map(v => v.trim().toLowerCase());
      if (variantes.some(v => nomLower.includes(v) || v.includes(nomLower))) return q;
    }
  }
  return null;
}

// Classer les livreurs par pertinence pour une course
function classerLivreurs(livreurs, quartierDepart, quartierArriveeNom, quartiers) {
  const qDepart = trouverQuartier(quartierDepart, quartiers);
  const qArrivee = trouverQuartier(quartierArriveeNom, quartiers);

  const candidats = [];

  for (const l of livreurs) {
    if (!l.actif || l.validation !== "valide") continue;
    if (l.statut === "hors_ligne") continue;
    if (!l.latitude || !l.longitude) continue;

    // Vérifier fraîcheur GPS (moins de 10 minutes)
    const dernierePos = l.derniere_position_date ? new Date(l.derniere_position_date) : null;
    const gpsFrais = dernierePos && (Date.now() - dernierePos.getTime()) < 10 * 60 * 1000;
    if (!gpsFrais) continue;

    let score = 0;
    let motif = [];
    let distDepart = null;

    if (qDepart) {
      distDepart = haversine(l.latitude, l.longitude, qDepart.latitude_centre, qDepart.longitude_centre);
      score -= distDepart; // plus proche = meilleur score
      motif.push(`${distDepart.toFixed(1)} km du quartier`);
    }

    if (l.statut === "disponible") {
      score += 5;
      motif.push("disponible");
    } else if (l.statut === "en_course") {
      // Vérifier si la nouvelle course est dans sa direction
      if (qDepart && qArrivee) {
        const distLivreurArrivee = haversine(l.latitude, l.longitude, qDepart.latitude_centre, qDepart.longitude_centre);
        if (distLivreurArrivee < 3) {
          score += 2;
          motif.push("course à proximité");
        } else {
          score -= 3;
          motif.push("en course");
        }
      } else {
        score -= 3;
        motif.push("en course");
      }
    }

    candidats.push({ livreur: l, score, motif: motif.join(", "), distDepart });
  }

  return candidats.sort((a, b) => b.score - a.score);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "tick";

    // Récupérer la config dispatch
    const configs = await base44.asServiceRole.entities.DispatchConfig.list();
    let config = configs[0];
    if (!config) {
      return Response.json({ error: "Aucune config dispatch trouvée" }, { status: 400 });
    }

    // MODE MANUEL : ne rien faire automatiquement
    if (config.mode === "manuel") {
      return Response.json({ mode: "manuel", message: "Mode manuel actif, aucun dispatch automatique" });
    }

    // Récupérer quartiers, livreurs, courses
    const [quartiers, livreurs, courses] = await Promise.all([
      base44.asServiceRole.entities.QuartierOuaga.list(),
      base44.asServiceRole.entities.Livreur.list(),
      base44.asServiceRole.entities.Course.filter({ statut: "nouvelle" }, "created_date", 50),
    ]);

    if (courses.length === 0) {
      return Response.json({ message: "Aucune course en attente de dispatch" });
    }

    // Si une course est déjà en dispatch, vérifier le timeout
    if (config.course_en_dispatch_id && config.livreur_sollicite_id && config.heure_sollicitation) {
      const elapsed = (Date.now() - new Date(config.heure_sollicitation).getTime()) / 1000;
      const courseEnDispatch = await base44.asServiceRole.entities.Course.filter({ id: config.course_en_dispatch_id });
      const course = courseEnDispatch[0];

      if (course && course.statut === "nouvelle") {
        if (elapsed < (config.timeout_secondes || 60)) {
          return Response.json({
            message: "Dispatch en cours",
            course_id: config.course_en_dispatch_id,
            livreur_id: config.livreur_sollicite_id,
            temps_restant: Math.round((config.timeout_secondes || 60) - elapsed)
          });
        }
        // Timeout : passer au livreur suivant
        // Récupérer les candidats classés et trouver le suivant
        const candidats = classerLivreurs(livreurs, course.adresse_depart, course.adresse_arrivee, quartiers);
        const idxActuel = candidats.findIndex(c => c.livreur.id === config.livreur_sollicite_id);
        const suivant = candidats[idxActuel + 1];

        if (suivant) {
          await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
            livreur_sollicite_id: suivant.livreur.id,
            livreur_sollicite_nom: `${suivant.livreur.prenom || ""} ${suivant.livreur.nom}`.trim(),
            heure_sollicitation: new Date().toISOString(),
          });
          await base44.asServiceRole.entities.Course.update(course.id, {
            statut: "en_attente_livreur",
            livreur_id: suivant.livreur.id,
            livreur_nom: `${suivant.livreur.prenom || ""} ${suivant.livreur.nom}`.trim(),
          });
          return Response.json({ message: "Timeout, passage au livreur suivant", livreur: suivant.livreur.nom });
        } else {
          // Plus de candidats, remettre en nouvelle
          await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
            course_en_dispatch_id: "",
            livreur_sollicite_id: "",
            livreur_sollicite_nom: "",
            heure_sollicitation: null,
          });
          return Response.json({ message: "Aucun livreur disponible pour cette course" });
        }
      } else {
        // Course acceptée ou annulée, on passe à la suivante
        await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
          course_en_dispatch_id: "",
          livreur_sollicite_id: "",
          livreur_sollicite_nom: "",
          heure_sollicitation: null,
        });
      }
    }

    // Prendre la course la plus ancienne non assignée
    const prochaineCourse = courses[0];
    const candidats = classerLivreurs(livreurs, prochaineCourse.adresse_depart, prochaineCourse.adresse_arrivee, quartiers);

    if (candidats.length === 0) {
      return Response.json({ message: "Aucun livreur disponible avec GPS actif" });
    }

    const meilleur = candidats[0];
    const isProximite = meilleur.livreur.statut === "en_course" && meilleur.motif.includes("proximité");

    await base44.asServiceRole.entities.Course.update(prochaineCourse.id, {
      statut: "en_attente_livreur",
      livreur_id: meilleur.livreur.id,
      livreur_nom: `${meilleur.livreur.prenom || ""} ${meilleur.livreur.nom}`.trim(),
      notes: isProximite
        ? (prochaineCourse.notes ? prochaineCourse.notes + " | Course à proximité de votre trajet" : "Course à proximité de votre trajet")
        : prochaineCourse.notes,
    });

    await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
      course_en_dispatch_id: prochaineCourse.id,
      livreur_sollicite_id: meilleur.livreur.id,
      livreur_sollicite_nom: `${meilleur.livreur.prenom || ""} ${meilleur.livreur.nom}`.trim(),
      heure_sollicitation: new Date().toISOString(),
    });

    return Response.json({
      message: "Course dispatchée",
      course_id: prochaineCourse.id,
      livreur: meilleur.livreur.nom,
      motif: meilleur.motif,
      candidats: candidats.slice(0, 5).map(c => ({
        nom: `${c.livreur.prenom || ""} ${c.livreur.nom}`.trim(),
        motif: c.motif,
        distance: c.distDepart?.toFixed(1),
        statut: c.livreur.statut,
      }))
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});