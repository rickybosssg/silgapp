import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  appliquerModification,
  getChampsModifiables,
  verifierModificationsAutorisees,
  getChampLabel,
  detecterIntentionModification,
} from '../../shared/venusCourseModifierEngine.ts';

/**
 * Fonction backend : Modification de course par VENUS
 *
 * Utilisable depuis :
 * - L'application SILGAPP (canal: "app")
 * - Le simulateur VENUS (canal: "simulateur")
 * - L'administration (canal: "admin")
 *
 * Actions :
 * - "appliquer" : Applique une modification sur une course
 * - "verifier" : Vérifie les champs modifiables pour un statut donné
 * - "detecter_intention" : Détecte si un message contient une intention de modification
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // ── Authentification ──
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Authentification requise' }, { status: 401 });
    }

    if (action === 'appliquer') {
      const { course_id, modifications, canal, motif, dry_run } = body;

      if (!course_id || !modifications) {
        return Response.json({ error: 'course_id et modifications requis' }, { status: 400 });
      }

      const result = await appliquerModification(base44, {
        course_id,
        modifications,
        auteur: user.email || body.auteur || 'venus',
        canal: canal || 'app',
        motif: motif || '',
        dry_run: dry_run || false,
      });

      return Response.json({
        success: result.success,
        course_before: result.course_before,
        course_after: result.course_after,
        changes: result.changes,
        errors: result.errors,
        prix_recalcule: result.prix_recalcule,
        livreur_notifie: result.livreur_notifie,
      });
    }

    if (action === 'verifier') {
      const { statut, champs } = body;
      if (!statut) {
        return Response.json({ error: 'statut requis' }, { status: 400 });
      }

      const allowed = getChampsModifiables(statut);
      const verification = champs
        ? verifierModificationsAutorisees(statut, champs)
        : { autorises: allowed, refuses: [] };

      return Response.json({
        statut,
        champs_autorises: allowed,
        champs_demandes: champs || [],
        ...verification,
      });
    }

    if (action === 'detecter_intention') {
      const { message } = body;
      if (!message) {
        return Response.json({ error: 'message requis' }, { status: 400 });
      }

      const detecte = detecterIntentionModification(message);
      return Response.json({ detecte, message });
    }

    return Response.json({ error: 'Action inconnue. Utilisez: appliquer, verifier, detecter_intention' }, { status: 400 });
  } catch (e) {
    console.error('[modifierCourseVenus] Erreur:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});