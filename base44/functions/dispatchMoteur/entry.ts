import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Calcul distance Haversine en km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

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

function classerLivreurs(livreurs, quartierDepart, quartierArriveeNom, quartiers) {
  const qDepart = trouverQuartier(quartierDepart, quartiers);
  const qArrivee = trouverQuartier(quartierArriveeNom, quartiers);
  const candidats = [];

  for (const l of livreurs) {
    if (!l.actif || l.validation !== "valide") continue;
    if (l.statut === "hors_ligne") continue;
    if (!l.latitude || !l.longitude) continue;

    const dernierePos = l.derniere_position_date ? new Date(l.derniere_position_date) : null;
    const gpsFrais = dernierePos && (Date.now() - dernierePos.getTime()) < 10 * 60 * 1000;
    if (!gpsFrais) continue;

    let score = 0;
    let motif = [];
    let distDepart = null;

    if (qDepart) {
      distDepart = haversine(l.latitude, l.longitude, qDepart.latitude_centre, qDepart.longitude_centre);
      score -= distDepart;
      motif.push(`${distDepart.toFixed(1)} km du quartier`);
    }

    if (l.statut === "disponible") {
      score += 5;
      motif.push("disponible");
    } else if (l.statut === "en_course") {
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
    const body = await req.json().catch(() => ({}));
    const action = body.action || "tick";

    // Action : lancer le dispatch auto d'une course spécifique (déclenchée par l'admin)
    if (action === "lancer_auto" && body.course_id) {
      const [quartiers, livreurs, courseList] = await Promise.all([
        base44.asServiceRole.entities.QuartierOuaga.list(),
        base44.asServiceRole.entities.Livreur.list(),
        base44.asServiceRole.entities.Course.filter({ id: body.course_id }),
      ]);

      const course = courseList[0];
      if (!course) return Response.json({ error: "Course introuvable" }, { status: 404 });

      // Marquer la course en mode automatique
      await base44.asServiceRole.entities.Course.update(course.id, {
        dispatch_mode: "automatique",
        dispatch_status: "recherche_livreur",
      });

      const candidats = classerLivreurs(livreurs, course.adresse_depart, course.adresse_arrivee, quartiers);
      if (candidats.length === 0) {
        await base44.asServiceRole.entities.Course.update(course.id, {
          dispatch_status: "expire",
        });
        return Response.json({ message: "Aucun livreur disponible avec GPS actif" });
      }

      const meilleur = candidats[0];
      const nomLivreur = `${meilleur.livreur.prenom || ""} ${meilleur.livreur.nom}`.trim();

      await base44.asServiceRole.entities.Course.update(course.id, {
        statut: "en_attente_livreur",
        dispatch_status: "propose",
        livreur_id: meilleur.livreur.id,
        livreur_nom: nomLivreur,
      });

      // Mettre à jour la config dispatch globale pour le monitoring
      const configs = await base44.asServiceRole.entities.DispatchConfig.list();
      const config = configs[0];
      if (config) {
        await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
          course_en_dispatch_id: course.id,
          livreur_sollicite_id: meilleur.livreur.id,
          livreur_sollicite_nom: nomLivreur,
          heure_sollicitation: new Date().toISOString(),
        });
      }

      return Response.json({
        message: "Dispatch automatique lancé",
        course_id: course.id,
        livreur: nomLivreur,
        motif: meilleur.motif,
      });
    }

    // Action : tick — gérer les timeouts des courses en dispatch automatique
    if (action === "tick") {
      const configs = await base44.asServiceRole.entities.DispatchConfig.list();
      const config = configs[0];

      if (!config || !config.course_en_dispatch_id || !config.livreur_sollicite_id || !config.heure_sollicitation) {
        return Response.json({ message: "Aucun dispatch en cours" });
      }

      const elapsed = (Date.now() - new Date(config.heure_sollicitation).getTime()) / 1000;
      const courseList = await base44.asServiceRole.entities.Course.filter({ id: config.course_en_dispatch_id });
      const course = courseList[0];

      if (!course) {
        await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
          course_en_dispatch_id: "", livreur_sollicite_id: "", livreur_sollicite_nom: "", heure_sollicitation: null,
        });
        return Response.json({ message: "Course introuvable, config réinitialisée" });
      }

      // Course acceptée ou terminée → libérer le dispatch
      if (!["nouvelle", "en_attente_livreur"].includes(course.statut)) {
        await base44.asServiceRole.entities.Course.update(course.id, { dispatch_status: "accepte" });
        await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
          course_en_dispatch_id: "", livreur_sollicite_id: "", livreur_sollicite_nom: "", heure_sollicitation: null,
        });
        return Response.json({ message: "Course acceptée, dispatch libéré" });
      }

      // Pas encore écoulé → attendre
      if (elapsed < (config.timeout_secondes || 60)) {
        return Response.json({
          message: "Dispatch en cours",
          course_id: config.course_en_dispatch_id,
          livreur_id: config.livreur_sollicite_id,
          temps_restant: Math.round((config.timeout_secondes || 60) - elapsed),
        });
      }

      // Timeout → essayer le livreur suivant
      const [quartiers, livreurs] = await Promise.all([
        base44.asServiceRole.entities.QuartierOuaga.list(),
        base44.asServiceRole.entities.Livreur.list(),
      ]);

      const candidats = classerLivreurs(livreurs, course.adresse_depart, course.adresse_arrivee, quartiers);
      const idxActuel = candidats.findIndex(c => c.livreur.id === config.livreur_sollicite_id);
      const suivant = candidats[idxActuel + 1];

      if (suivant) {
        const nomSuivant = `${suivant.livreur.prenom || ""} ${suivant.livreur.nom}`.trim();
        await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
          livreur_sollicite_id: suivant.livreur.id,
          livreur_sollicite_nom: nomSuivant,
          heure_sollicitation: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.Course.update(course.id, {
          statut: "en_attente_livreur",
          dispatch_status: "propose",
          livreur_id: suivant.livreur.id,
          livreur_nom: nomSuivant,
        });
        return Response.json({ message: "Timeout, passage au livreur suivant", livreur: nomSuivant });
      } else {
        // Plus de candidats → expirée
        await base44.asServiceRole.entities.Course.update(course.id, {
          statut: "nouvelle",
          dispatch_status: "expire",
          livreur_id: "",
          livreur_nom: "",
        });
        await base44.asServiceRole.entities.DispatchConfig.update(config.id, {
          course_en_dispatch_id: "", livreur_sollicite_id: "", livreur_sollicite_nom: "", heure_sollicitation: null,
        });
        return Response.json({ message: "Aucun livreur disponible, course expirée" });
      }
    }

    return Response.json({ message: "Action inconnue" }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});