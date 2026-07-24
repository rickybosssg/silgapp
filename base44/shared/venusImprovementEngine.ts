/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR D'APPRENTISSAGE CONTINU VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Analyse les conversations, détecte les questions récurrentes,
 * génère des suggestions de connaissances, identifie les faiblesses,
 * et produit des rapports d'amélioration.
 *
 * PRINCIPE FONDAMENTAL: Ce moteur ne modifie JAMAIS automatiquement
 * les connaissances officielles. Toutes les suggestions doivent être
 * validées par un administrateur.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Seuils de configuration ──
const SEUIL_OCCURRENCE_QUESTION = 2;       // Nb min d'occurrences pour suggérer (abaissé pour apprentissage rapide sandbox)
const SEUIL_SCORE_BAS = 50;                 // Score < 50 = échec
const SEUIL_REFORMULATION_EXCESSIVE = 3;    // 3+ reformulations = problème
const SEUIL_INTERVENTION_HUMAINE = 0.15;    // 15%+ d'interventions humaines = alerte
const SEUIL_ERREUR_FREQUENTE = 0.25;        // 25%+ d'échecs sur un domaine = alerte

// ── Domaines de compétence ──
const DOMAINES = [
  'tarifs', 'expedition_colis', 'reception_colis', 'suivi_colis', 'gps',
  'prix_manuel', 'prix_automatique', 'annulation_course', 'paiement',
  'remboursement', 'compte_client', 'compte_livreur', 'inscription',
  'notifications', 'publicites', 'probleme_technique', 'comptabilite',
  'livraison_urgente', 'devenir_livreur', 'questions_generales',
  'pharmacies', 'restaurants', 'boutiques', 'qr_code', 'code_pin',
  'reclamations', 'autres',
];

// ═══════════════════════════════════════════════════════════════════
// 1. ANALYSE AUTOMATIQUE D'UNE CONVERSATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Analyse une conversation VENUS et produit un score qualité.
 * Utilise le LLM pour évaluer l'interaction selon 6 critères.
 */
export async function analyserConversation(base44: any, interaction: any): Promise<any> {
  const startTime = Date.now();

  // Vérifier qu'une analyse n'existe pas déjà
  const existing = await base44.asServiceRole.entities.VenusConversationAnalysis.filter(
    { interaction_id: interaction.id }
  );
  if (existing && existing.length > 0) {
    return existing[0];
  }

  // Charger les messages de la conversation pour contexte
  let messages: any[] = [];
  try {
    messages = await base44.asServiceRole.entities.Message.filter(
      { conversation_id: interaction.conversation_id },
      '-created_date', 20
    );
  } catch { messages = []; }

  const conversationText = messages.length > 0
    ? messages.reverse().map(m => `${m.sender_name}: ${m.content || m.transcription || `[${m.message_type}]`}`).join('\n')
    : `Q: ${interaction.question}\nR: ${interaction.reponse}`;

  const prompt = `Tu es un analyste qualité de VENUS, l'assistante SILGAPP. Analyse cette conversation et évalue sa qualité.

CONVERSATION:
${conversationText}

CATÉGORIE: ${interaction.categorie || 'non_specifiee'}
INTENTION: ${interaction.intention || 'non_specifiee'}
STATUT: ${interaction.statut}
SATISFACTION: ${interaction.satisfaction}
CONFIANCE: ${interaction.confidence_score || 'N/A'}
REFORMULATIONS: ${interaction.reformulations}
NB_MESSAGES: ${interaction.nb_messages}
DURÉE: ${interaction.duree_secondes}s

Évalue selon ces critères (0-100):
1. exactitude: La réponse était-elle factuellement correcte ?
2. clarte: La réponse était-elle claire et compréhensible ?
3. politesse: La réponse était-elle polie et chaleureuse ?
4. rapidite: Le temps de réponse était-il acceptable ? (bonus si <30s)
5. respect_regles: La réponse respecte-t-elle les règles métier SILGAPP ? (jamais inventer de prix, toujours confirmer les infos critiques, etc.)
6. satisfaction: Satisfaction probable du client ?

Détermine aussi:
- objectif_atteint: l'objectif du client a-t-il été atteint ?
- infos_suffisantes: les informations étaient-elles suffisantes ?
- incomprehensions: y a-t-il eu des incompréhensions ?
- intervention_humaine: un admin a-t-il dû prendre la main ?
- resume: résumé en une phrase
- points_amelioration: liste de points à améliorer [{point, severite: "basse"|"moyenne"|"haute"}]

Réponds UNIQUEMENT avec un JSON:`;

  try {
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          objectif_atteint: { type: 'boolean' },
          infos_suffisantes: { type: 'boolean' },
          incomprehensions: { type: 'boolean' },
          intervention_humaine: { type: 'boolean' },
          score_exactitude: { type: 'number' },
          score_clarte: { type: 'number' },
          score_politesse: { type: 'number' },
          score_rapidite: { type: 'number' },
          score_respect_regles: { type: 'number' },
          score_satisfaction: { type: 'number' },
          resume: { type: 'string' },
          points_amelioration: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                point: { type: 'string' },
                severite: { type: 'string' },
              },
            },
          },
        },
        required: ['objectif_atteint', 'score_exactitude', 'score_clarte', 'score_politesse', 'score_rapidite', 'score_respect_regles', 'score_satisfaction'],
      },
    });

    const result = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;

    // Score global = moyenne pondérée
    const scoreQualite = Math.round(
      (result.score_exactitude * 0.25) +
      (result.score_clarte * 0.15) +
      (result.score_politesse * 0.10) +
      (result.score_rapidite * 0.10) +
      (result.score_respect_regles * 0.25) +
      (result.score_satisfaction * 0.15)
    );

    const analysis = await base44.asServiceRole.entities.VenusConversationAnalysis.create({
      interaction_id: interaction.id,
      conversation_id: interaction.conversation_id,
      client_telephone: undefined,
      country_code: interaction.country_code,
      objectif_atteint: result.objectif_atteint,
      infos_suffisantes: result.infos_suffisantes,
      incomprehensions: result.incomprehensions,
      intervention_humaine: result.intervention_humaine,
      nb_reformulations: interaction.reformulations || 0,
      nb_messages: interaction.nb_messages || 1,
      duree_secondes: interaction.duree_secondes || 0,
      score_qualite: scoreQualite,
      score_exactitude: result.score_exactitude,
      score_clarte: result.score_clarte,
      score_politesse: result.score_politesse,
      score_rapidite: result.score_rapidite,
      score_respect_regles: result.score_respect_regles,
      score_satisfaction: result.score_satisfaction,
      intention: interaction.intention,
      categorie: interaction.categorie,
      resume: result.resume,
      points_amelioration: JSON.stringify(result.points_amelioration || []),
      analyse_date: new Date().toISOString(),
    });

    console.log(`[VenusImprovement] ✅ Analyse créée pour interaction ${interaction.id} — score: ${scoreQualite}`);
    return analysis;
  } catch (e: any) {
    console.error(`[VenusImprovement] ❌ Erreur analyse conversation ${interaction.id}:`, e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. DÉTECTION DES QUESTIONS RÉCURRENTES
// ═══════════════════════════════════════════════════════════════════

/**
 * Normalise une question pour le regroupement.
 * Supprime accents, ponctuation, et mots vides.
 */
export function normaliserQuestion(question: string): string {
  const stopWords = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'mais',
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles',
    'est', 'sont', 'a', 'au', 'aux', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes',
    'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'pour', 'par', 'avec', 'sans',
    'que', 'qui', 'quoi', 'comment', 'pourquoi', 'quand', 'ou', 'quel', 'quelle',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'in', 'on', 'at',
  ]);

  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .sort()
    .join(' ')
    .trim()
    .substring(0, 200);
}

/**
 * Détecte les questions récurrentes sur une période donnée.
 * Regroupe les questions similaires et identifie celles sans réponse officielle.
 */
export async function detecterQuestionsRecurrentes(base44: any, periodeJours: number = 7): Promise<any[]> {
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - periodeJours);
  const dateStr = dateDebut.toISOString().split('T')[0];

  // Récupérer les interactions de la période
  const interactions = await base44.asServiceRole.entities.VenusInteraction.filter(
    { date_conversation: { $gte: dateStr } },
    '-created_date', 500
  );

  if (!interactions || interactions.length === 0) {
    console.log('[VenusImprovement] Aucune interaction à analyser');
    return [];
  }

  // Grouper par question normalisée
  const groupes: Record<string, any[]> = {};
  for (const interaction of interactions) {
    const normalisee = normaliserQuestion(interaction.question || '');
    if (!normalisee || normalisee.length < 5) continue;

    if (!groupes[normalisee]) {
      groupes[normalisee] = [];
    }
    groupes[normalisee].push(interaction);
  }

  // Filtrer les groupes avec assez d'occurrences
  const questionsRecurrentes = Object.entries(groupes)
    .filter(([, items]) => items.length >= SEUIL_OCCURRENCE_QUESTION)
    .map(([normalisee, items]) => {
      // Prendre la question la plus récente comme représentante
      const repr = items[0];
      return {
        question_normalisee: normalisee,
        question_detectee: repr.question,
        occurrences: items.length,
        interactions: items,
        derniere_date: repr.created_date,
        reponse_actuelle: repr.reponse || '',
        categorie: repr.categorie,
        intention: repr.intention,
        confidence_moyenne: items.reduce((s, i) => s + (i.confidence_score || 0), 0) / items.length,
        statut_moyen: items.filter(i => i.statut === 'resolu').length / items.length,
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences);

  console.log(`[VenusImprovement] ${questionsRecurrentes.length} questions récurrentes détectées sur ${periodeJours} jours`);

  // Pour chaque question récurrente, vérifier si une connaissance officielle existe
  const connaissances = await base44.asServiceRole.entities.VenusKnowledge.filter(
    { statut: 'valide' }, '-created_date', 200
  );

  for (const qr of questionsRecurrentes) {
    // Vérifier si une connaissance couvre cette question
    const knowledgeMatch = connaissances.find(k =>
      k.question && normaliserQuestion(k.question).includes(qr.question_normalisee.substring(0, 30))
    );

    qr.is_nouvelle_question = !knowledgeMatch;
    qr.knowledge_existante_id = knowledgeMatch?.id;
    qr.knowledge_existante_titre = knowledgeMatch?.titre;

    // Créer ou mettre à jour la suggestion
    await creerOuMettreAJourSuggestion(base44, qr);
  }

  return questionsRecurrentes;
}

/**
 * Crée ou met à jour une suggestion de connaissance.
 */
async function creerOuMettreAJourSuggestion(base44: any, qr: any): Promise<void> {
  // Chercher une suggestion existante pour cette question
  const existing = await base44.asServiceRole.entities.VenusSuggestion.filter(
    { question_normalisee: qr.question_normalisee, statut: 'en_attente' }
  );

  if (existing && existing.length > 0) {
    // Mettre à jour
    await base44.asServiceRole.entities.VenusSuggestion.update(existing[0].id, {
      nb_occurrences: qr.occurrences,
      derniere_occurrence_date: qr.derniere_date,
      reponse_actuelle: qr.reponse_actuelle || 'Aucune réponse officielle',
      conversations_exemples: JSON.stringify(
        qr.interactions.slice(0, 5).map((i: any) => ({
          interaction_id: i.id,
          question: i.question,
          reponse: i.reponse?.substring(0, 200),
          date: i.date_conversation,
        }))
      ),
    });
    return;
  }

  // Déterminer la priorité
  let priorite = 'normale';
  if (qr.occurrences >= 10) priorite = 'critique';
  else if (qr.occurrences >= 5) priorite = 'haute';

  // Générer une réponse proposée via LLM
  let reponseProposee = '';
  let motsCles: string[] = [];
  try {
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Tu es VENUS, l'assistante SILGAPP. Un client pose fréquemment cette question: "${qr.question_detectee}"

Cette question a été posée ${qr.occurrences} fois. Génère une réponse officielle claire, concise et chaleureuse.

Règles SILGAPP:
- Ne JAMAIS inventer de prix
- Renvoyer vers le livreur pour les tarifs
- Être polie et professionnelle
- Répondre en français

Génère aussi 5 mots-clés pour cette question.

Réponds avec un JSON:`,
      response_json_schema: {
        type: 'object',
        properties: {
          reponse: { type: 'string' },
          mots_cles: { type: 'array', items: { type: 'string' } },
        },
        required: ['reponse', 'mots_cles'],
      },
    });
    const result = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
    reponseProposee = result.reponse;
    motsCles = result.mots_cles || [];
  } catch (e) {
    console.error('[VenusImprovement] Erreur génération suggestion:', e.message);
  }

  await base44.asServiceRole.entities.VenusSuggestion.create({
    question_detectee: qr.question_detectee,
    question_normalisee: qr.question_normalisee,
    nb_occurrences: qr.occurrences,
    reponse_actuelle: qr.reponse_actuelle || 'Aucune réponse officielle',
    reponse_proposee: reponseProposee,
    niveau_confiance: Math.round(qr.confidence_moyenne),
    priorite,
    statut: 'en_attente',
    categorie: qr.categorie || 'questions_generales',
    mots_cles: JSON.stringify(motsCles),
    conversations_exemples: JSON.stringify(
      qr.interactions.slice(0, 5).map((i: any) => ({
        interaction_id: i.id,
        question: i.question,
        reponse: i.reponse?.substring(0, 200),
        date: i.date_conversation,
      }))
    ),
    intention_detectee: qr.intention,
    is_nouvelle_question: qr.is_nouvelle_question,
    creee_date: new Date().toISOString(),
    derniere_occurrence_date: qr.derniere_date,
  });

  console.log(`[VenusImprovement] 💡 Suggestion créée: "${qr.question_detectee.substring(0, 60)}..." (${qr.occurrences} occurrences)`);
}

// ═══════════════════════════════════════════════════════════════════
// 3. DÉTECTION DES FAIBLESSES
// ═══════════════════════════════════════════════════════════════════

/**
 * Calcule les scores par domaine et identifie les faiblesses.
 */
export async function calculerFaiblesses(base44: any, periodeJours: number = 7): Promise<any[]> {
  const dateFin = new Date();
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - periodeJours);
  const dateDebutStr = dateDebut.toISOString().split('T')[0];
  const dateFinStr = dateFin.toISOString().split('T')[0];

  // Récupérer les analyses de la période
  const analyses = await base44.asServiceRole.entities.VenusConversationAnalysis.filter(
    {}, '-analyse_date', 1000
  );

  // Filtrer par date (analyse_date)
  const analysesPeriode = analyses.filter(a => {
    if (!a.analyse_date) return false;
    return new Date(a.analyse_date) >= dateDebut;
  });

  // Grouper par catégorie/domaine
  const parDomaine: Record<string, any[]> = {};
  for (const a of analysesPeriode) {
    const domaine = a.categorie || 'questions_generales';
    if (!parDomaine[domaine]) parDomaine[domaine] = [];
    parDomaine[domaine].push(a);
  }

  // Calculer les stats par domaine
  const faiblesses: any[] = [];
  for (const domaine of DOMAINES) {
    const items = parDomaine[domaine] || [];
    if (items.length === 0) continue;

    const total = items.length;
    const reussies = items.filter(a => a.objectif_atteint === true).length;
    const echouees = items.filter(a => a.objectif_atteint === false).length;
    const scoreMoyen = Math.round(items.reduce((s, a) => s + (a.score_qualite || 0), 0) / total);
    const reformulationsMoy = items.reduce((s, a) => s + (a.nb_reformulations || 0), 0) / total;
    const tempsMoyen = Math.round(items.reduce((s, a) => s + (a.duree_secondes || 0), 0) / total);
    const questionsSansReponse = items.filter(a => !a.infos_suffisantes).length;
    const tauxEchec = Math.round((echouees / total) * 100);

    // Récupérer le score précédent pour la tendance
    const rapportPrecedent = await base44.asServiceRole.entities.VenusWeaknessReport.filter(
      { domaine }, '-periode_fin', 1
    );
    const scorePrecedent = rapportPrecedent?.[0]?.score_moyen;
    let tendance = 'stable';
    if (scorePrecedent != null) {
      if (scoreMoyen > scorePrecedent + 5) tendance = 'amelioration';
      else if (scoreMoyen < scorePrecedent - 5) tendance = 'degradation';
    }

    // Supprimer l'ancien rapport pour cette période (si existe)
    const existing = await base44.asServiceRole.entities.VenusWeaknessReport.filter({
      domaine, periode_debut: dateDebutStr, periode_fin: dateFinStr,
    });
    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.VenusWeaknessReport.delete(existing[0].id);
    }

    await base44.asServiceRole.entities.VenusWeaknessReport.create({
      domaine,
      periode_debut: dateDebutStr,
      periode_fin: dateFinStr,
      total_conversations: total,
      conversations_reussies: reussies,
      conversations_echouees: echouees,
      taux_echec: tauxEchec,
      questions_sans_reponse: questionsSansReponse,
      reformulations_moyennes: Math.round(reformulationsMoy * 10) / 10,
      score_moyen: scoreMoyen,
      temps_moyen_resolution_sec: tempsMoyen,
      tendance,
      score_precedent: scorePrecedent,
      details: JSON.stringify({
        exemples_echecs: items.filter(a => !a.objectif_atteint).slice(0, 3).map(a => ({
          resume: a.resume, score: a.score_qualite,
        })),
      }),
    });

    faiblesses.push({
      domaine,
      total,
      reussies,
      echouees,
      taux_echec: tauxEchec,
      score_moyen: scoreMoyen,
      reformulations_moyennes: reformulationsMoy,
      temps_moyen_resolution_sec: tempsMoyen,
      tendance,
    });
  }

  // Trier par score croissant (les plus faibles d'abord)
  faiblesses.sort((a, b) => a.score_moyen - b.score_moyen);

  console.log(`[VenusImprovement] ${faiblesses.length} domaines analysés — top faiblesse: ${faiblesses[0]?.domaine || 'N/A'} (${faiblesses[0]?.score_moyen || 'N/A'})`);
  return faiblesses;
}

// ═══════════════════════════════════════════════════════════════════
// 4. DÉTECTION DES NOUVELLES INTENTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Détecte les intentions qui n'existent pas encore dans le système.
 */
export async function detecterNouvellesIntentions(base44: any, periodeJours: number = 7): Promise<any[]> {
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - periodeJours);
  const dateStr = dateDebut.toISOString().split('T')[0];

  const interactions = await base44.asServiceRole.entities.VenusInteraction.filter(
    { date_conversation: { $gte: dateStr } },
    '-created_date', 500
  );

  // Intentions connues
  const INTENTIONS_CONNUES = new Set([
    'creer_course', 'suivre_course', 'contacter_livreur', 'annuler_course',
    'modifier_info', 'demander_info', 'salutation', 'clarifier', 'autre',
  ]);

  // Grouper par intention
  const parIntention: Record<string, any[]> = {};
  for (const i of interactions) {
    const intention = i.intention || 'autre';
    if (!parIntention[intention]) parIntention[intention] = [];
    parIntention[intention].push(i);
  }

  // Filtrer les intentions non reconnues ou avec statut non_resolu
  const nouvellesIntentions = Object.entries(parIntention)
    .filter(([intention, items]) => {
      // Intention inconnue ou beaucoup de non résolu
      return !INTENTIONS_CONNUES.has(intention) ||
        (items.filter(i => i.statut === 'non_resolu').length / items.length > 0.3 && items.length >= 2);
    })
    .map(([intention, items]) => ({
      intention,
      occurrences: items.length,
      taux_echec: items.filter(i => i.statut === 'non_resolu').length / items.length,
      exemples: items.slice(0, 3).map(i => ({
        question: i.question?.substring(0, 150),
        date: i.date_conversation,
      })),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  console.log(`[VenusImprovement] ${nouvellesIntentions.length} nouvelles intentions détectées`);
  return nouvellesIntentions;
}

// ═══════════════════════════════════════════════════════════════════
// 5. VÉRIFICATION DES ALERTES
// ═══════════════════════════════════════════════════════════════════

/**
 * Vérifie les conditions d'alerte et crée des alertes si nécessaire.
 */
export async function verifierAlertesAmelioration(base44: any): Promise<any[]> {
  const nouvellesAlertes: any[] = [];

  // Récupérer les faiblesses récentes
  const faiblesses = await base44.asServiceRole.entities.VenusWeaknessReport.filter(
    {}, '-periode_fin', 30
  );

  // 1. Alerte: erreur fréquente sur un domaine
  for (const f of faiblesses) {
    if (f.taux_echec >= SEUIL_ERREUR_FREQUENTE * 100 && f.total_conversations >= 5) {
      const alerteExistante = await checkAlerteExistante(base44, 'erreur_frequente', f.domaine);
      if (!alerteExistante) {
        await base44.asServiceRole.entities.VenusImprovementAlert.create({
          type: 'erreur_frequente',
          severite: f.taux_echec >= 50 ? 'critique' : 'warning',
          titre: `Taux d'échec élevé: ${f.domaine}`,
          message: `${f.taux_echec}% d'échec sur ${f.total_conversations} conversations dans le domaine "${f.domaine}". Score moyen: ${f.score_moyen}/100.`,
          metadata: JSON.stringify({ domaine: f.domaine, taux_echec: f.taux_echec, total: f.total_conversations }),
          domaine: f.domaine,
          creee_date: new Date().toISOString(),
        });
        nouvellesAlertes.push({ type: 'erreur_frequente', domaine: f.domaine });
      }
    }
  }

  // 2. Alerte: score global bas
  const analysesRecentes = await base44.asServiceRole.entities.VenusConversationAnalysis.filter(
    {}, '-analyse_date', 50
  );
  if (analysesRecentes.length >= 10) {
    const scoreMoyen = analysesRecentes.reduce((s, a) => s + (a.score_qualite || 0), 0) / analysesRecentes.length;
    if (scoreMoyen < SEUIL_SCORE_BAS) {
      const alerteExistante = await checkAlerteExistante(base44, 'score_bas', null);
      if (!alerteExistante) {
        await base44.asServiceRole.entities.VenusImprovementAlert.create({
          type: 'score_bas',
          severite: 'critique',
          titre: 'Score qualité global bas',
          message: `Le score qualité moyen des ${analysesRecentes.length} dernières conversations est de ${Math.round(scoreMoyen)}/100. Une attention immédiate est requise.`,
          metadata: JSON.stringify({ score_moyen: scoreMoyen, total: analysesRecentes.length }),
          creee_date: new Date().toISOString(),
        });
        nouvellesAlertes.push({ type: 'score_bas' });
      }
    }
  }

  // 3. Alerte: reformulations excessives
  const reformulationsExcessives = analysesRecentes.filter(a => a.nb_reformulations >= SEUIL_REFORMULATION_EXCESSIVE);
  if (reformulationsExcessives.length >= 5) {
    const taux = reformulationsExcessives.length / analysesRecentes.length;
    const alerteExistante = await checkAlerteExistante(base44, 'reformulation_excessive', null);
    if (!alerteExistante) {
      await base44.asServiceRole.entities.VenusImprovementAlert.create({
        type: 'reformulation_excessive',
        severite: 'warning',
        titre: 'Reformulations excessives détectées',
        message: `${reformulationsExcessives.length} conversations sur ${analysesRecentes.length} (${Math.round(taux * 100)}%) ont nécessité 3+ reformulations. VENUS a des difficultés de compréhension.`,
        metadata: JSON.stringify({ count: reformulationsExcessives.length, taux }),
        creee_date: new Date().toISOString(),
      });
      nouvellesAlertes.push({ type: 'reformulation_excessive' });
    }
  }

  // 4. Alerte: intervention humaine fréquente
  const interventionsHumaines = analysesRecentes.filter(a => a.intervention_humaine === true);
  if (analysesRecentes.length >= 10) {
    const tauxIntervention = interventionsHumaines.length / analysesRecentes.length;
    if (tauxIntervention >= SEUIL_INTERVENTION_HUMAINE) {
      const alerteExistante = await checkAlerteExistante(base44, 'intervention_humaine_frequente', null);
      if (!alerteExistante) {
        await base44.asServiceRole.entities.VenusImprovementAlert.create({
          type: 'intervention_humaine_frequente',
          severite: 'warning',
          titre: 'Interventions humaines fréquentes',
          message: `${Math.round(tauxIntervention * 100)}% des conversations ont nécessité une intervention humaine. VENUS peut avoir besoin de meilleures connaissances.`,
          metadata: JSON.stringify({ taux: tauxIntervention, count: interventionsHumaines.length }),
          creee_date: new Date().toISOString(),
        });
        nouvellesAlertes.push({ type: 'intervention_humaine_frequente' });
      }
    }
  }

  // 5. Alerte: nouvelles questions fréquentes
  const suggestionsEnAttente = await base44.asServiceRole.entities.VenusSuggestion.filter(
    { statut: 'en_attente', is_nouvelle_question: true }
  );
  const suggestionsCritiques = suggestionsEnAttente.filter(s => s.priorite === 'critique' || s.priorite === 'haute');
  if (suggestionsCritiques.length >= 3) {
    const alerteExistante = await checkAlerteExistante(base44, 'question_nouvelle', null);
    if (!alerteExistante) {
      await base44.asServiceRole.entities.VenusImprovementAlert.create({
        type: 'question_nouvelle',
        severite: 'warning',
        titre: `${suggestionsCritiques.length} nouvelles questions fréquentes sans réponse`,
        message: `${suggestionsCritiques.length} questions reviennent fréquemment sans connaissance officielle. Consultez les suggestions pour les valider.`,
        metadata: JSON.stringify({ count: suggestionsCritiques.length, suggestion_ids: suggestionsCritiques.map(s => s.id) }),
        creee_date: new Date().toISOString(),
      });
      nouvellesAlertes.push({ type: 'question_nouvelle' });
    }
  }

  console.log(`[VenusImprovement] ${nouvellesAlertes.length} nouvelles alertes créées`);
  return nouvellesAlertes;
}

async function checkAlerteExistante(base44: any, type: string, domaine: string | null): Promise<boolean> {
  const filtre: any = { type, resolue: false };
  if (domaine) filtre.domaine = domaine;
  const existing = await base44.asServiceRole.entities.VenusImprovementAlert.filter(filtre, '-creee_date', 1);
  return existing && existing.length > 0;
}

// ═══════════════════════════════════════════════════════════════════
// 6. GÉNÉRATION DE RAPPORTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Génère un rapport d'amélioration complet.
 */
export async function genererRapportAmelioration(base44: any, type: 'quotidien' | 'hebdomadaire' | 'mensuel'): Promise<any> {
  const periodeJours = type === 'quotidien' ? 1 : type === 'hebdomadaire' ? 7 : 30;
  const dateFin = new Date();
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - periodeJours);
  const dateDebutStr = dateDebut.toISOString().split('T')[0];
  const dateFinStr = dateFin.toISOString().split('T')[0];

  // Récupérer les analyses
  const analyses = await base44.asServiceRole.entities.VenusConversationAnalysis.filter(
    {}, '-analyse_date', 2000
  );
  const analysesPeriode = analyses.filter(a => {
    if (!a.analyse_date) return false;
    return new Date(a.analyse_date) >= dateDebut;
  });

  const total = analysesPeriode.length;
  const reussites = analysesPeriode.filter(a => a.objectif_atteint === true).length;
  const echecs = analysesPeriode.filter(a => a.objectif_atteint === false).length;
  const scoreMoyen = total > 0 ? Math.round(analysesPeriode.reduce((s, a) => s + (a.score_qualite || 0), 0) / total) : 0;
  const tempsMoyen = total > 0 ? Math.round(analysesPeriode.reduce((s, a) => s + (a.duree_secondes || 0), 0) / total) : 0;

  // Points forts et faibles
  const parDomaine: Record<string, any[]> = {};
  for (const a of analysesPeriode) {
    const d = a.categorie || 'questions_generales';
    if (!parDomaine[d]) parDomaine[d] = [];
    parDomaine[d].push(a);
  }

  const domainesStats = Object.entries(parDomaine).map(([domaine, items]) => ({
    domaine,
    score: Math.round(items.reduce((s, a) => s + (a.score_qualite || 0), 0) / items.length),
    total_conversations: items.length,
    taux_echec: Math.round(items.filter(a => !a.objectif_atteint).length / items.length * 100),
  }));

  const pointsForts = domainesStats.filter(d => d.total_conversations >= 3).sort((a, b) => b.score - a.score).slice(0, 5);
  const pointsFaibles = domainesStats.filter(d => d.total_conversations >= 3).sort((a, b) => a.score - b.score).slice(0, 5);

  // Intentions détectées
  const interactions = await base44.asServiceRole.entities.VenusInteraction.filter(
    { date_conversation: { $gte: dateDebutStr } }, '-created_date', 1000
  );
  const intentions: Record<string, number> = {};
  for (const i of interactions) {
    const intention = i.intention || 'autre';
    intentions[intention] = (intentions[intention] || 0) + 1;
  }
  const intentionsDetectees = Object.entries(intentions).map(([intention, count]) => ({ intention, count })).sort((a, b) => b.count - a.count);

  // Suggestions
  const suggestions = await base44.asServiceRole.entities.VenusSuggestion.filter({}, '-creee_date', 500);
  const suggestionsPeriode = suggestions.filter(s => s.creee_date && new Date(s.creee_date) >= dateDebut);
  const suggestionsValidees = suggestionsPeriode.filter(s => s.statut === 'validee' || s.statut === 'fusionnee').length;

  // Corrections
  const corrections = await base44.asServiceRole.entities.VenusCorrection.filter({}, '-created_date', 500);
  const correctionsPeriode = corrections.filter(c => c.created_date && new Date(c.created_date) >= dateDebut);
  const correctionsValidees = correctionsPeriode.filter(c => c.statut === 'validee' || c.statut === 'appliquee').length;

  // Nouvelles questions
  const questionsNouvelles = suggestionsPeriode.filter(s => s.is_nouvelle_question).map(s => ({
    question: s.question_detectee,
    count: s.nb_occurrences,
  })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Nouvelles intentions
  const nouvellesIntentions = await detecterNouvellesIntentions(base44, periodeJours);

  // Connaissances les plus utilisées
  const connaissancesUtilisees: Record<string, { knowledge_id: string; titre: string; count: number }> = {};
  for (const i of interactions) {
    if (i.knowledge_id && i.knowledge_id !== 'null' && i.knowledge_id.length > 5) {
      if (!connaissancesUtilisees[i.knowledge_id]) {
        try {
          const k = await base44.asServiceRole.entities.VenusKnowledge.get(i.knowledge_id);
          if (k) {
            connaissancesUtilisees[i.knowledge_id] = { knowledge_id: i.knowledge_id, titre: k.titre || 'N/A', count: 0 };
          }
        } catch { /* skip invalid knowledge_id */ }
      }
      if (connaissancesUtilisees[i.knowledge_id]) {
        connaissancesUtilisees[i.knowledge_id].count++;
      }
    }
  }
  const connaissancesTop = Object.values(connaissancesUtilisees).sort((a, b) => b.count - a.count).slice(0, 10);

  // Améliorations proposées
  const ameliorationsProposees = pointsFaibles.map(pf => ({
    description: `Améliorer les réponses dans le domaine "${pf.domaine}" (score: ${pf.score}/100, ${pf.taux_echec}% d'échec)`,
    priorite: pf.score < 40 ? 'critique' : pf.score < 60 ? 'haute' : 'normale',
    domaine: pf.domaine,
  }));

  // Résumé exécutif
  const tauxReussite = total > 0 ? Math.round((reussites / total) * 100) : 0;
  const resumeExecutif = `${total} conversations analysées sur ${periodeJours} jour(s). ` +
    `Taux de réussite: ${tauxReussite}%. Score moyen: ${scoreMoyen}/100. ` +
    `${suggestionsPeriode.length} suggestions générées, ${suggestionsValidees} validées. ` +
    `${pointsFaibles.length > 0 ? `Domaine à améliorer en priorité: ${pointsFaibles[0].domaine} (${pointsFaibles[0].score}/100).` : 'Aucune faiblesse majeure détectée.'}`;

  // Supprimer l'ancien rapport pour cette période
  const existing = await base44.asServiceRole.entities.VenusImprovementReport.filter({
    type_rapport: type, periode_debut: dateDebutStr, periode_fin: dateFinStr,
  });
  if (existing && existing.length > 0) {
    await base44.asServiceRole.entities.VenusImprovementReport.delete(existing[0].id);
  }

  const rapport = await base44.asServiceRole.entities.VenusImprovementReport.create({
    type_rapport: type,
    periode_debut: dateDebutStr,
    periode_fin: dateFinStr,
    total_conversations: total,
    total_reussites: reussites,
    total_echecs: echecs,
    taux_reussite: tauxReussite,
    intentions_detectees: JSON.stringify(intentionsDetectees),
    questions_nouvelles: JSON.stringify(questionsNouvelles),
    suggestions_generees: suggestionsPeriode.length,
    suggestions_validees: suggestionsValidees,
    corrections_validees: correctionsValidees,
    temps_moyen_resolution_sec: tempsMoyen,
    score_moyen_global: scoreMoyen,
    points_forts: JSON.stringify(pointsForts),
    points_faibles: JSON.stringify(pointsFaibles),
    ameliorations_proposees: JSON.stringify(ameliorationsProposees),
    connaissances_les_plus_utilisees: JSON.stringify(connaissancesTop),
    scenarios_les_plus_utilises: JSON.stringify([]),
    nouvelles_intentions: JSON.stringify(nouvellesIntentions),
    resume_executif: resumeExecutif,
    genere_par: 'system',
  });

  console.log(`[VenusImprovement] 📊 Rapport ${type} généré — ${total} conversations, score: ${scoreMoyen}/100`);
  return rapport;
}

// ═══════════════════════════════════════════════════════════════════
// 7. ACTIONS ADMIN (validation de suggestions)
// ═══════════════════════════════════════════════════════════════════

/**
 * Valide une suggestion en créant une connaissance officielle.
 */
export async function validerSuggestion(base44: any, suggestionId: string, adminEmail: string, modifications?: any): Promise<any> {
  const suggestion = await base44.asServiceRole.entities.VenusSuggestion.get(suggestionId);
  if (!suggestion) throw new Error('Suggestion non trouvée');

  // Créer la connaissance officielle
  const knowledge = await base44.asServiceRole.entities.VenusKnowledge.create({
    titre: modifications?.titre || suggestion.question_detectee.substring(0, 100),
    categorie: modifications?.categorie || suggestion.categorie || 'questions_generales',
    question: suggestion.question_detectee,
    reponse_officielle: modifications?.reponse_proposee || suggestion.reponse_proposee,
    mots_cles: modifications?.mots_cles || suggestion.mots_cles,
    pays: 'ALL',
    langue: 'fr',
    priorite: suggestion.priorite,
    auteur: adminEmail,
    version: 1,
    statut: 'valide',
  });

  // Marquer la suggestion comme validée
  await base44.asServiceRole.entities.VenusSuggestion.update(suggestionId, {
    statut: 'validee',
    validee_par: adminEmail,
    validee_at: new Date().toISOString(),
    knowledge_id_cree: knowledge.id,
    reponse_proposee: modifications?.reponse_proposee || suggestion.reponse_proposee,
  });

  // Créer une version
  await base44.asServiceRole.entities.VenusKnowledgeVersion.create({
    knowledge_id: knowledge.id,
    version: 1,
    donnees: JSON.stringify(knowledge),
    auteur: adminEmail,
    action: 'create',
  });

  // Audit
  await base44.asServiceRole.entities.VenusAudit.create({
    utilisateur: adminEmail,
    action: 'create',
    entite_type: 'knowledge',
    entite_id: knowledge.id,
    nouvelle_valeur: JSON.stringify(knowledge),
    details: `Créée depuis suggestion ${suggestionId} (${suggestion.nb_occurrences} occurrences)`,
  });

  console.log(`[VenusImprovement] ✅ Suggestion ${suggestionId} validée → connaissance ${knowledge.id}`);
  return knowledge;
}

/**
 * Fusionne une suggestion avec une connaissance existante.
 */
export async function fusionnerSuggestion(base44: any, suggestionId: string, knowledgeId: string, adminEmail: string): Promise<any> {
  const suggestion = await base44.asServiceRole.entities.VenusSuggestion.get(suggestionId);
  if (!suggestion) throw new Error('Suggestion non trouvée');

  const knowledge = await base44.asServiceRole.entities.VenusKnowledge.get(knowledgeId);
  if (!knowledge) throw new Error('Connaissance non trouvée');

  // Mettre à jour la connaissance avec les mots-clés de la suggestion
  const existingMotsCles = JSON.parse(knowledge.mots_cles || '[]');
  const suggestionMotsCles = JSON.parse(suggestion.mots_cles || '[]');
  const mergedMotsCles = [...new Set([...existingMotsCles, ...suggestionMotsCles])];

  await base44.asServiceRole.entities.VenusKnowledge.update(knowledgeId, {
    mots_cles: JSON.stringify(mergedMotsCles),
    version: (knowledge.version || 1) + 1,
  });

  // Marquer la suggestion comme fusionnée
  await base44.asServiceRole.entities.VenusSuggestion.update(suggestionId, {
    statut: 'fusionnee',
    validee_par: adminEmail,
    validee_at: new Date().toISOString(),
    knowledge_id_fusion: knowledgeId,
  });

  console.log(`[VenusImprovement] 🔀 Suggestion ${suggestionId} fusionnée avec connaissance ${knowledgeId}`);
  return knowledge;
}

/**
 * Refuse une suggestion.
 */
export async function refuserSuggestion(base44: any, suggestionId: string, adminEmail: string, motif: string): Promise<void> {
  await base44.asServiceRole.entities.VenusSuggestion.update(suggestionId, {
    statut: 'refusee',
    refusee_par: adminEmail,
    refusee_motif: motif,
  });
  console.log(`[VenusImprovement] ❌ Suggestion ${suggestionId} refusée: ${motif}`);
}