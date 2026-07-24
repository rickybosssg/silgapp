/**
 * Moteur d'Apprentissage VENUS — Centre d'Apprentissage
 *
 * Ce module connecte VENUS à sa base de connaissances (VenusKnowledge).
 * Avant chaque réponse, VENUS:
 *   1. Détecte l'intention du client
 *   2. Recherche sémantiquement dans les connaissances validées
 *   3. Utilise la réponse officielle si elle existe (priorité absolue)
 *   4. Calcule un score de confiance si aucune connaissance ne correspond
 *   5. Enregistre l'interaction pour apprentissage continu
 */

export const SEUIL_CONFIANCE = 80;

/**
 * Récupère toutes les connaissances validées pour un pays et une langue donnés.
 * Triées par priorité (critique → basse) puis par date de modification.
 */
export async function rechercherConnaissancesValidees(base44: any, countryCode: string, langue: string = 'fr') {
  try {
    const all = await base44.asServiceRole.entities.VenusKnowledge.filter(
      { statut: 'valide' },
      '-updated_date',
      100
    );
    const filtered = all.filter((k: any) =>
      (!k.pays || k.pays === 'ALL' || k.pays === countryCode) &&
      (!k.langue || k.langue === langue)
    );
    // Trier par priorité: critique > haute > normale > basse
    const prioriteOrder: any = { critique: 0, haute: 1, normale: 2, basse: 3 };
    return filtered.sort((a: any, b: any) => {
      const pa = prioriteOrder[a.priorite] ?? 2;
      const pb = prioriteOrder[b.priorite] ?? 2;
      return pa - pb;
    });
  } catch (e) {
    console.error('[venusLearning] Erreur recherche connaissances:', e.message);
    return [];
  }
}

/**
 * Génère une réponse augmentée par la base de connaissances.
 *
 * Processus (ÉTAPES 1-6 du Prompt 2):
 *   1. Détecte l'intention du client
 *   2. Recherche sémantique dans la base de connaissances
 *   3. Si une réponse validée existe → l'utiliser telle quelle (priorité absolue)
 *   4. Sinon → générer une réponse avec score de confiance
 *   5. Score de confiance 0-100 (< 80 = enregistrer comme non comprise)
 *   6. Retourne toutes les métadonnées pour le logging
 *
 * @returns { reponse, intention, confidence, knowledge_id, knowledge_used, temps_recherche_ms }
 */
export async function genererReponseAugmentee(
  base44: any,
  message: string,
  knowledge: any[],
  context: string,
  countryCode: string,
  tarifs: any,
  telephone: string,
  profileName: string,
  isAudioTranscription: boolean = false
) {
  const startTime = Date.now();

  // Préparer les données de connaissances pour le LLM
  const knowledgeData = knowledge.map((k: any) => ({
    id: k.id,
    titre: k.titre,
    question: k.question,
    reponse: (k.reponse_officielle || '').substring(0, 500),
    mots_cles: k.mots_cles,
    priorite: k.priorite,
    categorie: k.categorie,
  }));

  const prompt = `Tu es VENUS, l'assistante officielle de SILGAPP (application de livraison en Afrique de l'Ouest).

PAYS: ${countryCode} (${tarifs.nom})
TARIFS: ${tarifs.prix_km} ${tarifs.devise}/km, minimum ${tarifs.minimum} ${tarifs.devise}
CLIENT: ${profileName || telephone} (${telephone})
SUPPORT: +226 66 92 51 90

═══ BASE DE CONNAISSANCES VALIDÉES ═══
${knowledgeData.length > 0 ? JSON.stringify(knowledgeData, null, 2) : 'Aucune connaissance validée disponible pour le moment.'}

${context ? `═══ CONTEXTE DE CONVERSATION (mémoire) ═══
${context}

` : ''}${isAudioTranscription ? `═══ NOTE - TRANSCRIPTION VOCALE ═══
Le message ci-dessous a été transcrit depuis une note vocale et peut contenir des erreurs (mots mal entendus, noms mal orthographues). Confirme ce que tu as compris si nécessaire.

` : ''}═══ MESSAGE DU CLIENT ═══
${message}

═══ PROCESSUS OBLIGATOIRE ═══

1. DÉTECTE L'INTENTION du client parmi:
   creer_course, suivre_course, modifier_course, annuler_course, contacter_livreur,
   demander_tarif, demander_info, question_generale, reclamation, devenir_partenaire, autre

2. RECHERCHE SÉMANTIQUE dans la base de connaissances:
   - Cherche une correspondance par le SENS (pas seulement les mots-clés)
   - "Je veux envoyer un colis" = "Je souhaite expédier un paquet" = "J'ai un document à livrer"
   - Si une connaissance validée correspond (score > 80%):
     → Utilise sa réponse TELLE QUELLE (ne la modifie pas, ne la réinvente pas)
     → Mets knowledge_used = true et knowledge_id = l'ID correspondant
     → Confidence = 100

3. SI AUCUNE CONNAISSANCE NE CORRESPOND:
   → Génère une réponse avec ton intelligence
   → Calcule un score de confiance (0-100):
     90-100 = réponse très fiable (information certaine)
     70-89 = réponse correcte (information probable)
     40-69 = réponse incertaine (information partielle)
     0-39 = réponse très incertaine
   → Mets knowledge_used = false

4. RÈGLES CRITIQUES:
   - Les réponses validées ont TOUJOURS priorité sur les réponses générées par l'IA
   - NE JAMAIS inventer un prix. Si demande de tarif: "Le livreur vous confirmera le prix"
   - Sois concise, chaleureuse, en texte plain (pas de markdown, pas de **)
   - Ne JAMAIS redemander une information déjà présente dans le contexte (mémoire)
   - Tu es VENUS, pas un robot. Sois naturelle et humaine.

Réponds UNIQUEMENT en JSON:`;

  const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        intention: { type: 'string' },
        knowledge_id: { type: 'string' },
        knowledge_used: { type: 'boolean' },
        reponse: { type: 'string' },
        confidence: { type: 'number' },
        raison: { type: 'string' },
      },
      required: ['intention', 'reponse', 'confidence'],
    },
  });

  const result: any = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
  const tempsRecherche = Date.now() - startTime;

  console.log(`[venusLearning] 📚 Intention: ${result.intention} | Connaissance: ${result.knowledge_used ? 'OUI' : 'NON'} | Confiance: ${result.confidence}% | Temps: ${tempsRecherche}ms`);

  return {
    reponse: result.reponse || '',
    intention: result.intention || 'question_generale',
    confidence: result.confidence || 0,
    knowledge_id: result.knowledge_id || '',
    knowledge_used: result.knowledge_used || false,
    temps_recherche_ms: tempsRecherche,
  };
}