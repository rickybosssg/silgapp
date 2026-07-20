/**
 * ═══════════════════════════════════════════════════════════════════
 * SCÉNARIOS DE TEST AUDIO VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Simule des transcriptions audio (avec erreurs courantes de Whisper)
 * et vérifie que le pipeline de nettoyage + gating + confirmation
 * fonctionne correctement.
 * ═══════════════════════════════════════════════════════════════════
 */

export interface AudioTestScenario {
  id: string;
  nom: string;
  description: string;
  // Texte réellement prononcé (vérité terrain)
  texte_prononce: string;
  // Transcription brute simulée (avec erreurs Whisper)
  transcription_brute: string;
  // Ce qu'on attend du pipeline
  attendu: {
    // La transcription nettoyée doit contenir ces mots
    nettoyage_contient?: string[];
    // La confiance doit être dans cette fourchette
    confiance_min?: number;
    confiance_max?: number;
    // Le statut attendu
    status?: string;
    // VENUS doit-elle demander une confirmation ?
    doit_confirmer?: boolean;
    // VENUS doit-elle demander de répéter ?
    doit_demander_repete?: boolean;
    // VENUS ne doit PAS créer de course immédiatement
    pas_creation_immediate?: boolean;
  };
}

export const AUDIO_SCENARIOS: AudioTestScenario[] = [
  // ── 1. Salutation simple ──
  {
    id: 'audio_bonjour_simple',
    nom: 'Audio — Bonjour simple',
    description: 'Message vocal court : "Bonjour VENUS"',
    texte_prononce: 'Bonjour VENUS',
    transcription_brute: 'bonjour venus',
    attendu: {
      nettoyage_contient: ['Bonjour', 'VENUS'],
      confiance_min: 0.7,
      status: 'transcrit',
      doit_confirmer: true,
      pas_creation_immediate: true,
    },
  },

  // ── 2. Demande de livraison avec quartier ──
  {
    id: 'audio_livraison_zone_bois_saaba',
    nom: 'Audio — Livraison Zone du Bois vers Saaba',
    description: 'Message vocal : "Je veux une livraison de Zone du Bois vers Saaba"',
    texte_prononce: 'Je veux une livraison de Zone du Bois vers Saaba',
    transcription_brute: 'je ve une livrason de zone du boi vers saba',
    attendu: {
      nettoyage_contient: ['Zone du Bois', 'Saaba', 'livraison'],
      confiance_min: 0.6,
      doit_confirmer: true,
      pas_creation_immediate: true,
    },
  },

  // ── 3. Numéro de téléphone dicté ──
  {
    id: 'audio_numero_telephone',
    nom: 'Audio — Numéro de téléphone dicté',
    description: 'Message vocal : "Le numéro du destinataire est 70 12 34 56"',
    texte_prononce: 'Le numéro du destinataire est 70 12 34 56',
    transcription_brute: 'le numero du destinataire est 70 12 34 56',
    attendu: {
      nettoyage_contient: ['70 12 34 56'],
      confiance_min: 0.6,
      doit_confirmer: true,
    },
  },

  // ── 4. Quartier mal transcrit — Tampouy ──
  {
    id: 'audio_tampouy_mal_transcrit',
    nom: 'Audio — Tampouy mal transcrit',
    description: 'Whisper transcrit "Tampouy" comme "tampouille"',
    texte_prononce: 'Je veux envoyer un colis à Tampouy',
    transcription_brute: 'je veu envoye un coli a tampouille',
    attendu: {
      nettoyage_contient: ['Tampouy', 'colis'],
      confiance_min: 0.5,
      doit_confirmer: true,
      pas_creation_immediate: true,
    },
  },

  // ── 5. Quartier mal transcrit — Gounghin ──
  {
    id: 'audio_gounghin_mal_transcrit',
    nom: 'Audio — Gounghin mal transcrit',
    description: 'Whisper transcrit "Gounghin" comme "gonghin"',
    texte_prononce: 'Je suis à Gounghin',
    transcription_brute: 'je suis a gonghin',
    attendu: {
      nettoyage_contient: ['Gounghin'],
      confiance_min: 0.5,
      doit_confirmer: true,
    },
  },

  // ── 6. Ouaga 2000 ──
  {
    id: 'audio_ouaga_2000',
    nom: 'Audio — Ouaga 2000',
    description: 'Message vocal : "Livraison vers Ouaga 2000"',
    texte_prononce: 'Livraison vers Ouaga 2000',
    transcription_brute: 'livrason vers ouaga deux mille',
    attendu: {
      nettoyage_contient: ['Ouaga 2000'],
      confiance_min: 0.5,
      doit_confirmer: true,
    },
  },

  // ── 7. Patte d\'Oie ──
  {
    id: 'audio_patte_doie',
    nom: 'Audio — Patte d\'Oie',
    description: 'Whisper transcrit "Patte d\'Oie" comme "patte d\'huile"',
    texte_prononce: 'Je suis à Patte d\'Oie',
    transcription_brute: 'je suis a patte d huile',
    attendu: {
      nettoyage_contient: ["Patte d'Oie"],
      confiance_min: 0.5,
      doit_confirmer: true,
    },
  },

  // ── 8. Audio incompréhensible ──
  {
    id: 'audio_incomprehensible',
    nom: 'Audio — Incompréhensible',
    description: 'Transcription avec marqueurs d\'incertitude',
    texte_prononce: '(inaudible)',
    transcription_brute: '[inaudible] ... [bruit]',
    attendu: {
      confiance_max: 0.5,
      status: 'echec',
      doit_demander_repete: true,
      pas_creation_immediate: true,
    },
  },

  // ── 9. Audio très court ──
  {
    id: 'audio_tres_court',
    nom: 'Audio — Très court',
    description: 'Message vocal très court (1 mot)',
    texte_prononce: 'Livraison',
    transcription_brute: 'livrason',
    attendu: {
      confiance_max: 0.7,
      doit_confirmer: true,
      pas_creation_immediate: true,
    },
  },

  // ── 10. Audio avec bruit de rue ──
  {
    id: 'audio_bruit_rue',
    nom: 'Audio — Bruit de rue',
    description: 'Transcription partielle avec bruit de fond',
    texte_prononce: 'Je veux envoyer un colis à Karpala',
    transcription_brute: 'je veu [bruit] un coli a carpala [bruit de fond]',
    attendu: {
      nettoyage_contient: ['Karpala'],
      confiance_max: 0.7,
      doit_confirmer: true,
      pas_creation_immediate: true,
    },
  },

  // ── 11. Audio long avec plusieurs infos ──
  {
    id: 'audio_long_complet',
    nom: 'Audio — Long avec plusieurs infos',
    description: 'Message vocal long avec type, départ, arrivée et téléphone',
    texte_prononce: 'Bonjour, je veux envoyer un colis de Gounghin à Tampouy, le numéro du destinataire est 70 12 34 56',
    transcription_brute: 'bonjour je veu envoye un coli de gonghin a tampouille le numero du destinataire est 70 12 34 56',
    attendu: {
      nettoyage_contient: ['Gounghin', 'Tampouy', '70 12 34 56'],
      confiance_min: 0.6,
      doit_confirmer: true,
      pas_creation_immediate: true,
    },
  },

  // ── 12. Audio avec accent — Pissy ──
  {
    id: 'audio_pissy_accent',
    nom: 'Audio — Pissy avec accent',
    description: 'Whisper transcrit "Pissy" comme "piscine"',
    texte_prononce: 'Livraison de Pissy vers Saaba',
    transcription_brute: 'livrason de piscine vers saba',
    attendu: {
      nettoyage_contient: ['Pissy', 'Saaba'],
      confiance_min: 0.5,
      doit_confirmer: true,
    },
  },

  // ── 13. Audio corrompu / vide ──
  {
    id: 'audio_corrompu',
    nom: 'Audio — Corrompu ou vide',
    description: 'Transcription vide',
    texte_prononce: '(silence)',
    transcription_brute: '',
    attendu: {
      confiance_max: 0.1,
      status: 'echec',
      doit_demander_repete: true,
      pas_creation_immediate: true,
    },
  },

  // ── 14. Audio avec mélange français/mots locaux ──
  {
    id: 'audio_mixte_franc_moore',
    nom: 'Audio — Mélange français/mooré',
    description: 'Message avec mots locaux mélangés au français',
    texte_prononce: 'Yaa doga, m ba n kibre (Bonjour, je veux une livraison)',
    transcription_brute: 'ya doga m ba n kibre',
    attendu: {
      confiance_max: 0.6,
      doit_confirmer: true,
      pas_creation_immediate: true,
    },
  },

  // ── 15. Audio — Dassasgho mal transcrit ──
  {
    id: 'audio_dassasgho',
    nom: 'Audio — Dassasgho mal transcrit',
    description: 'Whisper transcrit "Dassasgho" comme "dassasco"',
    texte_prononce: 'Je suis à Dassasgho',
    transcription_brute: 'je suis a dassasco',
    attendu: {
      nettoyage_contient: ['Dassasgho'],
      confiance_min: 0.5,
      doit_confirmer: true,
    },
  },
];