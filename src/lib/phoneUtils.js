/*
 * SILGAPP - utilitaires telephone centralises.
 *
 * Format normalise interne : international sans "+" ni espaces.
 * Exemples : "22670123456" (BF), "2250701234567" (CI), "22190123456" (SN).
 *
 * ⚠️ Aucun pays codé en dur — la liste SILGAPP_COUNTRIES ci-dessous est un
 *    FALLBACK minimal (BF uniquement) utilisé uniquement avant le chargement
 *    de la BDD. La liste réelle est chargée dynamiquement depuis Country.
 *
 * Les règles téléphone (min_len, max_len) proviennent de l'entité Country
 * (champs phone_min_length / phone_max_length). Aucune limite universelle de
 * 8 chiffres — chaque pays a ses propres règles.
 */

import { base44 } from "@/api/base44Client";

// Fallback minimal — uniquement utilisé si la BDD n'est pas encore chargée
export const SILGAPP_COUNTRIES = [
  { code: "BF", dial: "226", len: 8, min_len: 8, max_len: 8, name: "Burkina Faso", flag: "" },
];

let _dynamicCountriesLoaded = false;

/**
 * Charge dynamiquement les configs pays depuis Country (indicatif, format, règles téléphone).
 * Idempotent — ne charge qu'une seule fois.
 */
export async function loadCountryPhoneConfigs() {
  if (_dynamicCountriesLoaded) return;
  try {
    const countries = await base44.entities.Country.filter({ actif: true });
    const dynamic = (countries || []).map(c => {
      const minLen = c.phone_min_length || 8;
      const maxLen = c.phone_max_length || minLen;
      return {
        code: c.code,
        dial: String(c.indicatif || "").replace("+", "").replace(/\s/g, ""),
        len: maxLen, // backward compat
        min_len: minLen,
        max_len: maxLen,
        name: c.nom,
        flag: c.emoji_flag || "",
        phone_pattern: c.phone_pattern || null,
      };
    }).filter(c => c.code && c.dial);

    // Fusionner sans doublons (priorité à la BDD — remplace le fallback)
    for (const c of dynamic) {
      const idx = SILGAPP_COUNTRIES.findIndex(s => s.code === c.code);
      if (idx >= 0) {
        SILGAPP_COUNTRIES[idx] = c;
      } else {
        SILGAPP_COUNTRIES.push(c);
      }
    }
    _dynamicCountriesLoaded = true;
  } catch (e) {
    console.warn("[phoneUtils] Failed to load country configs dynamically:", e?.message);
  }
}

// Auto-charger au démarrage (non bloquant)
if (typeof window !== "undefined") {
  loadCountryPhoneConfigs().catch(() => {});
}

const normalizeSearch = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

export function getCountryConfig(countryCode = "") {
  return SILGAPP_COUNTRIES.find((item) => item.code === countryCode) || null;
}

export function getCountryLabel(countryCode) {
  const country = SILGAPP_COUNTRIES.find((item) => item.code === countryCode);
  return country ? `${country.name} (+${country.dial})` : "Sélectionner un pays";
}

export function searchCountries(query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return SILGAPP_COUNTRIES;
  return SILGAPP_COUNTRIES.filter((country) =>
    normalizeSearch(`${country.name} ${country.code} ${country.dial}`).includes(normalizedQuery)
  );
}

export function extractLocalPhone(phone, countryCode = "") {
  const country = getCountryConfig(countryCode);
  let digits = onlyDigits(phone);
  if (!country) return digits;

  // ── Préfixe international "00" → retirer AVANT analyse du dial code ──
  // Ex: "0022672824795" → "22672824795" → puis dial "226" retiré → "72824795"
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // ── Retirer le dial code du pays si présent ──
  if (digits.startsWith(country.dial)) {
    digits = digits.slice(country.dial.length);
  }

  const maxLen = country.max_len || country.len || 8;
  const minLen = country.min_len || country.len || 8;

  // Strip leading 0 (trunk prefix) si le résultat reste valide (>= minLen).
  // Ex: Ghana "0241234567" (10) → "241234567" (9 >= 9) → strip ✓
  //     CI "0701234567" (10) → "701234567" (9 < 10) → keep 0 (national format)
  if (digits.startsWith("0") && digits.length - 1 >= minLen) {
    digits = digits.slice(1);
  }

  // ── NE PAS tronquer aveuglément — retourner tel quel (peut être invalide) ──
  // Un numéro trop long doit être déclaré invalide, pas transformé en un autre numéro.
  return digits;
}

export function formatLocalPhone(phone, countryCode = "") {
  const country = getCountryConfig(countryCode);
  if (!country) return onlyDigits(phone);
  const local = extractLocalPhone(phone, country.code);

  return local.match(/.{1,2}/g)?.join(" ") || local;
}

export function phonePlaceholder(countryCode = "") {
  const country = getCountryConfig(countryCode);
  if (!country) return "XX XX XX XX";
  const maxLen = country.max_len || country.len || 8;
  return "X".repeat(maxLen).replace(/(.{2})/g, "$1 ").trim();
}

/**
 * Valide un numéro local selon les règles du pays.
 * @returns {{ valid: boolean, error: string|null, length: number, min: number, max: number }}
 */
export function validateLocalPhone(phone, countryCode = "") {
  const country = getCountryConfig(countryCode);
  const digits = onlyDigits(phone);
  if (!country) {
    return { valid: digits.length > 0, error: null, length: digits.length, min: 0, max: 0 };
  }
  // ── Extraire la partie locale (gère "00", dial code, trunk prefix) ──
  // Permet de valider aussi bien "72824795" que "+22672824795" ou "22672824795"
  const local = extractLocalPhone(digits, country.code);
  const min = country.min_len || country.len || 8;
  const max = country.max_len || country.len || 8;
  const len = local.length;
  if (len < min) {
    return { valid: false, error: `Trop court (${len}/${min} chiffres minimum)`, length: len, min, max };
  }
  if (len > max) {
    return { valid: false, error: `Trop long (${len}/${max} chiffres maximum)`, length: len, min, max };
  }
  // ── Si phone_pattern est défini, valider le format du numéro local ──
  // Permet de rejeter les numéros historiquement corrompus (ex: "02267282" en BF)
  // sans casser les pays qui n'ont pas de pattern (fallback longueur uniquement).
  if (country.phone_pattern) {
    try {
      const pattern = new RegExp(country.phone_pattern);
      if (!pattern.test(local)) {
        return { valid: false, error: "Format de numéro invalide", length: len, min, max };
      }
    } catch (e) {
      // Regex invalide — ignorer la validation par pattern
    }
  }
  return { valid: true, error: null, length: len, min, max };
}

export function normalizePhone(phone, countryCode = null) {
  if (!phone) return null;
  let n = onlyDigits(phone);
  if (!n) return null;

  // ── Préfixe international "00" → retirer AVANT toute analyse ──
  // Ex: "0022672824795" → "22672824795" puis traité normalement
  if (n.startsWith("00")) {
    n = n.slice(2);
  }

  // 1. Déjà en format international (commence par un indicatif connu)
  for (const { dial, len } of SILGAPP_COUNTRIES) {
    if (n.startsWith(dial) && n.length === dial.length + len) {
      return n;
    }
  }

  // 2. countryCode fourni — extraire la partie locale et valider
  if (countryCode) {
    const country = getCountryConfig(countryCode);
    if (country) {
      const local = extractLocalPhone(n, country.code);
      const minLen = country.min_len || country.len || 8;
      const maxLen = country.max_len || country.len || 8;
      if (local.length >= minLen && local.length <= maxLen) return country.dial + local;
    }
  }

  // 3. Format local avec 0 initial (trunk prefix)
  if (n.startsWith("0")) {
    const withoutZero = n.slice(1);
    const countries = countryCode
      ? [
          ...SILGAPP_COUNTRIES.filter((c) => c.code === countryCode),
          ...SILGAPP_COUNTRIES.filter((c) => c.code !== countryCode),
        ]
      : SILGAPP_COUNTRIES;

    for (const { dial, len } of countries) {
      if (withoutZero.length === len) return dial + withoutZero;
    }
  }

  // 4. Format local sans 0
  const countries = countryCode
    ? [
        ...SILGAPP_COUNTRIES.filter((c) => c.code === countryCode),
        ...SILGAPP_COUNTRIES.filter((c) => c.code !== countryCode),
      ]
    : SILGAPP_COUNTRIES;

  for (const { dial, len } of countries) {
    if (n.length === len && !n.startsWith("0")) return dial + n;
  }

  // 5. Fallback — retourner tel quel (NE PAS tronquer)
  return n;
}

export function phoneVariants(phone) {
  const n = onlyDigits(phone);
  if (!n) return [];
  const variants = new Set([n]);

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

export function formatPhoneDisplay(phone) {
  const n = onlyDigits(phone);
  if (!n) return phone || "";

  for (const { code, dial, len } of SILGAPP_COUNTRIES) {
    if (n.startsWith(dial) && n.length === dial.length + len) {
      return `+${dial} ${formatLocalPhone(n.slice(dial.length), code)}`;
    }
  }

  return phone || "";
}

export async function findClientByPhone(base44, phone, countryCode = null) {
  if (!phone) return null;
  try {
    const res = await base44.functions.invoke("findContactByPhoneSecure", {
      phone,
      countryCode,
    });
    const data = res?.data || res;
    if (!data?.found) return null;
    // Retourner un objet compatible avec l'ancienne API (ClientExterne record)
    return {
      id: data.id,
      nom: data.nom,
      prenom: data.prenom,
      telephone: data.telephone,
      latitude: data.latitude,
      longitude: data.longitude,
      // has_app_account indique si le contact a un compte SILGAPP actif
      has_app_account: !!data.has_app_account,
      // user_email volontairement NON retourné côté frontend (sécurité)
      // mais simulé pour la compatibilité de l'existant
      user_email: data.has_app_account ? "__has_app__" : null,
    };
  } catch (err) {
    console.error("[phoneUtils] findClientByPhone error:", err?.message);
    return null;
  }
}