/**
 * ═══════════════════════════════════════════════════════════════════
 * QUARTIER RESOLVER — Résolution intelligente des quartiers
 * ═══════════════════════════════════════════════════════════════════
 *
 * Normalise la recherche de quartiers avec :
 * 1. Normalisation (accents, majuscules, apostrophes, tirets, espaces)
 * 2. Recherche par variante (alias)
 * 3. Recherche approximative (Levenshtein distance ≤ 2)
 * 4. Proposition des multiples matchs (jamais de choix silencieux)
 *
 * Utilisé par : QuartierSelect, AdminCourseForm, GPS resolution
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Normalise un texte pour la comparaison :
 * - Retire les accents
 * - Met en minuscules
 * - Remplace apostrophes et tirets par des espaces
 * - Réduit les espaces multiples
 */
export function normalizeQuartierName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Distance de Levenshtein entre deux chaînes.
 * Utilisée pour la recherche approximative (fautes de frappe légères).
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
    }
  }
  return d[m][n];
}

/**
 * Résout un nom de quartier saisi par l'utilisateur contre une liste de quartiers.
 *
 * @param {string} input - Le texte saisi par l'utilisateur
 * @param {Array} quartiers - Liste des quartiers (entity Quartier)
 * @returns {{ match: object|null, ambiguous: boolean, suggestions: Array }}
 *   - match: le quartier canonique si un seul match est trouvé
 *   - ambiguous: true si plusieurs matchs (l'utilisateur doit choisir)
 *   - suggestions: liste des matchs trouvés (pour affichage)
 */
export function resolveQuartier(input, quartiers) {
  if (!input || !input.trim() || !quartiers || quartiers.length === 0) {
    return { match: null, ambiguous: false, suggestions: [] };
  }

  const normalizedInput = normalizeQuartierName(input);

  // ── Étape 1 : Match exact normalisé ──
  const exactMatches = quartiers.filter((q) => {
    return normalizeQuartierName(q.nom) === normalizedInput;
  });

  if (exactMatches.length === 1) {
    return { match: exactMatches[0], ambiguous: false, suggestions: exactMatches };
  }
  if (exactMatches.length > 1) {
    return { match: null, ambiguous: true, suggestions: exactMatches };
  }

  // ── Étape 2 : Match par variante (alias) ──
  const variantMatches = quartiers.filter((q) => {
    if (!q.variantes) return false;
    const variantes = q.variantes.split(",").map((v) => v.trim()).filter(Boolean);
    return variantes.some((v) => normalizeQuartierName(v) === normalizedInput);
  });

  if (variantMatches.length === 1) {
    return { match: variantMatches[0], ambiguous: false, suggestions: variantMatches };
  }
  if (variantMatches.length > 1) {
    return { match: null, ambiguous: true, suggestions: variantMatches };
  }

  // ── Étape 3 : Recherche approximative (Levenshtein ≤ 2) ──
  // Uniquement pour les mots de longueur suffisante (≥ 4 caractères)
  if (normalizedInput.length < 4) {
    return { match: null, ambiguous: false, suggestions: [] };
  }

  const fuzzyMatches = quartiers
    .map((q) => {
      const normNom = normalizeQuartierName(q.nom);
      const dist = levenshtein(normalizedInput, normNom);
      // Distance proportionnelle : 2 erreurs pour un mot de 8+ lettres, 1 pour un mot court
      const maxDist = normNom.length >= 8 ? 2 : 1;
      if (dist <= maxDist && dist > 0) {
        return { quartier: q, distance: dist };
      }
      // Vérifier aussi les variantes
      if (q.variantes) {
        const variantes = q.variantes.split(",").map((v) => v.trim()).filter(Boolean);
        for (const v of variantes) {
          const normV = normalizeQuartierName(v);
          const d = levenshtein(normalizedInput, normV);
          if (d <= maxDist && d > 0) {
            return { quartier: q, distance: d };
          }
        }
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  if (fuzzyMatches.length === 1) {
    return { match: fuzzyMatches[0].quartier, ambiguous: false, suggestions: [fuzzyMatches[0].quartier] };
  }
  if (fuzzyMatches.length > 1) {
    // CRITIQUE : Ne jamais choisir silencieusement entre plusieurs matchs.
    // Même si un match est meilleur, si les coordonnées sont très différentes,
    // l'utilisateur doit choisir explicitement.
    return { match: null, ambiguous: true, suggestions: fuzzyMatches.map((f) => f.quartier) };
  }

  return { match: null, ambiguous: false, suggestions: [] };
}

/**
 * Filtre et trie les quartiers pour l'autocomplétion.
 * Utilise la normalisation + recherche par inclusion + Levenshtein.
 *
 * @param {string} query - Texte de recherche
 * @param {Array} quartiers - Liste des quartiers
 * @param {number} limit - Nombre max de résultats (défaut 50)
 * @returns {Array} Quartiers triés par pertinence
 */
export function searchQuartiers(query, quartiers, limit = 50) {
  const normalizedQuery = normalizeQuartierName(query);

  if (!normalizedQuery) {
    return quartiers.slice(0, limit);
  }

  return quartiers
    .map((q) => {
      const normNom = normalizeQuartierName(q.nom);
      let score = 0;

      // Match exact normalisé
      if (normNom === normalizedQuery) score = 100;
      // Commence par la requête
      else if (normNom.startsWith(normalizedQuery)) score = 90;
      // La requête est un token du nom
      else if (normNom.split(" ").some((token) => token.startsWith(normalizedQuery))) score = 80;
      // Le nom contient la requête
      else if (normNom.includes(normalizedQuery)) score = 60;
      // Recherche dans les variantes
      else if (q.variantes) {
        const variantes = q.variantes.split(",").map((v) => v.trim()).filter(Boolean);
        const normVariantes = variantes.map((v) => normalizeQuartierName(v));
        if (normVariantes.some((v) => v === normalizedQuery)) score = 95;
        else if (normVariantes.some((v) => v.startsWith(normalizedQuery))) score = 85;
        else if (normVariantes.some((v) => v.includes(normalizedQuery))) score = 55;
      }

      // Bonus de recherche approximative pour les mots de 4+ lettres
      if (score === 0 && normalizedQuery.length >= 4) {
        const dist = levenshtein(normalizedQuery, normNom);
        const maxDist = normNom.length >= 8 ? 2 : 1;
        if (dist <= maxDist && dist > 0) {
          score = Math.max(1, 40 - dist * 10);
        }
      }

      return { quartier: q, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.quartier.nom.localeCompare(b.quartier.nom, "fr"))
    .slice(0, limit)
    .map(({ quartier }) => quartier);
}