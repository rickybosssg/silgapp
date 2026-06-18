export function normalizeCommissionPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

export function splitAmountByCommission(totalAmount, commissionPct) {
  const amount = Number(totalAmount);
  const pct = normalizeCommissionPct(commissionPct);
  if (!Number.isFinite(amount) || amount < 0 || pct === null) {
    return { commission_silga: null, montant_livreur: null, commission_pct: pct };
  }
  const commission_silga = Math.round(amount * (pct / 100));
  return {
    commission_silga,
    montant_livreur: amount - commission_silga,
    commission_pct: pct,
  };
}

export function resolveStoredOrDynamicSplit(course, totalAmount, commissionPct) {
  const storedCommission = Number(course?.commission_silga);
  const storedLivreur = Number(course?.montant_livreur);
  if (storedCommission > 0 && storedLivreur >= 0) {
    return {
      commission_silga: storedCommission,
      montant_livreur: storedLivreur,
      commission_pct: normalizeCommissionPct(commissionPct),
    };
  }
  return splitAmountByCommission(totalAmount, commissionPct);
}

export async function fetchCountryCommissionPct(base44, countryCode) {
  const code = String(countryCode || "").trim().toUpperCase();
  if (!code) throw new Error("country_code manquant pour calculer la commission");
  const countries = await base44.entities.Country.filter({ code, actif: true });
  const pct = normalizeCommissionPct(countries?.[0]?.commission_pct);
  if (pct === null) throw new Error(`Commission non configuree pour le pays ${code}`);
  return pct;
}
