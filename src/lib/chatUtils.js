export function buildClientMessageId(scope, senderType, senderId) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${scope || "chat"}:${senderType || "user"}:${senderId || "unknown"}:${Date.now()}:${randomPart}`;
}

export function getMessageKey(message) {
  if (message?.client_message_id) return `client:${message.client_message_id}`;
  if (message?.id) return `id:${message.id}`;
  return [
    "sig",
    message?.course_id || "",
    message?.conversation_id || "",
    message?.sender_type || "",
    message?.sender_id || "",
    message?.message_type || "text",
    message?.content || "",
    message?.audio_url || "",
    message?.photo_url || "",
    message?.created_date || "",
  ].join("|");
}

export function dedupeAndSortMessages(messages = []) {
  const byKey = new Map();
  for (const message of messages || []) {
    if (!message) continue;
    const key = getMessageKey(message);
    if (!byKey.has(key)) byKey.set(key, message);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const da = new Date(a?.created_date || 0).getTime();
    const db = new Date(b?.created_date || 0).getTime();
    return da - db;
  });
}

export function mergeMessageList(current, incoming) {
  return dedupeAndSortMessages([...(current || []), incoming]);
}

export function formatParticipantName(record, fallback = "Utilisateur") {
  if (!record) return fallback;
  const fullName = `${record.prenom || ""} ${record.nom || ""}`.trim();
  return fullName || record.nom_complet || record.full_name || record.nom || record.telephone || record.email || fallback;
}

function roleProfileKey(type, id) {
  return `${type || ""}:${id || ""}`;
}

export async function buildSenderProfiles(base44, messages = []) {
  const profileMap = new Map();
  const idsByType = {
    client: new Set(),
    livreur: new Set(),
    partenaire: new Set(),
    admin: new Set(),
  };

  for (const message of messages || []) {
    if (!message?.sender_type || !message?.sender_id) continue;
    idsByType[message.sender_type]?.add(message.sender_id);
    if (message.sender_type === "admin") {
      profileMap.set(roleProfileKey("admin", message.sender_id), {
        name: message.sender_name || "Admin SILGAPP",
        photo: message.sender_photo_url || "",
        role: "Admin",
      });
    }
  }

  const safeList = async (loader) => {
    try {
      return await loader();
    } catch {
      return [];
    }
  };

  if (idsByType.client.size > 0) {
    const clients = await safeList(() => base44.entities.ClientExterne.list());
    for (const client of clients || []) {
      if (!idsByType.client.has(client.id)) continue;
      profileMap.set(roleProfileKey("client", client.id), {
        name: formatParticipantName(client, "Client"),
        photo: client.photo_url || client.avatar_url || "",
        role: "Client",
      });
    }
  }

  if (idsByType.livreur.size > 0) {
    const livreurs = await safeList(() => base44.entities.Livreur.list());
    for (const livreur of livreurs || []) {
      if (!idsByType.livreur.has(livreur.id)) continue;
      profileMap.set(roleProfileKey("livreur", livreur.id), {
        name: formatParticipantName(livreur, "Livreur"),
        photo: livreur.photo_url || "",
        role: "Livreur",
      });
    }
  }

  if (idsByType.partenaire.size > 0) {
    const [boutiques, restaurants] = await Promise.all([
      safeList(() => base44.entities.Boutique.list()),
      safeList(() => base44.entities.Restaurant.list()),
    ]);
    for (const boutique of boutiques || []) {
      if (!idsByType.partenaire.has(boutique.id)) continue;
      profileMap.set(roleProfileKey("partenaire", boutique.id), {
        name: boutique.nom || "Boutique",
        photo: boutique.logo_url || "",
        role: "Partenaire",
      });
    }
    for (const restaurant of restaurants || []) {
      if (!idsByType.partenaire.has(restaurant.id)) continue;
      profileMap.set(roleProfileKey("partenaire", restaurant.id), {
        name: restaurant.nom || "Restaurant",
        photo: restaurant.logo_url || "",
        role: "Partenaire",
      });
    }
  }

  return profileMap;
}

export function enrichMessagesWithProfiles(messages = [], profiles = new Map()) {
  return (messages || []).map((message) => {
    const profile = profiles.get(roleProfileKey(message.sender_type, message.sender_id));
    if (!profile) return message;
    return {
      ...message,
      sender_name: profile.name || message.sender_name,
      sender_photo_url: profile.photo || message.sender_photo_url,
      sender_role_label: profile.role,
    };
  });
}
