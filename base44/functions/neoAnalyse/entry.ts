import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'analyser';

    // ── Récupérer les statistiques de la plateforme ──
    const [
      courses, livreurs, clients, boutiques, restaurants, pharmacies,
      messages, notifs, maintenances, venusInteractions, appInstalls
    ] = await Promise.all([
      base44.asServiceRole.entities.CourseExterne.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.Livreur.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.ClientExterne.list('-created_date', 100).catch(() => []),
      base44.asServiceRole.entities.Boutique.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.Restaurant.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.Pharmacie.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.Message.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.Notification.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.RapportMaintenance.list('-created_date', 5).catch(() => []),
      base44.asServiceRole.entities.VenusInteraction.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.AppInstall.list('-created_date', 100).catch(() => []),
    ]);

    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString();

    const stats = {
      courses_total: courses.length,
      courses_en_cours: courses.filter(c => !['livree', 'annulee'].includes(c.statut)).length,
      courses_livrees: courses.filter(c => c.statut === 'livree').length,
      courses_annulees: courses.filter(c => c.statut === 'annulee').length,
      courses_nouvelles: courses.filter(c => c.statut === 'nouvelle').length,
      courses_recherche_livreur: courses.filter(c => c.statut === 'recherche_livreur').length,
      courses_aujourdhui: courses.filter(c => c.created_date && new Date(c.created_date).toDateString() === todayStr).length,
      courses_hier: courses.filter(c => c.created_date && new Date(c.created_date).toDateString() === yesterday).length,
      livreurs_total: livreurs.length,
      livreurs_disponibles: livreurs.filter(l => l.statut === 'disponible').length,
      livreurs_en_course: livreurs.filter(l => l.statut === 'en_course').length,
      livreurs_hors_ligne: livreurs.filter(l => l.statut === 'hors_ligne').length,
      livreurs_sans_photo: livreurs.filter(l => !l.photo_url).length,
      livreurs_validation_attente: livreurs.filter(l => l.validation === 'en_attente').length,
      livreurs_bloques: livreurs.filter(l => l.bloque_encours).length,
      clients_total: clients.length,
      clients_actifs: clients.filter(c => c.actif).length,
      boutiques_total: boutiques.length,
      boutiques_validees: boutiques.filter(b => b.validation === 'valide').length,
      boutiques_en_attente: boutiques.filter(b => b.validation === 'en_attente').length,
      restaurants_total: restaurants.length,
      restaurants_validees: restaurants.filter(r => r.validation === 'valide').length,
      pharmacies_total: pharmacies.length,
      messages_total: messages.length,
      notifs_non_lues: notifs.filter(n => !n.lue).length,
      maintenances_recentes: maintenances.map(m => ({ bugs: m.bugs || 0, corrections: m.corrections || 0, erreurs_critiques: m.erreurs_critiques || 0 })),
      venus_interactions_total: venusInteractions.length,
      app_installs_total: appInstalls.length,
      app_installs_android: appInstalls.filter(a => a.platform === 'android').length,
      app_installs_ios: appInstalls.filter(a => a.platform === 'ios').length,
    };

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
   - probleme : Description du problème détecté
   - raison : Pourquoi ce problème existe
   - impact : Conséquences sur la plateforme et les utilisateurs
   - solution : Solution recommandée (concrète et applicable)
   - benefices : Bénéfices attendus de la correction

Génère entre 5 et 15 recommandations pertinentes. Sois précis et actionnable.

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
    // Parfois la réponse est wrappée dans { data: ... } ou { response: ... }
    if (llmResponse?.data && typeof llmResponse.data === "object") llmResponse = llmResponse.data;
    if (llmResponse?.response && typeof llmResponse.response === "object") llmResponse = llmResponse.response;

    const scores = llmResponse.scores || {};
    const recommendations = Array.isArray(llmResponse.recommendations) ? llmResponse.recommendations : [];
    const resume = llmResponse.resume || "Analyse NEO terminée";

    const scoreGlobal = Math.round(
      Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0) / 8
    );

    // ── Créer l'analyse ──
    const analyse = await base44.asServiceRole.entities.NeoAnalyse.create({
      date_analyse: now.toISOString(),
      score_global: scoreGlobal,
      scores_detail: JSON.stringify(scores),
      resume,
      nb_recommandations: recommendations.length,
      nb_critique: recommendations.filter(r => r.priorite === 'critique').length,
      nb_elevee: recommendations.filter(r => r.priorite === 'elevee').length,
      nb_moyenne: recommendations.filter(r => r.priorite === 'moyenne').length,
      nb_faible: recommendations.filter(r => r.priorite === 'faible').length,
      stats_snapshot: JSON.stringify(stats),
      lance_par: user.email,
    });

    // ── Créer les recommandations ──
    const recsToCreate = recommendations.map(r => ({
      analyse_id: analyse.id,
      titre: r.titre || 'Recommandation',
      categorie: r.categorie || 'evolution',
      priorite: r.priorite || 'moyenne',
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

    return Response.json({
      success: true,
      analyse_id: analyse.id,
      score_global: scoreGlobal,
      scores,
      nb_recommandations: recommendations.length,
      resume,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});