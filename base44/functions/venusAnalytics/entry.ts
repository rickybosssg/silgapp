import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CATEGORIES = [
  "tarifs", "expedition_colis", "reception_colis", "suivi_colis", "gps",
  "prix_manuel", "prix_automatique", "annulation_course", "paiement",
  "remboursement", "compte_client", "compte_livreur", "inscription",
  "notifications", "publicites", "probleme_technique", "comptabilite",
  "livraison_urgente", "devenir_livreur", "questions_generales", "autres"
];

const CATEGORIE_LABELS = {
  tarifs: "Tarifs",
  expedition_colis: "Expédition de colis",
  reception_colis: "Réception de colis",
  suivi_colis: "Suivi de colis",
  gps: "GPS",
  prix_manuel: "Prix manuel",
  prix_automatique: "Prix automatique",
  annulation_course: "Annulation de course",
  paiement: "Paiement",
  remboursement: "Remboursement",
  compte_client: "Compte client",
  compte_livreur: "Compte livreur",
  inscription: "Inscription",
  notifications: "Notifications",
  publicites: "Publicités",
  probleme_technique: "Problème technique",
  comptabilite: "Comptabilité",
  livraison_urgente: "Livraison urgente",
  devenir_livreur: "Devenir livreur",
  questions_generales: "Questions générales",
  autres: "Autres"
};

function classifyQuestion(question) {
  const q = (question || "").toLowerCase();
  if (q.match(/prix|tarif|co[uû]te|coût|combien|fa/)) return "tarifs";
  if (q.match(/envoyer|expédier|expédition|exp[eé]dier|envoie/)) return "expedition_colis";
  if (q.match(/recevoir|réception|destinataire/)) return "reception_colis";
  if (q.match(/suivre|suivi|où est|localiser|tracking|o[uù] est/)) return "suivi_colis";
  if (q.match(/gps|position|géolocation|localisation/)) return "gps";
  if (q.match(/prix manuel|manuel|négoc/)) return "prix_manuel";
  if (q.match(/prix automatique|automatique/)) return "prix_automatique";
  if (q.match(/annuler|annulation|annulé/)) return "annulation_course";
  if (q.match(/payer|paiement|paye|payé|mobile money|orange money/)) return "paiement";
  if (q.match(/remboursement|rembourser/)) return "remboursement";
  if (q.match(/compte client|profil client|inscription client/)) return "compte_client";
  if (q.match(/compte livreur|profil livreur/)) return "compte_livreur";
  if (q.match(/inscrire|inscription|s'inscrire|enregistrer|créer un compte/)) return "inscription";
  if (q.match(/notification|alerte/)) return "notifications";
  if (q.match(/publicité|pub|annonce/)) return "publicites";
  if (q.match(/bug|probl[eè]me|erreur|ne fonctionne|plantage|crash/)) return "probleme_technique";
  if (q.match(/comptabilité|recette|bilan|finance|argent/)) return "comptabilite";
  if (q.match(/urgent|rapidement|vite/)) return "livraison_urgente";
  if (q.match(/devenir livreur|rejoindre|m'inscrire comme livreur/)) return "devenir_livreur";
  return "questions_generales";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { action, country_code, periode, top_n } = body;

    if (action === 'classify') {
      // Classifier une question
      const { question } = body;
      const categorie = classifyQuestion(question);
      return Response.json({ categorie, label: CATEGORIE_LABELS[categorie] });
    }

    if (action === 'save_interaction') {
      const { conversation_id, user_id, user_type, question, reponse, nb_messages, duree_secondes, ville } = body;
      const categorie = classifyQuestion(question);
      const date_conversation = new Date().toISOString().split('T')[0];

      // Détection statut : si la question contient des mots d'insatisfaction
      let statut = 'resolu';
      const q = (question || "").toLowerCase();
      if (q.match(/ne comprends pas|je ne sais pas|aide|comment|pourquoi|problème|bug/)) {
        statut = 'non_resolu';
      }

      await base44.asServiceRole.entities.VenusInteraction.create({
        conversation_id,
        user_id,
        user_type: user_type || 'client',
        country_code: country_code || 'BF',
        ville: ville || '',
        question,
        reponse: (reponse || '').substring(0, 500),
        categorie,
        statut,
        nb_messages: nb_messages || 1,
        duree_secondes: duree_secondes || 0,
        date_conversation,
      });
      return Response.json({ success: true, categorie });
    }

    if (action === 'get_stats') {
      // Récupérer toutes les interactions selon le pays
      let interactions = await base44.asServiceRole.entities.VenusInteraction.list('-created_date', 500);

      if (country_code && country_code !== 'ALL') {
        interactions = interactions.filter(i => i.country_code === country_code);
      }

      // Filtrer par période si demandé
      if (periode === 'today') {
        const today = new Date().toISOString().split('T')[0];
        interactions = interactions.filter(i => i.date_conversation === today);
      } else if (periode === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        interactions = interactions.filter(i => i.date_conversation >= weekAgo);
      } else if (periode === 'month') {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        interactions = interactions.filter(i => i.date_conversation >= monthAgo);
      }

      // Stats générales
      const total_questions = interactions.length;
      const conversations_uniques = new Set(interactions.map(i => i.conversation_id)).size;
      const clients_uniques = new Set(interactions.filter(i => i.user_type === 'client').map(i => i.user_id)).size;
      const livreurs_uniques = new Set(interactions.filter(i => i.user_type === 'livreur').map(i => i.user_id)).size;
      const resolues = interactions.filter(i => i.statut === 'resolu').length;
      const non_resolues = interactions.filter(i => i.statut === 'non_resolu').length;
      const escalades = interactions.filter(i => i.statut === 'escalade').length;

      // Top questions
      const questionCounts = {};
      interactions.forEach(i => {
        const q = i.question || '';
        const key = q.substring(0, 100);
        questionCounts[key] = (questionCounts[key] || 0) + 1;
      });
      const top_questions = Object.entries(questionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, top_n || 10)
        .map(([q, count]) => ({ question: q, count }));

      // Répartition par catégorie
      const categCounts = {};
      interactions.forEach(i => {
        const cat = i.categorie || 'autres';
        categCounts[cat] = (categCounts[cat] || 0) + 1;
      });
      const categories = Object.entries(categCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => ({
          categorie: cat,
          label: CATEGORIE_LABELS[cat] || cat,
          count,
          pct: total_questions > 0 ? Math.round((count / total_questions) * 100) : 0
        }));

      // Problèmes détectés (catégories avec > 3 occurrences)
      const problemes = categories
        .filter(c => c.count >= 3)
        .map(c => ({
          sujet: c.label,
          count: c.count,
          message: `${c.count} utilisateur${c.count > 1 ? 's ont' : ' a'} posé des questions sur "${c.label}".`
        }));

      // Répartition par pays (si ALL)
      let par_pays = null;
      if (country_code === 'ALL') {
        const paysCounts = {};
        const allInteractions = await base44.asServiceRole.entities.VenusInteraction.list('-created_date', 500);
        allInteractions.forEach(i => {
          paysCounts[i.country_code] = (paysCounts[i.country_code] || 0) + 1;
        });
        par_pays = Object.entries(paysCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => ({ code, count }));
      }

      // Tendance par jour (7 derniers jours)
      const tendance = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const count = interactions.filter(x => x.date_conversation === d).length;
        tendance.push({ date: d, count });
      }

      return Response.json({
        total_questions,
        conversations_uniques,
        clients_uniques,
        livreurs_uniques,
        resolues,
        non_resolues,
        escalades,
        top_questions,
        categories,
        problemes,
        par_pays,
        tendance,
      });
    }

    if (action === 'generate_rapport') {
      const { type_rapport } = body;
      let interactions = await base44.asServiceRole.entities.VenusInteraction.list('-created_date', 1000);

      if (country_code && country_code !== 'ALL') {
        interactions = interactions.filter(i => i.country_code === country_code);
      }

      let periode_debut, periode_fin;
      const now = new Date();
      if (type_rapport === 'quotidien') {
        periode_debut = periode_fin = now.toISOString().split('T')[0];
        interactions = interactions.filter(i => i.date_conversation === periode_debut);
      } else if (type_rapport === 'hebdomadaire') {
        periode_fin = now.toISOString().split('T')[0];
        periode_debut = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        interactions = interactions.filter(i => i.date_conversation >= periode_debut);
      } else {
        periode_fin = now.toISOString().split('T')[0];
        periode_debut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        interactions = interactions.filter(i => i.date_conversation >= periode_debut);
      }

      // Analyse avec LLM
      const categCounts = {};
      interactions.forEach(i => {
        const cat = i.categorie || 'autres';
        categCounts[cat] = (categCounts[cat] || 0) + 1;
      });
      const topCats = Object.entries(categCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topQs = interactions.slice(0, 20).map(i => i.question).join('\n- ');

      const prompt = `Tu es VENUS, l'IA de SILGAPP. Analyse ces données de conversations pour la période ${periode_debut} → ${periode_fin}.

Pays: ${country_code || 'ALL'}
Nombre de questions: ${interactions.length}
Top catégories: ${topCats.map(([c, n]) => `${CATEGORIE_LABELS[c] || c}: ${n}`).join(', ')}
Exemples de questions: 
- ${topQs}

Génère un rapport ${type_rapport} structuré avec:
1. Résumé des activités
2. Principaux sujets abordés
3. Problèmes détectés
4. Recommandations concrètes (FAQ à créer, tutoriels suggérés, bugs à corriger)
5. Opportunités d'amélioration

Sois concis, professionnel et orienté action. Réponds en français.`;

      const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });

      const rapport = await base44.asServiceRole.entities.VenusRapport.create({
        type_rapport,
        country_code: country_code || 'ALL',
        periode_debut,
        periode_fin,
        nb_questions: interactions.length,
        nb_conversations: new Set(interactions.map(i => i.conversation_id)).size,
        nb_resolues: interactions.filter(i => i.statut === 'resolu').length,
        top_categories: JSON.stringify(topCats),
        recommandations: llmRes,
        genere_par: user.email,
      });

      return Response.json({ success: true, rapport_id: rapport.id, recommandations: llmRes });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});