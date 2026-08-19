// ═══════════════════════════════════════════════════════════════════════
// ADMIN INBOX — Création centralisée d'éléments de notification persistants
// ═══════════════════════════════════════════════════════════════════════
//
// Règle fondamentale : ne jamais envoyer un push Admin sans qu'un élément
// persistant correspondant existe déjà dans AdminInboxItem.
//
// Utilisé par : venusAdminEventBus, venusAdminPushEngine, courseEventOrchestrator
// ═══════════════════════════════════════════════════════════════════════

export interface CreateInboxItemParams {
  type: "message" | "venus" | "course" | "payment" | "cancellation" | "system";
  priority: "P0" | "P1" | "P2" | "P3";
  title: string;
  body: string;
  source_entity?: string;
  source_id?: string;
  course_id?: string;
  conversation_id?: string;
  message_id?: string;
  payment_id?: string;
  livreur_id?: string;
  client_id?: string;
  country_code?: string;
  action_url?: string;
  deduplication_key?: string;
}

/**
 * Crée un AdminInboxItem de manière non-bloquante.
 * - Déduplication : si un item avec la même deduplication_key existe déjà, ne recrée pas.
 * - Retourne l'ID de l'item créé (ou l'ID existant si doublon).
 * - Non-bloquant : un échec n'impacte jamais SILGAPP.
 */
export async function createAdminInboxItem(
  base44: any,
  params: CreateInboxItemParams
): Promise<string | null> {
  try {
    const deduplication_key = params.deduplication_key ||
      `${params.type}_${params.source_id || params.course_id || params.payment_id || params.message_id || Date.now()}`;

    // Vérifier qu'un item identique n'existe pas déjà (anti-doublon)
    const existing = await base44.asServiceRole?.entities?.AdminInboxItem?.filter(
      { deduplication_key },
      "-created_date",
      1
    ).catch(() => []);

    if (existing && existing.length > 0) {
      return existing[0].id;
    }

    const item = await base44.asServiceRole.entities.AdminInboxItem.create({
      type: params.type,
      priority: params.priority,
      title: params.title,
      body: params.body,
      source_entity: params.source_entity || null,
      source_id: params.source_id || null,
      course_id: params.course_id || null,
      conversation_id: params.conversation_id || null,
      message_id: params.message_id || null,
      payment_id: params.payment_id || null,
      livreur_id: params.livreur_id || null,
      client_id: params.client_id || null,
      country_code: params.country_code || "ALL",
      action_url: params.action_url || `/admin/centre-notifications`,
      status: "unread",
      deduplication_key,
    });

    return item?.id || null;
  } catch (e) {
    console.warn("[AdminInbox] Erreur non-bloquante:", e?.message || String(e));
    return null;
  }
}

/**
 * Marque un AdminInboxItem comme lu.
 */
export async function markInboxItemRead(base44: any, itemId: string): Promise<void> {
  try {
    await base44.asServiceRole.entities.AdminInboxItem.update(itemId, {
      status: "read",
      read_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[AdminInbox] markRead error:", e?.message || String(e));
  }
}

/**
 * Archive un AdminInboxItem.
 */
export async function archiveInboxItem(base44: any, itemId: string): Promise<void> {
  try {
    await base44.asServiceRole.entities.AdminInboxItem.update(itemId, {
      status: "archived",
    });
  } catch (e) {
    console.warn("[AdminInbox] archive error:", e?.message || String(e));
  }
}