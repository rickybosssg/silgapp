/**
 * Sécurité des conversations — résolution des participants métier vers User.id.
 *
 * Le champ `participant_user_ids` (sur Conversation et Message) contient les IDs
 * des comptes utilisateurs (User.id) autorisés à accéder à la conversation.
 * Il est résolu côté backend UNIQUEMENT, jamais fourni par le frontend.
 *
 * RLS : read = { "$or": [{ "data.participant_user_ids": "{{user.id}}" }, { "user_condition": { "role": "admin" } }] }
 */

interface Participant {
  type: 'client' | 'livreur' | 'admin' | 'partenaire';
  id: string;
  name?: string;
}

interface ResolveResult {
  userIds: string[];
  unresolved: { type: string; id: string; reason: string }[];
}

/**
 * Résout un tableau de participants métier vers un tableau de User.id.
 * Pour chaque participant :
 *   - livreur  → Livreur.user_email → User.id
 *   - client   → ClientExterne.user_email → User.id
 *   - partenaire → Boutique/Restaurant/Pharmacie.user_email → User.id
 *   - admin    → si email direct, User.filter({email}) ; sinon tous les admins
 *
 * Retourne les User.id uniques + la liste des participants non résolus (pour audit).
 */
export async function resolveParticipantUserIds(
  base44: any,
  participants: Participant[]
): Promise<ResolveResult> {
  const userIds = new Set<string>();
  const unresolved: { type: string; id: string; reason: string }[] = [];

  for (const p of participants || []) {
    if (!p || !p.id) continue;

    // ── Admin : pas besoin de résoudre via une entité métier ──
    if (p.type === 'admin') {
      if (p.id && p.id.includes('@')) {
        // Email admin direct → User.filter({ email })
        try {
          const users = await base44.asServiceRole.entities.User.filter({ email: p.id });
          if (users?.[0]?.id) {
            userIds.add(users[0].id);
          } else {
            unresolved.push({ type: p.type, id: p.id, reason: `User not found by email ${p.id}` });
          }
        } catch (err: any) {
          unresolved.push({ type: p.type, id: p.id, reason: err?.message || 'User lookup error' });
        }
      } else {
        // 'support', 'all', ou autre → ajouter tous les admins
        try {
          const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
          for (const a of admins || []) {
            if (a.id) userIds.add(a.id);
          }
          if (!admins || admins.length === 0) {
            unresolved.push({ type: p.type, id: p.id, reason: 'No admin users found' });
          }
        } catch (err: any) {
          unresolved.push({ type: p.type, id: p.id, reason: err?.message || 'Admin lookup error' });
        }
      }
      continue;
    }

    // ── Participants métier : résoudre via leur entité ──
    let userEmail: string | null = null;

    try {
      if (p.type === 'livreur') {
        const livreur = await base44.asServiceRole.entities.Livreur.get(p.id).catch(() => null);
        userEmail = livreur?.user_email || null;
      } else if (p.type === 'client') {
        const client = await base44.asServiceRole.entities.ClientExterne.get(p.id).catch(() => null);
        userEmail = client?.user_email || null;
      } else if (p.type === 'partenaire') {
        const [boutiques, restaurants, pharmacies] = await Promise.all([
          base44.asServiceRole.entities.Boutique.filter({ id: p.id }),
          base44.asServiceRole.entities.Restaurant.filter({ id: p.id }),
          base44.asServiceRole.entities.Pharmacie.filter({ id: p.id }),
        ]);
        const etab = (boutiques?.[0]) || (restaurants?.[0]) || (pharmacies?.[0]);
        userEmail = etab?.user_email || null;
      }
    } catch (err: any) {
      unresolved.push({ type: p.type, id: p.id, reason: err?.message || 'Entity lookup error' });
      continue;
    }

    if (userEmail) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
        if (users?.[0]?.id) {
          userIds.add(users[0].id);
        } else {
          unresolved.push({ type: p.type, id: p.id, reason: `No User found for email ${userEmail}` });
        }
      } catch (err: any) {
        unresolved.push({ type: p.type, id: p.id, reason: err?.message || 'User lookup error' });
      }
    } else {
      unresolved.push({ type: p.type, id: p.id, reason: `No user_email on ${p.type} entity` });
    }
  }

  return { userIds: [...userIds], unresolved };
}

/**
 * Résout les User.id des participants d'une course (livreur + client + admins).
 * Utilisé pour les messages système liés à une course (sans conversation).
 */
export async function resolveCourseParticipantUserIds(
  base44: any,
  livreurId?: string,
  clientId?: string
): Promise<string[]> {
  const userIds = new Set<string>();

  // Résoudre le livreur
  if (livreurId) {
    try {
      const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
      if (livreur?.user_email) {
        const users = await base44.asServiceRole.entities.User.filter({ email: livreur.user_email });
        if (users?.[0]?.id) userIds.add(users[0].id);
      }
    } catch {}
  }

  // Résoudre le client
  if (clientId) {
    try {
      const client = await base44.asServiceRole.entities.ClientExterne.get(clientId).catch(() => null);
      if (client?.user_email) {
        const users = await base44.asServiceRole.entities.User.filter({ email: client.user_email });
        if (users?.[0]?.id) userIds.add(users[0].id);
      }
    } catch {}
  }

  // Résoudre les admins
  try {
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    for (const a of admins || []) {
      if (a.id) userIds.add(a.id);
    }
  } catch {}

  return [...userIds];
}