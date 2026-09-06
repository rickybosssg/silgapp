import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { phoneVariants, normalizePhone } from '../../shared/phoneUtils.ts';

/**
 * findContactByPhoneSecure — Recherche UNIFIÉE de contact par téléphone.
 *
 * Source unique de vérité pour la recherche téléphone côté frontend.
 * Recherche dans ClientExterne (qui EST la base CRM unifiée).
 *
 * Sécurité :
 * - Authentification requise (base44.auth.me())
 * - Utilise asServiceRole pour bypasser le RLS (sinon un client ne pourrait
 *   pas trouver un autre client par téléphone)
 * - NE RETOURNE QUE les champs strictement nécessaires au formulaire :
 *   id, nom, prenom, telephone, latitude, longitude, has_app_account
 * - Ne JAMAIS retourner : user_email, notes_admin, statut_crm,
 *   telephone_normalized, montants, etc.
 *
 * Priorité de déduplication :
 * - Si plusieurs ClientExterne ont le même téléphone, on retourne le plus pertinent
 *   (privilégie celui avec user_email = compte SILGAPP actif).
 *
 * @param {Request} req - { phone: string, countryCode: string }
 * @returns {Response} { found, id, nom, prenom, telephone, latitude, longitude, has_app_account }
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const phone = body?.phone;
    const countryCode = body?.countryCode || null;

    if (!phone || String(phone).replace(/\D/g, '').length < 6) {
      return Response.json({ found: false });
    }

    // Générer toutes les variantes du numéro (format local + international + avec/sans +)
    const variants = phoneVariants(phone);
    if (!variants || variants.length === 0) {
      return Response.json({ found: false });
    }

    // Rechercher dans ClientExterne (base CRM unifiée) avec asServiceRole
    // pour bypasser le RLS (sinon un client ne peut trouver que ses propres enregistrements)
    let foundClient = null;

    const allMatches = [];
    const seenIds = new Set();
    for (const v of variants) {
      try {
        const results = await base44.asServiceRole.entities.ClientExterne.filter({
          telephone: v
        });
        if (results && results.length > 0) {
          for (const r of results) {
            if (!seenIds.has(r.id)) { seenIds.add(r.id); allMatches.push(r); }
          }
        }
      } catch (_) {}
      // Aussi chercher avec le format normalisé (telephone_normalized)
      try {
        const normalized = normalizePhone(phone, countryCode);
        if (normalized && normalized !== v) {
          const results = await base44.asServiceRole.entities.ClientExterne.filter({
            telephone_normalized: normalized
          });
          if (results && results.length > 0) {
            for (const r of results) {
              if (!seenIds.has(r.id)) { seenIds.add(r.id); allMatches.push(r); }
            }
          }
        }
      } catch (_) {}
    }
    // Priorité : préférer le client avec un compte SILGAPP (user_email renseigné)
    if (allMatches.length > 0) {
      foundClient = allMatches.find(m => !!(m.user_email && m.user_email.trim())) || allMatches[0];
    }

    if (!foundClient) {
      return Response.json({ found: false });
    }

    // Déterminer si le client a un compte SILGAPP (user_email renseigné)
    const hasAppAccount = !!(foundClient.user_email && foundClient.user_email.trim());

    // Retourner UNIQUEMENT les champs nécessaires au formulaire
    return Response.json({
      found: true,
      id: foundClient.id,
      nom: foundClient.nom || '',
      prenom: foundClient.prenom || '',
      telephone: foundClient.telephone || '',
      latitude: foundClient.latitude || null,
      longitude: foundClient.longitude || null,
      has_app_account: hasAppAccount,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}