/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR D'OUTILS VENUS — Connecte VENUS aux données opérationnelles SILGAPP
 * ═══════════════════════════════════════════════════════════════════
 *
 * VENUS n'invente JAMAIS d'informations. Elle consulte les données réelles
 * via ces outils avant de répondre.
 *
 * Sources de données :
 * - CourseExterne, Livreur, Boutique, Restaurant, Pharmacie
 * - CommandeBoutique, CommandeRestaurant
 * - PaiementSilgapp, PaiementPartenaire
 * - ClientExterne, Country (tarifs officiels)
 *
 * Anti-hallucination : si un outil retourne `trouve: false`, VENUS doit dire
 * qu'elle n'a pas l'information, pas l'inventer.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Types ──

interface ToolResult {
  outil: string;
  trouve: boolean;
  donnees: any;
  message: string;
  temps_ms: number;
}

interface ToolContext {
  telephone: string;
  countryCode: string;
  profileName: string;
  memoireCourte: any;
  courseActive?: any;
  messageClient?: string;
}

interface VenusTool {
  nom: string;
  description: string;
  intentions: string[];
  parametres: Record<string, { type: string; description: string; requis: boolean }>;
  execute: (base44: any, params: any, ctx: ToolContext) => Promise<ToolResult>;
}

// ── Helpers ──

function normalizePhone(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

function phoneMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na.endsWith(nb.slice(-8)) || nb.endsWith(na.slice(-8));
}

// ── Registre des outils ──

export const TOOLS_REGISTRY: VenusTool[] = [
  // ── 1. Rechercher course active ──
  {
    nom: 'rechercher_course_active',
    description: 'Recherche la course active du client (statut non terminé/annulé)',
    intentions: ['suivre_course', 'annuler_course', 'contacter_livreur'],
    parametres: {
      telephone: { type: 'string', description: 'Téléphone du client', requis: true },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        const tel = params.telephone || ctx.telephone;
        const courses = await base44.asServiceRole.entities.CourseExterne.filter(
          { client_telephone: tel },
          '-created_date', 10
        );

        const STATUTS_ACTIFS = [
          'nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route',
          'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque',
          'pris_en_charge', 'en_livraison', 'arrivee',
        ];

        const activeCourse = (courses || []).find(c => STATUTS_ACTIFS.includes(c.statut));

        if (!activeCourse) {
          return {
            outil: 'rechercher_course_active',
            trouve: false,
            donnees: null,
            message: 'Aucune course active trouvée pour ce client.',
            temps_ms: Date.now() - start,
          };
        }

        return {
          outil: 'rechercher_course_active',
          trouve: true,
          donnees: {
            id: activeCourse.id,
            ref: activeCourse.id?.slice(-6).toUpperCase(),
            statut: activeCourse.statut,
            type_course: activeCourse.type_course,
            adresse_depart: activeCourse.adresse_depart,
            adresse_arrivee: activeCourse.adresse_arrivee,
            prix: activeCourse.prix_estimate,
            devise: activeCourse.devise,
            livreur_nom: activeCourse.livreur_nom || null,
            livreur_telephone: activeCourse.livreur_telephone || null,
            tracking_link: activeCourse.tracking_link || null,
            created_date: activeCourse.created_date,
            dispatch_status: activeCourse.dispatch_status || null,
          },
          message: `Course active trouvée: ${activeCourse.type_course} — statut: ${activeCourse.statut}`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'rechercher_course_active',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 2. Rechercher livreur ──
  {
    nom: 'rechercher_livreur',
    description: 'Recherche un livreur par téléphone, nom, ou ID',
    intentions: ['contacter_livreur'],
    parametres: {
      telephone: { type: 'string', description: 'Téléphone du livreur', requis: false },
      nom: { type: 'string', description: 'Nom du livreur', requis: false },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        let livreur = null;

        // Si on a une course active avec un livreur, utiliser ces infos
        if (ctx.courseActive?.livreur_telephone) {
          const tel = ctx.courseActive.livreur_telephone;
          const results = await base44.asServiceRole.entities.Livreur.filter(
            { telephone: tel }, '-created_date', 1
          );
          if (results && results.length > 0) livreur = results[0];
        }

        // Sinon, rechercher par téléphone fourni
        if (!livreur && params.telephone) {
          const results = await base44.asServiceRole.entities.Livreur.filter(
            { telephone: params.telephone }, '-created_date', 1
          );
          if (results && results.length > 0) livreur = results[0];
        }

        // Sinon, rechercher par nom
        if (!livreur && params.nom) {
          const results = await base44.asServiceRole.entities.Livreur.list('-created_date', 50);
          livreur = (results || []).find(l =>
            (l.nom || '').toLowerCase().includes(params.nom.toLowerCase()) ||
            (l.prenom || '').toLowerCase().includes(params.nom.toLowerCase())
          );
        }

        if (!livreur) {
          return {
            outil: 'rechercher_livreur',
            trouve: false,
            donnees: null,
            message: 'Aucun livreur trouvé avec ces critères.',
            temps_ms: Date.now() - start,
          };
        }

        return {
          outil: 'rechercher_livreur',
          trouve: true,
          donnees: {
            id: livreur.id,
            nom: livreur.nom || livreur.prenom || 'Livreur',
            telephone: livreur.telephone,
            statut: livreur.statut || livreur.status || 'inconnu',
            en_ligne: livreur.en_ligne || false,
            vehicule: livreur.vehicule_type || livreur.type_vehicule || null,
            photo_url: livreur.photo_url || null,
            rating: livreur.rating || livreur.note_moyenne || null,
          },
          message: `Livreur trouvé: ${livreur.nom || livreur.prenom || 'N/A'} (${livreur.telephone})`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'rechercher_livreur',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 3. Consulter boutique ──
  {
    nom: 'consulter_boutique',
    description: 'Recherche une boutique par nom ou ID',
    intentions: ['demander_info'],
    parametres: {
      nom: { type: 'string', description: 'Nom de la boutique', requis: false },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        let boutiques = await base44.asServiceRole.entities.Boutique.filter(
          { statut: 'actif' }, '-created_date', 50
        );

        if (params.nom) {
          const search = params.nom.toLowerCase();
          boutiques = (boutiques || []).filter(b =>
            (b.nom || '').toLowerCase().includes(search) ||
            (b.description || '').toLowerCase().includes(search)
          );
        }

        if (!boutiques || boutiques.length === 0) {
          return {
            outil: 'consulter_boutique',
            trouve: false,
            donnees: null,
            message: 'Aucune boutique trouvée.',
            temps_ms: Date.now() - start,
          };
        }

        return {
          outil: 'consulter_boutique',
          trouve: true,
          donnees: boutiques.slice(0, 5).map(b => ({
            id: b.id,
            nom: b.nom,
            description: (b.description || '').substring(0, 200),
            telephone: b.telephone || null,
            adresse: b.adresse || null,
            quartier: b.quartier || null,
            logo_url: b.logo_url || null,
            note_moyenne: b.note_moyenne || null,
            ouverture: b.horaires_ouverture || null,
          })),
          message: `${boutiques.length} boutique(s) trouvée(s).`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'consulter_boutique',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 4. Consulter restaurant ──
  {
    nom: 'consulter_restaurant',
    description: 'Recherche un restaurant par nom',
    intentions: ['demander_info'],
    parametres: {
      nom: { type: 'string', description: 'Nom du restaurant', requis: false },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        let restaurants = await base44.asServiceRole.entities.Restaurant.filter(
          { statut: 'actif' }, '-created_date', 50
        );

        if (params.nom) {
          const search = params.nom.toLowerCase();
          restaurants = (restaurants || []).filter(r =>
            (r.nom || '').toLowerCase().includes(search) ||
            (r.description || '').toLowerCase().includes(search)
          );
        }

        if (!restaurants || restaurants.length === 0) {
          return {
            outil: 'consulter_restaurant',
            trouve: false,
            donnees: null,
            message: 'Aucun restaurant trouvé.',
            temps_ms: Date.now() - start,
          };
        }

        return {
          outil: 'consulter_restaurant',
          trouve: true,
          donnees: restaurants.slice(0, 5).map(r => ({
            id: r.id,
            nom: r.nom,
            description: (r.description || '').substring(0, 200),
            telephone: r.telephone || null,
            adresse: r.adresse || null,
            quartier: r.quartier || null,
            logo_url: r.logo_url || null,
            note_moyenne: r.note_moyenne || null,
            type_cuisine: r.type_cuisine || null,
          })),
          message: `${restaurants.length} restaurant(s) trouvé(s).`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'consulter_restaurant',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 5. Consulter pharmacie ──
  {
    nom: 'consulter_pharmacie',
    description: 'Recherche une pharmacie par nom',
    intentions: ['demander_info'],
    parametres: {
      nom: { type: 'string', description: 'Nom de la pharmacie', requis: false },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        let pharmacies = await base44.asServiceRole.entities.Pharmacie.filter(
          { statut: 'actif' }, '-created_date', 50
        );

        if (params.nom) {
          const search = params.nom.toLowerCase();
          pharmacies = (pharmacies || []).filter(p =>
            (p.nom || '').toLowerCase().includes(search)
          );
        }

        if (!pharmacies || pharmacies.length === 0) {
          return {
            outil: 'consulter_pharmacie',
            trouve: false,
            donnees: null,
            message: 'Aucune pharmacie trouvée.',
            temps_ms: Date.now() - start,
          };
        }

        return {
          outil: 'consulter_pharmacie',
          trouve: true,
          donnees: pharmacies.slice(0, 5).map(p => ({
            id: p.id,
            nom: p.nom,
            telephone: p.telephone || null,
            adresse: p.adresse || null,
            quartier: p.quartier || null,
            garde_nuit: p.garde_nuit || false,
            ouverture: p.horaires_ouverture || null,
          })),
          message: `${pharmacies.length} pharmacie(s) trouvée(s).`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'consulter_pharmacie',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 6. Rechercher commande boutique ──
  {
    nom: 'rechercher_commande_boutique',
    description: 'Recherche les commandes boutique d\'un client',
    intentions: ['suivre_course'],
    parametres: {
      telephone: { type: 'string', description: 'Téléphone du client', requis: true },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        const tel = params.telephone || ctx.telephone;
        const commandes = await base44.asServiceRole.entities.CommandeBoutique.filter(
          { client_telephone: tel }, '-created_date', 5
        );

        if (!commandes || commandes.length === 0) {
          return {
            outil: 'rechercher_commande_boutique',
            trouve: false,
            donnees: null,
            message: 'Aucune commande boutique trouvée.',
            temps_ms: Date.now() - start,
          };
        }

        return {
          outil: 'rechercher_commande_boutique',
          trouve: true,
          donnees: commandes.map(c => ({
            id: c.id,
            ref: c.id?.slice(-6).toUpperCase(),
            statut: c.statut,
            boutique_nom: c.boutique_nom || null,
            montant_total: c.montant_total || null,
            date: c.created_date,
            produits: c.produits || null,
          })),
          message: `${commandes.length} commande(s) boutique trouvée(s).`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'rechercher_commande_boutique',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 7. Rechercher commande restaurant ──
  {
    nom: 'rechercher_commande_restaurant',
    description: 'Recherche les commandes restaurant d\'un client',
    intentions: ['suivre_course'],
    parametres: {
      telephone: { type: 'string', description: 'Téléphone du client', requis: true },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        const tel = params.telephone || ctx.telephone;
        const commandes = await base44.asServiceRole.entities.CommandeRestaurant.filter(
          { client_telephone: tel }, '-created_date', 5
        );

        if (!commandes || commandes.length === 0) {
          return {
            outil: 'rechercher_commande_restaurant',
            trouve: false,
            donnees: null,
            message: 'Aucune commande restaurant trouvée.',
            temps_ms: Date.now() - start,
          };
        }

        return {
          outil: 'rechercher_commande_restaurant',
          trouve: true,
          donnees: commandes.map(c => ({
            id: c.id,
            ref: c.id?.slice(-6).toUpperCase(),
            statut: c.statut,
            restaurant_nom: c.restaurant_nom || null,
            montant_total: c.montant_total || null,
            date: c.created_date,
            plats: c.plats || null,
          })),
          message: `${commandes.length} commande(s) restaurant trouvée(s).`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'rechercher_commande_restaurant',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 8. Vérifier paiement ──
  {
    nom: 'verifier_paiement',
    description: 'Vérifie le statut d\'un paiement SILGAPP',
    intentions: ['demander_info'],
    parametres: {
      telephone: { type: 'string', description: 'Téléphone du client', requis: false },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        const tel = params.telephone || ctx.telephone;
        const paiements = await base44.asServiceRole.entities.PaiementSilgapp.filter(
          { client_telephone: tel }, '-created_date', 5
        );

        if (!paiements || paiements.length === 0) {
          return {
            outil: 'verifier_paiement',
            trouve: false,
            donnees: null,
            message: 'Aucun paiement trouvé.',
            temps_ms: Date.now() - start,
          };
        }

        return {
          outil: 'verifier_paiement',
          trouve: true,
          donnees: paiements.map(p => ({
            id: p.id,
            ref: p.id?.slice(-6).toUpperCase(),
            montant: p.montant || null,
            devise: p.devise || 'FCFA',
            statut: p.statut || p.status || 'inconnu',
            methode: p.methode_paiement || p.methode || null,
            date: p.created_date,
            course_ref: p.course_id || null,
          })),
          message: `${paiements.length} paiement(s) trouvé(s).`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'verifier_paiement',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 9. Obtenir tarifs officiels ──
  {
    nom: 'obtenir_tarifs_officiels',
    description: 'Obtient les tarifs officiels SILGAPP pour le pays du client',
    intentions: ['demander_info'],
    parametres: {},
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        const countries = await base44.asServiceRole.entities.Country.filter(
          { code: ctx.countryCode }, '-created_date', 1
        );

        if (!countries || countries.length === 0) {
          return {
            outil: 'obtenir_tarifs_officiels',
            trouve: false,
            donnees: null,
            message: 'Pays non configuré.',
            temps_ms: Date.now() - start,
          };
        }

        const c = countries[0];
        return {
          outil: 'obtenir_tarifs_officiels',
          trouve: true,
          donnees: {
            pays: c.nom,
            code: c.code,
            prix_par_km: c.prix_par_km,
            prix_minimum: c.prix_minimum,
            devise: c.devise,
            devise_symbole: c.devise_symbole,
            commission_pct: c.commission_pct,
            seuil_encours_max: c.seuil_encours_max,
            modes_paiement: c.modes_paiement ? JSON.parse(c.modes_paiement) : [],
          },
          message: `Tarifs officiels: ${c.prix_par_km} ${c.devise_symbole}/km, minimum ${c.prix_minimum} ${c.devise_symbole}`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'obtenir_tarifs_officiels',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },

  // ── 10. Rechercher client ──
  {
    nom: 'rechercher_client',
    description: 'Recherche le profil client par téléphone',
    intentions: ['suivre_course', 'demander_info'],
    parametres: {
      telephone: { type: 'string', description: 'Téléphone du client', requis: true },
    },
    execute: async (base44, params, ctx): Promise<ToolResult> => {
      const start = Date.now();
      try {
        const tel = params.telephone || ctx.telephone;
        const clients = await base44.asServiceRole.entities.ClientExterne.filter(
          { telephone: tel }, '-created_date', 1
        );

        if (!clients || clients.length === 0) {
          return {
            outil: 'rechercher_client',
            trouve: false,
            donnees: null,
            message: 'Client non enregistré.',
            temps_ms: Date.now() - start,
          };
        }

        const cl = clients[0];
        return {
          outil: 'rechercher_client',
          trouve: true,
          donnees: {
            id: cl.id,
            nom: cl.nom || cl.prenom || ctx.profileName || tel,
            telephone: cl.telephone,
            pays: cl.country_code || ctx.countryCode,
            ville: cl.ville || null,
            quartier: cl.quartier || null,
            total_courses: cl.total_courses || 0,
            note_moyenne: cl.note_moyenne || null,
          },
          message: `Client trouvé: ${cl.nom || ctx.profileName || tel}`,
          temps_ms: Date.now() - start,
        };
      } catch (e) {
        return {
          outil: 'rechercher_client',
          trouve: false,
          donnees: null,
          message: `Erreur: ${e.message}`,
          temps_ms: Date.now() - start,
        };
      }
    },
  },
];

// ═══════════════════════════════════════════════════════════════════
// DÉTECTION D'INTENTION RAPIDE (heuristique — sans LLM)
// ═══════════════════════════════════════════════════════════════════

const INTENTION_PATTERNS: Record<string, string[]> = {
  suivre_course: [
    'ou est', 'où est', 'ou en est', 'statut', 'suivi', 'tracking',
    'mon colis', 'ma course', 'ma commande', 'livreur est ou',
    'il arrive', 'quand', 'ou ca en est',
  ],
  annuler_course: [
    'annuler', 'annulation', 'je veux annuler', 'stop', 'arrete',
    'plus besoin',
  ],
  contacter_livreur: [
    'contacter', 'appeler', 'parler au', 'joindre', 'numero du livreur',
    'telephone du livreur', 'le contact',
  ],
  demander_info: [
    'combien', 'prix', 'tarif', 'coute', 'ca coute', 'comment',
    'comment ca marche', 'boutique', 'restaurant', 'pharmacie',
    'paiement', 'payer', 'modes de paiement', 'orange money',
  ],
  salutation: [
    'bonjour', 'salut', 'bonsoir', 'coucou', 'hello', 'bonne journee',
    'cc', 'bon apres',
  ],
};

export function detecterIntentionRapide(message: string): string {
  const msg = (message || '').toLowerCase().trim();

  // Salutation en premier (messages courts)
  if (msg.length < 30) {
    for (const p of INTENTION_PATTERNS.salutation) {
      if (msg.includes(p)) return 'salutation';
    }
  }

  // Vérifier annulation avant suivi
  for (const p of INTENTION_PATTERNS.annuler_course) {
    if (msg.includes(p)) return 'annuler_course';
  }

  // Suivi de course
  for (const p of INTENTION_PATTERNS.suivre_course) {
    if (msg.includes(p)) return 'suivre_course';
  }

  // Contacter livreur
  for (const p of INTENTION_PATTERNS.contacter_livreur) {
    if (msg.includes(p)) return 'contacter_livreur';
  }

  // Demander info
  for (const p of INTENTION_PATTERNS.demander_info) {
    if (msg.includes(p)) return 'demander_info';
  }

  // Création de course (mots-clés d'action)
  if (msg.includes('envoyer') || msg.includes('expedier') || msg.includes('envoi') ||
      msg.includes('recevoir') || msg.includes('reception') ||
      msg.includes('deplac') || msg.includes('livrer') || msg.includes('livraison')) {
    return 'creer_course';
  }

  return 'autre';
}

// ═══════════════════════════════════════════════════════════════════
// EXÉCUTION DES OUTILS POUR UNE INTENTION
// ═══════════════════════════════════════════════════════════════════

export async function executerOutilsPourIntention(
  base44: any,
  intention: string,
  ctx: ToolContext
): Promise<ToolResult[]> {
  let toolsToRun = TOOLS_REGISTRY.filter(t =>
    t.intentions.includes(intention)
  );

  // ── Sub-sélection pour demander_info : n'exécuter que les outils pertinents ──
  if (intention === 'demander_info') {
    const lastMsg = (ctx.messageClient || '').toLowerCase();
    
    const isPriceQuestion = lastMsg.match(/(combien|prix|tarif|coute|ca coute|cher|montant|frais)/);
    const isBoutiqueQuestion = lastMsg.includes('boutique') || lastMsg.includes('magasin') || lastMsg.includes('acheter');
    const isRestaurantQuestion = lastMsg.includes('restaurant') || lastMsg.includes('manger') || lastMsg.includes('plat') || lastMsg.includes('nourriture');
    const isPharmacieQuestion = lastMsg.includes('pharmacie') || lastMsg.includes('medicament') || lastMsg.includes('garde');
    const isPaiementQuestion = lastMsg.includes('paiement') || lastMsg.includes('payer') || lastMsg.includes('orange money') || lastMsg.includes('moov') || lastMsg.includes('wave');
    const isClientQuestion = lastMsg.includes('mon compte') || lastMsg.includes('mon profil') || lastMsg.includes('mon solde');

    toolsToRun = toolsToRun.filter(t => {
      if (t.nom === 'obtenir_tarifs_officiels' && (isPriceQuestion || (!isBoutiqueQuestion && !isRestaurantQuestion && !isPharmacieQuestion && !isPaiementQuestion && !isClientQuestion))) return true;
      if (t.nom === 'consulter_boutique' && isBoutiqueQuestion) return true;
      if (t.nom === 'consulter_restaurant' && isRestaurantQuestion) return true;
      if (t.nom === 'consulter_pharmacie' && isPharmacieQuestion) return true;
      if (t.nom === 'verifier_paiement' && isPaiementQuestion) return true;
      if (t.nom === 'rechercher_client' && isClientQuestion) return true;
      return false;
    });
  }

  if (toolsToRun.length === 0) {
    return [];
  }

  const results: ToolResult[] = [];

  for (const tool of toolsToRun) {
    try {
      const params: any = {};
      // Pré-remplir les paramètres depuis le contexte
      if (tool.parametres.telephone) {
        params.telephone = ctx.telephone;
      }

      const result = await tool.execute(base44, params, ctx);
      results.push(result);

      console.log(`[ToolsEngine] 🔧 ${tool.nom}: ${result.trouve ? '✅' : '❌'} (${result.temps_ms}ms)`);
    } catch (e) {
      console.error(`[ToolsEngine] Erreur outil ${tool.nom}:`, e.message);
      results.push({
        outil: tool.nom,
        trouve: false,
        donnees: null,
        message: `Erreur d'exécution: ${e.message}`,
        temps_ms: 0,
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// FORMATAGE DES RÉSULTATS D'OUTILS POUR INJECTION DANS LE PROMPT LLM
// ═══════════════════════════════════════════════════════════════════

export function formaterOutilsPourPrompt(outilsResults: ToolResult[]): string {
  if (!outilsResults || outilsResults.length === 0) {
    return 'Aucun outil appelé pour cette intention.';
  }

  const lines: string[] = [];

  for (const r of outilsResults) {
    if (r.trouve) {
      lines.push(`┌─ OUTIL: ${r.outil} ✅ TROUVÉ`);
      lines.push(`│  ${r.message}`);
      lines.push(`│  DONNÉES: ${JSON.stringify(r.donnees, null, 2).split('\n').join('\n│  ')}`);
      lines.push(`└─ (${r.temps_ms}ms)`);
    } else {
      lines.push(`┌─ OUTIL: ${r.outil} ❌ NON TROUVÉ`);
      lines.push(`│  ${r.message}`);
      lines.push(`└─ (${r.temps_ms}ms)`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// ANTI-HALLUCINATION : Vérifie que la réponse ne contient pas de données inventées
// ═══════════════════════════════════════════════════════════════════

export function detecterHallucination(reponse: string, outilsResults: ToolResult[]): {
  suspecte: boolean;
  details: string;
} {
  const r = (reponse || '').toLowerCase();

  // Si aucun outil n'a trouvé de données, mais que VENUS donne des infos spécifiques
  const aucunTrouve = outilsResults.every(o => !o.trouve);
  if (aucunTrouve && outilsResults.length > 0) {
    // Vérifier si VENUS donne des prix spécifiques
    if (r.match(/\d+\s*(fcfa|f cfa|franc)/)) {
      return {
        suspecte: true,
        details: 'VENUS mentionne un prix spécifique mais aucun outil n\'a retourné de données officielles.',
      };
    }
    // Vérifier si VENUS donne un statut spécifique — MAIS pas si elle dit qu'il n'y en a PAS
    const negationPresente = r.includes('aucune') || r.includes("n'ai pas") || r.includes("n'a pas") ||
      r.includes('pas de course') || r.includes('ne trouve aucune') || r.includes('non trouv') ||
      r.includes('pas de course active') || r.includes("je n'ai");
    if (!negationPresente && (r.includes('en cours') || r.includes('en livraison') || r.includes('livreur en route'))) {
      return {
        suspecte: true,
        details: 'VENUS mentionne un statut de course mais l\'outil n\'a trouvé aucune course active.',
      };
    }
  }

  return { suspecte: false, details: '' };
}

// ═══════════════════════════════════════════════════════════════════
// LISTE DES OUTILS DISPONIBLES (pour affichage admin)
// ═══════════════════════════════════════════════════════════════════

export function listerOutilsDisponibles(): { nom: string; description: string; intentions: string[] }[] {
  return TOOLS_REGISTRY.map(t => ({
    nom: t.nom,
    description: t.description,
    intentions: t.intentions,
  }));
}