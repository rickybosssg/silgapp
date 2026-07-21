/**
 * ═══════════════════════════════════════════════════════════════════
 * MOTEUR DE MODIFICATION DE COURSE VENUS
 * ═══════════════════════════════════════════════════════════════════
 *
 * Permet à VENUS de modifier une course existante de manière sécurisée.
 *
 * Règles obligatoires :
 * 1. Identifier la course concernée
 * 2. Lire son statut réel dans la DB
 * 3. Vérifier que le client est autorisé
 * 4. Identifier les champs à changer
 * 5. Afficher un récapitulatif avant/après
 * 6. Demander une confirmation explicite
 * 7. Effectuer la modification
 * 8. Relire la course dans la DB après l'opération
 * 9. Confirmer uniquement les changements réellement enregistrés
 *
 * VENUS ne doit JAMAIS annoncer qu'une modification est terminée
 * si la base de données ne le confirme pas.
 * ═══════════════════════════════════════════════════════════════════
 */

import { trouverCourseActive } from './venusReasoningEngine.ts';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES — RÈGLES PAR STATUT
// ═══════════════════════════════════════════════════════════════════

export const STATUTS_NON_MODIFIABLES = ['arrivee', 'livree', 'annulee'];

const CHAMPS_PAR_CATEGORIE: Record<string, string[]> = {
  all: [
    'adresse_depart', 'gps_depart_lat', 'gps_depart_lng',
    'adresse_arrivee', 'gps_arrivee_lat', 'gps_arrivee_lng',
    'destinataire_nom', 'destinataire_telephone',
    'expediteur_nom', 'expediteur_telephone',
    'type_colis', 'notes', 'date_souhaitee', 'manual_price',
  ],
  partial: [
    'adresse_arrivee', 'gps_arrivee_lat', 'gps_arrivee_lng',
    'destinataire_nom', 'destinataire_telephone',
    'type_colis', 'notes', 'manual_price',
  ],
  instructions: ['notes', 'destinataire_telephone'],
  none: [],
};

const STATUT_TO_CATEGORIE: Record<string, string> = {
  'nouvelle': 'all',
  'programmee': 'all',
  'recherche_livreur': 'all',
  'livreur_en_route': 'partial',
  'arrive_prise_en_charge': 'partial',
  'colis_recupere': 'instructions',
  'passager_embarque': 'instructions',
  'pris_en_charge': 'instructions',
  'en_livraison': 'instructions',
  'arrivee': 'none',
  'livree': 'none',
  'annulee': 'none',
};

const STATUTS_AVEC_LIVREUR = [
  'livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere',
  'passager_embarque', 'pris_en_charge', 'en_livraison',
];

// ═══════════════════════════════════════════════════════════════════
// LABELS DES CHAMPS
// ═══════════════════════════════════════════════════════════════════

const CHAMP_LABELS: Record<string, string> = {
  adresse_depart: 'Adresse de récupération',
  gps_depart_lat: 'GPS de récupération (latitude)',
  gps_depart_lng: 'GPS de récupération (longitude)',
  adresse_arrivee: 'Adresse de livraison',
  gps_arrivee_lat: 'GPS de livraison (latitude)',
  gps_arrivee_lng: 'GPS de livraison (longitude)',
  destinataire_nom: 'Nom du destinataire',
  destinataire_telephone: 'Numéro du destinataire',
  expediteur_nom: 'Nom de l\'expéditeur',
  expediteur_telephone: 'Numéro de l\'expéditeur',
  type_colis: 'Description du colis',
  notes: 'Instructions au livreur',
  date_souhaitee: 'Date et heure programmées',
  manual_price: 'Montant à récupérer',
};

export function getChampLabel(champ: string): string {
  return CHAMP_LABELS[champ] || champ;
}

// ═══════════════════════════════════════════════════════════════════
// 1. VÉRIFICATION DES MODIFICATIONS AUTORISÉES
// ═══════════════════════════════════════════════════════════════════

export function getChampsModifiables(statut: string): string[] {
  const categorie = STATUT_TO_CATEGORIE[statut] || 'none';
  return CHAMPS_PAR_CATEGORIE[categorie] || [];
}

export function verifierModificationsAutorisees(statut: string, champs: string[]): {
  autorises: string[];
  refuses: string[];
} {
  const allowed = getChampsModifiables(statut);
  const autorises: string[] = [];
  const refuses: string[] = [];

  for (const champ of champs) {
    if (allowed.includes(champ)) {
      autorises.push(champ);
    } else {
      refuses.push(champ);
    }
  }

  return { autorises, refuses };
}

// ═══════════════════════════════════════════════════════════════════
// 2. DÉTECTION D'INTENTION DE MODIFICATION (0 crédit)
// ═══════════════════════════════════════════════════════════════════

const MODIFICATION_INTENT_PATTERNS = [
  /\bmodif/i,
  /\bchang(?:er|ez|ement)\s+(?:l['e ]|l['a ]|la |le |les |mon |ma |mes )/i,
  /\bchang(?:er|ez)\s+(?:adresse|num|destinataire|contact|instruction|note|lieu|destination|heure|date|prix|montant)/i,
  /\brectif/i,
  /\bcorrig/i,
  /\bnouvel(?:le)?\s+(?:adresse|num|destinataire|contact|instruction)/i,
  /\bau lieu de\b/i,
  /\bje veux chang\b/i,
  /\bpeut[- ]on chang\b/i,
  /\bje voudrais chang\b/i,
  /\bremplac(?:er|ez)\b/i,
];

export function detecterIntentionModification(message: string): boolean {
  if (!message || message.trim().length < 5) return false;
  const normalise = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return MODIFICATION_INTENT_PATTERNS.some(p => p.test(normalise));
}

// ═══════════════════════════════════════════════════════════════════
// 3. EXTRACTION DU CHAMP ET DE LA VALEUR (LLM — 1 crédit)
// ═══════════════════════════════════════════════════════════════════

export async function extraireChampEtValeur(
  base44: any,
  message: string,
  course: any
): Promise<{ champ: string | null; valeur: string | null; question: string | null }> {
  const prompt = `Tu es VENUS. Le client veut modifier sa course active.

COURSE ACTUELLE:
- Type: ${course.type_course}
- Adresse départ: ${course.adresse_depart || 'N/A'}
- Adresse arrivée: ${course.adresse_arrivee || 'N/A'}
- Destinataire: ${course.destinataire_nom || 'N/A'} (${course.destinataire_telephone || 'N/A'})
- Instructions: ${course.notes || 'N/A'}
- Statut: ${course.statut}

MESSAGE DU CLIENT:
${message}

Identifie CE QUE le client veut modifier et LA NOUVELLE VALEUR si elle est présente dans le message.

Champs possibles:
- adresse_depart (adresse de récupération)
- adresse_arrivee (adresse de livraison)
- destinataire_nom (nom du destinataire)
- destinataire_telephone (numéro du destinataire)
- notes (instructions au livreur)
- type_colis (description du colis)
- date_souhaitee (date/heure, format ISO)
- manual_price (montant à récupérer)

Règles:
1. Si le client dit "changer l'adresse" sans préciser, mets champ="adresse_arrivee" (destination).
2. Si le client dit "changer l'adresse de départ/récupération", mets champ="adresse_depart".
3. Si la nouvelle valeur est dans le message, mets-la dans "valeur".
4. Si la nouvelle valeur n'est PAS dans le message, mets valeur="" et pose une question dans "question".
5. Si tu ne peux pas identifier le champ, mets champ="" et pose une question dans "question".
6. Pour un numéro de téléphone, garde uniquement les chiffres et le +.

Réponds UNIQUEMENT avec un JSON:`;

  try {
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          champ: { type: 'string', description: 'Champ à modifier (vide si inconnu)' },
          valeur: { type: 'string', description: 'Nouvelle valeur (vide si non fournie)' },
          question: { type: 'string', description: 'Question à poser si information manquante (vide sinon)' },
        },
        required: ['champ', 'valeur', 'question'],
      },
      model: 'gpt_5_mini',
    });

    const result: any = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
    return {
      champ: result.champ || null,
      valeur: result.valeur || null,
      question: result.question || null,
    };
  } catch (e: any) {
    console.error('[CourseModifier] Erreur extraction LLM:', e.message);
    return { champ: null, valeur: null, question: 'Que souhaitez-vous modifier ? (adresse de livraison, destinataire, instructions, etc.)' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. APPLICATION DE LA MODIFICATION
// ═══════════════════════════════════════════════════════════════════

export async function appliquerModification(base44: any, params: {
  course_id: string;
  modifications: Record<string, any>;
  auteur: string;
  canal: string;
  motif?: string;
  dry_run?: boolean;
}): Promise<{
  success: boolean;
  course_before: any;
  course_after: any;
  changes: any[];
  errors: any[];
  prix_recalcule: boolean;
  livreur_notifie: boolean;
}> {
  const { course_id, modifications, auteur, canal, motif, dry_run } = params;

  // 1. Lire la course dans la DB
  const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
  if (!course) {
    return { success: false, course_before: null, course_after: null, changes: [], errors: [{ error: 'Course introuvable' }], prix_recalcule: false, livreur_notifie: false };
  }

  // 2. Vérifier le statut
  if (STATUTS_NON_MODIFIABLES.includes(course.statut)) {
    return { success: false, course_before: course, course_after: course, changes: [], errors: [{ error: `Course non modifiable (statut: ${course.statut})` }], prix_recalcule: false, livreur_notifie: false };
  }

  // 3. Vérifier les champs autorisés
  const { autorises, refuses } = verifierModificationsAutorisees(course.statut, Object.keys(modifications));
  if (refuses.length > 0) {
    const refusedLabels = refuses.map(c => `${getChampLabel(c)} (non modifiable au statut ${course.statut})`);
    return { success: false, course_before: course, course_after: course, changes: [], errors: [{ error: `Champs refusés: ${refusedLabels.join(', ')}` }], prix_recalcule: false, livreur_notifie: false };
  }

  // 4. Préparer les modifications (avec champs dérivés)
  const updateData: Record<string, any> = {};
  for (const [champ, valeur] of Object.entries(modifications)) {
    updateData[champ] = valeur;

    // Champ dérivé: destinataire_telephone → destinataire_phone_normalized
    if (champ === 'destinataire_telephone') {
      updateData.destinataire_phone_normalized = valeur;
    }
    if (champ === 'expediteur_telephone') {
      updateData.expediteur_phone_normalized = valeur;
    }
    // Champ dérivé: manual_price → pricing_mode
    if (champ === 'manual_price') {
      updateData.pricing_mode = 'manual';
      updateData.manual_price_status = 'accepted';
    }
  }

  // 5. Sauvegarder les anciennes valeurs
  const changes: any[] = [];
  for (const champ of autorises) {
    changes.push({
      champ,
      ancienne_valeur: course[champ],
      nouvelle_valeur: modifications[champ],
      resultat: 'pending',
    });
  }

  // 6. dry_run → ne pas écrire
  if (dry_run) {
    return {
      success: true,
      course_before: course,
      course_after: { ...course, ...updateData },
      changes: changes.map(c => ({ ...c, resultat: 'succes', verifie: true, valeur_reelle: c.nouvelle_valeur })),
      errors: [],
      prix_recalcule: false,
      livreur_notifie: false,
    };
  }

  // 7. Appliquer la modification
  try {
    await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);
  } catch (e: any) {
    return {
      success: false,
      course_before: course,
      course_after: course,
      changes: changes.map(c => ({ ...c, resultat: 'echec', verifie: false })),
      errors: [{ error: `Erreur DB: ${e.message}` }],
      prix_recalcule: false,
      livreur_notifie: false,
    };
  }

  // 8. Relire la course dans la DB (vérification obligatoire)
  const courseAfter = await base44.asServiceRole.entities.CourseExterne.get(course_id);

  // 9. Vérifier les changements réellement enregistrés
  const verifiedChanges = changes.map(c => {
    const actualValue = courseAfter ? courseAfter[c.champ] : undefined;
    const isVerified = actualValue === c.nouvelle_valeur;
    return {
      ...c,
      resultat: isVerified ? 'succes' : 'echec',
      verifie: isVerified,
      valeur_reelle: actualValue,
    };
  });

  // 10. Journaliser chaque modification
  for (const change of verifiedChanges) {
    try {
      await base44.asServiceRole.entities.VenusCourseModificationLog.create({
        course_id,
        champ_modifie: change.champ,
        ancienne_valeur: String(change.ancienne_valeur ?? ''),
        nouvelle_valeur: String(change.nouvelle_valeur ?? ''),
        valeur_reelle_apres: String(change.valeur_reelle ?? ''),
        verifie: change.verifie,
        auteur,
        canal,
        resultat: change.resultat,
        motif: motif || '',
        erreur: change.verifie ? '' : 'Valeur non confirmée après relecture DB',
        statut_course: course.statut,
        date_modification: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error('[CourseModifier] Erreur journalisation:', e.message);
    }
  }

  // 11. Vérifier si le prix doit être recalculé (changement d'adresse)
  const addressChanged = autorises.some(c =>
    c === 'adresse_depart' || c === 'adresse_arrivee' ||
    c === 'gps_depart_lat' || c === 'gps_arrivee_lat'
  );

  let prixRecalcule = false;
  if (addressChanged && courseAfter?.gps_depart_lat && courseAfter?.gps_arrivee_lat) {
    try {
      await base44.asServiceRole.functions.invoke('calculPrixCourseExterne', { course_id });
      prixRecalcule = true;
      console.log(`[CourseModifier] 💰 Prix recalculé pour course ${course_id}`);
    } catch (e: any) {
      console.warn(`[CourseModifier] Prix non recalculé: ${e.message}`);
    }
  }

  // 12. Notifier le livreur si nécessaire
  let livreurNotifie = false;
  if (addressChanged && course.livreur_id && STATUTS_AVEC_LIVREUR.includes(course.statut)) {
    try {
      const champLabel = getChampLabel(autorises[0]);
      await base44.asServiceRole.entities.Notification.create({
        titre: '📍 Modification de course',
        message: `La course a été modifiée par le client.\n\n${champLabel}:\n  Avant: ${changes[0]?.ancienne_valeur || 'N/A'}\n  Après: ${changes[0]?.nouvelle_valeur || 'N/A'}\n\nVeuillez prendre en compte cette modification.`,
        type: 'course_modifiee',
        course_id,
        destinataire_email: '',
        lue: false,
      });
      livreurNotifie = true;
      console.log(`[CourseModifier] 📢 Livreur notifié pour course ${course_id}`);
    } catch (e: any) {
      console.warn(`[CourseModifier] Notification livreur échouée: ${e.message}`);
    }
  }

  const allVerified = verifiedChanges.every(c => c.verifie);
  const errors = verifiedChanges.filter(c => !c.verifie).map(c => ({
    champ: c.champ,
    error: `Valeur non confirmée après relecture DB (attendu: ${c.nouvelle_valeur}, trouvé: ${c.valeur_reelle})`,
  }));

  return {
    success: allVerified,
    course_before: course,
    course_after: courseAfter,
    changes: verifiedChanges,
    errors,
    prix_recalcule: prixRecalcule,
    livreur_notifie: livreurNotifie,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 5. GÉNÉRATION DU RÉCAPITULATIF
// ═══════════════════════════════════════════════════════════════════

export function genererRecapModification(champ: string, ancienneValeur: any, nouvelleValeur: any): string {
  const label = getChampLabel(champ);
  return `📋 Récapitulatif de la modification :\n\n${label} :\n  Avant : ${ancienneValeur || 'N/A'}\n  Après : ${nouvelleValeur || 'N/A'}\n\nConfirmez-vous cette modification ? (oui/non)`;
}