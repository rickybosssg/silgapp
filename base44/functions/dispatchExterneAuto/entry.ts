import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { notifierRedispatchClient } from '../../shared/venusRedispatchNotifier.ts';
import { STATUTS_ACTIFS_COURSE, STATUTS_ACTIFS_VERIF, normalizeCommissionPct, chargerConfigPays } from '../../shared/dispatchConstants.ts';
import { verifierPaysCourseLivreur, reponseDejaPrise, generateToken, generatePIN, supprimerNotificationsCourse, journaliserDispatch } from '../../shared/dispatchUtils.ts';
import { chargerConfigDispatch, chargerConfigVaguesGPS, CYCLE_EPUISE_TIMEOUT_MS } from '../../shared/dispatchConfig.ts';
import { lancerDispatchMulti } from '../../shared/dispatchEngine.ts';

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { action, course_id, livreur_id, raison } = body;

    // Déclenchement depuis automation entity
    if (!action && body.event?.entity_id) {
      action = 'lancer_recherche_auto';
      course_id = body.event.entity_id;
    }

    // Déclenchement depuis automation scheduled (tick) — sans action = avancer les vagues
    if (!action) {
      action = 'avancer_vagues_expirees';
    }

    // ─── 1. Lancer la recherche automatique (multi-livreurs) ──────────────
    if (action === 'lancer_recherche_auto') {
      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

      // 🔄 RETRY — l'automation entity peut se déclencher avant que la course soit
      // totalement disponible en base (cohérence à terme). On retente 3 fois avec 2s de délai.
      // Si le GET échoue, on utilise body.data (les données de l'événement entity) comme fallback.
      let course;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
          if (course) break;
        } catch (e) {
          console.warn(`[DISPATCH] ⚠️ Course ${course_id} tentative ${attempt}/3 échouée: ${e.message}`);
        }
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
      }
      // 🛡️ FALLBACK body.data — l'automatisation entity envoie les données de la course
      // dans le payload. Si le GET échoue (cohérence à terme), on utilise ces données
      // pour démarrer le dispatch immédiatement sans attendre le tick programmé.
      if (!course && body.data) {
        console.log(`[DISPATCH] 🛡️ Course ${course_id} introuvable via GET — utilisation de body.data (entity event)`);
        course = body.data;
        course.id = course_id;
      }
      if (!course) {
        console.warn(`[DISPATCH] ⚠️ Course ${course_id} introuvable après 3 tentatives et pas de body.data — ignorée`);
        return Response.json({ success: true, ignore: true, message: 'Course supprimée — ignorée' });
      }

      if (!course.country_code) {
        console.error(`[DISPATCH] ❌ Course ${course_id} sans country_code — alerte admin`);
        base44.asServiceRole.entities.Notification.create({
          titre: '🚨 Course sans pays',
          message: `Course ${course_id} (${course.adresse_depart || '?'}) n'a pas de country_code. Dispatch impossible.`,
          type: 'alerte_critique_dispatch', course_id, lue: false,
        }).catch(() => {});
        return Response.json({ success: false, error: 'Course sans country_code — dispatch impossible' }, { status: 400 });
      }

      if (!course.gps_depart_lat || !course.gps_depart_lng) {
        console.warn(`[DISPATCH] ⚠️ Course ${course_id} sans GPS`);
      }

      const result = await lancerDispatchMulti(base44, course_id, []);
      if (result.erreur) return Response.json({ error: result.erreur }, { status: 404 });
      if (result.ignore) return Response.json({ success: true, message: `Dispatch ignoré: ${result.statut}` });
      if (result.locked) return Response.json({ success: true, locked: true, message: 'Course verrouillée par un autre tick' });
      if (result.noLivreur) return Response.json({ success: false, noLivreur: true });
      if (result.en_attente) return Response.json({ success: true, en_attente: true });
      if (result.cycleEpuise) return Response.json({ success: true, cycle_epuise: true });

      return Response.json({
        success: true,
        nb_notifies: result.nb_notifies,
        total_notifies: result.total_notifies,
        livreurs: result.livreurs,
        timeout_sec: result.timeout_sec,
      });
    }

    // ─── 2. Vérifier si un livreur est dans la liste notifiée ─────────────
    if (action === 'check_course_pour_livreur') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ found: false });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'check_course_pour_livreur');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      // 🚫 Vérifier blocage encours du livreur
    if (countryGuard.ok && countryGuard.livreur?.bloque_encours) {
      return Response.json({ 
        found: false, bloque_encours: true,
        error: 'Votre plafond d\'encours SILGAPP a été atteint.',
      });
    }

    if (course.statut === 'annulee' || course.statut === 'livree') {
        try {
          const livreurData = countryGuard.livreur;
          if (livreurData?.user_email) {
            const notifs = await base44.asServiceRole.entities.Notification.filter({
              course_id: course_id, destinataire_email: livreurData.user_email, type: 'nouvelle_course', lue: false,
            });
            for (const n of notifs) { await base44.asServiceRole.entities.Notification.update(n.id, { lue: true }); }
          }
        } catch (_) {}
        return Response.json({ found: false, cancelled: true });
      }

      if (course.dispatch_status === 'accepte') {
        // 🔧 CORRECTION : distinguer "j'ai accepté" vs "un autre a accepté"
        if (String(course.livreur_id) === String(livreur_id) || String(course.accepted_by_livreur_id) === String(livreur_id)) {
          return Response.json({ found: false, you_accepted: true, taken_by: course.livreur_id });
        }
        return Response.json({ found: false, already_taken: true, taken_by: course.livreur_id });
      }

      let notifiedIds = [];
      try { notifiedIds = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
      const isNotified = notifiedIds.includes(livreur_id);
      if (!isNotified) return Response.json({ found: false });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());
      return Response.json({ found: true, course, expired, timeout_expires_at: course.timeout_expires_at });
    }

    // ─── 3. Accepter une course — VERROU ATOMIQUE ─────────────────────────
    if (action === 'accepter_course') {
      const { pricing_mode, manual_price, override_pricing_mode } = body;

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'accepter_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });
      const livreur = countryGuard.livreur;

      // 🚫 Vérifier blocage encours
      if (livreur.bloque_encours) {
        return Response.json({ 
          success: false, accepted: false, reason: 'bloque_encours',
          error: 'Votre plafond d\'encours SILGAPP a été atteint. Veuillez effectuer votre dépôt auprès de SILGAPP afin de réactiver votre compte.',
        });
      }

      // 🛡️ Vérification anti-courses multiples : le livreur ne peut pas accepter
      // une nouvelle course s'il en a déjà une active en cours.
      const coursesActivesLivreur = await base44.asServiceRole.entities.CourseExterne.filter({
        livreur_id: livreur_id,
      }, '-created_date', 20);
      const courseActiveExistante = coursesActivesLivreur.find(c =>
        STATUTS_ACTIFS_COURSE.includes(c.statut) && c.id !== course_id
      );
      if (courseActiveExistante) {
        console.warn(`[DISPATCH] 🚫 Livreur ${livreur_id} a déjà la course ${courseActiveExistante.id} active (${courseActiveExistante.statut}) — acceptation refusée`);
        return Response.json({
          success: false, accepted: false, reason: 'deja_en_course',
          error: 'Vous avez déjà une course en cours. Terminez-la avant d\'en accepter une nouvelle.',
          course_active_id: courseActiveExistante.id,
          course_active_statut: courseActiveExistante.statut,
        });
      }

      console.log('[DISPATCH][ACCEPT_ATTEMPT]', {
        course_id, livreur_id, course_status: course.statut || '',
        dispatch_status: course.dispatch_status || '',
        existing_livreur_id: course.livreur_id || '',
        accepted_by_livreur_id: course.accepted_by_livreur_id || '',
      });

      if (course.dispatch_status === 'accepte' || course.dispatch_status === 'accepted') {
        return Response.json(reponseDejaPrise('dispatch_already_accepted', course));
      }

      if (course.livreur_id || course.accepted_by_livreur_id) {
        return Response.json(reponseDejaPrise('livreur_lock_already_set', course));
      }

      if (course.dispatch_status !== 'propose') {
        return Response.json({
          success: false, accepted: false, reason: 'not_available',
          error: "Cette course n'est plus disponible", dispatch_status: course.dispatch_status || '',
        });
      }

      let notifiedIds = [];
      try { notifiedIds = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
      const isEligible = notifiedIds.includes(livreur_id) || course.livreur_id === livreur_id;
      if (!isEligible) {
        return Response.json({ success: false, error: 'Vous n\'êtes pas éligible pour cette course', not_eligible: true });
      }

      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        return Response.json({ success: false, error: 'Course expirée', expired: true });
      }

      // Prix minimum dynamique selon le pays
      let PRIX_MIN = 1000; // default FCFA
      try {
        const countryConfig = await chargerConfigPays(base44, course.country_code);
        if (countryConfig?.prix_minimum) {
          PRIX_MIN = countryConfig.prix_minimum;
        }
      } catch (_) { /* fallback 1000 FCFA */ }
      const deviseMin = course.devise || 'FCFA';

      if (pricing_mode === 'manual') {
        const montant = Number(manual_price);
        if (!montant || montant < PRIX_MIN) {
          return Response.json({ success: false, error: `Prix minimum : ${PRIX_MIN} ${deviseMin}` }, { status: 400 });
        }
      }

      const isManual = pricing_mode === 'manual' && manual_price >= PRIX_MIN;

      // Délai de grâce anti-race
      await new Promise(resolve => setTimeout(resolve, 200));

      // Double-check locking
      const courseFinal = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      console.log('[DISPATCH][ACCEPT_FINAL_CHECK]', {
        course_id, livreur_id,
        course_status: courseFinal.statut || '',
        dispatch_status: courseFinal.dispatch_status || '',
        existing_livreur_id: courseFinal.livreur_id || '',
        accepted_by_livreur_id: courseFinal.accepted_by_livreur_id || '',
      });
      
      // 🔧 CORRECTION : si le verrou est déjà posé mais par CE MÊME livreur → succès (requête concurrente du même client)
      const dejaVerrouilleParMoi = 
        (courseFinal.livreur_id && String(courseFinal.livreur_id) === String(livreur_id)) ||
        (courseFinal.accepted_by_livreur_id && String(courseFinal.accepted_by_livreur_id) === String(livreur_id));
      
      if (dejaVerrouilleParMoi) {
        console.log(`[DISPATCH] 🔒 Course ${course_id} déjà verrouillée par le même livreur ${livreur_id} — succès confirmé`);
        return Response.json({ 
          success: true, accepted: true, course_id, livreur_id,
          already_accepted: true,
        });
      }
      
      if (courseFinal.dispatch_status !== 'propose' || courseFinal.livreur_id || courseFinal.accepted_by_livreur_id) {
        return Response.json(reponseDejaPrise('final_check_already_taken', courseFinal));
      }

      // 🔐 Préserver les tokens/PINs existants — ne JAMAIS les regénérer
      // (générés une fois à la création de la course pour garantir l'unicité partout)
      const pickupToken = course.pickup_qr_token || generateToken();
      const deliveryToken = course.delivery_qr_token || generateToken();
      const pickupPIN = course.pickup_code_4_digits || generatePIN();
      const deliveryPIN = course.delivery_code_4_digits || generatePIN();
      const tokensOntEteGeneres = !!(course.pickup_qr_token && course.pickup_code_4_digits);
      if (!tokensOntEteGeneres) {
        console.log(`[DISPATCH] 🔐 Génération nouveaux tokens/PINs pour course ${course_id} (absents à la création)`);
      } else {
        console.log(`[DISPATCH] 🔒 Conservation tokens/PINs existants pour course ${course_id}`);
      }

      const updateData = {
        dispatch_status: isManual ? 'propose' : 'accepte',
        statut: isManual ? 'recherche_livreur' : 'livreur_en_route',
        heure_acceptation: isManual ? null : new Date().toISOString(),
        ...(override_pricing_mode === 'automatic' ? { pricing_mode: 'automatic' } : {}),
        livreur_id: livreur_id,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
        livreur_photo_url: livreur.photo_url || '',
        livreur_telephone: livreur.telephone,
        livreur_vehicule: livreur.vehicule || livreur.type_vehicule || 'moto',
        livreur_note_moyenne: livreur.note_moyenne || 0,
        livreur_nombre_avis: livreur.nombre_avis || 0,
        accepted_by_livreur_id: livreur_id,
        accepted_at: isManual ? null : new Date().toISOString(),
        pickup_qr_token: pickupToken,
        pickup_code_4_digits: pickupPIN,
        delivery_qr_token: deliveryToken,
        delivery_code_4_digits: deliveryPIN,
      };

      if (isManual) {
        updateData.pricing_mode = 'manual';
        updateData.manual_price = Number(manual_price);
        updateData.manual_price_status = 'pending_client_validation';
        updateData.proposed_by_livreur_id = livreur_id;
        updateData.timeout_expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      }

      // 🔐 MISE À JOUR ATOMIQUE CONDITIONNELLE — empêche la course condition (race condition)
      // où deux livreurs passent le double-check simultanément. Le updateMany ne modifie
      // la course QUE si dispatch_status est toujours 'propose' ET livreur_id toujours vide.
      // Si un autre livreur a déjà verrouillé la course, 0 enregistrement sera modifié.
      await base44.asServiceRole.entities.CourseExterne.updateMany(
        { id: course_id, dispatch_status: 'propose', livreur_id: '' },
        { $set: updateData }
      );

      // ✅ Vérification post-update : confirmer que CE livreur détient bien le verrou
      const courseVerifie = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      const isMyCourse = String(courseVerifie.livreur_id) === String(livreur_id) ||
                         String(courseVerifie.accepted_by_livreur_id) === String(livreur_id);
      if (!isMyCourse) {
        console.warn(`[DISPATCH] 🏁 Race condition perdue — livreur ${livreur_id} n'a pas obtenu la course ${course_id} (attribuée à ${courseVerifie.livreur_id || courseVerifie.accepted_by_livreur_id || '?'})`);
        return Response.json(reponseDejaPrise('race_condition_lost', courseVerifie));
      }

      if (!isManual) {
        await base44.asServiceRole.entities.Livreur.update(livreur_id, { statut: 'en_course' });
        await supprimerNotificationsCourse(base44, course_id);
        console.log(`[DISPATCH] 🎉 Course ${course_id} verrouillée (auto) par ${livreur_id}`);

        // ── Message automatique : Code de récupération pour courses admin ET VENUS ──
        // Envoie le code de récupération (pickup_code_4_digits) dans la messagerie
        // interne de la course, visible par le livreur assigné et l'admin.
        // Concerné : courses admin (source='admin') et courses créées par VENUS
        // (created_by_venus=true). Clé idempotente par (course_id, livreur_id) pour
        // éviter les doublons et permettre un nouveau message si réassignation.
        if ((course.source === 'admin' || course.created_by_venus === true) && pickupPIN) {
          const idempotencyKey = `pickup-code-${course_id}-${livreur_id}`;
          try {
            const existing = await base44.asServiceRole.entities.Message.filter({
              client_message_id: idempotencyKey,
            });
            if (!existing || existing.length === 0) {
              await base44.asServiceRole.entities.Message.create({
                course_id: course_id,
                sender_type: 'admin',
                sender_id: 'silgapp_system',
                sender_name: 'SILGAPP',
                message_type: 'text',
                content: `🔑 Code de récupération : ${pickupPIN}\n\nUtiliser ce code pour récupérer le Colis`,
                source: 'app',
                client_message_id: idempotencyKey,
              });
              console.log(`[DISPATCH] 🔑 Message code de récupération créé pour course admin ${course_id} (livreur ${livreur_id})`);
            }
          } catch (err) {
            console.error(`[DISPATCH] ⚠️ Erreur création message code récupération:`, err?.message || String(err));
          }
        }

        // ── Phase 9 + QR/PIN : Suivi WhatsApp automatique avec QR Code et Code PIN ──
        // Détecter si c'est une réaffectation (livreur précédent a annulé)
        const isRedispatch = !!(course.dispatch_refused_ids && course.dispatch_refused_ids !== '[]')
          || (course.notes || '').includes('ANNULÉ');
        base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
          course_id: course_id,
          evenement: 'livreur_assigne',
          is_redispatch: isRedispatch,
        }).catch(err => console.error('[DISPATCH] ❌ Suivi WhatsApp:', err.message));

        // 📝 Journaliser l'acceptation avec le temps de réponse
        let tempsAcceptationSec = null;
        if (course.heure_sollicitation) {
          tempsAcceptationSec = Math.round((Date.now() - new Date(course.heure_sollicitation).getTime()) / 1000);
        }
        journaliserDispatch(base44, {
          course_id, country_code: course.country_code,
          vague: course.dispatch_wave || 1,
          evenement: 'acceptation',
          livreur_acceptant_id: livreur_id,
          livreur_acceptant_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
          temps_avant_acceptation_sec: tempsAcceptationSec,
        });

        return Response.json({ success: true, accepted: true, course_id, livreur_id });
      }

      // Mode manuel : notifier le client
      try {
        let clientEmail = null;
        let clientIdForPush = course.expediteur_client_id || null;
        if (course.created_by_id) {
          try { const creator = await base44.asServiceRole.entities.User.get(course.created_by_id); clientEmail = creator?.email || null; } catch (_) {}
        }
        if (!clientEmail && course.expediteur_client_id) {
          const dest = await base44.asServiceRole.entities.ClientExterne.filter({ id: course.expediteur_client_id });
          clientEmail = dest?.[0]?.user_email || null;
        }
        if (clientEmail) {
          const prixMessage = `${livreur.prenom || ''} ${livreur.nom} propose cette course à ${Number(manual_price).toLocaleString()} ${course.devise || 'FCFA'}. Acceptez-vous ?`;
          // 📤 Push notification — le client n'est pas forcément dans l'app
          // On n'appelle QUE envoiNotificationPush (qui crée déjà la notif en BDD + envoie le push FCM)
          try {
            await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
              destinataire_email: clientEmail,
              client_id: clientIdForPush,
              titre: '💰 Prix proposé par le livreur',
              message: prixMessage,
              type: 'prix_manuel_propose',
              course_id: course_id,
              user_type: 'client',
            });
          } catch (e) { console.error('[DISPATCH] ❌ Push client prix manuel:', e.message); }
        }
      } catch (e) { console.warn('[DISPATCH] Erreur notif client prix manuel:', e.message); }

      // 📤 Envoyer le prix proposé au client via WhatsApp
      base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
       course_id: course_id,
       evenement: 'prix_manuel_propose',
       manual_price: Number(manual_price),
      }).catch(err => console.error('[DISPATCH] ❌ Suivi WhatsApp prix manuel:', err.message));

      return Response.json({ success: true, accepted: true, pending_client_validation: true, course_id, livreur_id });
    }

    // ─── 4. Refuser une course ─────────────────────────────────────────────
    if (action === 'refuser_course') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'refuser_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: true, message: 'Course déjà prise par un autre' });
      }

      // 🚫 Ajouter le livreur aux refusés définitifs (exclusion permanente, survit au reset de cycle)
      let dejaRefuses = [];
      try { dejaRefuses = JSON.parse(course.dispatch_refused_ids || '[]'); } catch {}
      if (!dejaRefuses.includes(livreur_id)) {
        dejaRefuses.push(livreur_id);
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_refused_ids: JSON.stringify(dejaRefuses),
        });
        console.log(`[DISPATCH] 🚫 Livreur ${livreur_id} ajouté aux refusés définitifs — course ${course_id}`);
      }

      // 🧹 Marquer les notifications "nouvelle_course" comme lues pour ce livreur (bulk)
      try {
        const livreurData = await base44.asServiceRole.entities.Livreur.get(livreur_id);
        if (livreurData?.user_email) {
          await base44.asServiceRole.entities.Notification.updateMany(
            { course_id: course_id, destinataire_email: livreurData.user_email, type: 'nouvelle_course', lue: false },
            { $set: { lue: true } }
          );
        }
      } catch (e) { console.warn('[DISPATCH] Erreur archivage notifs refus:', e.message); }

      const etaitVerrouillee = course.livreur_id === livreur_id;
      if (etaitVerrouillee) {
        // Libérer le verrou + remettre le statut en recherche (sinon reste bloqué à livreur_en_route)
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          statut: 'recherche_livreur',
          dispatch_status: 'redispatch',
          remarque_livreur: raison || 'Refusé',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
          heure_acceptation: null,
          accepted_by_livreur_id: '',
          accepted_at: null,
        });
        const result = await lancerDispatchMulti(base44, course_id, []);
        if (result.noLivreur) return Response.json({ success: true, noLivreur: true });
        if (result.cycleEpuise) return Response.json({ success: true, cycle_epuise: true });
        return Response.json({ success: true, nb_notifies: result.nb_notifies });
      }

      return Response.json({ success: true, exclu_definitif: true });
    }

    // ─── 5. Vérifier expiration & redispatch (avec exclusions cumulées) ──
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      // Expiration du verrou actif
      if (expired && course.dispatch_status === 'propose' && course.livreur_id) {
        console.log(`[DISPATCH] ⏰ Verrou expiré course ${course_id} — redispatch`);

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          statut: 'recherche_livreur',
          dispatch_status: 'redispatch',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
          heure_acceptation: null,
          accepted_by_livreur_id: '',
          accepted_at: null,
        });

        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ expired: true, redispatched: !result.noLivreur, nb_restants: result.total_notifies });
      }

      // Expiration vague multi (sans verrou)
      if (expired && course.dispatch_status === 'propose' && !course.livreur_id) {
        const currentWave = course.dispatch_wave || 0;
        if (currentWave > 0) {
          const gpsCfg = await chargerConfigVaguesGPS(base44);
          const maxWave = gpsCfg.waves.length;

          const nextWave = currentWave + 1;

          if (nextWave > maxWave) {
            console.log(`[DISPATCH] 📍 GPS vague ${currentWave} expirée (max: ${maxWave}) — cycle_epuise pour course ${course_id}`);
            const cycleEpuiseDeadline = new Date(Date.now() + CYCLE_EPUISE_TIMEOUT_MS).toISOString();
            await base44.asServiceRole.entities.CourseExterne.update(course_id, {
              dispatch_status: 'cycle_epuise',
              dispatch_wave: maxWave,
              timeout_expires_at: cycleEpuiseDeadline,
            });
            // ── Notifier VENUS WhatsApp au client ──
            const messageVenus = `📍 Nous avons sollicité tous les livreurs disponibles autour de vous, mais aucun n'a accepté votre course pour le moment.\n\nVoulez-vous que je relance la recherche ?\n\nRépondez 'oui' pour relancer ou 'non' pour annuler.`;
            const notifie = await notifierRedispatchClient({
              base44,
              course,
              messageVenus,
              motif: 'cycle_epuise',
            });
            return Response.json({ expired: true, wave_epuise: true, venus_notifie: notifie });
          }
          console.log(`[DISPATCH] 📍 GPS avancement vague ${currentWave} → ${nextWave} pour course ${course_id}`);
          await base44.asServiceRole.entities.CourseExterne.update(course_id, {
            dispatch_status: 'redispatch',
            dispatch_wave: nextWave,
          });
        } else {
          console.log(`[DISPATCH] ⏰ Vague expirée course ${course_id} — nouvelle sélection`);
          await base44.asServiceRole.entities.CourseExterne.update(course_id, { dispatch_status: 'redispatch' });
        }

        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ expired: true, redispatched: !result.noLivreur });
      }

      return Response.json({ expired, dispatch_status: course.dispatch_status, livreur_id: course.livreur_id });
    }

    // ─── 6. Avancer les vagues expirées (N1→N2→N3→cycle_epuise→N1) ──
    if (action === 'avancer_vagues_expirees') {
      const { country_code: filterCountry } = body;
      const filter = { statut: 'recherche_livreur' };
      if (filterCountry) filter.country_code = filterCountry;

      const coursesRecherche = await base44.asServiceRole.entities.CourseExterne.filter(filter, '-created_date', 200);

      // ── Courses "nouvelle" avec dispatch en attente (créées par Venus/WhatsApp ou app client) ──
      // Elles doivent être prises en charge par le moteur de dispatch automatique
      const filterNouvelles = { statut: 'nouvelle' };
      if (filterCountry) filterNouvelles.country_code = filterCountry;
      const coursesNouvelles = await base44.asServiceRole.entities.CourseExterne.filter(filterNouvelles, '-created_date', 200);

      const seenIds = new Set();
      const courses = [...coursesRecherche, ...coursesNouvelles].filter(c => {
        if (seenIds.has(c.id)) return false;
        seenIds.add(c.id);
        return true;
      });
      const now = new Date();
      const resultats = [];

      const MAX_COURSES_PER_TICK = 25; // Limite anti-rate-limit (augmenté pour couvrir plus de courses)
      // 🎯 PHASE 8 — Tri par priorité : urgente > haute > normal
      // Les courses prioritaires sont traitées en premier à chaque tick
      const PRIORITY_ORDER = { urgente: 0, haute: 1, normal: 2 };
      const sortByPriority = (a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 2;
        const pb = PRIORITY_ORDER[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        // ✅ Prioriser les courses ANCIENNES en premier (plus longtemps bloquées)
        // Une course ancienne bloquée ne doit jamais être repoussée par les nouvelles
        return new Date(a.created_date).getTime() - new Date(b.created_date).getTime();
      };
      // Prioriser les courses VRAIMENT bloquées (en_attente/redispatch/cycle_epuise)
      // ET les courses "propose" avec timeout expiré (besoin d'avancement de vague immédiat)
      const isStuck = (c) => {
        // ✅ cycle_epuise EXCLU du comptage : ces courses attendent la réponse client
        // et ne doivent pas occuper les slots de traitement au détriment des autres courses
        if (['en_attente', 'redispatch'].includes(c.dispatch_status)) return true;
        // ✅ Course en 'propose' = bloquée si timeout expiré OU timeout manquant (corrompu)
        if (c.dispatch_status === 'propose') {
          if (!c.timeout_expires_at) return true;
          if (new Date(c.timeout_expires_at) < now) return true;
        }
        return false;
      };
      const stuck = courses.filter(isStuck).sort(sortByPriority);
      const waiting = courses.filter(c => !isStuck(c) && c.dispatch_status !== 'cycle_epuise').sort(sortByPriority);
      const coursesToProcess = [...stuck, ...waiting].slice(0, MAX_COURSES_PER_TICK);
      // ✅ cycle_epuise : traitées SANS compter dans MAX_COURSES_PER_TICK
      // (vérification auto-annulation 15min uniquement, ne bloque pas les autres courses)
      const cycleEpuiseCourses = courses.filter(c => c.dispatch_status === 'cycle_epuise');
      const allToProcess = [...coursesToProcess, ...cycleEpuiseCourses];
      // 📝 JOURNAL DE SÉLECTION — aucune course ne disparaît silencieusement
      // Enregistre combien de courses ont été détectées, retenues, ignorées et pourquoi
      const processedIds = new Set(allToProcess.map(c => c.id));
      const ignoredCourses = courses.filter(c => !processedIds.has(c.id));
      console.log(`[DISPATCH] 📋 SÉLECTION: ${courses.length} détectées | ${allToProcess.length} retenues | ${ignoredCourses.length} ignorées`);
      if (ignoredCourses.length > 0) {
        console.log(`[DISPATCH] 📋 Ignorées:`, ignoredCourses.map(c => ({
          id: c.id?.slice(-8), statut: c.statut, dispatch: c.dispatch_status,
          raison: !isStuck(c) ? 'non_bloquée' : 'limite_max_25',
        })));
      }

      // 📦 Cache config — déjà mis en cache au niveau module (TTL 5 min), ne fait qu'une seule requête
      const cachedConfig = {
        dispatch: await chargerConfigDispatch(base44),
        gps: await chargerConfigVaguesGPS(base44),
      };

      // 🛡️ FILET DE SÉCURITÉ — premier_tick_manquant
      // Détecte les courses en_attente depuis > 2 min SANS aucun DispatchLog.
      // Ces courses n'ont jamais été prises en charge par le moteur (automatisation
      // entity ou tick programmé). On les force immédiatement + alerte admin.
      const PREMIER_TICK_SEUIL_MS = 45 * 1000; // 45 secondes — filet de sécurité raccourci
      const coursesEnAttente = courses.filter(c =>
        c.dispatch_status === 'en_attente' &&
        c.statut === 'recherche_livreur'
      );
      const coursesJamaisTraitees = coursesEnAttente.filter(c => {
        const ageMs = now.getTime() - new Date(c.created_date).getTime();
        return ageMs > PREMIER_TICK_SEUIL_MS;
      });

      if (coursesJamaisTraitees.length > 0) {
        // Batch query: récupérer les DispatchLogs récents pour ces courses
        // Si une course a un log, elle a déjà été traitée (même si elle est retombée en en_attente)
        const logCourseIds = new Set();
        for (const c of coursesJamaisTraitees) {
          try {
            const logs = await base44.asServiceRole.entities.DispatchLog.filter({ course_id: c.id }, '-heure', 1);
            if (logs.length > 0) logCourseIds.add(c.id);
          } catch {}
        }

        const vraimentJamaisTraitees = coursesJamaisTraitees.filter(c => !logCourseIds.has(c.id));

        for (const course of vraimentJamaisTraitees) {
          const ageMin = Math.round((now.getTime() - new Date(course.created_date).getTime()) / 60000);
          console.error(`[DISPATCH] 🚨 PREMIER TICK MANQUANT: Course ${course.id} en_attente depuis ${ageMin}min sans AUCUN DispatchLog — force dispatch`);

          // Log spécifique premier_tick_manquant
          journaliserDispatch(base44, {
            course_id: course.id,
            country_code: course.country_code,
            vague: 0,
            vague_avant: 0,
            vague_apres: 0,
            evenement: 'premier_tick_manquant',
            raison_blocage: `en_attente_${ageMin}min_sans_log`,
            raison_passage: 'filet_securite_premier_tick',
          });

          // Alerte admin
          base44.asServiceRole.entities.Notification.create({
            titre: '🚨 Premier tick manquant — course jamais traitée',
            message: `Course ${course.client_nom || '?'} (${course.adresse_depart || '?'}) en_attente depuis ${ageMin}min sans aucun DispatchLog. L'automatisation de dispatch ne l'a pas prise en charge. Traitement forcé en cours.`,
            type: 'alerte_critique_dispatch', course_id: course.id, lue: false,
          }).catch(() => {});

          // Force dispatch immédiat
          try {
            const result = await lancerDispatchMulti(base44, course.id, [], cachedConfig);
            resultats.push({ course_id: course.id, wave: 'premier_tick_manquant', ...result });
          } catch (err) {
            console.error(`[DISPATCH] ❌ Erreur force dispatch premier_tick ${course.id}:`, err.message);
            resultats.push({ course_id: course.id, wave: 'premier_tick_manquant', error: err.message });
          }
          await new Promise(r => setTimeout(r, 100));
        }
      }

      // Recharger allToProcess si des courses premier_tick_manquant ont été traitées
      // (leur dispatch_status a changé, éviter de les retraiter dans la boucle principale)
      const premierTickProcessed = new Set(resultats
        .filter(r => r.wave === 'premier_tick_manquant')
        .map(r => r.course_id));

      for (const course of allToProcess) {
        try {
          // Skip les courses déjà traitées par le filet premier_tick_manquant
          if (premierTickProcessed.has(course.id)) continue;

          // 🚨 RATTRAPAGE: course bloquée depuis > 10 min sans aucune évolution de vague
          // Seuil élevé (10 min) pour laisser le code normal d'avancement de vague fonctionner
          // à chaque tick. Le rattrapage n'est qu'un filet de sécurité pour les courses
          // vraiment coincées (tick manqué plusieurs fois de suite).
          //
          // ⚠️ ANTI-BOUCLE: Relire la course fraîchement en DB avant le check.
          // allToProcess est un snapshot stale chargé au début du tick ; si la course
          // a avancé de vague plus tôt dans ce même tick, course.updated_date et
          // course.dispatch_status sont obsolètes → le rattrapage se déclenche à tort
          // et réinitialise la vague, annulant le progrès.
          let freshCourse = course;
          try {
            freshCourse = await base44.asServiceRole.entities.CourseExterne.get(course.id);
          } catch {}
          const waveTimeoutMs = (cachedConfig.gps.waves[0]?.timeout_sec || 60) * 1000;
          const stuckDurationMs = now.getTime() - new Date(freshCourse.updated_date).getTime();
          const RATTRAPAGE_SEUIL_MS = Math.max(waveTimeoutMs * 2, 10 * 60 * 1000); // min 10 minutes
          if (stuckDurationMs > RATTRAPAGE_SEUIL_MS && freshCourse.dispatch_status === 'propose' && !freshCourse.livreur_id) {
            console.log(`[DISPATCH] 🚨 RATTRAPAGE: Course ${freshCourse.id} bloquée depuis ${Math.round(stuckDurationMs / 60000)}min — force-reset vague`);
            await base44.asServiceRole.entities.CourseExterne.update(freshCourse.id, {
              dispatch_status: 'redispatch',
              dispatch_locked_until: null,
              timeout_expires_at: null,
            });
            base44.asServiceRole.entities.Notification.create({
              titre: '🚨 Course bloquée — rattrapage automatique',
              message: `Course ${freshCourse.client_nom || '?'} (${freshCourse.adresse_depart || '?'}) bloquée depuis ${Math.round(stuckDurationMs / 60000)}min — rattrapage automatique déclenché.`,
              type: 'alerte_critique_dispatch', course_id: freshCourse.id, lue: false,
            }).catch(() => {});
            journaliserDispatch(base44, {
              course_id: freshCourse.id, country_code: freshCourse.country_code,
              vague: freshCourse.dispatch_wave || 0,
              vague_avant: freshCourse.dispatch_wave || 0,
              vague_apres: freshCourse.dispatch_wave || 0,
              evenement: 'rattrapage',
              raison_passage: `bloquée_${Math.round(stuckDurationMs / 60000)}min_force_reset`,
            });
            const result = await lancerDispatchMulti(base44, freshCourse.id, [], cachedConfig);
            resultats.push({ course_id: freshCourse.id, wave: 'rattrapage', ...result });
            continue;
          }

          // 🔄 cycle_epuise : VENUS a demandé au client s'il veut relancer.
          // On attend sa réponse (15 min max). Si timeout → auto-annulation.
          if (course.dispatch_status === 'cycle_epuise') {
            const deadlineMs = course.timeout_expires_at
              ? new Date(course.timeout_expires_at).getTime()
              : 0;
            const nowMs = now.getTime();

            if (deadlineMs > 0 && nowMs < deadlineMs) {
              // Délai non expiré — attendre la réponse du client
              console.log(`[DISPATCH] ⏳ Cycle épuisé course ${course.id} — en attente réponse client (deadline: ${new Date(deadlineMs).toISOString()})`);
              resultats.push({ course_id: course.id, wave: 'cycle_epuise_waiting' });
              continue;
            }

            // Délai de 15 min dépassé sans réponse client — mise en attente (suspend le dispatch)
            // L'admin doit repasser la course en 'nouvelle' pour relancer le dispatch.
            console.log(`[DISPATCH] ⏰ Cycle épuisé + 15min sans réponse pour course ${course.id} — mise en attente`);
            await base44.asServiceRole.entities.CourseExterne.update(course.id, {
              statut: 'en_attente',
              dispatch_status: 'en_attente',
              notes: (course.notes || '') + ' | [EN ATTENTE] Cycle dispatch épuisé, client sans réponse sous 15 min',
            });
            resultats.push({ course_id: course.id, wave: 'cycle_epuise_en_attente' });
            continue;
          }

          // 📌 Courses en attente / redispatch (hors vagues) → relancer
          if (!course.dispatch_status || ['en_attente', 'redispatch'].includes(course.dispatch_status)) {
            const result = await lancerDispatchMulti(base44, course.id, [], cachedConfig);
            resultats.push({ course_id: course.id, wave: 'retry', ...result });
            continue;
          }

          // 🌊/📍 Vagues expirées (propose sans verrou, mode vagues heartbeat ou GPS)
          // ✅ Traiter null timeout comme expiré (course corrompue ne doit jamais rester bloquée)
          const expired = !course.timeout_expires_at || new Date(course.timeout_expires_at) < now;
          if (!expired || course.dispatch_status !== 'propose') continue;

          // ⏰ Verrou expiré AVEC livreur_id (prix manuel sans réponse client, ou acceptation expirée)
          if (course.livreur_id) {
            console.log(`[DISPATCH] ⏰ Verrou expiré (livreur ${course.livreur_id}) course ${course.id} — libération + redispatch`);
            await base44.asServiceRole.entities.CourseExterne.update(course.id, {
              statut: 'recherche_livreur',
              dispatch_status: 'redispatch',
              livreur_id: '',
              livreur_nom: '',
              livreur_telephone: '',
              heure_acceptation: null,
              accepted_by_livreur_id: '',
              accepted_at: null,
              pricing_mode: 'automatic',
              manual_price: null,
              manual_price_status: null,
              proposed_by_livreur_id: '',
              timeout_expires_at: null,
            });
            const result = await lancerDispatchMulti(base44, course.id, [], cachedConfig);
            resultats.push({ course_id: course.id, wave: 'expired_lock_redispatch', ...result });
            continue;
          }

          const currentWave = course.dispatch_wave || 0;
          if (currentWave > 0) {
            const maxWave = cachedConfig.gps.waves.length;

            const nextWave = currentWave + 1;
            if (nextWave > maxWave) {
              console.log(`[DISPATCH] 📍 GPS vague ${currentWave} expirée (max: ${maxWave}) — cycle_epuise pour course ${course.id}`);
              const cycleEpuiseDeadline = new Date(now.getTime() + CYCLE_EPUISE_TIMEOUT_MS).toISOString();
              await base44.asServiceRole.entities.CourseExterne.update(course.id, {
                dispatch_status: 'cycle_epuise',
                dispatch_wave: maxWave,
                timeout_expires_at: cycleEpuiseDeadline,
              });
              // ── Notifier VENUS WhatsApp au client : voulez-vous relancer ? ──
              const messageVenus = `📍 Nous avons sollicité tous les livreurs disponibles autour de vous, mais aucun n'a accepté votre course pour le moment.\n\nVoulez-vous que je relance la recherche ?\n\nRépondez 'oui' pour relancer ou 'non' pour annuler.`;
              const notifie = await notifierRedispatchClient({
                base44,
                course,
                messageVenus,
                motif: 'cycle_epuise',
              });
              resultats.push({ course_id: course.id, wave: `${currentWave}→epuise`, venus_notifie: notifie });
              continue;
            }
            console.log(`[DISPATCH] 📍 GPS avancement vague ${currentWave} → ${nextWave} pour course ${course.id}`);
            await base44.asServiceRole.entities.CourseExterne.update(course.id, {
              dispatch_status: 'redispatch',
              dispatch_wave: nextWave,
            });
          } else {
            // Mode direct (wave=0) — reset notifiés pour re-notifier tout le monde
            console.log(`[DISPATCH] ⚡ Mode direct — reset notifiés + redispatch course ${course.id}`);
            await base44.asServiceRole.entities.CourseExterne.update(course.id, {
              dispatch_status: 'redispatch',
              dispatch_notified_ids: '[]',
            });
          }

          const result = await lancerDispatchMulti(base44, course.id, [], cachedConfig);
          resultats.push({ course_id: course.id, wave: `${currentWave}→${currentWave + 1}`, ...result });
        } catch (err) {
          console.error(`[DISPATCH] ❌ Erreur sur course ${course.id}:`, err.message);
          resultats.push({ course_id: course.id, error: err.message });
        }
        // Délai minimal entre courses (les notifications sont fire-and-forget)
        await new Promise(r => setTimeout(r, 100));
      }

      // ── FILET DE SÉCURITÉ — corriger les statuts "en_course" fantômes ──
      // Un livreur peut rester bloqué à "en_course" sans course active si :
      // - Sa course a été annulée/refusée sans déclencher syncStatutLivreurOnCourse
      // - Une erreur réseau a interrompu le flux normal de libération
      // Ce filet tourne à chaque tick et garantit qu'aucun statut fantôme ne persiste.
      try {
        const livreursEnCourse = await base44.asServiceRole.entities.Livreur.filter(
          { type_livreur: 'externe', statut: 'en_course' },
          '-updated_date', 50
        );

        if (livreursEnCourse.length > 0) {
          // Construire l'ensemble des IDs livreurs ayant VRAIMENT une course active
          // à partir des courses déjà chargées dans ce tick + une requête ciblée
          const livreurIdsAvecCourseActive = new Set(
            courses.filter(c => STATUTS_ACTIFS_VERIF.includes(c.statut) && c.livreur_id).map(c => c.livreur_id)
          );

          // Pour les livreurs "en_course" non trouvés dans courses, vérifier individuellement
          // (courses ne contient que les statuts recherche_livreur + nouvelle, pas les actives)
          const livreursAVerifier = livreursEnCourse.filter(l => !livreurIdsAvecCourseActive.has(l.id));
          if (livreursAVerifier.length > 0) {
            const activeIds = new Set();
            for (const l of livreursAVerifier) {
              try {
                const livreurCourses = await base44.asServiceRole.entities.CourseExterne.filter(
                  { livreur_id: l.id }, '-created_date', 5
                );
                if ((livreurCourses || []).some(c => STATUTS_ACTIFS_VERIF.includes(c.statut))) {
                  activeIds.add(l.id);
                }
              } catch {}
            }
            const livreursFantomes = livreursAVerifier.filter(l => !activeIds.has(l.id));
            for (const l of livreursFantomes) {
              const nouveauStatut = l.manual_hors_ligne === true ? 'hors_ligne' : 'disponible';
              await base44.asServiceRole.entities.Livreur.update(l.id, { statut: nouveauStatut });
              console.log(`[DISPATCH] 🔄 Filet sécurité: ${l.prenom || ''} ${l.nom || ''} → "${nouveauStatut}" (en_course sans course active)`);
            }
            if (livreursFantomes.length > 0) {
              console.log(`[DISPATCH] 🔄 Filet sécurité: ${livreursFantomes.length} statut(s) fantôme(s) corrigé(s)`);
            }
          }
        }
      } catch (err) {
        console.warn('[DISPATCH] ⚠️ Erreur filet sécurité statut livreur:', err.message);
      }

      // 🚨 Détection des courses bloquées > 10 min (dispatch en panne)
      const stuckCourses = courses.filter(c => {
        if (c.dispatch_status !== 'propose') return false;
        if (!c.timeout_expires_at) return false;
        const expiredTime = new Date(c.timeout_expires_at);
        return expiredTime < now && (now.getTime() - expiredTime.getTime()) > 10 * 60 * 1000;
      });
      for (const course of stuckCourses) {
        try {
          const existingAlerts = await base44.asServiceRole.entities.Notification.filter({
            course_id: course.id, type: 'alerte_critique_dispatch', lue: false,
          });
          if (existingAlerts.length === 0) {
            const stuckMin = Math.round((now.getTime() - new Date(course.timeout_expires_at).getTime()) / 60000);
            await base44.asServiceRole.entities.Notification.create({
              titre: '🚨 Course bloquée — dispatch en panne ?',
              message: `Course ${course.adresse_depart || '?'} → ${course.adresse_arrivee || '?'} — bloquée depuis ${stuckMin} min sans relance automatique. Le moteur de dispatch semble ne pas fonctionner.`,
              type: 'alerte_critique_dispatch', course_id: course.id, lue: false,
            });
            console.error(`[DISPATCH] 🚨 ALERTE ADMIN: Course ${course.id} bloquée depuis ${stuckMin} min — dispatch en panne`);
          }
        } catch (e) { console.error('[DISPATCH] Erreur création alerte bloquée:', e.message); }
      }

      // ⚠️ Détection des courses sans aucun livreur disponible (> 5 min de recherche)
      try {
        const coursesSansLivreur = courses.filter(c =>
          c.statut === 'recherche_livreur' && c.dispatch_status === 'en_attente'
        );
        for (const course of coursesSansLivreur) {
          const updatedTime = new Date(course.updated_date);
          if (now.getTime() - updatedTime.getTime() < 5 * 60 * 1000) continue;

          let notifiedIds = [];
          try { notifiedIds = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
          if (notifiedIds.length > 0) continue;

          const existingAlerts = await base44.asServiceRole.entities.Notification.filter({
            course_id: course.id, type: 'alerte_aucun_livreur', lue: false,
          });
          if (existingAlerts.length === 0) {
            const searchMin = Math.round((now.getTime() - updatedTime.getTime()) / 60000);
            await base44.asServiceRole.entities.Notification.create({
              titre: '⚠️ Aucun livreur disponible',
              message: `Course ${course.client_nom || '?'} — ${course.adresse_depart || '?'} → ${course.adresse_arrivee || '?'} — en recherche depuis ${searchMin} min sans aucun livreur trouvé. Les livreurs sont peut-être tous hors ligne ou trop loin.`,
              type: 'alerte_aucun_livreur', course_id: course.id, lue: false,
            });
            console.warn(`[DISPATCH] ⚠️ ALERTE ADMIN: Course ${course.id} sans livreur depuis ${searchMin} min`);
          }
        }
      } catch (e) { console.error('[DISPATCH] Erreur détection sans livreur:', e.message); }

      return Response.json({ success: true, traitees: resultats.length, resultats: resultats.slice(0, 20) });
    }

    // ─── 7. Retry courses en attente / redispatch (hors vagues) ────────────
    if (action === 'retry_courses_en_attente') {
      const { country_code: filterCountry } = body;
      const filter = { statut: 'recherche_livreur' };
      if (filterCountry) filter.country_code = filterCountry;

      const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter, '-created_date', 10);
      const aRetenter = courses.filter(c =>
        ['en_attente', 'redispatch', 'cycle_epuise'].includes(c.dispatch_status)
      );

      const MAX_COURSES_PER_TICK = 10;
      const coursesToProcess = aRetenter.slice(0, MAX_COURSES_PER_TICK);
      if (aRetenter.length > MAX_COURSES_PER_TICK) {
        console.log(`[DISPATCH] ⚡ ${aRetenter.length} courses à retenter — limitation à ${MAX_COURSES_PER_TICK}/tick`);
      }

      // 📦 Cache config — déjà mis en cache au niveau module (TTL 5 min)
      const cachedConfig = {
        dispatch: await chargerConfigDispatch(base44),
        gps: await chargerConfigVaguesGPS(base44),
      };

      const resultats = [];
      for (const course of coursesToProcess) {
        try {
          const result = await lancerDispatchMulti(base44, course.id, [], cachedConfig);
          resultats.push({ course_id: course.id, ...result });
        } catch (err) {
          console.error(`[DISPATCH] ❌ Erreur retry course ${course.id}:`, err.message);
          resultats.push({ course_id: course.id, error: err.message });
        }
        // Délai minimal entre courses (les notifications sont fire-and-forget)
        await new Promise(r => setTimeout(r, 100));
      }
      return Response.json({ success: true, retried: coursesToProcess.length, total: aRetenter.length, resultats });
    }

    // ─── 7. Valider le prix manuel côté client ────────────────────────────
    if (action === 'valider_prix_manuel') {
      const { accepted } = body;
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const now = new Date().toISOString();

      if (accepted) {
        const prixManuel = Number(course.manual_price);
        // 🎯 Commission dynamique du pays de la course
        let commissionPct: number | null = null;
        try {
          if (course.country_code) {
            const countryConfig = await chargerConfigPays(base44, course.country_code);
            commissionPct = normalizeCommissionPct(countryConfig?.commission_pct);
          }
        } catch (error) {
          console.error('[dispatchExterneAuto] Lecture commission pays impossible', error);
        }
        if (commissionPct === null) {
          return Response.json({
            error: 'Commission du pays non configurée',
            reason: 'missing_country_commission_pct',
          }, { status: 409 });
        }
        const commission = Math.round(prixManuel * (commissionPct / 100));
        const montantLivreur = prixManuel - commission;

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          manual_price_status: 'accepted', client_price_validated_at: now,
          statut: 'livreur_en_route', dispatch_status: 'accepte', heure_acceptation: now,
          prix_final: prixManuel, commission_silga: commission, montant_livreur: montantLivreur,
        });

        if (course.proposed_by_livreur_id) {
          const livreurId = course.proposed_by_livreur_id;
          await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: 'en_course' });
          try {
            const livreurData = await base44.asServiceRole.entities.Livreur.get(livreurId);
            if (livreurData?.user_email) {
              await base44.asServiceRole.entities.Notification.create({
                titre: '✅ Prix accepté — La course peut commencer !',
                message: `Le client a accepté votre prix de ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                type: 'course_acceptee', course_id: course_id, destinataire_email: livreurData.user_email, lue: false,
              });
              try {
                await base44.functions.invoke('envoiNotificationPush', {
                  destinataire_email: livreurData.user_email, livreur_id: livreurId,
                  titre: '✅ Prix accepté !', message: `Le client a validé ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                  type: 'course_acceptee', course_id: course_id,
                });
              } catch (_) {}
            }
          } catch (e) { console.error('[DISPATCH] ❌ Notif livreur prix accepté:', e.message); }
        }

        await supprimerNotificationsCourse(base44, course_id);
        return Response.json({ success: true, accepted: true });
      } else {
        const livreurRefuseId = course.proposed_by_livreur_id;

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          manual_price_status: 'refused', client_price_refused_at: now,
          statut: 'recherche_livreur', dispatch_status: 'redispatch',
          livreur_id: '', livreur_nom: '', livreur_telephone: '',
          pricing_mode: 'automatic', manual_price: null, proposed_by_livreur_id: '',
        });

        if (livreurRefuseId) {
          await base44.asServiceRole.entities.Livreur.update(livreurRefuseId, { statut: 'disponible' });
        }

        // Redispatch sans exclure (le refus était côté client, pas livreur)
        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ success: true, accepted: false, redispatched: !result.noLivreur });
      }
    }

    // ─── 8. Lire la config dispatch ───────────────────────────────────────
    if (action === 'get_config') {
      const config = await chargerConfigDispatch(base44);
      return Response.json({ success: true, config });
    }

    // ─── 9. Sauvegarder la config dispatch ──────────────────────────────
    if (action === 'set_config') {
      const { nb_livreurs, timeout_sec } = body;
      const configs = await base44.asServiceRole.entities.AppConfig.filter({});

      const upsert = async (cle, valeur, description) => {
        const existing = configs.find(c => c.cle === cle);
        if (existing) {
          await base44.asServiceRole.entities.AppConfig.update(existing.id, { valeur: String(valeur) });
        } else {
          await base44.asServiceRole.entities.AppConfig.create({ cle, valeur: String(valeur), description });
        }
      };

      if (nb_livreurs !== undefined) {
        await upsert('DISPATCH_NB_LIVREURS', nb_livreurs, 'Nombre de livreurs notifiés par vague de dispatch');
      }
      if (timeout_sec !== undefined) {
        await upsert('DISPATCH_TIMEOUT_SEC', timeout_sec, 'Délai de réponse par vague (secondes)');
      }

      return Response.json({ success: true, message: 'Configuration dispatch sauvegardée' });
    }

    // ─── 10. Lire la config vagues GPS ───────────────────────────────────
    if (action === 'get_wave_config') {
      const cfg = await chargerConfigVaguesGPS(base44);
      return Response.json({ success: true, config: cfg });
    }

    // ─── 11. Sauvegarder la config vagues GPS ───────────────────────────
    if (action === 'set_wave_config') {
      const { gps_waves_enabled, waves } = body;
      const configs = await base44.asServiceRole.entities.DispatchWaveConfig.filter({});
      const wavesJson = JSON.stringify(waves || []);

      if (configs[0]) {
        await base44.asServiceRole.entities.DispatchWaveConfig.update(configs[0].id, {
          gps_waves_enabled: gps_waves_enabled !== false,
          waves_json: wavesJson,
        });
      } else {
        await base44.asServiceRole.entities.DispatchWaveConfig.create({
          gps_waves_enabled: gps_waves_enabled !== false,
          waves_json: wavesJson,
        });
      }

      return Response.json({ success: true, message: 'Configuration vagues GPS sauvegardée' });
    }

    // ─── 12. Diagnostic anti-doublon notifications ────────────────────────
    if (action === 'diagnostic_notifications') {
      const toutes = await base44.asServiceRole.entities.Notification.filter({ type: 'nouvelle_course' }, '-created_date', 500);
      
      // Grouper par course_id + destinataire_email
      const grouped = {};
      for (const n of toutes) {
        const key = `${n.course_id || '?'}::${n.destinataire_email || '?'}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(n);
      }

      const doublons = Object.entries(grouped)
        .filter(([, notifs]) => notifs.length > 1)
        .map(([key, notifs]) => ({
          key,
          count: notifs.length,
          non_lues: notifs.filter(n => !n.lue).length,
          lues: notifs.filter(n => n.lue).length,
          derniere: notifs[0]?.created_date,
          premiere: notifs[notifs.length - 1]?.created_date,
        }));

      const stats = {
        total_notifications: toutes.length,
        total_combinaisons: Object.keys(grouped).length,
        combinaisons_avec_doublons: doublons.length,
        total_doublons_en_surplus: doublons.reduce((s, d) => s + d.count - 1, 0),
        doublons_non_lus: doublons.filter(d => d.non_lues > 0).length,
        doublons_detail: doublons.slice(0, 30),
      };

      console.log(`[DIAGNOSTIC NOTIFS] ${stats.total_notifications} notifs, ${stats.combinaisons_avec_doublons} combinaisons avec doublons, ${stats.total_doublons_en_surplus} notifs en surplus`);
      return Response.json({ success: true, stats });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    const isRateLimit = error.message?.toLowerCase?.().includes('rate limit') || error.message?.toLowerCase?.().includes('rate_limit');
    console.error(`[DISPATCH] Erreur fatale${isRateLimit ? ' (RATE LIMIT)' : ''}:`, error.message);
    try {
      const base44 = createClientFromRequest(req);
      // 🛡️ Anti-spam : ne créer une alerte que si aucune alerte récente (< 30 min) n'existe
      // Délai augmenté à 30 min pour les rate limits (transitoires) vs 5 min pour les autres erreurs
      const alertWindow = isRateLimit ? 30 * 60 * 1000 : 5 * 60 * 1000;
      const recentAlerts = await base44.asServiceRole.entities.Notification.filter({
        type: 'alerte_critique_dispatch', lue: false,
      }, '-created_date', 1);
      const hasRecent = recentAlerts?.[0] && (Date.now() - new Date(recentAlerts[0].created_date).getTime()) < alertWindow;
      if (!hasRecent) {
        const msg = isRateLimit
          ? `Le moteur de dispatch a atteint la limite d'appels API (rate limit). Cela est transitoire — le prochain tick reprendra automatiquement. Si le problème persiste, contactez le support.`
          : `Le moteur de dispatch a crashé: ${error.message}. Les courses ne sont plus relancées automatiquement. Intervention requise.`;
        await base44.asServiceRole.entities.Notification.create({
          titre: isRateLimit ? '⚠️ Surcharge API temporaire — dispatch' : '🚨 Erreur fatale — dispatch automatique',
          message: msg,
          type: 'alerte_critique_dispatch', lue: false,
        });
      }
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});