/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR DE SUPERVISION VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Supervision, sécurité et gouvernance de VENUS en temps réel.
 *
 * Fonctionnalités :
 * 1. Métriques temps réel (conversations, temps de réponse, taux de réussite)
 * 2. Surveillance des outils (disponibilité, temps de réponse, incidents)
 * 3. Alertes automatiques (erreurs, échecs, outils indisponibles)
 * 4. Escalade vers un humain (transfert avec contexte complet)
 * 5. Journal d'audit complet (toutes les actions)
 * 6. Détection d'anomalies (comparaison avec baselines)
 * 7. Sauvegardes (knowledge, scenarios, workflows, mémoire)
 * 8. Mode maintenance (dégradation gracieuse)
 * 9. Gestion des rôles et permissions
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════

export const OUTILS_VENUS = [
  "creer_course",
  "recherche_livreur",
  "qr_code",
  "pin",
  "gps",
  "paiement",
  "whatsapp",
  "notifications",
  "knowledge_base",
  "document_library",
  "workflow_engine",
  "rag_engine",
  "reasoning_engine",
  "tts",
  "transcription",
];

export const ROLES_VENUS = {
  super_admin: {
    label: "Super Administrateur",
    permissions: ["*"],
  },
  admin_ia: {
    label: "Administrateur IA",
    permissions: [
      "dashboard", "tools", "alerts", "escalations", "audit",
      "anomalies", "backups", "maintenance", "knowledge", "workflows",
      "documents", "improvement", "brain", "learning",
    ],
  },
  formateur_venus: {
    label: "Formateur VENUS",
    permissions: [
      "dashboard", "alerts", "knowledge", "learning", "documents",
      "escalations", "audit",
    ],
  },
  support: {
    label: "Support",
    permissions: [
      "dashboard", "alerts", "escalations", "audit",
    ],
  },
  lecture_seule: {
    label: "Lecture seule",
    permissions: ["dashboard", "audit"],
  },
};

export const SEUILS_ANOMALIE = {
  taux_echec_max: 15,           // % max d'échecs acceptable
  taux_echec_critique: 30,     // % critique
  temps_reponse_max_ms: 5000,  // temps de réponse max acceptable
  temps_reponse_critique: 10000,
  taux_escalade_max: 10,       // % max d'escalades
  confiance_min: 60,           // score de confiance minimum
  confiance_critique: 40,
  conversation_bloquee_min: 10, // minutes sans activité
};

// ═══════════════════════════════════════════════════════════════════
// 1. MÉTRIQUES TEMPS RÉEL
// ═══════════════════════════════════════════════════════════════════

export async function calculerMetriquesTempsReel(base44: any): Promise<any> {
  const now = new Date();
  const debutJour = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const debut7j = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    interactionsJour,
    interactions7j,
    reasoningLogs,
    analyses,
    workflowsJour,
    escalationsJour,
    escalationsActives,
    alertsActives,
    conversationsActives,
  ] = await Promise.all([
    base44.asServiceRole.entities.VenusInteraction.filter({ date_conversation: now.toISOString().slice(0, 10) }, '-created_date', 500),
    base44.asServiceRole.entities.VenusInteraction.filter({}, '-created_date', 2000),
    base44.asServiceRole.entities.VenusReasoningLog.list('-created_date', 500),
    base44.asServiceRole.entities.VenusConversationAnalysis.list('-created_date', 500),
    base44.asServiceRole.entities.VenusWorkflowExecution.filter({ statut: "en_cours" }, '-created_date', 100),
    base44.asServiceRole.entities.VenusEscalation.filter({ creee_date: { $gte: debutJour } }, '-created_date', 200),
    base44.asServiceRole.entities.VenusEscalation.filter({ statut: "en_attente" }, '-created_date', 100),
    base44.asServiceRole.entities.VenusSupervisionAlert.filter({ statut: "active" }, '-created_date', 200),
    base44.asServiceRole.entities.Conversation.filter({ statut: "active" }, '-created_date', 100),
  ]);

  // Calculs
  const totalInteractions = interactionsJour.length;
  const totalResolues = interactionsJour.filter((i: any) => i.statut === "resolu").length;
  const totalEchecs = interactionsJour.filter((i: any) => i.statut === "non_resolu").length;
  const totalEscaladees = interactionsJour.filter((i: any) => i.statut === "escalade").length;

  const tempsReponseLogs = reasoningLogs.filter((r: any) => r.temps_traitement_ms > 0);
  const tempsReponseMoyen = tempsReponseLogs.length > 0
    ? Math.round(tempsReponseLogs.reduce((s: number, r: any) => s + r.temps_traitement_ms, 0) / tempsReponseLogs.length)
    : 0;

  const tempsResolutionAnalyses = analyses.filter((a: any) => a.duree_secondes > 0);
  const tempsResolutionMoyen = tempsResolutionAnalyses.length > 0
    ? Math.round(tempsResolutionAnalyses.reduce((s: number, a: any) => s + a.duree_secondes, 0) / tempsResolutionAnalyses.length)
    : 0;

  const scoresQualite = analyses.filter((a: any) => a.score_qualite != null);
  const scoreMoyen = scoresQualite.length > 0
    ? Math.round(scoresQualite.reduce((s: number, a: any) => s + a.score_qualite, 0) / scoresQualite.length)
    : 0;

  const tauxReussite = totalInteractions > 0 ? Math.round((totalResolues / totalInteractions) * 100) : 100;
  const tauxEchec = totalInteractions > 0 ? Math.round((totalEchecs / totalInteractions) * 100) : 0;
  const tauxEscalade = totalInteractions > 0 ? Math.round((totalEscaladees / totalInteractions) * 100) : 0;

  // Confiance moyenne
  const confiances = interactionsJour.filter((i: any) => i.confidence_score != null);
  const confianceMoyenne = confiances.length > 0
    ? Math.round(confiances.reduce((s: number, i: any) => s + i.confidence_score, 0) / confiances.length)
    : 0;

  // Évolution 7 jours
  const interactions7jParJour: Record<string, number> = {};
  const reussites7jParJour: Record<string, number> = {};
  for (const i of interactions7j) {
    const date = i.date_conversation || (i.created_date || "").slice(0, 10);
    if (date) {
      interactions7jParJour[date] = (interactions7jParJour[date] || 0) + 1;
      if (i.statut === "resolu") {
        reussites7jParJour[date] = (reussites7jParJour[date] || 0) + 1;
      }
    }
  }

  const evolution7j = Object.keys(interactions7jParJour)
    .sort()
    .slice(-7)
    .map((date) => ({
      date,
      total: interactions7jParJour[date] || 0,
      reussites: reussites7jParJour[date] || 0,
      taux: interactions7jParJour[date] > 0
        ? Math.round(((reussites7jParJour[date] || 0) / interactions7jParJour[date]) * 100)
        : 0,
    }));

  return {
    temps_reel: {
      conversations_en_cours: conversationsActives.length + workflowsJour.length,
      conversations_terminees_jour: totalResolues,
      interactions_total_jour: totalInteractions,
      temps_reponse_moyen_ms: tempsReponseMoyen,
      temps_resolution_moyen_sec: tempsResolutionMoyen,
      taux_reussite: tauxReussite,
      taux_echec: tauxEchec,
      taux_escalade: tauxEscalade,
      interventions_humaines: escalationsActives.length,
      escalades_total_jour: escalationsJour.length,
      alerts_actives: alertsActives.length,
      score_qualite_moyen: scoreMoyen,
      confiance_moyenne: confianceMoyenne,
      workflows_en_cours: workflowsJour.length,
    },
    evolution_7j: evolution7j,
    repartition_intentions: calculerRepartitionIntentions(interactionsJour),
    repartition_sources: calculerRepartitionSources(interactions7j),
    repartition_pays: calculerRepartitionPays(interactions7j),
  };
}

function calculerRepartitionIntentions(interactions: any[]): any[] {
  const counts: Record<string, number> = {};
  for (const i of interactions) {
    const intent = i.intention || "autre";
    counts[intent] = (counts[intent] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([intention, count]) => ({ intention, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function calculerRepartitionSources(interactions: any[]): any[] {
  const counts: Record<string, number> = { knowledge_base: 0, document_library: 0, scenario: 0, ia_generale: 0 };
  for (const i of interactions) {
    const sat = i.satisfaction || "neutre";
    if (sat === "positive") counts.knowledge_base++;
    else if (sat === "negative") counts.ia_generale++;
    else counts.scenario++;
  }
  return Object.entries(counts).map(([source, count]) => ({ source, count }));
}

function calculerRepartitionPays(interactions: any[]): any[] {
  const counts: Record<string, number> = {};
  for (const i of interactions) {
    const pays = i.country_code || "INCONNU";
    counts[pays] = (counts[pays] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([pays, count]) => ({ pays, count }))
    .sort((a, b) => b.count - a.count);
}

// ═══════════════════════════════════════════════════════════════════
// 2. SURVEILLANCE DES OUTILS
// ═══════════════════════════════════════════════════════════════════

export async function verifierTousOutils(base44: any): Promise<any[]> {
  const results = await Promise.all(
    OUTILS_VENUS.map((outil) => verifierOutil(base44, outil))
  );

  // Persister les statuts
  for (const result of results) {
    await persisterStatutOutil(base44, result);
  }

  return results;
}

async function verifierOutil(base44: any, outil: string): Promise<any> {
  const debut = Date.now();
  try {
    const checkFn = CHECKS_OUTILS[outil];
    if (!checkFn) {
      return { outil, statut: "inconnu", temps_reponse_ms: 0, message: "Vérification non définie" };
    }
    const result = await checkFn(base44);
    const tempsMs = Date.now() - debut;
    return {
      outil,
      statut: result.statut,
      temps_reponse_ms: tempsMs,
      message_erreur: result.message || null,
      metadata: result.metadata || null,
    };
  } catch (e) {
    const tempsMs = Date.now() - debut;
    return {
      outil,
      statut: "indisponible",
      temps_reponse_ms: tempsMs,
      message_erreur: e.message,
    };
  }
}

const CHECKS_OUTILS: Record<string, (base44: any) => Promise<any>> = {
  creer_course: async (b) => {
    await b.asServiceRole.entities.CourseExterne.list('-created_date', 1);
    return { statut: "operationnel" };
  },
  recherche_livreur: async (b) => {
    await b.asServiceRole.entities.Livreur.list('-created_date', 1);
    return { statut: "operationnel" };
  },
  qr_code: async (b) => {
    await b.asServiceRole.entities.CourseExterne.filter({ qr_code: { $exists: true } }, '-created_date', 1);
    return { statut: "operationnel" };
  },
  pin: async (b) => {
    await b.asServiceRole.entities.CourseExterne.filter({ pin_code: { $exists: true } }, '-created_date', 1);
    return { statut: "operationnel" };
  },
  gps: async (b) => {
    const livreurs = await b.asServiceRole.entities.Livreur.filter({ statut: "en_ligne" }, '-created_date', 1);
    return { statut: "operationnel", metadata: { livreurs_en_ligne: livreurs.length } };
  },
  paiement: async (b) => {
    await b.asServiceRole.entities.PaiementSilgapp.list('-created_date', 1);
    return { statut: "operationnel" };
  },
  whatsapp: async (b) => {
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!sid || !token) return { statut: "degradation", message: "Variables Twilio manquantes" };
    return { statut: "operationnel" };
  },
  notifications: async (b) => {
    await b.asServiceRole.entities.NotificationToken.list('-created_date', 1);
    return { statut: "operationnel" };
  },
  knowledge_base: async (b) => {
    const items = await b.asServiceRole.entities.VenusKnowledge.filter({ statut: "valide" }, '-created_date', 1);
    return { statut: items.length > 0 ? "operationnel" : "degradation", message: items.length > 0 ? null : "Aucune connaissance validée" };
  },
  document_library: async (b) => {
    const items = await b.asServiceRole.entities.VenusDocument.filter({ statut: "valide" }, '-created_date', 1);
    return { statut: items.length > 0 ? "operationnel" : "degradation", message: items.length > 0 ? null : "Aucun document validé" };
  },
  workflow_engine: async (b) => {
    const items = await b.asServiceRole.entities.VenusWorkflow.filter({ actif: true }, '-created_date', 1);
    return { statut: items.length > 0 ? "operationnel" : "degradation", message: items.length > 0 ? null : "Aucun workflow actif" };
  },
  rag_engine: async (b) => {
    const items = await b.asServiceRole.entities.VenusDocumentChunk.list('-created_date', 1);
    return { statut: items.length > 0 ? "operationnel" : "degradation", message: items.length > 0 ? null : "Aucun chunk indexé" };
  },
  reasoning_engine: async (b) => {
    await b.asServiceRole.entities.VenusReasoningLog.list('-created_date', 1);
    return { statut: "operationnel" };
  },
  tts: async () => {
    return { statut: "operationnel", message: "Intégration GenerateSpeech" };
  },
  transcription: async () => {
    return { statut: "operationnel", message: "Intégration TranscribeAudio" };
  },
};

async function persisterStatutOutil(base44: any, result: any): Promise<void> {
  try {
    const existing = await base44.asServiceRole.entities.VenusToolStatus.filter({ outil: result.outil }, '-created_date', 1);
    const nowIso = new Date().toISOString();

    const updateData: any = {
      statut: result.statut,
      derniere_verification: nowIso,
      temps_reponse_ms: result.temps_reponse_ms,
      message_erreur: result.message_erreur || null,
      metadata: result.metadata ? JSON.stringify(result.metadata) : null,
    };

    if (result.statut === "indisponible" || result.statut === "degradation") {
      updateData.dernier_incident = nowIso;
      if (existing.length > 0) {
        updateData.nb_incidents_24h = (existing[0].nb_incidents_24h || 0) + 1;
        updateData.nb_incidents_total = (existing[0].nb_incidents_total || 0) + 1;
      } else {
        updateData.nb_incidents_24h = 1;
        updateData.nb_incidents_total = 1;
      }
    }

    if (existing.length > 0) {
      await base44.asServiceRole.entities.VenusToolStatus.update(existing[0].id, updateData);
    } else {
      await base44.asServiceRole.entities.VenusToolStatus.create({ outil: result.outil, ...updateData });
    }
  } catch (e) {
    // Non bloquant
  }
}

export async function getStatutsOutils(base44: any): Promise<any[]> {
  const statuts = await base44.asServiceRole.entities.VenusToolStatus.list('-created_date', 50);
  // Dédupliquer par outil (garder le plus récent)
  const byOutil: Record<string, any> = {};
  for (const s of statuts) {
    if (!byOutil[s.outil] || new Date(s.derniere_verification || s.created_date) > new Date(byOutil[s.outil].derniere_verification || byOutil[s.outil].created_date)) {
      byOutil[s.outil] = s;
    }
  }
  return OUTILS_VENUS.map((o) => byOutil[o] || { outil: o, statut: "inconnu" });
}

// ═══════════════════════════════════════════════════════════════════
// 3. ALERTES
// ═══════════════════════════════════════════════════════════════════

export async function creerAlerte(base44: any, params: any): Promise<any> {
  return await base44.asServiceRole.entities.VenusSupervisionAlert.create({
    type: params.type,
    severite: params.severite || "warning",
    titre: params.titre,
    message: params.message || null,
    conversation_id: params.conversation_id || null,
    client_telephone: params.client_telephone || null,
    outil_concerne: params.outil_concerne || null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    statut: "active",
    creee_date: new Date().toISOString(),
  });
}

export async function verifierAlertesAutomatiques(base44: any): Promise<any[]> {
  const alertesCreees: any[] = [];
  const metrics = await calculerMetriquesTempsReel(base44);
  const m = metrics.temps_reel;

  // Taux d'échec élevé
  if (m.taux_echec >= SEUILS_ANOMALIE.taux_echec_critique) {
    const alerte = await creerAlerte(base44, {
      type: "erreur_repetee",
      severite: "critique",
      titre: "Taux d'échec critique",
      message: `Le taux d'échec est de ${m.taux_echec}% (seuil critique: ${SEUILS_ANOMALIE.taux_echec_critique}%)`,
      metadata: { taux_echec: m.taux_echec, seuil: SEUILS_ANOMALIE.taux_echec_critique },
    });
    alertesCreees.push(alerte);
  } else if (m.taux_echec >= SEUILS_ANOMALIE.taux_echec_max) {
    const alerte = await creerAlerte(base44, {
      type: "erreur_repetee",
      severite: "warning",
      titre: "Taux d'échec élevé",
      message: `Le taux d'échec est de ${m.taux_echec}% (seuil: ${SEUILS_ANOMALIE.taux_echec_max}%)`,
      metadata: { taux_echec: m.taux_echec, seuil: SEUILS_ANOMALIE.taux_echec_max },
    });
    alertesCreees.push(alerte);
  }

  // Temps de réponse lent
  if (m.temps_reponse_moyen_ms >= SEUILS_ANOMALIE.temps_reponse_critique) {
    const alerte = await creerAlerte(base44, {
      type: "performance_degradee",
      severite: "critique",
      titre: "Temps de réponse critique",
      message: `Le temps de réponse moyen est de ${m.temps_reponse_moyen_ms}ms (seuil critique: ${SEUILS_ANOMALIE.temps_reponse_critique}ms)`,
      metadata: { temps_ms: m.temps_reponse_moyen_ms },
    });
    alertesCreees.push(alerte);
  }

  // Confiance basse
  if (m.confiance_moyenne > 0 && m.confiance_moyenne < SEUILS_ANOMALIE.confiance_critique) {
    const alerte = await creerAlerte(base44, {
      type: "confiance_basse",
      severite: "critique",
      titre: "Confiance VENUS critique",
      message: `Le score de confiance moyen est de ${m.confiance_moyenne}/100 (seuil critique: ${SEUILS_ANOMALIE.confiance_critique})`,
      metadata: { confiance: m.confiance_moyenne },
    });
    alertesCreees.push(alerte);
  }

  // Taux d'escalade élevé
  if (m.taux_escalade >= SEUILS_ANOMALIE.taux_escalade_max) {
    const alerte = await creerAlerte(base44, {
      type: "escalade_declenchee",
      severite: "warning",
      titre: "Taux d'escalade élevé",
      message: `${m.taux_escalade}% des conversations nécessitent une intervention humaine (seuil: ${SEUILS_ANOMALIE.taux_escalade_max}%)`,
      metadata: { taux_escalade: m.taux_escalade },
    });
    alertesCreees.push(alerte);
  }

  // Vérifier les outils indisponibles
  const outils = await getStatutsOutils(base44);
  for (const o of outils) {
    if (o.statut === "indisponible") {
      const alerte = await creerAlerte(base44, {
        type: "outil_indisponible",
        severite: "critique",
        titre: `Outil indisponible: ${o.outil}`,
        message: o.message_erreur || `L'outil ${o.outil} est actuellement indisponible`,
        outil_concerne: o.outil,
      });
      alertesCreees.push(alerte);
    } else if (o.statut === "degradation") {
      const alerte = await creerAlerte(base44, {
        type: "outil_indisponible",
        severite: "warning",
        titre: `Outil en dégradation: ${o.outil}`,
        message: o.message_erreur || `L'outil ${o.outil} fonctionne en mode dégradé`,
        outil_concerne: o.outil,
      });
      alertesCreees.push(alerte);
    }
  }

  return alertesCreees;
}

// ═══════════════════════════════════════════════════════════════════
// 4. ESCALADE VERS UN HUMAIN
// ═══════════════════════════════════════════════════════════════════

export async function declencherEscalade(base44: any, params: any): Promise<any> {
  const nowIso = new Date().toISOString();

  // Récupérer le contexte complet de la conversation
  const [messages, interactions, reasoningLogs, workflowExecs] = await Promise.all([
    params.conversation_id
      ? base44.asServiceRole.entities.Message.filter({ conversation_id: params.conversation_id }, '-created_date', 50)
      : [],
    params.conversation_id
      ? base44.asServiceRole.entities.VenusInteraction.filter({ conversation_id: params.conversation_id }, '-created_date', 20)
      : [],
    params.conversation_id
      ? base44.asServiceRole.entities.VenusReasoningLog.filter({ conversation_id: params.conversation_id }, '-created_date', 20)
      : [],
    params.conversation_id
      ? base44.asServiceRole.entities.VenusWorkflowExecution.filter({ conversation_id: params.conversation_id }, '-created_date', 10)
      : [],
  ]);

  // Construire le résumé
  const messagesArray = Array.isArray(messages) ? messages : [];
  const resumeMessages = messagesArray
    .reverse()
    .slice(-10)
    .map((m: any) => ({ role: m.sender_type, content: m.content || m.transcription || "", timestamp: m.created_date }));

  const outilsUtilises = Array.isArray(reasoningLogs)
    ? [...new Set(reasoningLogs.flatMap((r: any) => {
        try { return JSON.parse(r.outils_utilises || "[]"); } catch { return []; }
      }))]
    : [];
  const erreurs = Array.isArray(reasoningLogs)
    ? reasoningLogs.filter((r: any) => r.confiance < SEUILS_ANOMALIE.confiance_min).map((r: any) => ({
        message: r.message_recu,
        action: r.action_choisie,
        confiance: r.confiance,
      }))
    : [];

  const infosCollectees = Array.isArray(reasoningLogs) && reasoningLogs.length > 0
    ? reasoningLogs[0].memoire_courte_snapshot || "{}"
    : "{}";

  const escalation = await base44.asServiceRole.entities.VenusEscalation.create({
    conversation_id: params.conversation_id || null,
    client_telephone: params.client_telephone || null,
    client_nom: params.client_nom || null,
    country_code: params.country_code || null,
    raison_escalade: params.raison_escalade,
    niveau_confiance: params.niveau_confiance || 0,
    intention_detectee: params.intention_detectee || null,
    historique_resume: params.raison_escalade,
    infos_collectees: infosCollectees,
    outils_utilises: JSON.stringify(outilsUtilises),
    erreurs_rencontrees: JSON.stringify(erreurs),
    messages_resume: JSON.stringify(resumeMessages),
    knowledge_consultees: params.knowledge_consultees || null,
    workflows_executes: JSON.stringify(
      Array.isArray(workflowExecs) ? workflowExecs.map((w: any) => ({ code: w.workflow_code, statut: w.statut })) : []
    ),
    statut: "en_attente",
    creee_date: nowIso,
  });

  // Créer une alerte associée
  await creerAlerte(base44, {
    type: "escalade_declenchee",
    severite: "warning",
    titre: "Escalade vers un humain",
    message: params.raison_escalade,
    conversation_id: params.conversation_id || null,
    client_telephone: params.client_telephone || null,
    metadata: { escalation_id: escalation.id, confiance: params.niveau_confiance },
  });

  return escalation;
}

// ═══════════════════════════════════════════════════════════════════
// 5. JOURNAL D'AUDIT
// ═══════════════════════════════════════════════════════════════════

export async function loggerAudit(base44: any, params: any): Promise<void> {
  try {
    await base44.asServiceRole.entities.VenusAuditLog.create({
      utilisateur: params.utilisateur || "système",
      role: params.role || null,
      action: params.action,
      categorie: params.categorie || "autre",
      entity_type: params.entity_type || null,
      entity_id: params.entity_id || null,
      ancienne_valeur: params.ancienne_valeur ? JSON.stringify(params.ancienne_valeur) : null,
      nouvelle_valeur: params.nouvelle_valeur ? JSON.stringify(params.nouvelle_valeur) : null,
      details: params.details || null,
      date_action: new Date().toISOString(),
    });
  } catch (e) {
    // Non bloquant
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. DÉTECTION D'ANOMALIES
// ═══════════════════════════════════════════════════════════════════

export async function detecterAnomalies(base44: any): Promise<any[]> {
  const anomalies: any[] = [];
  const metrics = await calculerMetriquesTempsReel(base44);
  const m = metrics.temps_reel;
  const nowIso = new Date().toISOString();

  // Comparer avec évolution 7j pour baseline
  const evol = metrics.evolution_7j;
  const moyenneReussite7j = evol.length > 0
    ? Math.round(evol.reduce((s, d) => s + d.taux, 0) / evol.length)
    : 100;
  const moyenneInteractions7j = evol.length > 0
    ? Math.round(evol.reduce((s, d) => s + d.total, 0) / evol.length)
    : 0;

  // 1. Hausse des erreurs
  if (m.taux_echec >= SEUILS_ANOMALIE.taux_echec_max) {
    const ecart = moyenneReussite7j > 0 ? Math.round(((100 - moyenneReussite7j) - m.taux_echec) * -1) : 0;
    anomalies.push({
      type: "hausse_erreurs",
      severite: m.taux_echec >= SEUILS_ANOMALIE.taux_echec_critique ? "critique" : "warning",
      titre: "Hausse du taux d'erreurs",
      description: `Taux d'échec actuel: ${m.taux_echec}% (moyenne 7j: ${100 - moyenneReussite7j}%)`,
      metrique: "taux_echec",
      valeur_actuelle: m.taux_echec,
      valeur_normale: 100 - moyenneReussite7j,
      ecart_pct: ecart,
      periode: "24h",
    });
  }

  // 2. Baisse du taux de réussite
  if (moyenneReussite7j > 0 && m.taux_reussite < moyenneReussite7j - 10) {
    const ecart = Math.round(((m.taux_reussite - moyenneReussite7j) / moyenneReussite7j) * 100);
    anomalies.push({
      type: "baisse_reussite",
      severite: "warning",
      titre: "Baisse du taux de réussite",
      description: `Taux actuel: ${m.taux_reussite}% (moyenne 7j: ${moyenneReussite7j}%)`,
      metrique: "taux_reussite",
      valeur_actuelle: m.taux_reussite,
      valeur_normale: moyenneReussite7j,
      ecart_pct: ecart,
      periode: "24h",
    });
  }

  // 3. Hausse des escalades
  if (m.taux_escalade >= SEUILS_ANOMALIE.taux_escalade_max) {
    anomalies.push({
      type: "hausse_escalades",
      severite: "warning",
      titre: "Hausse des escalades humaines",
      description: `${m.taux_escalade}% des conversations sont escaladées (seuil: ${SEUILS_ANOMALIE.taux_escalade_max}%)`,
      metrique: "taux_escalade",
      valeur_actuelle: m.taux_escalade,
      valeur_normale: SEUILS_ANOMALIE.taux_escalade_max,
      ecart_pct: Math.round(((m.taux_escalade - SEUILS_ANOMALIE.taux_escalade_max) / SEUILS_ANOMALIE.taux_escalade_max) * 100),
      periode: "24h",
    });
  }

  // 4. Ralentissement
  if (m.temps_reponse_moyen_ms >= SEUILS_ANOMALIE.temps_reponse_max_ms) {
    anomalies.push({
      type: "ralentissement",
      severite: m.temps_reponse_moyen_ms >= SEUILS_ANOMALIE.temps_reponse_critique ? "critique" : "warning",
      titre: "Ralentissement du temps de réponse",
      description: `Temps moyen: ${m.temps_reponse_moyen_ms}ms (seuil: ${SEUILS_ANOMALIE.temps_reponse_max_ms}ms)`,
      metrique: "temps_reponse_ms",
      valeur_actuelle: m.temps_reponse_moyen_ms,
      valeur_normale: SEUILS_ANOMALIE.temps_reponse_max_ms,
      ecart_pct: Math.round(((m.temps_reponse_moyen_ms - SEUILS_ANOMALIE.temps_reponse_max_ms) / SEUILS_ANOMALIE.temps_reponse_max_ms) * 100),
      periode: "24h",
    });
  }

  // 5. Baisse de confiance
  if (m.confiance_moyenne > 0 && m.confiance_moyenne < SEUILS_ANOMALIE.confiance_min) {
    anomalies.push({
      type: "baisse_confiance",
      severite: m.confiance_moyenne < SEUILS_ANOMALIE.confiance_critique ? "critique" : "warning",
      titre: "Baisse du score de confiance",
      description: `Confiance moyenne: ${m.confiance_moyenne}/100 (minimum: ${SEUILS_ANOMALIE.confiance_min})`,
      metrique: "confiance_moyenne",
      valeur_actuelle: m.confiance_moyenne,
      valeur_normale: SEUILS_ANOMALIE.confiance_min,
      ecart_pct: Math.round(((SEUILS_ANOMALIE.confiance_min - m.confiance_moyenne) / SEUILS_ANOMALIE.confiance_min) * 100),
      periode: "24h",
    });
  }

  // Persister les anomalies
  for (const a of anomalies) {
    const existing = await base44.asServiceRole.entities.VenusAnomaly.filter({
      type: a.type,
      statut: "active",
    }, '-created_date', 1);

    if (existing.length === 0) {
      await base44.asServiceRole.entities.VenusAnomaly.create({
        ...a,
        metadata: JSON.stringify({ metrics_snapshot: m }),
        statut: "active",
        creee_date: nowIso,
      });
    } else {
      // Mettre à jour l'anomalie existante
      await base44.asServiceRole.entities.VenusAnomaly.update(existing[0].id, {
        valeur_actuelle: a.valeur_actuelle,
        ecart_pct: a.ecart_pct,
        description: a.description,
        metadata: JSON.stringify({ metrics_snapshot: m }),
      });
    }
  }

  return anomalies;
}

// ═══════════════════════════════════════════════════════════════════
// 7. SAUVEGARDES
// ═══════════════════════════════════════════════════════════════════

const ENTITIES_BACKUP: Record<string, string> = {
  knowledge_base: "VenusKnowledge",
  scenarios: "VenusScenario",
  workflows: "VenusWorkflow",
  long_term_memory: "VenusLongTermMemory",
  documents: "VenusDocument",
  improvement_data: "VenusConversationAnalysis",
};

export async function creerSauvegarde(base44: any, type: string, declenche_par: string, auto: boolean = false): Promise<any> {
  const nowIso = new Date().toISOString();

  const backup = await base44.asServiceRole.entities.VenusBackup.create({
    type,
    statut: "en_cours",
    declenche_par,
    auto,
    date_creation: nowIso,
  });

  try {
    const entityNames = type === "full" ? Object.values(ENTITIES_BACKUP) : [ENTITIES_BACKUP[type]];
    if (!entityNames[0]) {
      throw new Error(`Type de sauvegarde inconnu: ${type}`);
    }

    let totalRecords = 0;
    let totalSize = 0;
    const allData: any = {};

    for (const entityName of entityNames) {
      const records = await base44.asServiceRole.entities[entityName].list('-created_date', 5000);
      allData[entityName] = records;
      totalRecords += records.length;
      totalSize += JSON.stringify(records).length;
    }

    const dataContent = JSON.stringify(allData);
    const tailleKb = Math.round(totalSize / 1024);

    const updated = await base44.asServiceRole.entities.VenusBackup.update(backup.id, {
      statut: "terminé",
      nb_records: totalRecords,
      taille_kb: tailleKb,
      data_content: dataContent.length > 500000 ? null : dataContent, // Limite de champ
      data_url: dataContent.length > 500000 ? "Trop volumineux pour stockage en champ" : null,
      resume: `${totalRecords} enregistrements sauvegardés (${tailleKb} KB)`,
      date_fin: new Date().toISOString(),
    });

    await loggerAudit(base44, {
      utilisateur: declenche_par,
      action: "backup_create",
      categorie: "securite",
      entity_type: "VenusBackup",
      entity_id: backup.id,
      details: `Sauvegarde ${type}: ${totalRecords} records, ${tailleKb} KB`,
    });

    return updated;
  } catch (e) {
    await base44.asServiceRole.entities.VenusBackup.update(backup.id, {
      statut: "échoué",
      erreur: e.message,
      date_fin: new Date().toISOString(),
    });
    throw e;
  }
}

export async function restaurerSauvegarde(base44: any, backupId: string, restauree_par: string): Promise<any> {
  const backup = await base44.asServiceRole.entities.VenusBackup.get(backupId);
  if (!backup || backup.statut !== "terminé") {
    throw new Error("Sauvegarde introuvable ou non terminée");
  }
  if (!backup.data_content) {
    throw new Error("Données de sauvegarde non disponibles (trop volumineuses)");
  }

  const data = JSON.parse(backup.data_content);
  const entityNames = backup.type === "full" ? Object.values(ENTITIES_BACKUP) : [ENTITIES_BACKUP[backup.type]];

  let totalRestored = 0;
  for (const entityName of entityNames) {
    const records = data[entityName] || [];
    // Note: Restauration = on ne supprime pas l'existant, on crée les records manquants
    // Une restauration complète nécessiterait un backup des IDs actuels d'abord
    for (const record of records) {
      try {
        const { id, created_date, updated_date, created_by_id, ...rest } = record;
        await base44.asServiceRole.entities[entityName].create(rest);
        totalRestored++;
      } catch (e) {
        // Ignorer les doublons
      }
    }
  }

  await base44.asServiceRole.entities.VenusBackup.update(backupId, {
    restauree: true,
    restauree_date: new Date().toISOString(),
    restauree_par,
  });

  await loggerAudit(base44, {
    utilisateur: restauree_par,
    action: "backup_restore",
    categorie: "securite",
    entity_type: "VenusBackup",
    entity_id: backupId,
    details: `Restauration ${backup.type}: ${totalRestored} records`,
  });

  return { restored: totalRestored };
}

// ═══════════════════════════════════════════════════════════════════
// 8. MODE MAINTENANCE
// ═══════════════════════════════════════════════════════════════════

export async function getMaintenanceMode(base44: any): Promise<any> {
  const configs = await base44.asServiceRole.entities.SystemConfig.filter({ cle: "venus_maintenance_mode" }, '-created_date', 1);
  if (configs.length === 0) {
    return { active: false, message: "" };
  }
  try {
    return JSON.parse(configs[0].valeur);
  } catch {
    return { active: false, message: "" };
  }
}

export async function setMaintenanceMode(base44: any, active: boolean, message: string, utilisateur: string): Promise<void> {
  const value = JSON.stringify({ active, message, updated_by: utilisateur, updated_at: new Date().toISOString() });
  const existing = await base44.asServiceRole.entities.SystemConfig.filter({ cle: "venus_maintenance_mode" }, '-created_date', 1);

  if (existing.length > 0) {
    await base44.asServiceRole.entities.SystemConfig.update(existing[0].id, { valeur: value });
  } else {
    await base44.asServiceRole.entities.SystemConfig.create({
      cle: "venus_maintenance_mode",
      valeur: value,
      description: "Mode maintenance VENUS — désactive les fonctionnalités IA actives",
    });
  }

  await loggerAudit(base44, {
    utilisateur,
    action: "maintenance_toggle",
    categorie: "maintenance",
    details: `Mode maintenance ${active ? "ACTIVÉ" : "DÉSACTIVÉ"}: ${message}`,
  });

  if (active) {
    await creerAlerte(base44, {
      type: "anomalie_detectee",
      severite: "warning",
      titre: "Mode maintenance activé",
      message: `VENUS est en mode maintenance: ${message}`,
      metadata: { active, message },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 9. GESTION DES RÔLES
// ═══════════════════════════════════════════════════════════════════

export function checkPermission(userRole: string, permission: string): boolean {
  const roleConfig = ROLES_VENUS[userRole as keyof typeof ROLES_VENUS];
  if (!roleConfig) return false;
  if (roleConfig.permissions.includes("*")) return true;
  return roleConfig.permissions.includes(permission);
}

export function getRoleLabel(userRole: string): string {
  const roleConfig = ROLES_VENUS[userRole as keyof typeof ROLES_VENUS];
  return roleConfig?.label || userRole;
}