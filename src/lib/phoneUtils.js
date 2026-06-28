/*
 * SILGAPP - utilitaires telephone centralises.
 *
 * Format normalise interne : international sans "+" ni espaces.
 * Exemples : "22670123456" (BF), "2250701234567" (CI), "22190123456" (SN).
 */

export const SILGAPP_COUNTRIES = [
  { code: "BF", dial: "226", len: 8, name: "Burkina Faso", flag: "" },
  { code: "TG", dial: "228", len: 8, name: "Togo", flag: "" },
  { code: "CI", dial: "225", len: 10, name: "Côte d'Ivoire", flag: "" },
  { code: "BJ", dial: "229", len: 8, name: "Bénin", flag: "" },
  { code: "SN", dial: "221", len: 9, name: "Sénégal", flag: "" },
  { code: "ML", dial: "223", len: 8, name: "Mali", flag: "" },
  { code: "GN", dial: "224", len: 9, name: "Guinée", flag: "" },
  { code: "NE", dial: "227", len: 8, name: "Niger", flag: "" },
  { code: "GH", dial: "233", len: 9, name: "Ghana", flag: "" },
];

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
