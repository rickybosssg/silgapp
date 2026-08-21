/**
 * Rétro-correction des courses livrées sans prix_final ni distance.
 * Applique le fallback : prix_estimate ou prix minimum 500F (5 km minimum).
 * À appeler manuellement depuis l'admin ou via une automatisation.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { recalculerSoldeLivreur } from '../../shared/recalculerSoldeLivreur.ts';

function normalizeCommissionPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

async function chargerCommissionPays(base44, countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!code) throw new Error('country_code manquant pour calculer la commission');
  const countries = await base44.asServiceRole.entities.Country.filter({ code, actif: true });
  const pct = normalizeCommissionPct(countries?.[0]?.commission_pct);
  if (pct === null) throw new Error(`Commission non configuree pour le pays ${code}`);
  return pct;
}

async function chargerTarifPays(base44, countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!code) throw new Error('country_code manquant pour calculer le tarif');
  const countries = await base44.asServiceRole.entities.Country.filter({ code, actif: true });
  const country = countries?.[0];
  const prixParKm = Number(country?.prix_par_km);
  const prixMinimum = Number(country?.prix_minimum);
  if (!Number.isFinite(prixParKm) || prixParKm <= 0 || !Number.isFinite(prixMinimum) || prixMinimum < 0) {
    throw new Error(`Tarification non configuree pour le pays ${code}`);
  }
  return { prixParKm, prixMinimum };
}

function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    // Récupérer toutes les courses livrées sans prix_final
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'livree' }, '-created_date', 200
    );

    const aCorreger = courses.filter(c => !c.prix_final || c.prix_final <= 0);
    let corrigees = 0;
    let ignorees = 0;
    const details = [];

    for (const course of aCorreger) {
      let distanceKm = null;
      let source = null;

      // Règle métier : distance = GPS récupération → GPS livraison UNIQUEMENT
      if (course.latitude_recuperation && course.longitude_recuperation &&
          course.latitude_livraison && course.longitude_livraison) {
        distanceKm = haversine(
          course.latitude_recuperation, course.longitude_recuperation,
          course.latitude_livraison, course.longitude_livraison
        );
        source = 'gps_reel';
      }

      // Fallback anti-bug : GPS manquant → 1 km minimum
      if (!distanceKm || distanceKm <= 0) {
        distanceKm = 1.0;
        source = 'minimum_fallback';
      }

      const distSafe = distanceKm;
      const tarif = await chargerTarifPays(base44, course.country_code);
      const prixFinal = Math.max(Math.round(distSafe * tarif.prixParKm), tarif.prixMinimum);
      const commissionPct = await chargerCommissionPays(base44, course.country_code);
      const commission = Math.round(prixFinal * (commissionPct / 100));
      const montantLivreur = prixFinal - commission;

      await base44.asServiceRole.entities.CourseExterne.update(course.id, {
        distance_reelle_km: distSafe,
        prix_final: prixFinal,
        commission_silga: commission,
        montant_livreur: montantLivreur,
      });

      // Recalculer le solde du livreur depuis les sources financières
      if (course.livreur_id) {
        await recalculerSoldeLivreur(base44, course.livreur_id).catch((err: any) =>
          console.warn('[RETRO] recalculerSoldeLivreur error:', err?.message)
        );
      }

      corrigees++;
      details.push({
        id: course.id.slice(-6),
        source,
        distance: distSafe.toFixed(1),
        prix: prixFinal,
        commission,
        gain: montantLivreur,
      });
    }

    return Response.json({
      success: true,
      total_livrees: courses.length,
      sans_prix: aCorreger.length,
      corrigees,
      ignorees,
      details,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});