import { base44 } from "@/api/base44Client";

const COUNTRY_DIAL_CODE = {
  BF: "226", CI: "225", TG: "228", BJ: "229", SN: "221",
  ML: "223", GN: "224", NE: "227", GH: "233",
};

export function normalizePhone(phone, countryCode = "BF") {
  let digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const dial = COUNTRY_DIAL_CODE[countryCode] || "226";
  if (digits.startsWith(dial) && digits.length >= dial.length + 6) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length <= 9) return dial + digits;
  return digits;
}

/**
 * Recherche un client par téléphone normalisé.
 */
export async function findClientByPhone(phone, countryCode) {
  const normalized = normalizePhone(phone, countryCode);
  if (!normalized || normalized.length < 8) return null;
  try {
    const results = await base44.entities.ClientExterne.filter({ telephone: normalized });
    return results && results.length > 0 ? results[0] : null;
  } catch {
    return null;
  }
}

/**
 * Crée ou met à jour la fiche client après une course administrative.
 * - Si le client existe, enrichit ses stats CRM.
 * - Sinon, crée une nouvelle fiche automatiquement.
 */
export async function upsertClientFromCourse(courseData, countryCode) {
  const phone = courseData.client_telephone || courseData.contact_createur_course;
  if (!phone || phone.replace(/\D/g, "").length < 8) return null;

  const normalized = normalizePhone(phone, countryCode);
  const clientName = (courseData.client_nom || "").trim();
  const [prenom, ...nomParts] = clientName.split(" ");
  const nom = nomParts.join(" ") || clientName || "Client";

  let existing = null;
  try {
    const results = await base44.entities.ClientExterne.filter({ telephone: normalized });
    existing = results && results.length > 0 ? results[0] : null;
  } catch {}

  const roles = new Set(existing?.roles ? JSON.parse(existing.roles) : []);
  if (courseData.type_course === "expedier") {
    roles.add("client");
    roles.add("expediteur");
  } else if (courseData.type_course === "recevoir") {
    roles.add("client");
    roles.add("destinataire");
  } else {
    roles.add("client");
  }

  // Quartiers les plus utilisés
  let quartiers = [];
  try {
    quartiers = existing?.quartiers_utilises ? JSON.parse(existing.quartiers_utilises) : [];
  } catch {}
  if (courseData.quartier_depart) {
    const found = quartiers.find(q => q.quartier === courseData.quartier_depart);
    if (found) found.count++;
    else quartiers.push({ quartier: courseData.quartier_depart, count: 1 });
  }
  if (courseData.quartier_arrivee) {
    const found = quartiers.find(q => q.quartier === courseData.quartier_arrivee);
    if (found) found.count++;
    else quartiers.push({ quartier: courseData.quartier_arrivee, count: 1 });
  }
  quartiers.sort((a, b) => b.count - a.count);
  quartiers = quartiers.slice(0, 10);

  const montant = courseData.prix_final || courseData.prix_estimate || 0;
  const isNew = !existing;

  const updateData = {
    telephone: normalized,
    nom: existing?.nom || nom,
    prenom: existing?.prenom || prenom || "",
    country_code: countryCode,
    nb_courses_total: (existing?.nb_courses_total || 0) + 1,
    nb_courses_admin: (existing?.nb_courses_admin || 0) + 1,
    montant_total_depense: (existing?.montant_total_depense || 0) + montant,
    derniere_course_date: new Date().toISOString(),
    dernier_quartier_depart: courseData.quartier_depart || existing?.dernier_quartier_depart || null,
    dernier_quartier_arrivee: courseData.quartier_arrivee || existing?.dernier_quartier_arrivee || null,
    quartiers_utilises: JSON.stringify(quartiers),
    type_colis_frequent: courseData.type_colis || existing?.type_colis_frequent || null,
    roles: JSON.stringify([...roles]),
    est_expediteur: roles.has("expediteur"),
    est_destinataire: roles.has("destinataire"),
    statut_crm: isNew ? "nouveau" : (existing?.statut_crm === "nouveau" ? "actif" : existing?.statut_crm),
    cree_via_crm: isNew ? true : (existing?.cree_via_crm || false),
    ville: courseData.ville_depart || existing?.ville || null,
    quartier: courseData.quartier_depart || existing?.quartier || null,
  };

  if (existing) {
    // Statut VIP automatique si >= 10 courses ou >= 50 000 FCFA
    const totalCourses = (existing.nb_courses_total || 0) + 1;
    const totalMontant = (existing.montant_total_depense || 0) + montant;
    if (totalCourses >= 10 || totalMontant >= 50000) {
      updateData.statut_crm = "vip";
    }
    return await base44.entities.ClientExterne.update(existing.id, updateData);
  } else {
    return await base44.entities.ClientExterne.create(updateData);
  }
}