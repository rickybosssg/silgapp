// ═══════════════════════════════════════════════════════════════════════════
// MODULE "FIABILITÉ PUSH" — Surveillance proactive de la dégradation du push
// ═══════════════════════════════════════════════════════════════════════════
// Layer read-only : ne modifie jamais les tokens, n'envoie jamais de push.
// Calcule les métriques de santé, détecte les dégradations, crée des alertes.
//
// Réutilise l'infrastructure existante (NotificationToken, AdminInboxItem, AppConfig)
// sans dupliquer la logique FCM ni le nettoyage de tokens.
// ═══════════════════════════════════════════════════════════════════════════

export const PUSH_DEGRADATION_TYPES = {
  TAUX_ECHEC_ELEVE: 'PUSH_D1_TAUX_ECHEC_ELEVE',
  TAUX_ECHEC_CRITIQUE: 'PUSH_D2_TAUX_ECHEC_CRITIQUE',
  TOKENS_INVALIDES_ACCUMULATION: 'PUSH_D3_TOKENS_INVALIDES_ACCUMULATION',
  LIVREURS_INJOIGNABLES: 'PUSH_D4_LIVREURS_INJOIGNABLES',
  TOKENS_STALE: 'PUSH_D5_TOKENS_STALE',
  AUCUN_TOKEN_LIVREUR: 'PUSH_D6_AUCUN_TOKEN_LIVREUR',
};

const DEGRADATION_SCORES: Record<string, number> = {
  [PUSH_DEGRADATION_TYPES.TAUX_ECHEC_ELEVE]: 20,
  [PUSH_DEGRADATION_TYPES.TAUX_ECHEC_CRITIQUE]: 40,
  [PUSH_DEGRADATION_TYPES.TOKENS_INVALIDES_ACCUMULATION]: 15,
  [PUSH_DEGRADATION_TYPES.LIVREURS_INJOIGNABLES]: 35,
  [PUSH_DEGRADATION_TYPES.TOKENS_STALE]: 10,
  [PUSH_DEGRADATION_TYPES.AUCUN_TOKEN_LIVREUR]: 25,
};

const DEGRADATION_LABELS: Record<string, string> = {
  [PUSH_DEGRADATION_TYPES.TAUX_ECHEC_ELEVE]: 'Taux d\'échec push élevé (>20% sur la dernière heure)',
  [PUSH_DEGRADATION_TYPES.TAUX_ECHEC_CRITIQUE]: 'Taux d\'échec push critique (>50% sur la dernière heure)',
  [PUSH_DEGRADATION_TYPES.TOKENS_INVALIDES_ACCUMULATION]: 'Accumulation de tokens invalides non nettoyés',
  [PUSH_DEGRADATION_TYPES.LIVREURS_INJOIGNABLES]: 'Livreurs actifs injoignables par push',
  [PUSH_DEGRADATION_TYPES.TOKENS_STALE]: 'Tokens actifs non utilisés depuis >30 jours',
  [PUSH_DEGRADATION_TYPES.AUCUN_TOKEN_LIVREUR]: 'Livreurs sans aucun token push enregistré',
};

export interface PushDegradationItem {
  type: string;
  label: string;
  description: string;
  metric_value: number;
  metric_unit: string;
}

export interface PushHealthMetrics {
  // Vue d'ensemble
  total_tokens: number;
  tokens_actifs: number;
  tokens_inactifs: number;
  taux_actif_pct: number;

  // Par plateforme
  tokens_android: number;
  tokens_ios: number;
  tokens_web: number;

  // Par type d'utilisateur
  tokens_livreurs: number;
  tokens_clients: number;
  tokens_admins: number;
  tokens_partenaires: number;

  // Santé récente (dernière heure)
  notifs_recentes_total: number;
  notifs_recentes_success: number;
  notifs_recentes_failed: number;
  taux_echec_1h_pct: number;

  // Santé 24h
  notifs_24h_total: number;
  notifs_24h_success: number;
  notifs_24h_failed: number;
  taux_echec_24h_pct: number;

  // Tokens problématiques
  tokens_avec_erreur_fcm: number;
  tokens_stale_30j: number;

  // Livreurs joignables
  livreurs_actifs_total: number;
  livreurs_avec_token_valide: number;
  livreurs_sans_token: number;
  taux_livreurs_joignables_pct: number;

  // Dégradations détectées
  degradations: PushDegradationItem[];
  degradation_score: number;
  niveau: string;
  action_recommandee: string;
}

/**
 * Charge les seuils configurables depuis AppConfig.
 */
export async function loadPushHealthConfig(base44: any) {
  const configs = await base44.asServiceRole.entities.AppConfig.filter({}).catch(() => []);
  const get = (key: string, def: number) => {
    const c = configs.find((x: any) => x.cle === key);
    return c ? (parseFloat(c.valeur) || def) : def;
  };
  return {
    tauxEchecElevePct: get('PUSH_TAUX_ECHEC_ELEVE_PCT', 20),
    tauxEchecCritiquePct: get('PUSH_TAUX_ECHEC_CRITIQUE_PCT', 50),
    tokensInvalidesSeuil: get('PUSH_TOKENS_INVALIDES_SEUIL', 10),
    livreursInjoignablesPct: get('PUSH_LIVREURS_INJOIGNABLES_PCT', 30),
    tokensStaleSeuil: get('PUSH_TOKENS_STALE_SEUIL', 20),
    alertDedupMin: get('PUSH_ALERT_DEDUP_MIN', 60),
  };
}

/**
 * Calcule toutes les métriques de santé push en temps réel.
 * Pure lecture — ne modifie aucune donnée.
 */
export async function computePushHealth(base44: any): Promise<PushHealthMetrics> {
  const now = Date.now();
  const config = await loadPushHealthConfig(base44);
  const ONE_HOUR_MS = 3600 * 1000;
  const ONE_DAY_MS = 24 * ONE_HOUR_MS;
  const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

  // ── Charger tous les tokens (max 500 par page, paginer) ──
  const allTokens: any[] = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const batch = await base44.asServiceRole.entities.NotificationToken.list('-created_date', limit, offset).catch(() => []);
    if (!batch || batch.length === 0) break;
    allTokens.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  // ── Vue d'ensemble ──
  const totalTokens = allTokens.length;
  const tokensActifs = allTokens.filter((t: any) => t.actif).length;
  const tokensInactifs = totalTokens - tokensActifs;
  const tauxActifPct = totalTokens > 0 ? Math.round((tokensActifs / totalTokens) * 100) : 0;

  // ── Par plateforme ──
  const tokensAndroid = allTokens.filter((t: any) => String(t.platform).toLowerCase().includes('android')).length;
  const tokensIos = allTokens.filter((t: any) => String(t.platform).toLowerCase().includes('ios')).length;
  const tokensWeb = allTokens.filter((t: any) => String(t.platform).toLowerCase().includes('web')).length;

  // ── Par type d'utilisateur ──
  const tokensLivreurs = allTokens.filter((t: any) => t.user_type === 'livreur').length;
  const tokensClients = allTokens.filter((t: any) => t.user_type === 'client').length;
  const tokensAdmins = allTokens.filter((t: any) => t.user_type === 'admin').length;
  const tokensPartenaires = allTokens.filter((t: any) => t.user_type === 'partenaire').length;

  // ── Santé récente (dernière heure) ──
  const tokensWithRecentNotif1h = allTokens.filter((t: any) => {
    if (!t.derniere_notif_date) return false;
    return (now - new Date(t.derniere_notif_date).getTime()) <= ONE_HOUR_MS;
  });
  const notifsRecentesTotal = tokensWithRecentNotif1h.length;
  const notifsRecentesSuccess = tokensWithRecentNotif1h.filter((t: any) => t.derniere_notif_statut === 'success').length;
  const notifsRecentesFailed = tokensWithRecentNotif1h.filter((t: any) => t.derniere_notif_statut === 'failed').length;
  const tauxEchec1hPct = notifsRecentesTotal > 0 ? Math.round((notifsRecentesFailed / notifsRecentesTotal) * 100) : 0;

  // ── Santé 24h ──
  const tokensWithRecentNotif24h = allTokens.filter((t: any) => {
    if (!t.derniere_notif_date) return false;
    return (now - new Date(t.derniere_notif_date).getTime()) <= ONE_DAY_MS;
  });
  const notifs24hTotal = tokensWithRecentNotif24h.length;
  const notifs24hSuccess = tokensWithRecentNotif24h.filter((t: any) => t.derniere_notif_statut === 'success').length;
  const notifs24hFailed = tokensWithRecentNotif24h.filter((t: any) => t.derniere_notif_statut === 'failed').length;
  const tauxEchec24hPct = notifs24hTotal > 0 ? Math.round((notifs24hFailed / notifs24hTotal) * 100) : 0;

  // ── Tokens problématiques ──
  const tokensAvecErreurFcm = allTokens.filter((t: any) => t.actif && t.fcm_error).length;
  const tokensStale30j = allTokens.filter((t: any) => {
    if (!t.actif || !t.derniere_utilisation) return false;
    return (now - new Date(t.derniere_utilisation).getTime()) > THIRTY_DAYS_MS;
  }).length;

  // ── Livreurs joignables ──
  // Un livreur est "joignable" s'il a au moins 1 token actif sans erreur fatale
  const livreurTokenMap = new Map<string, any[]>();
  for (const t of allTokens) {
    if (t.user_type !== 'livreur' || !t.livreur_id) continue;
    if (!livreurTokenMap.has(t.livreur_id)) livreurTokenMap.set(t.livreur_id, []);
    livreurTokenMap.get(t.livreur_id)!.push(t);
  }

  // Charger les livreurs actifs
  const livreursActifs = await base44.asServiceRole.entities.Livreur.filter(
    { actif: true }, '-created_date', 500
  ).catch(() => []);

  const erreursFatales = ['UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH', 'QUOTA_EXCEEDED'];
  let livreursAvecTokenValide = 0;
  let livreursSansToken = 0;
  for (const livreur of livreursActifs) {
    const tokens = livreurTokenMap.get(livreur.id) || [];
    const validTokens = tokens.filter((t: any) =>
      t.actif && !erreursFatales.some(e => t.fcm_error && t.fcm_error.includes(e))
    );
    if (validTokens.length > 0) {
      livreursAvecTokenValide++;
    } else {
      livreursSansToken++;
    }
  }
  const livreursActifsTotal = livreursActifs.length;
  const tauxLivreursJoignablesPct = livreursActifsTotal > 0
    ? Math.round((livreursAvecTokenValide / livreursActifsTotal) * 100)
    : 0;

  // ── Détection des dégradations ──
  const degradations: PushDegradationItem[] = [];

  // D1: Taux d'échec élevé (> seuil sur 1h)
  if (notifsRecentesTotal >= 5 && tauxEchec1hPct >= config.tauxEchecElevePct && tauxEchec1hPct < config.tauxEchecCritiquePct) {
    degradations.push({
      type: PUSH_DEGRADATION_TYPES.TAUX_ECHEC_ELEVE,
      label: DEGRADATION_LABELS[PUSH_DEGRADATION_TYPES.TAUX_ECHEC_ELEVE],
      description: `${notifsRecentesFailed}/${notifsRecentesTotal} pushes ont échoué dans la dernière heure (${tauxEchec1hPct}%)`,
      metric_value: tauxEchec1hPct,
      metric_unit: '%',
    });
  }

  // D2: Taux d'échec critique (> seuil critique sur 1h)
  if (notifsRecentesTotal >= 5 && tauxEchec1hPct >= config.tauxEchecCritiquePct) {
    degradations.push({
      type: PUSH_DEGRADATION_TYPES.TAUX_ECHEC_CRITIQUE,
      label: DEGRADATION_LABELS[PUSH_DEGRADATION_TYPES.TAUX_ECHEC_CRITIQUE],
      description: `${notifsRecentesFailed}/${notifsRecentesTotal} pushes ont échoué dans la dernière heure (${tauxEchec1hPct}%) — risque de perte de courses`,
      metric_value: tauxEchec1hPct,
      metric_unit: '%',
    });
  }

  // D3: Accumulation de tokens invalides
  if (tokensAvecErreurFcm >= config.tokensInvalidesSeuil) {
    degradations.push({
      type: PUSH_DEGRADATION_TYPES.TOKENS_INVALIDES_ACCUMULATION,
      label: DEGRADATION_LABELS[PUSH_DEGRADATION_TYPES.TOKENS_INVALIDES_ACCUMULATION],
      description: `${tokensAvecErreurFcm} tokens actifs avec erreur FCM non résolue — nettoyage requis`,
      metric_value: tokensAvecErreurFcm,
      metric_unit: 'tokens',
    });
  }

  // D4: Livreurs injoignables
  const livreursInjoignablesPct = livreursActifsTotal > 0
    ? Math.round(((livreursActifsTotal - livreursAvecTokenValide) / livreursActifsTotal) * 100)
    : 0;
  if (livreursActifsTotal >= 5 && livreursInjoignablesPct >= config.livreursInjoignablesPct) {
    degradations.push({
      type: PUSH_DEGRADATION_TYPES.LIVREURS_INJOIGNABLES,
      label: DEGRADATION_LABELS[PUSH_DEGRADATION_TYPES.LIVREURS_INJOIGNABLES],
      description: `${livreursActifsTotal - livreursAvecTokenValide}/${livreursActifsTotal} livreurs actifs sont injoignables par push (${livreursInjoignablesPct}%)`,
      metric_value: livreursInjoignablesPct,
      metric_unit: '%',
    });
  }

  // D5: Tokens stale
  if (tokensStale30j >= config.tokensStaleSeuil) {
    degradations.push({
      type: PUSH_DEGRADATION_TYPES.TOKENS_STALE,
      label: DEGRADATION_LABELS[PUSH_DEGRADATION_TYPES.TOKENS_STALE],
      description: `${tokensStale30j} tokens actifs non utilisés depuis >30 jours — à nettoyer`,
      metric_value: tokensStale30j,
      metric_unit: 'tokens',
    });
  }

  // D6: Livreurs sans aucun token
  if (livreursSansToken >= 3) {
    degradations.push({
      type: PUSH_DEGRADATION_TYPES.AUCUN_TOKEN_LIVREUR,
      label: DEGRADATION_LABELS[PUSH_DEGRADATION_TYPES.AUCUN_TOKEN_LIVREUR],
      description: `${livreursSansToken} livreurs actifs n'ont aucun token push enregistré`,
      metric_value: livreursSansToken,
      metric_unit: 'livreurs',
    });
  }

  // ── Score et niveau ──
  const degradationScore = degradations.reduce((sum, d) => sum + (DEGRADATION_SCORES[d.type] || 0), 0);
  const niveau = degradationScore >= 40 ? 'critique' : degradationScore >= 15 ? 'a_surveiller' : 'sain';

  // ── Action recommandée ──
  let actionRecommandee = 'Aucune action requise';
  if (degradations.some(d => d.type === PUSH_DEGRADATION_TYPES.TAUX_ECHEC_CRITIQUE)) {
    actionRecommandee = 'Vérifier la configuration Firebase immédiatement';
  } else if (degradations.some(d => d.type === PUSH_DEGRADATION_TYPES.LIVREURS_INJOIGNABLES)) {
    actionRecommandee = 'Contacter les livreurs injoignables';
  } else if (degradations.some(d => d.type === PUSH_DEGRADATION_TYPES.TOKENS_INVALIDES_ACCUMULATION)) {
    actionRecommandee = 'Lancer le nettoyage des tokens';
  } else if (degradations.some(d => d.type === PUSH_DEGRADATION_TYPES.TAUX_ECHEC_ELEVE)) {
    actionRecommandee = 'Surveiller les erreurs FCM';
  } else if (degradations.some(d => d.type === PUSH_DEGRADATION_TYPES.AUCUN_TOKEN_LIVREUR)) {
    actionRecommandee = 'Vérifier l\'enregistrement des tokens livreur';
  }

  return {
    total_tokens: totalTokens,
    tokens_actifs: tokensActifs,
    tokens_inactifs: tokensInactifs,
    taux_actif_pct: tauxActifPct,
    tokens_android: tokensAndroid,
    tokens_ios: tokensIos,
    tokens_web: tokensWeb,
    tokens_livreurs: tokensLivreurs,
    tokens_clients: tokensClients,
    tokens_admins: tokensAdmins,
    tokens_partenaires: tokensPartenaires,
    notifs_recentes_total: notifsRecentesTotal,
    notifs_recentes_success: notifsRecentesSuccess,
    notifs_recentes_failed: notifsRecentesFailed,
    taux_echec_1h_pct: tauxEchec1hPct,
    notifs_24h_total: notifs24hTotal,
    notifs_24h_success: notifs24hSuccess,
    notifs_24h_failed: notifs24hFailed,
    taux_echec_24h_pct: tauxEchec24hPct,
    tokens_avec_erreur_fcm: tokensAvecErreurFcm,
    tokens_stale_30j: tokensStale30j,
    livreurs_actifs_total: livreursActifsTotal,
    livreurs_avec_token_valide: livreursAvecTokenValide,
    livreurs_sans_token: livreursSansToken,
    taux_livreurs_joignables_pct: tauxLivreursJoignablesPct,
    degradations,
    degradation_score: degradationScore,
    niveau,
    action_recommandee: actionRecommandee,
  };
}

/**
 * Synchronise les AdminInboxItem pour les dégradations push.
 * - Crée des alertes pour les dégradations critiques (avec déduplication temporelle)
 * - Archive les alertes dont la dégradation a disparu
 */
export async function syncPushHealthAlerts(base44: any, metrics: PushHealthMetrics, config: any) {
  // ── Charger les AdminInboxItem existants pour push ──
  const existingItems = await base44.asServiceRole.entities.AdminInboxItem.filter(
    {}, '-created_date', 500
  ).catch(() => []);

  const pushAlertItems = (existingItems || []).filter((item: any) =>
    item.deduplication_key && item.deduplication_key.startsWith('PUSH_DEGRADATION_')
  );

  // ── Archive les alertes dont la dégradation a disparu ──
  const activeDegradationTypes = new Set(metrics.degradations.map(d => d.type));
  for (const item of pushAlertItems) {
    if (item.status === 'archived') continue;
    const itemType = item.deduplication_key.replace('PUSH_DEGRADATION_', '');
    if (!activeDegradationTypes.has(itemType)) {
      await base44.asServiceRole.entities.AdminInboxItem.update(item.id, {
        status: 'archived',
      }).catch(() => {});
    }
  }

  // ── Crée des alertes pour les nouvelles dégradations ──
  // Déduplication temporelle : ne pas recréer une alerte si une existe déjà (même non archivée)
  for (const deg of metrics.degradations) {
    if (deg.type === PUSH_DEGRADATION_TYPES.TOKENS_STALE || deg.type === PUSH_DEGRADATION_TYPES.AUCUN_TOKEN_LIVREUR) {
      // Ces dégradations sont structurelles, pas urgentes — alerter seulement si niveau critique
      if (metrics.niveau !== 'critique') continue;
    }

    const dedupKey = `PUSH_DEGRADATION_${deg.type}`;
    const existing = pushAlertItems.find((item: any) => item.deduplication_key === dedupKey && item.status !== 'archived');
    if (existing) continue;

    const priority = metrics.degradation_score >= 60 ? 'P0' : metrics.degradation_score >= 30 ? 'P1' : 'P2';
    const title = `📡 Push: ${deg.label}`;
    const body = `${deg.description}. Score: ${metrics.degradation_score}. Action: ${metrics.action_recommandee}`;

    await base44.asServiceRole.entities.AdminInboxItem.create({
      type: 'system',
      priority,
      title,
      body,
      source_entity: 'NotificationToken',
      country_code: 'ALL',
      action_url: '/admin/fiabilite-push',
      status: 'unread',
      deduplication_key: dedupKey,
    }).catch(() => {});
  }
}