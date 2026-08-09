import { base44 } from "@/api/base44Client";
import { normalizePhone } from "./crmUtils";

/**
 * Upsert une adresse dans le carnet d'adresses du client.
 * Si l'adresse existe déjà (même client, même rôle, même texte), incrémente le compteur
 * et met à jour la date de dernière utilisation.
 * Sinon, crée une nouvelle entrée.
 */
export async function upsertClientAddress(clientId, phoneNormalized, role, addressData, countryCode) {
  if (!clientId || !addressData?.adresse) return null;

  const existing = await base44.entities.ClientAddress.filter(
    { client_id: clientId, role: role, adresse: addressData.adresse },
    null,
    1
  );

  if (existing.length > 0) {
    const addr = existing[0];
    await base44.entities.ClientAddress.update(addr.id, {
      nb_utilisations: (addr.nb_utilisations || 1) + 1,
      derniere_utilisation: new Date().toISOString(),
      ...(addressData.latitude ? { latitude: addressData.latitude } : {}),
      ...(addressData.longitude ? { longitude: addressData.longitude } : {}),
      ...(addressData.quartier ? { quartier: addressData.quartier } : {}),
    });
    return addr.id;
  }

  const newAddr = await base44.entities.ClientAddress.create({
    client_id: clientId,
    client_telephone_normalized: phoneNormalized,
    role: role,
    adresse: addressData.adresse,
    quartier: addressData.quartier || null,
    ville: addressData.ville || null,
    latitude: addressData.latitude || null,
    longitude: addressData.longitude || null,
    country_code: countryCode,
    nb_utilisations: 1,
    derniere_utilisation: new Date().toISOString(),
    is_favorite: false,
  });
  return newAddr.id;
}

/**
 * Upsert les adresses de départ et d'arrivée pour une course donnée.
 * Recherche le client par téléphone normalisé, puis upsert les deux adresses.
 */
export async function upsertCourseAddresses(courseData, countryCode) {
  const clientPhone =
    courseData.client_phone_normalized || normalizePhone(courseData.client_telephone, countryCode);
  if (!clientPhone) return;

  const clients = await base44.entities.ClientExterne.filter(
    { telephone_normalized: clientPhone },
    null,
    1
  );
  if (clients.length === 0) return;
  const client = clients[0];

  // Adresse de départ (pickup)
  if (courseData.adresse_depart && courseData.adresse_depart !== "—") {
    await upsertClientAddress(
      client.id,
      clientPhone,
      "pickup",
      {
        adresse: courseData.adresse_depart,
        quartier: courseData.quartier_depart,
        latitude: courseData.gps_depart_lat,
        longitude: courseData.gps_depart_lng,
      },
      countryCode
    );
  }

  // Adresse d'arrivée (delivery)
  if (courseData.adresse_arrivee && courseData.adresse_arrivee !== "—") {
    await upsertClientAddress(
      client.id,
      clientPhone,
      "delivery",
      {
        adresse: courseData.adresse_arrivee,
        quartier: courseData.quartier_arrivee,
        latitude: courseData.gps_arrivee_lat,
        longitude: courseData.gps_arrivee_lng,
      },
      countryCode
    );
  }
}