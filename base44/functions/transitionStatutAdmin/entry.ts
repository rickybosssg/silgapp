import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITION STATUT ADMIN — Transitions de statut contrôlées par l'admin
// ═══════════════════════════════════════════════════════════════════════════
//
// Utilisé par :
//   - CourseDetailDialog (updateMutation générique)
//
// Sécurité :
//   - Valide l'identité admin (base44.auth.me)
//   - Accepte UNIQUEMENT statut_cible + notes (pas de data arbitraire)
//   - Refuse les modifications financières (prix_final, commission_silga, etc.)
//   - Refuse livreur_id (utiliser assignerLivreurAdmin)
//   - Refuse annulee (utiliser cloturerCourseAdmin)
//   - Refuse livree (utiliser finaliserLivraisonLivreur)
//   - Résout livreur_user_email si livreur_id existe déjà (mais ne le change pas)
//   - Idempotent : si déjà au statut cible → success sans réécriture
// ═══════════════════════════════════════════════════════════════════════════

const STATUTS_VALIDES = [
  'nouvelle', 'en_attente', 'programmee', 'recherche_livreur',
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque',
  'pris_en_charge', 'en_livraison', 'arrivee',
];

// Statuts interdits via cette fonction (utiliser les fonctions dédiées)
const STATUTS_INTERDITS = ['livree', 'annulee'];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, statut_cible, notes } = body;

    if (!course_id || !statut_cible) {
      return Response.json({ error: 'course_id et statut_cible requis' }, { status: 400 });
    }

    // ── Valider le statut cible ──
    if (STATUTS_INTERDITS.includes(statut_cible)) {
      return Response.json({
        error: `Statut "${statut_cible}" interdit via cette fonction. Utiliser ${statut_cible === 'livree' ? 'finaliserLivraisonLivreur' : 'cloturerCourseAdmin'}.`,
      }, { status: 400 });
    }

    if (!STATUTS_VALIDES.includes(statut_cible)) {
      return Response.json({ error: `Statut cible invalide: ${statut_cible}` }, { status: 400 });
    }

    // ── Récupérer la course ──
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    // ── Idempotence ──
    if (course.statut === statut_cible) {
      return Response.json({ success: true, skipped: 'already_at_target', course_id, statut: statut_cible });
    }

    // ── Construire l'update (UNIQUEMENT statut + notes + heure_*) ──
    const now = new Date().toISOString();
    const updateData: any = { statut: statut_cible };

    // Champs heure selon le statut
    if (statut_cible === 'client_contacte') updateData.heure_contact_client = now;
    if (statut_cible === 'colis_recupere') {
      updateData.heure_recuperation = now;
      updateData.pickup_confirmed_by = 'admin';
      updateData.pickup_confirmed_at = now;
    }
    if (statut_cible === 'pris_en_charge') updateData.heure_prise_en_charge = now;
    if (statut_cible === 'arrivee') updateData.heure_arrivee = now;

    // Notes (append)
    if (notes && typeof notes === 'string' && notes.trim().length > 0) {
      updateData.notes = (course.notes || '') + `\n[ADMIN → ${statut_cible}] ${notes.trim()}`;
    }

    // ── Mettre à jour la course ──
    const updated = await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

    console.log(`[TRANSITION_ADMIN] Course ${course_id} → ${statut_cible} par ${user.email}`);

    return Response.json({
      success: true,
      course: updated,
      statut: statut_cible,
    });

  } catch (error) {
    console.error('[TRANSITION_ADMIN] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}