// ═══════════════════════════════════════════════════════════════════════════
// RECALCULER SOLDE LIVREUR — Source de vérité financière unique
// ═══════════════════════════════════════════════════════════════════════════
//
// Hiérarchie financière (validée Phase 1) :
//
//   Sources financières (vérité) :
//     1. CourseExterne.commission_silga  (où statut=livree ET statut_paiement_livreur=non_paye)
//     2. PaiementSilgapp                 (journal transactionnel immuable)
//
//   Projection matérialisée :
//     Livreur.montant_du_silga = somme des commissions non payées
//
//   Alias legacy (synchronisé, non décisionnel) :
//     Livreur.encours = miroir de montant_du_silga (conservé pour anciens APK)
//
// Cette fonction est :
//   - Idempotente : peut être appelée N fois, le résultat est toujours le même
//   - Utilisable pour réconciliation
//   - Indépendante d'un ancien solde stocké (recalcule depuis les sources)
// ═══════════════════════════════════════════════════════════════════════════

import { chargerConfigPays } from './dispatchConstants.ts';

/**
 * Recalcule le solde dû d'un livreur depuis les sources financières.
 *
 * @returns { solde, seuil, bloque, statut_paiement, devise }
 */
export async function recalculerSoldeLivreur(base44: any, livreurId: string): Promise<{
  solde: number;
  seuil: number | null;
  bloque: boolean;
  statut_paiement: string;
  devise: string;
}> {
  if (!livreurId) {
    return { solde: 0, seuil: null, bloque: false, statut_paiement: 'paye', devise: 'FCFA' };
  }

  // 1. Récupérer le livreur
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  if (!livreur) {
    return { solde: 0, seuil: null, bloque: false, statut_paiement: 'paye', devise: 'FCFA' };
  }

  // 2. Récupérer toutes les courses livrées impayées du livreur
  const coursesImpayees = await base44.asServiceRole.entities.CourseExterne.filter(
    { livreur_id: livreurId, statut: 'livree', statut_paiement_livreur: 'non_paye' },
    'heure_livraison', 500
  ).catch(() => []);

  // 3. Somme des commissions non payées = solde réel
  const commissionsImpayees = (coursesImpayees || []).reduce(
    (sum: number, c: any) => sum + (Number(c.commission_silga) || 0), 0
  );

  // 4. Récupérer le seuil du pays
  const countryConfig = await chargerConfigPays(base44, livreur.country_code);
  const seuil = countryConfig?.seuil_encours_max ?? null;
  const devise = countryConfig?.devise || 'FCFA';

  if (seuil === null || seuil <= 0) {
    // Seuil non configuré — ne pas bloquer mais alerter
    console.warn(`[SOLDE] ⚠️ Seuil non configuré pour pays ${livreur.country_code} — livreur ${livreurId}`);
    // Mettre à jour la projection quand même
    await base44.asServiceRole.entities.Livreur.update(livreurId, {
      montant_du_silga: commissionsImpayees,
      encours: commissionsImpayees,
      statut_paiement: commissionsImpayees > 0 ? 'non_paye' : 'paye',
    });
    return { solde: commissionsImpayees, seuil: null, bloque: false, statut_paiement: commissionsImpayees > 0 ? 'non_paye' : 'paye', devise };
  }

  // 5. Déterminer le statut dérivé (solde > 0 → dette, solde = 0 → réglé)
  const statutPaiement = commissionsImpayees > 0 ? 'non_paye' : 'paye';
  const bloque = commissionsImpayees >= seuil;
  const now = new Date().toISOString();

  // 6. Construire l'update
  const updateData: any = {
    montant_du_silga: commissionsImpayees,
    encours: commissionsImpayees, // alias legacy synchronisé
    statut_paiement: statutPaiement,
    bloque_encours: bloque,
  };

  if (bloque) {
    updateData.encours_bloque_at = livreur.encours_bloque_at || now;
    updateData.admin_hors_ligne = true;
    updateData.statut = 'hors_ligne';
    updateData.admin_statut_log = `Blocage recalculé — plafond d'encours atteint (${commissionsImpayees}/${seuil} ${devise})`;
  } else {
    updateData.encours_bloque_at = null;
    // Ne pas forcer admin_hors_ligne=false si le livreur est hors ligne pour une autre raison
    if (livreur.bloque_encours) {
      updateData.admin_hors_ligne = false;
      updateData.admin_statut_log = 'Déblocage — encours recalculé sous le seuil';
    }
  }

  await base44.asServiceRole.entities.Livreur.update(livreurId, updateData);

  console.log(`[SOLDE] Livreur ${livreurId}: solde recalculé = ${commissionsImpayees} ${devise} (seuil=${seuil}, bloque=${bloque})`);

  return { solde: commissionsImpayees, seuil, bloque, statut_paiement: statutPaiement, devise };
}