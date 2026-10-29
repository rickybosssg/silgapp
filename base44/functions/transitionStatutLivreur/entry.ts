import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { updateEcoMissionRouteProgress } from '../../shared/ecoOptimizationEngine.ts';
import { resolveDeliveryGps } from '../../shared/deliveryGps.ts';
import { transitionTerminal, transitionScopeMatches, sameActiveTransition, writeOwnedTransition } from '../../shared/transitionSafety.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITION STATUT LIVREUR — Toutes les transitions de statut sans prix
// ═══════════════════════════════════════════════════════════════════════════
//
// Transitions valides (machine d'états) :
//   client_contacte      ← livreur_en_route, recherche_livreur (ADMIN ONLY)
//   en_route_expediteur  ← client_contacte, livreur_en_route
//   colis_recupere       ← en_route_expediteur, arrive_prise_en_charge, livreur_en_route
//   en_livraison         ← colis_recupere, en_route_expediteur, livreur_en_route
//   pris_en_charge       ← livreur_en_route, en_route_expediteur (déplacement)
//   arrivee              ← pris_en_charge, en_livraison
//
// Sécurité :
//   - Valide l'identité du livreur (user.email → Livreur.user_email)
//   - Valide que le livreur est assigné à la course
//   - Strip TOUS les champs sensibles (prix, commission, livreur_id, etc.)
//   - Idempotent : si déjà au statut cible → success sans réécriture
// ═══════════════════════════════════════════════════════════════════════════

const TRANSITIONS_VALIDES: Record<string, string[]> = {
  'client_contacte': ['livreur_en_route', 'recherche_livreur'],
  'en_route_expediteur': ['client_contacte', 'livreur_en_route'],
  // [FIX 400] 'client_contacte' ajouté : le livreur peut récupérer le colis directement après avoir
  // contacté le client, sans attendre l'étape intermédiaire 'en_route_expediteur'. Corrige la
  // race condition où le clic « Colis récupéré » arrive avant la fin de la transition précédente.
  'colis_recupere': ['en_route_expediteur', 'arrive_prise_en_charge', 'livreur_en_route', 'client_contacte'],
  'en_livraison': ['colis_recupere', 'en_route_expediteur', 'livreur_en_route'],
  'pris_en_charge': ['livreur_en_route', 'en_route_expediteur'],
  'arrivee': ['pris_en_charge', 'en_livraison'],
};

const GPS_FIELDS_PAR_STATUT: Record<string, string[]> = {
  'colis_recupere': ['latitude_recuperation', 'longitude_recuperation'],
  'pris_en_charge': ['latitude_prise_en_charge', 'longitude_prise_en_charge'],
  'arrivee': ['latitude_arrivee_dest', 'longitude_arrivee_dest'],
};

// Champs sensibles JAMAIS acceptés du frontend
const FORBIDDEN_FIELDS = [
  'prix_final', 'commission_silga', 'montant_livreur', 'livreur_id',
  'livreur_nom', 'livreur_photo_url', 'livreur_telephone', 'livreur_vehicule',
  'livreur_note_moyenne', 'livreur_nombre_avis',
  'dispatch_status', 'dispatch_wave', 'dispatch_wave_notified_ids',
  'dispatch_notified_ids', 'dispatch_refused_ids', 'dispatch_locked_until',
  'dispatch_cycle_count', 'dispatch_v2_secours_phase',
  'client_user_email', 'livreur_user_email',
  'statut_paiement_livreur', 'encours_comptabilise_at', 'encours_comptabilise_montant',
  'crm_stats_synced', 'manual_price', 'manual_price_status', 'proposed_by_livreur_id',
  'client_price_validated_at', 'client_price_refused_at', 'pricing_mode',
  'tracking_token', 'tracking_link', 'tracking_shared_at', 'tracking_opened_count',
  'pickup_qr_token', 'pickup_code_4_digits', 'delivery_qr_token', 'delivery_code_4_digits',
  // [FIX] pickup_confirmed_by retiré de FORBIDDEN_FIELDS : la fonction le définit elle-même
  // de manière sécurisée (basée sur confirmation_method). Il ne vient jamais du frontend.
  // Avant, il était strippé → jamais sauvegardé en base.
  'heure_acceptation', 'source', 'country_code', 'type_course', 'is_multi_colis',
  'nb_colis', 'nb_colis_livres', 'nb_colis_annules',
];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'Non autorisé', transition_contract: 'transition-terminal-scope-v1' }, { status: 401 });

    const body = await req.json();
    const { course_id, statut_cible, latitude, longitude, remarque, confirmation_method } = body;

    if (!course_id || !statut_cible) {
      return Response.json({ error: 'course_id et statut_cible requis' }, { status: 400 });
    }

    // Valider statut_cible
    if (!TRANSITIONS_VALIDES[statut_cible]) {
      return Response.json({ error: `Statut cible invalide: ${statut_cible}` }, { status: 400 });
    }

    // Récupérer la course
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    // Vérifier que la course n'est pas terminée
    if (transitionTerminal(course)) {
      return Response.json({ error: 'Course terminée ou annulée' }, { status: 400 });
    }

    // Valider la transition
    const statutsSources = TRANSITIONS_VALIDES[statut_cible];
    if (course.statut !== statut_cible && !statutsSources.includes(course.statut)) {
      return Response.json({
        error: `Transition invalide: ${course.statut} → ${statut_cible}`,
        statut_actuel: course.statut,
        statut_cible,
      }, { status: 400 });
    }

    // A parcel cannot start delivery before its recorded pickup. No backfill.
    if (statut_cible === 'en_livraison' && ['expedier', 'recevoir'].includes(course.type_course) &&
        ['en_route_expediteur', 'livreur_en_route'].includes(course.statut) &&
        ![course.heure_recuperation, course.pickup_confirmed_at].some(value => value && Number.isFinite(Date.parse(value)))) {
      return Response.json({ success: false, error: 'Confirmez la récupération avant de démarrer la livraison.', transition_contract: 'transition-pickup-order-v1' }, { status: 409 });
    }

    // Vérifier l'identité du livreur
    if (!course.livreur_id) {
      return Response.json({ error: 'Aucun livreur assigné à cette course' }, { status: 403 });
    }
    const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
    if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
    if (!transitionScopeMatches(user, course, livreur)) return Response.json({ error: 'Course hors de votre pays ou entreprise' }, { status: 403 });
    if (String(livreur.user_email || '').trim().toLowerCase() !== String(user.email).trim().toLowerCase()) {
      // ── Fallback : auto-liaison si email correspond mais user_email est null/différent ──
      // Corrige le bug où un livreur créé par admin sans user_email peut accepter des courses
      // mais pas les terminer (accepterCourseV2 ne vérifie pas user_email).
      const livreurEmailNorm = (livreur.email || '').trim().toLowerCase();
      const userEmailNorm = (user.email || '').trim().toLowerCase();
      if (!livreur.user_email && livreurEmailNorm && livreurEmailNorm === userEmailNorm) {
        await base44.asServiceRole.entities.Livreur.updateMany({ id: course.livreur_id, user_email: { $in: [null, ''] }, country_code: livreur.country_code, enterprise_id: livreur.enterprise_id || { $in: [null, ''] } }, { $set: { user_email: user.email } }).catch(() => {});
        const livreurRelu = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
        if (!livreurRelu || livreurRelu.user_email !== user.email || !transitionScopeMatches(user, course, livreurRelu)) {
          return Response.json({ error: 'Vous n\'êtes pas le livreur assigné à cette course' }, { status: 403 });
        }
      } else {
        return Response.json({ error: 'Vous n\'êtes pas le livreur assigné à cette course' }, { status: 403 });
      }
    }

    if (course.eco_mission_id) {
      const mission = await base44.asServiceRole.entities.EcoMission.get(course.eco_mission_id).catch(() => null);
      if (!mission || !['accepted', 'in_progress'].includes(mission.status)) {
        return Response.json({ error: 'Attribution de la mission en cours de vérification. Réessayez après actualisation.' }, { status: 409 });
      }
    }


    // Idempotence : si déjà au statut cible, retourner success
    if (course.statut === statut_cible) {
      const current = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!sameActiveTransition(current, course, statut_cible)) return Response.json({ error: 'Course modifiée ou annulée. Actualisez.' }, { status: 409 });
      if (course.eco_mission_id) await updateEcoMissionRouteProgress(base44, course_id).catch(() => null);
      return Response.json({ success: true, skipped: 'already_at_target', course_id, statut: statut_cible });
    }

    // [FIX 2026-10-27] client_contacte autorisé pour les courses colis clientes (expedier/recevoir),
    // pas seulement les courses admin. L'APK utilise ce parcours pour les colis clients :
    // contact WhatsApp → trajet vers l'expéditeur → colis récupéré → livraison.
    // La restriction reste pour les courses de déplacement (passagers) où cette étape n'existe pas.
    if (statut_cible === 'client_contacte' && course.source !== 'admin' && course.pricing_mode !== 'admin_manuel') {
      if (course.type_course === 'deplacement') {
        return Response.json({ error: 'L\'étape "Client contacté" est réservée aux courses de colis' }, { status: 400 });
      }
    }

    // Construire l'update
    const now = new Date().toISOString();
    const updateData: any = { statut: statut_cible };

    // Champs heure selon le statut
    if (statut_cible === 'client_contacte') updateData.heure_contact_client = now;
    if (statut_cible === 'colis_recupere') {
      updateData.heure_recuperation = now;
      // Correction 1: accepter confirmation_method='bouton' pour le nouveau parcours.
      // Pour l'ancien parcours (QR/PIN via validateQRCode), pickup_confirmed_by = method ('qr'|'manual_code').
      // [FIX] Valeur 'bouton' par défaut (au lieu de 'livreur' qui n'est pas dans l'enum).
      // Enum valide : ["qr", "manual_code", "admin", "bouton"]
      updateData.pickup_confirmed_by = confirmation_method === 'bouton' ? 'bouton' : 'bouton';
      updateData.pickup_confirmed_at = now;
    }
    if (statut_cible === 'pris_en_charge') updateData.heure_prise_en_charge = now;
    if (statut_cible === 'arrivee') updateData.heure_arrivee = now;

    // Champs GPS (uniquement si fournis et valides)
    const gpsFields = GPS_FIELDS_PAR_STATUT[statut_cible];
    if (gpsFields) {
      const { gps, reason } = resolveDeliveryGps(body, livreur);
      if (gps) {
        updateData[gpsFields[0]] = gps.latitude;
        updateData[gpsFields[1]] = gps.longitude;
      } else {
        console.info('[delivery_gps_missing]', JSON.stringify({ course_id, step: statut_cible, reason }));
      }
    }

    // Remarque livreur (champ sûr)
    if (remarque != null && typeof remarque === 'string' && remarque.trim().length > 0) {
      updateData.remarque_livreur = remarque.trim();
    }

    // Strip forbidden fields (sécurité: ne jamais accepter du frontend)
    for (const f of FORBIDDEN_FIELDS) {
      delete updateData[f];
    }

    const outcome = await writeOwnedTransition(base44, course, updateData);
    if (!outcome) return Response.json({ success: false, error: 'Course modifiée ou annulée. Actualisez.', transition_contract: 'transition-terminal-scope-v1' }, { status: 409 });
    const ecoProgress = course.eco_mission_id ? await updateEcoMissionRouteProgress(base44, course_id).catch(() => ({ updated: false, reason: 'progress_sync_failed' })) : undefined;
    return Response.json({ success: true, course: outcome.course, statut: outcome.course.statut, eco_progress: ecoProgress, ...(outcome.skipped ? { skipped: 'already_at_target' } : {}), transition_contract: 'transition-terminal-scope-v1' });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Transition impossible' }, { status: 500 });
  }
}
