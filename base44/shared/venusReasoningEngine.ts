/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR DE MÉMOIRE ET DE RAISONNEMENT VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Architecture modulaire et réutilisable pour tous les futurs
 * assistants IA de SILGAPP.
 *
 * Composants :
 * 1. Mémoire courte  — contexte de la conversation active
 * 2. Mémoire longue  — profil persistant du client
 * 3. Moteur de raisonnement — analyse avant chaque réponse
 * 4. Arbre de décision — intention → action → réponse
 * 5. Journalisation  — traçabilité complète pour l'admin
 *
 * Intégration :
 * - Centre d'Apprentissage (venusLearningEngine) : base de connaissances
 * - Webhook WhatsApp (webhookWhatsAppVenus) : point d'entrée
 * - Tableau d'administration (VenusBrainCenter) : visualisation
 * ═══════════════════════════════════════════════════════════════════
 */

import { rechercherConnaissancesValidees } from './venusLearningEngine.ts';
import { rechercherDocumentsRag } from './venusRagEngine.ts';
import { construireContexteVenus } from './venusI18nEngine.ts';

/**
 * Recherche les scénarios validés pour un pays/langue donnés (Source 3).
 */
export async function rechercherScenariosValidees(base44: any, countryCode: string, langue: string = 'fr'): Promise<any[]> {
  try {
    const all = await base44.asServiceRole.entities.VenusScenario.filter(
      { statut: 'valide' },
      '-created_date',
      50
    );
    return all.filter((s: any) =>
      (!s.categorie || s.categorie !== 'archive')
    ).slice(0, 10);
  } catch (e) {
    console.warn('[ReasoningEngine] Erreur chargement scénarios:', e.message);
    return [];
  }
}

// ── Types ──

interface ReasoningInput {
  messageClient: string;
  memoireCourte: any;
  memoireLongue: any;
  historiqueRecent: any[];
  courseActive?: any;
  countryCode: string;
  tarifs: any;
  telephone: string;
  profileName: string;
  isAudioTranscription: boolean;
}

interface ReasoningResult {
  intention: string;
  contexte: string;
  infos_connues: Record<string, any>;
  infos_manquantes: string[];
  action: string;
  prochaine_question: string;
  outils_utilises: string[];
  confiance: number;
  reponse: string;
  memoire_courte_update: Record<string, any>;
  memoire_longue_update: Record<string, any>;
  knowledge_id?: string;
  document_sources?: { document_id: string; document_titre: string; chunk_id: string; score: number; version: number }[];
  temps_traitement_ms: number;
}

// ── Schéma JSON pour la réponse LLM structurée ──

const RAISONNEMENT_SCHEMA = {
  type: 'object',
  properties: {
    intention: {
      type: 'string',
      enum: [
        'creer_course', 'suivre_course', 'contacter_livreur',
        'annuler_course', 'modifier_info', 'demander_info',
        'salutation', 'clarifier', 'autre',
      ],
    },
    contexte: {
      type: 'string',
      enum: [
        'nouvelle_course', 'course_en_cours', 'ancienne_course',
        'paiement', 'livreur', 'partenaire', 'general',
      ],
    },
    infos_connues: { type: 'object', additionalProperties: true },
    infos_manquantes: { type: 'array', items: { type: 'string' } },
    action: {
      type: 'string',
      enum: [
        'poser_question', 'creer_course', 'suivre_course',
        'contacter_livreur', 'annuler_course', 'repondre_info',
        'clarifier', 'saluer',
      ],
    },
    prochaine_question: { type: 'string' },
    outils_utilises: { type: 'array', items: { type: 'string' } },
    confiance: { type: 'number' },
    reponse: { type: 'string' },
    memoire_courte_update: { type: 'object', additionalProperties: true },
    memoire_longue_update: { type: 'object', additionalProperties: true },
    knowledge_id: { type: 'string' },
    document_sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  required: ['intention', 'contexte', 'action', 'reponse', 'confiance'],
};

// ═══════════════════════════════════════════════════════════════════
// 1. GESTION DE LA MÉMOIRE LONGUE
// ═══════════════════════════════════════════════════════════════════

/**
 * Charge (ou crée) la mémoire longue d'un client.
 * Cache local pour éviter les requêtes répétées dans le même traitement.
 */
const MEMORY_CACHE = new Map<string, { data: any; expires: number }>();

export async function chargerMemoireLongue(base44: any, telephone: string, countryCode: string): Promise<any> {
  const cacheKey = `ltm_${telephone}`;
  const cached = MEMORY_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.data;

  try {
    const existing = await base44.asServiceRole.entities.VenusLongTermMemory.filter(
      { client_telephone: telephone },
      '-created_date', 1
    );
    if (existing && existing.length > 0) {
      MEMORY_CACHE.set(cacheKey, { data: existing[0], expires: Date.now() + 30000 });
      return existing[0];
    }
    // Créer une nouvelle entrée
    const created = await base44.asServiceRole.entities.VenusLongTermMemory.create({
      client_telephone: telephone,
      country_code: countryCode,
      langue_preferee: 'fr',
      total_interactions: 0,
      total_courses: 0,
      derniere_interaction: new Date().toISOString(),
    });
    MEMORY_CACHE.set(cacheKey, { data: created, expires: Date.now() + 30000 });
    return created;
  } catch (e) {
    console.error('[ReasoningEngine] Erreur chargement mémoire longue:', e.message);
    return null;
  }
}

/**
 * Met à jour la mémoire longue avec de nouvelles informations.
 * Gère les champs simples et les tableaux JSON complexes (adresses, destinataires).
 */
export async function mettreAJourMemoireLongue(base44: any, memoryId: string, updates: Record<string, any>): Promise<void> {
  if (!memoryId || !updates || Object.keys(updates).length === 0) return;

  try {
    // Charger la mémoire actuelle pour fusionner les tableaux
    const current = await base44.asServiceRole.entities.VenusLongTermMemory.get(memoryId);
    if (!current) return;

    const finalUpdates: any = { derniere_interaction: new Date().toISOString() };

    // Champs simples — copie directe
    const simpleFields = ['client_nom', 'ville_habituelle', 'quartier_habituel', 'langue_preferee',
      'type_course_prefere', 'mode_paiement_prefere', 'country_code', 'notes_admin'];
    for (const f of simpleFields) {
      if (updates[f] !== undefined) finalUpdates[f] = updates[f];
    }

    // Adresses fréquentes — fusionner
    if (updates.adresse_recuperee || updates.adresse_livraison) {
      let adresses: any[] = [];
      try { adresses = current.adresses_frequentes ? JSON.parse(current.adresses_frequentes) : []; } catch {}

      if (updates.adresse_recuperee) {
        ajouterOuIncrementerAdresse(adresses, updates.adresse_recuperee, 'recuperation',
          updates.adresse_recuperee_gps_lat, updates.adresse_recuperee_gps_lng);
      }
      if (updates.adresse_livraison) {
        ajouterOuIncrementerAdresse(adresses, updates.adresse_livraison, 'livraison',
          updates.adresse_livraison_gps_lat, updates.adresse_livraison_gps_lng);
      }
      finalUpdates.adresses_frequentes = JSON.stringify(adresses.slice(-20)); // Garder les 20 plus récentes
    }

    // Destinataires habituels — fusionner
    if (updates.destinataire_nom || updates.destinataire_telephone) {
      let destinataires: any[] = [];
      try { destinataires = current.destinataires_habituels ? JSON.parse(current.destinataires_habituels) : []; } catch {}

      if (updates.destinataire_telephone) {
        ajouterOuIncrementerDestinataire(destinataires, updates.destinataire_nom || '', updates.destinataire_telephone);
      }
      finalUpdates.destinataires_habituels = JSON.stringify(destinataires.slice(-20));
    }

    // Incrémenter le compteur d'interactions
    finalUpdates.total_interactions = (current.total_interactions || 0) + 1;

    // Incrémenter le compteur de courses si demandé
    if (updates.increment_courses) {
      finalUpdates.total_courses = (current.total_courses || 0) + 1;
      finalUpdates.derniere_course_date = new Date().toISOString();
    }

    await base44.asServiceRole.entities.VenusLongTermMemory.update(memoryId, finalUpdates);
    MEMORY_CACHE.delete(`ltm_${current.client_telephone}`);
  } catch (e) {
    console.error('[ReasoningEngine] Erreur MAJ mémoire longue:', e.message);
  }
}

function ajouterOuIncrementerAdresse(adresses: any[], adresse: string, type: string, lat?: number, lng?: number) {
  const existing = adresses.find(a => a.adresse === adresse && a.type === type);
  if (existing) {
    existing.count = (existing.count || 0) + 1;
    existing.last_used = new Date().toISOString();
    if (lat != null) existing.gps_lat = lat;
    if (lng != null) existing.gps_lng = lng;
  } else {
    adresses.push({ adresse, type, gps_lat: lat, gps_lng: lng, count: 1, last_used: new Date().toISOString() });
  }
}

function ajouterOuIncrementerDestinataire(destinataires: any[], nom: string, telephone: string) {
  const existing = destinataires.find(d => d.telephone === telephone);
  if (existing) {
    existing.count = (existing.count || 0) + 1;
    existing.last_used = new Date().toISOString();
    if (nom) existing.nom = nom;
  } else {
    destinataires.push({ nom, telephone, count: 1, last_used: new Date().toISOString() });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. CHARGEMENT DE L'HISTORIQUE RÉCENT
// ═══════════════════════════════════════════════════════════════════

export async function chargerHistoriqueRecent(base44: any, conversationId: string, limit: number = 6): Promise<any[]> {
  try {
    const messages = await base44.asServiceRole.entities.Message.filter(
      { conversation_id: conversationId },
      '-created_date', limit
    );
    // Trier par ordre chronologique (plus ancien en premier)
    return (messages || []).reverse();
  } catch (e) {
    console.error('[ReasoningEngine] Erreur chargement historique:', e.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. RECHERCHE DE COURSE ACTIVE
// ═══════════════════════════════════════════════════════════════════

const STATUTS_ACTIFS = [
  'nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route',
  'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque',
  'pris_en_charge', 'en_livraison', 'arrivee',
];

export async function trouverCourseActive(base44: any, telephone: string, countryCode: string): Promise<any | null> {
  try {
    let courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { client_telephone: telephone }, '-created_date', 10
    );
    if (!courses || courses.length === 0) {
      courses = await base44.asServiceRole.entities.CourseExterne.filter(
        { expediteur_telephone: telephone }, '-created_date', 10
      );
    }
    if (!courses || courses.length === 0) {
      const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
        { country_code: countryCode }, '-created_date', 50
      );
      const telDigits = telephone.replace(/\D/g, '');
      courses = allRecent.filter(c => {
        const ct = (c.client_telephone || '').replace(/\D/g, '');
        const et = (c.expediteur_telephone || '').replace(/\D/g, '');
        return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
      }).slice(0, 10);
    }
    return courses.find(c => STATUTS_ACTIFS.includes(c.statut)) || null;
  } catch (e) {
    console.error('[ReasoningEngine] Erreur recherche course active:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. CRÉATION DE COURSE DEPUIS LA MÉMOIRE
// ═══════════════════════════════════════════════════════════════════

function normalizeTypeCourse(type: string): string | null {
  if (!type) return null;
  const t = type.toLowerCase().trim();
  if (['expedier', 'recevoir', 'deplacement'].includes(t)) return t;
  if (t.includes('expedi') || t.includes('envoi') || t.includes('envoyer')) return 'expedier';
  if (t.includes('recev') || t.includes('reception')) return 'recevoir';
  if (t.includes('deplac') || t.includes('trajet') || t.includes('transport person')) return 'deplacement';
  if (t.includes('livraison') || t.includes('colis')) return 'expedier';
  return null;
}

export async function creerCourseDepuisMemoire(
  base44: any,
  memoireCourte: any,
  countryCode: string,
  tarifs: any,
  telephone: string,
  profileName: string
): Promise<{ success: boolean; course?: any; error?: string; message?: string }> {
  const cd = { ...memoireCourte };

  // Normaliser type_course
  const normalizedType = normalizeTypeCourse(cd.type_course) || cd.type_course;
  if (!normalizedType || !['expedier', 'recevoir', 'deplacement'].includes(normalizedType)) {
    return { success: false, error: 'MISSING_TYPE' };
  }

  const hasRequiredContact = cd.contact_telephone || cd.contact_is_client;
  const hasDepart = cd.adresse_depart || cd.gps_depart_lat != null;
  const hasArrivee = cd.adresse_arrivee || cd.gps_arrivee_lat != null;

  if (!hasDepart || !hasArrivee || !hasRequiredContact) {
    return { success: false, error: 'MISSING_INFO' };
  }

  const courseData: any = {
    country_code: countryCode,
    source: 'client',
    client_nom: profileName || telephone,
    client_telephone: telephone,
    type_course: normalizedType,
    adresse_depart: cd.adresse_depart || 'Localisation GPS partagee',
    adresse_arrivee: cd.adresse_arrivee || 'Localisation GPS partagee',
    prix_estimate: tarifs.minimum,
    devise: tarifs.devise,
    statut: 'nouvelle',
    dispatch_status: 'en_attente',
    notes: cd.notes || '',
    gps_depart_lat: cd.gps_depart_lat,
    gps_depart_lng: cd.gps_depart_lng,
    gps_arrivee_lat: cd.gps_arrivee_lat,
    gps_arrivee_lng: cd.gps_arrivee_lng,
  };

  if (normalizedType === 'expedier') {
    if (cd.contact_is_client) {
      courseData.destinataire_nom = profileName || telephone;
      courseData.destinataire_telephone = telephone;
      courseData.destinataire_phone_normalized = telephone;
    } else {
      courseData.destinataire_nom = cd.contact_nom || '';
      courseData.destinataire_telephone = cd.contact_telephone || telephone;
      courseData.destinataire_phone_normalized = cd.contact_telephone || telephone;
    }
  } else if (normalizedType === 'recevoir') {
    if (cd.contact_is_client) {
      courseData.expediteur_nom = profileName || telephone;
      courseData.expediteur_telephone = telephone;
      courseData.expediteur_phone_normalized = telephone;
    } else {
      courseData.expediteur_nom = cd.contact_nom || '';
      courseData.expediteur_telephone = cd.contact_telephone || telephone;
      courseData.expediteur_phone_normalized = cd.contact_telephone || telephone;
    }
  } else if (normalizedType === 'deplacement') {
    courseData.passager_nom = profileName || telephone;
    courseData.passager_telephone = telephone;
  }

  try {
    const course = await base44.asServiceRole.entities.CourseExterne.create(courseData);
    const typeLabels: any = { expedier: 'Envoi de colis', recevoir: 'Reception de colis', deplacement: 'Deplacement' };
    const typeLabel = typeLabels[normalizedType] || normalizedType;
    const message = `Votre course a ete creee avec succes dans SILGAPP !

Type: ${typeLabel}
De: ${cd.adresse_depart || 'Localisation GPS'}
Vers: ${cd.adresse_arrivee || 'Localisation GPS'}

Je recherche maintenant un livreur disponible. Je vous informerai des qu'un livreur aura accepte votre demande. Le livreur vous contactera ensuite pour confirmer les derniers details et le cout de la livraison.`;

    return { success: true, course, message };
  } catch (e: any) {
    console.error('[ReasoningEngine] Erreur création course:', e.message);
    return { success: false, error: 'CREATE_ERROR', message: 'Desole, une erreur est survenue lors de la creation de la course. Veuillez reessayer ou contacter le support au +226 66 92 51 90.' };
  }
}

/**
 * Extraction heuristique d'informations depuis un message client.
 * Fallback utilisé quand le LLM ne remplit pas memoire_courte_update.
 */
const QUARTIERS_OUAGA = [
  'karpala', 'pissy', 'tampouy', 'ouaga 2000', 'zone du bois', "patte d'oie",
  'gounghin', 'dassasgho', 'cissin', 'samandin', 'wemtenga', 'bendogo',
  'larle', 'somgande', 'saaba', 'tanghin', 'kossodo', 'ouaga 1', 'ouaga 2',
  'ouaga 3', 'wagadogo', 'zone 1', 'zone 2', 'zone 3', 'zone 4', 'zone 5',
  'paspanga', 'tiendpalogo', 'bilbalogho', 'sandogo', 'tounouma',
];

function extraireInfosDepuisMessage(message: string): Record<string, any> {
  const msg = message.toLowerCase().trim();
  const updates: Record<string, any> = {};

  // Type de course
  if (!updates.type_course) {
    if (msg.includes('envoyer') || msg.includes('expedi') || msg.includes('envoi') || msg.includes('colis')) {
      updates.type_course = 'expedier';
    } else if (msg.includes('recevoir') || msg.includes('reception')) {
      updates.type_course = 'recevoir';
    } else if (msg.includes('deplac') || msg.includes('transport person') || msg.includes('trajet')) {
      updates.type_course = 'deplacement';
    }
  }

  // Numéro de téléphone (format international ou local)
  const phoneMatch = message.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\d{2}[\s.-]?){4}/);
  if (phoneMatch) {
    const phone = phoneMatch[0].replace(/[\s.-]/g, '');
    if (phone.length >= 8) {
      updates.contact_telephone = phoneMatch[0].trim();
    }
  }

  // Adresses — chercher des noms de quartiers connus
  for (const q of QUARTIERS_OUAGA) {
    if (msg.includes(q)) {
      const isJeSuisA = msg.includes('je suis à ' + q) || msg.includes('je suis a ' + q);
      const isDepuis = msg.includes('depuis ' + q) || msg.includes('au depart de ' + q);
      const isVersArrivee = msg.includes('vers ' + q) || msg.includes('pour ' + q) || msg.includes('a destination de ' + q);
      const hasPlainA = msg.includes('à ' + q) || msg.includes('a ' + q);

      if (isJeSuisA || isDepuis) {
        if (!updates.adresse_depart) updates.adresse_depart = q.charAt(0).toUpperCase() + q.slice(1);
      } else if (isVersArrivee || hasPlainA) {
        if (!updates.adresse_arrivee) updates.adresse_arrivee = q.charAt(0).toUpperCase() + q.slice(1);
      } else if (!updates.adresse_arrivee && !updates.adresse_depart) {
        updates.adresse_arrivee = q.charAt(0).toUpperCase() + q.slice(1);
      }
    }
  }

  return updates;
}

// ═══════════════════════════════════════════════════════════════════
// 5. MOTEUR DE RAISONNEMENT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export async function raisonnerVenus(base44: any, input: ReasoningInput): Promise<ReasoningResult> {
  const startTime = Date.now();

  // ── Construire l'historique lisible ──
  const historiqueStr = input.historiqueRecent
    .map(m => `${m.sender_type === 'client' ? 'Client' : 'VENUS'}: ${m.content || `[${m.message_type}]`}`)
    .join('\n') || 'Aucun historique';

  // ── Mémoire courte lisible ──
  const memoireCourteStr = input.memoireCourte && Object.keys(input.memoireCourte).length > 0
    ? JSON.stringify(input.memoireCourte, null, 2)
    : 'Aucune information collectee pour le moment';

  // ── Mémoire longue lisible ──
  let memoireLongueStr = 'Aucun profil client';
  if (input.memoireLongue) {
    const ltm = input.memoireLongue;
    let adresses: any[] = [];
    let destinataires: any[] = [];
    try { adresses = ltm.adresses_frequentes ? JSON.parse(ltm.adresses_frequentes) : []; } catch {}
    try { destinataires = ltm.destinataires_habituels ? JSON.parse(ltm.destinataires_habituels) : []; } catch {}
    memoireLongueStr = JSON.stringify({
      nom: ltm.client_nom || 'Inconnu',
      pays: ltm.country_code,
      ville: ltm.ville_habituelle || 'Inconnue',
      quartier: ltm.quartier_habituel || 'Inconnu',
      langue: ltm.langue_preferee || 'fr',
      total_courses: ltm.total_courses || 0,
      adresses_frequentes: adresses.slice(0, 5),
      destinataires_habituels: destinataires.slice(0, 5),
    }, null, 2);
  }

  // ── Course active ──
  let courseActiveStr = 'Aucune course active';
  if (input.courseActive) {
    const c = input.courseActive;
    courseActiveStr = JSON.stringify({
      ref: c.id?.slice(-6),
      statut: c.statut,
      type: c.type_course,
      depart: c.adresse_depart,
      arrivee: c.adresse_arrivee,
      livreur_nom: c.livreur_nom || null,
      livreur_telephone: c.livreur_telephone || null,
      tracking_link: c.tracking_link || null,
    }, null, 2);
  }

  // ── Base de connaissances (Source 1) ──
  let knowledgeStr = 'Aucune entree pertinente';
  let knowledgeEntries: any[] = [];
  try {
    knowledgeEntries = await rechercherConnaissancesValidees(base44, input.countryCode);
    if (knowledgeEntries.length > 0) {
      knowledgeStr = knowledgeEntries.slice(0, 10).map((k, i) =>
        `[${i + 1}] Q: ${k.question}\n    R: ${(k.reponse_officielle || '').substring(0, 200)}\n    ID: ${k.id}`
      ).join('\n');
    }
  } catch (e) {
    console.warn('[ReasoningEngine] Erreur chargement connaissances:', e.message);
  }

  // ── Bibliothèque documentaire RAG (Source 2) ──
  let documentStr = 'Aucun document pertinent trouve';
  let documentResults: any[] = [];
  try {
    const ragResult = await rechercherDocumentsRag(base44, input.messageClient, {
      pays: input.countryCode,
      limit: 5,
      conversation_id: input.telephone,
    });
    if (ragResult.a_reussi && ragResult.resultats.length > 0) {
      documentResults = ragResult.resultats;
      documentStr = ragResult.resultats.map((r, i) =>
        `[DOC ${i + 1}] Source: ${r.document_titre} (v${r.document_version}, ${r.document_categorie})\n    Score: ${r.score}\n    Contenu: ${(r.contenu || '').substring(0, 400)}\n    Doc ID: ${r.document_id} | Chunk ID: ${r.chunk_id}`
      ).join('\n\n');
      console.log(`[ReasoningEngine] 📚 RAG: ${ragResult.resultats.length} documents trouvés en ${ragResult.temps_ms}ms`);
    }
  } catch (e) {
    console.warn('[ReasoningEngine] Erreur recherche documents RAG:', e.message);
  }

  // ── Contexte localisé (pays, personnalité, marque, langue) ──
  let localizedSystemPrompt = '';
  try {
    const ctx = await construireContexteVenus(base44, input.telephone, input.messageClient);
    localizedSystemPrompt = ctx.systemPrompt;
  } catch (e) {
    console.warn('[ReasoningEngine] Fallback prompt localisé:', e.message);
  }

  // ── Scénarios validés (Source 3) ──
  let scenarioStr = 'Aucun scénario pertinent';
  let scenarioEntries: any[] = [];
  try {
    scenarioEntries = await rechercherScenariosValidees(base44, input.countryCode);
    if (scenarioEntries.length > 0) {
      scenarioStr = scenarioEntries.slice(0, 5).map((s, i) =>
        `[${i + 1}] Scénario: ${s.nom}\n    Déclencheurs: ${s.declencheurs || 'N/A'}\n    Réponse idéale: ${(s.reponse_ideale || '').substring(0, 200)}`
      ).join('\n');
    }
  } catch (e) {
    console.warn('[ReasoningEngine] Erreur chargement scénarios:', e.message);
  }

  // ── Construire le prompt de raisonnement ──
  const audioNote = input.isAudioTranscription
    ? `═══ NOTE: TRANSCRIPTION VOCALE ═══
Le message ci-dessous a ete transcrit depuis une note vocale et peut contenir des erreurs.
Confirme ce que tu as compris avant de poursuivre si un mot semble incertain.
Noms de quartiers courants a Ouagadougou: Karpala, Pissy, Tampouy, Ouaga 2000, Zone du Bois, Patte d'Oie, Gounghin, Dassasgho, Cissin, Samandin, Wemtenga, Bendogo, Larle, Somgande, Saaba, Tanghin, Kossodo.`
    : '';

  const prompt = `${localizedSystemPrompt || 'Tu es VENUS, l\'assistante virtuelle SILGAPP. Tu possèdes un MOTEUR DE RAISONNEMENT avancé et une MÉMOIRE INTELLIGENTE.'}

═══ SCÉNARIOS VALIDÉS (Source 3) ═══
${scenarioStr}

═══ CONTEXTE CLIENT ═══
Téléphone: ${input.telephone}
Nom: ${input.profileName || input.telephone}
Pays: ${input.countryCode} (${input.tarifs.nom})
Tarifs: ${input.tarifs.prix_km} ${input.tarifs.devise}/km, minimum ${input.tarifs.minimum} ${input.tarifs.devise}

═══ MÉMOIRE COURTE (informations collectées dans cette conversation) ═══
${memoireCourteStr}

═══ MÉMOIRE LONGUE (profil et préférences du client) ═══
${memoireLongueStr}

═══ HISTORIQUE RÉCENT ═══
${historiqueStr}

═══ COURSE ACTIVE (si applicable) ═══
${courseActiveStr}

═══ BASE DE CONNAISSANCES (Source 1 - Priorité absolue) ═══
${knowledgeStr}

═══ BIBLIOTHÈQUE DOCUMENTAIRE (Source 2 - Documents officiels SILGAPP) ═══
${documentStr}

${audioNote}

═══ MESSAGE DU CLIENT ═══
${input.messageClient}

═══ MOTEUR DE RAISONNEMENT ═══
Analyse le message du client étape par étape :

ÉTAPE 1 — INTENTION: Que veut réellement le client ?
- creer_course: Créer une nouvelle course
- suivre_course: Suivre ou consulter une course existante
- contacter_livreur: Contacter ou parler au livreur
- annuler_course: Annuler une course
- modifier_info: Modifier/corriger une information déjà donnée
- demander_info: Poser une question informationnelle (tarifs, fonctionnement, etc.)
- salutation: Bonjour, salut, bonsoir
- clarifier: Demande ambiguë nécessitant une clarification
- autre: Autre chose

ÉTAPE 2 — CONTEXTE: De quoi parle le client ?
- nouvelle_course / course_en_cours / ancienne_course / paiement / livreur / partenaire / general

ÉTAPE 3 — INFORMATIONS CONNUES: Liste les informations déjà présentes dans la mémoire courte.

ÉTAPE 4 — INFORMATIONS MANQUANTES: Pour l'action voulue, quelles informations manquent ?
Pour creer_course, requis: type_course, adresse_depart (ou GPS), adresse_arrivee (ou GPS), contact_telephone (ou contact_is_client)

ÉTAPE 5 — ACTION: Quelle action effectuer ?
- poser_question: Poser UNE SEULE question (la prochaine information manquante)
- creer_course: Toutes les infos sont présentes et le client a confirmé → créer la course
- suivre_course: Donner le statut de la course active
- contacter_livreur: Fournir le contact du livreur
- annuler_course: Annuler la course
- repondre_info: Répondre à une question informationnelle (utilise la base de connaissances si pertinent)
- clarifier: Demander une clarification
- saluer: Répondre à une salutation

ÉTAPE 6 — PROCHAINE QUESTION: Si action=poser_question, formule UNE SEULE question claire.

ÉTAPE 7 — CONFIANCE: Score 0-100 (100 = très certain, <80 = incertain).

ÉTAPE 8 — RÉPONSE: La réponse à envoyer au client (texte plain, sans markdown, concise, chaleureuse).

ÉTAPE 9 — MÉMOIRE COURTE À METTRE À JOUR: Nouvelles informations collectées ou corrections.
Inclus uniquement les champs qui ont changé ou qui sont nouveaux.
Pour type_course, utilise UNIQUEMENT: "expedier", "recevoir", ou "deplacement".

ÉTAPE 10 — MÉMOIRE LONGUE À METTRE À JOUR: Informations persistantes détectées.
Champs possibles: client_nom, ville_habituelle, quartier_habituel, langue_preferee, type_course_prefere, mode_paiement_prefere, adresse_recuperee, adresse_livraison, destinataire_nom, destinataire_telephone.

═══ RÈGLES CRITIQUES ═══

1. ANTI-BOUCLE: Ne JAMAIS redemander une information déjà présente dans la mémoire courte. Si type_course est connu, ne pas le redemander. Si adresse_depart est connue, ne pas la redemander. etc.

2. CORRECTIONS: Si le client corrige une information ("finalement ce n'est plus X", "non c'est Y"), mets à jour memoire_courte_update avec la nouvelle valeur et confirme le changement au client.

3. QUESTIONS IMPLICITES:
   - "Le livreur est où?" / "Où est le livreur?" → intention=suivre_course, contexte=course_en_cours
   - "Il arrive quand?" → intention=suivre_course ("il" = le livreur de la course active)
   - "Je veux lui parler" → intention=contacter_livreur ("lui" = le livreur)
   - "C'est combien?" / "Ça coûte combien?" → intention=demander_info

4. AMBIGUÏTÉ: Si plusieurs interprétations sont possibles, choisis action=clarifier et pose UNE question de clarification.

5. UNE SEULE QUESTION: Si action=poser_question, la réponse doit contenir UNE SEULE question. Ne jamais demander deux informations en même temps.

6. PAS DE PRIX: Ne JAMAIS inventer ou estimer un prix. Si le client demande le prix, réponds que le livreur confirmera le coût.

7. CRÉATION DE COURSE: Si toutes les infos requises sont présentes (type_course + depart + arrivee + contact) ET que le client a confirmé (ou si all_info_collected=true dans la mémoire et le client dit oui/ok/confirme), choisis action=creer_course.

8. SALUTATION: Si c'est une salutation simple et qu'aucune course n'est en cours, propose tes services brièvement.

9. CONTEXTE: Ne mélange jamais une nouvelle demande avec une course en cours. Si le client démarre une nouvelle demande alors qu'une course est en cours, demande clarification.

10. MÉMOIRE LONGUE: Détecte les informations persistantes (ville, quartier, nom, destinataires fréquents) et inclus-les dans memoire_longue_update.

11. Si all_info_collected est vrai dans la mémoire courte et que le client confirme (oui, ok, d'accord, je confirme, valider), choisis action=creer_course IMMÉDIATEMENT.

12. Si pending_location_lat est défini dans la mémoire, une localisation est en attente d'assignation. Demande si c'est le lieu de récupération ou de livraison.

13. PRIORITÉ DES SOURCES: Pour répondre aux questions informationnelles (demander_info), utilise les sources dans cet ORDRE OBLIGATOIRE:
    a) Base de connaissances (Source 1) — si une entrée correspond, utilise sa réponse et mets knowledge_id.
    b) Bibliothèque documentaire (Source 2) — si un document officiel correspond, utilise son contenu et mets document_sources avec les IDs.
    c) Scénarios validés (Source 3) — si un scénario correspond à la situation, inspire-toi de sa réponse idéale.
    d) IA générale (Source 4) — uniquement si aucune source officielle ne correspond.
    Si l'intention est une action (creer_course, suivre_course, etc.), n'utilise PAS les sources comme réponse — l'action prime.

14. DOCUMENTS OFFICIELS: Si la Bibliothèque documentaire contient des informations pertinentes, cite-les dans ta réponse de manière naturelle. Les documents officiels SILGAPP (procédures, tarifs, conditions générales, guides) ont priorité sur ta propre connaissance. Si tu utilises un document, mets document_sources avec [{document_id, document_titre, chunk_id, score, version}].

15. Si le client indique "recevoir un colis", le contact à collecter est l'EXPÉDITEUR (celui qui envoie vers le client). Si "envoyer un colis", le contact est le DESTINATAIRE (celui qui reçoit).

15. Le nom du destinataire/expéditeur est FACULTATIF. Seul le téléphone est requis. Si le client n'a pas le nom, mets contact_nom à "" et contact_is_client à false (ou true si le client est lui-même le contact).

Réponds UNIQUEMENT avec un JSON.`;

  // ── Appel LLM ──
  try {
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: RAISONNEMENT_SCHEMA,
    });

    const result: ReasoningResult = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
    result.temps_traitement_ms = Date.now() - startTime;

    // ── Post-traitement : valider et nettoyer ──
    if (!result.action) result.action = 'repondre_info';
    if (!result.reponse) result.reponse = 'Comment puis-je vous aider ?';
    if (result.confiance === undefined || result.confiance === null) result.confiance = 50;
    // Normaliser la confiance : si le LLM retourne 0-1, convertir en 0-100
    if (result.confiance <= 1) result.confiance = Math.round(result.confiance * 100);
    if (!result.outils_utilises) result.outils_utilises = [];
    if (!result.infos_manquantes) result.infos_manquantes = [];
    if (!result.memoire_courte_update) result.memoire_courte_update = {};
    if (!result.memoire_longue_update) result.memoire_longue_update = {};

    // ── Fallback heuristique : extraire les infos du message si le LLM ne l'a pas fait ──
    const extracted = extraireInfosDepuisMessage(input.messageClient);
    // Ne pas écraser les champs déjà connus dans la mémoire courte existante
    for (const key of Object.keys(extracted)) {
      if (input.memoireCourte && input.memoireCourte[key] != null && input.memoireCourte[key] !== '') {
        delete extracted[key];
      }
    }
    if (Object.keys(extracted).length > 0) {
      result.memoire_courte_update = { ...extracted, ...result.memoire_courte_update };
      // Aussi remplir infos_connues si vide
      if (Object.keys(result.infos_connues || {}).length === 0) {
        result.infos_connues = { ...input.memoireCourte, ...extracted };
      }
    }
    // Toujours fusionner infos_connues avec la mémoire existante
    if (Object.keys(result.infos_connues || {}).length > 0) {
      result.infos_connues = { ...input.memoireCourte, ...result.infos_connues };
    }

    // Si la base de connaissances a été utilisée, valider le knowledge_id
    if (result.knowledge_id && knowledgeEntries.length > 0) {
      const match = knowledgeEntries.find(k => k.id === result.knowledge_id);
      if (!match) {
        // L'LLM a inventé un ID — essayer de trouver le bon
        result.knowledge_id = undefined;
      }
    }

    // Valider les document_sources
    if (result.document_sources && documentResults.length > 0) {
      const validSources = result.document_sources.filter((src: any) =>
        documentResults.some(dr => dr.document_id === src.document_id)
      );
      result.document_sources = validSources.length > 0 ? validSources : undefined;
    } else {
      result.document_sources = undefined;
    }

    console.log(`[ReasoningEngine] 🧠 Intention: ${result.intention} | Contexte: ${result.contexte} | Action: ${result.action} | Confiance: ${result.confiance}% | Temps: ${result.temps_traitement_ms}ms`);

    return result;
  } catch (e: any) {
    console.error('[ReasoningEngine] Erreur raisonnement:', e.message);
    return {
      intention: 'autre',
      contexte: 'general',
      infos_connues: {},
      infos_manquantes: [],
      action: 'repondre_info',
      prochaine_question: '',
      outils_utilises: [],
      confiance: 0,
      reponse: "Je suis VENUS, votre assistante SILGAPP. Comment puis-je vous aider ?",
      memoire_courte_update: {},
      memoire_longue_update: {},
      document_sources: undefined,
      temps_traitement_ms: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 6. JOURNALISATION DU RAISONNEMENT
// ═══════════════════════════════════════════════════════════════════

export async function loggerRaisonnement(base44: any, logData: {
  interaction_id?: string;
  conversation_id: string;
  client_telephone: string;
  client_nom?: string;
  message_recu: string;
  result: ReasoningResult;
  memoire_courte_snapshot: any;
  memoire_longue_id?: string;
  reponse_envoyee: string;
}): Promise<void> {
  try {
    await base44.asServiceRole.entities.VenusReasoningLog.create({
      interaction_id: logData.interaction_id || undefined,
      conversation_id: logData.conversation_id,
      client_telephone: logData.client_telephone,
      client_nom: logData.client_nom || undefined,
      message_recu: logData.message_recu,
      intention: logData.result.intention,
      contexte: logData.result.contexte,
      infos_connues: JSON.stringify(logData.result.infos_connues || {}),
      infos_manquantes: JSON.stringify(logData.result.infos_manquantes || []),
      action_choisie: logData.result.action,
      outils_utilises: JSON.stringify([
        ...(logData.result.outils_utilises || []),
        ...(logData.result.document_sources?.map((ds: any) => `doc:${ds.document_titre}`) || []),
      ]),
      confiance: logData.result.confiance,
      memoire_courte_snapshot: JSON.stringify(logData.memoire_courte_snapshot || {}),
      memoire_longue_id: logData.memoire_longue_id || undefined,
      reponse_envoyee: logData.reponse_envoyee,
      temps_traitement_ms: logData.result.temps_traitement_ms,
      date_traitement: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[ReasoningEngine] Erreur journalisation:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 7. DÉTECTION DE CONVERSATIONS À RELANCER
// ═══════════════════════════════════════════════════════════════════

export async function detecterConversationsARelancer(base44: any, delaiMinutes: number = 15): Promise<any[]> {
  try {
    const cutoff = new Date(Date.now() - delaiMinutes * 60 * 1000).toISOString();
    // Conversations où VENUS est active, avec pending_course non vide, et dernier message de VENUS
    const conversations = await base44.asServiceRole.entities.Conversation.filter(
      { venus_active: true, source: 'whatsapp', last_sender_type: 'admin' },
      '-last_message_date', 100
    );

    const aRelancer: any[] = [];
    for (const c of conversations) {
      if (!c.venus_pending_course) continue;
      if (!c.last_message_date) continue;
      if (c.last_message_date > cutoff) continue; // Pas assez de temps écoulé

      // Vérifier que le cours n'est pas encore créé
      let pending: any;
      try { pending = JSON.parse(c.venus_pending_course); } catch { continue; }
      if (pending.course_created || pending.all_info_collected === true) continue;
      if (pending.contact_livreur_mode) continue;
      if (pending.redispatch_pending) continue;

      // ── FIX 1: Ne pas relancer si le client a une course récente (créée dans les 2h) ──
      if (c.whatsapp_phone) {
        try {
          const recentCourses = await base44.asServiceRole.entities.CourseExterne.filter(
            { client_telephone: c.whatsapp_phone },
            '-created_date', 5
          );
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const hasRecentCourse = (recentCourses || []).some(course =>
            course.created_date > twoHoursAgo &&
            !['annulee', 'annuler', 'annule'].includes(course.statut)
          );
          if (hasRecentCourse) {
            // Le client a déjà une course récente — nettoyer le pending_course pour stopper la boucle
            await base44.asServiceRole.entities.Conversation.update(c.id, { venus_pending_course: '' });
            continue;
          }
        } catch {}
      }

      // ── FIX 2: Limiter à 2 relances maximum sans réponse du client ──
      try {
        const recentMsgs = await base44.asServiceRole.entities.Message.filter(
          { conversation_id: c.id, sender_type: 'admin', source: 'whatsapp' },
          '-created_date', 10
        );
        const relanceCount = (recentMsgs || []).filter(m =>
          m.content && (
            m.content.includes('Bonjour, pour créer') ||
            m.content.includes("j'attends toujours") ||
            m.content.includes("j'attends votre retour") ||
            m.content.includes('Souhaitez-vous confirmer')
          )
        ).length;
        if (relanceCount >= 2) {
          // Trop de relances sans réponse — nettoyer le pending_course pour stopper définitivement
          await base44.asServiceRole.entities.Conversation.update(c.id, { venus_pending_course: '' });
          continue;
        }
      } catch {}

      aRelancer.push(c);
    }

    return aRelancer;
  } catch (e) {
    console.error('[ReasoningEngine] Erreur détection relances:', e.message);
    return [];
  }
}

/**
 * Génère un message de relance contextuel basé sur les informations manquantes.
 */
export function genererMessageRelance(memoireCourte: any): string {
  if (!memoireCourte) {
    return "Bonjour, j'attends votre retour pour finaliser votre demande. Comment puis-je vous aider ?";
  }

  if (!memoireCourte.type_course) {
    return "Bonjour, pour créer votre course, souhaitez-vous envoyer un colis, recevoir un colis, ou vous déplacer ?";
  }

  const hasDepart = memoireCourte.adresse_depart || memoireCourte.gps_depart_lat != null;
  if (!hasDepart) {
    return "Bonjour, j'attends toujours votre adresse de récupération pour finaliser votre demande. Vous pouvez m'indiquer le quartier ou partager votre localisation.";
  }

  const hasArrivee = memoireCourte.adresse_arrivee || memoireCourte.gps_arrivee_lat != null;
  if (!hasArrivee) {
    return "Bonjour, j'attends toujours l'adresse de livraison pour finaliser votre demande. Vous pouvez m'indiquer le quartier ou partager la localisation.";
  }

  const hasContact = memoireCourte.contact_telephone || memoireCourte.contact_is_client;
  if (!hasContact) {
    const typeLabel = memoireCourte.type_course === 'expedier' ? 'destinataire' : 'expéditeur';
    return `Bonjour, j'attends toujours le numéro de téléphone du ${typeLabel} pour finaliser votre demande. Si vous êtes vous-même le ${typeLabel}, indiquez-le moi.`;
  }

  return "Bonjour, votre demande est prête. Souhaitez-vous confirmer la création de cette course ? Répondez 'oui' pour confirmer.";
}