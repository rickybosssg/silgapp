/**
 * venusAdvisorEngine.ts — Conseiller IA & Analyse Métier VENUS
 *
 * Fonctions:
 *  - Analyse métier automatique (heures, zones, livreurs, partenaires, réclamations)
 *  - Recommandations (workflow, procédure, connaissance, FAQ)
 *  - Assistant administrateur (Q&A)
 *  - Mémoire stratégique (tendances)
 */

// ─── Analyse Métier Complète ───
export async function analyzeBusinessMetrics(base44, periode: string = 'semaine') {
  const insights: any[] = [];

  // 1. Meilleures heures
  const heuresInsight = await analyserMeilleuresHeures(base44, periode);
  if (heuresInsight) insights.push(heuresInsight);

  // 2. Zones les plus actives
  const zonesInsight = await analyserZonesActives(base44, periode);
  if (zonesInsight) insights.push(zonesInsight);

  // 3. Livreurs les plus performants
  const livreursInsight = await analyserLivreursPerformants(base44, periode);
  if (livreursInsight) insights.push(livreursInsight);

  // 4. Partenaires les plus sollicités
  const partenairesInsight = await analyserPartenairesSollicites(base44, periode);
  if (partenairesInsight) insights.push(partenairesInsight);

  // 5. Causes des réclamations
  const reclamationsInsight = await analyserCausesReclamations(base44, periode);
  if (reclamationsInsight) insights.push(reclamationsInsight);

  // 6. Taux d'annulation
  const annulationInsight = await analyserTauxAnnulation(base44, periode);
  if (annulationInsight) insights.push(annulationInsight);

  // 7. Taux de retard
  const retardInsight = await analyserTauxRetard(base44, periode);
  if (retardInsight) insights.push(retardInsight);

  // 8. Volume de courses
  const volumeInsight = await analyserVolumeCourses(base44, periode);
  if (volumeInsight) insights.push(volumeInsight);

  // Persister les insights
  for (const insight of insights) {
    await base44.asServiceRole.entities.VenusBusinessInsight.create({
      ...insight,
      statut: 'actif',
      date_creation: new Date().toISOString(),
    }).catch(() => {});
  }

  return insights;
}

// ─── Heures de pointe ───
async function analyserMeilleuresHeures(base44, periode: string) {
  const courses = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 500);
  const heureCounts: Record<number, number> = {};

  for (const c of courses) {
    if (c.created_date) {
      const h = new Date(c.created_date).getHours();
      heureCounts[h] = (heureCounts[h] || 0) + 1;
    }
  }

  const sorted = Object.entries(heureCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (sorted.length === 0) return null;

  const topHeures = sorted.slice(0, 3).map(([h, count]) => ({
    label: `${h}h-${Number(h) + 1}h`,
    value: count as number,
  }));

  const topRange = topHeures.map(h => h.label).join(', ');

  return {
    type_analyse: 'meilleures_heures',
    titre: 'Heures de pointe',
    description: `Les heures les plus actives sont: ${topRange}`,
    valeur_principale: topRange,
    valeur_numerique: topHeures[0].value,
    tendance: 'inconnu',
    periode,
    donnees_detaillees: JSON.stringify(topHeures),
    recommandations: JSON.stringify([{
      priorite: 'normale',
      titre: 'Renforcer la disponibilité des livreurs',
      description: `Augmenter le nombre de livreurs en ligne entre ${topRange}`
    }]),
    niveau_confiance: 90,
  };
}

// ─── Zones actives ───
async function analyserZonesActives(base44, periode: string) {
  const courses = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 500);
  const zoneCounts: Record<string, number> = {};

  for (const c of courses) {
    const zone = c.quartier_recuperation || c.zone || 'Inconnu';
    zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
  }

  const sorted = Object.entries(zoneCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (sorted.length === 0) return null;

  const topZones = sorted.slice(0, 5).map(([zone, count]) => ({
    label: zone,
    value: count as number,
  }));

  return {
    type_analyse: 'zones_actives',
    titre: 'Zones les plus actives',
    description: `Les zones générant le plus de courses: ${topZones.map(z => z.label).join(', ')}`,
    valeur_principale: topZones[0].label,
    valeur_numerique: topZones[0].value,
    tendance: 'inconnu',
    periode,
    donnees_detaillees: JSON.stringify(topZones),
    recommandations: JSON.stringify([{
      priorite: 'haute',
      titre: 'Concentrer les livreurs dans les zones actives',
      description: `Positionner plus de livreurs près de ${topZones[0].label}`
    }]),
    niveau_confiance: 85,
  };
}

// ─── Livreurs performants ───
async function analyserLivreursPerformants(base44, periode: string) {
  const livreurs = await base44.asServiceRole.entities.Livreur.list('-created_date', 200);

  const topLivreurs = livreurs
    .filter(l => l.nb_courses || l.total_courses)
    .map(l => ({
      label: l.nom || 'N/A',
      value: l.nb_courses || l.total_courses || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  if (topLivreurs.length === 0) return null;

  return {
    type_analyse: 'livreurs_performants',
    titre: 'Livreurs les plus performants',
    description: `Top 5 des livreurs: ${topLivreurs.map(l => `${l.label} (${l.value})`).join(', ')}`,
    valeur_principale: topLivreurs[0].label,
    valeur_numerique: topLivreurs[0].value,
    tendance: 'inconnu',
    periode,
    donnees_detaillees: JSON.stringify(topLivreurs),
    recommandations: JSON.stringify([{
      priorite: 'basse',
      titre: 'Récompenser les meilleurs livreurs',
      description: `Mettre en place un système de primes pour ${topLivreurs[0].label}`
    }]),
    niveau_confiance: 80,
  };
}

// ─── Partenaires sollicités ───
async function analyserPartenairesSollicites(base44, periode: string) {
  const commandes = await base44.asServiceRole.entities.CommandeBoutique.list('-created_date', 200);
  const partnerCounts: Record<string, number> = {};

  for (const c of commandes) {
    const name = c.boutique_nom || c.boutique_id || 'Inconnu';
    partnerCounts[name] = (partnerCounts[name] || 0) + 1;
  }

  const sorted = Object.entries(partnerCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (sorted.length === 0) return null;

  const topPartners = sorted.slice(0, 5).map(([name, count]) => ({
    label: name,
    value: count as number,
  }));

  return {
    type_analyse: 'partenaires_sollicites',
    titre: 'Partenaires les plus sollicités',
    description: `Top 5 des partenaires: ${topPartners.map(p => `${p.label} (${p.value})`).join(', ')}`,
    valeur_principale: topPartners[0].label,
    valeur_numerique: topPartners[0].value,
    tendance: 'inconnu',
    periode,
    donnees_detaillees: JSON.stringify(topPartners),
    niveau_confiance: 80,
  };
}

// ─── Causes des réclamations ───
async function analyserCausesReclamations(base44, periode: string) {
  const tickets = await base44.asServiceRole.entities.TicketSupport.filter(
    { statut: 'ouvert' }
  );

  if (tickets.length === 0) return null;

  const causeCounts: Record<string, number> = {};
  for (const t of tickets) {
    const cause = t.categorie || t.sujet || 'Autre';
    causeCounts[cause] = (causeCounts[cause] || 0) + 1;
  }

  const sorted = Object.entries(causeCounts).sort((a, b) => Number(b[1]) - Number(a[1]));
  const topCauses = sorted.slice(0, 5).map(([cause, count]) => ({
    label: cause,
    value: count as number,
  }));

  return {
    type_analyse: 'causes_reclamations',
    titre: 'Causes principales des réclamations',
    description: `Les réclamations portent surtout sur: ${topCauses.map(c => c.label).join(', ')}`,
    valeur_principale: topCauses[0].label,
    valeur_numerique: topCauses[0].value,
    tendance: 'inconnu',
    periode,
    donnees_detaillees: JSON.stringify(topCauses),
    recommandations: JSON.stringify([{
      priorite: 'haute',
      titre: 'Traiter la cause principale des réclamations',
      description: `Mettre en place une procédure pour réduire les réclamations concernant "${topCauses[0].label}"`
    }]),
    niveau_confiance: 75,
  };
}

// ─── Taux d'annulation ───
async function analyserTauxAnnulation(base44, periode: string) {
  const courses = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 500);
  if (courses.length === 0) return null;

  const annulees = courses.filter(c => c.statut === 'annulee').length;
  const taux = Math.round((annulees / courses.length) * 100);

  return {
    type_analyse: 'taux_annulation',
    titre: 'Taux d\'annulation',
    description: `${annulees} courses annulées sur ${courses.length} (${taux}%)`,
    valeur_principale: `${taux}%`,
    valeur_numerique: taux,
    tendance: taux > 15 ? 'hausse' : taux < 5 ? 'baisse' : 'stable',
    periode,
    donnees_detaillees: JSON.stringify({ total: courses.length, annulees, taux }),
    recommandations: taux > 15 ? JSON.stringify([{
      priorite: 'critique',
      titre: 'Taux d\'annulation élevé',
      description: `Le taux d'annulation (${taux}%) est supérieur au seuil acceptable (15%). Analyser les causes.`
    }]) : '[]',
    niveau_confiance: 90,
  };
}

// ─── Taux de retard ───
async function analyserTauxRetard(base44, periode: string) {
  const courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: 'terminee' }
  );

  if (courses.length === 0) return null;

  let retards = 0;
  for (const c of courses) {
    if (c.date_prise_en_charge && c.date_livraison) {
      const duree = new Date(c.date_livraison).getTime() - new Date(c.date_prise_en_charge).getTime();
      if (duree > 45 * 60 * 1000) retards++;
    }
  }

  const taux = Math.round((retards / courses.length) * 100);

  return {
    type_analyse: 'taux_retard',
    titre: 'Taux de retard',
    description: `${retards} livraisons en retard sur ${courses.length} (${taux}%)`,
    valeur_principale: `${taux}%`,
    valeur_numerique: taux,
    tendance: taux > 20 ? 'hausse' : 'stable',
    periode,
    donnees_detaillees: JSON.stringify({ total: courses.length, retards, taux }),
    recommandations: taux > 20 ? JSON.stringify([{
      priorite: 'haute',
      titre: 'Taux de retard élevé',
      description: `Le taux de retard (${taux}%) nécessite une optimisation des temps de livraison.`
    }]) : '[]',
    niveau_confiance: 85,
  };
}

// ─── Volume de courses ───
async function analyserVolumeCourses(base44, periode: string) {
  const courses = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 500);

  return {
    type_analyse: 'volume_courses',
    titre: 'Volume de courses',
    description: `${courses.length} courses analysées sur la période`,
    valeur_principale: `${courses.length}`,
    valeur_numerique: courses.length,
    tendance: 'stable',
    periode,
    niveau_confiance: 95,
  };
}

// ─── Assistant Admin: Q&A ───
export async function answerAdminQuestion(base44, question: string) {
  // Récupérer les données métier pertinentes
  const courses = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 200);
  const livreurs = await base44.asServiceRole.entities.Livreur.list('-created_date', 100);
  const tickets = await base44.asServiceRole.entities.TicketSupport.list('-created_date', 50);
  const insights = await base44.asServiceRole.entities.VenusBusinessInsight.list('-created_date', 20);

  const dataContext = {
    nb_courses_total: courses.length,
    nb_courses_terminees: courses.filter(c => c.statut === 'terminee').length,
    nb_courses_annulees: courses.filter(c => c.statut === 'annulee').length,
    nb_livreurs: livreurs.length,
    nb_livreurs_en_ligne: livreurs.filter(l => l.statut === 'en_ligne').length,
    nb_tickets_ouverts: tickets.filter(t => t.statut === 'ouvert').length,
    insights_recents: insights.map(i => ({ titre: i.titre, valeur: i.valeur_principale, tendance: i.tendance })),
  };

  const llmResponse = await base44.integrations.Core.InvokeLLM({
    prompt: `Tu es VENUS, l'assistant IA de SILGAPP. Un administrateur te pose une question.
Réponds de manière claire, précise et professionnelle en te basant sur les données fournies.

Question: "${question}"

Données disponibles:
${JSON.stringify(dataContext, null, 2)}

Réponds avec:
1. Une réponse directe à la question
2. Des données chiffrées si pertinent
3. Une recommandation si approprié
4. La source des données utilisées

Si tu n'as pas assez de données, dis-le clairement.`,
    response_json_schema: {
      type: 'object',
      properties: {
        reponse: { type: 'string' },
        donnees_cles: { type: 'string' },
        recommandation: { type: 'string' },
        sources: { type: 'string' },
        niveau_confiance: { type: 'number' }
      }
    }
  });

  // Logger la décision
  await base44.asServiceRole.entities.VenusDecisionLog.create({
    agent: 'advisor',
    type_decision: 'admin_response',
    raisonnement: `Question admin: "${question}"`,
    donnees_utilisees: JSON.stringify(dataContext),
    contexte: JSON.stringify({ question }),
    niveau_confiance: llmResponse.niveau_confiance || 75,
    explication_simple: `VENUS a analysé les données métier pour répondre à la question: "${question}"`,
    date_creation: new Date().toISOString(),
  });

  return llmResponse;
}

// ─── Générer des recommandations ───
export async function generateRecommendations(base44) {
  const insights = await base44.asServiceRole.entities.VenusBusinessInsight.filter(
    { statut: 'actif' }
  );

  const recommendations: any[] = [];

  for (const insight of insights) {
    if (insight.recommandations) {
      const recs = JSON.parse(insight.recommandations);
      for (const rec of recs) {
        recommendations.push({
          ...rec,
          source_insight: insight.titre,
          insight_id: insight.id,
        });
      }
    }
  }

  // Utiliser le LLM pour prioriser et enrichir
  if (recommendations.length > 0) {
    const llmResponse = await base44.integrations.Core.InvokeLLM({
      prompt: `Tu es VENUS, le conseiller IA de SILGAPP. Voici des recommandations générées à partir des analyses métier.
Priorise-les et propose des actions concrètes.

Recommandations:
${JSON.stringify(recommendations, null, 2)}

Réponds en JSON avec un tableau de recommandations enrichies:
[{priorite, titre, description, action_concrete, source, impact_estime}]`,
      response_json_schema: {
        type: 'object',
        properties: {
          recommandations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                priorite: { type: 'string' },
                titre: { type: 'string' },
                description: { type: 'string' },
                action_concrete: { type: 'string' },
                source: { type: 'string' },
                impact_estime: { type: 'string' }
              }
            }
          }
        }
      }
    });

    return llmResponse.recommandations || recommendations;
  }

  return recommendations;
}

// ─── Mettre à jour la mémoire stratégique ───
export async function updateStrategicMemory(base44) {
  const now = new Date().toISOString();

  // Analyser les tendances de demande
  const courses = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 500);

  // Tendance: livraison programmée
  const programmées = courses.filter(c => c.type_course === 'programmee' || c.date_programmee);
  await updateOrCreateMemory(base44, 'tendance_demande', 'demande_livraison_programmee',
    `${programmées.length} courses programmées`, programmées.length, now);

  // Tendance: pharmacie
  const pharmacies = courses.filter(c => c.type_course === 'pharmacie');
  await updateOrCreateMemory(base44, 'tendance_demande', 'demande_pharmacie',
    `${pharmacies.length} courses pharmacie`, pharmacies.length, now);

  // Tendance: restaurant
  const restaurants = courses.filter(c => c.type_course === 'restaurant');
  await updateOrCreateMemory(base44, 'tendance_demande', 'demande_restaurant',
    `${restaurants.length} courses restaurant`, restaurants.length, now);

  // Tendance: boutique
  const boutiques = courses.filter(c => c.type_course === 'boutique');
  await updateOrCreateMemory(base44, 'tendance_demande', 'demande_boutique',
    `${boutiques.length} courses boutique`, boutiques.length, now);

  // Heures de pointe
  const heureCounts: Record<number, number> = {};
  for (const c of courses) {
    if (c.created_date) {
      const h = new Date(c.created_date).getHours();
      heureCounts[h] = (heureCounts[h] || 0) + 1;
    }
  }
  const topHeure = Object.entries(heureCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  if (topHeure) {
    await updateOrCreateMemory(base44, 'heure_pointe', 'heure_pointe_principale',
      `${topHeure[0]}h-${Number(topHeure[0]) + 1}h`, Number(topHeure[0]), now);
  }

  // Taux d'annulation
  const tauxAnnulation = courses.length > 0
    ? Math.round((courses.filter(c => c.statut === 'annulee').length / courses.length) * 100)
    : 0;
  await updateOrCreateMemory(base44, 'performance_globale', 'taux_annulation_global',
    `${tauxAnnulation}%`, tauxAnnulation, now);
}

async function updateOrCreateMemory(base44, categorie: string, cle: string, valeur: string, valeurNum: number, now: string) {
  const existing = await base44.asServiceRole.entities.VenusStrategicMemory.filter({ cle });
  if (existing.length > 0) {
    const prev = existing[0].valeur_numerique || 0;
    const trendPct = prev > 0 ? Math.round(((valeurNum - prev) / prev) * 100) : 0;
    await base44.asServiceRole.entities.VenusStrategicMemory.update(existing[0].id, {
      valeur,
      valeur_numerique: valeurNum,
      valeur_precedente: prev,
      tendance_pct: trendPct,
      tendance_direction: trendPct > 5 ? 'hausse' : trendPct < -5 ? 'baisse' : 'stable',
      date_maj: now,
    });
  } else {
    await base44.asServiceRole.entities.VenusStrategicMemory.create({
      categorie,
      cle,
      valeur,
      valeur_numerique: valeurNum,
      tendance_direction: 'stable',
      periode_analyse: 'mois',
      date_creation: now,
      date_maj: now,
    });
  }
}