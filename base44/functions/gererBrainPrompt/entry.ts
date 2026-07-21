import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Gestion du Cerveau Central de VENUS — prompt système versionné.
 *
 * Actions:
 *   - list: Lister toutes les versions (filtrable par personality_key)
 *   - get_active: Récupérer la version active pour une personnalité
 *   - save: Créer une nouvelle version (désactive l'ancienne active)
 *   - activate: Activer une version (désactive les autres de la même personnalité)
 *   - deactivate: Désactiver une version
 *   - restore: Restaurer une ancienne version (crée une copie active)
 *   - compare: Comparer deux versions (diff)
 *   - simulate: Tester un prompt sans l'activer (dry-run)
 */

const FALLBACK_PROMPT_KEY = 'standard';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    // ── LIST: Toutes les versions ──
    if (action === 'list') {
      const { personality_key } = body;
      const query = personality_key ? { personality_key } : {};
      const versions = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
        query, '-date_creation', 200
      );
      return Response.json({ success: true, versions });
    }

    // ── GET_ACTIVE: Version active pour une personnalité ──
    if (action === 'get_active') {
      const { personality_key = FALLBACK_PROMPT_KEY } = body;
      const actives = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
        { personality_key, statut: 'active' }, '-date_creation', 1
      );
      return Response.json({ success: true, prompt: actives?.[0] || null });
    }

    // ── SAVE: Créer une nouvelle version ──
    if (action === 'save') {
      const { personality_key = FALLBACK_PROMPT_KEY, personality_label, contenu, notes, activate = true } = body;
      if (!contenu || contenu.trim().length < 10) {
        return Response.json({ error: 'Contenu du prompt trop court' }, { status: 400 });
      }

      // Récupérer le numéro de version suivant
      const existing = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
        { personality_key }, '-version', 1
      );
      const nextVersion = (existing?.[0]?.version || 0) + 1;

      // Si activate=true, désactiver les autres versions de cette personnalité
      if (activate) {
        const allForPersonality = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
          { personality_key, statut: 'active' }
        );
        for (const v of allForPersonality) {
          await base44.asServiceRole.entities.VenusBrainPrompt.update(v.id, { statut: 'inactive' });
        }
      }

      const created = await base44.asServiceRole.entities.VenusBrainPrompt.create({
        personality_key,
        personality_label: personality_label || personality_key,
        version: nextVersion,
        contenu,
        notes: notes || '',
        statut: activate ? 'active' : 'inactive',
        auteur: user.email,
        date_creation: new Date().toISOString(),
        date_modification: new Date().toISOString(),
      });

      return Response.json({ success: true, prompt: created });
    }

    // ── ACTIVATE: Activer une version ──
    if (action === 'activate') {
      const { prompt_id } = body;
      const prompt = await base44.asServiceRole.entities.VenusBrainPrompt.get(prompt_id);
      if (!prompt) return Response.json({ error: 'Version introuvable' }, { status: 404 });

      // Désactiver toutes les autres versions actives de la même personnalité
      const actives = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
        { personality_key: prompt.personality_key, statut: 'active' }
      );
      for (const v of actives) {
        if (v.id !== prompt_id) {
          await base44.asServiceRole.entities.VenusBrainPrompt.update(v.id, { statut: 'inactive' });
        }
      }

      await base44.asServiceRole.entities.VenusBrainPrompt.update(prompt_id, {
        statut: 'active',
        date_modification: new Date().toISOString(),
      });

      return Response.json({ success: true });
    }

    // ── DEACTIVATE: Désactiver une version ──
    if (action === 'deactivate') {
      const { prompt_id } = body;
      await base44.asServiceRole.entities.VenusBrainPrompt.update(prompt_id, {
        statut: 'inactive',
        date_modification: new Date().toISOString(),
      });
      return Response.json({ success: true });
    }

    // ── RESTORE: Restaurer une ancienne version (crée une copie active) ──
    if (action === 'restore') {
      const { prompt_id } = body;
      const original = await base44.asServiceRole.entities.VenusBrainPrompt.get(prompt_id);
      if (!original) return Response.json({ error: 'Version introuvable' }, { status: 404 });

      // Désactiver la version active actuelle
      const actives = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
        { personality_key: original.personality_key, statut: 'active' }
      );
      for (const v of actives) {
        await base44.asServiceRole.entities.VenusBrainPrompt.update(v.id, { statut: 'inactive' });
      }

      // Créer une copie avec nouveau numéro de version
      const existing = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
        { personality_key: original.personality_key }, '-version', 1
      );
      const nextVersion = (existing?.[0]?.version || 0) + 1;

      const restored = await base44.asServiceRole.entities.VenusBrainPrompt.create({
        personality_key: original.personality_key,
        personality_label: original.personality_label,
        version: nextVersion,
        contenu: original.contenu,
        notes: `Restauration de la version ${original.version}`,
        statut: 'active',
        auteur: user.email,
        date_creation: new Date().toISOString(),
        date_modification: new Date().toISOString(),
      });

      return Response.json({ success: true, prompt: restored });
    }

    // ── COMPARE: Comparer deux versions ──
    if (action === 'compare') {
      const { prompt_id_a, prompt_id_b } = body;
      const [a, b] = await Promise.all([
        base44.asServiceRole.entities.VenusBrainPrompt.get(prompt_id_a),
        base44.asServiceRole.entities.VenusBrainPrompt.get(prompt_id_b),
      ]);
      if (!a || !b) return Response.json({ error: 'Version introuvable' }, { status: 404 });

      // Diff simple ligne par ligne
      const linesA = a.contenu.split('\n');
      const linesB = b.contenu.split('\n');
      const maxLen = Math.max(linesA.length, linesB.length);
      const diff = [];
      for (let i = 0; i < maxLen; i++) {
        const la = linesA[i] || '';
        const lb = linesB[i] || '';
        if (la !== lb) {
          diff.push({ line: i + 1, a: la, b: lb, status: la && !lb ? 'removed' : !la && lb ? 'added' : 'changed' });
        }
      }

      return Response.json({
        success: true,
        version_a: { id: a.id, version: a.version, date: a.date_creation, auteur: a.auteur },
        version_b: { id: b.id, version: b.version, date: b.date_creation, auteur: b.auteur },
        diff,
        stats: { lines_a: linesA.length, lines_b: linesB.length, changed_lines: diff.length },
      });
    }

    // ── SIMULATE: Tester un prompt sans l'activer (dry-run) ──
    if (action === 'simulate') {
      const { contenu, message_test, telephone = '+22670000000', country_code = 'BF' } = body;
      if (!contenu || !message_test) {
        return Response.json({ error: 'contenu et message_test requis' }, { status: 400 });
      }

      const startTime = Date.now();
      let creditsUsed = 0;

      // 1. Charger les sources (règles, connaissances, scénarios)
      const [regles, connaissances, scenarios] = await Promise.all([
        base44.asServiceRole.entities.VenusBusinessRule.filter({ statut: 'valide' }, '-created_date', 50).catch(() => []),
        base44.asServiceRole.entities.VenusKnowledge.filter({ statut: 'valide' }, '-updated_date', 50).catch(() => []),
        base44.asServiceRole.entities.VenusScenario.filter({ statut: 'valide' }, '-created_date', 20).catch(() => []),
      ]);

      const reglesFiltered = (regles || []).filter(r => r.pays === 'ALL' || r.pays === country_code);
      const connaissancesFiltered = (connaissances || []).filter(k => !k.pays || k.pays === 'ALL' || k.pays === country_code);

      // 2. Matching heuristique (0 crédit)
      const msgLower = message_test.toLowerCase();
      const reglesMatched = reglesFiltered.filter(r => {
        const text = ((r.nom || '') + ' ' + (r.description || '') + ' ' + (r.exemples || '')).toLowerCase();
        return msgLower.split(' ').some(w => w.length > 3 && text.includes(w));
      }).slice(0, 3);

      const connaissancesMatched = connaissancesFiltered.filter(k => {
        const text = ((k.titre || '') + ' ' + (k.question || '') + ' ' + (k.mots_cles || '')).toLowerCase();
        return msgLower.split(' ').some(w => w.length > 3 && text.includes(w));
      }).slice(0, 3);

      const scenariosMatched = (scenarios || []).filter(s => {
        const declencheurs = (s.declencheurs || '').toLowerCase();
        return msgLower.split(' ').some(w => w.length > 3 && declencheurs.includes(w));
      }).slice(0, 2);

      // 3. Appel LLM avec le prompt de test (crédit: ~3 automatic)
      let reponse = '';
      let llmCalled = false;
      try {
        const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `${contenu}\n\n═══ MESSAGE CLIENT (SIMULATION) ═══\nTéléphone: ${telephone}\nPays: ${country_code}\nMessage: "${message_test}"\n\nRéponds comme VENUS. Cette réponse est une SIMULATION — aucune action réelle ne sera exécutée.`,
          model: 'automatic',
        });
        reponse = typeof llmResult === 'string' ? llmResult : (llmResult?.response || llmResult?.text || '');
        llmCalled = true;
        creditsUsed += 3;
      } catch (e) {
        reponse = `Erreur LLM: ${e.message}`;
      }

      const tempsMs = Date.now() - startTime;

      const result = {
        reponse,
        sources: {
          regles: reglesMatched.map(r => ({ id: r.id, nom: r.nom, priorite: r.priorite })),
          connaissances: connaissancesMatched.map(k => ({ id: k.id, titre: k.titre, categorie: k.categorie })),
          scenarios: scenariosMatched.map(s => ({ id: s.id, nom: s.nom })),
        },
        llm_called: llmCalled,
        tools_executed: [],
        credits_estimes: creditsUsed,
        temps_reponse_ms: tempsMs,
        simulate: true,
      };

      return Response.json({ success: true, result });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[gererBrainPrompt] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});