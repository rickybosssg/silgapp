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
import {
  detecterIntentionRapide,
  executerOutilsPourIntention,
  formaterOutilsPourPrompt,
  detecterHallucination,
} from './venusToolsEngine.ts';
import {
  stockerCache,
  recupererCache,
  detecterSalutation,
  detecterRaccourciFrequent,
  detecterRegleMetierDirecte,
  detecterConnaissanceDirecte,
} from './venusCache.ts';
import { genererReferenceCourse } from './venusCourseReference.ts';
import { isOpenAIEnabled, raisonnerAvecOpenAI, getOpenAIModel } from './venusOpenAIEngine.ts';
import { logOpenAIUsage, loggerMessageVenus, calculateCost } from './venusOpenAITracker.ts';

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

/**
 * Recherche les règles métier validées pour un pays donné (Source 0 — Priorité absolue).
 * Une seule règle peut s'appliquer à des centaines de conversations similaires.
 */
export async function rechercherReglesMetier(base44: any, countryCode: string): Promise<any[]> {
  try {
    const all = await base44.asServiceRole.entities.VenusBusinessRule.list('-created_date', 200);
    return (all || []).filter((r: any) =>
      (r.statut === 'valide' || r.statut === 'active') &&
      (r.pays === 'ALL' || r.pays === countryCode || !r.pays)
    );
  } catch (e) {
    console.warn('[ReasoningEngine] Erreur chargement règles métier:', e.message);
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
  force_confirmation?: boolean;
  outils_resultats?: any[];
  conversation_id?: string;
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
  business_rule_id?: string;
  knowledge_id?: string;
  document_sources?: { document_id: string; document_titre: string; chunk_id: string; score: number; version: number }[];
  temps_traitement_ms: number;
  decision_moteur?: string;
  openai_appele?: boolean;
  model_utilise?: string;
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
        'salutation', 'signalement_livreur', 'message_hors_contexte',
        'clarifier', 'autre',
      ],
    },
    contexte: {
      type: 'string',
      enum: [
        'nouvelle_course', 'course_en_cours', 'ancienne_course',
        'paiement', 'livreur', 'partenaire', 'general',
      ],
    },
    infos_connues: { type: 'string', description: 'JSON stringifié des infos connues' },
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
    reponse: { type: 'string', description: 'La réponse textuelle à envoyer au client' },
    memoire_courte_update: { type: 'string', description: 'JSON stringifié des champs à mettre à jour' },
    memoire_longue_update: { type: 'string', description: 'JSON stringifié des champs persistants' },
    business_rule_id: { type: 'string' },
    knowledge_id: { type: 'string' },
    document_sources: { type: 'string', description: 'JSON stringifié des sources documentaires' },
  },
  required: [
    'intention', 'contexte', 'infos_connues', 'infos_manquantes',
    'action', 'prochaine_question', 'outils_utilises', 'confiance',
    'reponse', 'memoire_courte_update', 'memoire_longue_update',
    'business_rule_id', 'knowledge_id', 'document_sources',
  ],
  additionalProperties: false,
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
    // Retourner la course active, ou à défaut la dernière course (même livrée/annulée)
    // pour que le LLM voie le vrai statut au lieu d'halluciner depuis l'historique
    return courses.find(c => STATUTS_ACTIFS.includes(c.statut)) || courses[0] || null;
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
  profileName: string,
  silgappFromNumber?: string
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
  // ── contact_createur_course : OBLIGATOIRE pour toute course VENUS ──
  // Le numéro WhatsApp entrant ne peut être utilisé QUE si le client a confirmé
  // explicitement (contact_createur_is_sender=true). Ne jamais réutiliser un ancien numéro.
  const hasCreateurContact = !!(cd.contact_createur_course && cd.contact_createur_course.trim());

  if (!hasDepart || !hasArrivee || !hasRequiredContact || !hasCreateurContact) {
    return { success: false, error: 'MISSING_INFO' };
  }

  const courseData: any = {
    country_code: countryCode,
    source: 'client',
    created_by_venus: true,
    client_nom: profileName || telephone,
    client_telephone: telephone,
    type_course: normalizedType,
    adresse_depart: cd.adresse_depart || 'Localisation GPS partagee',
    adresse_arrivee: cd.adresse_arrivee || 'Localisation GPS partagee',
    prix_estimate: tarifs.minimum,
    devise: tarifs.devise,
    statut: 'recherche_livreur',
    dispatch_status: 'en_attente',
    notes: cd.notes || '',
    gps_depart_lat: cd.gps_depart_lat,
    gps_depart_lng: cd.gps_depart_lng,
    gps_arrivee_lat: cd.gps_arrivee_lat,
    gps_arrivee_lng: cd.gps_arrivee_lng,
    // ── Contact principal — créateur de la course (OBLIGATOIRE) ──
    contact_createur_course: cd.contact_createur_course,
    // ── Architecture durable : enregistrer le numéro WhatsApp SILGAPP d'origine ──
    // Toutes les notifications de cette course partiront depuis ce numéro.
    // Séparé par pays et par compte WhatsApp/Twilio naturellement (chaque numéro = 1 pays + 1 compte).
    silgapp_from_number: silgappFromNumber || undefined,
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

  // ── Vérifier si le destinataire/expéditeur est déjà inscrit dans l'app ──
  const contactPhone = normalizedType === 'recevoir'
    ? (courseData.expediteur_telephone || telephone)
    : (courseData.destinataire_telephone || telephone);
  const isContactSelf = cd.contact_is_client === true || contactPhone === telephone;

  if (!isContactSelf && contactPhone) {
    try {
      // Normaliser le numéro pour la recherche (derniers 8 chiffres)
      const digits = contactPhone.replace(/\D/g, '');
      const last8 = digits.slice(-8);
      // Rechercher par téléphone exact
      let existingClients = await base44.asServiceRole.entities.ClientExterne.filter({
        telephone: contactPhone,
      });
      // Fallback: rechercher tous et filtrer par derniers 8 chiffres
      if (!existingClients || existingClients.length === 0) {
        const allClients = await base44.asServiceRole.entities.ClientExterne.filter({
          country_code: countryCode,
        });
        existingClients = (allClients || []).filter((c: any) => {
          const cd2 = (c.telephone || '').replace(/\D/g, '');
          return cd2.slice(-8) === last8;
        });
      }

      if (existingClients && existingClients.length > 0) {
        // Destinataire trouvé dans l'app → lier la course
        const clientId = existingClients[0].id;
        if (normalizedType === 'recevoir') {
          courseData.expediteur_client_id = clientId;
        } else {
          courseData.destinataire_client_id = clientId;
        }
        courseData.recipient_has_app = true;
        console.log(`[ReasoningEngine] ✅ Contact ${contactPhone} trouvé dans ClientExterne (${clientId})`);
      } else {
        // Destinataire non inscrit → envoyer infos livraison + lien téléchargement
        console.log(`[ReasoningEngine] 📤 Contact ${contactPhone} non inscrit → envoi infos + lien téléchargement`);
        try {
          await base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
            course_id: 'pending',
            evenement: 'inviter_destinataire',
            telephone: contactPhone,
            country_code: countryCode,
            client_nom: profileName || telephone,
            type_course: normalizedType,
          });
        } catch (inviteErr: any) {
          console.warn(`[ReasoningEngine] Envoi invitation destinataire échoué:`, inviteErr?.message);
        }
      }
    } catch (lookupErr: any) {
      console.warn(`[ReasoningEngine] Recherche destinataire échouée:`, lookupErr?.message);
    }
  }

  // ═══ ANTI-DOUBLON CRITIQUE — Dernière ligne de défense ═══
  // Vérification DB DIRECTE avant toute création, quelle que soit la code path appelante.
  const _STATUTS_ACTIFS_CREATE = ['nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];
  try {
    const _telDigits = telephone.replace(/\D/g, '');
    const _telPlus = telephone.startsWith('+') ? telephone : '+' + telephone;
    let _existingActive = null;
    // Recherche par client_telephone exact
    const _byClient = await base44.asServiceRole.entities.CourseExterne.filter(
      { client_telephone: _telPlus }, '-created_date', 10
    );
    _existingActive = (_byClient || []).find(c => _STATUTS_ACTIFS_CREATE.includes(c.statut)) || null;
    // Fallback: expediteur_telephone
    if (!_existingActive) {
      const _byExp = await base44.asServiceRole.entities.CourseExterne.filter(
        { expediteur_telephone: _telPlus }, '-created_date', 10
      );
      _existingActive = (_byExp || []).find(c => _STATUTS_ACTIFS_CREATE.includes(c.statut)) || null;
    }
    // Fallback: derniers 8 chiffres
    if (!_existingActive) {
      const _allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
        { country_code: countryCode }, '-created_date', 50
      );
      _existingActive = (_allRecent || []).find(c =>
        _STATUTS_ACTIFS_CREATE.includes(c.statut) &&
        ((c.client_telephone || '').replace(/\D/g, '').endsWith(_telDigits.slice(-8)) ||
         (c.expediteur_telephone || '').replace(/\D/g, '').endsWith(_telDigits.slice(-8)))
      ) || null;
    }
    if (_existingActive) {
      console.warn(`[ReasoningEngine] 🛡️ ANTI-DOUBLON CRÉATION BLOQUÉE — course active ${_existingActive.id} (${_existingActive.statut}) existe déjà pour ${telephone}`);
      return {
        success: true,
        course: _existingActive,
        message: `Vous avez déjà une course active (réf: ${(_existingActive.id || '').slice(-6).toUpperCase()}). Le livreur est en cours de recherche.`,
      };
    }
  } catch (e: any) {
    console.error('[ReasoningEngine] ANTI-DOUBLON check error (non-blocking):', e.message);
  }

  try {
    const course = await base44.asServiceRole.entities.CourseExterne.create(courseData);
    const typeLabels: any = { expedier: 'Envoi de colis', recevoir: 'Réception de colis', deplacement: 'Déplacement' };
    const typeLabel = typeLabels[normalizedType] || normalizedType;

    // Générer la référence unique : SG-YYYYMMDD-XXXXXX
    const reference = genererReferenceCourse(course);

    // ── Contact destinataire (facultatif selon le type de course) ──
    const contactDestinataire = normalizedType === 'expedier'
      ? (courseData.destinataire_telephone || '')
      : normalizedType === 'recevoir'
        ? (courseData.expediteur_telephone || '')
        : '';

    const message = `📦 Course créée avec succès !

📝 Référence : ${reference}
🚚 Type : ${typeLabel}
📍 Départ : ${cd.adresse_depart || 'Localisation GPS'}
🎯 Destination : ${cd.adresse_arrivee || 'Localisation GPS'}

📞 Contact principal — créateur de la course : ${cd.contact_createur_course}
📞 Contact destinataire : ${contactDestinataire || 'Non renseigné'}

⏱️ Temps estimé de recherche d'un livreur : moins de 2 minutes.

Je vous informerai dès qu'un livreur aura accepté votre demande. Le livreur contactera en priorité le créateur de la course pour confirmer les derniers détails et le coût de la livraison.`;

    // ── Déclencher le dispatch immédiatement (sans attendre l'automatisation programmée) ──
    base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
      action: 'lancer_recherche_auto',
      course_id: course.id,
    }).catch((err: any) => {
      console.error(`[ReasoningEngine] ❌ Erreur dispatch immédiat course ${course.id}:`, err?.message || err);
    });

    // ── Notification modale à l'administrateur ──
    try {
      const now = new Date();
      const dateStr = now.toLocaleString('fr-FR', { timeZone: 'Africa/Ouagadougou' });
      await base44.asServiceRole.entities.Notification.create({
        titre: `🤖 Nouvelle course créée par VENUS`,
        message: `Client: ${profileName || telephone}\nRéf: ${reference}\nDépart: ${cd.adresse_depart || 'GPS'}\nArrivée: ${cd.adresse_arrivee || 'GPS'}\nDate: ${dateStr}`,
        type: 'nouvelle_course_venus',
        course_id: course.id,
        lue: false,
      });
      console.log(`[ReasoningEngine] 📢 Notification admin créée pour course VENUS ${course.id}`);
    } catch (notifErr: any) {
      console.error(`[ReasoningEngine] Erreur notification admin:`, notifErr?.message);
    }

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
  '1200 logements', 'mille logements', '2000 logements', 'sonabel', 'sonatur',
  'ouden', 'pestel', 'chateau', 'tanghin', 'sapone', 'polesgo', 'nongremassom',
  'wemtenga', 'dagnoen', 'zogona', 'sigsoghesse', 'kalgondin', 'tampouy',
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

  // Numéro de téléphone (format international long ou local groupé)
  // Supporte: +22655738247, 0022655738247, 70 12 34 56, 70123456
  const phoneMatchLong = message.match(/\+?\d[\d\s.-]{7,}/);
  if (phoneMatchLong) {
    const phone = phoneMatchLong[0].replace(/[\s.-]/g, '');
    if (phone.length >= 8) {
      updates.contact_telephone = phoneMatchLong[0].trim();
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
// 4b. DÉTECTION D'INPUT SUSPECT (sécurité proactive)
// ═══════════════════════════════════════════════════════════════════

const PATTERNS_MALVEILLANTS = [
  /<script[^>]*>/i,
  /<\/script>/i,
  /eval\s*\(/i,
  /require\s*\(/i,
  /child_process/i,
  /exec\s*\(/i,
  /document\.cookie/i,
  /window\.location/i,
  /localStorage/i,
  /sessionStorage/i,
  /fetch\s*\(/i,
  /XMLHttpRequest/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /javascript:/i,
  /import\s+/i,
  /export\s+/i,
  /process\.env/i,
  /__proto__/i,
  /constructor\[/i,
];

const PATTERNS_INJECTION_PROMPT = [
  /ignore (les? )?instructions? (pr[ée]c[ée]dentes?|pr[ée]c[ée]dente)/i,
  /tu es maintenant/i,
  /tu es d[ae]sormais/i,
  /activer? le mode (admin|d[ée]veloppeur|root)/i,
  /r[ée]initialiser tes instructions/i,
  /oublie tes r[èe]gles/i,
  /ignore tes r[èe]gles/i,
  /system prompt/i,
  /reveal your (system )?prompt/i,
  /ignore your (previous )?instructions/i,
  /instructions? syst[èe]me/i,
  /r[èe]gles? internes?/i,
  /affiche (le |ta )?(contenu|code) (de )?tes? (instructions?|r[èe]gles?)/i,
  /montre (moi )?tes? (instructions?|r[èe]gles?|prompt)/i,
  /mode (dan|jailbreak|sans restrictions?)/i,
];

/**
 * Détecte si un message client contient des patterns potentiellement malveillants.
 * Retourne { suspect: boolean, raison: string }.
 */
export function detecterInputSuspect(message: string): { suspect: boolean; raison: string } {
  if (!message || typeof message !== 'string') return { suspect: false, raison: '' };

  for (const pattern of PATTERNS_MALVEILLANTS) {
    if (pattern.test(message)) {
      return { suspect: true, raison: `Pattern malveillant détecté: ${pattern.source}` };
    }
  }

  for (const pattern of PATTERNS_INJECTION_PROMPT) {
    if (pattern.test(message)) {
      return { suspect: true, raison: `Tentative d'injection de prompt: ${pattern.source}` };
    }
  }

  return { suspect: false, raison: '' };
}

/**
 * Génère une réponse de refus sécurisé pour les inputs suspects.
 */
function genererReponseRefusSecurite(): string {
  return "Je suis VENUS, l'assistante de SILGAPP. Je ne peux pas traiter ce type de message. Si vous avez besoin d'une livraison, d'un envoi de colis ou d'un déplacement, je suis là pour vous aider. Comment puis-je vous être utile ?";
}

// ═══════════════════════════════════════════════════════════════════
// 5. MOTEUR DE RAISONNEMENT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export async function raisonnerVenus(base44: any, input: ReasoningInput): Promise<ReasoningResult> {
  const startTime = Date.now();

  // ── Pré-check sécurité : détecter les inputs potentiellement malveillants ──
  const inputSuspect = detecterInputSuspect(input.messageClient);
  if (inputSuspect.suspect) {
    console.warn(`[ReasoningEngine] 🛡️ Input suspect détecté — refus proactif: ${inputSuspect.raison}`);
    return {
      intention: 'autre',
      contexte: 'general',
      infos_connues: {},
      infos_manquantes: [],
      action: 'repondre_info',
      prochaine_question: '',
      outils_utilises: ['security_check:blocked'],
      confiance: 100,
      reponse: genererReponseRefusSecurite(),
      memoire_courte_update: {},
      memoire_longue_update: {},
      business_rule_id: undefined,
      document_sources: undefined,
      temps_traitement_ms: Date.now() - startTime,
      decision_moteur: 'securite',
      openai_appele: false,
      model_utilise: '',
    };
  }

  // ── ÉCONOMIE DE CRÉDITS: Court-circuit salutation (0 crédit LLM) ──
  const salutation = detecterSalutation(input.messageClient);
  if (salutation) {
    salutation.temps_traitement_ms = Date.now() - startTime;
    salutation.decision_moteur = 'salutation';
    return salutation;
  }

  // ── ÉCONOMIE DE CRÉDITS: Cache de réponses (0 crédit LLM) ──
  const cached = recupererCache(input.telephone, input.messageClient, input.memoireCourte);
  if (cached) {
    cached.temps_traitement_ms = Date.now() - startTime;
    cached.decision_moteur = 'cache';
    cached.openai_appele = false;
    cached.model_utilise = '';
    return cached;
  }

  // ── ÉCONOMIE DE CRÉDITS: Raccourcis questions fréquentes (0 crédit LLM) ──
  const raccourci = detecterRaccourciFrequent(input.messageClient, input.courseActive);
  if (raccourci) {
    raccourci.temps_traitement_ms = Date.now() - startTime;
    raccourci.decision_moteur = 'raccourci';
    raccourci.openai_appele = false;
    raccourci.model_utilise = '';
    stockerCache(input.telephone, input.messageClient, input.memoireCourte, raccourci);
    return raccourci;
  }

  // ── Construire l'historique lisible ──
  const historiqueStr = input.historiqueRecent
    .map(m => `${m.sender_type === 'client' ? 'Client' : 'VENUS'}: ${m.content || `[${m.message_type}]`}`)
    .join('\n') || 'Aucun historique';

  // ── GPT extrait lui-même les infos du message. Pas d'heuristique pré-LLM. ──
  const mergedMemoireCourte: Record<string, any> = { ...(input.memoireCourte || {}) };

  // ── Mémoire courte lisible (avec heuristique fusionnée) ──
  const memoireCourteStr = Object.keys(mergedMemoireCourte).length > 0
    ? JSON.stringify(mergedMemoireCourte, null, 2)
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

  // ── Course active (ou dernière course si aucune active) ──
  let courseActiveStr = 'Aucune course trouvée';
  if (input.courseActive) {
    const c = input.courseActive;
    const estActive = STATUTS_ACTIFS.includes(c.statut);
    courseActiveStr = JSON.stringify({
      ref: c.id?.slice(-6),
      statut: c.statut,
      est_active: estActive,
      type: c.type_course,
      depart: c.adresse_depart,
      arrivee: c.adresse_arrivee,
      livreur_nom: c.livreur_nom || null,
      livreur_telephone: c.livreur_telephone || null,
      tracking_link: c.tracking_link || null,
      heure_livraison: c.heure_livraison || null,
    }, null, 2);
  }

  // ── OPTIMISATION VITESSE: Charger toutes les sources en PARALLÈLE ──
  // Avant: 5 appels DB séquentiels (~700-1600ms). Maintenant: 1 vague parallèle (~200-400ms).
  const tLoadStart = Date.now();
  const [knowledgeRes, ragRes, ctxRes, scenarioRes, rulesRes] = await Promise.allSettled([
    rechercherConnaissancesValidees(base44, input.countryCode),
    rechercherDocumentsRag(base44, input.messageClient, { pays: input.countryCode, limit: 5, conversation_id: input.telephone }),
    construireContexteVenus(base44, input.telephone, input.messageClient),
    rechercherScenariosValidees(base44, input.countryCode),
    rechercherReglesMetier(base44, input.countryCode),
  ]);
  console.log(`[ReasoningEngine] ⏱️ Sources chargées en parallèle: ${Date.now() - tLoadStart}ms`);

  // ── Base de connaissances ──
  let knowledgeStr = 'Aucune entree pertinente';
  let knowledgeEntries: any[] = knowledgeRes.status === 'fulfilled' ? knowledgeRes.value : [];
  if (knowledgeEntries.length > 0) {
    knowledgeStr = knowledgeEntries.slice(0, 10).map((k, i) =>
      `[${i + 1}] Q: ${k.question}\n    R: ${(k.reponse_officielle || '').substring(0, 200)}\n    ID: ${k.id}`
    ).join('\n');
  }

  // ── Bibliothèque documentaire RAG ──
  let documentStr = 'Aucun document pertinent trouve';
  let documentResults: any[] = [];
  if (ragRes.status === 'fulfilled' && ragRes.value?.a_reussi && ragRes.value.resultats.length > 0) {
    documentResults = ragRes.value.resultats;
    documentStr = ragRes.value.resultats.map((r, i) =>
      `[DOC ${i + 1}] Source: ${r.document_titre} (v${r.document_version}, ${r.document_categorie})\n    Score: ${r.score}\n    Contenu: ${(r.contenu || '').substring(0, 400)}\n    Doc ID: ${r.document_id} | Chunk ID: ${r.chunk_id}`
    ).join('\n\n');
    console.log(`[ReasoningEngine] 📚 RAG: ${ragRes.value.resultats.length} documents trouvés en ${ragRes.value.temps_ms}ms`);
  }

  // ── Contexte localisé ──
  let localizedSystemPrompt = '';
  if (ctxRes.status === 'fulfilled') localizedSystemPrompt = ctxRes.value?.systemPrompt || '';

  // ── Scénarios validés ──
  let scenarioStr = 'Aucun scénario pertinent';
  let scenarioEntries: any[] = scenarioRes.status === 'fulfilled' ? scenarioRes.value : [];
  if (scenarioEntries.length > 0) {
    scenarioStr = scenarioEntries.slice(0, 5).map((s, i) =>
      `[${i + 1}] Scénario: ${s.nom}\n    Déclencheurs: ${s.declencheurs || 'N/A'}\n    Réponse idéale: ${(s.reponse_ideale || '').substring(0, 200)}`
    ).join('\n');
  }

  // ── Règles métier ──
  let businessRulesStr = 'Aucune règle métier applicable';
  let businessRuleEntries: any[] = rulesRes.status === 'fulfilled' ? rulesRes.value : [];
  if (businessRuleEntries.length > 0) {
    businessRulesStr = businessRuleEntries.slice(0, 20).map((r, i) =>
      `[RÈGLE ${i + 1}] ID: ${r.id}\n    Titre: ${r.nom}\n    Principe: ${(r.description || '').substring(0, 300)}\n    Conditions: ${(r.conditions_application || 'N/A').substring(0, 200)}\n    Exceptions: ${(r.exceptions || 'N/A').substring(0, 150)}\n    Exemples: ${(r.exemples || 'N/A').substring(0, 200)}\n    Réponse associée: ${(r.reponse_associee || 'N/A').substring(0, 200)}\n    Priorité: ${r.priorite || 'haute'}`
    ).join('\n');
    console.log(`[ReasoningEngine] 📖 ${businessRuleEntries.length} règles métier chargées`);
  }

  // ── ÉCONOMIE DE CRÉDITS: Règles métier directes (0 crédit LLM) ──
  // SAUF si une conversation est en cours (mémoire courte non vide) — l'utilisateur
  // répond probablement à une question de VENUS, ce n'est pas une requête standalone.
  const hasActiveFlow = input.memoireCourte && Object.keys(input.memoireCourte)
    .filter(k => k !== 'course_created' && k !== 'course_id')
    .some(k => input.memoireCourte[k] != null && input.memoireCourte[k] !== '');

  if (!hasActiveFlow) {
    const regleDirecte = detecterRegleMetierDirecte(input.messageClient, businessRuleEntries);
    if (regleDirecte) {
      regleDirecte.temps_traitement_ms = Date.now() - startTime;
      regleDirecte.decision_moteur = 'regle_metier';
      regleDirecte.openai_appele = false;
      regleDirecte.model_utilise = '';
      stockerCache(input.telephone, input.messageClient, input.memoireCourte, regleDirecte);
      return regleDirecte;
    }

    // ── ÉCONOMIE DE CRÉDITS: Connaissances directes (0 crédit LLM) ──
    const connaissanceDirecte = detecterConnaissanceDirecte(input.messageClient, knowledgeEntries);
    if (connaissanceDirecte) {
      connaissanceDirecte.temps_traitement_ms = Date.now() - startTime;
      connaissanceDirecte.decision_moteur = 'connaissance';
      connaissanceDirecte.openai_appele = false;
      connaissanceDirecte.model_utilise = '';
      stockerCache(input.telephone, input.messageClient, input.memoireCourte, connaissanceDirecte);
      return connaissanceDirecte;
    }
  } else {
    console.log('[ReasoningEngine] 🔄 Conversation en cours — bypass connaissances/règles ignorés (LLM gère la suite)');
  }

  // ── Construire le prompt de raisonnement (version compactée) ──
  const audioNote = input.isAudioTranscription
    ? `═══ TRANSCRIPTION VOCALE ═══
Le message peut contenir des erreurs. Quartiers Ouagadougou: Karpala, Pissy, Tampouy, Ouaga 2000, Zone du Bois, Patte d'Oie, Gounghin, Dassasgho, Cissin, Samandin, Wemtenga, Bendogo, Larle, Somgande, Saaba, Tanghin, Kossodo, 1200/2000 Logements, Sonabel, Sonatur, Château, Polesgo, Sapone, Dagnoen, Zogona.`
    : '';

  const prompt = `${localizedSystemPrompt || 'Tu es VENUS, l\'assistante virtuelle SILGAPP avec un MOTEUR DE RAISONNEMENT avancé.'}

═══ RÈGLES MÉTIER (Source 0 — PRIORITÉ ABSOLUE) ═══
Vérifie si une règle s'applique AVANT de répondre. Si oui, mets business_rule_id = ID de la règle.
${businessRulesStr}

═══ SCÉNARIOS VALIDÉS (Source 4) ═══
${scenarioStr}

═══ CONTEXTE CLIENT ═══
Téléphone: ${input.telephone} | Nom: ${input.profileName || input.telephone}
Pays: ${input.countryCode} (${input.tarifs.nom}) | Tarifs: ${input.tarifs.prix_km} ${input.tarifs.devise}/km, min ${input.tarifs.minimum} ${input.tarifs.devise}

═══ MÉMOIRE COURTE ═══
${memoireCourteStr}

═══ MÉMOIRE LONGUE ═══
${memoireLongueStr}

═══ HISTORIQUE RÉCENT ═══
${historiqueStr}

═══ COURSE ACTIVE / DERNIÈRE ═══
${courseActiveStr}
⚠️ Vérifie "est_active". Si false (livree/annulee), la course N'EST PLUS ACTIVE. Ne JAMAIS dire qu'une course livrée/annulée est active. Si est_active=false et le client demande une course → tu PEUX créer.

═══ BASE DE CONNAISSANCES (Source 2) ═══
${knowledgeStr}

═══ BIBLIOTHÈQUE DOCUMENTAIRE (Source 3) ═══
${documentStr}

═══ DONNÉES OPÉRATIONNELLES (Source 6) ═══
${input.outils_resultats ? formaterOutilsPourPrompt(input.outils_resultats) : 'Aucun outil appelé.'}

═══ ANTI-HALLUCINATION ═══
- Utilise UNIQUEMENT les données ci-dessus. N'INVENTE JAMAIS un statut, prix, nom de livreur ou référence.
- Si un outil retourne NON TROUVÉ, dis-le clairement.
- Une course livrée/annulée (est_active=false) n'est JAMAIS active.

${audioNote}

${input.force_confirmation ? `═══ AUDIO FAIBLE CONFIANCE ═══
Reformule: "Si j'ai bien compris...". NE JAMAIS créer de course directement (action=poser_question). Demande confirmation.` : ''}

═══ MESSAGE DU CLIENT ═══
${input.messageClient}

═══ ANALYSE — Qui parle ? ═══
- CLIENT (veut un service): "je voudrais envoyer", "je veux livrer", "j'ai besoin d'une livraison", "envoyer un colis", "expédier un colis", "j'aimerais expedier" → intention=creer_course
- LIVREUR (rapporte statut): "j'ai fini à", "je suis à", "je pars de", "j'ai récupéré" → intention=signalement_livreur (NE PAS créer de course)
- HORS CONTEXTE (parle à quelqu'un d'autre): "tu n'es pas au bureau?", "sors", "appelle-moi" → intention=message_hors_contexte (répondre poliment)

═══ ANALYSE — Réponse à une question VENUS ═══
Si VENUS a posé une question dans son dernier message, le message actuel est LA RÉPONSE:
- VENUS demande le type → "envoyer un colis" / "expédier" / "recevoir" / "déplacement" = type_course (PAS demander_info)
- VENUS demande l'adresse → "Patte d'Oie" / "Karpala" = adresse (PAS demander_info)
- VENUS demande le numéro → "+226..." = contact (PAS demander_info)
JAMAIS rediriger vers un "service partenaire" ou "contacter le support" quand le client répond à une question de VENUS.

═══ ANALYSE — Intention ═══
creer_course | suivre_course | contacter_livreur | annuler_course | modifier_info | demander_info | salutation | signalement_livreur | message_hors_contexte | clarifier | autre
- "Le livreur est où?" / "Il arrive quand?" → suivre_course
- "Je veux lui parler" → contacter_livreur
- "C'est combien?" → demander_info
- Mentionner un quartier seul ≠ demande de course. Ne crée QUE si demande explicite de service.

═══ ANALYSE — Contexte ═══
nouvelle_course | course_en_cours | ancienne_course | paiement | livreur | partenaire | general

═══ INFOS REQUISES POUR creer_course ═══
type_course, adresse_depart (ou GPS), adresse_arrivee (ou GPS), contact_createur_course (OBLIGATOIRE), ET contact_telephone si type_course = expedier ou recevoir.
- contact_createur_course = numéro du CRÉATEUR de la course (contact principal du livreur). OBLIGATOIRE pour chaque course. Ne JAMAIS copier auto le numéro WhatsApp entrant — demander explicitement. Exception: si le client dit "c'est mon numéro"/"c'est moi" → autorisé après confirmation. Ne JAMAIS réutiliser un ancien numéro.
- Pour "expedier": contact_telephone = DESTINATAIRE. Pour "recevoir": contact_telephone = EXPÉDITEUR. OBLIGATOIRE.
- Pour "deplacement": contact destinataire FACULTATIF.
- Nom du destinataire/expéditeur FACULTATIF (seul le téléphone est requis).

═══ FLUX CRÉATION DE COURSE (STRICT) ═══
a) Infos manquantes → action=poser_question (UNE SEULE question).
b) Toutes infos présentes ET récapitulatif pas encore montré → montre récapitulatif COMPLET + "Confirmez-vous la création de cette course ?" (action=poser_question).
c) Récapitulatif montré + client répond oui/ok/d'accord/je confirme/valider/go → action=creer_course.
d) Client corrige → mets à jour memoire_courte_update, reviens à (a) ou (b).
JAMAIS de "all_info_collected" ou "user_confirmed" (ces champs n'existent pas).
INTERDICTION: Ne JAMAIS dire "je lance la création"/"je crée"/"je valide"/"je finalise" tant que: contact_telephone non collecté ET récapitulatif non présenté ET client n'a pas confirmé.
Si contact_telephone manquant → action DOIT être poser_question, JAMAIS creer_course.

═══ ACTIONS POSSIBLES ═══
poser_question | creer_course | suivre_course | contacter_livreur | annuler_course | repondre_info | clarifier | saluer
- signalement_livreur et message_hors_contexte → action=repondre_info
- signalement_livreur: "Merci pour cette mise à jour ! Bonne continuation !"
- message_hors_contexte: "Je suis VENUS, l'assistante SILGAPP. Il semble que votre message s'adresse à quelqu'un d'autre. Si vous avez besoin d'une livraison, je suis là pour vous aider !"

═══ RÈGLES CRITIQUES ═══
1. ANTI-BOUCLE: Ne JAMAIS redemander une info déjà en mémoire courte.
2. UNE SEULE question par réponse si action=poser_question.
3. CORRECTIONS: Si client corrige ("non c'est Y"), mets à jour et confirme.
4. PAS DE PRIX: Ne JAMAIS inventer un prix. Le livreur confirmera le coût.
5. SALUTATION simple (Bonjour/Bonsoir/Salut) sans course en cours → accueil chaleureux SANS mentionner de services. Modèle: "Bonjour 👋 Je suis VENUS, l'assistante intelligente de SILGAPP. Comment puis-je vous aider aujourd'hui ?"
6. CONTINUITÉ: Si VENUS a posé une question, le message actuel est probablement LA RÉPONSE. Ne pas réinterpréter comme nouvelle demande. Ne pas écraser une adresse/type_course déjà connu. Un numéro = contact_telephone, pas nouvelle demande. Ne pas reformuler "Si j'ai bien compris..." si la réponse est directe.
7. ANTI-FAUX-ANNULATION: "Oui"/"OK"/"D'accord" SEUL ≠ annuler_course. Annulation UNIQUEMENT si mot explicite ("annule", "plus besoin") OU VENUS a posé une question d'annulation et client répond oui.
8. NOUVELLE COURSE APRÈS FIN: "nouvelle course"/"autre course" sans course active → vide mémoire courte, recommence collecte depuis zéro.
9. RAG/RÈGLES = CONTEXTE uniquement. C'est TOI qui décides, le RAG ne répond pas à ta place.
10. Ne JAMAIS confondre: numéro WhatsApp entrant, créateur de course, expéditeur, destinataire.
11. Récapitulatif DOIT afficher: 📞 Contact principal — créateur : [numéro] + 📞 Contact destinataire : [numéro ou "Non renseigné"]

═══ MÉMOIRE COURTE À METTRE À JOUR ═══
Uniquement les champs nouveaux/modifiés. type_course: "expedier"|"recevoir"|"deplacement" uniquement.

═══ MÉMOIRE LONGUE À METTRE À JOUR ═══
Champs persistants: client_nom, ville_habituelle, quartier_habituel, langue_preferee, type_course_prefere, mode_paiement_prefere, adresse_recuperee, adresse_livraison, destinataire_nom, destinataire_telephone.

═══ LANGUE ═══
Réponds TOUJOURS en français.

Réponds UNIQUEMENT avec un JSON.`;

  // ── Appel LLM (OpenAI en priorité, fallback InvokeLLM Base44) ──
  const tLLMStart = Date.now();
  let openaiWasAttempted = false;
  let openaiErrorMsg = '';
  try {
    let llmRes: any = null;

    // ── Tentative OpenAI (si activé via SystemConfig VENUS_OPENAI_ENABLED) ──
    if (await isOpenAIEnabled(base44)) {
      try {
        openaiWasAttempted = true;
        llmRes = await raisonnerAvecOpenAI(base44, prompt, RAISONNEMENT_SCHEMA, {
          telephone: input.telephone,
          countryCode: input.countryCode,
          tarifs: input.tarifs,
          profileName: input.profileName,
          messageClient: input.messageClient,
          memoireCourte: mergedMemoireCourte,
          courseActive: input.courseActive,
        });
        const openaiTime = Date.now() - tLLMStart;
        console.log(`[ReasoningEngine] ⏱️ OpenAI: ${openaiTime}ms | tools: ${(llmRes as any)?._outils_openai || 'none'} | tokens: ${(llmRes as any)?._tokens_openai || 'N/A'}`);
        logOpenAIUsage(base44, {
          model: (llmRes as any)?._model_openai || await getOpenAIModel(base44),
          tokens_prompt: (llmRes as any)?._tokens_prompt || 0,
          tokens_completion: (llmRes as any)?._tokens_completion || 0,
          tokens_total: (llmRes as any)?._tokens_openai || 0,
          response_time_ms: openaiTime,
          status: 'success',
          telephone: input.telephone,
          tools_used: (llmRes as any)?._outils_openai || '',
        }).catch(() => {});
      } catch (openaiErr: any) {
        openaiErrorMsg = openaiErr.message?.substring(0, 500) || 'Unknown error';
        const errTime = Date.now() - tLLMStart;
        console.warn(`[ReasoningEngine] ⚠️ OpenAI échec (${openaiErr.message}), fallback InvokeLLM`);
        llmRes = null;
        logOpenAIUsage(base44, {
          model: await getOpenAIModel(base44),
          tokens_prompt: 0, tokens_completion: 0, tokens_total: 0,
          response_time_ms: errTime,
          status: 'error',
          error_message: openaiErr.message?.substring(0, 500) || 'Unknown error',
          telephone: input.telephone,
        }).catch(() => {});
      }
    }

    // ── Fallback: InvokeLLM (Base44) ──
    if (!llmRes) {
      const wasOpenAIEnabled = await isOpenAIEnabled(base44);
      llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: RAISONNEMENT_SCHEMA,
      });
      const fallbackTime = Date.now() - tLLMStart;
      console.log(`[ReasoningEngine] ⏱️ LLM (Base44): ${fallbackTime}ms`);
      if (wasOpenAIEnabled) {
        logOpenAIUsage(base44, {
          model: await getOpenAIModel(base44),
          tokens_prompt: 0, tokens_completion: 0, tokens_total: 0,
          response_time_ms: fallbackTime,
          status: 'fallback',
          error_message: 'Fallback vers InvokeLLM (Base44)',
          telephone: input.telephone,
        }).catch(() => {});
      }
    }

    const result: ReasoningResult = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes as ReasoningResult;
    result.temps_traitement_ms = Date.now() - startTime;

    // ── Post-traitement : valider et nettoyer ──
    if (!result.action) result.action = 'repondre_info';
    // GPT-5 omet parfois le champ intention — utiliser l'heuristique rapide comme fallback
    if (!result.intention || result.intention === 'undefined') {
      const intentionRapide = detecterIntentionRapide(input.messageClient);
      result.intention = intentionRapide || 'autre';
      console.log(`[ReasoningEngine] ℹ️ Intention LLM vide → fallback heuristique: ${result.intention}`);
    }
    if (!result.contexte) result.contexte = 'general';
    if (!result.reponse || (typeof result.reponse === 'string' && result.reponse.trim().length === 0)) {
      console.warn('[ReasoningEngine] ⚠️ LLM a retourné une réponse vide — fallback contextuel');
      result.reponse = "Je n'ai pas bien compris votre demande. Pouvez-vous reformuler ?";
      result.confiance = 30; // Confiance faible → ne sera pas mis en cache
    }
    if (result.confiance === undefined || result.confiance === null) result.confiance = 50;
    if (result.confiance <= 1) result.confiance = Math.round(result.confiance * 100);
    if (!result.outils_utilises) result.outils_utilises = [];
    if (!result.infos_manquantes) result.infos_manquantes = [];

    // ── Parser les champs stringifiés (schéma strict compatible) ──
    if (typeof result.infos_connues === 'string') {
      try { result.infos_connues = JSON.parse(result.infos_connues); } catch { result.infos_connues = {}; }
    }
    if (!result.infos_connues) result.infos_connues = {};
    if (typeof result.memoire_courte_update === 'string') {
      try { result.memoire_courte_update = JSON.parse(result.memoire_courte_update); } catch { result.memoire_courte_update = {}; }
    }
    if (!result.memoire_courte_update) result.memoire_courte_update = {};
    if (typeof result.memoire_longue_update === 'string') {
      try { result.memoire_longue_update = JSON.parse(result.memoire_longue_update); } catch { result.memoire_longue_update = {}; }
    }
    if (!result.memoire_longue_update) result.memoire_longue_update = {};
    if (typeof result.document_sources === 'string') {
      try { result.document_sources = JSON.parse(result.document_sources); } catch { result.document_sources = undefined; }
    }

    // ── Filtrer les champs vides du memoire_courte_update ──
    const llmUpdateFiltered: Record<string, any> = {};
    for (const [k, v] of Object.entries(result.memoire_courte_update || {})) {
      if (v !== '' && v !== null && v !== undefined) {
        llmUpdateFiltered[k] = v;
      }
    }
    result.memoire_courte_update = llmUpdateFiltered;
    // Fusionner infos_connues avec la mémoire existante
    result.infos_connues = { ...mergedMemoireCourte, ...(result.infos_connues || {}) };

    // Valider le business_rule_id
    if (result.business_rule_id && businessRuleEntries.length > 0) {
      const match = businessRuleEntries.find(r => r.id === result.business_rule_id);
      if (!match) {
        result.business_rule_id = undefined;
      } else {
        if (!result.outils_utilises) result.outils_utilises = [];
        if (!result.outils_utilises.includes('business_rule')) {
          result.outils_utilises.push('business_rule');
        }
        console.log(`[ReasoningEngine] 📖 Règle métier appliquée: ${match.nom}`);
      }
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

    // ── Tracer la décision du moteur pour l'audit ──
    const _meta: any = result as any;
    if (_meta._model_openai) {
      result.decision_moteur = 'openai';
      result.openai_appele = true;
      result.model_utilise = _meta._model_openai;
    } else if (openaiWasAttempted) {
      result.decision_moteur = 'fallback_base44';
      result.openai_appele = true;
      result.model_utilise = 'base44-invoke-llm (fallback)';
      (result as any)._erreur_openai = openaiErrorMsg;
    } else {
      result.decision_moteur = 'rag_llm';
      result.openai_appele = false;
      result.model_utilise = 'base44-invoke-llm';
    }

    // ── ÉCONOMIE DE CRÉDITS: Stocker la réponse en cache pour réutilisation ──
    stockerCache(input.telephone, input.messageClient, input.memoireCourte, result);

    return result;
  } catch (e: any) {
    const isContentFilter = e.message && (e.message.includes('403') || e.message.includes('content filter'));
    console.error(`[ReasoningEngine] Erreur raisonnement${isContentFilter ? ' (filtre contenu LLM)' : ''}:`, e.message);

    // Si le filtre de contenu a bloqué le message, retourner un refus explicite
    if (isContentFilter) {
      return {
        intention: 'autre',
        contexte: 'general',
        infos_connues: {},
        infos_manquantes: [],
        action: 'repondre_info',
        prochaine_question: '',
        outils_utilises: ['content_filter:blocked'],
        confiance: 100,
        reponse: genererReponseRefusSecurite(),
        memoire_courte_update: {},
        memoire_longue_update: {},
        business_rule_id: undefined,
        document_sources: undefined,
        temps_traitement_ms: Date.now() - startTime,
        decision_moteur: 'erreur',
        openai_appele: false,
        model_utilise: '',
        _erreur_detail: `Filtre contenu LLM: ${e.message?.substring(0, 300) || '403/content filter'}`,
      };
    }

    // Erreur LLM générique — fallback standard
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
      business_rule_id: undefined,
      document_sources: undefined,
      temps_traitement_ms: Date.now() - startTime,
      decision_moteur: 'erreur',
      openai_appele: false,
      model_utilise: '',
      _erreur_detail: `Erreur raisonnement: ${e.message?.substring(0, 400) || 'Unknown error'}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5b. RAISONNEMENT AVEC OUTILS (wrapper intégrant le moteur d'outils)
// ═══════════════════════════════════════════════════════════════════

export async function raisonnerVenusAvecOutils(
  base44: any,
  input: ReasoningInput
): Promise<{ result: ReasoningResult; outils_resultats: any[]; intention_rapide: string; hallucination: any }> {
  // ── Étape 1 : Détection d'intention rapide (heuristique) ──
  const intentionRapide = detecterIntentionRapide(input.messageClient);
  console.log(`[ReasoningEngine] 🎯 Intention rapide détectée: ${intentionRapide}`);

  // ── Étape 2 : Exécution des outils pertinents ──
  const ctx = {
    telephone: input.telephone,
    countryCode: input.countryCode,
    profileName: input.profileName,
    memoireCourte: input.memoireCourte,
    courseActive: input.courseActive,
    messageClient: input.messageClient,
  };

  let outilsResultats: any[] = [];
  try {
    outilsResultats = await executerOutilsPourIntention(base44, intentionRapide, ctx);
    console.log(`[ReasoningEngine] 🔧 ${outilsResultats.length} outil(s) exécuté(s) pour intention "${intentionRapide}"`);
  } catch (e) {
    console.warn('[ReasoningEngine] Erreur exécution outils:', e.message);
  }

  // ── Étape 3 : Raisonnement LLM avec données d'outils injectées ──
  const result = await raisonnerVenus(base44, {
    ...input,
    outils_resultats: outilsResultats,
  });

  // Les outils opérationnels restent la source de vérité lorsque le LLM
  // reformule mal une intention pourtant détectée sans ambiguïté.
  if (intentionRapide === 'suivre_course') {
    const courseTool = outilsResultats.find(o => o.outil === 'rechercher_course_active');
    if (courseTool && !courseTool.trouve) {
      result.intention = 'suivre_course';
      result.action = 'suivre_course';
      result.reponse = "Je ne trouve aucune course active associée à votre compte.";
    }
  } else if (intentionRapide === 'demander_info' && result.intention === 'autre') {
    result.intention = 'demander_info';
  }

  // ── Étape 4 : Vérification anti-hallucination ──
  const hallucination = detecterHallucination(result.reponse, outilsResultats);
  if (hallucination.suspecte) {
    console.warn(`[ReasoningEngine] ⚠️ Hallucination suspectée: ${hallucination.details}`);
    if (!result.outils_utilises) result.outils_utilises = [];
    result.outils_utilises.push('hallucination_check:warn');
  }

  // ── Étape 5 : Log COMPLET du message pour audit permanent ──
  const _meta: any = result as any;
  const _modelForCost = _meta._model_openai || '';
  const _tokensPrompt = _meta._tokens_prompt || 0;
  const _tokensCompletion = _meta._tokens_completion || 0;
  const _coutUsd = _modelForCost ? calculateCost(_modelForCost, _tokensPrompt, _tokensCompletion) : 0;
  const _tokensTotal = _meta._tokens_openai || 0;
  loggerMessageVenus(base44, {
    telephone: input.telephone,
    conversation_id: input.conversation_id,
    message_client: input.messageClient,
    decision_moteur: result.decision_moteur || 'rag_llm',
    openai_appele: result.openai_appele ?? false,
    model_utilise: result.model_utilise || '',
    rag_documents: result.document_sources,
    outils_utilises: result.outils_utilises,
    temps_reponse_ms: result.temps_traitement_ms,
    cout_usd: _coutUsd,
    tokens_total: _tokensTotal,
    reponse_envoyee: result.reponse,
    intention: result.intention,
    action: result.action,
    confiance: result.confiance,
    statut: result.decision_moteur === 'erreur' ? 'erreur' : 'succes',
    erreur_detail: (result as any)._erreur_detail || (result as any)._erreur_openai || '',
  });

  return {
    result,
    outils_resultats: outilsResultats,
    intention_rapide: intentionRapide,
    hallucination,
  };
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
      business_rule_id: logData.result.business_rule_id || undefined,
      knowledge_id: logData.result.knowledge_id || undefined,
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

      // ── Ne pas relancer si le dernier message du client indique un abandon ──
      try {
        const lastClientMsgs = await base44.asServiceRole.entities.Message.filter(
          { conversation_id: c.id, sender_type: 'client' },
          '-created_date', 1
        );
        const lastClientContent = (lastClientMsgs?.[0]?.content || '').toLowerCase();
        const ABANDON_PATTERNS = [
          'laisse tomber', 'laissez tomber', 'oublie', 'oubliez', 'plus besoin',
          'plus la peine', 'abandonne', 'tant pis', 'non rien', 'plus rien',
          'je ne veux plus', 'je veux plus',
        ];
        if (ABANDON_PATTERNS.some(p => lastClientContent.includes(p))) {
          await base44.asServiceRole.entities.Conversation.update(c.id, { venus_pending_course: '' });
          continue;
        }
      } catch {}

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

  const hasCreateurContact = memoireCourte.contact_createur_course;
  if (!hasCreateurContact) {
    return "Bonjour, j'attends toujours le numéro de téléphone de la personne qui crée cette course et que le livreur devra contacter en priorité. Si c'est votre numéro, indiquez-le moi.";
  }

  return "Bonjour, votre demande est prête. Souhaitez-vous confirmer la création de cette course ? Répondez 'oui' pour confirmer.";
}