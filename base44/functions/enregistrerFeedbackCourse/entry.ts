import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, note_livreur, commentaire_livreur, destinataire_feedback } = body;

    if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

    const hasNote = note_livreur != null && note_livreur >= 1 && note_livreur <= 5;
    const hasFeedback = destinataire_feedback === 'bon' || destinataire_feedback === 'mauvais';
    if (!hasNote && !hasFeedback) {
      return Response.json({ error: 'note_livreur (1-5) ou destinataire_feedback (bon/mauvais) requis' }, { status: 400 });
    }

    const asService = base44.asServiceRole;

    // ── Récupérer la course ──
    const course = await asService.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    // ── Valider que la course est livrée ──
    if (course.statut !== 'livree') {
      return Response.json({ error: 'Feedback disponible uniquement pour les courses livrées' }, { status: 403 });
    }

    // ── Valider l'autorisation : le client doit être le créateur ou le destinataire ──
    const isOwner = course.client_user_email === user.email || course.created_by_id === user.id;
    if (!isOwner) {
      return Response.json({ error: 'Vous n êtes pas autorisé à évaluer cette course' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const updateData = {};

    // ── Notation livreur ──
    if (hasNote) {
      if (course.note_livreur) {
        return Response.json({ error: 'Cette course a déjà été notée' }, { status: 403 });
      }
      updateData.note_livreur = note_livreur;
      updateData.commentaire_livreur = commentaire_livreur || null;
      updateData.note_date = now;
    }

    // ── Feedback destinataire ──
    if (hasFeedback) {
      if (course.destinataire_feedback) {
        return Response.json({ error: 'Le feedback a déjà été enregistré' }, { status: 403 });
      }
      updateData.destinataire_feedback = destinataire_feedback;
      updateData.destinataire_feedback_date = now;
    }

    await asService.entities.CourseExterne.update(course_id, updateData);

    // ── Recalculer la moyenne du livreur si une note a été ajoutée ──
    if (hasNote && course.livreur_id) {
      const livreurId = course.livreur_id;
      const courses = await asService.entities.CourseExterne.filter(
        { livreur_id: livreurId, statut: 'livree' },
        '-created_date', 200
      );
      const notees = (courses || []).filter(c => c.note_livreur > 0);
      const notes = notees.map(c => c.id === course_id ? note_livreur : c.note_livreur);
      if (!notees.find(c => c.id === course_id)) notes.push(note_livreur);

      const moyenne = notes.length > 0
        ? notes.reduce((a, b) => a + b, 0) / notes.length
        : note_livreur;

      await asService.entities.Livreur.update(livreurId, {
        note_moyenne: Math.round(moyenne * 10) / 10,
        nombre_avis: notes.length,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[enregistrerFeedbackCourse] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}