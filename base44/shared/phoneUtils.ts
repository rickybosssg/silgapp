/**
 * SILGAPP — Utilitaires téléphone centralisés (BACKEND)
 *
 * Format normalisé interne : international sans "+" ni espaces
 * Exemples : "22670123456" (BF), "22507012345678" (CI), "22190123456" (SN)
 *
 * Ce fichier est la SOURCE UNIQUE DE VÉRITÉ pour toute logique téléphone côté backend.
 * Toutes les fonctions backend doivent importer depuis ici.
 */

/** Tous les pays SILGAPP avec indicatif et longueur du numéro local */
export const SILGAPP_COUNTRIES = [
  { code: "BF", dial: "226", len: 8  },
  { code: "CI", dial: "225", len: 10 },
  { code: "TG", dial: "228", len: 8  },
  { code: "BJ", dial: "229", len: 8  },
  { code: "SN", dial: "221", len: 9  },
  { code: "ML", dial: "223", len: 8  },
  { code: "GN", dial: "224", len: 9  },
  { code: "NE", dial: "227", len: 8  },
  { code: "GH", dial: "233", len: 9  },
];

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
 */
export function normalizePhone(phone: string | null | undefined, countryCode: string | null = null): string | null {
  if (!phone) return null;
  const n = String(phone).replace(/\D/g, "");
  if (!n) return null;

  // 1. Déjà en format international (commence par un indicatif connu)
  for (const { dial, len } of SILGAPP_COUNTRIES) {
    if (n.startsWith(dial) && n.length === dial.length + len) {
      return n;
    }
  }

  // 2. Format local avec 0 initial (ex: "070123456" BF → "22670123456")
  if (n.startsWith("0")) {
    const withoutZero = n.slice(1);
    const countries = countryCode
      ? [...SILGAPP_COUNTRIES.filter(c => c.code === countryCode), ...SILGAPP_COUNTRIES.filter(c => c.code !== countryCode)]
      : SILGAPP_COUNTRIES;
    for (const { dial, len } of countries) {
      if (withoutZero.length === len) {
        return dial + withoutZero;
      }
    }
  }

  // 3. Format local sans 0 (ex: "70123456" BF)
  const countries = countryCode
    ? [...SILGAPP_COUNTRIES.filter(c => c.code === countryCode), ...SILGAPP_COUNTRIES.filter(c => c.code !== countryCode)]
    : SILGAPP_COUNTRIES;
  for (const { dial, len } of countries) {
    if (n.length === len && !n.startsWith("0")) {
      return dial + n;
    }
  }

  // 4. Fallback : retourner tel quel (ne pas bloquer)
  return n;
}

/**
 * Retourne toutes les variantes connues d'un numéro (format local + international)
 * Utile pour les recherches en base où le format de stockage est incertain.
 */
export function phoneVariants(phone: string | null | undefined): string[] {
  const n = (phone || "").replace(/\D/g, "");
  if (!n) return [];
  const variants = new Set<string>([n]);

  for (const { dial, len } of SILGAPP_COUNTRIES) {
    if (n.startsWith(dial) && n.length === dial.length + len) {
      variants.add(n.slice(dial.length));
      break;
    }
    if (n.length === len && !n.startsWith("0")) {
      variants.add(dial + n);
      break;
    }
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
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
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
 * Ajoute le préfixe "+" si nécessaire (pour les appels API Twilio)
 * Ex: "22670123456" → "+22670123456"
 */
export function withPlusPrefix(phone: string | null | undefined): string {
  if (!phone) return "";
  const n = phone.replace(/\D/g, "");
  return n ? `+${n}` : "";
}