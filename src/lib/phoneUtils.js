/*
 * SILGAPP - utilitaires telephone centralises.
 *
 * Format normalise interne : international sans "+" ni espaces.
 * Exemples : "22670123456" (BF), "2250701234567" (CI), "22190123456" (SN).
 *
 * ⚠️ Aucun pays codé en dur — la liste SILGAPP_COUNTRIES ci-dessous est un
 *    FALLBACK minimal (BF uniquement) utilisé uniquement avant le chargement
 *    de la BDD. La liste réelle est chargée dynamiquement depuis Country.
 */

import { base44 } from "@/api/base44Client";

// Fallback minimal — uniquement utilisé si la BDD n'est pas encore chargée
export const SILGAPP_COUNTRIES = [
  { code: "BF", dial: "226", len: 8, name: "Burkina Faso", flag: "" },
];

let _dynamicCountriesLoaded = false;

/**
 * Charge dynamiquement les configs pays depuis Country (indicatif, format).
 * Idempotent — ne charge qu'une seule fois.
 */
export async function loadCountryPhoneConfigs() {
  if (_dynamicCountriesLoaded) return;
  try {
    const countries = await base44.entities.Country.filter({ actif: true });
    const dynamic = (countries || []).map(c => ({
      code: c.code,
      dial: String(c.indicatif || "").replace("+", "").replace(/\s/g, ""),
      len: c.format_numero ? parseInt(c.format_numero.replace(/\D/g, "").length) || 8 : 8,
      name: c.nom,
      flag: c.emoji_flag || "",
    })).filter(c => c.code && c.dial);

    // Fusionner sans doublons (priorité à la BDD)
    const existingCodes = new Set(SILGAPP_COUNTRIES.map(c => c.code));
    for (const c of dynamic) {
      if (!existingCodes.has(c.code)) {
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

export function getCountryConfig(countryCode = "BF") {
  return SILGAPP_COUNTRIES.find((item) => item.code === countryCode) || SILGAPP_COUNTRIES[0];
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

export function extractLocalPhone(phone, countryCode = "BF") {
  const country = getCountryConfig(countryCode);
  let digits = onlyDigits(phone);

  if (digits.startsWith(country.dial)) {
    digits = digits.slice(country.dial.length);
  }

  if (digits.startsWith("0") && digits.length > country.len) {
    digits = digits.slice(1);
  }

  return digits.slice(0, country.len);
}

export function formatLocalPhone(phone, countryCode = "BF") {
  const country = getCountryConfig(countryCode);
  const local = extractLocalPhone(phone, country.code);

  if (country.code === "GH" && local.length > 2) {
    return [local.slice(0, 2), local.slice(2, 5), local.slice(5, 9)].filter(Boolean).join(" ");
  }

  return local.match(/.{1,2}/g)?.join(" ") || local;
}

export function phonePlaceholder(countryCode = "BF") {
  const country = getCountryConfig(countryCode);
  if (country.code === "GH") return "XX XXX XXXX";
  if (country.code === "CI") return "XX XX XX XX XX";
  return "XX XX XX XX";
}

export function normalizePhone(phone, countryCode = null) {
  if (!phone) return null;
  const n = onlyDigits(phone);
  if (!n) return null;

  for (const { dial, len } of SILGAPP_COUNTRIES) {
    if (n.startsWith(dial) && n.length === dial.length + len) {
      return n;
    }
  }

  if (countryCode) {
    const country = getCountryConfig(countryCode);
    const local = extractLocalPhone(n, country.code);
    if (local.length === country.len) return country.dial + local;
  }

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

  const countries = countryCode
    ? [
        ...SILGAPP_COUNTRIES.filter((c) => c.code === countryCode),
        ...SILGAPP_COUNTRIES.filter((c) => c.code !== countryCode),
      ]
    : SILGAPP_COUNTRIES;

  for (const { dial, len } of countries) {
    if (n.length === len && !n.startsWith("0")) return dial + n;
  }

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

export async function findClientByPhone(base44, phone) {
  const variants = phoneVariants(phone);
  for (const v of variants) {
    const res = await base44.entities.ClientExterne.filter({ telephone: v }).catch(() => []);
    if (res?.length > 0) return res[0];
  }
  return null;
}