import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// ── Statuts réellement actifs (courses à compter pour Forte Demande) ──
// Liste positive : phase de recherche + livreur engagé.
// Exclut en_attente (suspendue), programmee (non démarrée), livree, annulee (terminaux).
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
 * getForteDemandeStatus — Compte les courses actives par pays et détermine
 * si le mode Forte Demande doit être affiché sur les dashboards clients.
 *
 * Logique d'hystérésis :
 *   - count >= seuil_activation → forte_demande = true
 *   - count <= seuil_retour → forte_demande = false
 *   - entre les deux → conserve l'état précédent (anti-clignotement)
 *
 * L'état précédent est PERSISTÉ sur le champ Country.forte_demande_active.
 * Cela garantit :
 *   - Unicité de l'état par pays (tous les clients voient le même résultat)
 *   - Survie aux redémarrages (pas de perte d'état)
 *   - Cohérence multi-workers (pas d'état divergent entre isolates)
 *
 * Écriture uniquement lors d'une transition de seuil (rare) — pas à chaque appel.
 *
 * Multi-pays strict : chaque pays est compté indépendamment.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const countryCode = String(body.country_code || "").toUpperCase().trim();

    if (!countryCode) {
      return Response.json({ error: 'country_code requis' }, { status: 400 });
    }

    // ── 1. Charger la config du pays ──
    const countries = await base44.asServiceRole.entities.Country.filter({ code: countryCode });
    const country = (countries || [])[0];

    if (!country) {
      return Response.json({ error: 'Pays introuvable' }, { status: 404 });
    }

    // Si Forte Demande désactivé pour ce pays → toujours bleu
    if (!country.forte_demande_client_actif) {
      return Response.json({
        country_code: countryCode,
        active_count: 0,
        forte_demande: false,
        config: {
          actif: false,
          seuil_activation: country.forte_demande_seuil_activation || 5,
          seuil_retour: country.forte_demande_seuil_retour || 3,
          titre: country.forte_demande_titre || "🔥 FORTE DEMANDE EN COURS",
          message: country.forte_demande_message || "Plusieurs commandes sont en cours. Proposez un prix attractif pour augmenter vos chances de trouver rapidement un livreur.",
        },
      });
    }

    const seuilActivation = Number(country.forte_demande_seuil_activation) || 5;
    const seuilRetour = Number(country.forte_demande_seuil_retour) || 3;

    // ── 2. Compter les courses actives pour ce pays ──
    // Utilise asServiceRole pour compter TOUTES les courses du pays (pas seulement celles de l'utilisateur).
    // Liste positive des statuts actifs — pas de filtre négatif.
    const allCourses = await base44.asServiceRole.entities.CourseExterne.filter({
      country_code: countryCode,
      statut: STATUTS_ACTIFS_FORTE_DEMANDE,
    }, "-created_date", 500);

    const activeCount = (allCourses || []).length;

    // ── 3. Appliquer l'hystérésis avec état persisté sur Country ──
    const prevState = !!country.forte_demande_active;

    let forteDemande;
    if (activeCount >= seuilActivation) {
      forteDemande = true;
    } else if (activeCount <= seuilRetour) {
      forteDemande = false;
    } else {
      // Entre les seuils : conserver l'état précédent persisté
      forteDemande = prevState;
    }

    // ── 4. Persister uniquement si l'état a changé (transition de seuil) ──
    // Écriture rare : uniquement lors du franchissement d'un seuil.
    // Pas d'écriture à chaque appel → pas de charge DB inutile.
    if (forteDemande !== prevState) {
      await base44.asServiceRole.entities.Country.update(country.id, {
        forte_demande_active: forteDemande,
      });
    }

    return Response.json({
      country_code: countryCode,
      active_count: activeCount,
      forte_demande: forteDemande,
      config: {
        actif: true,
        seuil_activation: seuilActivation,
        seuil_retour: seuilRetour,
        titre: country.forte_demande_titre || "🔥 FORTE DEMANDE EN COURS",
        message: country.forte_demande_message || "Plusieurs commandes sont en cours. Proposez un prix attractif pour augmenter vos chances de trouver rapidement un livreur.",
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}