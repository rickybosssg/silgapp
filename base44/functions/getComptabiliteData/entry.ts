import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Module comptabilité — données financières consolidées
 * Retourne : KPIs, évolution journalière, répartition par pays, bilan livreurs
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const { country_code, date_debut, date_fin } = payload;

    // Période : par défaut ce mois
    const now = new Date();
    const debut = date_debut 
      ? new Date(date_debut) 
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const fin = date_fin 
      ? new Date(date_fin + 'T23:59:59.999Z') 
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1. Récupérer pays actifs et leurs commissions
    const paysQuery = country_code 
      ? { code: country_code, actif: true } 
      : { actif: true };
    const pays = await base44.asServiceRole.entities.Country.filter(paysQuery);
    const paysMap = {};
    pays.forEach(p => { paysMap[p.code] = p; });

    // 2. Récupérer toutes les courses livrées sur la période
    const coursesQuery = { 
      statut: "livree",
      heure_livraison: { $gte: debut.toISOString(), $lte: fin.toISOString() }
    };
    if (country_code) coursesQuery.country_code = country_code;

    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      coursesQuery, "heure_livraison", 5000
    );

    // 3. Agréger les KPIs globaux
    let caTotal = 0;
    let commissionTotale = 0;
    let gainLivreurs = 0;
    const parPays = {};
    const parJour = {};
    const parLivreur = {};

    courses.forEach(c => {
      const prix = c.prix_final || 0;
      const comm = c.commission_silga || 0;
      const gain = c.montant_livreur || 0;

      caTotal += prix;
      commissionTotale += comm;
      gainLivreurs += gain;

      // Par pays
      const cp = c.country_code || 'inconnu';
      if (!parPays[cp]) parPays[cp] = { ca: 0, commission: 0, gain_livreurs: 0, nb_courses: 0 };
      parPays[cp].ca += prix;
      parPays[cp].commission += comm;
      parPays[cp].gain_livreurs += gain;
      parPays[cp].nb_courses += 1;

      // Par jour
      const jour = c.heure_livraison?.slice(0, 10) || c.colis_livre_at?.slice(0, 10) || 'inconnu';
      if (!parJour[jour]) parJour[jour] = { ca: 0, commission: 0, nb_courses: 0 };
      parJour[jour].ca += prix;
      parJour[jour].commission += comm;
      parJour[jour].nb_courses += 1;

      // Par livreur
      if (c.livreur_id) {
        if (!parLivreur[c.livreur_id]) {
          parLivreur[c.livreur_id] = {
            livreur_nom: c.livreur_nom || '',
            livreur_telephone: c.livreur_telephone || '',
            ca: 0,
            commission: 0,
            gain: 0,
            nb_courses: 0
          };
        }
        parLivreur[c.livreur_id].ca += prix;
        parLivreur[c.livreur_id].commission += comm;
        parLivreur[c.livreur_id].gain += gain;
        parLivreur[c.livreur_id].nb_courses += 1;
      }
    });

    // 4. Encours total des livreurs
    const livreursQuery = { type_livreur: "externe" };
    if (country_code) livreursQuery.country_code = country_code;
    const livreurs = await base44.asServiceRole.entities.Livreur.filter(livreursQuery);
    let encoursTotal = 0;
    let nbBloques = 0;
    let nbLivreursActifs = 0;
    livreurs.forEach(l => {
      encoursTotal += (l.encours || 0);
      if (l.bloque_encours) nbBloques++;
      if (l.actif && l.validation === 'valide') nbLivreursActifs++;
    });

    // 5. Dus non payés (courses livrées mais livreur pas encore payé)
    const dusNonPayes = courses
      .filter(c => c.statut_paiement_livreur !== 'paye' && c.montant_livreur > 0)
      .reduce((sum, c) => sum + (c.montant_livreur || 0), 0);

    // 6. Séries temporelles (évolution par jour)
    const joursTries = Object.keys(parJour).sort();
    const evolution = joursTries.map(j => ({
      date: j,
      ca: parJour[j].ca,
      commission: parJour[j].commission,
      nb_courses: parJour[j].nb_courses,
    }));

    // 7. Top livreurs
    const topLivreurs = Object.entries(parLivreur)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 20);

    return Response.json({
      success: true,
      periode: { debut: debut.toISOString(), fin: fin.toISOString() },
      kpis: {
        ca_total: caTotal,
        commission_totale: commissionTotale,
        gain_livreurs: gainLivreurs,
        encours_total: encoursTotal,
        dus_non_payes: dusNonPayes,
        nb_courses: courses.length,
        nb_livreurs_actifs: nbLivreursActifs,
        nb_bloques: nbBloques,
      },
      par_pays: parPays,
      evolution,
      top_livreurs: topLivreurs,
      pays_config: paysMap,
    });

  } catch (error) {
    console.error('[getComptabiliteData] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});