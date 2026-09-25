/**
 * enterpriseFinance.ts — Module partagé pour la comptabilité SILGAPP ENTREPRISE.
 *
 * RÈGLE ABSOLUE : Le dû entreprise envers SILGAPP est INDEPENDANT du montant_du_silga du livreur.
 * Une course entreprise ne doit JAMAIS augmenter le montant_du_silga de son livreur.
 *
 * Le taux est verrouillé par course au moment de l'acceptation.
 * La dette n'est créée qu'à la livraison (statut = livree).
 * L'idempotence est garantie par enterprise_encours_comptabilise_at sur la course.
 *
 * Ce module est utilisé par:
 * - finaliserLivraisonLivreur (hook après livraison)
 * - validateQRCode (hook après validation PIN/QR livraison)
 * - manageEnterprise (paiements, ajustements)
 * - getEnterpriseDashboard (calcul du solde)
 */

/**
 * Résout l'enterprise_id d'un utilisateur authentifié.
 * Un Admin Entreprise a user.data.enterprise_id != null.
 * Un Super Admin SILGAPP a enterprise_id = null.
 *
 * RÈGLE DE SÉCURITÉ : Le frontend ne peut JAMAIS fournir un enterprise_id.
 * Il est TOUJOURS résolu côté backend depuis l'utilisateur authentifié.
 */
export function resolveEnterpriseId(user: any): string | null {
  if (!user) return null;
  // enterprise_id est stocké sur le User entity
  return user.enterprise_id || null;
}

/**
 * Vérifie si un utilisateur est un Admin Entreprise.
 */
export function isEnterpriseAdmin(user: any): boolean {
  if (!user) return false;
  return user.silgapp_role === "admin_entreprise" && !!user.enterprise_id;
}

/**
 * Vérifie si un utilisateur est un Super Admin SILGAPP.
 */
export function isSuperAdmin(user: any): boolean {
  if (!user) return false;
  return user.role === "admin";
}

/**
 * Comptabilise une commission entreprise dans le EnterpriseLedger.
 * IDEMPOTENT : si enterprise_encours_comptabilise_at est déjà set, ne rien faire.
 *
 * @param base44 - client SDK (asServiceRole)
 * @param course - la course livrée (doit avoir enterprise_id, prix_final, enterprise_commission_rate_locked)
 * @returns { success, montant, skipped? }
 */
export async function comptabiliserCommissionEnterprise(base44: any, course: any) {
  // ── Garde : pas une course entreprise ──
  if (!course.enterprise_id) {
    return { success: false, skipped: "not_enterprise_course" };
  }

  // ── Idempotence : déjà comptabilisée ──
  if (course.enterprise_encours_comptabilise_at) {
    return {
      success: true,
      skipped: "already_comptabilised",
      montant: course.enterprise_encours_comptabilise_montant || 0,
    };
  }

  // ── Garde : pas encore livrée ──
  if (course.statut !== "livree") {
    return { success: false, skipped: "not_delivered" };
  }

  // ── Garde : pas de prix final ──
  const prixFinal = Number(course.prix_final);
  if (!Number.isFinite(prixFinal) || prixFinal <= 0) {
    return { success: false, skipped: "no_prix_final" };
  }

  // ── Charger l'enterprise pour le taux ──
  const enterprises = await base44.entities.Enterprise.filter({
    enterprise_financier_id: course.enterprise_id,
  });
  const enterprise = enterprises?.[0];
  if (!enterprise) {
    return { success: false, skipped: "enterprise_not_found" };
  }

  // ── Taux verrouillé sur la course, ou fallback sur le taux actuel de l'enterprise ──
  const taux = Number(course.enterprise_commission_rate_locked) >= 0
    ? Number(course.enterprise_commission_rate_locked)
    : Number(enterprise.commission_silgapp_pct);

  const montant = Math.round(prixFinal * (taux / 100));

  // ── Calculer l'ancien solde ──
  const ancienSolde = Number(enterprise.montant_du_silgapp) || 0;
  const nouveauSolde = ancienSolde + montant;

  // ── Créer l'écriture EnterpriseLedger (idempotente via request_id) ──
  const requestId = `ENT_COMMISSION_${course.id}`;
  const existingLedger = await base44.entities.EnterpriseLedger.filter({
    request_id: requestId,
  });
  if (existingLedger?.length > 0) {
    // Déjà comptabilisé via le ledger — marquer la course
    await base44.entities.CourseExterne.update(course.id, {
      enterprise_encours_comptabilise_at: existingLedger[0].created_date,
      enterprise_encours_comptabilise_montant: montant,
    });
    return { success: true, skipped: "ledger_exists", montant };
  }

  await base44.entities.EnterpriseLedger.create({
    enterprise_id: enterprise.id,
    enterprise_financier_id: enterprise.enterprise_financier_id,
    course_id: course.id,
    type: "commission_course",
    montant,
    taux,
    prix_final: prixFinal,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    request_id: requestId,
  });

  // ── Marquer la course comme comptabilisée ──
  const now = new Date().toISOString();
  await base44.entities.CourseExterne.update(course.id, {
    enterprise_encours_comptabilise_at: now,
    enterprise_encours_comptabilise_montant: montant,
    enterprise_commission_amount: montant,
  });

  // ── Mettre à jour les caches sur l'enterprise ──
  await base44.entities.Enterprise.update(enterprise.id, {
    volume_courses_total: Number(enterprise.volume_courses_total || 0) + prixFinal,
    total_commissions_silgapp: Number(enterprise.total_commissions_silgapp || 0) + montant,
    montant_du_silgapp: nouveauSolde,
  });

  return { success: true, montant, ancien_solde: ancienSolde, nouveau_solde: nouveauSolde };
}

/**
 * Enregistre un paiement d'une entreprise envers SILGAPP.
 * IDEMPOTENT via request_id.
 *
 * @param base44 - client SDK (asServiceRole)
 * @param enterpriseId - ID de l'enterprise
 * @param montant - montant payé
 * @param request_id - clé idempotente
 * @param moyen_paiement - especes, virement, mobile_money, autre
 * @param reference - référence libre
 * @param valide_par - email du Super Admin
 * @returns { success, montant, nouveau_solde }
 */
export async function enregistrerPaiementEnterprise(
  base44: any,
  enterpriseId: string,
  montant: number,
  request_id: string,
  moyen_paiement: string = "especes",
  reference?: string,
  valide_par?: string
) {
  // ── Idempotence ──
  const existing = await base44.entities.EnterpriseLedger.filter({ request_id });
  if (existing?.length > 0) {
    return { success: true, skipped: "already_paid", montant: existing[0].montant };
  }

  // ── Charger l'enterprise ──
  const enterprises = await base44.entities.Enterprise.filter({ enterprise_financier_id: enterpriseId });
  const enterprise = enterprises?.[0];
  if (!enterprise) return { success: false, error: "enterprise_not_found" };

  const ancienSolde = Number(enterprise.montant_du_silgapp) || 0;
  const nouveauSolde = Math.max(0, ancienSolde - montant);

  await base44.entities.EnterpriseLedger.create({
    enterprise_id: enterprise.id,
    enterprise_financier_id: enterprise.enterprise_financier_id,
    type: "paiement",
    montant,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    request_id,
    moyen_paiement,
    reference,
    valide_par,
  });

  // ── Mettre à jour les caches ──
  await base44.entities.Enterprise.update(enterprise.id, {
    total_paiements: Number(enterprise.total_paiements || 0) + montant,
    montant_du_silgapp: nouveauSolde,
  });

  return { success: true, montant, ancien_solde: ancienSolde, nouveau_solde: nouveauSolde };
}

/**
 * Modifie le taux de commission SILGAPP d'une entreprise.
 * Historise le changement dans le EnterpriseLedger.
 * AUCUN recalcul rétroactif des courses existantes.
 *
 * @param base44 - client SDK (asServiceRole)
 * @param enterpriseId - ID de l'enterprise
 * @param nouveauTaux - nouveau taux (ex: 7)
 * @param valide_par - email du Super Admin
 * @param motif - motif du changement
 * @returns { success, ancien_taux, nouveau_taux }
 */
export async function modifierTauxEnterprise(
  base44: any,
  enterpriseId: string,
  nouveauTaux: number,
  valide_par: string,
  motif?: string
) {
  const enterprises = await base44.entities.Enterprise.filter({ enterprise_financier_id: enterpriseId });
  const enterprise = enterprises?.[0];
  if (!enterprise) return { success: false, error: "enterprise_not_found" };

  const ancienTaux = Number(enterprise.commission_silgapp_pct) || 0;

  if (ancienTaux === nouveauTaux) {
    return { success: true, skipped: "same_rate", ancien_taux: ancienTaux, nouveau_taux: nouveauTaux };
  }

  // ── Mettre à jour le taux ──
  await base44.entities.Enterprise.update(enterprise.id, {
    commission_silgapp_pct: nouveauTaux,
  });

  // ── Historiser dans le ledger ──
  const requestId = `ENT_TAUX_${enterprise.id}_${Date.now()}`;
  await base44.entities.EnterpriseLedger.create({
    enterprise_id: enterprise.id,
    enterprise_financier_id: enterprise.enterprise_financier_id,
    type: "ajustement_admin",
    montant: 0,
    ancien_solde: Number(enterprise.montant_du_silgapp) || 0,
    nouveau_solde: Number(enterprise.montant_du_silgapp) || 0,
    request_id: requestId,
    motif: `Changement de taux: ${ancienTaux}% → ${nouveauTaux}%. ${motif || ""}`.trim(),
    taux_ancien: ancienTaux,
    taux_nouveau: nouveauTaux,
    valide_par,
  });

  return { success: true, ancien_taux: ancienTaux, nouveau_taux: nouveauTaux };
}

/**
 * Génère un identifiant financier IMMUABLE pour une enterprise.
 * Ne dépend pas du nom de l'entreprise.
 */
export function generateEnterpriseFinancierId(): string {
  return "ent_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Génère un slug unique à partir du nom.
 */
export function generateSlug(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}