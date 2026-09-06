import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * upsertClientAddressSecure — Sécurise l'écriture ClientAddress depuis l'app client.
 *
 * Résout client_user_email depuis l'utilisateur AUTHENTIFIÉ (jamais du frontend).
 * Un client ne peut pas créer une adresse prétendant appartenir à un autre.
 *
 * Les 857 adresses historiques (sans client_user_email) ne sont PAS modifiées.
 * Les écritures admin (addressBook.js) contournent via user_condition: admin.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { clientId, phoneNormalized, role, addressData, countryCode } = body;

    if (!clientId || !addressData?.adresse) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const clientUserEmail = user.email;

    // Rechercher une adresse existante APPARTENANT au client connecté
    // (RLS read filtre automatiquement par client_user_email)
    const existing = await base44.entities.ClientAddress.filter(
      { client_id: clientId, role: role, adresse: addressData.adresse },
      null,
      1
    );

    if (existing && existing.length > 0) {
      const addr = existing[0];
      await base44.entities.ClientAddress.update(addr.id, {
        nb_utilisations: (addr.nb_utilisations || 1) + 1,
        derniere_utilisation: new Date().toISOString(),
        ...(addressData.latitude ? { latitude: addressData.latitude } : {}),
        ...(addressData.longitude ? { longitude: addressData.longitude } : {}),
        ...(addressData.quartier ? { quartier: addressData.quartier } : {}),
      });
      return Response.json({ id: addr.id, updated: true });
    }

    const newAddr = await base44.entities.ClientAddress.create({
      client_id: clientId,
      client_telephone_normalized: phoneNormalized || null,
      client_user_email: clientUserEmail,
      role: role,
      adresse: addressData.adresse,
      quartier: addressData.quartier || null,
      ville: addressData.ville || null,
      latitude: addressData.latitude || null,
      longitude: addressData.longitude || null,
      country_code: countryCode || null,
      nb_utilisations: 1,
      derniere_utilisation: new Date().toISOString(),
      is_favorite: false,
    });
    return Response.json({ id: newAddr.id, created: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}