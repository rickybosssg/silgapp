/**
 * getClientFrequentOrigin — Phase 5 Étape 2
 *
 * Détecte le départ habituel d'un client à partir de ses courses livrées.
 * Réutilise les DONNÉES EXISTANTES (CourseExterne, ClientAddress).
 * NE CRÉE PAS de nouvelle base parallèle.
 *
 * Critères :
 * - Minimum 5 courses livrées
 * - Même départ sur ≥70% des courses récentes
 * - Audit qualité GPS/adresse avant d'appliquer
 *
 * NE MODIFIE PAS : tarification, dispatch, commissions, finance.
 */

import { base44 } from "@/api/base44Client";
import { fetchDeliveredCourses, fetchClientAddresses } from "@/lib/quickOrder";

/**
 * Normalise un label d'adresse/quartier pour le regroupement.
 * Évite de considérer de petites variantes d'une même adresse comme des lieux différents.
 */
function normalizeOriginLabel(label) {
  if (!label) return "";
  let s = label.trim().toLowerCase();
  // Supprimer "position gps", "position gps du destinataire", etc.
  if (s.includes("position gps")) return "position_gps";
  // Supprimer les espaces multiples et la ponctuation de fin
  s = s.replace(/\s+/g, " ").replace(/[.,;]+$/g, "").trim();
  return s;
}

/**
 * Détecte le départ habituel d'un client.
 *
 * @param {Object} clientProfil - ClientExterne du client
 * @param {Object} user - User connecté (avec .id)
 * @returns {Promise<Object|null>} {
 *   label, quartier, latitude, longitude, source,
 *   confidence, total_courses, matching_courses, pct
 * }
 *   null si aucun départ récurrent fiable.
 */
export async function getClientFrequentOrigin(clientProfil, user) {
  if (!clientProfil?.id || !user?.id) return null;

  try {
    const [courses, addresses] = await Promise.all([
      fetchDeliveredCourses(clientProfil.id, user),
      fetchClientAddresses(clientProfil.id),
    ]);

    // Critère : minimum 5 courses livrées
    if (!courses || courses.length < 5) return null;

    // Grouper par départ normalisé
    const originMap = new Map();
    for (const course of courses) {
      const rawLabel = course.adresse_depart || course.quartier_depart || "";
      const normalized = normalizeOriginLabel(rawLabel);
      if (!normalized) continue;

      if (!originMap.has(normalized)) {
        originMap.set(normalized, {
          label: rawLabel.trim(),
          quartier: course.quartier_depart || "",
          latitude: course.gps_depart_lat || null,
          longitude: course.gps_depart_lng || null,
          source: course.gps_depart_source || null,
          count: 0,
        });
      }
      const entry = originMap.get(normalized);
      entry.count++;
      // Garder le GPS le plus précis
      if ((course.gps_depart_lat && course.gps_depart_source === "exact") ||
          (course.gps_depart_lat && !entry.latitude)) {
        entry.latitude = course.gps_depart_lat;
        entry.longitude = course.gps_depart_lng;
        entry.source = course.gps_depart_source || entry.source;
      }
    }

    // Trouver le départ le plus fréquent
    const sorted = [...originMap.entries()].sort((a, b) => b[1].count - a[1].count);
    if (sorted.length === 0) return null;

    const [topKey, topOrigin] = sorted[0];
    const pct = topOrigin.count / courses.length;

    // Critère : ≥70% des courses avec même départ
    if (pct < 0.7) return null;

    // Audit qualité : si "position_gps" générique, vérifier qu'on a un GPS fiable
    if (topKey === "position_gps") {
      if (!topOrigin.latitude || !topOrigin.longitude) return null;
      // Utiliser le quartier du profil comme label lisible
      if (clientProfil?.quartier) {
        topOrigin.label = `Position GPS (${clientProfil.quartier})`;
      }
    }

    // Enrichir avec ClientAddress si disponible (donnée plus fiable)
    const savedAddress = (addresses || []).find(a =>
      normalizeOriginLabel(a.adresse || a.quartier) === topKey
    );
    if (savedAddress) {
      if (savedAddress.latitude && savedAddress.longitude) {
        topOrigin.latitude = savedAddress.latitude;
        topOrigin.longitude = savedAddress.longitude;
      }
      if (savedAddress.quartier) topOrigin.quartier = savedAddress.quartier;
    }

    return {
      label: topOrigin.label,
      quartier: topOrigin.quartier || clientProfil?.quartier || "",
      latitude: topOrigin.latitude,
      longitude: topOrigin.longitude,
      source: topOrigin.source,
      confidence: Math.round(pct * 100),
      total_courses: courses.length,
      matching_courses: topOrigin.count,
      pct: Math.round(pct * 100),
    };
  } catch (err) {
    console.error("[getClientFrequentOrigin] Erreur:", err);
    return null;
  }
}

/**
 * Récupère les destinataires récents du client (max 5).
 * Utilise les courses livrées + ContactCarnet.
 *
 * @returns {Promise<Array<{nom, telephone, quartier_arrivee, adresse_arrivee, gps_lat, gps_lng, count}>>}
 */
export async function getRecentRecipients(clientProfil, user, maxResults = 5) {
  if (!clientProfil?.id || !user?.id) return [];

  try {
    const [courses, contacts] = await Promise.all([
      fetchDeliveredCourses(clientProfil.id, user),
      base44.entities.ContactCarnet.filter(
        { client_id: clientProfil.id },
        "-derniere_utilisation",
        10
      ).catch(() => []),
    ]);

    const recipientMap = new Map();

    // 1. Destinataires des courses livrées
    for (const course of (courses || [])) {
      const tel = (course.destinataire_telephone || "").trim();
      if (!tel) continue;
      const key = tel.replace(/\D/g, "");
      if (!key) continue;

      if (!recipientMap.has(key)) {
        recipientMap.set(key, {
          nom: course.destinataire_nom || "",
          telephone: tel,
          quartier_arrivee: course.quartier_arrivee || "",
          adresse_arrivee: course.adresse_arrivee || "",
          gps_lat: course.gps_arrivee_lat || null,
          gps_lng: course.gps_arrivee_lng || null,
          count: 0,
        });
      }
      recipientMap.get(key).count++;
    }

    // 2. Enrichir avec ContactCarnet (données plus récentes/structurées)
    for (const contact of (contacts || [])) {
      const tel = (contact.telephone || "").trim();
      if (!tel) continue;
      const key = tel.replace(/\D/g, "");
      if (!key) continue;

      if (recipientMap.has(key)) {
        const existing = recipientMap.get(key);
        if (contact.nom && !existing.nom) existing.nom = contact.nom;
        if (contact.quartier && !existing.quartier_arrivee) existing.quartier_arrivee = contact.quartier;
      } else if (recipientMap.size < maxResults) {
        recipientMap.set(key, {
          nom: contact.nom || "",
          telephone: tel,
          quartier_arrivee: contact.quartier || "",
          adresse_arrivee: contact.adresse || "",
          gps_lat: contact.latitude || null,
          gps_lng: contact.longitude || null,
          count: 1,
        });
      }
    }

    // Trier par fréquence (count desc), max 5
    return [...recipientMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, maxResults);
  } catch (err) {
    console.error("[getRecentRecipients] Erreur:", err);
    return [];
  }
}

/**
 * Construit le prefill pour une commande rapide.
 * Pré-remplit le départ ET optionnellement le destinataire.
 *
 * NE CRÉE PAS la course. Le client doit toujours confirmer "Commander".
 */
export function buildQuickOrderPrefill(origin, recipient) {
  const prefill = {
    // Départ pré-rempli (modifiable)
    adresse_depart: origin?.label || "",
    quartier_depart: origin?.quartier || "",
    gps_depart_lat: origin?.latitude || null,
    gps_depart_lng: origin?.longitude || null,
    gps_depart_source: origin?.source || null,
    recuperationGPS: !!origin?.latitude,
  };

  // Destinataire optionnel (si sélectionné)
  if (recipient) {
    prefill.destinataire_nom = recipient.nom || "";
    prefill.destinataire_telephone = recipient.telephone || "";
    prefill.adresse_arrivee = recipient.adresse_arrivee || "";
    prefill.quartier_arrivee = recipient.quartier_arrivee || "";
    prefill.gps_arrivee_lat = recipient.gps_lat || null;
    prefill.gps_arrivee_lng = recipient.gps_lng || null;
    prefill.livraisonGPS = !!(recipient.gps_lat && recipient.gps_lng);
  }

  return prefill;
}