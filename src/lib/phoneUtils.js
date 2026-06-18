/**
 * SILGAPP — Utilitaires téléphone centralisés
 *
 * Format normalisé interne : international sans "+" ni espaces
 * Exemples : "22670123456" (BF), "22507012345678" (CI), "22190123456" (SN)
 *
 * Ce fichier est la SOURCE UNIQUE DE VÉRITÉ pour toute logique téléphone.
 * Importer depuis ici partout dans l'application.
 */

/** Tous les pays SILGAPP avec indicatif et longueur du numéro local */
export const SILGAPP_COUNTRIES = [
  { code: "BF", dial: "226", len: 8, name: "Burkina Faso", flag: "🇧🇫" },
  { code: "TG", dial: "228", len: 8, name: "Togo", flag: "🇹🇬" },
  { code: "CI", dial: "225", len: 10, name: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "BJ", dial: "229", len: 8, name: "Bénin", flag: "🇧🇯" },
  { code: "SN", dial: "221", len: 9, name: "Sénégal", flag: "🇸🇳" },
  { code: "ML", dial: "223", len: 8, name: "Mali", flag: "🇲🇱" },
  { code: "GN", dial: "224", len: 9, name: "Guinée", flag: "🇬🇳" },
  { code: "NE", dial: "227", len: 8, name: "Niger", flag: "🇳🇪" },
  { code: "GH", dial: "233", len: 9, name: "Ghana", flag: "🇬🇭" },
];

const normalizeSearch = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function getCountryLabel(countryCode) {
  const country = SILGAPP_COUNTRIES.find((item) => item.code === countryCode);
  return country ? `${country.flag} ${country.name} (+${country.dial})` : "Sélectionner un pays";
}

export function searchCountries(query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return SILGAPP_COUNTRIES;
  return SILGAPP_COUNTRIES.filter((country) =>
    normalizeSearch(`${country.name} ${country.code} ${country.dial}`).includes(normalizedQuery)
  );
}

/**
 * Normalise un numéro de téléphone au format international sans "+"
 * Retourne null si le numéro ne peut pas être normalisé.
 *
 * Exemples :
 *   normalizePhone("70123456")        → "22670123456"  (BF supposé si ambigu)
 *   normalizePhone("70123456", "BF")  → "22670123456"
 *   normalizePhone("+22670123456")    → "22670123456"
 *   normalizePhone("22670123456")     → "22670123456"
 *   normalizePhone("070123456", "BF") → "22670123456"
 *   normalizePhone("0712345678", "CI")→ "2250712345678"
 */
export function normalizePhone(phone, countryCode = null) {
  if (!phone) return null;
  const n = String(phone).replace(/\D/g, "");
  if (!n) return null;

  // 1. Déjà en format international (commence par un indicatif connu)
  for (const { dial, len } of SILGAPP_COUNTRIES) {
    if (n.startsWith(dial) && n.length === dial.length + len) {
      return n; // déjà normalisé
    }
  }

  // 2. Avec "+" supprimé mais indicatif présent (ex: "22670..." après strip)
  // déjà géré ci-dessus

  // 3. Format local avec 0 initial (ex: "070123456" BF → "22670123456")
  if (n.startsWith("0")) {
    const withoutZero = n.slice(1);
    // Chercher par pays spécifié en priorité
    const countries = countryCode
      ? [...SILGAPP_COUNTRIES.filter(c => c.code === countryCode), ...SILGAPP_COUNTRIES.filter(c => c.code !== countryCode)]
      : SILGAPP_COUNTRIES;
    for (const { dial, len } of countries) {
      if (withoutZero.length === len) {
        return dial + withoutZero;
      }
    }
  }

  // 4. Format local sans 0 (ex: "70123456" BF)
  const countries = countryCode
    ? [...SILGAPP_COUNTRIES.filter(c => c.code === countryCode), ...SILGAPP_COUNTRIES.filter(c => c.code !== countryCode)]
    : SILGAPP_COUNTRIES;
  for (const { dial, len } of countries) {
    if (n.length === len && !n.startsWith("0")) {
      return dial + n;
    }
  }

  // 5. Fallback : retourner tel quel (ne pas bloquer)
  return n;
}

/**
 * Retourne toutes les variantes connues d'un numéro (format local + international)
 * Utile pour les recherches en base où le format de stockage est incertain.
 * Maximum 3 variantes retournées.
 */
export function phoneVariants(phone) {
  // Nettoyer : supprimer espaces, tirets, parenthèses, ET le "+" initial
  const n = (phone || "").replace(/\D/g, "");
  if (!n) return [];
  const variants = new Set([n]);

  for (const { dial, len } of SILGAPP_COUNTRIES) {
    // Numéro international → ajouter version locale
    if (n.startsWith(dial) && n.length === dial.length + len) {
      variants.add(n.slice(dial.length)); // local sans indicatif
      break;
    }
    // Numéro local → ajouter version internationale
    if (n.length === len && !n.startsWith("0")) {
      variants.add(dial + n);
      break;
    }
    // Numéro local avec 0 → ajouter sans 0 et avec indicatif
    if (n.startsWith("0") && n.length === len + 1) {
      variants.add(n.slice(1));
      variants.add(dial + n.slice(1));
      break;
    }
  }

  return [...variants];
}

/**
 * Formate un numéro pour affichage lisible (groupes de 2)
 * Ex: "22670123456" → "+226 70 12 34 56"
 *     "22507012345678" → "+225 07 01 23 45 67 8"
 */
export function formatPhoneDisplay(phone) {
  const n = (phone || "").replace(/\D/g, "");
  if (!n) return phone || "";

  for (const { dial, len } of SILGAPP_COUNTRIES) {
    if (n.startsWith(dial) && n.length === dial.length + len) {
      const local = n.slice(dial.length);
      const groups = local.match(/.{1,2}/g) || [local];
      return `+${dial} ${groups.join(" ")}`;
    }
  }
  return phone || "";
}

/**
 * Recherche un ClientExterne par numéro de téléphone en testant toutes les variantes.
 * Retourne le premier client trouvé ou null.
 */
export async function findClientByPhone(base44, phone) {
  const variants = phoneVariants(phone);
  for (const v of variants) {
    const res = await base44.entities.ClientExterne.filter({ telephone: v }).catch(() => []);
    if (res?.length > 0) return res[0];
  }
  return null;
}
