// Pure express-order rules: no SDK, network, geocoding or transcription calls.
export const TRANSCRIPTION_UNAVAILABLE = "La transcription vocale n'est pas encore activée. Vous pouvez saisir les trois informations ci-dessous.";

const normalize = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const units = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix sept", "dix huit", "dix neuf"];
const priceWords = new Map();
const wordKey = value => normalize(value).replace(/[-‐‑–]/g, " ").replace(/\bcents\b/g, "cent").replace(/\bvingts\b/g, "vingt").replace(/\s+/g, " ").trim();
function belowHundred(n) {
  if (n < 20) return units[n];
  if (n >= 80) return `quatre vingt${n === 80 ? "" : ` ${belowHundred(n - 80)}`}`;
  if (n >= 70) return n === 71 ? "soixante et onze" : `soixante ${belowHundred(n - 60)}`;
  const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][Math.floor(n / 10)];
  return tens + (n % 10 === 1 ? " et un" : n % 10 ? ` ${units[n % 10]}` : "");
}
for (let n = 0; n < 1000; n++) {
  const hundreds = Math.floor(n / 100);
  const words = hundreds ? `${hundreds === 1 ? "" : `${units[hundreds]} `}cent${n % 100 ? ` ${belowHundred(n % 100)}` : ""}` : belowHundred(n);
  priceWords.set(wordKey(words), n);
}

export function parseExpressPrice(input) {
  if (/^\s*[-−]/u.test(String(input || ''))) throw new Error("Saisissez un prix entier positif.");
  const text = wordKey(input).replace(/\s*(?:fcfa|f\s*cfa|francs?(?:\s+cfa)?|f)\s*[.!]?$/u, "").replace(/[.!]$/, "").trim();
  let price;
  if (/^(?:\d+|\d{1,3}(?:[\s\u00a0\u202f]\d{3})+)$/u.test(text)) price = Number(text.replace(/\s/g, ""));
  else {
    const parts = text.split(/\bmille\b/);
    if (parts.length === 1) price = priceWords.get(text);
    else if (parts.length === 2) {
      const thousands = parts[0].trim() ? priceWords.get(parts[0].trim()) : 1;
      const remainder = parts[1].trim() ? priceWords.get(parts[1].trim()) : 0;
      if (thousands > 0 && remainder !== undefined) price = thousands * 1000 + remainder;
    }
  }
  if (!Number.isSafeInteger(price) || price <= 0) throw new Error("Prix incertain : précisez un montant entier positif.");
  return String(price);
}

export function parseExpressTranscript(text) {
  const source = String(text || "").trim();
  if (/\b(non|plut[oô]t|environ|peut[- ]être|ou)\b/iu.test(source)) throw new Error("Commande incertaine ou corrigée : précisez les trois informations.");
  const match = source.match(/^de\s+(.+?)\s+[àa]\s+(.+?)\s+pour\s+(.+)$/iu);
  if (!match) throw new Error("Précisez : de [quartier] à [quartier] pour [prix] F.");
  return { depart: match[1].trim(), arrivee: match[2].trim(), prix: parseExpressPrice(match[3]) };
}

export function resolveExpressQuartier(input, quartiers, countryCode) {
  const name = normalize(input);
  const matches = quartiers.filter(q => name && q.actif === true && q.country_code === countryCode &&
    [q.nom, `${q.nom} (${q.ville})`, ...(q.variantes || "").split(",")].some(v => normalize(v) === name));
  if (matches.length !== 1) throw new Error(matches.length ? `Quartier ambigu : précisez le nom et la ville pour « ${input} ».` : `Quartier inconnu : précisez « ${input} » avec un quartier proposé.`);
  const q = matches[0];
  if (typeof q.latitude !== "number" || typeof q.longitude !== "number" || !Number.isFinite(q.latitude) || !Number.isFinite(q.longitude) || Math.abs(q.latitude) > 90 || Math.abs(q.longitude) > 180 || (q.latitude === 0 && q.longitude === 0)) {
    throw new Error(`Position approximative indisponible pour « ${input} ». Précisez un quartier connu.`);
  }
  return q;
}

export function buildExpressCourse({ user, client, depart, arrivee, prix }) {
  if (!user?.email || client?.user_email !== user.email) throw new Error("Session client requise.");
  if (client.bloque_frais_annulation) throw new Error("Veuillez régulariser vos frais d'annulation.");
  const country = client.country_code;
  if (!country || depart?.country_code !== country || arrivee?.country_code !== country) throw new Error("Pays des quartiers incompatible avec votre profil.");
  // Revalidate catalog entries, including coordinates; never accept coordinates from a transcript.
  for (const q of [depart, arrivee]) resolveExpressQuartier(q.nom, [q], country);
  const price = Number(prix);
  if (!Number.isSafeInteger(price) || price <= 0) throw new Error("Saisissez un prix entier positif.");
  const nom = [client.prenom, client.nom].filter(Boolean).join(" ");
  return {
    commande_vocale_express: true, source: "client", type_course: "expedier", type_colis: "petit_colis",
    country_code: country, client_nom: nom, client_telephone: client.telephone || "",
    contact_createur_course: client.telephone || "", expediteur_nom: nom,
    // Contact initial only: neither the creator nor a missing recipient is a live GPS target.
    destinataire_nom: "", destinataire_telephone: "", destinataire_client_id: null,
    adresse_depart: `${depart.nom} (${depart.ville}) — position approximative du quartier`,
    adresse_arrivee: `${arrivee.nom} (${arrivee.ville}) — position approximative du quartier`,
    quartier_depart: depart.nom, quartier_arrivee: arrivee.nom,
    ville_depart: depart.ville_operationnelle || depart.ville, ville_arrivee: arrivee.ville_operationnelle || arrivee.ville,
    gps_depart_lat: depart.latitude, gps_depart_lng: depart.longitude, gps_depart_source: "quartier",
    gps_arrivee_lat: arrivee.latitude, gps_arrivee_lng: arrivee.longitude, gps_arrivee_source: "quartier",
    prix_propose_client: price, pricing_mode: "manual", delivery_mode: "standard",
    destination_inconnue: false,
  };
}

// One synchronous lock before the first await; retain the ID after uncertain network errors.
export function createExpressSubmission(invoke, makeId = () => crypto.randomUUID()) {
  let pending = false;
  let completed = false;
  const requestId = makeId();
  return async (draft) => {
    if (pending || completed) return null;
    pending = true;
    try {
      const result = await invoke("creerCourseClient", { request_id: requestId, express_draft: draft });
      const course = result?.data?.course || result?.course;
      if (!course?.id) throw new Error("Création non confirmée. Réessayez sans changer la commande.");
      completed = true;
      return course;
    } finally { pending = false; }
  };
}