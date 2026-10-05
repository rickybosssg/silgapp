/**
 * ═══════════════════════════════════════════════════════════════════
 * VENUS ADMIN EVENT BUS — Couche d'observation non-bloquante
 * ═══════════════════════════════════════════════════════════════════
 *
 * Crée des VenusAdminEvent à partir des événements métier SILGAPP.
 *
 * PRINCIPES :
 * 1. NON-BLOQUANT — un échec VENUS n'impacte jamais SILGAPP
 * 2. DÉTERMINISTE — pas d'appel IA, messages pré-formatés
 * 3. DÉDUPLICATION — deduplication_key empêche les doublons
 * 4. ISOLÉ — ne modifie aucune logique métier
 *
 * Utilisé par : courseEventOrchestrator, traiterPaiementSilgapp,
 *               verifierEncoursLivreur
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Crée un VenusAdminEvent de manière totalement non-bloquante.
 * Si l'entity n'existe pas ou si la création échoue, SILGAPP continue normalement.
 * Crée également un AdminInboxItem correspondant pour le Centre de notifications unifié.
 */
export async function emitVenusAdminEvent(base44: any, params: {
  event_type: string;
  priority: string;
  course_id?: string;
  livreur_id?: string;
  client_id?: string;
  payment_id?: string;
  message_id?: string;
  country_code: string;
  title: string;
  summary: string;
  payload?: Record<string, any>;
}): Promise<void> {
  try {
    const deduplication_key = params.deduplication_key ||
      `${params.event_type}_${params.course_id || params.livreur_id || params.payment_id || Date.now()}`;

    // Vérifier qu'un événement identique n'existe pas déjà (anti-doublon)
    // On ne vérifie que les événements des 5 dernières minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const existing = await base44.asServiceRole?.entities?.VenusAdminEvent?.filter(
      { deduplication_key },
      '-created_date',
      1
    ).catch(() => []);

    if (existing && existing.length > 0) {
      const evt = existing[0];
      if (evt.created_date && evt.created_date > fiveMinAgo) {
        return; // Doublon récent — ignorer
      }
    }

    const venusEvent = await base44.asServiceRole.entities.VenusAdminEvent.create({
      event_type: params.event_type,
      priority: params.priority,
      course_id: params.course_id || undefined,
      livreur_id: params.livreur_id || undefined,
      client_id: params.client_id || undefined,
      payment_id: params.payment_id || undefined,
      message_id: params.message_id || undefined,
      country_code: params.country_code,
      title: params.title,
      summary: params.summary,
      payload: params.payload ? JSON.stringify(params.payload) : undefined,
      deduplication_key,
      status: 'new',
    });

    // ── Créer un AdminInboxItem pour le Centre de notifications unifié ──
    // Mapping event_type → type inbox
    const inboxType = params.event_type === 'PAYMENT_RECEIVED' ? 'payment'
      : params.event_type === 'COURSE_CANCELLED' ? 'cancellation'
      : params.event_type === 'COURSE_CREATED' || params.event_type === 'COURSE_ACCEPTED' || params.event_type === 'COURSE_DELIVERED' ? 'course'
      : params.event_type === 'DRIVER_DEBT_THRESHOLD' ? 'system'
      : 'venus';

    const actionUrl = params.course_id ? `/courses` : params.payment_id ? `/admin/paiements` : `/admin/venus`;

    // Non-bloquant : si l'import échoue, SILGAPP continue
    try {
      const { createAdminInboxItem } = await import('./adminInbox.ts');
      await createAdminInboxItem(base44, {
        type: inboxType as any,
        priority: params.priority as any,
        title: params.title,
        body: params.summary,
        source_entity: 'VenusAdminEvent',
        source_id: venusEvent?.id,
        course_id: params.course_id,
        livreur_id: params.livreur_id,
        client_id: params.client_id,
        payment_id: params.payment_id,
        message_id: params.message_id,
        country_code: params.country_code,
        action_url: actionUrl,
        deduplication_key: `INBOX_${deduplication_key}`,
      });
    } catch (inboxErr) {
      console.warn('[VenusAdminEventBus] AdminInboxItem non-bloquant:', inboxErr?.message || String(inboxErr));
    }
  } catch (e) {
    // NON-BLOQUANT — SILGAPP continue même si VENUS échoue
    console.warn('[VenusAdminEventBus] Erreur non-bloquante:', e?.message || String(e));
  }
}

/**
 * Émet un événement COURSE_CREATED (P3 — routine).
 */
export async function emitCourseCreated(base44: any, course: any): Promise<void> {
  if (!course?.id || !course?.country_code) return;
  await emitVenusAdminEvent(base44, {
    event_type: 'COURSE_CREATED',
    priority: 'P3',
    course_id: course.id,
    client_id: course.destinataire_client_id || course.expediteur_client_id,
    country_code: course.country_code,
    title: `Nouvelle course créée`,
    summary: `Course ${course.id.slice(-6).toUpperCase()} créée (${course.type_course || 'N/A'}) — ${course.adresse_depart || 'N/A'} → ${course.adresse_arrivee || 'N/A'}`,
    payload: {
      type_course: course.type_course,
      adresse_depart: course.adresse_depart,
      adresse_arrivee: course.adresse_arrivee,
      prix_estimate: course.prix_estimate,
      source: course.source,
      created_by_venus: course.created_by_venus,
    },
  });
}

/**
 * Émet un événement COURSE_ACCEPTED (P3 — routine).
 */
export async function emitCourseAccepted(base44: any, course: any): Promise<void> {
  if (!course?.id || !course?.country_code) return;
  await emitVenusAdminEvent(base44, {
    event_type: 'COURSE_ACCEPTED',
    priority: 'P3',
    course_id: course.id,
    livreur_id: course.livreur_id,
    country_code: course.country_code,
    title: `Course acceptée`,
    summary: `Course ${course.id.slice(-6).toUpperCase()} acceptée par ${course.livreur_nom || 'un livreur'}`,
    payload: {
      livreur_nom: course.livreur_nom,
      livreur_telephone: course.livreur_telephone,
    },
  });
}

/**
 * Émet un événement COURSE_CANCELLED (P1 — important).
 */
export async function emitCourseCancelled(base44: any, course: any): Promise<void> {
  if (!course?.id || !course?.country_code) return;
  await emitVenusAdminEvent(base44, {
    event_type: 'COURSE_CANCELLED',
    priority: 'P1',
    course_id: course.id,
    livreur_id: course.livreur_id,
    country_code: course.country_code,
    title: `Course annulée`,
    summary: `Eric, la course ${course.id.slice(-6).toUpperCase()} vient d'être annulée.`,
    payload: {
      livreur_nom: course.livreur_nom,
      statut: course.statut,
      remarque_livreur: course.remarque_livreur,
    },
  });
}

/**
 * Émet un événement COURSE_DELIVERED (P3 — routine).
 */
export async function emitCourseDelivered(base44: any, course: any): Promise<void> {
  if (!course?.id || !course?.country_code) return;
  await emitVenusAdminEvent(base44, {
    event_type: 'COURSE_DELIVERED',
    priority: 'P3',
    course_id: course.id,
    livreur_id: course.livreur_id,
    country_code: course.country_code,
    title: `Course livrée`,
    summary: `Course ${course.id.slice(-6).toUpperCase()} livrée par ${course.livreur_nom || 'un livreur'} — ${course.prix_final || 0} ${course.devise || 'FCFA'}`,
    payload: {
      prix_final: course.prix_final,
      commission_silga: course.commission_silga,
      montant_livreur: course.montant_livreur,
    },
  });
}

/**
 * Émet un événement PRICE_CHANGED (P2 — information).
 */
export async function emitPriceChanged(base44: any, course: any, oldCourse: any): Promise<void> {
  if (!course?.id || !course?.country_code) return;
  const oldPrice = oldCourse?.prix_final;
  const newPrice = course.prix_final;
  if (oldPrice === newPrice) return;
  await emitVenusAdminEvent(base44, {
    event_type: 'PRICE_CHANGED',
    priority: 'P2',
    course_id: course.id,
    country_code: course.country_code,
    title: `Prix modifié`,
    summary: `Eric, le prix de la course ${course.id.slice(-6).toUpperCase()} a changé : ${oldPrice || 0} → ${newPrice || 0} ${course.devise || 'FCFA'}`,
    payload: {
      old_price: oldPrice,
      new_price: newPrice,
      pricing_mode: course.pricing_mode,
    },
  });
}

/**
 * Émet un événement PAYMENT_RECEIVED (P2 — information).
 */
export async function emitPaymentReceived(base44: any, payment: any): Promise<void> {
  if (!payment?.id) return;
  const countryCode = payment.country_code || 'BF';
  await emitVenusAdminEvent(base44, {
    event_type: 'PAYMENT_RECEIVED',
    priority: 'P2',
    payment_id: payment.id,
    country_code: countryCode,
    title: `Paiement enregistré`,
    summary: `Eric, un paiement de ${payment.montant_paye || 0} ${payment.devise || 'FCFA'} vient d'être enregistré.`,
    payload: {
      montant_paye: payment.montant_paye,
      user_type: payment.user_type,
      user_email: payment.user_email,
      statut: payment.statut,
    },
  });
}

/**
 * Émet un événement DRIVER_DEBT_THRESHOLD (P2 — information).
 */
export async function emitDriverDebtThreshold(base44: any, livreur: any, seuil: number, encours: number): Promise<void> {
  if (!livreur?.id || !livreur?.country_code) return;
  const livreurNom = `${livreur.prenom || ''} ${livreur.nom || ''}`.trim();
  await emitVenusAdminEvent(base44, {
    event_type: 'DRIVER_DEBT_THRESHOLD',
    priority: 'P2',
    livreur_id: livreur.id,
    country_code: livreur.country_code,
    title: `Seuil de dette atteint`,
    summary: `Eric, le livreur ${livreurNom || livreur.id.slice(-6).toUpperCase()} vient de dépasser le seuil de montant dû à SILGAPP (${encours} / ${seuil} ${livreur.devise || 'FCFA'}).`,
    payload: {
      livreur_nom: livreurNom,
      livreur_telephone: livreur.telephone,
      encours,
      seuil,
      bloque_encours: livreur.bloque_encours,
    },
  });
}