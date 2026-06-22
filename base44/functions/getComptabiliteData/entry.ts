import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { country_code, date_debut, date_fin } = payload;

    const now = new Date();
    const debut = date_debut
      ? new Date(date_debut)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const fin = date_fin
      ? new Date(date_fin + 'T23:59:59.999Z')
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Durée de la période en jours
    const dureeJours = Math.max(1, Math.round((fin - debut) / (24 * 3600 * 1000)));
    const debutPrec = new Date(debut.getTime() - dureeJours * 24 * 3600 * 1000);
    const finPrec = new Date(debut.getTime() - 1);

    // Pays actifs
    const paysQuery = country_code ? { code: country_code, actif: true } : { actif: true };
    const pays = await base44.asServiceRole.entities.Country.filter(paysQuery);
    const paysMap = {};
    pays.forEach(p => { paysMap[p.code] = p; });

    // Période courante
    const coursesQuery = { statut: "livree", heure_livraison: { $gte: debut.toISOString(), $lte: fin.toISOString() } };
    if (country_code) coursesQuery.country_code = country_code;
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(coursesQuery, "heure_livraison", 5000);

    // Période précédente
    const prevQuery = { statut: "livree", heure_livraison: { $gte: debutPrec.toISOString(), $lte: finPrec.toISOString() } };
    if (country_code) prevQuery.country_code = country_code;
    const coursesPrev = await base44.asServiceRole.entities.CourseExterne.filter(prevQuery, "heure_livraison", 5000);

    // Agrégation période courante
    let caTotal = 0, commissionTotale = 0, gainLivreurs = 0;
    const parPays = {}, parJour = {}, parLivreur = {};

    courses.forEach(c => {
      const prix = c.prix_final || 0;
      const comm = c.commission_silga || 0;
      const gain = c.montant_livreur || 0;
      caTotal += prix; commissionTotale += comm; gainLivreurs += gain;

      const cp = c.country_code || 'inconnu';
      if (!parPays[cp]) parPays[cp] = { ca: 0, commission: 0, gain_livreurs: 0, nb_courses: 0 };
      parPays[cp].ca += prix; parPays[cp].commission += comm;
      parPays[cp].gain_livreurs += gain; parPays[cp].nb_courses += 1;

      const jour = c.heure_livraison?.slice(0, 10) || 'inconnu';
      if (!parJour[jour]) parJour[jour] = { ca: 0, commission: 0, nb_courses: 0 };
      parJour[jour].ca += prix; parJour[jour].commission += comm;
      parJour[jour].nb_courses += 1;

      if (c.livreur_id) {
        if (!parLivreur[c.livreur_id]) {
          parLivreur[c.livreur_id] = {
            livreur_nom: c.livreur_nom || '',
            livreur_telephone: c.livreur_telephone || '',
            ca: 0, commission: 0, gain: 0, nb_courses: 0
          };
        }
        parLivreur[c.livreur_id].ca += prix;
        parLivreur[c.livreur_id].commission += comm;
        parLivreur[c.livreur_id].gain += gain;
        parLivreur[c.livreur_id].nb_courses += 1;
      }
    });

    // Agrégation période précédente
    let caPrev = 0; coursesPrev.forEach(c => { caPrev += (c.prix_final || 0); });

    // Livreurs
    const livreursQuery = { type_livreur: "externe" };
    if (country_code) livreursQuery.country_code = country_code;
    const livreurs = await base44.asServiceRole.entities.Livreur.filter(livreursQuery);
    let encoursTotal = 0, nbBloques = 0, nbLivreursActifs = 0;
    livreurs.forEach(l => {
      encoursTotal += (l.encours || 0);
      if (l.bloque_encours) nbBloques++;
      if (l.actif && l.validation === 'valide') nbLivreursActifs++;
    });

    const dusNonPayes = courses
      .filter(c => c.statut_paiement_livreur !== 'paye' && c.montant_livreur > 0)
      .reduce((sum, c) => sum + (c.montant_livreur || 0), 0);

    // Évolution
    const joursTries = Object.keys(parJour).sort();
    const evolution = joursTries.map(j => ({
      date: j, ca: parJour[j].ca, commission: parJour[j].commission,
      nb_courses: parJour[j].nb_courses,
    }));

    // Top livreurs (enrichi avec encours)
    const topLivreurs = Object.entries(parLivreur)
      .map(([id, data]) => {
        const l = livreurs.find(lv => lv.id === id) || {};
        return {
          id, ...data,
          encours: l.encours || 0,
          bloque_encours: !!l.bloque_encours,
          statut_paiement: l.statut_paiement || 'non_paye',
          pays_code: l.country_code || '',
        };
      })
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 30);

    // Comparaison
    const pctCa = caPrev > 0 ? Math.round(((caTotal - caPrev) / caPrev) * 100) : null;
    const pctCourses = coursesPrev.length > 0
      ? Math.round(((courses.length - coursesPrev.length) / coursesPrev.length) * 100) : null;

    // Moyenne journalière
    const moyJour = dureeJours > 0 ? Math.round(caTotal / dureeJours) : 0;

    return Response.json({
      success: true,
      periode: { debut: debut.toISOString(), fin: fin.toISOString() },
      periode_precedente: { debut: debutPrec.toISOString(), fin: finPrec.toISOString() },
      kpis: {
        ca_total: caTotal, commission_totale: commissionTotale,
        gain_livreurs: gainLivreurs, encours_total: encoursTotal,
        dus_non_payes: dusNonPayes, nb_courses: courses.length,
        nb_livreurs_actifs: nbLivreursActifs, nb_bloques: nbBloques,
        ca_precedent: caPrev, courses_precedent: coursesPrev.length,
        pct_ca: pctCa, pct_courses: pctCourses,
        moyenne_jour: moyJour, duree_jours: dureeJours,
      },
      par_pays: parPays, evolution,
      top_livreurs: topLivreurs, pays_config: paysMap,
    });

  } catch (error) {
    console.error('[getComptabiliteData] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
