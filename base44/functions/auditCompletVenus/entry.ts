/**
 * ═══════════════════════════════════════════════════════════════════
 * AUDIT COMPLET VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Réalise un audit complet de VENUS avec MINIMISATION des crédits :
 *
 * Phase 1 (0 crédit)  : Audit statique — knowledge, scenarios, rules, RAG
 * Phase 2 (1 appel)   : Génère 500+ questions réalistes en UN SEUL appel LLM
 * Phase 3 (0 crédit)  : Test de couverture heuristique — match chaque question
 *                        contre knowledge/rules/scenarios existants
 * Phase 4 (limité)    : Test live d'un échantillon (~50 questions) via le moteur
 * Phase 5 (limité)    : Auto-correction — crée les knowledge manquantes
 * Phase 6 (1 appel)   : Rapport final
 *
 * Actions :
 * - static_audit     : Phase 1 seule
 * - generate_questions: Phase 2 seule
 * - test_coverage    : Phase 3 (utilise les questions générées en Phase 2)
 * - test_sample      : Phase 4 — test live d'un échantillon
 * - auto_correct     : Phase 5 — crée les knowledge manquantes
 * - full_audit       : Toutes les phases en séquence
 * - get_report       : Rapport final
 * ═══════════════════════════════════════════════════════════════════
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { raisonnerVenus } from '../../shared/venusReasoningEngine.ts';
import { BANQUE_QUESTIONS } from '../../shared/venusAuditQuestions.ts';

// Catégories dérivées dynamiquement de la banque de questions
const CATEGORIES_TEST = [...new Set(BANQUE_QUESTIONS.map(q => q.categorie))].map(code => ({
  code,
  label: code.replace(/_/g, ' '),
  nb: BANQUE_QUESTIONS.filter(q => q.categorie === code).length,
}));

// ═══════════════════════════════════════════════════════════════════
// UTILITAIRES DE MATCHING HEURISTIQUE (0 crédit)
// ═══════════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'mais', 'donc',
  'or', 'ni', 'car', 'que', 'qui', 'quoi', 'dont', 'où', 'je', 'tu', 'il', 'elle',
  'nous', 'vous', 'ils', 'elles', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son',
  'sa', 'ses', 'ce', 'cette', 'ces', 'est', 'sont', 'etre', 'avoir', 'pour',
  'par', 'avec', 'sans', 'dans', 'sur', 'sous', 'vers', 'chez', 'entre', 'apres',
  'avant', 'pendant', 'comme', 'si', 'plus', 'moins', 'tres', 'trop', 'aussi',
  'encore', 'deja', 'pas', 'ne', 'ni', 'tout', 'tous', 'toute', 'toutes', 'rien',
  'bien', 'aussi', 'peut', 'puis', 'fait', 'cela', 'ca', 'a', 'au', 'aux', 'se',
  'me', 'te', 'lui', 'leur', 'y', 'en', 'sur', 'met', 'suis', 'es', 'ete',
]);

function normaliserTexte(texte: string): string {
  return (texte || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extraireMotsCles(texte: string): string[] {
  const normalise = normaliserTexte(texte);
  return normalise
    .split(' ')
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function calculerScoreMatching(question: string, reference: string, refMotsCles?: string[]): number {
  const qMots = extraireMotsCles(question);
  if (qMots.length === 0) return 0;

  const refNormalisee = normaliserTexte(reference);
  let score = 0;
  let matches = 0;

  for (const mot of qMots) {
    if (refNormalisee.includes(mot)) {
      matches++;
    }
  }

  // Score basé sur le pourcentage de mots de la question trouvés
  score = (matches / qMots.length) * 100;

  // Bonus si les mots apparaissent dans les mots-clés explicites
  if (refMotsCles) {
    const refKwSet = new Set((refMotsCles || []).map(k => normaliserTexte(k)));
    let kwMatches = 0;
    for (const mot of qMots) {
      if (refKwSet.has(mot)) kwMatches++;
    }
    score = Math.max(score, (kwMatches / qMots.length) * 100 + 20);
  }

  return Math.min(100, Math.round(score));
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 1 : AUDIT STATIQUE (0 crédit)
// ═══════════════════════════════════════════════════════════════════

async function auditStatique(base44: any): Promise<any> {
  const [knowledge, scenarios, rules, intents, workflows, docs] = await Promise.all([
    base44.asServiceRole.entities.VenusKnowledge.list('-updated_date', 500),
    base44.asServiceRole.entities.VenusScenario.list('-updated_date', 500),
    base44.asServiceRole.entities.VenusBusinessRule.list('-updated_date', 500),
    base44.asServiceRole.entities.VenusIntent.list('-created_date', 200),
    base44.asServiceRole.entities.VenusWorkflow.list('-created_date', 200),
    base44.asServiceRole.entities.VenusDocument.filter({ statut: 'valide' }, '-created_date', 200),
  ]);

  // ── Doublons dans knowledge ──
  const kByTitle: Record<string, any[]> = {};
  knowledge.forEach((k: any) => {
    const key = normaliserTexte(k.titre || '');
    if (!kByTitle[key]) kByTitle[key] = [];
    kByTitle[key].push({ id: k.id, titre: k.titre, statut: k.statut });
  });
  const doublons = Object.entries(kByTitle).filter(([_, items]) => items.length > 1);

  // ── Knowledge non indexée en RAG ──
  const kNonIndexee = knowledge
    .filter((k: any) => k.statut === 'valide' && !k.rag_indexe)
    .map((k: any) => ({ id: k.id, titre: k.titre, rag_erreur: k.rag_erreur || '' }));

  // ── Scenarios non indexés en RAG ──
  const sNonIndexes = scenarios
    .filter((s: any) => s.statut === 'valide' && !s.rag_indexe)
    .map((s: any) => ({ id: s.id, nom: s.nom, rag_erreur: s.rag_erreur || '' }));

  // ── Knowledge incomplète ──
  const incomplets = knowledge
    .filter((k: any) => k.statut === 'valide' && (!k.reponse_officielle || k.reponse_officielle.length < 50))
    .map((k: any) => ({ id: k.id, titre: k.titre, longueur: k.reponse_officielle?.length || 0 }));

  // ── Règles sans reponse_associee ──
  const reglesIncompletes = rules
    .filter((r: any) => (r.statut === 'valide' || r.statut === 'active') && !r.reponse_associee)
    .map((r: any) => ({ id: r.id, nom: r.nom }));

  // ── Catégories manquantes ──
  const allCategories = [
    'cas_livraison', 'cas_expedition', 'cas_client', 'cas_livreur', 'cas_boutique',
    'cas_restaurant', 'cas_pharmacie', 'procedures', 'faq', 'tarifs',
    'expedition_colis', 'reception_colis', 'suivi_colis', 'gps', 'prix_manuel',
    'prix_automatique', 'annulation_course', 'paiement', 'remboursement',
    'compte_client', 'compte_livreur', 'inscription', 'notifications',
    'publicites', 'probleme_technique', 'comptabilite', 'livraison_urgente',
    'devenir_livreur', 'questions_generales', 'autres',
  ];
  const coveredCats = new Set(knowledge.map((k: any) => k.categorie).filter(Boolean));
  const missingCats = allCategories.filter(c => !coveredCats.has(c));

  return {
    timestamp: new Date().toISOString(),
    resume: {
      knowledge_total: knowledge.length,
      knowledge_valide: knowledge.filter((k: any) => k.statut === 'valide').length,
      knowledge_rag_indexe: knowledge.filter((k: any) => k.rag_indexe).length,
      knowledge_non_indexee: kNonIndexee.length,
      scenarios_total: scenarios.length,
      scenarios_valide: scenarios.filter((s: any) => s.statut === 'valide').length,
      scenarios_rag_indexe: scenarios.filter((s: any) => s.rag_indexe).length,
      scenarios_non_indexes: sNonIndexes.length,
      rules_total: rules.length,
      rules_valide: rules.filter((r: any) => r.statut === 'valide' || r.statut === 'active').length,
      intents_count: intents.length,
      workflows_count: workflows.length,
      rag_documents: docs.length,
    },
    problemes: {
      doublons_count: doublons.length,
      doublons: doublons.slice(0, 10),
      knowledge_non_indexee: kNonIndexee.slice(0, 50),
      scenarios_non_indexes: sNonIndexes.slice(0, 30),
      knowledge_incomplets: incomplets,
      regles_incompletes: reglesIncompletes,
      categories_manquantes: missingCats,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2 : BANQUE DE QUESTIONS STATIQUE (0 crédit LLM)
// ═══════════════════════════════════════════════════════════════════
// 500+ questions pré-écrites, formulées naturellement, couvrant tous
// les domaines de SILGAPP. Aucun appel LLM nécessaire.

async function genererQuestions(_base44: any): Promise<any[]> {
  return BANQUE_QUESTIONS;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 3 : TEST DE COUVERTURE HEURISTIQUE (0 crédit)
// ═══════════════════════════════════════════════════════════════════

async function testerCouverture(base44: any, questions: any[]): Promise<any> {
  // Charger toutes les sources de connaissance
  const [knowledge, scenarios, rules] = await Promise.all([
    base44.asServiceRole.entities.VenusKnowledge.filter({ statut: 'valide' }, '-updated_date', 500),
    base44.asServiceRole.entities.VenusScenario.filter({ statut: 'valide' }, '-updated_date', 500),
    base44.asServiceRole.entities.VenusBusinessRule.filter({ statut: 'valide' }, '-updated_date', 500),
  ]);

  // Pré-calculer les mots-clés pour chaque source
  const kIndex = knowledge.map((k: any) => ({
    id: k.id,
    titre: k.titre,
    texte: `${k.titre} ${k.question || ''} ${k.reponse_officielle || ''} ${k.mots_cles || ''}`,
    mots_cles: k.mots_cles ? (() => { try { return JSON.parse(k.mots_cles); } catch { return []; } })() : [],
    type: 'knowledge',
  }));

  const sIndex = scenarios.map((s: any) => ({
    id: s.id,
    titre: s.nom,
    texte: `${s.nom} ${s.description || ''} ${s.declencheurs || ''} ${s.reponse_ideale || ''}`,
    mots_cles: s.declencheurs ? (() => { try { return JSON.parse(s.declencheurs); } catch { return []; } })() : [],
    type: 'scenario',
  }));

  const rIndex = rules.map((r: any) => ({
    id: r.id,
    titre: r.nom,
    texte: `${r.nom} ${r.description || ''} ${r.reponse_associee || ''} ${r.exemples || ''}`,
    mots_cles: r.exemples ? (() => { try { return JSON.parse(r.exemples); } catch { return []; } })() : [],
    type: 'rule',
  }));

  const allSources = [...kIndex, ...sIndex, ...rIndex];

  // ── Tester chaque question ──
  const resultats = questions.map((q: any) => {
    let meilleurMatch: any = null;
    let meilleurScore = 0;
    let sourceType = '';

    for (const src of allSources) {
      const score = calculerScoreMatching(q.question, src.texte, src.mots_cles);
      if (score > meilleurScore) {
        meilleurScore = score;
        meilleurMatch = src;
        sourceType = src.type;
      }
    }

    // Seuil de couverture: 40% = couvert (au moins partiellement)
    const couvert = meilleurScore >= 40;
    const bienCouvert = meilleurScore >= 60;

    return {
      question: q.question,
      categorie: q.categorie,
      profil: q.profil,
      reponse_attendue: q.reponse_attendue,
      utilise_rag: q.utilise_rag,
      couvert,
      bien_couvert: bienCouvert,
      score_matching: meilleurScore,
      source_type: sourceType,
      source_id: meilleurMatch?.id || '',
      source_titre: meilleurMatch?.titre || '',
    };
  });

  // ── Statistiques ──
  const parCategorie: Record<string, any> = {};
  for (const r of resultats) {
    if (!parCategorie[r.categorie]) {
      parCategorie[r.categorie] = { total: 0, couvert: 0, bien_couvert: 0, non_couvert: 0 };
    }
    parCategorie[r.categorie].total++;
    if (r.bien_couvert) parCategorie[r.categorie].bien_couvert++;
    else if (r.couvert) parCategorie[r.categorie].couvert++;
    else parCategorie[r.categorie].non_couvert++;
  }

  const nonCouverts = resultats.filter(r => !r.couvert);
  const partiellementCouverts = resultats.filter(r => r.couvert && !r.bien_couvert);

  return {
    total_questions: resultats.length,
    bien_couverts: resultats.filter(r => r.bien_couvert).length,
    partiellement_couverts: partiellementCouverts.length,
    non_couverts: nonCouverts.length,
    taux_couverture: Math.round((resultats.filter(r => r.couvert).length / resultats.length) * 100),
    taux_couverture_forte: Math.round((resultats.filter(r => r.bien_couvert).length / resultats.length) * 100),
    par_categorie: parCategorie,
    questions_non_couvertes: nonCouverts.slice(0, 100),
    questions_partiellement_couvertes: partiellementCouverts.slice(0, 50),
  };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 4 : TEST LIVE D'UN ÉCHANTILLON (crédits limités)
// ═══════════════════════════════════════════════════════════════════

async function testerEchantillon(base44: any, questions: any[], taille: number): Promise<any> {
  // Sélectionner un échantillon représentatif
  // Priorité: 50% non couvertes, 30% partiellement couvertes, 20% bien couvertes
  // Mais on n'a pas les résultats de couverture ici, donc on prend un échantillon aléatoire stratifié
  const parCat: Record<string, any[]> = {};
  questions.forEach(q => {
    if (!parCat[q.categorie]) parCat[q.categorie] = [];
    parCat[q.categorie].push(q);
  });

  const echantillon: any[] = [];
  const parCatArrondi = Math.ceil(taille / Object.keys(parCat).length);
  for (const [cat, qs] of Object.entries(parCat)) {
    const nb = Math.min(parCatArrondi, qs.length);
    // Prendre les premiers de chaque catégorie (déjà variés)
    echantillon.push(...qs.slice(0, nb));
  }

  const echantillonFinal = echantillon.slice(0, taille);
  const resultats: any[] = [];
  let llmCalls = 0;

  // Charger les tarifs pour le pays de test (BF)
  let tarifs: any = { minimum: 500, par_km: 100, devise: 'FCFA' };
  try {
    const country = await base44.asServiceRole.entities.Country.filter({ code: 'BF' });
    if (country && country.length > 0) {
      tarifs = {
        minimum: country[0].prix_minimum || 500,
        par_km: country[0].prix_par_km || 100,
        devise: country[0].devise_symbole || 'FCFA',
      };
    }
  } catch {}

  for (const q of echantillonFinal) {
    try {
      const startTime = Date.now();
      const tel = '+22670000000';

      // Appeler le moteur de raisonnement directement (pas via WhatsApp)
      const result = await raisonnerVenus(base44, {
        messageClient: q.question,
        memoireCourte: {},
        memoireLongue: null,
        historiqueRecent: [],
        courseActive: null,
        countryCode: 'BF',
        tarifs,
        telephone: tel,
        profileName: `Test_${q.profil}`,
        isAudioTranscription: false,
      });

      const tempsMs = Date.now() - startTime;
      const reponse = result?.reponse || '';
      const outils = result?.outils_utilises || [];
      const aUtiliseLLM = !outils.includes('security_check:blocked') &&
                          !outils.includes('salutation_shortcut') &&
                          !outils.includes('cache_hit') &&
                          !outils.includes('business_rule_direct') &&
                          !outils.includes('knowledge_direct');
      const aUtiliseRAG = outils.some((o: any) => typeof o === 'string' && o.includes('rag')) ||
                          outils.some((o: any) => typeof o === 'string' && o.includes('document'));

      if (aUtiliseLLM) llmCalls++;

      // Évaluation heuristique de la réponse
      const erreurs: string[] = [];
      const reponseLC = reponse.toLowerCase();

      // Vérifier que la réponse n'est pas vide
      if (!reponse || reponse.length < 10) {
        erreurs.push('Réponse vide ou trop courte');
      }

      // Vérifier qu'elle ne contient pas de prix inventé pour les salutations
      if (q.categorie === 'salutations' && reponseLC.match(/\d+\s*(fcfa|f cfa|franc)/)) {
        erreurs.push('Prix mentionné dans une salutation');
      }

      // Vérifier la longueur raisonnable
      if (reponse.length > 500) {
        erreurs.push('Réponse trop longue (>500 caractères)');
      }

      // Vérifier la pertinence (mots-clés de la question dans la réponse)
      const qMots = extraireMotsCles(q.question).filter(w => w.length > 4);
      if (qMots.length > 0) {
        const reponseNorm = normaliserTexte(reponse);
        const pertinence = qMots.filter(w => reponseNorm.includes(w)).length / qMots.length;
        if (pertinence < 0.1 && q.categorie !== 'salutations') {
          erreurs.push('Réponse potentiellement non pertinente');
        }
      }

      resultats.push({
        question: q.question,
        categorie: q.categorie,
        profil: q.profil,
        reponse: reponse.substring(0, 300),
        reponse_attendue: q.reponse_attendue,
        temps_ms: tempsMs,
        a_utilise_llm: aUtiliseLLM,
        a_utilise_rag: aUtiliseRAG,
        outils: outils.map((o: any) => o?.outil || String(o)),
        erreurs,
        statut: erreurs.length === 0 ? 'succes' : 'probleme',
      });
    } catch (e: any) {
      resultats.push({
        question: q.question,
        categorie: q.categorie,
        profil: q.profil,
        reponse: '',
        erreurs: [`Erreur: ${e.message}`],
        statut: 'echec',
      });
    }
  }

  return {
    taille_echantillon: echantillonFinal.length,
    succes: resultats.filter(r => r.statut === 'succes').length,
    problemes: resultats.filter(r => r.statut === 'probleme').length,
    echecs: resultats.filter(r => r.statut === 'echec').length,
    llm_calls: llmCalls,
    llm_economises: echantillonFinal.length - llmCalls,
    taux_reussite: Math.round((resultats.filter(r => r.statut === 'succes').length / echantillonFinal.length) * 100),
    temps_moyen_ms: Math.round(resultats.reduce((s, r) => s + (r.temps_ms || 0), 0) / resultats.length),
    details: resultats,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 5 : AUTO-CORRECTION (crédits limités)
// ═══════════════════════════════════════════════════════════════════

async function autoCorriger(base44: any, questionsNonCouvertes: any[]): Promise<any> {
  if (!questionsNonCouvertes || questionsNonCouvertes.length === 0) {
    return { creees: 0, message: 'Aucune lacune à corriger' };
  }

  // Grouper par catégorie
  const parCat: Record<string, any[]> = {};
  questionsNonCouvertes.forEach(q => {
    if (!parCat[q.categorie]) parCat[q.categorie] = [];
    parCat[q.categorie].push(q);
  });

  // Pour chaque catégorie, générer une knowledge entry synthétisant les questions non couvertes
  // en UN SEUL appel LLM par catégorie (max 5 catégories pour limiter les coûts)
  const categoriesPrioritaires = Object.entries(parCat)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8);

  let knowledgeCrees = 0;
  const categoriesCreees: string[] = [];

  for (const [cat, qs] of categoriesPrioritaires) {
    const questionsStr = qs.slice(0, 15).map((q, i) => `${i + 1}. ${q.question}`).join('\n');

    try {
      const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Tu es un expert SILGAPP. Voici ${qs.length} questions de clients non couvertes par la base de connaissances actuelle, dans la catégorie "${cat}".

Questions non couvertes:
${questionsStr}

Génère UNE entrée de connaissance unique qui couvre TOUTES ces questions. Format:
- titre: court et descriptif
- question: question synthétique représentative
- reponse_officielle: réponse complète et accurate (min 200 caractères) qui répond à toutes les variantes
- mots_cles: 10-15 mots-clés pertinents (array)
- sous_categorie: sous-catégorie précise

IMPORTANT: La réponse doit être factuelle, polie, et ne JAMAIS inventer de prix ou de délais spécifiques non confirmés. Si tu ne connais pas un prix exact, dis "contactez-nous pour le tarif exact".

Connais le contexte SILGAPP: plateforme de livraison au Burkina Faso et Côte d'Ivoire. Courses, expédition de colis, pharmacies, restaurants, boutiques. Devise: FCFA. WhatsApp pour le support.`,

        model: 'gpt_5_mini',
        response_json_schema: {
          type: 'object',
          properties: {
            titre: { type: 'string' },
            question: { type: 'string' },
            reponse_officielle: { type: 'string' },
            mots_cles: { type: 'array', items: { type: 'string' } },
            sous_categorie: { type: 'string' },
          },
          required: ['titre', 'question', 'reponse_officielle', 'mots_cles'],
        },
      });

      const kData: any = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;

      // Mapper la catégorie de test vers une catégorie VenusKnowledge
      const catMap: Record<string, string> = {
        creation_commande: 'cas_livraison',
        suivi_commande: 'suivi_colis',
        annulation: 'annulation_course',
        tarifs: 'tarifs',
        paiement: 'paiement',
        qr_code_pin: 'qr_code',
        pharmacie: 'cas_pharmacie',
        restaurant: 'cas_restaurant',
        boutique: 'cas_boutique',
        livreurs: 'cas_livreur',
        partenaires: 'cas_boutique',
        comptes_utilisateurs: 'compte_client',
        connexion_problemes: 'probleme_technique',
        promotions: 'publicites',
        whatsapp: 'notifications',
        gps: 'gps',
        livraison_programmee: 'cas_livraison',
        reclamations: 'reclamation',
        objets_perdus: 'procedures',
        expedition_colis: 'expedition_colis',
        salutations: 'questions_generales',
        securite: 'autres',
      };

      await base44.asServiceRole.entities.VenusKnowledge.create({
        titre: kData.titre,
        question: kData.question,
        reponse_officielle: kData.reponse_officielle,
        mots_cles: JSON.stringify(kData.mots_cles || []),
        categorie: catMap[cat] || 'questions_generales',
        sous_categorie: kData.sous_categorie || cat,
        pays: 'ALL',
        langue: 'fr',
        priorite: 'normale',
        statut: 'valide',
        auteur: 'audit_auto',
        version: 1,
        rag_indexe: false,
        date_publication: new Date().toISOString(),
      });

      knowledgeCrees++;
      categoriesCreees.push(cat);
    } catch (e: any) {
      console.error(`[autoCorriger] Erreur catégorie ${cat}:`, e.message);
    }
  }

  return {
    knowledge_crees: knowledgeCrees,
    categories_creees: categoriesCreees,
    categories_analysees: categoriesPrioritaires.length,
  };
}

// ═══════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'full_audit';
    console.log('[auditCompletVenus] Handler v2 — module reasoning engine mis à jour (sans response_json_schema)');

    // ── Phase 1 : Audit statique ──
    if (action === 'static_audit') {
      const result = await auditStatique(base44);
      return Response.json({ success: true, phase: 'static_audit', ...result });
    }

    // ── Phase 2 : Génération de questions ──
    if (action === 'generate_questions') {
      const questions = await genererQuestions(base44);
      return Response.json({
        success: true,
        phase: 'generate_questions',
        total_questions: questions.length,
        questions,
      });
    }

    // ── Phase 3 : Test de couverture ──
    if (action === 'test_coverage') {
      let questions = body.questions;
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        console.log('[audit] Pas de questions fournies, génération en cours...');
        questions = await genererQuestions(base44);
      }
      const result = await testerCouverture(base44, questions);
      return Response.json({ success: true, phase: 'test_coverage', ...result });
    }

    // ── Phase 4 : Test live d'un échantillon ──
    if (action === 'test_sample') {
      let questions = body.questions;
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        questions = await genererQuestions(base44);
      }
      const taille = body.taille_echantillon || 50;
      const result = await testerEchantillon(base44, questions, taille);
      return Response.json({ success: true, phase: 'test_sample', ...result });
    }

    // ── Phase 5 : Auto-correction ──
    if (action === 'auto_correct') {
      const result = await autoCorriger(base44, body.questions_non_couvertes || []);
      return Response.json({ success: true, phase: 'auto_correct', ...result });
    }

    // ── FULL AUDIT : Toutes les phases ──
    if (action === 'full_audit') {
      console.log('[auditCompletVenus] ═══ DÉBUT AUDIT COMPLET ═══');

      // Phase 1
      console.log('[auditCompletVenus] Phase 1: Audit statique...');
      const statique = await auditStatique(base44);

      // Phase 2
      console.log('[auditCompletVenus] Phase 2: Génération des questions...');
      const questions = await genererQuestions(base44);
      console.log(`[auditCompletVenus] ✅ ${questions.length} questions générées`);

      // Phase 3
      console.log('[auditCompletVenus] Phase 3: Test de couverture heuristique...');
      const couverture = await testerCouverture(base44, questions);
      console.log(`[auditCompletVenus] ✅ Taux de couverture: ${couverture.taux_couverture}%`);

      // Phase 4 (échantillon réduit pour limiter les crédits)
      console.log('[auditCompletVenus] Phase 4: Test live d\'un échantillon...');
      const tailleEchantillon = body.taille_echantillon || 30;
      const echantillon = await testerEchantillon(base44, questions, tailleEchantillon);
      console.log(`[auditCompletVenus] ✅ Taux de réussite échantillon: ${echantillon.taux_reussite}%`);

      // Phase 5 (auto-correction pour les questions non couvertes)
      console.log('[auditCompletVenus] Phase 5: Auto-correction...');
      const corrections = await autoCorriger(base44, couverture.questions_non_couvertes);
      console.log(`[auditCompletVenus] ✅ ${corrections.knowledge_crees} knowledge créées`);

      // ── Rapport final ──
      const rapport = {
        timestamp: new Date().toISOString(),
        phase_1_statique: statique,
        phase_2_questions: {
          total_generees: questions.length,
          par_categorie: CATEGORIES_TEST.map(c => ({
            code: c.code,
            label: c.label,
            nb_attendu: c.nb,
            nb_obtenu: questions.filter((q: any) => q.categorie === c.code).length,
          })),
        },
        phase_3_couverture: {
          total_questions: couverture.total_questions,
          bien_couverts: couverture.bien_couverts,
          partiellement_couverts: couverture.partiellement_couverts,
          non_couverts: couverture.non_couverts,
          taux_couverture: couverture.taux_couverture,
          taux_couverture_forte: couverture.taux_couverture_forte,
          par_categorie: couverture.par_categorie,
        },
        phase_4_echantillon: {
          taille: echantillon.taille_echantillon,
          succes: echantillon.succes,
          problemes: echantillon.problemes,
          echecs: echantillon.echecs,
          taux_reussite: echantillon.taux_reussite,
          llm_calls: echantillon.llm_calls,
          llm_economises: echantillon.llm_economises,
          temps_moyen_ms: echantillon.temps_moyen_ms,
          reponses_problematiques: echantillon.details.filter((d: any) => d.statut !== 'succes').slice(0, 20),
        },
        phase_5_corrections: corrections,
        resume_executif: {
          total_tests: questions.length,
          taux_couverture: couverture.taux_couverture,
          taux_reussite_echantillon: echantillon.taux_reussite,
          llm_calls_total: 1 + echantillon.llm_calls + corrections.knowledge_crees,
          llm_economises: questions.length - echantillon.llm_calls,
          knowledge_crees: corrections.knowledge_crees,
          problemes_critiques: [
            ...(statique.problemes.knowledge_non_indexee.length > 0
              ? [`${statique.problemes.knowledge_non_indexee.length} knowledge non indexées en RAG`] : []),
            ...(statique.problemes.doublons_count > 0
              ? [`${statique.problemes.doublons_count} doublons détectés`] : []),
            ...(couverture.non_couverts > 50
              ? [`${couverture.non_couverts} questions non couvertes par la base actuelle`] : []),
          ],
          recommandations: [],
        },
      };

      // Recommandations
      if (statique.problemes.knowledge_non_indexee.length > 0) {
        rapport.resume_executif.recommandations.push({
          priorite: 'critique',
          titre: 'Indexer les knowledge en RAG',
          description: `${statique.problemes.knowledge_non_indexee.length} entrées de connaissance valides ne sont pas indexées dans le RAG. Lancer la réindexation.`,
        });
      }
      if (statique.problemes.doublons_count > 0) {
        rapport.resume_executif.recommandations.push({
          priorite: 'haute',
          titre: 'Fusionner les doublons',
          description: `${statique.problemes.doublons_count} doublons détectés dans la base de connaissances.`,
        });
      }
      if (couverture.non_couverts > 0) {
        rapport.resume_executif.recommandations.push({
          priorite: 'haute',
          titre: 'Combler les lacunes de couverture',
          description: `${couverture.non_couverts} questions n'ont aucune correspondance dans la base actuelle. ${corrections.knowledge_crees} entrées ont été créées automatiquement.`,
        });
      }
      if (echantillon.taux_reussite < 95) {
        rapport.resume_executif.recommandations.push({
          priorite: 'haute',
          titre: 'Améliorer la qualité des réponses',
          description: `Taux de réussite: ${echantillon.taux_reussite}% (objectif: 95%). ${echantillon.problemes} réponses problématiques détectées.`,
        });
      }

      console.log('[auditCompletVenus] ═══ AUDIT TERMINÉ ═══');

      return Response.json({
        success: true,
        rapport,
      });
    }

    return Response.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (error) {
    console.error('[auditCompletVenus] Erreur:', error.message);
    return Response.json({ error: error.message, stack: error.stack?.substring(0, 500) }, { status: 500 });
  }
});