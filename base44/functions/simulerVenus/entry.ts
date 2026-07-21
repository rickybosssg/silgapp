import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { simulerMessage } from '../../shared/venusSimulatorEngine.ts';

/**
 * Simulateur VENUS — Mode dry-run / 0 crédit.
 *
 * Aucune action réelle n'est exécutée :
 * - aucune course créée
 * - aucune notification envoyée
 * - aucun message WhatsApp
 * - aucune modification de DB
 *
 * Paramètres :
 *   - message (requis) : message client à tester
 *   - telephone (optionnel) : téléphone fictif (défaut: +22670000000)
 *   - country_code (optionnel) : code pays (défaut: BF)
 *   - mode (optionnel) : 'zero_credit' (défaut) ou 'with_llm'
 *   - contenu_prompt (optionnel) : prompt système à tester (défaut: prompt actif)
 *   - personality_key (optionnel) : personnalité du prompt à charger
 *   - memoire_courte (optionnel) : contexte de conversation
 *
 * Retourne : { success, result } avec result = SimulationResult
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    const body = await req.json();
    const { message, telephone, country_code, mode, contenu_prompt, personality_key, memoire_courte } = body;

    if (!message || message.trim().length < 1) {
      return Response.json({ error: 'message requis' }, { status: 400 });
    }

    // Charger le prompt actif si non fourni
    let promptContent = contenu_prompt;
    if (!promptContent) {
      const actives = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
        { personality_key: personality_key || 'standard', statut: 'active' }, '-date_creation', 1
      );
      promptContent = actives?.[0]?.contenu || null;
    }

    const result = await simulerMessage(base44, {
      message,
      telephone: telephone || '+22670000000',
      country_code: country_code || 'BF',
      memoire_courte,
      mode: mode || 'zero_credit',
      contenu_prompt: promptContent,
    });

    return Response.json({ success: true, result });
  } catch (error) {
    console.error('[simulerVenus] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});