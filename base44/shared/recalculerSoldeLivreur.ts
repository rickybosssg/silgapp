// ═══════════════════════════════════════════════════════════════════════════
// RECALCULER SOLDE LIVREUR — Source de vérité financière unique
// ═══════════════════════════════════════════════════════════════════════════
//
// FORMULE EXPLICITE (validée Phase 1) :
//
//   solde = SUM(commission_silga WHERE statut=livree)
//         - SUM(montant_paye FROM PaiementSilgapp WHERE statut=traite AND type_dette=commission_livreur)
//
//   borné à max(0, ...) — aucun solde négatif.
//
// Hiérarchie financière :
//
//   Sources financières (vérité) :
//     1. CourseExterne.commission_silga  (où statut=livree)  → dette brute
//     2. PaiementSilgapp                 (statut=traite)      → montant réglé
//
//   Projection matérialisée :
//     Livreur.montant_du_silga = dette brute - montant réglé
//
//   Alias legacy (synchronisé, non décisionnel) :
//     Livreur.encours = miroir de montant_du_silga (conservé pour anciens APK)
//
// ⚠️  statut_paiement_livreur (CourseExterne) = indication UX uniquement.
//     Ne JAMAIS l'utiliser pour le calcul du solde — un paiement partiel
//     ne marque aucune course comme payée, mais le journal PaiementSilgapp
//     retracent le montant exact réglé.
//
// Cette fonction est :
//   - Idempotente : peut être appelée N fois, le résultat est toujours le même
//   - Utilisable pour réconciliation
//   - Indépendante d'un ancien solde stocké (recalcule depuis les sources)
// ═══════════════════════════════════════════════════════════════════════════

import { chargerConfigPays } from './dispatchConstants.ts';
import { calculerSoldeLivreur } from './soldeCalculator.ts';

/**
 * Recalcule le solde dû d'un livreur depuis les sources financières.
 *
 * @returns { solde, seuil, bloque, statut_paiement, devise, totalCommissions, totalPaye }
 */
export async function recalculerSoldeLivreur(base44: any, livreurId: string): Promise<{
  solde: number;
  creditDisponible: number;
  creditSurplus: number;
  consumedCredit: number;
  seuil: number | null;
  bloque: boolean;
  statut_paiement: string;
  devise: string;
  totalCommissions: number;
  totalPaye: number;
}> {
  if (!livreurId) {
    return { solde: 0, creditDisponible: 0, creditSurplus: 0, consumedCredit: 0, seuil: null, bloque: false, statut_paiement: 'paye', devise: 'FCFA', totalCommissions: 0, totalPaye: 0 };
  }

  // 1. Récupérer le livreur
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  if (!livreur) {
    return { solde: 0, creditDisponible: 0, creditSurplus: 0, seuil: null, bloque: false, statut_paiement: 'paye', devise: 'FCFA', totalCommissions: 0, totalPaye: 0 };
  }

  // 2-6. Calcul via le module shared (SOURCE DE VÉRITÉ unique)
  //    soldeCalculator.ts contient la formule canonique utilisée partout
  //    (recalculerSoldeLivreur + getSoldeLivreur + UI).
  const { solde, creditDisponible, creditSurplus, consumedCredit, totalCommissions, totalPaye } = await calculerSoldeLivreur(base44, livreurId);

  // 7. Récupérer le seuil du pays
  const countryConfig = await chargerConfigPays(base44, livreur.country_code);
  const seuil = countryConfig?.seuil_encours_max ?? null;
  const devise = countryConfig?.devise || 'FCFA';

  if (seuil === null || seuil <= 0) {
    console.warn(`[SOLDE] ⚠️ Seuil non configuré pour pays ${livreur.country_code} — livreur ${livreurId}`);
    await base44.asServiceRole.entities.Livreur.update(livreurId, {
      montant_du_silga: solde,
      encours: solde,
      statut_paiement: solde > 0 ? 'non_paye' : 'paye',
    });
    return { solde, creditDisponible, creditSurplus, consumedCredit, seuil: null, bloque: false, statut_paiement: solde > 0 ? 'non_paye' : 'paye', devise, totalCommissions, totalPaye };
  }

  // 8. Déterminer le statut dérivé (solde > 0 → dette, solde = 0 → réglé)
  const statutPaiement = solde > 0 ? 'non_paye' : 'paye';
  const bloque = solde >= seuil;
  const now = new Date().toISOString();

  // 9. Construire l'update — SANS credit_surplus (cap en lecture seule, jamais muté ici)
  const updateData: any = {
    montant_du_silga: solde,
    encours: solde, // alias legacy synchronisé
    statut_paiement: statutPaiement,
    bloque_encours: bloque,
  };

  if (bloque) {
    updateData.encours_bloque_at = livreur.encours_bloque_at || now;
    updateData.admin_hors_ligne = true;
    updateData.statut = 'hors_ligne';
    updateData.admin_statut_log = `Blocage recalculé — plafond d'encours atteint (${solde}/${seuil} ${devise})`;
  } else {
    updateData.encours_bloque_at = null;
    if (livreur.bloque_encours) {
      updateData.admin_hors_ligne = false;
      updateData.admin_statut_log = 'Déblocage — encours recalculé sous le seuil';
    }
  }

  await base44.asServiceRole.entities.Livreur.update(livreurId, updateData);

  // ⚠️ NE JAMAIS marquer automatiquement les courses comme "paye" ici.
  // statut_paiement_livreur = indication UX qui doit refléter un paiement
  // EXPLICITE sur cette course précise (via paiementLivreur / traiterPaiementSilgapp).
  // Marquer au solde global provoque des faux "paye" quand un livreur a un
  // ancien paiement couvrant d'anciennes commissions mais n'a pas encore réglé
  // la commission d'une nouvelle course livrée aujourd'hui.

  console.log(`[SOLDE] Livreur ${livreurId}: solde=${solde} ${devise} (commissions=${totalCommissions}, payé=${totalPaye}, seuil=${seuil}, bloque=${bloque})`);

  return { solde, creditDisponible, creditSurplus, consumedCredit, seuil, bloque, statut_paiement: statutPaiement, devise, totalCommissions, totalPaye };
}