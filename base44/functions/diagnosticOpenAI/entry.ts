import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Diagnostic OpenAI — teste réellement la clé API et retourne un rapport complet.
 * Admin only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    // ── 1. Vérification de la présence du secret ──
    if (!OPENAI_API_KEY) {
      return Response.json({
        statut: 'ÉCHEC',
        secret_present: false,
        erreur: 'Le secret OPENAI_API_KEY est absent du backend. Ajoutez-le dans Settings → Environment Variables.',
      });
    }

    // ── 2. Test réel : appel API OpenAI ──
    const t0 = Date.now();
    let apiResult: any = {
      secret_present: true,
      secret_length: OPENAI_API_KEY.length,
      secret_prefix: OPENAI_API_KEY.substring(0, 3) + '***',
    };

    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: 'Réponds uniquement par "OK".' },
            { role: 'user', content: 'Test de connexion SILGAPP VENUS.' },
          ],
          max_tokens: 5,
          temperature: 0,
        }),
      });

      const data = await resp.json();
      apiResult.latence_ms = Date.now() - t0;
      apiResult.http_status = resp.status;

      if (resp.ok && data.choices?.[0]?.message?.content) {
        apiResult.connexion_ok = true;
        apiResult.message = 'Connexion OpenAI OK';
        apiResult.modele_teste = data.model || 'gpt-4.1-mini';
        apiResult.reponse_api = data.choices[0].message.content;
        apiResult.tokens = data.usage;
      } else {
        apiResult.connexion_ok = false;
        apiResult.message = 'Clé invalide ou erreur API';
        apiResult.erreur_type = data.error?.type || 'N/A';
        apiResult.erreur_message = data.error?.message || 'N/A';
        apiResult.erreur_code = data.error?.code || 'N/A';
      }
    } catch (e) {
      apiResult.connexion_ok = false;
      apiResult.message = 'Erreur réseau/connexion';
      apiResult.erreur = e.message;
    }

    // ── 3. Vérifier la config SystemConfig (interrupteur + modèle en 1 requête) ──
    // CRITIQUE: filter({ cle: '...' }) échoue silencieusement en production Deno.
    // Utiliser filter({}) puis filtrer en mémoire, comme venusOpenAIEngine.ts.
    const allConfigs = await base44.asServiceRole.entities.SystemConfig.filter({});
    const getConfig = (cle: string) => allConfigs.find((c: any) => c.cle === cle)?.valeur;

    const enabledVal = getConfig('VENUS_OPENAI_ENABLED');
    apiResult.interrupteur_venus = enabledVal || 'non_configuré';
    apiResult.interrupteur_actif = enabledVal === 'true';

    const modelVal = getConfig('VENUS_PRIMARY_MODEL') || getConfig('VENUS_OPENAI_MODEL');
    apiResult.modele_configure = modelVal || 'gpt-4.1-mini (défaut)';
    apiResult.modele_source = modelVal
      ? 'SystemConfig → VENUS_PRIMARY_MODEL (configuré par l\'admin)'
      : 'Défaut OPENAI_MODEL_DEFAULT (gpt-4.1-mini) — configurable via SystemConfig VENUS_PRIMARY_MODEL';

    // ── 5. Flux VENUS confirmé ──
    apiResult.flux_venus = {
      webhook: 'webhookWhatsAppVenus → raisonnerVenus()',
      moteur_principal: 'raisonnerAvecOpenAI() via gpt-4.1-mini',
      fallback: 'InvokeLLM (Base44, gpt_5_mini) si OpenAI échoue',
      rag_source: 'venusRagEngine.ts — connaissances injectées dans le prompt OpenAI',
      actions_ecriture: 'Champ action → webhook exécute avec vérification DB',
      bypass_deterministes: 'Annulation, prix manuel, contact livreur, modification — 0 crédit, avant OpenAI',
    };

    // ── 6. Résumé global ──
    apiResult.statut_global = apiResult.connexion_ok && apiResult.interrupteur_actif
      ? 'INTÉGRATION ACTIVE EN PRODUCTION'
      : apiResult.connexion_ok && !apiResult.interrupteur_actif
        ? 'CLÉ VALIDE MAIS INTERRUPTEUR DÉSACTIVÉ'
        : 'INTÉGRATION NON FONCTIONNELLE';

    return Response.json(apiResult);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});