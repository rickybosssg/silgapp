import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { normalizeEnterpriseId, isEnterpriseAdmin } from '../../shared/enterpriseFinance.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getEnterpriseCourseMessages — Supervision LECTURE SEULE des messages
// d'une course Enterprise par l'admin de l'agence propriétaire.
//
// RÈGLES DE SÉCURITÉ :
//   1. Authentification obligatoire (base44.auth.me()).
//   2. Réservé aux admins entreprise (silgapp_role === 'admin_entreprise').
//   3. Isolation tenant : course.enterprise_id === user.enterprise_id (canonique).
//      Admin A → Course B = 403. Admin A → course publique = 403.
//   4. asServiceRole utilisé UNIQUEMENT après vérification tenant.
//   5. READ-ONLY : aucune création, modification ou suppression de Message.
//   6. Ne modifie JAMAIS participant_user_ids, ensureCourseCodeMessage, etc.
//   7. Ne déclenche aucun Push, WhatsApp, dispatch, GPS, heartbeat.
//
// Retourne les champs d'affichage uniquement (participant_user_ids exclu).
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // ── 1. Réservé aux admins entreprise ──
    if (!isEnterpriseAdmin(user) || !user.enterprise_id) {
      return Response.json({ error: 'Réservé aux administrateurs d\'entreprise' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { course_id } = body;
    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    // ── 2. Charger la course (via asServiceRole — lecture seule, pas de RLS) ──
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id).catch(() => null);
    if (!course) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }

    // ── 3. Isolation tenant OBLIGATOIRE avant de charger les messages ──
    const courseEntId = normalizeEnterpriseId(course.enterprise_id);
    const adminEntId = normalizeEnterpriseId(user.enterprise_id);
    if (courseEntId !== adminEntId) {
      return Response.json({ error: 'Cette course n\'appartient pas à votre agence' }, { status: 403 });
    }

    // ── 4. Charger les messages (asServiceRole — après vérification tenant) ──
    const messages = await base44.asServiceRole.entities.Message.filter(
      { course_id },
      'created_date',
      200
    ).catch(() => []);

    // ── 5. Projeter uniquement les champs d'affichage (exclure participant_user_ids) ──
    const safeMessages = (messages || []).map((m: any) => ({
      id: m.id,
      sender_type: m.sender_type,
      sender_id: m.sender_id,
      sender_name: m.sender_name,
      sender_photo_url: m.sender_photo_url,
      message_type: m.message_type,
      content: m.content,
      audio_url: m.audio_url,
      photo_url: m.photo_url,
      video_url: m.video_url,
      document_url: m.document_url,
      location_lat: m.location_lat,
      location_lng: m.location_lng,
      source: m.source,
      created_date: m.created_date,
    }));

    // ── 6. Infos course (pour l'en-tête de conversation) ──
    const courseInfo = {
      id: course.id,
      statut: course.statut,
      client_nom: course.client_nom,
      adresse_depart: course.adresse_depart,
      adresse_arrivee: course.adresse_arrivee,
      livreur_nom: course.livreur_nom,
      prix_final: course.prix_final,
      devise: course.devise,
      created_date: course.created_date,
    };

    return Response.json({
      success: true,
      course: courseInfo,
      messages: safeMessages,
      count: safeMessages.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}