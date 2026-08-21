import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { ensureCodePromo } from '../../shared/codePromoUtils.ts';

/**
 * Batch admin : génère un code promo ambassadeur pour tous les
 * clients et livreurs existants qui n'en ont pas encore.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const results = {
      clients_traites: 0,
      clients_crees: 0,
      clients_existants: 0,
      livreurs_traites: 0,
      livreurs_crees: 0,
      livreurs_existants: 0,
      erreurs: [] as string[],
      codes_crees: [] as { type: string; nom: string; code: string }[],
    };

    // ── 1. Traiter tous les clients externes ──
    const clients = await base44.asServiceRole.entities.ClientExterne.list();
    results.clients_traites = clients.length;

    for (const client of clients) {
      try {
        if (!client.country_code) {
          results.erreurs.push(`Client ${client.id}: country_code manquant, ignoré`);
          continue;
        }
        const res = await ensureCodePromo(base44.asServiceRole, {
          proprietaire_type: 'client',
          proprietaire_id: client.id,
          proprietaire_nom: client.nom || client.prenom || 'Client',
          proprietaire_email: client.user_email || '',
          country_code: client.country_code,
        });

        if (res.created) {
          results.clients_crees++;
          results.codes_crees.push({ type: 'client', nom: client.nom || 'Client', code: res.code });
        } else {
          results.clients_existants++;
        }
      } catch (e) {
        results.erreurs.push(`Client ${client.id}: ${e.message}`);
      }
    }

    // ── 2. Traiter tous les livreurs ──
    const livreurs = await base44.asServiceRole.entities.Livreur.list();
    results.livreurs_traites = livreurs.length;

    for (const livreur of livreurs) {
      try {
        if (!livreur.country_code) {
          results.erreurs.push(`Livreur ${livreur.id}: country_code manquant, ignoré`);
          continue;
        }
        const res = await ensureCodePromo(base44.asServiceRole, {
          proprietaire_type: 'livreur',
          proprietaire_id: livreur.id,
          proprietaire_nom: livreur.nom || livreur.prenom || 'Livreur',
          proprietaire_email: livreur.user_email || '',
          country_code: livreur.country_code,
        });

        if (res.created) {
          results.livreurs_crees++;
          results.codes_crees.push({ type: 'livreur', nom: livreur.nom || 'Livreur', code: res.code });
        } else {
          results.livreurs_existants++;
        }
      } catch (e) {
        results.erreurs.push(`Livreur ${livreur.id}: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      ...results,
      total_codes_crees: results.clients_crees + results.livreurs_crees,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});