// ── Grille tarifaire SILGAPP (miroir du backend calculPrixCourseExterne) ──
// Utilisé pour le calcul du prix approximatif côté frontend (AdminCourseForm).

const TARIFS_PAYS = {
  BF: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  CI: { prix_par_km: 120, prix_minimum: 600, devise: "FCFA" },
  TG: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  BJ: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  SN: { prix_par_km: 150, prix_minimum: 750, devise: "FCFA" },
  ML: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  GN: { prix_par_km: 800, prix_minimum: 4000, devise: "GNF" },
  NE: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  GH: { prix_par_km: 2, prix_minimum: 10, devise: "GHS" },
};

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  if (Number.isNaN(Number(lat1)) || Number.isNaN(Number(lng1)) ||
      Number.isNaN(Number(lat2)) || Number.isNaN(Number(lng2))) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcule le prix approximatif d'une course à partir des coordonnées GPS.
 * Utilise la même formule que le backend (calculPrixCourseExterne).
 *
 * @returns {prix, distance, devise} ou null si GPS manquant
 */
export function calculerPrixApproximatif(lat1, lng1, lat2, lng2, countryCode) {
  const tarif = TARIFS_PAYS[countryCode] || TARIFS_PAYS["BF"];
  const distance = haversineKm(lat1, lng1, lat2, lng2);
  if (distance === null) return null;

  const PRIX_MINIMUM_GLOBAL = tarif.devise === "FCFA" ? 1000 : tarif.prix_minimum;
  const prixBrut = distance * tarif.prix_par_km;
  const prixFinal = Math.max(Math.round(prixBrut), tarif.prix_minimum, PRIX_MINIMUM_GLOBAL);

  return {
    prix: prixFinal,
    distance: Math.round(distance * 10) / 10,
    devise: tarif.devise,
  };
}