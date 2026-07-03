import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'analyser';

    // ── Auth : admin manuel OU exécution automatique planifiée ──
    let user = null;
    let lancePar = 'automatique';
    try {
      user = await base44.auth.me();
    } catch (_) { /* exécution via automation — pas d'utilisateur */ }
    if (user) {
      if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });
      lancePar = user.email;
    }

    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    // ── Récupérer la précédente analyse pour comparaison ──
    const previousAnalyses = await base44.asServiceRole.entities.NeoAnalyse.list('-date_analyse', 1).catch(() => []);
    const previousAnalyse = previousAnalyses[0] || null;
    let previousScores = {};
    if (previousAnalyse?.scores_detail) {
      try { previousScores = JSON.parse(previousAnalyse.scores_detail); } catch (_) {}
    }

    // ── Récupérer les recommandations récentes pour déduplication ──
    const existingRecs = await base44.asServiceRole.entities.NeoRecommendation.list('-created_date', 100).catch(() => []);
    const existingTitles = existingRecs.map(r => (r.titre || '').toLowerCase().trim());

    // ── Récupérer les statistiques de la plateforme (élargi) ──
    const [
      courses, livreurs, clients, boutiques, restaurants, pharmacies,
      messages, notifs, maintenances, venusInteractions, appInstalls,
      users, commandesBoutique, commandesRestaurant, paiementsPartenaires,
      notifTokens, conversations, codesPromo, primesPromo
    ] = await Promise.all([
      base44.asServiceRole.entities.CourseExterne.list('-created_date', 300).catch(() => []),
      base44.asServiceRole.entities.Livreur.list('-created_date', 300).catch(() => []),
      base44.asServiceRole.entities.ClientExterne.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.Boutique.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.Restaurant.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.Pharmacie.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.Message.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.Notification.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.RapportMaintenance.list('-created_date', 5).catch(() => []),
      base44.asServiceRole.entities.VenusInteraction.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.AppInstall.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.User.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.CommandeBoutique.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.CommandeRestaurant.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.PaiementPartenaire.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.NotificationToken.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.Conversation.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.CodePromo.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.PrimePromo.list('-created_date', 50).catch(() => []),
    ]);

    // ── Filtrage temporel : courses des 7 derniers jours ──
    const coursesRecentes = courses.filter(c => c.created_date && new Date(c.created_date) >= sevenDaysAgo);

    // ── Calcul des KPIs dérivés ──
    const coursesLivrees = courses.filter(c => c.statut === 'livree');
    const coursesAvecDistance = coursesLivrees.filter(c => c.distance_reelle_km != null);
    const distanceMoyenne = coursesAvecDistance.length > 0
      ? Math.round(coursesAvecDistance.reduce((s, c) => s + (c.distance_reelle_km || 0), 0) / coursesAvecDistance.length * 10) / 10
      : 0;

    const coursesAvecDuree = coursesLivrees.filter(c => c.heure_acceptation && c.heure_livraison);
    const dureeMoyenneMin = coursesAvecDuree.length > 0
      ? Math.round(coursesAvecDuree.reduce((s, c) => {
          const dur = (new Date(c.heure_livraison).getTime() - new Date(c.heure_acceptation).getTime()) / 60000;
          return s + (dur > 0 && dur < 300 ? dur : 0);
        }, 0) / coursesAvecDuree.length)
      : 0;

    const commandesPartenaireTotal = commandesBoutique.length + commandesRestaurant.length;
    const commandesPartenaireLivrees = commandesBoutique.filter(c => c.statut === 'livree').length
      + commandesRestaurant.filter(c => c.statut === 'livree').length;

    const paiementsEnAttente = paiementsPartenaires.filter(p => p.statut === 'en_attente').length;
    const tokensActifs = notifTokens.filter(t => t.actif).length;
    const tokensAvecErreurs = notifTokens.filter(t => t.fcm_error).length;

    const stats = {
      courses_total: courses.length,
      courses_7_jours: coursesRecentes.length,
      courses_en_cours: courses.filter(c => !['livree', 'annulee'].includes(c.statut)).length,
      courses_livrees: coursesLivrees.length,
      courses_annulees: courses.filter(c => c.statut === 'annulee').length,
      taux_annulation: courses.length > 0 ? Math.round(courses.filter(c => c.statut === 'annulee').length / courses.length * 100) : 0,
      courses_nouvelles: courses.filter(c => c.statut === 'nouvelle').length,
      courses_recherche_livreur: courses.filter(c => c.statut === 'recherche_livreur').length,
      courses_aujourdhui: courses.filter(c => c.created_date && new Date(c.created_date).toDateString() === todayStr).length,
      courses_hier: courses.filter(c => c.created_date && new Date(c.created_date).toDateString() === yesterday).length,
      distance_moyenne_km: distanceMoyenne,
      duree_moyenne_livraison_min: dureeMoyenneMin,
      livreurs_total: livreurs.length,
      livreurs_disponibles: livreurs.filter(l => l.statut === 'disponible').length,
      livreurs_en_course: livreurs.filter(l => l.statut === 'en_course').length,
      livreurs_hors_ligne: livreurs.filter(l => l.statut === 'hors_ligne').length,
      livreurs_sans_photo: livreurs.filter(l => !l.photo_url).length,
      livreurs_validation_attente: livreurs.filter(l => l.validation === 'en_attente').length,
      livreurs_bloques: livreurs.filter(l => l.bloque_encours).length,
      livreurs_note_moyenne: livreurs.length > 0 ? Math.round(livreurs.reduce((s, l) => s + (l.note_moyenne || 0), 0) / livreurs.length * 10) / 10 : 0,
      clients_total: clients.length,
      clients_actifs: clients.filter(c => c.actif).length,
      users_total: users.length,
      users_admins: users.filter(u => u.role === 'admin').length,
      boutiques_total: boutiques.length,
      boutiques_validees: boutiques.filter(b => b.validation === 'valide').length,
      boutiques_en_attente: boutiques.filter(b => b.validation === 'en_attente').length,
      restaurants_total: restaurants.length,
      restaurants_validees: restaurants.filter(r => r.validation === 'valide').length,
      pharmacies_total: pharmacies.length,
      commandes_boutique_total: commandesBoutique.length,
      commandes_restaurant_total: commandesRestaurant.length,
      commandes_partenaire_total: commandesPartenaireTotal,
      commandes_partenaire_livrees: commandesPartenaireLivrees,
      taux_conversion_commandes: commandesPartenaireTotal > 0 ? Math.round(commandesPartenaireLivrees / commandesPartenaireTotal * 100) : 0,
      paiements_partenaires_en_attente: paiementsEnAttente,
      messages_total: messages.length,
      conversations_total: conversations.length,
      notifs_non_lues: notifs.filter(n => !n.lue).length,
      notif_tokens_total: notifTokens.length,
      notif_tokens_actifs: tokensActifs,
      notif_tokens_erreurs: tokensAvecErreurs,
      taux_tokens_actifs: notifTokens.length > 0 ? Math.round(tokensActifs / notifTokens.length * 100) : 0,
      codes_promo_total: codesPromo.length,
      codes_promo_actifs: codesPromo.filter(c => c.actif).length,
      primes_total: primesPromo.length,
      primes_en_attente: primesPromo.filter(p => p.statut === 'en_attente').length,
      maintenances_recentes: maintenances.map(m => ({ bugs: m.bugs || 0, corrections: m.corrections || 0, erreurs_critiques: m.erreurs_critiques || 0 })),
      venus_interactions_total: venusInteractions.length,
      app_installs_total: appInstalls.length,
      app_installs_android: appInstalls.filter(a => a.platform === 'android').length,
      app_installs_ios: appInstalls.filter(a => a.platform === 'ios').length,
      app_installs_web: appInstalls.filter(a => a.platform === 'web').length,
    };

    // ── Scores précédents pour comparaison ──
    const trendInfo = previousAnalyse
      ? `\n\nScore global précédent: ${previousAnalyse.score_global}/100 (le ${new Date(previousAnalyse.date_analyse).toLocaleString("fr-FR")})\nScores précédents par dimension: ${JSON.stringify(previousScores)}`
      : '\n\nCeci est la première analyse — pas d\'historique de comparaison disponible.';

    // ── Construire le prompt pour l'LLM ──
    const prompt = `Tu es NEO, le moteur d'amélioration continue de SILGAPP, une plateforme de livraison (courses, restaurants, boutiques, pharmacies) opérant en Afrique de l'Ouest (Burkina Faso, Côte d'Ivoire, Togo, etc.).

SILGAPP est une application React + Tailwind CSS avec un backend Base44. Elle gère :
- Le dispatch automatique des livreurs
- Les courses clients (expédition, réception, déplacement)
- Les commandes boutiques/restaurants/pharmacies
- Les notifications push (Firebase Cloud Messaging)
- La messagerie temps réel
- Le suivi GPS des livreurs
- La gestion multi-pays
- Un module partenaire (boutiques, restaurants, pharmacies)
- Un assistant IA (VENUS) pour les utilisateurs

Voici les statistiques actuelles de la plateforme :
${JSON.stringify(stats, null, 2)}

Dernier rapport de maintenance :
${JSON.stringify(stats.maintenances_recentes, null, 2)}
${trendInfo}

Analyse SILGAPP de manière exhaustive. Tu dois :

1. ATTRIBUER DES SCORES (0-100) sur 8 dimensions :
   - design : Qualité visuelle, cohérence, esthétique
   - ux : Ergonomie, fluidité des parcours, accessibilité
   - performance : Temps de réponse, optimisation, taux de rafraîchissement
   - dispatch : Efficacité du matching livreur-course, vagues de notification
   - notifications : Fiabilité push, pertinence, délivrabilité
   - gps : Précision du suivi, stabilité de la carte, gestion arrière-plan
   - securite : Authentification, isolation des données, anti-fraude
   - architecture : Structure du code, scalabilité, maintenabilité

2. DÉTECTER des problèmes et améliorations parmi :
   - Bugs potentiels
   - Lenteurs ou ralentissements
   - Incohérences de données
   - Problèmes UX/UI
   - Optimisations possibles
   - Nouvelles fonctionnalités pertinentes
   - Problèmes Android/iOS/Web
   - Améliorations de sécurité
   - Évolutions architecturales

3. Pour CHAQUE recommandation, fournir :
   - titre : Court et descriptif
   - categorie : bug | performance | design | ux | dispatch | notifications | gps | securite | architecture | evolution | processus_metier
   - priorite : critique | elevee | moyenne | faible
   - effort_estime : rapide (moins d'1h) | moyen (quelques heures) | long (plusieurs jours)
   - impact_estime : faible | moyen | fort
   - probleme : Description du problème détecté
   - raison : Pourquoi ce problème existe
   - impact : Conséquences sur la plateforme et les utilisateurs
   - solution : Solution recommandée (concrète et applicable)
   - benefices : Bénéfices attendus de la correction

Génère entre 5 et 15 recommandations pertinentes. Sois précis et actionnable. Évite les recommandations génériques — base-toi sur les données réelles fournies.

Réponds en français.`;

    const llmRaw = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          scores: {
            type: "object",
            properties: {
              design: { type: "number" },
              ux: { type: "number" },
              performance: { type: "number" },
              dispatch: { type: "number" },
              notifications: { type: "number" },
              gps: { type: "number" },
              securite: { type: "number" },
              architecture: { type: "number" }
            }
          },
          resume: { type: "string" },
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                titre: { type: "string" },
                categorie: { type: "string" },
                priorite: { type: "string" },
                effort_estime: { type: "string" },
                impact_estime: { type: "string" },
                probleme: { type: "string" },
                raison: { type: "string" },
                impact: { type: "string" },
                solution: { type: "string" },
                benefices: { type: "string" }
              }
            }
          }
        }
      }
    });

    // L'LLM peut retourner un objet ou une string JSON
    let llmResponse = llmRaw;
    if (typeof llmRaw === "string") {
      try { llmResponse = JSON.parse(llmRaw); } catch (_) { llmResponse = {}; }
    }
    if (llmResponse?.data && typeof llmResponse.data === "object") llmResponse = llmResponse.data;
    if (llmResponse?.response && typeof llmResponse.response === "object") llmResponse = llmResponse.response;

    const scores = llmResponse.scores || {};
    const allRecommendations = Array.isArray(llmResponse.recommendations) ? llmResponse.recommendations : [];
    const resume = llmResponse.resume || "Analyse NEO terminée";

    // ── Déduplication : filtrer les recommandations dont le titre existe déjà ──
    const newRecommendations = allRecommendations.filter(r => {
      const titleLower = (r.titre || '').toLowerCase().trim();
      return !existingTitles.some(et => et === titleLower || (et.length > 10 && titleLower.includes(et)) || (titleLower.length > 10 && et.includes(titleLower)));
    });

    const scoreGlobal = Math.round(
      Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0) / 8
    );

    // ── Calcul de la tendance vs analyse précédente ──
    const trend = {};
    if (previousAnalyse) {
      trend.score_precedent = previousAnalyse.score_global;
      trend.evolution = scoreGlobal - previousAnalyse.score_global;
      for (const [key, val] of Object.entries(scores)) {
        const prevVal = previousScores[key];
        if (prevVal != null) trend[`evolution_${key}`] = (Number(val) || 0) - (Number(prevVal) || 0);
      }
    }

    // ── Créer l'analyse ──
    const analyse = await base44.asServiceRole.entities.NeoAnalyse.create({
      date_analyse: now.toISOString(),
      score_global: scoreGlobal,
      scores_detail: JSON.stringify(scores),
      resume,
      nb_recommandations: newRecommendations.length,
      nb_critique: newRecommendations.filter(r => r.priorite === 'critique').length,
      nb_elevee: newRecommendations.filter(r => r.priorite === 'elevee').length,
      nb_moyenne: newRecommendations.filter(r => r.priorite === 'moyenne').length,
      nb_faible: newRecommendations.filter(r => r.priorite === 'faible').length,
      stats_snapshot: JSON.stringify(stats),
      lance_par: lancePar,
    });

    // ── Créer les recommandations (dédupliquées) ──
    const recsToCreate = newRecommendations.map(r => ({
      analyse_id: analyse.id,
      titre: r.titre || 'Recommandation',
      categorie: r.categorie || 'evolution',
      priorite: r.priorite || 'moyenne',
      effort_estime: r.effort_estime || 'moyen',
      impact_estime: r.impact_estime || 'moyen',
      probleme: r.probleme || '',
      raison: r.raison || '',
      impact: r.impact || '',
      solution: r.solution || '',
      benefices: r.benefices || '',
      statut: 'nouvelle',
      date_creation: now.toISOString(),
    }));

    if (recsToCreate.length > 0) {
      await base44.asServiceRole.entities.NeoRecommendation.bulkCreate(recsToCreate);
    }

    // ── Email automatique aux admins si recommandations critiques ──
    const nbCritiques = newRecommendations.filter(r => r.priorite === 'critique').length;
    if (nbCritiques > 0) {
      const admins = users.filter(u => u.role === 'admin' && u.email);
      const adminEmails = admins.map(a => a.email);
      if (adminEmails.length > 0) {
        const critiquesList = newRecommendations
          .filter(r => r.priorite === 'critique')
          .slice(0, 5)
          .map((r, i) => `${i + 1}. ${r.titre}\n   Problème: ${r.probleme || 'N/A'}\n   Solution: ${r.solution || 'N/A'}`)
          .join('\n\n');

        const emailBody = `Bonjour,

NEO a détecté ${nbCritiques} recommandation(s) critique(s) lors de l'analyse du ${new Date().toLocaleString("fr-FR")}.

Score global SILGAPP: ${scoreGlobal}/100
${previousAnalyse ? `Évolution: ${trend.evolution >= 0 ? '+' : ''}${trend.evolution} points` : ''}

Recommandations critiques:
${critiquesList}

Connectez-vous au tableau de bord SILGAPP → NEO pour consulter toutes les recommandations.

— NEO, moteur d'amélioration continue SILGAPP`;

        for (const email of adminEmails) {
          try {
            await base44.integrations.Core.SendEmail({
              to: email,
              subject: `🔴 NEO – ${nbCritiques} recommandation(s) critique(s) détectée(s)`,
              body: emailBody,
            });
          } catch (_) { /* ne pas bloquer l'analyse si l'email échoue */ }
        }
      }
    }

    return Response.json({
      success: true,
      analyse_id: analyse.id,
      score_global: scoreGlobal,
      scores,
      nb_recommandations: newRecommendations.length,
      nb_dedupliquees: allRecommendations.length - newRecommendations.length,
      nb_critiques: nbCritiques,
      resume,
      trend: trend.score_precedent ? trend : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});