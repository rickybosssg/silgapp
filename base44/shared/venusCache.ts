/**
 * ═══════════════════════════════════════════════════════════════════
 * CACHE DE RÉPONSES VENUS — Économise les crédits d'intégration
 * ═══════════════════════════════════════════════════════════════════
 *
 * Évite les appels LLM redondants en:
 * 1. Réutilisant les réponses aux messages identiques (cache mémoire)
 * 2. Court-circuitant les salutations sans appel LLM
 * 3. Répondant directement depuis les règles métier/connaissances
 */

// Cache en mémoire: clé = hash du message normalisé + téléphone
// TTL: 10 minutes (une conversation peut avoir des messages répétés)
const RESPONSE_CACHE = new Map<string, { response: any; expires: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Normalise un message pour la clé de cache (minuscule, sans accents, sans espaces multiples).
 */
function normaliserPourCache(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500); // Limiter la taille de la clé
}

/**
 * Génère une clé de cache unique pour un message + contexte.
 */
function genererCleCache(telephone: string, message: string, memoireCourte: any): string {
  const msgNorm = normaliserPourCache(message);
  // Inclure un résumé de la mémoire courte pour différencier les contextes
  const mcKeys = memoireCourte ? Object.keys(memoireCourte).filter(k => memoireCourte[k] != null && memoireCourte[k] !== '').sort().join(',') : '';
  return `${telephone}:${msgNorm}:${mcKeys}`;
}

/**
 * Récupère une réponse en cache si elle existe et n'a pas expiré.
 */
export function recupererCache(telephone: string, message: string, memoireCourte: any): any | null {
  const cle = genererCleCache(telephone, message, memoireCourte);
  const cached = RESPONSE_CACHE.get(cle);
  if (cached && Date.now() < cached.expires) {
    console.log(`[VenusCache] ♻️ Réponse en cache trouvée pour: "${message.substring(0, 40)}..."`);
    return cached.response;
  }
  // Nettoyer l'entrée expirée
  if (cached) RESPONSE_CACHE.delete(cle);
  return null;
}

/**
 * Stocke une réponse en cache.
 */
export function stockerCache(telephone: string, message: string, memoireCourte: any, response: any): void {
  // Ne pas cacher les réponses de création de course (actions sensibles)
  if (response.action === 'creer_course') return;
  // Ne cacher que les réponses informationnelles et salutations
  if (!['repondre_info', 'saluer', 'poser_question'].includes(response.action)) return;
  // ── Ne jamais cacher les réponses de fallback (erreur LLM ou confiance faible) ──
  // Ces réponses sont des erreurs — les cacher ferait boucler VENUS sur "Comment puis-je vous aider ?"
  if (!response.reponse || (typeof response.reponse === 'string' && response.reponse.trim().length === 0)) return;
  if (response.confiance < 50) return;
  if (typeof response.reponse === 'string' && response.reponse.includes('Comment puis-je vous aider')) return;

  const cle = genererCleCache(telephone, message, memoireCourte);
  RESPONSE_CACHE.set(cle, { response, expires: Date.now() + CACHE_TTL_MS });

  // Nettoyer périodiquement les entrées expirées (max 500 entrées)
  if (RESPONSE_CACHE.size > 500) {
    const now = Date.now();
    for (const [k, v] of RESPONSE_CACHE.entries()) {
      if (now >= v.expires) RESPONSE_CACHE.delete(k);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// COURT-CIRCUIT SALUTATIONS — 0 crédit LLM
// ═══════════════════════════════════════════════════════════════════

const SALUTATIONS_PATTERNS = [
  /^(bonjour|salut|bonsoir|hello|coucou|cc|hey|yo)\s*[!.?]*$/i,
  /^(bonjour|salut|bonsoir)\s+(venus|silgapp)\s*[!.?]*$/i,
  /^(bonjour|salut|bonsoir)\s+(comment\s+vas|ca\s+va)\s*[!?]*$/i,
];

const SALUTATION_RESPONSE = {
  intention: 'salutation',
  contexte: 'general',
  infos_connues: {},
  infos_manquantes: [],
  action: 'saluer',
  prochaine_question: '',
  outils_utilises: ['salutation_shortcut'],
  confiance: 100,
  reponse: "Bonjour 👋 Je suis VENUS, l'assistante intelligente de SILGAPP. Comment puis-je vous aider aujourd'hui ?",
  memoire_courte_update: {},
  memoire_longue_update: {},
};

/**
 * Détecte si le message est une salutation simple.
 * Si oui, retourne une réponse sans appel LLM.
 */
export function detecterSalutation(message: string): any | null {
  if (!message) return null;
  const msgTrim = message.trim().toLowerCase();
  if (msgTrim.length > 80) return null; // Les salutations sont courtes

  for (const pattern of SALUTATIONS_PATTERNS) {
    if (pattern.test(msgTrim)) {
      console.log('[VenusCache] 👋 Salutation détectée — court-circuit LLM');
      return { ...SALUTATION_RESPONSE };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// COURT-CIRCUIT QUESTIONS FRÉQUENTES — 0 crédit LLM
// ═══════════════════════════════════════════════════════════════════

/**
 * Raccourcis heuristiques pour les questions les plus fréquentes.
 * Chaque pattern correspond à une intention claire et retourne une réponse
 * standardisée SANS appel LLM.
 */
const RACCOURCIS_FREQUENTS: { patterns: RegExp[]; reponse: string; intention: string; action: string; outils: string[] }[] = [
  // ── Suivi de livreur ──
  {
    patterns: [
      /\bou\s+(est|se\s+trouve)\s+(mon\s+)?(livreur|coursier|chauffeur)\b/i,
      /\bmon\s+livreur\s+(est\s+)?ou\b/i,
      /\bquand\s+(est-ce\s+que\s+)?(le\s+)?livreur\s+(arrive|vient)\b/i,
      /\bil\s+arrive\s+(quand|ou)\b/i,
      /\bou\s+en\s+est\s+(ma\s+)?(livraison|course|commande)\b/i,
    ],
    reponse: "Je vérifie le statut de votre livraison. Si une course est en cours, le livreur vous contactera directement. Vous recevrez un lien de suivi en temps réel dès qu'un livreur sera assigné. Si vous n'avez pas de course active, je peux vous aider à en créer une nouvelle.",
    intention: 'suivre_course',
    action: 'repondre_info',
    outils: ['heuristic:livreur_tracking'],
  },
  // ── Tarifs / prix ──
  {
    patterns: [
      /\b(c['e]?)\s*est\s+(combien|quel\s+prix)\b/i,
      /\bcombien\s+(c[aâ]oûte|ca\s+coute|coute)\b/i,
      /\bquel\s+(est\s+le\s+)?(prix|tarif|cout|montant)\b/i,
      /\b(le\s+)?prix\s+(de\s+la\s+)?(livraison|course)\b/i,
      /\bcombien\s+(je\s+dois|ca\s+fait|ca\s+coute)\b/i,
    ],
    reponse: "Le prix de la livraison est confirmé par le livreur avant le démarrage de la course. Il dépend de la distance et du type de service. Le tarif minimum est de 500 FCFA. Pour un devis précis, indiquez votre point de départ et de destination.",
    intention: 'demander_info',
    action: 'repondre_info',
    outils: ['heuristic:tarifs'],
  },
  // ── Comment ça marche ──
  {
    patterns: [
      /\bcomment\s+(c?a\s+)?marche\b/i,
      /\bcomment\s+(ca\s+)?fonctionne\b/i,
      /\bqu['e]?\s*est-ce\s+que\s+(silgapp|venus)\b/i,
      /\bc['e]?\s*est\s+quoi\s+(silgapp|venus)\b/i,
      /\bpr[ée]sent(e|ation)\s+(silgapp|venus)\b/i,
    ],
    reponse: "SILGAPP est une plateforme de livraison à domicile au Burkina Faso. Vous pouvez envoyer un colis, recevoir un colis, ou vous déplacer. Pour commencer, dites-moi simplement ce dont vous avez besoin : « Je veux envoyer un colis », « Je veux recevoir un colis », ou « Je veux me déplacer ».",
    intention: 'demander_info',
    action: 'repondre_info',
    outils: ['heuristic:presentation'],
  },
  // ── Contacter le support ──
  {
    patterns: [
      /\bje\s+veux\s+(parler|contacter)\s+(au\s+)?(support|un\s+humain|un\s+agent)\b/i,
      /\bcontacter\s+(le\s+)?support\b/i,
      /\bnum[ée]ro\s+(de\s+)?(support|silgapp|contact)\b/i,
      /\bappeler\s+(silgapp|le\s+support)\b/i,
    ],
    reponse: "Vous pouvez contacter le support SILGAPP au +226 66 92 51 90 via WhatsApp ou appel téléphonique. Notre équipe est disponible pour vous aider.",
    intention: 'demander_info',
    action: 'repondre_info',
    outils: ['heuristic:support_contact'],
  },
];

/**
 * Détecte si le message correspond à une question fréquente.
 * Si oui, retourne une réponse standardisée sans appel LLM.
 */
export function detecterRaccourciFrequent(message: string, courseActive?: any): any | null {
  if (!message) return null;
  const msgTrim = message.trim();
  if (msgTrim.length > 200) return null; // Les raccourcis concernent les messages courts

  for (const raccourci of RACCOURCIS_FREQUENTS) {
    for (const pattern of raccourci.patterns) {
      if (pattern.test(msgTrim)) {
        console.log(`[VenusCache] ⚡ Raccourci fréquent: ${raccourci.outils[0]}`);
        return {
          intention: raccourci.intention,
          contexte: courseActive ? 'course_en_cours' : 'general',
          infos_connues: {},
          infos_manquantes: [],
          action: raccourci.action,
          prochaine_question: '',
          outils_utilises: raccourci.outils,
          confiance: 85,
          reponse: raccourci.reponse,
          memoire_courte_update: {},
          memoire_longue_update: {},
        };
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// COURT-CIRCUIT RÈGLES MÉTIER — 0 crédit LLM
// ═══════════════════════════════════════════════════════════════════

/**
 * Vérifie si une règle métier correspond directement au message client.
 * Si une règle a une réponse associée et que ses exemples/phrases correspondent, l'utiliser directement.
 */
export function detecterRegleMetierDirecte(message: string, regles: any[]): any | null {
  if (!message || !regles || regles.length === 0) return null;

  const msgLower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const regle of regles) {
    // Vérifier les exemples de la règle
    let exemples: string[] = [];
    try { exemples = JSON.parse(regle.exemples || '[]'); } catch {}

    for (const exemple of exemples) {
      const exNorm = exemple.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (exNorm.length < 5) continue;

      // Correspondance exacte ou incluse (si l'exemple est court)
      if (exNorm.length <= 30 && msgLower.includes(exNorm)) {
        if (regle.reponse_associee && regle.reponse_associee.length > 10) {
          console.log(`[VenusCache] 📖 Règle métier directe: ${regle.nom}`);
          return {
            intention: 'demander_info',
            contexte: 'general',
            infos_connues: {},
            infos_manquantes: [],
            action: 'repondre_info',
            prochaine_question: '',
            outils_utilises: ['business_rule:direct'],
            confiance: 95,
            reponse: regle.reponse_associee,
            memoire_courte_update: {},
            memoire_longue_update: {},
            business_rule_id: regle.id,
          };
        }
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// COURT-CIRCUIT CONNAISSANCES — 0 crédit LLM
// ═══════════════════════════════════════════════════════════════════

/**
 * Vérifie si une entrée de connaissance correspond directement au message.
 * Si la question du client correspond exactement à une question de la base, utiliser la réponse officielle.
 */
export function detecterConnaissanceDirecte(message: string, connaissances: any[]): any | null {
  if (!message || !connaissances || connaissances.length === 0) return null;

  const msgLower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  for (const k of connaissances) {
    if (!k.question || k.question.length < 5) continue;
    const qNorm = k.question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // Correspondance exacte ou quasi-exacte
    // ATTENTION: on ne fait que msgLower.includes(qNorm) — le message du client doit
    // CONTENIR la question de la connaissance. L'inverse (qNorm.includes(msgLower))
    // ferait correspondre "je veux envoyer un colis" à "je veux envoyer un colis à Karpala"
    // ce qui est trop permissif et provoque des hallucinations.
    if (msgLower === qNorm || (msgLower.length > 10 && msgLower.includes(qNorm))) {
      if (k.reponse_officielle && k.reponse_officielle.length > 10) {
        console.log(`[VenusCache] 📚 Connaissance directe: ${k.titre}`);
        return {
          intention: 'demander_info',
          contexte: 'general',
          infos_connues: {},
          infos_manquantes: [],
          action: 'repondre_info',
          prochaine_question: '',
          outils_utilises: ['knowledge_base:direct'],
          confiance: 95,
          reponse: k.reponse_officielle,
          memoire_courte_update: {},
          memoire_longue_update: {},
          knowledge_id: k.id,
        };
      }
    }
  }
  return null;
}