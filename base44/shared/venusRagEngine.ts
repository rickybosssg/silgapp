/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR RAG (Retrieval-Augmented Generation) VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Bibliothèque documentaire intelligente pour VENUS.
 *
 * Pipeline :
 * 1. Extraction de texte (PDF, Word, Excel, Image OCR, Texte, Markdown)
 * 2. Découpage intelligent en chunks (paragraphes + overlap)
 * 3. Détection de langue
 * 4. Génération de résumé (LLM)
 * 5. Extraction de mots-clés (LLM)
 * 6. Indexation des chunks (VenusDocumentChunk)
 * 7. Recherche sémantique (keyword scoring + LLM re-ranking)
 * 8. Gestion des versions (archivage automatique des anciennes)
 *
 * Ordre de priorité des sources pour VENUS :
 *   1. Base de connaissances (VenusKnowledge)
 *   2. Bibliothèque documentaire (VenusDocument / VenusDocumentChunk)
 *   3. Scénarios (VenusScenario)
 *   4. IA générale (LLM)
 * ═══════════════════════════════════════════════════════════════════
 */

export const SEUIL_RELEVANCE_DOCUMENT = 15;
export const TAILLE_CHUNK = 800;
export const OVERLAP_CHUNK = 120;

// ═══════════════════════════════════════════════════════════════════
// 1. EXTRACTION DE TEXTE
// ═══════════════════════════════════════════════════════════════════

/**
 * Extrait le texte d'un document quel que soit son format.
 * Utilise InvokeLLM avec file_urls (supporte PDF, images OCR, Word, etc.).
 */
export async function extraireTexteDocument(
  base44: any,
  file_url: string,
  mime_type: string
): Promise<{ texte: string; langue: string; nb_pages: number }> {
  if (!file_url) {
    return { texte: '', langue: 'fr', nb_pages: 0 };
  }

  // Pour les fichiers texte simples, fetch direct
  if (mime_type && (mime_type.startsWith('text/') || mime_type.includes('markdown') || mime_type.includes('json') || mime_type.includes('csv'))) {
    try {
      const resp = await fetch(file_url);
      if (resp.ok) {
        const texte = await resp.text();
        if (texte && texte.length > 10) {
          return { texte, langue: detecterLangue(texte), nb_pages: Math.ceil(texte.length / 3000) };
        }
      }
    } catch { /* fallback to LLM */ }
  }

  // Pour les autres formats (PDF, Word, Excel, Image) → LLM avec file_urls
  try {
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Tu es un extracteur de texte. Extrais l'INTEGRALITE du texte contenu dans ce document. 

Regles:
- Retourne TOUT le texte, sans resumer, sans truncature.
- Conserve la structure (paragraphes, titres, listes).
- Si c'est une image ou un scan, fais de l'OCR complet.
- Si c'est un tableau (Excel), structure le en texte lisible.
- Ne commente pas, n'analyse pas, retourne uniquement le texte brut.
- Si le document est vide ou illisible, retourne "DOCUMENT_VIDE".`,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          texte: { type: 'string', description: 'Texte integral extrait du document' },
          langue: { type: 'string', description: 'Code langue detecte (fr, en, etc.)' },
          nb_pages: { type: 'number', description: 'Nombre de pages estimees' },
        },
        required: ['texte'],
      },
    });

    const result: any = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
    const texte = result.texte === 'DOCUMENT_VIDE' ? '' : (result.texte || '');
    return {
      texte,
      langue: result.langue || detecterLangue(texte),
      nb_pages: result.nb_pages || Math.ceil(texte.length / 3000),
    };
  } catch (e: any) {
    console.error('[RAGEngine] Erreur extraction texte:', e.message);
    return { texte: '', langue: 'fr', nb_pages: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. DÉCOUPAGE INTELLIGENT EN CHUNKS
// ═══════════════════════════════════════════════════════════════════

/**
 * Découpe un texte en chunks cohérents.
 * - Priorise les séparateurs naturels (paragraphes, puis phrases)
 * - Garantit un overlap pour ne pas couper d'information
 * - Filtre les chunks trop courts (< 20 caractères)
 */
export function decouperTexteIntelligent(
  texte: string,
  tailleChunk: number = TAILLE_CHUNK,
  overlap: number = OVERLAP_CHUNK
): string[] {
  if (!texte || texte.trim().length === 0) return [];

  const chunks: string[] = [];

  // Étape 1 : découper par paragraphes (double nouvelle ligne)
  const paragraphs = texte.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);

  let currentChunk = '';

  for (const para of paragraphs) {
    // Si le paragraphe seul dépasse la taille max → découper par phrases
    if (para.length > tailleChunk) {
      // Sauvegarder le chunk courant d'abord
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = currentChunk.slice(-overlap);
      }

      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
      for (const sentence of sentences) {
        const s = sentence.trim();
        if (!s) continue;

        if ((currentChunk + ' ' + s).length > tailleChunk) {
          if (currentChunk.trim()) chunks.push(currentChunk.trim());
          // Garder l'overlap du chunk précédent
          currentChunk = chunks.length > 0 && overlap > 0
            ? chunks[chunks.length - 1].slice(-overlap) + ' ' + s
            : s;
        } else {
          currentChunk = currentChunk ? currentChunk + ' ' + s : s;
        }
      }
    } else if ((currentChunk + '\n\n' + para).length > tailleChunk) {
      // Le chunk courant est plein
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      // Nouveau chunk avec overlap
      currentChunk = chunks.length > 0 && overlap > 0
        ? chunks[chunks.length - 1].slice(-overlap) + '\n\n' + para
        : para;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  // Filtrer les chunks trop courts
  return chunks.filter(c => c.length > 20);
}

// ═══════════════════════════════════════════════════════════════════
// 3. DÉTECTION DE LANGUE
// ═══════════════════════════════════════════════════════════════════

export function detecterLangue(texte: string): string {
  if (!texte) return 'fr';
  const lower = texte.toLowerCase().substring(0, 1000);

  const FR_WORDS = ['le', 'la', 'les', 'une', 'des', 'est', 'que', 'pour', 'dans', 'avec', 'bonjour', 'merci', 'cours', 'livraison'];
  const EN_WORDS = ['the', 'is', 'are', 'was', 'were', 'that', 'for', 'with', 'from', 'this', 'hello', 'thank', 'delivery'];

  let frCount = 0, enCount = 0;
  for (const w of FR_WORDS) {
    if (lower.includes(w)) frCount++;
  }
  for (const w of EN_WORDS) {
    if (lower.includes(w)) enCount++;
  }

  return frCount >= enCount ? 'fr' : 'en';
}

// ═══════════════════════════════════════════════════════════════════
// 4. RÉSUMÉ ET MOTS-CLÉS (LLM)
// ═══════════════════════════════════════════════════════════════════

export async function genererResumeDocument(base44: any, texte: string): Promise<string> {
  if (!texte || texte.length < 50) return texte || '';

  try {
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Genere un resume concis (max 300 caracteres) du document suivant. Ce resume doit capturer les points essentiels pour un administrateur SILGAPP.

Document:
${texte.substring(0, 4000)}`,
      response_json_schema: {
        type: 'object',
        properties: {
          resume: { type: 'string' },
        },
        required: ['resume'],
      },
    });
    const result: any = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
    return result.resume || '';
  } catch (e: any) {
    console.error('[RAGEngine] Erreur resume:', e.message);
    return texte.substring(0, 300);
  }
}

export async function extraireMotsClesDocument(base44: any, texte: string): Promise<string[]> {
  if (!texte || texte.length < 20) return [];

  try {
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Extrais les 15 mots-cles les plus importants de ce document. Ces mots-cles seront utilises pour la recherche sémantique.

Regles:
- Retourne des mots-cles pertinents, pas de mots vides (le, la, les, etc.)
- Inclus des synonymes potentiels et des termes techniques
- Retourne en minuscules sans accents
- Inclus des expressions de 2-3 mots si pertinentes (ex: "code qr", "prix livraison")

Document:
${texte.substring(0, 4000)}`,
      response_json_schema: {
        type: 'object',
        properties: {
          mots_cles: { type: 'array', items: { type: 'string' } },
        },
        required: ['mots_cles'],
      },
    });
    const result: any = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
    return result.mots_cles || [];
  } catch (e: any) {
    console.error('[RAGEngine] Erreur mots-cles:', e.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. NORMALISATION ET SCORING
// ═══════════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  // Français
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'mais',
  'comment', 'est', 'ce', 'que', 'quoi', 'qui', 'pourquoi', 'quand', 'ou',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre',
  'a', 'au', 'aux', 'en', 'dans', 'sur', 'pour', 'par', 'avec', 'sans',
  'ca', 'cela', 'cette', 'ces', 'son', 'sa', 'ses', 'leur', 'leurs',
  'peux', 'peut', 'suis', 'es', 'sommes', 'etes', 'sont', 'ai', 'as', 'avons', 'avez', 'ont',
  'vais', 'vas', 'va', 'allons', 'allez', 'vont',
  'faut', 'doit', 'veux', 'voudrais', 'aimerais',
  'plus', 'moins', 'tres', 'trop', 'aussi', 'encore', 'deja',
  'si', 'non', 'oui', 'ok',
  // Anglais
  'the', 'is', 'are', 'was', 'were', 'a', 'an', 'to', 'in', 'on', 'for',
  'of', 'and', 'or', 'but', 'how', 'what', 'why', 'when', 'where',
  'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her',
  'this', 'that', 'these', 'those', 'it', 'its',
  'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should',
]);

/**
 * Normalise une requête : minuscules, suppression accents et ponctuation.
 */
export function normaliserRequete(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrait les mots-clés significatifs d'une requête.
 */
export function extraireMotsClesFromQuery(query: string): string[] {
  const normalized = normaliserRequete(query);
  if (!normalized) return [];

  return normalized
    .split(' ')
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

// ── Synonymes et termes apparentés ──
const SYNONYMES: Record<string, string[]> = {
  'qr': ['code', 'scanner', 'qrcode', 'flasher'],
  'code': ['qr', 'pin', 'code', 'confidentiel'],
  'pin': ['code', 'chiffre', 'secret'],
  'scanner': ['flasher', 'lire', 'qr'],
  'livraison': ['livrer', 'expedition', 'envoi', 'colis', 'package'],
  'livreur': ['coursier', 'chauffeur', 'transporteur'],
  'prix': ['tarif', 'cout', 'montant', 'facture', 'payer'],
  'annuler': ['annulation', 'stop', 'arreter', 'supprimer'],
  'paiement': ['payer', 'reglement', 'facture', 'transaction'],
  'inscription': ['enregistrer', 'compte', 'creer', 'inscription'],
  'support': ['aide', 'assistance', 'contact', 'help'],
  'pharmacie': ['medicament', 'pharmacie'],
  'restaurant': ['repas', 'nourriture', 'menu', 'plat'],
  'boutique': ['magasin', 'produit', 'achat', 'commerce'],
  'partenaire': ['boutique', 'restaurant', 'pharmacie', 'commercant'],
  'tarif': ['prix', 'cout', 'montant'],
  'remboursement': ['rembourser', 'retour', 'argent'],
};

/**
 * Étend les mots-clés de la requête avec leurs synonymes.
 */
export function etendreMotsCles(motsCles: string[]): string[] {
  const extended = new Set(motsCles);
  for (const mc of motsCles) {
    const syns = SYNONYMES[mc];
    if (syns) {
      syns.forEach(s => extended.add(s));
    }
  }
  return Array.from(extended);
}

/**
 * Calcule le score de pertinence d'un chunk pour une requête.
 * Score basé sur : densité de mots-clés, correspondance exacte, correspondance synonymes.
 */
export function scoreChunk(chunk: any, queryKeywords: string[]): number {
  if (!chunk || !chunk.contenu || queryKeywords.length === 0) return 0;

  const chunkText = normaliserRequete(chunk.contenu);
  let chunkKeywords: string[] = [];
  try {
    chunkKeywords = chunk.mots_cles ? JSON.parse(chunk.mots_cles).map((k: string) => normaliserRequete(k)) : [];
  } catch { /* ignore */ }

  let score = 0;

  for (const qk of queryKeywords) {
    // Correspondance exacte (mot entier) dans le contenu
    const regex = new RegExp(`\\b${qk}\\b`, 'g');
    const contentMatches = (chunkText.match(regex) || []).length;
    score += contentMatches * 3;

    // Correspondance dans les mots-clés du chunk
    if (chunkKeywords.includes(qk)) {
      score += 5;
    }

    // Correspondance partielle (sous-chaîne)
    if (contentMatches === 0 && chunkText.includes(qk)) {
      score += 1;
    }
  }

  // Bonus pour les chunks qui contiennent TOUS les mots-clés
  const allKeywordsPresent = queryKeywords.every(qk => chunkText.includes(qk));
  if (allKeywordsPresent && queryKeywords.length > 1) {
    score += 10;
  }

  // Pénalité pour les chunks très longs (privilégier la précision)
  if (chunkText.length > 2000) {
    score = score * 0.8;
  }

  return Math.round(score);
}

// ═══════════════════════════════════════════════════════════════════
// 6. RECHERCHE SÉMANTIQUE
// ═══════════════════════════════════════════════════════════════════

/**
 * Recherche dans la bibliothèque documentaire.
 *
 * Pipeline :
 * 1. Normaliser la requête et extraire les mots-clés (+ synonymes)
 * 2. Charger les chunks actifs (statut = valide)
 * 3. Filtrer par categorie/pays si spécifié
 * 4. Scorer chaque chunk
 * 5. Retourner les top résultats
 *
 * @param options.pays - Code pays pour filtrer (optionnel)
 * @param options.categorie - Catégorie de document (optionnel)
 * @param options.limit - Nombre max de résultats (défaut 5)
 */
export async function rechercherDocumentsRag(
  base44: any,
  query: string,
  options: { pays?: string; categorie?: string; limit?: number; conversation_id?: string } = {}
): Promise<{
  resultats: any[];
  temps_ms: number;
  query_keywords: string[];
  a_reussi: boolean;
}> {
  const startTime = Date.now();
  const { pays, categorie, limit = 5, conversation_id } = options;

  // Étape 1 : Extraire et étendre les mots-clés
  const rawKeywords = extraireMotsClesFromQuery(query);
  if (rawKeywords.length === 0) {
    return { resultats: [], temps_ms: 0, query_keywords: [], a_reussi: false };
  }
  const queryKeywords = etendreMotsCles(rawKeywords);

  // Étape 2 : Charger les chunks validés
  let chunks: any[] = [];
  try {
    chunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter(
      { document_statut: 'valide' },
      '-created_date',
      500
    );
  } catch (e: any) {
    console.error('[RAGEngine] Erreur chargement chunks:', e.message);
    return { resultats: [], temps_ms: Date.now() - startTime, query_keywords: rawKeywords, a_reussi: false };
  }

  if (!chunks || chunks.length === 0) {
    return { resultats: [], temps_ms: Date.now() - startTime, query_keywords: rawKeywords, a_reussi: false };
  }

  // Étape 3 : Filtrer par categorie si spécifié
  let filteredChunks = chunks;
  if (categorie) {
    filteredChunks = filteredChunks.filter(c => c.document_categorie === categorie);
  }

  // Filtrer par pays (si le chunk a un pays défini et qu'il ne correspond pas, l'exclure)
  // Un document avec pays = "ALL" ou vide est inclus pour tous
  if (pays) {
    filteredChunks = filteredChunks.filter(c =>
      !c.document_pays || c.document_pays === 'ALL' || c.document_pays === pays
    );
  }

  // Étape 4 : Scorer chaque chunk
  const scored = filteredChunks.map(chunk => ({
    chunk,
    score: scoreChunk(chunk, queryKeywords),
  }));

  // Étape 5 : Filtrer, trier et limiter
  const results = scored
    .filter(s => s.score >= SEUIL_RELEVANCE_DOCUMENT)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const resultats = results.map(r => ({
    chunk_id: r.chunk.id,
    document_id: r.chunk.document_id,
    document_titre: r.chunk.document_titre,
    document_version: r.chunk.document_version,
    document_categorie: r.chunk.document_categorie,
    chunk_index: r.chunk.chunk_index,
    contenu: r.chunk.contenu,
    mots_cles: r.chunk.mots_cles,
    resume_section: r.chunk.resume_section,
    score: r.score,
    page_numero: r.chunk.page_numero,
  }));

  const aReussi = resultats.length > 0;
  const tempsMs = Date.now() - startTime;

  // Étape 6 : Log de la recherche
  try {
    const meilleurResultat = resultats[0];
    await base44.asServiceRole.entities.VenusDocumentSearchLog.create({
      requete: query,
      requete_normalisee: normaliserRequete(query),
      mots_cles: JSON.stringify(rawKeywords),
      resultats_count: resultats.length,
      meilleur_score: meilleurResultat?.score || 0,
      document_id_trouve: meilleurResultat?.document_id || '',
      document_titre_trouve: meilleurResultat?.document_titre || '',
      document_version_trouvee: meilleurResultat?.document_version || 0,
      document_categorie_trouvee: meilleurResultat?.document_categorie || '',
      chunk_id_trouve: meilleurResultat?.chunk_id || '',
      chunk_contenu_extrait: meilleurResultat?.contenu?.substring(0, 300) || '',
      source_utilisee: aReussi ? 'document_library' : 'ia_generale',
      temps_recherche_ms: tempsMs,
      a_reussi: aReussi,
      pays: pays || '',
      conversation_id: conversation_id || '',
    });
  } catch (e) {
    console.warn('[RAGEngine] Erreur log recherche:', e.message);
  }

  // Incrémenter les compteurs de consultation
  if (aReussi) {
    for (const r of resultats.slice(0, 3)) {
      try {
        await base44.asServiceRole.entities.VenusDocument.update(r.document_id, {
          nb_consultations: (await base44.asServiceRole.entities.VenusDocument.get(r.document_id))?.nb_consultations + 1 || 1,
          derniere_consultation: new Date().toISOString(),
        });
      } catch { /* ignore */ }
    }
  }

  console.log(`[RAGEngine] 🔍 Recherche "${query.substring(0, 50)}" → ${resultats.length} résultats en ${tempsMs}ms | Mots-clés: ${rawKeywords.join(', ')}`);

  return { resultats, temps_ms: tempsMs, query_keywords: rawKeywords, a_reussi: aReussi };
}

// ═══════════════════════════════════════════════════════════════════
// 7. INDEXATION COMPLÈTE
// ═══════════════════════════════════════════════════════════════════

/**
 * Pipeline complet d'indexation d'un document.
 *
 * Étapes :
 * 1. Extraire le texte du fichier
 * 2. Découper en chunks
 * 3. Détecter la langue
 * 4. Générer un résumé
 * 5. Extraire les mots-clés
 * 6. Gérer le versionnement (archiver ancienne version si mise à jour)
 * 7. Créer le VenusDocument
 * 8. Créer les VenusDocumentChunk
 */
export async function indexerDocumentComplet(
  base44: any,
  params: {
    fichier_url: string;
    fichier_nom?: string;
    fichier_type_mime?: string;
    fichier_taille?: number;
    titre: string;
    description?: string;
    categorie: string;
    type_document: string;
    auteur: string;
    pays?: string;
    tags?: string[];
    statut?: string;
    document_existant_id?: string; // Si mise à jour d'un document existant
  }
): Promise<{ success: boolean; document?: any; chunks?: any[]; error?: string }> {
  try {
    console.log(`[RAGEngine] 📄 Indexation: "${params.titre}" (${params.fichier_nom || 'N/A'})`);

    // Étape 1 : Extraction du texte
    const extraction = await extraireTexteDocument(base44, params.fichier_url, params.fichier_type_mime || '');
    if (!extraction.texte || extraction.texte.trim().length < 10) {
      // Créer le document avec erreur
      const doc = await base44.asServiceRole.entities.VenusDocument.create({
        titre: params.titre,
        description: params.description || '',
        categorie: params.categorie,
        type_document: params.type_document,
        fichier_url: params.fichier_url,
        fichier_nom: params.fichier_nom || '',
        fichier_type_mime: params.fichier_type_mime || '',
        fichier_taille: params.fichier_taille || 0,
        langue: 'fr',
        mots_cles: '[]',
        resume: '',
        nb_chunks: 0,
        nb_pages: 0,
        version: 1,
        auteur: params.auteur,
        statut: 'brouillon',
        tags: JSON.stringify(params.tags || []),
        pays: params.pays || 'ALL',
        is_latest_version: true,
        nb_consultations: 0,
        date_indexation: new Date().toISOString(),
        erreur_indexation: 'Extraction de texte impossible ou document vide',
      });
      return { success: false, document: doc, error: 'Extraction de texte impossible ou document vide' };
    }

    console.log(`[RAGEngine] ✅ Texte extrait: ${extraction.texte.length} caractères, langue: ${extraction.langue}`);

    // Étape 2 : Découpage en chunks
    const chunksTexte = decouperTexteIntelligent(extraction.texte);
    console.log(`[RAGEngine] ✅ Découpé en ${chunksTexte.length} chunks`);

    // Étape 3 : Résumé (sur les premiers 4000 caractères)
    const resume = await genererResumeDocument(base44, extraction.texte);

    // Étape 4 : Mots-clés globaux
    const motsCles = await extraireMotsClesDocument(base44, extraction.texte);

    // Étape 5 : Gestion du versionnement
    let version = 1;
    let versionPrecedenteId = '';
    let historique: any[] = [];

    if (params.document_existant_id) {
      // Mise à jour : archiver l'ancien document et ses chunks
      const oldDoc = await base44.asServiceRole.entities.VenusDocument.get(params.document_existant_id);
      if (oldDoc) {
        version = (oldDoc.version || 1) + 1;
        versionPrecedenteId = oldDoc.id;

        // Récupérer l'historique existant
        try { historique = JSON.parse(oldDoc.historique || '[]'); } catch {}

        // Archiver l'ancien document
        await base44.asServiceRole.entities.VenusDocument.update(oldDoc.id, {
          statut: 'archive',
          is_latest_version: false,
        });

        // Archiver les anciens chunks
        const oldChunks = await base44.asServiceRole.entities.VenusDocumentChunk.filter(
          { document_id: oldDoc.id },
          '-chunk_index', 500
        );
        for (const oc of oldChunks) {
          await base44.asServiceRole.entities.VenusDocumentChunk.update(oc.id, {
            document_statut: 'archive',
          });
        }

        console.log(`[RAGEngine] 📦 Ancienne version ${oldDoc.version} archivée (${oldChunks.length} chunks)`);
      }
    }

    // Ajouter l'entrée d'historique
    historique.push({
      version,
      auteur: params.auteur,
      date: new Date().toISOString(),
      action: params.document_existant_id ? 'mise_a_jour' : 'creation',
    });

    // Étape 6 : Créer le document
    const document = await base44.asServiceRole.entities.VenusDocument.create({
      titre: params.titre,
      description: params.description || '',
      categorie: params.categorie,
      type_document: params.type_document,
      fichier_url: params.fichier_url,
      fichier_nom: params.fichier_nom || '',
      fichier_type_mime: params.fichier_type_mime || '',
      fichier_taille: params.fichier_taille || 0,
      langue: extraction.langue,
      mots_cles: JSON.stringify(motsCles),
      resume,
      nb_chunks: chunksTexte.length,
      nb_pages: extraction.nb_pages,
      version,
      auteur: params.auteur,
      statut: params.statut || 'valide',
      date_validation: params.statut === 'valide' || !params.statut ? new Date().toISOString() : undefined,
      valide_par: params.statut === 'valide' || !params.statut ? params.auteur : '',
      historique: JSON.stringify(historique),
      tags: JSON.stringify(params.tags || []),
      pays: params.pays || 'ALL',
      version_precedente_id: versionPrecedenteId,
      is_latest_version: true,
      nb_consultations: 0,
      date_indexation: new Date().toISOString(),
    });

    console.log(`[RAGEngine] ✅ Document créé: ${document.id} (version ${version})`);

    // Étape 7 : Créer les chunks
    const chunkRecords: any[] = [];
    for (let i = 0; i < chunksTexte.length; i++) {
      const chunkTexte = chunksTexte[i];

      // Extraire des mots-clés spécifiques au chunk (pour les chunks assez longs)
      let chunkMotsCles: string[] = [];
      if (chunkTexte.length > 100) {
        const chunkKeywordsRaw = extraireMotsClesFromQuery(chunkTexte);
        chunkMotsCles = chunkKeywordsRaw.slice(0, 10);
      }

      const chunk = await base44.asServiceRole.entities.VenusDocumentChunk.create({
        document_id: document.id,
        document_titre: document.titre,
        document_version: document.version,
        document_categorie: document.categorie,
        document_statut: document.statut,
        document_pays: document.pays,
        chunk_index: i,
        contenu: chunkTexte,
        mots_cles: JSON.stringify(chunkMotsCles),
        langue: extraction.langue,
        resume_section: chunkTexte.substring(0, 100),
        page_numero: Math.floor(i / 3) + 1,
        nb_consultations: 0,
      });
      chunkRecords.push(chunk);
    }

    console.log(`[RAGEngine] ✅ ${chunkRecords.length} chunks indexés pour "${params.titre}"`);

    return { success: true, document, chunks: chunkRecords };
  } catch (e: any) {
    console.error('[RAGEngine] Erreur indexation:', e.message);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7bis. INDEXATION DIRECTE DE TEXTE (COLLER UN TEXTE)
// ═══════════════════════════════════════════════════════════════════

/**
 * Génère automatiquement un titre à partir d'un texte.
 * Utilise les premières lignes significatives, ou l'IA si le texte est complexe.
 */
export async function genererTitreAutomatique(base44: any, texte: string): Promise<string> {
  if (!texte || texte.trim().length === 0) return 'Document sans titre';

  const lignes = texte.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const premiereLigne = lignes[0] || '';

  // Si la première ligne est courte et ressemble à un titre (< 100 chars, pas de ponctuation finale)
  if (premiereLigne.length > 5 && premiereLigne.length <= 100 && !/[.!?,;:]$/.test(premiereLigne)) {
    return premiereLigne.substring(0, 100);
  }

  // Sinon, utiliser l'IA pour générer un titre
  try {
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Genere un titre court et descriptif (max 80 caracteres) pour le document suivant. Retourne uniquement le titre, sans guillemets ni ponctuation finale.

Document:
${texte.substring(0, 2000)}`,
      response_json_schema: {
        type: 'object',
        properties: {
          titre: { type: 'string', description: 'Titre court et descriptif' },
        },
        required: ['titre'],
      },
    });
    const result: any = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
    return (result.titre || premiereLigne.substring(0, 80) || 'Document sans titre').substring(0, 100);
  } catch {
    // Fallback: utiliser la première ligne tronquée
    return premiereLigne.substring(0, 80) || 'Document sans titre';
  }
}

/**
 * Détecte automatiquement la catégorie d'un texte.
 */
export function detecterCategorieAutomatique(texte: string): string {
  if (!texte) return 'SILGAPP';
  const lower = texte.toLowerCase();

  const CATEGORIES_MAP: Record<string, string[]> = {
    'Livreurs': ['livreur', 'coursier', 'chauffeur', 'transporteur'],
    'Clients': ['client', 'customer', 'utilisateur'],
    'Pharmacies': ['pharmacie', 'medicament', 'ordonnance'],
    'Restaurants': ['restaurant', 'repas', 'menu', 'plat', 'nourriture'],
    'Boutiques': ['boutique', 'magasin', 'produit', 'commerce'],
    'Paiements': ['paiement', 'payer', 'facture', 'transaction', 'argent'],
    'Juridique': ['legal', 'juridique', 'contrat', 'cgu', 'confidentialite'],
    'Marketing': ['marketing', 'publicite', 'promotion', 'campagne'],
    'Technique': ['api', 'technique', 'integration', 'webhook', 'systeme'],
    'Formation': ['formation', 'guide', 'tutoriel', 'apprentissage'],
    'Administration': ['administration', 'admin', 'gestion', 'configuration'],
  };

  let bestCat = 'SILGAPP';
  let bestScore = 0;

  for (const [cat, mots] of Object.entries(CATEGORIES_MAP)) {
    let score = 0;
    for (const mot of mots) {
      const matches = (lower.match(new RegExp(`\\b${mot}\\b`, 'g')) || []).length;
      score += matches;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  return bestCat;
}

/**
 * Pipeline d'indexation directe de texte (copier-coller).
 *
 * Étapes :
 * 1. Générer un titre automatique
 * 2. Détecter la catégorie automatiquement
 * 3. Détecter la langue
 * 4. Découper en chunks
 * 5. Générer un résumé
 * 6. Extraire les mots-clés
 * 7. Créer le VenusDocument
 * 8. Créer les VenusDocumentChunk
 *
 * Aucun champ requis de la part de l'admin — juste le texte brut.
 */
export async function indexerTexteDirect(
  base44: any,
  params: {
    texte: string;
    auteur?: string;
  }
): Promise<{ success: boolean; document?: any; chunks?: any[]; error?: string }> {
  try {
    const texte = params.texte?.trim();
    if (!texte || texte.length < 20) {
      return { success: false, error: 'Le texte est trop court (minimum 20 caractères)' };
    }

    console.log(`[RAGEngine] 📝 Indexation directe de texte (${texte.length} caractères)`);

    // Étape 1 : Titre automatique
    const titre = await genererTitreAutomatique(base44, texte);
    console.log(`[RAGEngine] ✅ Titre généré: "${titre}"`);

    // Étape 2 : Catégorie automatique
    const categorie = detecterCategorieAutomatique(texte);

    // Étape 3 : Langue
    const langue = detecterLangue(texte);

    // Étape 4 : Découpage en chunks
    const chunksTexte = decouperTexteIntelligent(texte);
    console.log(`[RAGEngine] ✅ Découpé en ${chunksTexte.length} chunks`);

    // Étape 5 : Résumé
    const resume = await genererResumeDocument(base44, texte);

    // Étape 6 : Mots-clés
    const motsCles = await extraireMotsClesDocument(base44, texte);

    // Étape 7 : Créer le document
    const document = await base44.asServiceRole.entities.VenusDocument.create({
      titre,
      description: resume.substring(0, 200),
      categorie,
      type_document: 'Texte',
      fichier_url: '',
      fichier_nom: '',
      fichier_type_mime: 'text/plain',
      fichier_taille: texte.length,
      langue,
      mots_cles: JSON.stringify(motsCles),
      resume,
      nb_chunks: chunksTexte.length,
      nb_pages: Math.ceil(texte.length / 3000),
      version: 1,
      auteur: params.auteur || 'admin',
      statut: 'valide',
      date_validation: new Date().toISOString(),
      valide_par: params.auteur || 'admin',
      historique: JSON.stringify([{ version: 1, auteur: params.auteur || 'admin', date: new Date().toISOString(), action: 'creation_directe' }]),
      tags: JSON.stringify([]),
      pays: 'ALL',
      version_precedente_id: '',
      is_latest_version: true,
      nb_consultations: 0,
      date_indexation: new Date().toISOString(),
    });

    console.log(`[RAGEngine] ✅ Document créé: ${document.id} (titre: "${titre}")`);

    // Étape 8 : Créer les chunks
    const chunkRecords: any[] = [];
    for (let i = 0; i < chunksTexte.length; i++) {
      const chunkTexte = chunksTexte[i];

      let chunkMotsCles: string[] = [];
      if (chunkTexte.length > 100) {
        const chunkKeywordsRaw = extraireMotsClesFromQuery(chunkTexte);
        chunkMotsCles = chunkKeywordsRaw.slice(0, 10);
      }

      const chunk = await base44.asServiceRole.entities.VenusDocumentChunk.create({
        document_id: document.id,
        document_titre: document.titre,
        document_version: document.version,
        document_categorie: document.categorie,
        document_statut: document.statut,
        document_pays: document.pays,
        chunk_index: i,
        contenu: chunkTexte,
        mots_cles: JSON.stringify(chunkMotsCles),
        langue,
        resume_section: chunkTexte.substring(0, 100),
        page_numero: Math.floor(i / 3) + 1,
        nb_consultations: 0,
      });
      chunkRecords.push(chunk);
    }

    console.log(`[RAGEngine] ✅ ${chunkRecords.length} chunks indexés pour "${titre}"`);

    return { success: true, document, chunks: chunkRecords };
  } catch (e: any) {
    console.error('[RAGEngine] Erreur indexation directe:', e.message);
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 8. GESTION DES VERSIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Récupère l'historique des versions d'un document.
 */
export async function getHistoriqueVersions(base44: any, documentId: string): Promise<any[]> {
  try {
    const doc = await base44.asServiceRole.entities.VenusDocument.get(documentId);
    if (!doc) return [];

    const versions: any[] = [doc];

    // Remonter la chaîne des versions précédentes
    let current = doc;
    while (current.version_precedente_id) {
      try {
        const prev = await base44.asServiceRole.entities.VenusDocument.get(current.version_precedente_id);
        if (!prev) break;
        versions.push(prev);
        current = prev;
      } catch { break; }
    }

    // Chercher aussi les versions plus récentes
    const allDocs = await base44.asServiceRole.entities.VenusDocument.filter(
      { titre: doc.titre },
      '-version', 20
    );
    for (const d of allDocs) {
      if (!versions.find(v => v.id === d.id)) {
        versions.push(d);
      }
    }

    return versions.sort((a, b) => (b.version || 0) - (a.version || 0));
  } catch (e: any) {
    console.error('[RAGEngine] Erreur historique versions:', e.message);
    return [];
  }
}

/**
 * Restaure une ancienne version d'un document.
 * Crée une nouvelle version avec le contenu de l'ancienne.
 */
export async function restaurerVersion(base44: any, documentId: string, versionARestaurerId: string, auteur: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docARestaurer = await base44.asServiceRole.entities.VenusDocument.get(versionARestaurerId);
    if (!docARestaurer) return { success: false, error: 'Version introuvable' };

    const docCourant = await base44.asServiceRole.entities.VenusDocument.get(documentId);
    if (!docCourant) return { success: false, error: 'Document courant introuvable' };

    // Lancer la réindexation avec le fichier de l'ancienne version
    const result = await indexerDocumentComplet(base44, {
      fichier_url: docARestaurer.fichier_url,
      fichier_nom: docARestaurer.fichier_nom,
      fichier_type_mime: docARestaurer.fichier_type_mime,
      fichier_taille: docARestaurer.fichier_taille,
      titre: docCourant.titre,
      description: docCourant.description,
      categorie: docCourant.categorie,
      type_document: docCourant.type_document,
      auteur,
      pays: docCourant.pays,
      tags: docCourant.tags ? JSON.parse(docCourant.tags) : [],
      statut: 'valide',
      document_existant_id: documentId,
    });

    return { success: result.success, error: result.error };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 9. ANALYTIQUES
// ═══════════════════════════════════════════════════════════════════

export async function getStatistiquesDocuments(base44: any): Promise<any> {
  try {
    const [documents, chunks, searchLogs] = await Promise.all([
      base44.asServiceRole.entities.VenusDocument.list('-created_date', 500),
      base44.asServiceRole.entities.VenusDocumentChunk.filter({ document_statut: 'valide' }, '-created_date', 2000),
      base44.asServiceRole.entities.VenusDocumentSearchLog.list('-created_date', 200),
    ]);

    const docsValides = documents.filter((d: any) => d.statut === 'valide');
    const docsArchives = documents.filter((d: any) => d.statut === 'archive');
    const docsDesactives = documents.filter((d: any) => d.statut === 'desactive');

    // Documents par catégorie
    const parCategorie: Record<string, number> = {};
    for (const d of documents) {
      parCategorie[d.categorie] = (parCategorie[d.categorie] || 0) + 1;
    }

    // Documents les plus consultés
    const plusConsultes = [...documents]
      .sort((a: any, b: any) => (b.nb_consultations || 0) - (a.nb_consultations || 0))
      .slice(0, 10)
      .map((d: any) => ({ id: d.id, titre: d.titre, categorie: d.categorie, consultations: d.nb_consultations || 0 }));

    // Documents jamais utilisés
    const jamaisUtilises = documents
      .filter((d: any) => (d.nb_consultations || 0) === 0 && d.statut === 'valide')
      .map((d: any) => ({ id: d.id, titre: d.titre, categorie: d.categorie }));

    // Recherches sans résultat
    const recherchesSansResultat = searchLogs.filter((s: any) => !s.a_reussi);

    // Temps moyen de recherche
    const tempsMoyen = searchLogs.length > 0
      ? Math.round(searchLogs.reduce((sum: number, s: any) => sum + (s.temps_recherche_ms || 0), 0) / searchLogs.length)
      : 0;

    // Taux de réussite
    const tauxReussite = searchLogs.length > 0
      ? Math.round((searchLogs.filter((s: any) => s.a_reussi).length / searchLogs.length) * 100)
      : 0;

    // Sources utilisées
    const sourcesUtilisees: Record<string, number> = {};
    for (const s of searchLogs) {
      const src = s.source_utilisee || 'ia_generale';
      sourcesUtilisees[src] = (sourcesUtilisees[src] || 0) + 1;
    }

    return {
      total_documents: documents.length,
      documents_valides: docsValides.length,
      documents_archives: docsArchives.length,
      documents_desactives: docsDesactives.length,
      total_chunks: chunks.length,
      total_recherches: searchLogs.length,
      recherches_sans_resultat: recherchesSansResultat.length,
      temps_moyen_recherche_ms: tempsMoyen,
      taux_reussite: tauxReussite,
      par_categorie: parCategorie,
      plus_consultes: plusConsultes,
      jamais_utilises: jamaisUtilises,
      sources_utilisees: sourcesUtilisees,
      recherches_sans_resultat_liste: recherchesSansResultat.slice(0, 10).map((s: any) => ({
        requete: s.requete,
        date: s.created_date,
      })),
    };
  } catch (e: any) {
    console.error('[RAGEngine] Erreur statistiques:', e.message);
    return null;
  }
}