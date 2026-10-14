import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';

const TERMINAL_STATUSES = ['livree', 'annulee', 'completed', 'delivered', 'canceled'];

/**
 * getOnRouteProposalsForLivreur
 *
 * Récupère les propositions "sur trajet" pending pour un livreur donné.
 *
 * Sécurité :
 * - Authentifie le livreur côté serveur (createClientFromRequest).
 * - Retourne UNIQUEMENT les propositions du livreur authentifié.
 * - Respecte l'isolation pays et Entreprise/Public.
 * - Vérifie que les courses sont encore disponibles (non assignées, non terminales).
 * - Filtre les propositions expirées côté serveur.
 *
 * Performance :
 * - Une seule requête filter sur EcoProposal (limit 10).
 * - Batch fetch des courses liées en une seule requête ($in).
 * - Pas de boucle de requêtes individuelles.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const livreurId = body?.livreur_id;

    if (!livreurId) {
      return Response.json({ success: false, error: 'livreur_id requis' }, { status: 400 });
    }

    // ── Vérifier l'identité du livreur via le profil ──
    // createClientFromRequest authentifie avec le token utilisateur.
    // On récupère le livreur pour confirmer l'identité et obtenir user_email.
    const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
    if (!livreur) {
      return Response.json({ success: false, error: 'Livreur introuvable' }, { status: 404 });
    }

    // ── LAZY CLEANUP : Libérer les réservations sur trajet expirées ──
    // Quand un livreur interroge ses propositions, on en profite pour libérer
    // les réservations expirées de son pays. Cela garantit qu'une course
    // dont la fenêtre de 15s est expirée est libérée dès qu'un livreur
    // consulte l'app, sans attendre le workflow de 1 minute.
    // Exclusive priority is deferred: this read must not release production courses.

    // ── Récupérer les propositions pending non expirées ──
    const now = new Date().toISOString();
    const proposals = await base44.asServiceRole.entities.EcoProposal.filter({
      livreur_id: livreurId,
      status: 'pending',
      is_exclusive: { $ne: true },
      expires_at: { $gte: now },
    }, '-created_date', 10).catch(() => []);

    if (!proposals || proposals.length === 0) {
      return Response.json({ success: true, proposals: [], count: 0 });
    }

    // ── Batch fetch des courses liées ──
    const courseIds = [...new Set(proposals.map((p: any) => p.course_id).filter(Boolean))];
    if (courseIds.length === 0) {
      return Response.json({ success: true, proposals: [], count: 0 });
    }

    // Une seule requête pour toutes les courses (pas de boucle)
    const coursesPage = await base44.asServiceRole.entities.CourseExterne.filter({
      id: { $in: courseIds },
    }, '-created_date', 10).catch(() => []);

    const courseMap = new Map();
    for (const c of coursesPage || []) {
      courseMap.set(c.id, c);
    }

    // ── Enrichir les propositions avec les détails de la course ──
    // Filtrer les propositions dont la course n'est plus disponible
    const enrichedProposals = [];
    const toExpire = [];

    for (const proposal of proposals) {
      const course = courseMap.get(proposal.course_id);
      if (!course) {
        // Course supprimée → marquer la proposition comme invalidée
        toExpire.push(proposal.id);
        continue;
      }

      // Vérifier que la course est encore disponible
      const isTerminal = TERMINAL_STATUSES.includes(course.statut);
      const isAssigned = !!(course.livreur_id || course.accepted_by_livreur_id);

      if (isTerminal || isAssigned) {
        // Course déjà prise ou terminée → marquer comme invalidée
        toExpire.push(proposal.id);
        continue;
      }

      // Vérifier l'isolation pays
      if (course.country_code !== livreur.country_code) {
        toExpire.push(proposal.id);
        continue;
      }

      // Vérifier l'isolation Entreprise/Public
      const courseEnterpriseId = course.enterprise_id || null;
      const livreurEnterpriseId = livreur.enterprise_id || null;
      if (courseEnterpriseId !== livreurEnterpriseId) {
        toExpire.push(proposal.id);
        continue;
      }

      // ── [CITY DISPATCH] Vérification de compatibilité ville ──
      // Une proposition sur trajet d'une autre ville n'est pas visible
      // lorsque le filtrage par ville est activé. Défense en profondeur backend.
      try {
        const { verifyCityCompatibility } = await import('../../shared/cityDispatchFilter.ts');
        const cityCheck = await verifyCityCompatibility(base44, course, livreur);
        if (!cityCheck.compatible) {
          continue;
        }
      } catch (cityErr: any) {
        console.error('[getOnRouteProposals] city check failed:', cityErr?.message || String(cityErr));
        return Response.json({ success: false, error: 'city_configuration_unavailable' }, { status: 503 });
      }

      // Parser le route_delta_json pour le détour
      let routeDelta: any = null;
      try {
        routeDelta = proposal.route_delta_json ? JSON.parse(proposal.route_delta_json) : null;
      } catch {
        routeDelta = null;
      }

      // Calculer le temps restant avant expiration
      const expiresAt = proposal.expires_at ? new Date(proposal.expires_at) : null;
      const secondsRemaining = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : 0;

      enrichedProposals.push({
        proposal_id: proposal.id,
        course_id: course.id,
        country_code: course.country_code,
        type_course: course.type_course,
        quartier_depart: course.quartier_depart || course.adresse_depart || 'Adresse à confirmer',
        quartier_arrivee: course.quartier_arrivee || course.adresse_arrivee || 'Adresse à confirmer',
        adresse_depart: course.adresse_depart || '',
        adresse_arrivee: course.adresse_arrivee || '',
        gps_depart_lat: course.gps_depart_lat || null,
        gps_depart_lng: course.gps_depart_lng || null,
        gps_arrivee_lat: course.gps_arrivee_lat || null,
        gps_arrivee_lng: course.gps_arrivee_lng || null,
        type_colis: course.type_colis || null,
        prix: Number(course.prix_final || course.prix_propose_client || course.prix_propose_admin || course.prix_estimate || 0),
        devise: course.devise || 'FCFA',
        gain_amount: Number(proposal.gain_amount || 0),
        scenario: proposal.proposal_scenario || routeDelta?.scenario || 'on_route',
        extra_km_estimate: routeDelta?.extra_km_estimate || 0,
        destination_pickup_km: routeDelta?.destination_pickup_km || null,
        score: routeDelta?.score || 0,
        expires_at: proposal.expires_at,
        seconds_remaining: secondsRemaining,
        created_date: proposal.created_date,
      });
    }

    // ── Invalider les propositions obsolètes en arrière-plan ──
    if (toExpire.length > 0) {
      await base44.asServiceRole.entities.EcoProposal.updateMany(
        { id: { $in: toExpire }, status: 'pending' },
        { $set: { status: 'invalidated', invalidation_reason: 'course_unavailable_or_expired', responded_at: now } }
      ).catch(() => null);
    }

    // ── Trier par score décroissant, puis par temps restant croissant ──
    enrichedProposals.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.seconds_remaining - b.seconds_remaining;
    });

    return Response.json({
      success: true,
      proposals: enrichedProposals,
      count: enrichedProposals.length,
    });
  } catch (error) {
    console.error('[getOnRouteProposalsForLivreur] Fatal:', error?.message || String(error));
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});
