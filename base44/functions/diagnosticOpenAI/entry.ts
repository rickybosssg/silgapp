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

    // ── 3. Vérifier la config SystemConfig AVANT le test (pour tester le bon modèle) ──
    const allConfigs = await base44.asServiceRole.entities.SystemConfig.filter({});
    const getConfig = (cle: string) => allConfigs.find((c: any) => c.cle === cle)?.valeur;

    const enabledVal = getConfig('VENUS_OPENAI_ENABLED');
    const modelVal = getConfig('VENUS_PRIMARY_MODEL') || getConfig('VENUS_OPENAI_MODEL') || 'gpt-4.1-mini';

    // ── 2. Test réel : appel API OpenAI avec le modèle configuré ──
    const t0 = Date.now();
    let apiResult: any = {
      secret_present: true,
      secret_length: OPENAI_API_KEY.length,
      secret_prefix: OPENAI_API_KEY.substring(0, 3) + '***',
      modele_configure: modelVal,
      modele_source: 'SystemConfig → VENUS_PRIMARY_MODEL (configuré par l\'admin)',
      interrupteur_venus: enabledVal || 'non_configuré',
      interrupteur_actif: enabledVal === 'true',
    };

    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelVal,
          messages: [
            { role: 'system', content: 'Réponds uniquement par "OK".' },
            { role: 'user', content: 'Test de connexion SILGAPP VENUS.' },
          ],
          max_completion_tokens: 50,
        }),
      });

      const data = await resp.json();
      apiResult.latence_ms = Date.now() - t0;
      apiResult.http_status = resp.status;

      if (resp.ok) {
        // GPT-5 peut retourner un content vide (uniquement des reasoning_tokens)
        // sur des prompts triviaux — un HTTP 200 valide = connexion OK.
        apiResult.connexion_ok = true;
        apiResult.message = `Connexion OpenAI OK avec ${modelVal}`;
        apiResult.modele_teste = data.model || modelVal;
        apiResult.modele_retourne_par_api = data.model || 'N/A';
        apiResult.reponse_api = data.choices?.[0]?.message?.content || '(réponse structurée — reasoning tokens uniquement)';
        apiResult.tokens = data.usage;
        if (!data.choices?.[0]?.message?.content) {
          apiResult.note = 'GPT-5 a répondu avec un content vide (reasoning_tokens uniquement) — connexion valide.';
        }
      } else if (resp.ok) {
        // HTTP 200 mais pas de content — logger la structure brute
        apiResult.connexion_ok = true;
        apiResult.message = `Connexion OK avec ${modelVal} (réponse structurée)`;
        apiResult.modele_retourne_par_api = data.model || 'N/A';
        apiResult.tokens = data.usage;
        apiResult.raw_choice = JSON.stringify(data.choices?.[0]?.message || {}).substring(0, 500);
        apiResult.raw_response_keys = Object.keys(data);
      } else {
        apiResult.connexion_ok = false;
        apiResult.message = `Clé invalide ou modèle ${modelVal} non supporté`;
        apiResult.erreur_type = data.error?.type || 'N/A';
        apiResult.erreur_message = data.error?.message || 'N/A';
        apiResult.erreur_code = data.error?.code || 'N/A';
      }
    } catch (e) {
      apiResult.connexion_ok = false;
      apiResult.message = 'Erreur réseau/connexion';
      apiResult.erreur = e.message;
    }

    // ── 5. Flux VENUS confirmé ──
    apiResult.flux_venus = {
      webhook: 'webhookWhatsAppVenus → raisonnerVenus()',
      moteur_principal: `raisonnerAvecOpenAI() via ${modelVal}`,
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