/**
 * venusI18nEngine.ts — Moteur multilingue, multi-pays et de personnalisation VENUS
 *
 * Responsabilités:
 *  1. Détection automatique de la langue du message client
 *  2. Chargement de la configuration pays (depuis l'entité Country, fallback hardcoded)
 *  3. Chargement de la personnalité et de la marque
 *  4. Récupération des traductions (VenusTranslation)
 *  5. Localisation des réponses (devise, date, salutations, vocabulaire)
 *  6. Génération du system prompt localisé pour VENUS
 *
 * Architecture: un noyau commun partagé entre tous les pays, avec surcharge
 * par configuration. Aucun code à modifier pour ajouter un pays — tout est
 * piloté par les entités Country, VenusCity, VenusLanguage, VenusTranslation,
 * VenusPersonality, VenusBrand.
 */

// ═════════════════════════════════════════════════════════════
//  FALLBACKS HARDCODÉS (utilisés si l'entité Country est vide)
// ═════════════════════════════════════════════════════════════

export const INDICATIFS_PAYS: Record<string, string> = {
  '+226': 'BF', '+225': 'CI', '+228': 'TG', '+229': 'BJ',
  '+221': 'SN', '+223': 'ML', '+224': 'GN', '+227': 'NE', '+233': 'GH',
};

export interface CountryConfig {
  code: string;
  nom: string;
  indicatif: string;
  devise: string;
  devise_symbole: string;
  fuseau_horaire: string;
  langue_principale: string;
  langues_officielles: string[];
  langues_secondaires: string[];
  prix_par_km: number;
  prix_minimum: number;
  commission_pct: number;
  ville_principale: string;
  rayon_km: number;
  support_telephone: string;
  modes_paiement: string[];
  format_adresse: string;
  horaires_service: any;
  politiques_locales: any;
  personnalite_id?: string;
  brand_id?: string;
  emoji_flag?: string;
  actif: boolean;
}

const FALLBACK_PAYS: Record<string, CountryConfig> = {
  BF: { code: 'BF', nom: 'Burkina Faso', indicatif: '+226', devise: 'XOF', devise_symbole: 'FCFA', fuseau_horaire: 'Africa/Ouagadougou', langue_principale: 'fr', langues_officielles: ['fr'], langues_secondaires: ['moore', 'dioula'], prix_par_km: 100, prix_minimum: 1000, commission_pct: 30, ville_principale: 'Ouagadougou', rayon_km: 30, support_telephone: '+226 66 92 51 90', modes_paiement: ['orange_money', 'moov', 'especes'], format_adresse: 'quartier_rue', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇧🇫', actif: true },
  CI: { code: 'CI', nom: "Côte d'Ivoire", indicatif: '+225', devise: 'XOF', devise_symbole: 'FCFA', fuseau_horaire: 'Africa/Abidjan', langue_principale: 'fr', langues_officielles: ['fr'], langues_secondaires: ['dioula'], prix_par_km: 120, prix_minimum: 1000, commission_pct: 30, ville_principale: 'Abidjan', rayon_km: 40, support_telephone: '+225 07 00 00 00', modes_paiement: ['orange_money', 'mtn', 'moov', 'wave', 'especes'], format_adresse: 'quartier_rue', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇨🇮', actif: true },
  TG: { code: 'TG', nom: 'Togo', indicatif: '+228', devise: 'XOF', devise_symbole: 'FCFA', fuseau_horaire: 'Africa/Lome', langue_principale: 'fr', langues_officielles: ['fr'], langues_secondaires: ['ewe'], prix_par_km: 100, prix_minimum: 1000, commission_pct: 30, ville_principale: 'Lomé', rayon_km: 25, support_telephone: '+228 90 00 00 00', modes_paiement: ['moov', 'togocom', 'especes'], format_adresse: 'quartier_rue', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇹🇬', actif: true },
  BJ: { code: 'BJ', nom: 'Bénin', indicatif: '+229', devise: 'XOF', devise_symbole: 'FCFA', fuseau_horaire: 'Africa/Porto-Novo', langue_principale: 'fr', langues_officielles: ['fr'], langues_secondaires: ['fon', 'yoruba'], prix_par_km: 100, prix_minimum: 1000, commission_pct: 30, ville_principale: 'Cotonou', rayon_km: 25, support_telephone: '+229 90 00 00 00', modes_paiement: ['mtn', 'moov', 'especes'], format_adresse: 'quartier_rue', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇧🇯', actif: true },
  SN: { code: 'SN', nom: 'Sénégal', indicatif: '+221', devise: 'XOF', devise_symbole: 'FCFA', fuseau_horaire: 'Africa/Dakar', langue_principale: 'fr', langues_officielles: ['fr'], langues_secondaires: ['wolof'], prix_par_km: 150, prix_minimum: 1000, commission_pct: 30, ville_principale: 'Dakar', rayon_km: 35, support_telephone: '+221 77 00 00 00', modes_paiement: ['orange_money', 'wave', 'especes'], format_adresse: 'quartier_rue', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇸🇳', actif: true },
  ML: { code: 'ML', nom: 'Mali', indicatif: '+223', devise: 'XOF', devise_symbole: 'FCFA', fuseau_horaire: 'Africa/Bamako', langue_principale: 'fr', langues_officielles: ['fr'], langues_secondaires: ['bambara', 'fulfulde'], prix_par_km: 100, prix_minimum: 1000, commission_pct: 30, ville_principale: 'Bamako', rayon_km: 30, support_telephone: '+223 70 00 00 00', modes_paiement: ['orange_money', 'moov', 'especes'], format_adresse: 'quartier_rue', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇲🇱', actif: true },
  GN: { code: 'GN', nom: 'Guinée', indicatif: '+224', devise: 'GNF', devise_symbole: 'GNF', fuseau_horaire: 'Africa/Conakry', langue_principale: 'fr', langues_officielles: ['fr'], langues_secondaires: ['fulfulde', 'malinke'], prix_par_km: 800, prix_minimum: 4000, commission_pct: 30, ville_principale: 'Conakry', rayon_km: 30, support_telephone: '+224 620 00 00 00', modes_paiement: ['orange_money', 'mtn', 'especes'], format_adresse: 'quartier_rue', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇬🇳', actif: true },
  NE: { code: 'NE', nom: 'Niger', indicatif: '+227', devise: 'XOF', devise_symbole: 'FCFA', fuseau_horaire: 'Africa/Niamey', langue_principale: 'fr', langues_officielles: ['fr'], langues_secondaires: ['haoussa', 'djerma'], prix_par_km: 100, prix_minimum: 1000, commission_pct: 30, ville_principale: 'Niamey', rayon_km: 25, support_telephone: '+227 90 00 00 00', modes_paiement: ['orange_money', 'moov', 'especes'], format_adresse: 'quartier_rue', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇳🇪', actif: true },
  GH: { code: 'GH', nom: 'Ghana', indicatif: '+233', devise: 'GHS', devise_symbole: '₵', fuseau_horaire: 'Africa/Accra', langue_principale: 'en', langues_officielles: ['en'], langues_secondaires: ['twi', 'ga'], prix_par_km: 2, prix_minimum: 10, commission_pct: 30, ville_principale: 'Accra', rayon_km: 30, support_telephone: '+233 24 000 0000', modes_paiement: ['mtn_mobile_money', 'vodafone_cash', 'especes'], format_adresse: 'landmark', horaires_service: {}, politiques_locales: {}, emoji_flag: '🇬🇭', actif: true },
};

// ═════════════════════════════════════════════════════════════
//  DÉTECTION DE PAYS
// ═════════════════════════════════════════════════════════════

export function detecterPaysDepuisTelephone(telephone: string): string {
  const tel = telephone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  for (const [indicatif, code] of Object.entries(INDICATIFS_PAYS)) {
    if (tel.startsWith(indicatif)) return code;
  }
  return 'BF';
}

// ═════════════════════════════════════════════════════════════
//  DÉTECTION DE LANGUE
// ═════════════════════════════════════════════════════════════

const MOTS_PAR_LANGUE: Record<string, string[]> = {
  fr: ['bonjour', 'salut', 'merci', 'oui', 'non', 'course', 'livraison', 'colis', 'prix', 'combien', 'envoyer', 'recevoir', 'aide', 'comment', 'je', 'vous', 'silgapp'],
  en: ['hello', 'hi', 'thanks', 'thank you', 'yes', 'no', 'delivery', 'package', 'price', 'how much', 'send', 'receive', 'help', 'how', 'i', 'you', 'good morning', 'good evening'],
  ar: ['مرحبا', 'شكرا', 'نعم', 'لا', 'توصيل', 'سعر', 'كم', 'أرسل', 'مساعدة', 'كيف', 'السلام'],
  moore: ['yʋʋm', 'needa', 'yaaba', 'sõngre', 'laafî', 'kibar', 'tɩ', 'sana', 'wõnd', 'n na n', 'bilifù', 'zãab'],
  dioula: ['aw', 'ayi', 'i ni ce', 'n ba', 'don', 'jago', 'furakisɛ', 'ka', 'ni', 'bara', 'alen'],
  fulfulde: ['jam', 'jaarama', 'eeh', 'alaa', 'neldugol', 'hebgol', 'ceede', 'no', 'ballal', 'war', 'min'],
};

export function detecterLangue(message: string, paysLanguePrincipale?: string): string {
  if (!message) return paysLanguePrincipale || 'fr';
  const msg = message.toLowerCase();

  // 1. Script arabe → ar
  if (/[\u0600-\u06FF]/.test(msg)) return 'ar';

  // 2. Compter les mots par langue
  const scores: Record<string, number> = {};
  for (const [lang, mots] of Object.entries(MOTS_PAR_LANGUE)) {
    scores[lang] = 0;
    for (const mot of mots) {
      if (msg.includes(mot)) scores[lang]++;
    }
  }

  // 3. Langue gagnante
  let bestLang = paysLanguePrincipale || 'fr';
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) { bestScore = score; bestLang = lang; }
  }

  return bestScore > 0 ? bestLang : (paysLanguePrincipale || 'fr');
}

// ═════════════════════════════════════════════════════════════
//  CHARGEMENT DE CONFIG PAYS (depuis entité, fallback hardcoded)
// ═════════════════════════════════════════════════════════════

function parseJsonArray(str?: string): string[] {
  if (!str) return [];
  try { const v = JSON.parse(str); return Array.isArray(v) ? v : []; } catch { return []; }
}

function parseJsonObj(str?: string): any {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}

export async function chargerConfigPays(base44: any, countryCode: string): Promise<CountryConfig> {
  const fallback = FALLBACK_PAYS[countryCode] || FALLBACK_PAYS['BF'];
  try {
    const pays = await base44.asServiceRole.entities.Country.filter({ code: countryCode });
    if (pays && pays.length > 0) {
      const p = pays[0];
      return {
        code: p.code,
        nom: p.nom,
        indicatif: p.indicatif,
        devise: p.devise || fallback.devise,
        devise_symbole: p.devise_symbole || p.devise || fallback.devise_symbole,
        fuseau_horaire: p.fuseau_horaire || fallback.fuseau_horaire,
        langue_principale: p.langue_principale || fallback.langue_principale,
        langues_officielles: parseJsonArray(p.langues_officielles).length ? parseJsonArray(p.langues_officielles) : fallback.langues_officielles,
        langues_secondaires: parseJsonArray(p.langues_secondaires).length ? parseJsonArray(p.langues_secondaires) : fallback.langues_secondaires,
        prix_par_km: p.prix_par_km ?? fallback.prix_par_km,
        prix_minimum: p.prix_minimum ?? fallback.prix_minimum,
        commission_pct: p.commission_pct ?? fallback.commission_pct,
        ville_principale: p.ville_principale || fallback.ville_principale,
        rayon_km: p.rayon_km ?? fallback.rayon_km,
        support_telephone: p.support_telephone || fallback.support_telephone,
        modes_paiement: parseJsonArray(p.modes_paiement).length ? parseJsonArray(p.modes_paiement) : fallback.modes_paiement,
        format_adresse: p.format_adresse || fallback.format_adresse,
        horaires_service: parseJsonObj(p.horaires_service),
        politiques_locales: parseJsonObj(p.politiques_locales),
        personnalite_id: p.personnalite_id,
        brand_id: p.brand_id,
        emoji_flag: p.emoji_flag || fallback.emoji_flag,
        actif: p.actif ?? fallback.actif,
      };
    }
  } catch (e) {
    console.error(`[venusI18n] Erreur chargement pays ${countryCode}:`, e.message);
  }
  return fallback;
}

// ═════════════════════════════════════════════════════════════
//  CHARGEMENT PERSONNALITÉ
// ═════════════════════════════════════════════════════════════

export interface PersonalityConfig {
  code: string;
  nom: string;
  ton: string;
  instructions_systeme: string;
  niveau_formalite: string;
  longueur_reponse: string;
  emojis_autorises: boolean;
  genre_voix: string;
  voix_defaut: string;
}

const FALLBACK_PERSONALITY: PersonalityConfig = {
  code: 'chaleureux',
  nom: 'Ton Chaleureux',
  ton: 'chaleureux',
  instructions_systeme: 'Tu es bienveillante, précise, moderne et orientée terrain. Tu tutoies le client.',
  niveau_formalite: 'tutoiement',
  longueur_reponse: 'normal',
  emojis_autorises: false,
  genre_voix: 'feminin',
  voix_defaut: 'river',
};

export async function chargerPersonnalite(base44: any, personnaliteId?: string, countryCode?: string): Promise<PersonalityConfig> {
  try {
    // 1. Si un ID spécifique est fourni
    if (personnaliteId) {
      const p = await base44.asServiceRole.entities.VenusPersonality.get(personnaliteId);
      if (p) return mapPersonalityEntity(p);
    }
    // 2. Chercher une personnalité active recommandée pour ce pays
    if (countryCode) {
      const list = await base44.asServiceRole.entities.VenusPersonality.filter({ actif: true }, '-ordre', 50);
      for (const p of list) {
        const paysCodes = parseJsonArray(p.pays_codes);
        if (paysCodes.length === 0 || paysCodes.includes(countryCode)) {
          return mapPersonalityEntity(p);
        }
      }
    }
  } catch (e) {
    console.error('[venusI18n] Erreur chargement personnalité:', e.message);
  }
  return FALLBACK_PERSONALITY;
}

function mapPersonalityEntity(p: any): PersonalityConfig {
  return {
    code: p.code,
    nom: p.nom,
    ton: p.ton,
    instructions_systeme: p.instructions_systeme || FALLBACK_PERSONALITY.instructions_systeme,
    niveau_formalite: p.niveau_formalite || 'tutoiement',
    longueur_reponse: p.longueur_reponse || 'normal',
    emojis_autorises: p.emojis_autorises ?? false,
    genre_voix: p.genre_voix || 'feminin',
    voix_defaut: p.voix_defaut || 'river',
  };
}

// ═════════════════════════════════════════════════════════════
//  CHARGEMENT MARQUE
// ═════════════════════════════════════════════════════════════

export interface BrandConfig {
  code: string;
  nom: string;
  slogan: string;
  logo_url: string;
  support_telephone: string;
  messages_perso: any;
  services: any[];
}

const FALLBACK_BRAND: BrandConfig = {
  code: 'silgapp',
  nom: 'SILGAPP',
  slogan: 'PLUS QU\'UN SERVICE, UNE PROMESSE',
  logo_url: '',
  support_telephone: '+226 66 92 51 90',
  messages_perso: {},
  services: [],
};

export async function chargerBrand(base44: any, brandId?: string, countryCode?: string): Promise<BrandConfig> {
  try {
    if (brandId) {
      const b = await base44.asServiceRole.entities.VenusBrand.get(brandId);
      if (b) return mapBrandEntity(b);
    }
    if (countryCode) {
      const list = await base44.asServiceRole.entities.VenusBrand.filter({ actif: true }, '-created_date', 20);
      for (const b of list) {
        const paysCodes = parseJsonArray(b.pays_codes);
        if (paysCodes.length === 0 || paysCodes.includes(countryCode)) {
          return mapBrandEntity(b);
        }
      }
    }
  } catch (e) {
    console.error('[venusI18n] Erreur chargement brand:', e.message);
  }
  return FALLBACK_BRAND;
}

function mapBrandEntity(b: any): BrandConfig {
  return {
    code: b.code,
    nom: b.nom,
    slogan: b.slogan || FALLBACK_BRAND.slogan,
    logo_url: b.logo_url || '',
    support_telephone: b.support_telephone || FALLBACK_BRAND.support_telephone,
    messages_perso: parseJsonObj(b.messages_perso),
    services: parseJsonArray(b.services) as any[] || [],
  };
}

// ═════════════════════════════════════════════════════════════
//  TRADUCTIONS
// ═════════════════════════════════════════════════════════════

const CACHE_TRANSLATIONS: Record<string, { ts: number; data: Record<string, string> }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

async function chargerTraductions(base44: any, langue: string, countryCode: string): Promise<Record<string, string>> {
  const cacheKey = `${langue}_${countryCode}`;
  const cached = CACHE_TRANSLATIONS[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const result: Record<string, string> = {};
  try {
    // Charger les traductions validées pour cette langue
    // Priorité: ALL d'abord, puis spécifique au pays (surcharge)
    const trList = await base44.asServiceRole.entities.VenusTranslation.filter(
      { langue, statut: 'valide' },
      '-created_date',
      500
    );
    for (const t of trList) {
      const pays = t.pays || 'ALL';
      if (pays === 'ALL' || pays === countryCode) {
        // Spécifique au pays surcharge ALL
        result[t.cle] = t.valeur;
      }
    }
  } catch (e) {
    console.error('[venusI18n] Erreur chargement traductions:', e.message);
  }

  CACHE_TRANSLATIONS[cacheKey] = { ts: Date.now(), data: result };
  return result;
}

export async function traduire(
  base44: any,
  cle: string,
  langue: string,
  countryCode: string,
  variables?: Record<string, string>
): Promise<string> {
  const traductions = await chargerTraductions(base44, langue, countryCode);
  let texte = traductions[cle] || cle;

  if (variables) {
    for (const [key, val] of Object.entries(variables)) {
      texte = texte.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
    }
  }
  return texte;
}

// ═════════════════════════════════════════════════════════════
//  FORMATAGE LOCALISÉ
// ═════════════════════════════════════════════════════════════

export function formaterDevise(montant: number, deviseSymbole: string): string {
  const formatted = montant.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  if (deviseSymbole === 'FCFA') return `${formatted} FCFA`;
  if (deviseSymbole === '₵' || deviseSymbole === 'GHS') return `₵${formatted}`;
  if (deviseSymbole === 'GNF') return `${formatted} GNF`;
  return `${formatted} ${deviseSymbole}`;
}

export function formaterDate(date: Date | string, fuseauHoraire: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return d.toLocaleDateString('fr-FR', { timeZone: fuseauHoraire, day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d.toLocaleDateString('fr-FR');
  }
}

export function formaterHeure(date: Date | string, fuseauHoraire: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return d.toLocaleTimeString('fr-FR', { timeZone: fuseauHoraire, hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}

export function obtenirSalutation(fuseauHoraire: string, langue: string): string {
  const maintenant = new Date();
  let heure: number;
  try {
    const heureStr = maintenant.toLocaleTimeString('en-US', { timeZone: fuseauHoraire, hour12: false, hour: '2-digit' });
    heure = parseInt(heureStr, 10);
  } catch {
    heure = maintenant.getHours();
  }

  const salutations: Record<string, { matin: string; apres_midi: string; soir: string }> = {
    fr: { matin: 'Bonjour', apres_midi: 'Bon après-midi', soir: 'Bonsoir' },
    en: { matin: 'Good morning', apres_midi: 'Good afternoon', soir: 'Good evening' },
    ar: { matin: 'صباح الخير', apres_midi: 'مساء الخير', soir: 'مساء الخير' },
    moore: { matin: 'Ne yʋʋm', apres_midi: 'Ne yʋʋm', soir: 'Ne yʋŋo' },
    dioula: { matin: 'I ni sɔgɔma', apres_midi: 'I ni tile', soir: 'I ni I fɛ' },
    fulfulde: { matin: 'Jam e windo', apres_midi: 'Jam e kikiiɗe', soir: 'Jam e habu' },
  };

  const s = salutations[langue] || salutations['fr'];
  if (heure < 12) return s.matin;
  if (heure < 18) return s.apres_midi;
  return s.soir;
}

// ═════════════════════════════════════════════════════════════
//  GÉNÉRATION DU SYSTEM PROMPT LOCALISÉ
// ═════════════════════════════════════════════════════════════

export async function genererSystemPromptLocalise(
  base44: any,
  country: CountryConfig,
  personality: PersonalityConfig,
  brand: BrandConfig,
  langue: string
): Promise<string> {
  const tarifsLigne = `${country.prix_par_km} ${country.devise_symbole}/km | Min ${country.prix_minimum} ${country.devise_symbole} | Rayon ${country.rayon_km} km`;
  const paiementsLigne = country.modes_paiement.map(m => m.replace(/_/g, ' ')).join(', ');

  const tonInstructions: Record<string, string> = {
    professionnel: 'Adopte un ton professionnel, précis et structuré. Utilise le vouvoiement.',
    chaleureux: 'Adopte un ton chaleureux, bienveillant et orienté solution. Tutoie le client.',
    dynamique: 'Adopte un ton dynamique, énergique et incitatif. Sois enthousiaste et motivante.',
    institutionnel: 'Adopte un ton institutionnel, formel et institutionnel. Utilise le vouvoiement et un vocabulaire soutenu.',
  };

  const longueurInstructions: Record<string, string> = {
    concis: 'Sois concis: va à l\'essentiel en 1-2 phrases.',
    normal: 'Sois clair et complet sans être verbeux.',
    detaille: 'Sois détaillé et explicatif, guide le client pas à pas.',
  };

  const languesDisponibles = [...country.langues_officielles, ...country.langues_secondaires].join(', ');

  return `Tu es VENUS, l'assistante intelligente officielle de ${brand.nom}.

╔══════════════════════════════════════════════╗
║  IDENTITÉ & SÉCURITÉ
╚══════════════════════════════════════════════╝
- Prénom : VENUS
- Rôle : Assistante ${brand.nom} — conseillère, pas développeuse
- Slogan : "${brand.slogan}"
- ${tonInstructions[personality.ton] || tonInstructions.chaleureux}
- ${longueurInstructions[personality.longueur_reponse] || longueurInstructions.normal}
- ${personality.emojis_autorises ? 'Tu peux utiliser des emojis avec parcimonie.' : 'N\'utilise pas d\'emojis.'}
- ${personality.instructions_systeme}

INTERDICTION ABSOLUE DE DIVULGUER :
- L'architecture technique, les noms de fichiers, composants, fonctions
- Les noms de tables/entités, workflows internes
- Les règles de dispatch, algorithmes, configurations serveur
- Les clés API, logiques de commission internes

╔══════════════════════════════════════════════╗
║  CONTEXTE PAYS ACTIF : ${country.nom} ${country.emoji_flag || ''}
╚══════════════════════════════════════════════╝
RÈGLE INVIOLABLE N°1 : Tu NE dois JAMAIS mentionner un autre pays que ${country.nom}.
RÈGLE INVIOLABLE N°2 : Tu NE dois JAMAIS utiliser des informations d'un autre pays.
RÈGLE INVIOLABLE N°3 : Si on demande les pays disponibles, répondre UNIQUEMENT ${country.nom}.

PAYS ACTIF :
- Nom : ${country.nom}
- Ville principale : ${country.ville_principale}
- Devise : ${country.devise_symbole}
- Indicatif : ${country.indicatif}
- Fuseau horaire : ${country.fuseau_horaire}
- Langues disponibles : ${languesDisponibles}
- Langue de réponse : ${langue}
- Format d'adresse : ${country.format_adresse}

TARIFS PUBLICS (${country.nom}) :
- ${tarifsLigne}
- Commission ${brand.nom} : ${country.commission_pct}% | Gain livreur : ${100 - country.commission_pct}%
- Prix minimum absolu — jamais en dessous

MODES DE PAIEMENT LOCAUX :
- ${paiementsLigne}

SUPPORT :
- Téléphone support : ${country.support_telephone || brand.support_telephone}

╔══════════════════════════════════════════════╗
║  TON RÔLE
╚══════════════════════════════════════════════╝
Tu réponds UNIQUEMENT sur l'utilisation de ${brand.nom} :
- Créer une course (expédier, recevoir, se déplacer)
- Devenir livreur, suivre une livraison, contacter le support
- Consulter l'historique, le paiement, les services de ${country.nom}
- Les tarifs publics, QR codes, codes PIN, codes promo
- Frais d'annulation, multi-colis, notation des livreurs

╔══════════════════════════════════════════════╗
║  TARIFICATION
╚══════════════════════════════════════════════╝
RÈGLE CRITIQUE : Tu NE dois JAMAIS inventer un tarif précis pour une course.
- Le prix réel est calculé par le moteur de tarification de ${brand.nom}.
- Si un client demande le prix d'une course précise, réponds :
  "Je ne peux pas déterminer le tarif avec précision. Le livreur qui prendra votre course vous contactera pour confirmer le coût avant le démarrage."
- Ne JAMAIS annoncer un montant fixe comme prix d'une course spécifique.

╔══════════════════════════════════════════════╗
║  NOTES VOCALES
╚══════════════════════════════════════════════╝
- Les transcriptions peuvent contenir des erreurs (quartiers mal orthographiés).
- Confirme TOUJOURS ce que tu as compris avant de poursuivre.
- Si l'intention est claire malgré des erreurs, propose discrètement la correction et continue.
- Ne demande JAMAIS au client de recommencer toute la note vocale.

╔══════════════════════════════════════════════╗
║  RÈGLES FINALES
╚══════════════════════════════════════════════╝
1. Ne JAMAIS divulguer d'informations techniques internes
2. Ne JAMAIS mentionner d'autres pays que ${country.nom}
3. Répondre UNIQUEMENT sur l'utilisation de ${brand.nom}
4. Prix minimum selon ${country.nom} — jamais en dessous
5. ${brand.nom} = multi-pays MAIS PAS transfrontalier
6. Adapter TOUJOURS les réponses au pays actif
7. NE JAMAIS inventer un tarif pour une course précise
8. Répondre dans la langue: ${langue}

Sois précise, utile, bienveillante et orientée solution.`;
}

// ═════════════════════════════════════════════════════════════
//  CONTEXTE COMPLET VENUS (utilisé par le webhook)
// ═════════════════════════════════════════════════════════════

export interface VenusContext {
  country: CountryConfig;
  personality: PersonalityConfig;
  brand: BrandConfig;
  langue: string;
  systemPrompt: string;
}

export async function construireContexteVenus(
  base44: any,
  telephone: string,
  messageClient?: string
): Promise<VenusContext> {
  // 1. Détecter pays
  const countryCode = detecterPaysDepuisTelephone(telephone);

  // 2. Charger config pays
  const country = await chargerConfigPays(base44, countryCode);

  // 3. Charger personnalité
  const personality = await chargerPersonnalite(base44, country.personnalite_id, countryCode);

  // 4. Charger marque
  const brand = await chargerBrand(base44, country.brand_id, countryCode);

  // 5. Détecter langue (si message fourni, sinon langue principale du pays)
  const langue = messageClient
    ? detecterLangue(messageClient, country.langue_principale)
    : country.langue_principale;

  // 6. Générer system prompt localisé
  const systemPrompt = await genererSystemPromptLocalise(base44, country, personality, brand, langue);

  return { country, personality, brand, langue, systemPrompt };
}