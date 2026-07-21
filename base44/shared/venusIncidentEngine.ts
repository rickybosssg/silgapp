/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR DE DÉTECTION ET D'ESCALADE D'INCIDENTS VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Détecte automatiquement les incidents dans les messages clients,
 * livreurs et partenaires, puis les escalade vers l'administrateur.
 *
 * Pipeline :
 * 1. Normalisation du message (0 crédit)
 * 2. Détection par patterns regex (0 crédit)
 * 3. Classification de la gravité (0 crédit)
 * 4. Enregistrement de l'incident (VenusIncident)
 * 5. Notification administrateur (Notification + modal)
 * 6. Message rassurant au client
 *
 * VENUS ne promet JAMAIS un remboursement, une sanction ou une
 * indemnisation sans règle métier officielle et validation réelle.
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type NiveauGravite = 'faible' | 'moyen' | 'eleve' | 'critique';
export type TypeIncident =
  | 'livreur_injoignable' | 'client_injoignable' | 'destinataire_injoignable'
  | 'panne_moto' | 'accident' | 'colis_perdu' | 'colis_endommage'
  | 'colis_vole' | 'colis_refuse' | 'conflit_client_livreur'
  | 'menace_agression' | 'suspicion_fraude' | 'probleme_paiement'
  | 'probleme_qr_pin' | 'destinataire_introuvable' | 'erreur_adresse'
  | 'urgence_medicale' | 'situation_sensible' | 'autre';

interface IncidentPattern {
  type: TypeIncident;
  gravite: NiveauGravite;
  patterns: RegExp[];
}

interface IncidentDetection {
  type_incident: TypeIncident;
  niveau_gravite: NiveauGravite;
  pattern_matche: string;
  message_normalise: string;
}

// ═══════════════════════════════════════════════════════════════════
// PATTERNS DE DÉTECTION (0 crédit — pure regex)
// ═══════════════════════════════════════════════════════════════════

const INCIDENT_PATTERNS: IncidentPattern[] = [
  // ── CRITIQUE ──
  {
    type: 'accident',
    gravite: 'critique',
    patterns: [
      /\baccident\b/i, /\baccroch/i, /\bcollision\b/i, /\brenvers/i,
    ],
  },
  {
    type: 'urgence_medicale',
    gravite: 'critique',
    patterns: [
      /\bmalaise\b/i, /\bevanoui/i, /\bmalade\b/i, /\bblesse\b/i,
      /\burgence medicale\b/i, /\binconscient\b/i, /\bprobleme de sante\b/i,
    ],
  },
  {
    type: 'menace_agression',
    gravite: 'critique',
    patterns: [
      /\bmenac/i, /\bagress/i, /\bviolence\b/i, /\binsulte/i,
      /\bfrappe\b/i, /\bcoup de\b/i, /\barm/i,
    ],
  },
  {
    type: 'colis_vole',
    gravite: 'critique',
    patterns: [
      /\bvole\b/i, /\bon m.a pris\b/i, /\bdebours/i, /\bvol du colis\b/i,
      /\bon m.a vole\b/i,
    ],
  },
  // ── ÉLEVÉ ──
  {
    type: 'panne_moto',
    gravite: 'eleve',
    patterns: [
      /\bpanne\b/i, /\bpneu\b/i, /\bcreve\b/i, /\bmoto casse/i,
      /\bplus de moto\b/i, /\bvehicule en panne\b/i, /\bmoto en panne\b/i,
    ],
  },
  {
    type: 'colis_perdu',
    gravite: 'eleve',
    patterns: [
      /\bcolis.*perdu\b/i, /\bperdu le colis\b/i, /\bperdu mon colis\b/i,
      /\bcolis disparu\b/i, /\bperdu la course\b/i, /\bperdu mon paquet\b/i,
    ],
  },
  {
    type: 'colis_endommage',
    gravite: 'eleve',
    patterns: [
      /\bendommag/i, /\babime\b/i, /\bdeterior/i, /\bcolis casse\b/i,
      /\bcasse pendant\b/i, /\btombe pendant\b/i,
    ],
  },
  {
    type: 'suspicion_fraude',
    gravite: 'eleve',
    patterns: [
      /\bfraude\b/i, /\barnaque/i, /\bescroquer/i, /\bsuspect/i,
      /\bfactice\b/i,
    ],
  },
  {
    type: 'conflit_client_livreur',
    gravite: 'eleve',
    patterns: [
      /\bdispute\b/i, /\bconflit\b/i, /\bprobleme avec le livreur\b/i,
      /\bse sont dispute/i, /\bdispute avec\b/i, /\bquerelle\b/i,
    ],
  },
  // ── MOYEN ──
  {
    type: 'livreur_injoignable',
    gravite: 'moyen',
    patterns: [
      /\binjoignable\b/i, /\bne repond pas\b/i, /\bpas de reponse\b/i,
      /\bn.arrive pas a joindre\b/i, /\bne prend pas\b/i,
      /\blivreur ne repond\b/i, /\bappels sans reponse\b/i,
    ],
  },
  {
    type: 'destinataire_injoignable',
    gravite: 'moyen',
    patterns: [
      /\bdestinataire injoignable\b/i, /\bdestinataire ne repond\b/i,
      /\bdestinataire absent\b/i, /\bdestinataire ne prend pas\b/i,
    ],
  },
  {
    type: 'destinataire_introuvable',
    gravite: 'moyen',
    patterns: [
      /\bdestinataire introuvable\b/i, /\bpersonne pour recev/i,
      /\bpas la pour recev/i, /\bpersonne a l.arrivee\b/i,
      /\bpersonne au point de chute\b/i,
    ],
  },
  {
    type: 'erreur_adresse',
    gravite: 'moyen',
    patterns: [
      /\bmauvaise adresse\b/i, /\badresse incorrect/i, /\bpas la bonne adresse\b/i,
      /\badresse errone/i, /\bmauvais lieu\b/i,
    ],
  },
  {
    type: 'probleme_paiement',
    gravite: 'moyen',
    patterns: [
      /\bpaiement refuse\b/i, /\btransaction echou/i, /\bargent non recu\b/i,
      /\bprobleme de paiement\b/i, /\bpaiement echou/i, /\bpaiement bloque\b/i,
    ],
  },
  {
    type: 'probleme_qr_pin',
    gravite: 'moyen',
    patterns: [
      /\bqr invalide\b/i, /\bqr ne marche pas\b/i, /\bcode pin.*incorrect\b/i,
      /\bcode.*incorrect\b/i, /\bqr casse\b/i, /\bcode pin marche pas\b/i,
      /\bqr bloque\b/i, /\bcode pin errone\b/i, /\bpin.*incorrect\b/i,
    ],
  },
  {
    type: 'colis_refuse',
    gravite: 'moyen',
    patterns: [
      /\bcolis refuse\b/i, /\brefuse le colis\b/i, /\bne veut pas prendre\b/i,
      /\brefuse de recev/i, /\brefus de livraison\b/i,
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// LABELS
// ═══════════════════════════════════════════════════════════════════

export const TYPE_INCIDENT_LABELS: Record<TypeIncident, string> = {
  livreur_injoignable: 'Livreur injoignable',
  client_injoignable: 'Client injoignable',
  destinataire_injoignable: 'Destinataire injoignable',
  panne_moto: 'Panne de moto',
  accident: 'Accident',
  colis_perdu: 'Colis perdu',
  colis_endommage: 'Colis endommagé',
  colis_vole: 'Colis volé',
  colis_refuse: 'Colis refusé',
  conflit_client_livreur: 'Conflit client/livreur',
  menace_agression: 'Menace ou agression',
  suspicion_fraude: 'Suspicion de fraude',
  probleme_paiement: 'Problème de paiement',
  probleme_qr_pin: 'Problème QR/PIN',
  destinataire_introuvable: 'Destinataire introuvable',
  erreur_adresse: 'Erreur d\'adresse',
  urgence_medicale: 'Urgence médicale',
  situation_sensible: 'Situation sensible',
  autre: 'Autre incident',
};

export const GRAVITE_LABELS: Record<NiveauGravite, string> = {
  faible: 'Faible',
  moyen: 'Moyen',
  eleve: 'Élevé',
  critique: 'Critique',
};

export const GRAVITE_EMOJI: Record<NiveauGravite, string> = {
  faible: '🟡',
  moyen: '🟠',
  eleve: '🔴',
  critique: '🚨',
};

// ═══════════════════════════════════════════════════════════════════
// 1. NORMALISATION
// ═══════════════════════════════════════════════════════════════════

function normaliserMessage(texte: string): string {
  return (texte || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════
// 2. DÉTECTION (0 crédit — pure regex)
// ═══════════════════════════════════════════════════════════════════

/**
 * Détecte un incident dans un message client/livreur/partenaire.
 * Retourne null si aucun incident n'est détecté.
 */
export function detecterIncidentDansMessage(message: string): IncidentDetection | null {
  if (!message || message.trim().length < 5) return null;

  const normalise = normaliserMessage(message);

  // Priorité par gravité : critique > élevé > moyen
  const ordreGravite: NiveauGravite[] = ['critique', 'eleve', 'moyen'];

  for (const graviteCible of ordreGravite) {
    for (const pattern of INCIDENT_PATTERNS) {
      if (pattern.gravite !== graviteCible) continue;

      for (const regex of pattern.patterns) {
        if (regex.test(normalise)) {
          return {
            type_incident: pattern.type,
            niveau_gravite: pattern.gravite,
            pattern_matche: regex.source,
            message_normalise: normalise,
          };
        }
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// 3. ENREGISTREMENT DE L'INCIDENT
// ═══════════════════════════════════════════════════════════════════

export async function enregistrerIncident(base44: any, params: {
  type_incident: TypeIncident;
  niveau_gravite: NiveauGravite;
  course_id?: string;
  conversation_id?: string;
  client_telephone: string;
  client_nom?: string;
  livreur_id?: string;
  livreur_nom?: string;
  country_code?: string;
  message_original: string;
  contexte?: Record<string, any>;
  pattern_matche?: string;
  source?: string;
}): Promise<any> {
  try {
    const typeLabel = TYPE_INCIDENT_LABELS[params.type_incident] || params.type_incident;
    const graviteLabel = GRAVITE_LABELS[params.niveau_gravite] || params.niveau_gravite;

    const resume = `Incident ${graviteLabel.toLowerCase()} — ${typeLabel}. Client: ${params.client_nom || params.client_telephone}. Message: "${(params.message_original || '').substring(0, 200)}"`;

    const incident = await base44.asServiceRole.entities.VenusIncident.create({
      type_incident: params.type_incident,
      niveau_gravite: params.niveau_gravite,
      course_id: params.course_id || '',
      conversation_id: params.conversation_id || '',
      client_telephone: params.client_telephone,
      client_nom: params.client_nom || '',
      livreur_id: params.livreur_id || '',
      livreur_nom: params.livreur_nom || '',
      country_code: params.country_code || '',
      message_original: params.message_original,
      contexte: JSON.stringify(params.contexte || {}),
      resume_automatique: resume,
      informations_transmises: JSON.stringify({
        client_telephone: params.client_telephone,
        client_nom: params.client_nom,
        course_id: params.course_id,
        livreur_id: params.livreur_id,
        livreur_nom: params.livreur_nom,
        message: params.message_original,
        contexte: params.contexte,
      }),
      pattern_matche: params.pattern_matche || '',
      statut: 'ouvert',
      client_informe: false,
      notif_admin_envoyee: false,
      source: params.source || 'whatsapp',
      date_creation: new Date().toISOString(),
    });

    console.log(`[IncidentEngine] 🚨 Incident ${params.type_incident} (${params.niveau_gravite}) enregistré: ${incident.id}`);
    return incident;
  } catch (e: any) {
    console.error('[IncidentEngine] Erreur enregistrement incident:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. NOTIFICATION ADMINISTRATEUR
// ═══════════════════════════════════════════════════════════════════

export async function notifierAdminIncident(base44: any, incident: any): Promise<void> {
  if (!incident) return;

  try {
    const typeLabel = TYPE_INCIDENT_LABELS[incident.type_incident as TypeIncident] || incident.type_incident;
    const graviteLabel = GRAVITE_LABELS[incident.niveau_gravite as NiveauGravite] || incident.niveau_gravite;
    const emoji = GRAVITE_EMOJI[incident.niveau_gravite as NiveauGravite] || '⚠️';

    await base44.asServiceRole.entities.Notification.create({
      titre: `${emoji} Incident ${graviteLabel.toLowerCase()}: ${typeLabel}`,
      message: `${emoji} Incident ${graviteLabel.toLowerCase()} détecté\n\nType: ${typeLabel}\nClient: ${incident.client_nom || incident.client_telephone}\nTéléphone: ${incident.client_telephone}\n${incident.course_id ? `Course: ${incident.course_id}\n` : ''}${incident.livreur_nom ? `Livreur: ${incident.livreur_nom}\n` : ''}Message: "${(incident.message_original || '').substring(0, 300)}"\n\nDate: ${new Date().toLocaleString('fr-FR')}`,
      type: 'incident_detecte',
      course_id: incident.course_id || '',
      lue: false,
    });

    // Marquer l'incident comme notifié
    await base44.asServiceRole.entities.VenusIncident.update(incident.id, {
      notif_admin_envoyee: true,
    });

    console.log(`[IncidentEngine] 📢 Notification admin envoyée pour incident ${incident.id}`);
  } catch (e: any) {
    console.error('[IncidentEngine] Erreur notification admin:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. MESSAGE CLIENT RASSURANT
// ═══════════════════════════════════════════════════════════════════

export function genererMessageClientIncident(incident: any): string {
  const typeLabel = TYPE_INCIDENT_LABELS[incident.type_incident as TypeIncident] || 'incident';
  const isCritique = incident.niveau_gravite === 'critique';

  if (isCritique) {
    return `Je suis profondément désolée pour cette situation. Je viens de transmettre immédiatement cet incident à un responsable avec toutes les informations déjà fournies. Vous n'aurez pas à tout recommencer. Un membre de notre équipe vous contactera dans les plus brefs délais. Pour toute urgence, le support est disponible au +226 66 92 51 90.`;
  }

  return `Je suis désolée d'apprendre cela. Je viens de transmettre le signalement (${typeLabel.toLowerCase()}) à un responsable avec les informations déjà fournies. Vous n'aurez pas à tout recommencer. Notre équipe prend en charge la situation et vous tiendra informé(e). N'hésitez pas à me contacter si vous avez d'autres informations à communiquer.`;
}

// ═══════════════════════════════════════════════════════════════════
// 6. PIPELINE COMPLET (utilisé par le webhook)
// ═══════════════════════════════════════════════════════════════════

export async function detecterEtTraiterIncident(base44: any, params: {
  message: string;
  telephone: string;
  profileName?: string;
  countryCode?: string;
  conversation_id?: string;
  courseActive?: any;
  source?: string;
}): Promise<{ incident: any; message_client: string } | null> {
  const detection = detecterIncidentDansMessage(params.message);
  if (!detection) return null;

  const course = params.courseActive;
  const incident = await enregistrerIncident(base44, {
    type_incident: detection.type_incident,
    niveau_gravite: detection.niveau_gravite,
    course_id: course?.id,
    conversation_id: params.conversation_id,
    client_telephone: params.telephone,
    client_nom: params.profileName,
    livreur_id: course?.livreur_id,
    livreur_nom: course?.livreur_nom,
    country_code: params.countryCode,
    message_original: params.message,
    contexte: {
      statut_course: course?.statut,
      type_course: course?.type_course,
      adresse_depart: course?.adresse_depart,
      adresse_arrivee: course?.adresse_arrivee,
    },
    pattern_matche: detection.pattern_matche,
    source: params.source || 'whatsapp',
  });

  if (incident) {
    await notifierAdminIncident(base44, incident);

    // Marquer le client comme informé
    try {
      await base44.asServiceRole.entities.VenusIncident.update(incident.id, {
        client_informe: true,
      });
    } catch {}

    const message_client = genererMessageClientIncident(incident);
    return { incident, message_client };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════
// 7. UTILITAIRES
// ═══════════════════════════════════════════════════════════════════

export function listerTypesIncidents(): { type: TypeIncident; label: string; gravite_defaut: NiveauGravite }[] {
  const graviteParType: Record<string, NiveauGravite> = {};
  for (const p of INCIDENT_PATTERNS) {
    if (!graviteParType[p.type]) graviteParType[p.type] = p.gravite;
  }
  return Object.keys(TYPE_INCIDENT_LABELS).map((type) => ({
    type: type as TypeIncident,
    label: TYPE_INCIDENT_LABELS[type as TypeIncident],
    gravite_defaut: graviteParType[type] || 'moyen',
  }));
}