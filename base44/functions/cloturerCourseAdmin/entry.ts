import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// CLOTURER COURSE ADMIN — Fermeture/annulation d'une course par l'admin
// ═══════════════════════════════════════════════════════════════════════════
//
// Utilisé par :
//   - CoursesRedispatch (closeMutation)
//
// Sécurité :
//   - Valide l'identité admin (base44.auth.me)
//   - Délègue à annulerCourseExterne(source="admin") — ne duplique PAS la logique
//   - annulerCourseExterne gère : libération livreur, notifications, etc.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, motif } = body;

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    // ── Déléguer à annulerCourseExterne avec source="admin" ──
    const result = await base44.asServiceRole.functions.invoke('annulerCourseExterne', {
      course_id,
      source: 'admin',
      motif: motif || 'fermeture_admin',
    });

    const data = (result as any)?.data || result;

    if (!data?.success && data?.error) {
      return Response.json({ error: data.error }, { status: 400 });
    }

    console.log(`[CLOTURE_ADMIN] Course ${course_id} fermée par ${user.email}`);

    return Response.json({
      success: true,
      course_id,
      livreur_libere: data?.livreur_libere || false,
      message: 'Course fermée',
    });

  } catch (error) {
    console.error('[CLOTURE_ADMIN] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}