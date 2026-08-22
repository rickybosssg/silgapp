import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { calculerScoreLivreur } from '../../shared/silgaScoreEngine.ts';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SILGA SCORE — Backend function
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Calcule le Silga Score (0-100) pour un livreur ou pour tous les livreurs.
 * Mode observation uniquement — n'impacte pas le dispatch V2.
 * 
 * Payload:
 *   { livreur_id: string }  → calculer pour un livreur spécifique
 *   { all: true }           → calculer pour tous les livreurs validés
 *   { all: true, limit: N } → limiter le nombre de livreurs (défaut 200)
 * 
 * Le score est mis en cache sur l'entité Livreur (silga_score, 
 * silga_score_niveau, silga_score_breakdown, silga_score_calculated_at).
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Authentification requise (admin seulement) ──
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role === 'admin') isAdmin = true;
    } catch (_) {}

    if (!isAdmin) {
      return Response.json({ success: false, error: 'Accès refusé — admin uniquement' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { livreur_id, all, limit = 200 } = body || {};

    // ── Récupérer le seuil d'encours depuis Country ──
    const countries = await base44.entities.Country.list('ordre', 50);
    const seuilParPays: Record<string, number> = {};
    for (const c of countries) {
      seuilParPays[c.code] = c.seuil_encours_max || 5000;
    }

    // ── Déterminer la liste des livreurs à calculer ──
    let livreurs: any[] = [];
    if (livreur_id) {
      const livreur = await base44.entities.Livreur.get(livreur_id);
      if (!livreur) {
        return Response.json({ success: false, error: 'Livreur introuvable' });
      }
      livreurs = [livreur];
    } else if (all) {
      livreurs = await base44.entities.Livreur.filter({ validation: 'valide', actif: true }, 'nom', limit);
    } else {
      return Response.json({ success: false, error: 'Spécifier livreur_id ou all=true' });
    }

    // ── Calculer le score pour chaque livreur ──
    const results: any[] = [];

    for (const livreur of livreurs) {
      const livreurId = livreur.id;
      const countryCode = livreur.country_code || 'BF';
      const seuilEncours = seuilParPays[countryCode] || 5000;

      // Fetch DispatchNotification pour ce livreur
      const dispatchNotifs = await base44.entities.DispatchNotification.filter(
        { livreur_id: livreurId },
        '-date_notification',
        500
      );

      // Fetch AnnulationLivreur pour ce livreur
      const annulations = await base44.entities.AnnulationLivreur.filter(
        { livreur_id: livreurId },
        '-date_annulation',
        200
      );

      // Fetch CourseExterne assignées à ce livreur
      const courses = await base44.entities.CourseExterne.filter(
        { livreur_id: livreurId },
        '-created_date',
        500
      );

      // Calculer le score
      const scoreResult = calculerScoreLivreur(
        livreur,
        dispatchNotifs,
        annulations,
        courses,
        seuilEncours
      );

      // Mettre à jour le Livreur avec le score
      await base44.entities.Livreur.update(livreurId, {
        silga_score: scoreResult.score,
        silga_score_niveau: scoreResult.niveau,
        silga_score_breakdown: JSON.stringify(scoreResult.breakdown),
        silga_score_calculated_at: new Date().toISOString(),
      });

      results.push({
        livreur_id: livreurId,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
        livreur_telephone: livreur.telephone,
        country_code: countryCode,
        score: scoreResult.score,
        niveau: scoreResult.niveau,
        breakdown: scoreResult.breakdown,
        metrics: scoreResult.metrics,
      });
    }

    // ── Résumé global si all=true ──
    let summary = null;
    if (all && results.length > 0) {
      const avgScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
      const byNiveau = {
        excellent: results.filter(r => r.niveau === 'excellent').length,
        bon: results.filter(r => r.niveau === 'bon').length,
        moyen: results.filter(r => r.niveau === 'moyen').length,
        faible: results.filter(r => r.niveau === 'faible').length,
      };
      summary = {
        total_calcules: results.length,
        score_moyen: avgScore,
        repartition: byNiveau,
      };
    }

    return Response.json({
      success: true,
      results: livreur_id ? results[0] : results,
      summary,
      calculated_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[SILGA_SCORE] Erreur:', error);
    return Response.json({ success: false, error: error.message || 'Erreur lors du calcul du Silga Score' }, { status: 500 });
  }
}