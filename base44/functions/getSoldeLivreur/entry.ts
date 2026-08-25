import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { calculerSoldeLivreur, calculerSoldesLivreursBatch } from '../../shared/soldeCalculator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getSoldeLivreur — Source de vérité unique pour le solde et le crédit livreur
// ═══════════════════════════════════════════════════════════════════════════
//
// Deux modes :
//   1. Single : { livreur_id } → retourne { montantDu, creditDisponible, ... }
//   2. Batch  : { country_code } → retourne { livreurs: [{ livreur_id, montantDu, creditDisponible, ... }] }
//
// Utilise soldeCalculator.ts (même formule que recalculerSoldeLivreur).
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { livreur_id, country_code } = body || {};

    // ── Mode batch (admin) : tous les livreurs d'un pays (ou tous pays si country_code vide) ──
    //    Un admin global sans pays sélectionné envoie country_code=undefined.
    //    On entre quand même en mode batch pour éviter l'erreur 400.
    const isBatchRequest = !livreur_id && (user.role === 'admin');
    if (isBatchRequest) {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
      const cc = country_code || null;
      const soldes = await calculerSoldesLivreursBatch(base44, cc);
      const livreurFilter = cc
        ? { type_livreur: 'externe', country_code: cc }
        : { type_livreur: 'externe' };
      const livreurs = await base44.asServiceRole.entities.Livreur.filter(
        livreurFilter,
        '-created_date', 200
      ).catch(() => []);

      const result = (livreurs || []).map((l: any) => {
        const s = soldes[l.id] || { solde: 0, creditDisponible: 0, totalCommissions: 0, totalPaye: 0 };
        return {
          livreur_id: l.id,
          montantDu: s.solde,
          creditDisponible: s.creditDisponible,
          totalCommissions: s.totalCommissions,
          totalPaye: s.totalPaye,
        };
      });

      return Response.json({ livreurs: result });
    }

    // ── Mode single : un livreur ──
    if (!livreur_id) {
      return Response.json({ error: 'livreur_id or country_code required' }, { status: 400 });
    }

    // Vérifier que l'utilisateur est admin OU le livreur lui-même
    if (user.role !== 'admin') {
      const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id).catch(() => null);
      if (!livreur || livreur.user_email !== user.email) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { solde, creditDisponible, totalCommissions, totalPaye } = await calculerSoldeLivreur(base44, livreur_id);

    return Response.json({
      montantDu: solde,
      creditDisponible,
      totalCommissions,
      totalPaye,
    });
  } catch (error: any) {
    console.error('[getSoldeLivreur] Error:', error);
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}