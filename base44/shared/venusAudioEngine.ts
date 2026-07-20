/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR AUDIO VENUS — Nettoyage et validation des transcriptions
 * ═══════════════════════════════════════════════════════════════════
 *
 * Corrige les erreurs courantes de transcription Whisper pour :
 * - Les noms de quartiers de Ouagadougou
 * - Les numéros de téléphone
 * - Les termes SILGAPP courants
 * - La ponctuation et la casse
 *
 * Évalue la confiance de la transcription et détermine si
 * VENUS peut agir dessus ou doit demander confirmation.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Corrections de noms de quartiers (erreurs courantes Whisper) ──

const CORRECTIONS_QUARTIERS: Record<string, string> = {
  // Tampouy
  'tampouille': 'Tampouy', 'tanpu': 'Tampouy', 'tampou': 'Tampouy',
  'tampui': 'Tampouy', 'tam pou': 'Tampouy', 'tanpouy': 'Tampouy',
  'tampouil': 'Tampouy', 'tampouis': 'Tampouy',
  // Gounghin
  'gonghin': 'Gounghin', 'gongine': 'Gounghin', 'gounghine': 'Gounghin',
  'gonghine': 'Gounghin', 'gounghine': 'Gounghin', 'goungin': 'Gounghin',
  'gounguine': 'Gounghin', 'gounghin': 'Gounghin',
  // Karpala
  'carpala': 'Karpala', 'karpalla': 'Karpala', 'carpalla': 'Karpala',
  // Pissy
  'piscine': 'Pissy', 'pissi': 'Pissy', 'picy': 'Pissy', 'pisse': 'Pissy',
  // Ouaga 2000
  'ouaga deux mille': 'Ouaga 2000', 'ouaga 2000': 'Ouaga 2000',
  'ouaga de mille': 'Ouaga 2000', 'wagadougou 2000': 'Ouaga 2000',
  'ouaga 2 mille': 'Ouaga 2000',
  // Patte d'Oie
  "patte d'huile": "Patte d'Oie", "patte doye": "Patte d'Oie",
  "patte doi": "Patte d'Oie", "pate doye": "Patte d'Oie",
  "pate d'huile": "Patte d'Oie", "patte d'oie": "Patte d'Oie",
  // Dassasgho
  'dassasco': 'Dassasgho', 'dassasgo': 'Dassasgho', 'dassasko': 'Dassasgho',
  'dassasgho': 'Dassasgho',
  // Cissin
  'cissin': 'Cissin', 'cisin': 'Cissin', 'sissin': 'Cissin',
  // Samandin
  'samandan': 'Samandin', 'samandin': 'Samandin', 'samandine': 'Samandin',
  // Wemtenga
  'ouemtenga': 'Wemtenga', 'wemtengue': 'Wemtenga', 'ouemtengue': 'Wemtenga',
  // Bendogo
  'bandogo': 'Bendogo', 'bendogho': 'Bendogo',
  // Larle
  'larle': 'Larle', 'larl': 'Larle',
  // Somgande
  'somgandé': 'Somgande', 'somgande': 'Somgande', 'songande': 'Somgande',
  // Saaba
  'saba': 'Saaba', 'sabba': 'Saaba',
  // Tanghin
  'tangine': 'Tanghin', 'tangin': 'Tanghin', 'tanguin': 'Tanghin',
  // Kossodo
  'kossodo': 'Kossodo', 'cosodo': 'Kossodo', 'kossotto': 'Kossodo',
  // Zone du Bois
  'zone du boi': 'Zone du Bois', 'zone du bois': 'Zone du Bois',
  'zone bois': 'Zone du Bois',
};

// ── Corrections phonétiques générales ──

const CORRECTIONS_PHONETIQUES: Record<string, string> = {
  'colie': 'colis', 'colis': 'colis', 'collie': 'colis',
  'livrison': 'livraison', 'livraison': 'livraison',
  'expedie': 'expédier', 'expédie': 'expédier',
  'deplace': 'déplacement', 'déplace': 'déplacement',
  'recu': 'reçu', 'recue': 'reçu',
  'bonjr': 'bonjour', 'bonjour': 'bonjour',
  'silgap': 'SILGAPP', 'silgapp': 'SILGAPP', 'sil gap': 'SILGAPP',
  'venus': 'VENUS', 'vénus': 'VENUS',
};

// ── Marqueurs d'incertitude dans les transcriptions ──

const MARQUEURS_INCERTITUDE = [
  '[inaudible]', '[bruit]', '[?]', '[...]', '...', 'incomprehensible',
  '[silence]', '[musique]', '[rire]', '[bruit de fond]',
  '[paroles inaudibles]', '[indistinct]',
];

// ── Noms de quartiers valides (pour vérification) ──

const QUARTIERS_VALIDES = [
  'karpala', 'pissy', 'tampouy', 'ouaga 2000', 'zone du bois',
  "patte d'oie", 'gounghin', 'dassasgho', 'cissin', 'samandin',
  'wemtenga', 'bendogo', 'larle', 'somgande', 'saaba', 'tanghin',
  'kossodo', 'ouaga 1', 'ouaga 2', 'ouaga 3', 'wagadogo',
  'zone 1', 'zone 2', 'zone 3', 'zone 4', 'zone 5',
  'paspanga', 'tiendpalogo', 'bilbalogho', 'sandogo', 'tounouma',
];

/**
 * Nettoie et corrige une transcription audio.
 * - Corrige les noms de quartiers mal transcrits
 * - Normalise la ponctuation et la casse
 * - Corrige les termes SILGAPP courants
 * - Normalise les numéros de téléphone
 */
export function nettoyerTranscription(texte: string): string {
  if (!texte || typeof texte !== 'string') return '';

  let result = texte.trim();

  // 1. Corriger les noms de quartiers (insensible à la casse, avec frontières de mots)
  // Utiliser un seul passage pour éviter les cascades de corrections
  const allCorrections: [string, string][] = [
    ...Object.entries(CORRECTIONS_QUARTIERS),
    ...Object.entries(CORRECTIONS_PHONETIQUES).filter(([k]) => k.length >= 4),
  ];
  // Trier par longueur décroissante pour que les corrections les plus longues
  // soient appliquées en premier (évite que "tampou" corrige "tampouille" en "Tampouyille")
  allCorrections.sort((a, b) => b[0].length - a[0].length);

  for (const [erreur, correction] of allCorrections) {
    const escaped = erreur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Frontières de mots pour éviter de corriger des sous-chaînes déjà corrigées
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, correction);
  }

  // 3. Normaliser les numéros de téléphone (XX XX XX XX)
  // Détecter les séquences de chiffres et les formater
  result = result.replace(/(\d{2})\s*[-.\s]?\s*(\d{2})\s*[-.\s]?\s*(\d{2})\s*[-.\s]?\s*(\d{2})/g, '$1 $2 $3 $4');

  // 4. Corriger "ouaga 2000" quelle que soit la casse
  result = result.replace(/ouaga\s*(deux|mille|2)\s*mille/gi, 'Ouaga 2000');
  result = result.replace(/ouaga\s*2000/gi, 'Ouaga 2000');

  // 5. Supprimer les espaces multiples
  result = result.replace(/\s{2,}/g, ' ').trim();

  // 6. Capitaliser la première lettre
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  return result;
}

/**
 * Évalue la confiance d'une transcription.
 * Retourne { confidence, status, raisons }.
 *
 * - confidence: 0 à 1
 * - status: 'transcrit' | 'faible_confiance' | 'echec'
 * - raisons: liste des facteurs affectant la confiance
 */
export function evaluerConfianceTranscription(
  texteBrut: string,
  texteNettoye: string
): { confidence: number; status: string; raisons: string[] } {
  const raisons: string[] = [];

  if (!texteBrut || texteBrut.trim().length < 2) {
    return { confidence: 0, status: 'echec', raisons: ['Transcription vide ou trop courte'] };
  }

  let confidence = 0.8; // Base

  // 1. Marqueurs d'incertitude explicites
  const texteLower = texteBrut.toLowerCase();
  for (const marqueur of MARQUEURS_INCERTITUDE) {
    if (texteLower.includes(marqueur.toLowerCase())) {
      confidence -= 0.3;
      raisons.push(`Marqueur d'incertitude détecté: "${marqueur}"`);
    }
  }

  // 2. Longueur très courte (peut indiquer une transcription partielle)
  // Sauf si c'est une salutation valide (bonjour, salut, bonsoir)
  const mots = texteBrut.trim().split(/\s+/);
  const SALUTATIONS = ['bonjour', 'salut', 'bonsoir', 'hello', 'coucou', 'cc'];
  const isSalutationCourte = mots.length < 3 && mots.some(m => SALUTATIONS.includes(m.toLowerCase().replace(/[.,!?]/g, '')));
  if (mots.length < 3 && !isSalutationCourte) {
    confidence -= 0.2;
    raisons.push(`Transcription très courte (${mots.length} mot(s))`);
  }

  // 3. Trop de mots inconnus / non-Français
  // Compter les mots qui ne ressemblent pas à du français
  const motsInconnus = mots.filter(m =>
    m.length > 3 &&
    !/^(le|la|les|un|une|des|de|du|et|ou|mais|donc|car|ni|or|je|tu|il|elle|on|nous|vous|ils|elles|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs|ce|cet|cette|ces|quel|quelle|quels|quelles|qui|que|quoi|dont|où|quand|comment|pourquoi|est|suis|es|sommes|êtes|sont|ai|as|avons|avez|ont|vais|vas|va|allons|allez|vont|veux|veut|voulons|voulez|veulent|peux|peut|pouvons|pouvez|peuvent|dois|doit|devons|devez|doivent|suis|être|avoir|aller|vouloir|pouvoir|devoir|bonjour|salut|bonsoir|colis|livraison|course|envoyer|expédier|recevoir|déplacement|livreur|client|adresse|quartier|téléphone|numéro|prix|tarif|fcfa|franc|oui|non|ok|merci|pardon|silgapp|venus|ouaga|tampouy|gounghin|karpala|pissy|saaba|tanghin|zone|bois|patte|dassasgho|cissin|samandin|wemtenga|bendogo|larle|somgande|kossodo)$/i.test(m)
  );
  if (motsInconnus.length > mots.length * 0.4) {
    confidence -= 0.2;
    raisons.push(`${motsInconnus.length} mot(s) non reconnu(s) sur ${mots.length}`);
  }

  // 4. Présence de noms de quartiers (bon signe de compréhension)
  const aQuartier = QUARTIERS_VALIDES.some(q => texteNettoye.toLowerCase().includes(q));
  if (aQuartier) {
    confidence += 0.1;
    raisons.push('Nom de quartier reconnu');
  }

  // 5. Présence de numéros de téléphone (bon signe)
  if (/\d{2}\s\d{2}\s\d{2}\s\d{2}/.test(texteNettoye)) {
    confidence += 0.05;
    raisons.push('Numéro de téléphone détecté');
  }

  // 6. Mots très déformés (répétitions de lettres, caractères bizarres)
  if (/(.)\1{3,}/.test(texteBrut)) {
    confidence -= 0.15;
    raisons.push('Caractères répétés anormalement');
  }

  // Clamp
  confidence = Math.max(0, Math.min(1, confidence));

  let status = 'transcrit';
  if (confidence < 0.5) {
    status = 'echec';
  } else if (confidence < 0.7) {
    status = 'faible_confiance';
  }

  if (raisons.length === 0) raisons.push('Transcription de qualité acceptable');

  return { confidence, status, raisons };
}

/**
 * Détermine si une action sensible peut être exécutée
 * à partir d'une transcription audio.
 *
 * Règles :
 * - confidence < 0.5 → JAMAIS (demander de répéter)
 * - confidence 0.5-0.7 → UNIQUEMENT avec confirmation explicite
 * - confidence > 0.7 → OK mais confirmation recommandée
 */
export function peutAgirSurAudio(confidence: number): {
  peutAgir: boolean;
  forceConfirmation: boolean;
  raison: string;
} {
  if (confidence < 0.5) {
    return {
      peutAgir: false,
      forceConfirmation: true,
      raison: 'Confiance trop faible — demander de répéter ou d\'écrire',
    };
  }
  if (confidence < 0.7) {
    return {
      peutAgir: false,
      forceConfirmation: true,
      raison: 'Confiance moyenne — confirmation obligatoire avant toute action',
    };
  }
  return {
    peutAgir: true,
    forceConfirmation: true, // Toujours confirmer pour l'audio
    raison: 'Confiance suffisante — confirmation recommandée',
  };
}

/**
 * Génère un message de demande de confirmation pour transcription audio.
 */
export function genererMessageConfirmationAudio(transcription: string): string {
  return `Si j'ai bien compris, vous avez dit : "${transcription}". Est-ce bien cela ? Répondez "oui" pour confirmer ou reformulez votre demande.`;
}

/**
 * Génère un message de demande de répétition pour transcription échouée.
 */
export function genererMessageRepetitionAudio(): string {
  return "Je n'ai pas bien compris votre message vocal. Pouvez-vous le répéter plus lentement ou me l'écrire ?";
}