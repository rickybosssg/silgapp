import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveDialCode } from '../../shared/countryResolver.ts';

/**
 * Normalise un numéro de téléphone :
 * - Supprime les espaces, tirets, points
 * - Retire l'indicatif pays si présent
 * - Retourne uniquement les chiffres locaux
 */
async function normalizePhone(base44, phone, countryCode) {
  if (!phone) return "";
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Retirer l'indicatif pays résolu dynamiquement
  if (countryCode) {
    const dial = await resolveDialCode(base44, countryCode);
    if (dial) {
      const dialDigits = dial.replace(/^\+/, "");
      if (cleaned.startsWith("+" + dialDigits)) {
        cleaned = cleaned.substring(dialDigits.length + 1);
      } else if (cleaned.startsWith(dialDigits)) {
        cleaned = cleaned.substring(dialDigits.length);
      }
    }
  }

  // Retirer un + générique restant
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  cleaned = cleaned.replace(/\D/g, "");
  return cleaned;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, phone, course_id } = await req.json();

    // Action 1: Normaliser un numéro
    if (action === "normalize") {
      const normalized = await normalizePhone(base44, phone, body.country_code);
      return Response.json({ normalized });
    }

    // Action 2: Trouver un client par téléphone normalisé
    if (action === "find_client") {
      const normalized = await normalizePhone(base44, phone, body.country_code);

      const clients = await base44.entities.ClientExterne.filter({
        actif: true
      });

      // Chercher un client dont le téléphone correspond
      const foundClient = clients.find(client => {
        const clientNormalized = normalizePhone(base44, client.telephone, client.country_code);
        return clientNormalized === normalized;
      });

      if (foundClient) {
        return Response.json({
          found: true,
          client_id: foundClient.id,
          client_nom: foundClient.nom,
          client_email: foundClient.email
        });
      } else {
        return Response.json({ found: false });
      }
    }

    // Action 3: Créer un lien de suivi public
    if (action === "create_tracking_link") {
      if (!course_id) {
        return Response.json({ error: "course_id requis" }, { status: 400 });
      }

      // Générer un token unique
      const token = crypto.randomUUID();

      // Construire le lien public (à adapter selon le domaine)
      const baseUrl = "https://silgapp.base44.app";
      const trackingLink = `${baseUrl}/suivi-public/${token}`;

      // Mettre à jour la course
      await base44.entities.CourseExterne.update(course_id, {
        tracking_token: token,
        tracking_link: trackingLink,
        tracking_shared_at: new Date().toISOString()
      });

      return Response.json({
        success: true,
        tracking_token: token,
        tracking_link: trackingLink
      });
    }

    // Action 4: Incrémenter le compteur d'ouvertures
    if (action === "track_open") {
      if (!course_id) {
        return Response.json({ error: "course_id requis" }, { status: 400 });
      }

      const course = await base44.entities.CourseExterne.get(course_id);
      if (course) {
        await base44.entities.CourseExterne.update(course_id, {
          tracking_opened_count: (course.tracking_opened_count || 0) + 1
        });
      }

      return Response.json({ success: true });
    }

    return Response.json({ error: "Action non reconnue" }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});