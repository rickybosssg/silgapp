import { base44 } from "@/api/base44Client";
import { getCountryConfig, normalizePhone as normalizePhoneShared } from "@/lib/phoneUtils";

const COUNTRY_DIAL_CODE = {
  BF: "226", CI: "225", TG: "228", BJ: "229", SN: "221",
  ML: "223", GN: "224", NE: "227", GH: "233",
};

export function normalizePhone(phone, countryCode = "") {
  let digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";

  // Utiliser en priorité la configuration Country dynamique partagée par
  // l'inscription et les formulaires. Le tableau local reste un fallback
  // rétrocompatible pendant le chargement de la configuration distante.
  if (getCountryConfig(countryCode)) {
    return normalizePhoneShared(phone, countryCode) || digits;
  }

  const dial = COUNTRY_DIAL_CODE[countryCode] || "";
  if (dial && digits.startsWith(dial) && digits.length >= dial.length + 6) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (dial && digits.length <= 9) return dial + digits;
  return digits;
}

/**
 * Recherche un client par téléphone normalisé.
 * Utilise le champ telephone_normalized pour éviter les doublons.
 */
export async function findClientByPhone(phone, countryCode) {
  const normalized = normalizePhone(phone, countryCode);
  if (!normalized || normalized.length < 8) return null;
  try {
    const results = await base44.entities.ClientExterne.filter({ telephone_normalized: normalized });
    return results && results.length > 0 ? results[0] : null;
  } catch {
    // Fallback: recherche par telephone brut (anciennes fiches non migrées)
    try {
      const results2 = await base44.entities.ClientExterne.filter({ telephone: normalized });
      return results2 && results2.length > 0 ? results2[0] : null;
    } catch {
      return null;
    }
  }
}

/**
 * Crée ou met à jour les fiches CRM pour les 3 contacts d'une course admin.
 * - client / créateur
 * - expéditeur (si différent du client)
 * - destinataire (si différent du client et de l'expéditeur)
 *
 * IMPORTANT : N'incrémente PAS les statistiques (nb_courses, montant).
 * Les stats sont mises à jour uniquement quand la course passe à "livree"
 * via la fonction backend syncCrmOnLivraison (automatisation entity).
 */
export async function upsertClientsFromCourseContacts(courseData, countryCode) {
  const results = [];

  // Contact 1 : client / créateur
  const clientPhone = courseData.client_telephone || courseData.contact_createur_course;
  if (clientPhone) {
    try {
      const r = await upsertClientContact(clientPhone, countryCode, courseData.client_nom, "client", courseData);
      if (r) results.push(r);
    } catch (e) {
      console.warn("[CRM] upsert client failed:", e?.message);
    }
  }

  // Contact 2 : expéditeur (si différent du client)
  const expedPhone = courseData.expediteur_telephone;
  const clientNorm = normalizePhone(clientPhone, countryCode);
  if (expedPhone && normalizePhone(expedPhone, countryCode) !== clientNorm) {
    try {
      const r = await upsertClientContact(expedPhone, countryCode, courseData.expediteur_nom, "expediteur", courseData);
      if (r) results.push(r);
    } catch (e) {
      console.warn("[CRM] upsert expediteur failed:", e?.message);
    }
  }

  // Contact 3 : destinataire (si différent du client et de l'expéditeur)
  const destinPhone = courseData.destinataire_telephone;
  const expedNorm = normalizePhone(expedPhone, countryCode);
  if (destinPhone && normalizePhone(destinPhone, countryCode) !== clientNorm && normalizePhone(destinPhone, countryCode) !== expedNorm) {
    try {
      const r = await upsertClientContact(destinPhone, countryCode, courseData.destinataire_nom, "destinataire", courseData);
      if (r) results.push(r);
    } catch (e) {
      console.warn("[CRM] upsert destinataire failed:", e?.message);
    }
  }

  return results;
}

/**
 * Crée ou met à jour une fiche client SANS statistiques.
 */
async function upsertClientContact(phone, countryCode, name, role, courseData) {
  if (!countryCode) {
    console.error("[crmUtils] upsertClientContact: countryCode manquant (COUNTRY_REQUIRED). Aucune fiche client créée.");
    return null;
  }
  const normalized = normalizePhone(phone, countryCode);
  if (!normalized || normalized.length < 8) return null;

  let existing = null;
  try {
    const results = await base44.entities.ClientExterne.filter({ telephone_normalized: normalized });
    existing = results && results.length > 0 ? results[0] : null;
  } catch {
    try {
      const results2 = await base44.entities.ClientExterne.filter({ telephone: normalized });
      existing = results2 && results2.length > 0 ? results2[0] : null;
    } catch {}
  }

  const roles = new Set(existing?.roles ? JSON.parse(existing.roles) : []);
  if (role) roles.add(role);

  const clientName = (name || "").trim();
  const [prenom, ...nomParts] = clientName.split(" ");
  const nom = nomParts.join(" ") || clientName || "Client";

  // Un nom existant est considéré comme placeholder s'il est vide ou "Client".
  // Dans ce cas, on autorise la mise à jour avec le vrai nom saisi par l'admin.
  // Si le nom existant est un vrai nom (non placeholder), on le conserve (mise à jour prudente).
  const isPlaceholder = (n) => {
    if (!n) return true;
    const t = n.trim().toLowerCase();
    return t === "" || t === "client" || t === "—";
  };

  const isNew = !existing;
  const updateData = {
    telephone: normalized,
    telephone_normalized: normalized,
    nom: !isPlaceholder(existing?.nom) ? existing.nom : nom,
    prenom: existing?.prenom || prenom || "",
    country_code: countryCode,
    roles: JSON.stringify([...roles]),
    est_expediteur: roles.has("expediteur"),
    est_destinataire: roles.has("destinataire"),
    cree_via_crm: isNew ? true : (existing?.cree_via_crm || false),
    ville: courseData?.ville_depart || existing?.ville || null,
    quartier: courseData?.quartier_depart || existing?.quartier || null,
    type_colis_frequent: courseData?.type_colis || existing?.type_colis_frequent || null,
  };

  if (isNew) {
    updateData.statut_crm = "nouveau";
    updateData.nb_courses_total = 0;
    updateData.nb_courses_admin = 0;
    updateData.montant_total_depense = 0;
    return await base44.entities.ClientExterne.create(updateData);
  } else {
    if (existing.statut_crm === "nouveau" && role) {
      updateData.statut_crm = "actif";
    }
    return await base44.entities.ClientExterne.update(existing.id, updateData);
  }
}
