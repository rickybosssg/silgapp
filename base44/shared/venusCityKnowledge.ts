/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR DE CONNAISSANCES VENUS — Filtrage par VILLE > PAYS > GLOBAL
 * ═══════════════════════════════════════════════════════════════════
 *
 * Hiérarchie de priorité des connaissances VENUS :
 *   1. VILLE  — règle spécifique à une ville (ex: Ouagadougou)
 *   2. PAYS   — règle applicable à tout un pays (ex: BF)
 *   3. ALL    — règle globale applicable partout
 *
 * Une règle spécifique à une ville REMPLACE une règle de même catégorie
 * applicable au pays ou globalement.
 *
 * Utilisé par :
 *   - rechercherConnaissancesValidees (VenusKnowledge)
 *   - rechercherReglesMetier (VenusBusinessRule)
 *   - rechercherDocumentsRag (VenusDocumentChunk)
 *
 * Le Super Admin gère les connaissances par ville dans l'interface admin
 * (KnowledgeBaseTab). Aucune modification de code n'est nécessaire pour
 * ajouter une ville — tout est piloté par les données.
 */

/**
 * Normalise un nom de ville pour la comparaison.
 * - Minuscules
 * - Sans accents
 * - Sans espaces superflus
 * Ex: "Ouagadougou" → "ouagadougou", "Bobo-Dioulasso" → "bobo-dioulasso"
 */
export function normalizeCity(ville: string | null | undefined): string {
  if (!ville) return '';
  return String(ville)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Détermine si une entrée de connaissance correspond à une ville donnée.
 *
 * @param entryVille - Valeur du champ "ville" de l'entrée (peut être vide)
 * @param entryPays - Valeur du champ "pays" de l'entrée (peut être "ALL")
 * @param targetVille - Ville de l'utilisateur (normalisée)
 * @param targetPays - Pays de l'utilisateur (ex: BF)
 * @returns true si l'entrée est applicable à cette ville/pays
 */
export function matchCityScope(
  entryVille: string | null | undefined,
  entryPays: string | null | undefined,
  targetVille: string,
  targetPays: string
): boolean {
  const entryPaysNorm = (entryPays || 'ALL').toUpperCase();
  const entryVilleNorm = normalizeCity(entryVille);

  // Entrée globale (ALL) — applicable partout
  if (entryPaysNorm === 'ALL' && !entryVilleNorm) return true;

  // Entrée spécifique à un pays — applicable si le pays correspond
  if (entryPaysNorm === targetPays?.toUpperCase() && !entryVilleNorm) return true;

  // Entrée spécifique à une ville — applicable si ville ET pays correspondent
  if (entryPaysNorm === targetPays?.toUpperCase() && entryVilleNorm === targetVille) return true;

  // Entrée globale (ALL pays) mais spécifique à une ville — applicable si la ville correspond
  if (entryPaysNorm === 'ALL' && entryVilleNorm === targetVille) return true;

  return false;
}

/**
 * Calcule le niveau de priorité d'une entrée pour le tri VILLE > PAYS > GLOBAL.
 * Plus le score est bas, plus l'entrée est prioritaire.
 *
 * @returns 0 = ville-spécifique, 1 = pays-spécifique, 2 = global
 */
export function cityScopePriority(
  entryVille: string | null | undefined,
  entryPays: string | null | undefined
): number {
  const entryPaysNorm = (entryPays || 'ALL').toUpperCase();
  const entryVilleNorm = normalizeCity(entryVille);

  if (entryVilleNorm) return 0; // Ville-spécifique = priorité maximale
  if (entryPaysNorm !== 'ALL') return 1; // Pays-spécifique
  return 2; // Global
}

/**
 * Trie un tableau d'entrées par priorité VILLE > PAYS > GLOBAL.
 * Les entrées ville-spécifiques apparaissent en premier.
 */
export function sortByCityScope<T extends { ville?: string; pays?: string }>(
  entries: T[],
  targetVille: string,
  targetPays: string
): T[] {
  const targetVilleNorm = normalizeCity(targetVille);
  const targetPaysUpper = (targetPays || '').toUpperCase();

  return entries
    .filter(e => matchCityScope(e.ville, e.pays, targetVilleNorm, targetPaysUpper))
    .sort((a, b) => {
      const pa = cityScopePriority(a.ville, a.pays);
      const pb = cityScopePriority(b.ville, b.pays);
      if (pa !== pb) return pa - pb;
      // Même niveau de portée → tri par priorité métier (critique > haute > normale > basse)
      const prioriteOrder: Record<string, number> = { critique: 0, haute: 1, normale: 2, basse: 3 };
      const pva = (prioriteOrder as any)[(a as any).priorite] ?? 2;
      const pvb = (prioriteOrder as any)[(b as any).priorite] ?? 2;
      return pva - pvb;
    });
}