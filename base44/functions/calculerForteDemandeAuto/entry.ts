import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// ── Statuts réellement actifs (courses à compter pour Forte Demande) ──
// Liste positive : phase de recherche + livreur engagé.
// Exclut en_attente (suspendue), programmee (non démarrée), livree, annulee (terminaux).
// DOIT rester identique à getForteDemandeStatus/entry.ts — logique métier unique.
const STATUTS_ACTIFS_FORTE_DEMANDE = [
  "nouvelle",
  "recherche_livreur",
  "livreur_en_route",
  "client_contacte",
  "en_route_expediteur",
  "arrive_prise_en_charge",
  "colis_recupere",
  "passager_embarque",
  "pris_en_charge",
  "en_livraison",
  "arrivee",
];

/**
 * calculerForteDemandeAuto — Workflow backend (toutes les 5 min)
 *
 * Recalcule l'état Forte Demande pour TOUS les pays actifs ayant
 * forte_demande_client_actif === true, en une seule invocation.
 *
 * Logique IDENTIQUE à getForteDemandeStatus (hystérésis + persistance):
 *   - count >= seuil_activation → true
 *   - count <= seuil_retour → false
 *   - entre les deux → conserve l'état précédent persisté
 *
 * Écrit Country.forte_demande_active UNIQUEMENT lors d'une transition
 * (forteDemande !== prevState). Aucune écriture si l'état ne change pas.
 *
 * NE MODIFIE PAS:
 *   - les seuils
 *   - STATUTS_ACTIFS
 *   - l'hystérésis
 *   - titre/message
 *   - aucune autre configuration
 *
 * Multi-pays: chaque pays est calculé indépendamment avec SES propres
 * CourseExterne (filtrage par country_code).
 *
 * Ne nécessite pas d'authentification utilisateur (asServiceRole).
 * Appelé exclusivement par le workflow scheduled.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. Récupérer tous les pays avec Forte Demande client activé ──
    const countries = await base44.asServiceRole.entities.Country.filter({
      forte_demande_client_actif: true,
      actif: true,
    });

    if (!countries || countries.length === 0) {
      return Response.json({ processed: 0, transitions: 0, details: [] });
    }

    const details = [];
    let transitions = 0;

    // ── 2. Pour chaque pays, calculer l'état Forte Demande ──
    for (const country of countries) {
      const countryCode = country.code;

      const seuilActivation = Number(country.forte_demande_seuil_activation) || 5;
      const seuilRetour = Number(country.forte_demande_seuil_retour) || 3;

      // Compter les courses actives pour ce pays
      const activeCourses = await base44.asServiceRole.entities.CourseExterne.filter({
        country_code: countryCode,
        statut: STATUTS_ACTIFS_FORTE_DEMANDE,
      }, "-created_date", 500);

      const activeCount = (activeCourses || []).length;
      const prevState = !!country.forte_demande_active;

      // ── Appliquer l'hystérésis (logique identique à getForteDemandeStatus) ──
      let newState;
      if (activeCount >= seuilActivation) {
        newState = true;
      } else if (activeCount <= seuilRetour) {
        newState = false;
      } else {
        // Entre les seuils : conserver l'état précédent persisté
        newState = prevState;
      }

      // ── 3. Persister UNIQUEMENT si l'état a changé (transition) ──
      if (newState !== prevState) {
        await base44.asServiceRole.entities.Country.update(country.id, {
          forte_demande_active: newState,
        });
        transitions++;
      }

      details.push({
        country_code: countryCode,
        active_count: activeCount,
        prev_state: prevState,
        new_state: newState,
        transition: newState !== prevState,
        seuil_activation: seuilActivation,
        seuil_retour: seuilRetour,
      });
    }

    return Response.json({ processed: countries.length, transitions, details });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}