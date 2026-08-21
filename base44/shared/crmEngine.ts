// ── Moteur CRM partagé — utilisé par les fonctions backend ──
// Toute la logique de normalisation, upsert (sans stats), recalcul stats, merge

import { chargerConfigPays } from './dispatchConstants.ts';

// ⚠️ LEGACY CACHE — Source de vérité = Country.indicatif (via chargerConfigPays).
//    Cette map statique est un CACHE uniquement, populé dynamiquement par
//    preloadDialCodes(). NE JAMAIS ajouter de pays manuellement ici.
//    Fallback hardcodé uniquement si la BDD est indisponible.
const COUNTRY_DIAL_CODE: Record<string, string> = {
  BF: "226", CI: "225", TG: "228", BJ: "229", SN: "221",
  ML: "223", GN: "224", NE: "227", GH: "233",
};

/**
 * Précharge les indicatifs téléphoniques depuis Country.indicatif.
 * À appeler au début des fonctions qui utilisent normalizePhone.
 * Source de vérité = Country.indicatif. Le cache n'est jamais la source.
 */
export async function preloadDialCodes(base44: any, countryCode?: string) {
  try {
    if (countryCode) {
      const country = await chargerConfigPays(base44, countryCode);
      if (country?.indicatif) {
        COUNTRY_DIAL_CODE[countryCode] = String(country.indicatif).replace(/^\+/, '');
      }
    } else {
      const countries = await base44.asServiceRole.entities.Country.filter({ actif: true });
      for (const c of (countries || [])) {
        if (c.code && c.indicatif) {
          COUNTRY_DIAL_CODE[c.code] = String(c.indicatif).replace(/^\+/, '');
        }
      }
    }
  } catch {
    // BDD indisponible — fallback sur le cache statique
  }
}

export function normalizePhone(phone: string, countryCode: string = "BF"): string {
  let digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const dial = COUNTRY_DIAL_CODE[countryCode] || "226";
  if (digits.startsWith(dial) && digits.length >= dial.length + 6) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length <= 9) return dial + digits;
  return digits;
}

export const DEFAULT_VIP_THRESHOLDS = {
  vip_min_courses: 10,
  vip_min_montant: 50000,
  inactif_jours: 90,
};

export async function getVipThresholds(base44: any) {
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({
      cle: { $in: ["crm_vip_min_courses", "crm_vip_min_montant", "crm_inactif_jours"] },
    });
    const map: Record<string, string> = {};
    for (const c of configs || []) map[c.cle] = c.valeur;
    return {
      vip_min_courses: parseInt(map.crm_vip_min_courses) || DEFAULT_VIP_THRESHOLDS.vip_min_courses,
      vip_min_montant: parseInt(map.crm_vip_min_montant) || DEFAULT_VIP_THRESHOLDS.vip_min_montant,
      inactif_jours: parseInt(map.crm_inactif_jours) || DEFAULT_VIP_THRESHOLDS.inactif_jours,
    };
  } catch {
    return DEFAULT_VIP_THRESHOLDS;
  }
}

export function computeStatutCrm(
  nbCourses: number,
  montant: number,
  lastCourseDate: string | null,
  thresholds: typeof DEFAULT_VIP_THRESHOLDS
): string {
  if (nbCourses >= thresholds.vip_min_courses || montant >= thresholds.vip_min_montant) return "vip";
  if (lastCourseDate) {
    const daysSince = (Date.now() - new Date(lastCourseDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > thresholds.inactif_jours) return "inactif";
  }
  if (nbCourses > 0) return "actif";
  return "nouveau";
}

export async function findClientByNormalizedPhone(base44: any, telephone_normalized: string) {
  if (!telephone_normalized || telephone_normalized.length < 8) return null;
  try {
    const results = await base44.asServiceRole.entities.ClientExterne.filter({
      telephone_normalized,
    });
    return results && results.length > 0 ? results[0] : null;
  } catch {
    return null;
  }
}

// ── Upsert SANS statistiques ──
// Crée ou met à jour la fiche contact (nom, téléphone, rôles, quartiers)
// N'incrémente JAMAIS nb_courses_total / nb_courses_admin / montant_total_depense
export async function upsertClientContact(
  base44: any,
  phone: string,
  countryCode: string,
  name: string | null,
  role: string,
  courseData: any
) {
  const normalized = normalizePhone(phone, countryCode);
  if (!normalized || normalized.length < 8) return null;

  const existing = await findClientByNormalizedPhone(base44, normalized);

  const roles = new Set<string>(existing?.roles ? JSON.parse(existing.roles) : []);
  if (role) roles.add(role);

  const clientName = (name || "").trim();
  const [prenom, ...nomParts] = clientName.split(" ");
  const nom = nomParts.join(" ") || clientName || "Client";

  const isNew = !existing;
  const updateData: any = {
    telephone: normalized,
    telephone_normalized: normalized,
    nom: existing?.nom || nom,
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

  // Statut : nouveau → actif dès qu'on a un rôle, sinon on garde l'existant
  if (isNew) {
    updateData.statut_crm = "nouveau";
    updateData.nb_courses_total = 0;
    updateData.nb_courses_admin = 0;
    updateData.montant_total_depense = 0;
    return await base44.asServiceRole.entities.ClientExterne.create(updateData);
  } else {
    if (existing.statut_crm === "nouveau" && role) {
      updateData.statut_crm = "actif";
    }
    return await base44.asServiceRole.entities.ClientExterne.update(existing.id, updateData);
  }
}

// ── Gère les 3 contacts d'une course admin (créateur, expéditeur, destinataire) ──
export async function upsertClientsFromCourseContacts(
  base44: any,
  courseData: any,
  countryCode: string
) {
  const results: any[] = [];

  // Contact 1 : client / créateur
  const clientPhone = courseData.client_telephone || courseData.contact_createur_course;
  if (clientPhone) {
    try {
      const r = await upsertClientContact(
        base44, clientPhone, countryCode, courseData.client_nom, "client", courseData
      );
      if (r) results.push(r);
    } catch (e) {
      console.warn("[CRM] upsert client failed:", (e as any)?.message);
    }
  }

  // Contact 2 : expéditeur (si différent du client)
  const expedPhone = courseData.expediteur_telephone;
  const clientNorm = normalizePhone(clientPhone, countryCode);
  if (expedPhone && normalizePhone(expedPhone, countryCode) !== clientNorm) {
    try {
      const r = await upsertClientContact(
        base44, expedPhone, countryCode, courseData.expediteur_nom, "expediteur", courseData
      );
      if (r) results.push(r);
    } catch (e) {
      console.warn("[CRM] upsert expediteur failed:", (e as any)?.message);
    }
  }

  // Contact 3 : destinataire (si différent du client et de l'expéditeur)
  const destinPhone = courseData.destinataire_telephone;
  const expedNorm = normalizePhone(expedPhone, countryCode);
  if (destinPhone && normalizePhone(destinPhone, countryCode) !== clientNorm && normalizePhone(destinPhone, countryCode) !== expedNorm) {
    try {
      const r = await upsertClientContact(
        base44, destinPhone, countryCode, courseData.destinataire_nom, "destinataire", courseData
      );
      if (r) results.push(r);
    } catch (e) {
      console.warn("[CRM] upsert destinataire failed:", (e as any)?.message);
    }
  }

  return results;
}

// ── Recalcule les statistiques d'un client à partir des courses LIVRÉES ──
// Idempotent : peut être appelé N fois, le résultat est toujours le même
export async function recalculateClientStats(base44: any, telephone_normalized: string) {
  if (!telephone_normalized || telephone_normalized.length < 8) return null;

  const client = await findClientByNormalizedPhone(base44, telephone_normalized);
  if (!client) return null;

  // Récupère toutes les courses livrées où ce numéro apparaît
  const courses: any[] = [];
  const seenIds = new Set<string>();

  // Recherche par client_phone_normalized
  try {
    const r1 = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: "livree", client_phone_normalized: telephone_normalized },
      "-created_date", 500
    );
    for (const c of r1 || []) {
      if (!seenIds.has(c.id)) { seenIds.add(c.id); courses.push(c); }
    }
  } catch {}

  // Recherche par expediteur_phone_normalized
  try {
    const r2 = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: "livree", expediteur_phone_normalized: telephone_normalized },
      "-created_date", 500
    );
    for (const c of r2 || []) {
      if (!seenIds.has(c.id)) { seenIds.add(c.id); courses.push(c); }
    }
  } catch {}

  // Recherche par destinataire_phone_normalized
  try {
    const r3 = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: "livree", destinataire_phone_normalized: telephone_normalized },
      "-created_date", 500
    );
    for (const c of r3 || []) {
      if (!seenIds.has(c.id)) { seenIds.add(c.id); courses.push(c); }
    }
  } catch {}

  const nbCourses = courses.length;
  const nbAdminCourses = courses.filter((c) => c.source === "admin").length;
  const montant = courses.reduce(
    (sum, c) => sum + (c.prix_final || c.prix_estimate || 0), 0
  );

  const lastCourse = courses.length > 0
    ? courses.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())[0]
    : null;

  // Quartiers (courses livrées uniquement)
  const quartierCount: Record<string, number> = {};
  for (const c of courses) {
    if (c.quartier_depart) quartierCount[c.quartier_depart] = (quartierCount[c.quartier_depart] || 0) + 1;
    if (c.quartier_arrivee) quartierCount[c.quartier_arrivee] = (quartierCount[c.quartier_arrivee] || 0) + 1;
  }
  const quartiers = Object.entries(quartierCount)
    .map(([quartier, count]) => ({ quartier, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const thresholds = await getVipThresholds(base44);
  const statut = computeStatutCrm(
    nbCourses,
    montant,
    lastCourse?.created_date || client.derniere_course_date,
    thresholds
  );

  return await base44.asServiceRole.entities.ClientExterne.update(client.id, {
    nb_courses_total: nbCourses,
    nb_courses_admin: nbAdminCourses,
    montant_total_depense: montant,
    derniere_course_date: lastCourse?.created_date || client.derniere_course_date,
    dernier_quartier_depart: lastCourse?.quartier_depart || client.dernier_quartier_depart,
    dernier_quartier_arrivee: lastCourse?.quartier_arrivee || client.dernier_quartier_arrivee,
    quartiers_utilises: JSON.stringify(quartiers),
    statut_crm: statut,
  });
}

// ── Recalcule les stats pour les 3 contacts d'une course ──
export async function recalculateStatsForCourseContacts(base44: any, courseData: any, countryCode: string) {
  const phones = new Set<string>();
  const clientNorm = normalizePhone(courseData.client_telephone || courseData.contact_createur_course, countryCode);
  const expedNorm = normalizePhone(courseData.expediteur_telephone, countryCode);
  const destinNorm = normalizePhone(courseData.destinataire_telephone, countryCode);
  if (clientNorm) phones.add(clientNorm);
  if (expedNorm) phones.add(expedNorm);
  if (destinNorm) phones.add(destinNorm);

  const results = [];
  for (const phone of phones) {
    try {
      const r = await recalculateClientStats(base44, phone);
      if (r) results.push(r);
    } catch (e) {
      console.warn("[CRM] recalculate failed for", phone, (e as any)?.message);
    }
  }
  return results;
}

// ── Fusion de deux fiches client (doublons) ──
export async function mergeClients(base44: any, sourceId: string, targetId: string) {
  if (sourceId === targetId) return { error: "Même client" };

  const source = await base44.asServiceRole.entities.ClientExterne.get(sourceId);
  const target = await base44.asServiceRole.entities.ClientExterne.get(targetId);
  if (!source || !target) return { error: "Client introuvable" };

  // Fusion des rôles
  const sourceRoles = source.roles ? JSON.parse(source.roles) : [];
  const targetRoles = target.roles ? JSON.parse(target.roles) : [];
  const mergedRoles = [...new Set([...sourceRoles, ...targetRoles])];

  // Fusion des quartiers
  const sourceQuartiers = source.quartiers_utilises ? JSON.parse(source.quartiers_utilises) : [];
  const targetQuartiers = target.quartiers_utilises ? JSON.parse(target.quartiers_utilises) : [];
  const quartierMap: Record<string, number> = {};
  for (const q of [...sourceQuartiers, ...targetQuartiers]) {
    quartierMap[q.quartier] = (quartierMap[q.quartier] || 0) + q.count;
  }
  const mergedQuartiers = Object.entries(quartierMap)
    .map(([quartier, count]) => ({ quartier, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Fusion des stats
  const mergedStats = {
    nb_courses_total: (source.nb_courses_total || 0) + (target.nb_courses_total || 0),
    nb_courses_admin: (source.nb_courses_admin || 0) + (target.nb_courses_admin || 0),
    montant_total_depense: (source.montant_total_depense || 0) + (target.montant_total_depense || 0),
  };

  const lastDate = [source.derniere_course_date, target.derniere_course_date]
    .filter(Boolean)
    .sort()
    .pop();

  const notes = [target.notes_admin, source.notes_admin].filter(Boolean).join(" | ");

  await base44.asServiceRole.entities.ClientExterne.update(targetId, {
    nom: target.nom || source.nom,
    prenom: target.prenom || source.prenom,
    roles: JSON.stringify(mergedRoles),
    est_expediteur: mergedRoles.includes("expediteur"),
    est_destinataire: mergedRoles.includes("destinataire"),
    quartiers_utilises: JSON.stringify(mergedQuartiers),
    ...mergedStats,
    derniere_course_date: lastDate || null,
    notes_admin: notes || null,
  });

  await base44.asServiceRole.entities.ClientExterne.delete(sourceId);

  return { merged: true, targetId, deletedSourceId: sourceId };
}