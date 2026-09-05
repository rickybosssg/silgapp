/**
 * Quick Order helpers — Phase 3
 *
 * Réutilise les DONNÉES EXISTANTES (CourseExterne livrées, ClientAddress, ContactCarnet)
 * pour extraire trajets fréquents, adresses récentes et contacts récents.
 *
 * NE CRÉE PAS de nouvelle base parallèle.
 * NE MODIFIE PAS la tarification, le dispatch, ou la logique de création de course.
 */

import { base44 } from "@/api/base44Client";

/**
 * Charge les courses livrées du client (max 50, triées par date desc).
 */
export async function fetchDeliveredCourses(clientId, user) {
  if (!clientId || !user?.id) return [];

  try {
    const courses = await base44.entities.CourseExterne.filter(
      { created_by_id: user.id, statut: "livree" },
      "-heure_livraison",
      50
    );
    return courses || [];
  } catch {
    return [];
  }
}

/**
 * Charge les adresses sauvegardées du client (ClientAddress).
 */
export async function fetchClientAddresses(clientId) {
  if (!clientId) return [];
  try {
    return await base44.entities.ClientAddress.filter(
      { client_id: clientId },
      "-derniere_utilisation",
      10
    );
  } catch {
    return [];
  }
}

/**
 * Charge les contacts du carnet (ContactCarnet).
 */
export async function fetchClientContacts(clientId) {
  if (!clientId) return [];
  try {
    return await base44.entities.ContactCarnet.filter(
      { client_id: clientId },
      "-derniere_utilisation",
      10
    );
  } catch {
    return [];
  }
}

/**
 * Extrait les trajets fréquents à partir des courses livrées.
 *
 * Un trajet = (adresse_depart + adresse_arrivee) ou (quartier_depart + quartier_arrivee).
 * Déduplique par trajet, compte les occurrences, trie par fréquence.
 *
 * @returns {Array<{depart_label, arrivee_label, quartiers, count, last_date, course}>}
 */
export function extractFrequentTrips(deliveredCourses) {
  if (!deliveredCourses || deliveredCourses.length === 0) return [];

  const tripMap = new Map();

  for (const course of deliveredCourses) {
    const dep = (course.adresse_depart || "").trim();
    const arr = (course.adresse_arrivee || "").trim();
    const qDep = (course.quartier_depart || "").trim();
    const qArr = (course.quartier_arrivee || "").trim();

    // Clé de trajet : adresses si disponibles, sinon quartiers
    const key = dep && arr ? `${dep}→${arr}` : (qDep && qArr ? `${qDep}→${qArr}` : null);
    if (!key) continue;

    const existing = tripMap.get(key);
    if (existing) {
      existing.count++;
      const cDate = course.heure_livraison || course.colis_livre_at || course.created_date;
      if (cDate && (!existing.last_date || new Date(cDate) > new Date(existing.last_date))) {
        existing.last_date = cDate;
        existing.course = course; // Garder la plus récente comme référence
      }
    } else {
      tripMap.set(key, {
        depart_label: dep || qDep || "",
        arrivee_label: arr || qArr || "",
        count: 1,
        last_date: course.heure_livraison || course.colis_livre_at || course.created_date || null,
        course,
      });
    }
  }

  // Trier par fréquence (count desc), puis par date (last_date desc)
  const trips = [...tripMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const aDate = a.last_date ? new Date(a.last_date).getTime() : 0;
    const bDate = b.last_date ? new Date(b.last_date).getTime() : 0;
    return bDate - aDate;
  });

  // Maximum 3 propositions
  return trips.slice(0, 3);
}

/**
 * Extrait les adresses récentes (départ) à partir des courses livrées + ClientAddress.
 * Déduplique par adresse/quartier, max 5.
 */
export function extractRecentAddresses(deliveredCourses, clientAddresses) {
  const seen = new Set();
  const result = [];

  // 1. Adresses sauvegardées (ClientAddress) — priorité
  for (const addr of (clientAddresses || [])) {
    const label = (addr.adresse || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push({
      label,
      quartier: addr.quartier || "",
      ville: addr.ville || "",
      latitude: addr.latitude || null,
      longitude: addr.longitude || null,
      source: "saved",
    });
    if (result.length >= 5) return result;
  }

  // 2. Adresses de départ des courses livrées
  for (const course of (deliveredCourses || [])) {
    const label = (course.adresse_depart || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push({
      label,
      quartier: course.quartier_depart || "",
      ville: course.ville_depart || "",
      latitude: course.gps_depart_lat || null,
      longitude: course.gps_depart_lng || null,
      source: "history",
    });
    if (result.length >= 5) return result;
  }

  return result;
}

/**
 * Construit le prefillData pour un trajet fréquent.
 * Réutilise EXACTEMENT le même format que RefaireCourseButton.
 */
export function buildPrefillFromTrip(trip) {
  if (!trip?.course) return null;
  const course = trip.course;
  return {
    type_course: course.type_course,
    adresse_depart: course.adresse_depart || "",
    adresse_arrivee: course.adresse_arrivee || "",
    quartier_depart: course.quartier_depart || "",
    quartier_arrivee: course.quartier_arrivee || "",
    ville_depart: course.ville_depart || "",
    ville_arrivee: course.ville_arrivee || "",
    gps_depart_lat: course.gps_depart_lat || null,
    gps_depart_lng: course.gps_depart_lng || null,
    gps_arrivee_lat: course.gps_arrivee_lat || null,
    gps_arrivee_lng: course.gps_arrivee_lng || null,
    expediteur_nom: course.expediteur_nom || "",
    expediteur_telephone: course.expediteur_telephone || "",
    destinataire_nom: course.destinataire_nom || "",
    destinataire_telephone: course.destinataire_telephone || "",
    type_colis: course.type_colis || "petit_colis",
    passager_nom: course.passager_nom || "",
    passager_telephone: course.passager_telephone || "",
    nb_passagers: course.nb_passagers || 1,
    notes: "",
    destination_inconnue: course.destination_inconnue || false,
  };
}