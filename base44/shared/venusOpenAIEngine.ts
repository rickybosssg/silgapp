/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR OPENAI VENUS — Intelligence linguistique + function calling
 * ═══════════════════════════════════════════════════════════════════
 *
 * Architecture :
 *   Client → VENUS → RAG v2 SILGAPP → API OpenAI → réponse client
 *
 * Principes :
 * 1. Le RAG reste la source de connaissances (passé dans le prompt)
 * 2. OpenAI apporte la compréhension linguistique et le function calling
 * 3. Les outils en lecture seule sont exécutés directement (données réelles)
 * 4. Les actions d'écriture (créer/annuler course) passent par le champ `action`
 *    → le webhook exécute avec vérification DB obligatoire
 * 5. Interrupteur SystemConfig : VENUS_OPENAI_ENABLED = 'true' / 'false'
 * 6. Fallback automatique vers InvokeLLM (Base44) si OpenAI échoue
 * 7. Zéro hallucination : OpenAI ne répond qu'avec les données du RAG et des outils
 *
 * Coût : ~$0.002/tour avec gpt-4.1-mini
 * ═══════════════════════════════════════════════════════════════════
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4.1-mini';
const MAX_TOOL_ROUNDS = 3;

// ── Cache SystemConfig (30 secondes) ──
const CONFIG_CACHE: { enabled: boolean | null; expires: number } = { enabled: null, expires: 0 };

/**
 * Vérifie si OpenAI est activé via SystemConfig.
 * L'admin peut désactiver instantanément en passant VENUS_OPENAI_ENABLED à 'false'.
 */
export async function isOpenAIEnabled(base44: any): Promise<boolean> {
  if (CONFIG_CACHE.enabled !== null && Date.now() < CONFIG_CACHE.expires) {
    return CONFIG_CACHE.enabled;
  }
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({ cle: 'VENUS_OPENAI_ENABLED' });
    const enabled = configs?.[0]?.valeur === 'true';
    CONFIG_CACHE.enabled = enabled;
    CONFIG_CACHE.expires = Date.now() + 30000;
    return enabled;
  } catch {
    CONFIG_CACHE.enabled = false;
    CONFIG_CACHE.expires = Date.now() + 30000;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// DÉFINITION DES OUTILS (function calling OpenAI)
// ═══════════════════════════════════════════════════════════════════
// Uniquement des outils en LECTURE SEULE — les actions d'écriture
// (créer/annuler course, rechercher livreur) passent par le champ `action`
// du RAISONNEMENT_SCHEMA, exécuté par le webhook avec vérification DB.

const SILGAPP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'consulter_statut_course',
      description: "Consulter le statut réel d'une course active du client. Retourne le statut, le livreur, le prix et le lien de suivi. NE JAMAIS inventer un statut — utiliser cet outil.",
      parameters: {
        type: 'object',
        properties: {
          telephone: { type: 'string', description: 'Numéro de téléphone du client' },
        },
        required: ['telephone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consulter_tarifs',
      description: "Obtenir les tarifs officiels SILGAPP pour le pays du client (prix/km, minimum, devise, rayon). NE JAMAIS inventer un prix — utiliser cet outil.",
      parameters: {
        type: 'object',
        properties: {
          country_code: { type: 'string', description: 'Code pays (BF, CI, TG, etc.)' },
        },
        required: ['country_code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'contacter_livreur',
      description: "Obtenir les coordonnées réelles du livreur assigné à la course active du client.",
      parameters: {
        type: 'object',
        properties: {
          telephone: { type: 'string', description: 'Numéro de téléphone du client' },
        },
        required: ['telephone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consulter_commande',
      description: "Récupérer les informations d'une commande boutique ou restaurant.",
      parameters: {
        type: 'object',
        properties: {
          commande_id: { type: 'string', description: 'ID de la commande' },
        },
        required: ['commande_id'],
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════
// EXÉCUTION DES OUTILS (lecture seule — données réelles de la DB)
// ═══════════════════════════════════════════════════════════════════

async function executeToolCall(base44: any, toolName: string, args: any, ctx: any): Promise<string> {
  const start = Date.now();
  console.log(`[OpenAIEngine] 🔧 Appel outil: ${toolName} | args: ${JSON.stringify(args).substring(0, 100)}`);
  try {
    switch (toolName) {
      case 'consulter_statut_course': {
        const tel = args.telephone || ctx.telephone;
        const telDigits = (tel || '').replace(/\D/g, '');

        let courses = await base44.asServiceRole.entities.CourseExterne.filter(
          { client_telephone: tel }, '-created_date', 5
        );
        if (!courses || courses.length === 0) {
          courses = await base44.asServiceRole.entities.CourseExterne.filter(
            { expediteur_telephone: tel }, '-created_date', 5
          );
        }
        // Fallback par derniers chiffres
        if (!courses || courses.length === 0) {
          const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
            { country_code: ctx.countryCode }, '-created_date', 30
          );
          courses = (allRecent || []).filter(c => {
            const ct = (c.client_telephone || '').replace(/\D/g, '');
            const et = (c.expediteur_telephone || '').replace(/\D/g, '');
            return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
          }).slice(0, 5);
        }

        const STATUTS_ACTIFS = ['nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route',
          'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge',
          'en_livraison', 'arrivee'];
        const active = (courses || []).find(c => STATUTS_ACTIFS.includes(c.statut));

        if (!active) {
          return JSON.stringify({ trouve: false, message: 'Aucune course active trouvée pour ce client.' });
        }

        return JSON.stringify({
          trouve: true,
          id: active.id,
          ref: active.id?.slice(-6).toUpperCase(),
          statut: active.statut,
          type_course: active.type_course,
          adresse_depart: active.adresse_depart,
          adresse_arrivee: active.adresse_arrivee,
          prix: active.prix_final || active.prix_estimate,
          devise: active.devise,
          livreur_nom: active.livreur_nom || null,
          livreur_telephone: active.livreur_telephone || null,
          tracking_link: active.tracking_link || null,
          temps_ms: Date.now() - start,
        });
      }

      case 'consulter_tarifs': {
        return JSON.stringify({
          pays: ctx.countryCode,
          prix_km: ctx.tarifs?.prix_km,
          minimum: ctx.tarifs?.minimum,
          devise: ctx.tarifs?.devise,
          rayon_km: ctx.tarifs?.rayon || 30,
          commission_silga: '30%',
          gain_livreur: '70%',
        });
      }

      case 'contacter_livreur': {
        const tel = args.telephone || ctx.telephone;
        let courses = await base44.asServiceRole.entities.CourseExterne.filter(
          { client_telephone: tel }, '-created_date', 5
        );
        const STATUTS_ACTIFS = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere',
          'pris_en_charge', 'en_livraison', 'arrivee'];
        const active = (courses || []).find(c => STATUTS_ACTIFS.includes(c.statut) && c.livreur_telephone);

        if (!active) {
          return JSON.stringify({ trouve: false, message: 'Aucun livreur assigné pour le moment.' });
        }
        return JSON.stringify({
          trouve: true,
          livreur_nom: active.livreur_nom,
          livreur_telephone: active.livreur_telephone,
          tracking_link: active.tracking_link || null,
        });
      }

      case 'consulter_commande': {
        const cmdId = args.commande_id;
        const cmdBoutique = await base44.asServiceRole.entities.CommandeBoutique.get(cmdId).catch(() => null);
        if (cmdBoutique) return JSON.stringify({ trouve: true, type: 'boutique', statut: cmdBoutique.statut, total: cmdBoutique.total, ...cmdBoutique });
        const cmdResto = await base44.asServiceRole.entities.CommandeRestaurant.get(cmdId).catch(() => null);
        if (cmdResto) return JSON.stringify({ trouve: true, type: 'restaurant', statut: cmdResto.statut, total: cmdResto.total, ...cmdResto });
        return JSON.stringify({ trouve: false, message: 'Commande introuvable.' });
      }

      default:
        return JSON.stringify({ erreur: `Outil inconnu: ${toolName}` });
    }
  } catch (e: any) {
    console.error(`[OpenAIEngine] ❌ Erreur outil ${toolName}: ${e.message}`);
    return JSON.stringify({ erreur: e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// MOTEUR PRINCIPAL — Appel OpenAI avec function calling
// ═══════════════════════════════════════════════════════════════════

interface OpenAIContext {
  telephone: string;
  countryCode: string;
  tarifs: any;
  profileName: string;
  messageClient: string;
  memoireCourte: any;
  courseActive?: any;
}

/**
 * Appelle l'API OpenAI (Chat Completions) avec function calling.
 *
 * Flow :
 * 1. Envoie le prompt VENUS (avec contexte RAG) + outils SILGAPP
 * 2. Si OpenAI appelle un outil → exécution → résultat renvoyé → 2e appel
 * 3. Réponse finale en JSON (RAISONNEMENT_SCHEMA) avec données réelles
 * 4. Le champ `action` indique au webhook quelle action exécuter (avec vérif DB)
 *
 * @returns Objet JSON conforme au RAISONNEMENT_SCHEMA
 */
export async function raisonnerAvecOpenAI(
  base44: any,
  prompt: string,
  _schema: any,
  ctx: OpenAIContext
): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY non configuré');

  // ── Construction des messages ──
  // Le prompt contient déjà tout le contexte RAG + règles + connaissances.
  // On ajoute une instruction finale pour OpenAI (function calling + JSON).
  const openaiPrompt = prompt.replace(
    /Réponds UNIQUEMENT avec un JSON\.?$/s,
    `═══ MODE OPENAI — FUNCTION CALLING ═══
Tu as accès à des OUTILS SILGAPP pour obtenir des DONNÉES RÉELLES.
UTILISE SYSTÉMATIQUEMENT les outils avant de répondre aux questions factuelles :
- consulter_statut_course → pour le statut d'une course
- consulter_tarifs → pour les prix
- contacter_livreur → pour les coordonnées du livreur
- consulter_commande → pour les détails d'une commande

ANTI-HALLUCINATION ABSOLUE :
- NE JAMAIS inventer un statut, un prix, un nom de livreur ou une référence.
- Si un outil retourne "trouve: false", dis clairement que tu n'as pas l'information.
- Toutes les données SILGAPP doivent provenir du RAG ou des outils.

ACTIONS D'ÉCRITURE :
- Pour créer une course : mets action = "creer_course" (le système exécutera avec vérification DB).
- Pour annuler : mets action = "annuler_course".
- Pour contacter le livreur : utilise l'outil contacter_livreur, puis mets action = "contacter_livreur".
- Le système vérifie TOUJOURS la réussite de l'action avant d'envoyer la réponse au client.

Réponds UNIQUEMENT avec un JSON conforme au schéma de raisonnement.`
  );

  const messages: any[] = [
    { role: 'system', content: openaiPrompt },
  ];

  const toolsUsed: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const tCallStart = Date.now();
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        tools: SILGAPP_TOOLS,
        tool_choice: 'auto',
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;

    if (!msg) throw new Error('OpenAI: réponse vide');

    const usage = data.usage;
    console.log(`[OpenAIEngine] ⏱️ Tour ${round + 1}: ${Date.now() - tCallStart}ms | tokens: ${usage?.total_tokens || 'N/A'} | tool_calls: ${msg.tool_calls?.length || 0}`);

    // ── Si aucun tool_call → réponse finale JSON ──
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const content = msg.content || '';
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Si le JSON échoue, envelopper le texte dans une structure valide
        parsed = {
          intention: 'autre',
          contexte: 'general',
          infos_connues: '{}',
          infos_manquantes: [],
          action: 'repondre_info',
          prochaine_question: '',
          outils_utilises: toolsUsed,
          confiance: 80,
          reponse: content.substring(0, 500) || 'Comment puis-je vous aider ?',
          memoire_courte_update: '{}',
          memoire_longue_update: '{}',
          business_rule_id: '',
          knowledge_id: '',
          document_sources: '',
        };
      }

      // S'assurer que les outils utilisés sont enregistrés
      if (toolsUsed.length > 0) {
        if (!parsed.outils_utilises || !Array.isArray(parsed.outils_utilises) || parsed.outils_utilises.length === 0) {
          parsed.outils_utilises = toolsUsed;
        } else {
          for (const t of toolsUsed) {
            if (!parsed.outils_utilises.includes(t)) parsed.outils_utilises.push(t);
          }
        }
      }

      // Métadonnées pour le logging
      parsed._outils_openai = toolsUsed.length > 0 ? toolsUsed.join(',') : 'none';
      parsed._model_openai = OPENAI_MODEL;
      parsed._tokens_openai = usage?.total_tokens || 0;

      return parsed;
    }

    // ── Traiter les tool_calls ──
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      let toolArgs: any = {};
      try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch {}

      const result = await executeToolCall(base44, tc.function.name, toolArgs, ctx);
      toolsUsed.push(tc.function.name);

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  // Max rounds atteint — forcer une réponse JSON sans outils
  console.warn('[OpenAIEngine] ⚠️ Max tool rounds atteint — forçage réponse finale');
  const finalResponse = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        ...messages,
        { role: 'system', content: 'Tu as utilisé le maximum d\'outils. Réponds MAINTENANT avec le JSON final, sans appeler d\'autres outils.' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  if (!finalResponse.ok) throw new Error('OpenAI: échec réponse finale');

  const finalData = await finalResponse.json();
  const finalContent = finalData.choices?.[0]?.message?.content || '';
  let finalParsed: any;
  try { finalParsed = JSON.parse(finalContent); }
  catch {
    finalParsed = {
      intention: 'autre', contexte: 'general', infos_connues: '{}', infos_manquantes: [],
      action: 'repondre_info', prochaine_question: '', outils_utilises: toolsUsed,
      confiance: 70, reponse: finalContent.substring(0, 500) || 'Comment puis-je vous aider ?',
      memoire_courte_update: '{}', memoire_longue_update: '{}',
      business_rule_id: '', knowledge_id: '', document_sources: '',
    };
  }
  finalParsed._outils_openai = toolsUsed.join(',');
  finalParsed._model_openai = OPENAI_MODEL;
  finalParsed._tokens_openai = finalData.usage?.total_tokens || 0;
  return finalParsed;
}