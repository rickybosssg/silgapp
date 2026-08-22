// ═══════════════════════════════════════════════════════════════════════════
// MODULE "COURSES À SAUVER" — Détection proactive des courses à risque
// ═══════════════════════════════════════════════════════════════════════════
// Ce module est un DÉTECTEUR/AGRÉGATEUR, pas un moteur de correction.
// Il ne modifie jamais une course, un livreur, ou un statut.
// Il crée uniquement des AdminInboxItem pour les courses critiques.
//
// Ne duplique PAS le watchdog ni les fonctions de correction existantes.
// Ne touche PAS au dispatch V2.
// ═══════════════════════════════════════════════════════════════════════════

import { haversineKm } from './geoUtils.ts';

// ── Types de risques ──────────────────────────────────────────────────────
export const RISK_TYPES = {
  SANS_LIVREUR: 'R1_SANS_LIVREUR',
  NON_PROGRESSION: 'R2_NON_PROGRESSION',
  RECUPERATION_LENTE: 'R3_RECUPERATION_LENTE',
  LIVRAISON_LENTE: 'R4_LIVRAISON_LENTE',
  ANNULATION_APRES_ACCEPTATION: 'R5_ANNULATION_APRES_ACCEPTATION',
  REDISPATCH: 'R6_REDISPATCH',
  CLIENT_INJOIGNABLE: 'R7_CLIENT_INJOIGNABLE',
  LIVREUR_HORS_LIGNE: 'R8_LIVREUR_HORS_LIGNE',
  GPS_EXPIRE: 'R9_GPS_EXPIRE',
  STATUT_BLOQUE: 'R10_STATUT_BLOQUE',
};

const RISK_SCORES: Record<string, number> = {
  [RISK_TYPES.SANS_LIVREUR]: 15,
  [RISK_TYPES.NON_PROGRESSION]: 15,
  [RISK_TYPES.RECUPERATION_LENTE]: 25,
  [RISK_TYPES.LIVRAISON_LENTE]: 25,
  [RISK_TYPES.ANNULATION_APRES_ACCEPTATION]: 10,
  [RISK_TYPES.REDISPATCH]: 20,
  [RISK_TYPES.CLIENT_INJOIGNABLE]: 10,
  [RISK_TYPES.LIVREUR_HORS_LIGNE]: 40,
  [RISK_TYPES.GPS_EXPIRE]: 30,
  [RISK_TYPES.STATUT_BLOQUE]: 10,
};

const RISK_LABELS: Record<string, string> = {
  [RISK_TYPES.SANS_LIVREUR]: 'Aucun livreur trouvé',
  [RISK_TYPES.NON_PROGRESSION]: 'Livreur ne progresse pas vers la récupération',
  [RISK_TYPES.RECUPERATION_LENTE]: 'Récupération trop lente',
  [RISK_TYPES.LIVRAISON_LENTE]: 'Livraison anormalement longue',
  [RISK_TYPES.ANNULATION_APRES_ACCEPTATION]: 'Annulation après acceptation',
  [RISK_TYPES.REDISPATCH]: 'Redispatch en cours',
  [RISK_TYPES.CLIENT_INJOIGNABLE]: 'Client potentiellement injoignable',
  [RISK_TYPES.LIVREUR_HORS_LIGNE]: 'Livreur hors ligne après acceptation',
  [RISK_TYPES.GPS_EXPIRE]: 'GPS livreur expiré',
  [RISK_TYPES.STATUT_BLOQUE]: 'Course bloquée dans un statut',
};

// ── Statuts actifs (livreur engagé dans la livraison) ──
const STATUTS_ACTIFS = [
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere',
  'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee',
];

// Statuts où le livreur est assigné mais n'a pas encore récupéré le colis
const STATUTS_PRE_RECUPE = [
  'livreur_en_route', 'client_contacte', 'en_route_expediteur', 'arrive_prise_en_charge',
];

// Statuts où le colis est récupéré et en cours de livraison
const STATUTS_POST_RECUPE = [
  'colis_recupere', 'pris_en_charge', 'en_livraison', 'arrivee',
];

export interface RiskItem {
  type: string;
  label: string;
  description: string;
  depuis_min: number;
}

export interface CourseRisk {
  course_id: string;
  country_code: string;
  client_nom: string;
  client_telephone: string;
  livreur_id: string;
  livreur_nom: string;
  livreur_telephone: string;
  statut: string;
  dispatch_status: string;
  type_course: string;
  source: string;
  created_date: string;
  updated_date: string;
  adresse_depart: string;
  risques: RiskItem[];
  risk_score: number;
  niveau: string;
  action_recommandee: string;
}

/**
 * Charge les seuils configurables depuis AppConfig.
 * Le seuil GPS vient de Country.gps_expire_seuil_min (pas de duplication).
 */
export async function loadRiskConfig(base44: any) {
  const configs = await base44.asServiceRole.entities.AppConfig.filter({}).catch(() => []);
  const get = (key: string, def: number) => {
    const c = configs.find((x: any) => x.cle === key);
    return c ? (parseInt(c.valeur, 10) || def) : def;
  };
  return {
    sansLivreurMin: get('COURSE_RISQUE_SANS_LIVREUR_MIN', 5),
    nonProgressionMin: get('COURSE_RISQUE_NON_PROGRESSION_MIN', 15),
    recuperationMin: get('COURSE_RISQUE_RECUPERATION_MIN', 30),
    livraisonMin: get('COURSE_RISQUE_LIVRAISON_MIN', 90),
    bloqueMin: get('COURSE_RISQUE_BLOQUE_MIN', 60),
    alertDedupMin: get('COURSE_RISQUE_ALERT_DEDUP_MIN', 30),
  };
}

/**
 * Détecte les courses à risque en temps réel.
 * Pure lecture — ne modifie aucune donnée.
 */
export async function computeCoursesARisque(base44: any): Promise<{ courses: CourseRisk[]; total: number }> {
  const now = Date.now();
  const config = await loadRiskConfig(base44);

  // ── Charger les courses actives (non terminales) ──
  const courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: { $nin: ['livree', 'annulee'] } },
    '-created_date', 300
  ).catch(() => []);

  if (!courses || courses.length === 0) {
    return { courses: [], total: 0 };
  }

  // ── Charger les livreurs liés ──
  const livreurIds = [...new Set(courses.filter((c: any) => c.livreur_id).map((c: any) => c.livreur_id))];
  const livreurMap: Record<string, any> = {};
  for (const id of livreurIds) {
    try {
      const l = await base44.asServiceRole.entities.Livreur.get(id);
      livreurMap[id] = l;
    } catch {}
  }

  // ── Charger les pays (pour gps_expire_seuil_min) ──
  const countryCodes = [...new Set(courses.map((c: any) => c.country_code).filter(Boolean))];
  const countryMap: Record<string, any> = {};
  for (const code of countryCodes) {
    try {
      const cs = await base44.asServiceRole.entities.Country.filter({ code });
      if (cs[0]) countryMap[code] = cs[0];
    } catch {}
  }

  // ── Charger les annulations récentes (R5) ──
  const annulations = await base44.asServiceRole.entities.AnnulationLivreur.filter(
    {}, '-date_annulation', 50
  ).catch(() => []);
  const annulationCourseIds = new Set((annulations || []).map((a: any) => a.course_id));

  // ── Charger les incidents Venus client injoignable (R7) ──
  const incidents = await base44.asServiceRole.entities.VenusIncident.filter(
    { type_incident: 'client_injoignable', statut: { $ne: 'ferme' } },
    '-created_date', 50
  ).catch(() => []);
  const incidentCourseIds = new Set((incidents || []).map((i: any) => i.course_id));

  const results: CourseRisk[] = [];

  for (const course of courses) {
    const risques: RiskItem[] = [];
    const livreur = course.livreur_id ? livreurMap[course.livreur_id] : null;
    const country = course.country_code ? countryMap[course.country_code] : null;

    const ageCreatedMin = Math.round((now - new Date(course.created_date).getTime()) / 60000);
    const ageUpdatedMin = Math.round((now - new Date(course.updated_date).getTime()) / 60000);
    const ageAcceptationMin = course.heure_acceptation ? Math.round((now - new Date(course.heure_acceptation).getTime()) / 60000) : 0;
    const ageRecuperationMin = course.heure_recuperation ? Math.round((now - new Date(course.heure_recuperation).getTime()) / 60000) : 0;

    // R1: Course sans livreur après X min
    if (course.statut === 'recherche_livreur' && !course.livreur_id) {
      if (ageCreatedMin >= config.sansLivreurMin) {
        risques.push({
          type: RISK_TYPES.SANS_LIVREUR,
          label: RISK_LABELS[RISK_TYPES.SANS_LIVREUR],
          description: `Aucun livreur trouvé depuis ${ageCreatedMin} min`,
          depuis_min: ageCreatedMin,
        });
      }
    }

    // R2: Livreur ne progresse pas vers la récupération
    // ⚠️ Pas d'historique GPS — on ne peut mesurer que la distance actuelle au point de récupération
    if (livreur && STATUTS_PRE_RECUPE.includes(course.statut) && course.heure_acceptation && !course.heure_recuperation) {
      const gpsAgeMin = livreur.derniere_position_date ? Math.round((now - new Date(livreur.derniere_position_date).getTime()) / 60000) : 999;
      const gpsExpireMin = country?.gps_expire_seuil_min || 30;
      const isGpsRecent = gpsAgeMin <= gpsExpireMin;

      if (isGpsRecent && livreur.latitude && livreur.longitude && course.gps_depart_lat && course.gps_depart_lng) {
        const distToPickup = haversineKm(livreur.latitude, livreur.longitude, course.gps_depart_lat, course.gps_depart_lng);
        if (ageAcceptationMin >= config.nonProgressionMin && distToPickup > 0.5) {
          risques.push({
            type: RISK_TYPES.NON_PROGRESSION,
            label: RISK_LABELS[RISK_TYPES.NON_PROGRESSION],
            description: `Livreur à ${distToPickup.toFixed(1)} km du point de récupération depuis ${ageAcceptationMin} min`,
            depuis_min: ageAcceptationMin,
          });
        }
      }
    }

    // R3: Récupération trop lente
    if (STATUTS_PRE_RECUPE.includes(course.statut) && course.heure_acceptation && !course.heure_recuperation) {
      if (ageAcceptationMin >= config.recuperationMin) {
        risques.push({
          type: RISK_TYPES.RECUPERATION_LENTE,
          label: RISK_LABELS[RISK_TYPES.RECUPERATION_LENTE],
          description: `Colis non récupéré depuis ${ageAcceptationMin} min (seuil: ${config.recuperationMin} min)`,
          depuis_min: ageAcceptationMin,
        });
      }
    }

    // R4: Livraison anormalement longue
    if (STATUTS_POST_RECUPE.includes(course.statut) && course.heure_recuperation && !course.heure_livraison) {
      if (ageRecuperationMin >= config.livraisonMin) {
        risques.push({
          type: RISK_TYPES.LIVRAISON_LENTE,
          label: RISK_LABELS[RISK_TYPES.LIVRAISON_LENTE],
          description: `Livraison en cours depuis ${ageRecuperationMin} min (seuil: ${config.livraisonMin} min)`,
          depuis_min: ageRecuperationMin,
        });
      }
    }

    // R5: Annulation après acceptation (historique)
    if (annulationCourseIds.has(course.id)) {
      risques.push({
        type: RISK_TYPES.ANNULATION_APRES_ACCEPTATION,
        label: RISK_LABELS[RISK_TYPES.ANNULATION_APRES_ACCEPTATION],
        description: 'Un livreur a annulé cette course après acceptation',
        depuis_min: ageUpdatedMin,
      });
    }

    // R6: Redispatch
    if (course.dispatch_status === 'redispatch' || (course.dispatch_cycle_count || 0) >= 2) {
      risques.push({
        type: RISK_TYPES.REDISPATCH,
        label: RISK_LABELS[RISK_TYPES.REDISPATCH],
        description: `Redispatch en cours (cycle ${course.dispatch_cycle_count || 0})`,
        depuis_min: ageUpdatedMin,
      });
    }

    // R7: Client potentiellement injoignable
    // Uniquement basé sur des signaux réels : échec WhatsApp ou incident Venus
    if (course.whatsapp_expediteur_statut === 'echec' || course.whatsapp_destinataire_statut === 'echec') {
      risques.push({
        type: RISK_TYPES.CLIENT_INJOIGNABLE,
        label: RISK_LABELS[RISK_TYPES.CLIENT_INJOIGNABLE],
        description: 'Échec d\'envoi WhatsApp au client/destinataire',
        depuis_min: ageUpdatedMin,
      });
    }
    if (incidentCourseIds.has(course.id)) {
      risques.push({
        type: RISK_TYPES.CLIENT_INJOIGNABLE,
        label: RISK_LABELS[RISK_TYPES.CLIENT_INJOIGNABLE],
        description: 'Incident Venus: client injoignable détecté',
        depuis_min: ageUpdatedMin,
      });
    }

    // R8: Livreur hors ligne après acceptation
    if (livreur && course.livreur_id && livreur.statut === 'hors_ligne' && STATUTS_ACTIFS.includes(course.statut)) {
      risques.push({
        type: RISK_TYPES.LIVREUR_HORS_LIGNE,
        label: RISK_LABELS[RISK_TYPES.LIVREUR_HORS_LIGNE],
        description: `Livreur hors ligne alors que la course est active (${course.statut})`,
        depuis_min: ageUpdatedMin,
      });
    }

    // R9: GPS trop ancien (seuil depuis Country, pas de duplication)
    if (livreur && course.livreur_id && STATUTS_ACTIFS.includes(course.statut)) {
      const gpsAgeMin = livreur.derniere_position_date ? Math.round((now - new Date(livreur.derniere_position_date).getTime()) / 60000) : 999;
      const gpsExpireMin = country?.gps_expire_seuil_min || 30;
      if (gpsAgeMin > gpsExpireMin) {
        risques.push({
          type: RISK_TYPES.GPS_EXPIRE,
          label: RISK_LABELS[RISK_TYPES.GPS_EXPIRE],
          description: `GPS livreur vieux de ${gpsAgeMin} min (seuil pays: ${gpsExpireMin} min)`,
          depuis_min: gpsAgeMin,
        });
      }
    }

    // R10: Course bloquée dans un statut trop longtemps
    if (STATUTS_ACTIFS.includes(course.statut) && ageUpdatedMin >= config.bloqueMin) {
      risques.push({
        type: RISK_TYPES.STATUT_BLOQUE,
        label: RISK_LABELS[RISK_TYPES.STATUT_BLOQUE],
        description: `Statut "${course.statut}" inchangé depuis ${ageUpdatedMin} min`,
        depuis_min: ageUpdatedMin,
      });
    }

    if (risques.length === 0) continue;

    // ── Calcul du risk_score ──
    const riskScore = risques.reduce((sum, r) => sum + (RISK_SCORES[r.type] || 0), 0);
    const niveau = riskScore >= 40 ? 'critique' : 'a_surveiller';

    // ── Action recommandée ──
    let actionRecommandee = 'Ouvrir la course';
    if (risques.some(r => r.type === RISK_TYPES.LIVREUR_HORS_LIGNE)) {
      actionRecommandee = 'Contacter le livreur';
    } else if (risques.some(r => r.type === RISK_TYPES.CLIENT_INJOIGNABLE)) {
      actionRecommandee = 'Contacter le client';
    } else if (risques.some(r => r.type === RISK_TYPES.SANS_LIVREUR)) {
      actionRecommandee = 'Réassigner un livreur';
    } else if (risques.some(r => r.type === RISK_TYPES.REDISPATCH)) {
      actionRecommandee = 'Vérifier le dispatch';
    } else if (risques.some(r => r.type === RISK_TYPES.GPS_EXPIRE)) {
      actionRecommandee = 'Vérifier le livreur';
    }

    results.push({
      course_id: course.id,
      country_code: course.country_code,
      client_nom: course.client_nom,
      client_telephone: course.client_telephone,
      livreur_id: course.livreur_id,
      livreur_nom: course.livreur_nom,
      livreur_telephone: course.livreur_telephone,
      statut: course.statut,
      dispatch_status: course.dispatch_status,
      type_course: course.type_course,
      source: course.source,
      created_date: course.created_date,
      updated_date: course.updated_date,
      adresse_depart: course.adresse_depart,
      risques,
      risk_score: riskScore,
      niveau,
      action_recommandee: actionRecommandee,
    });
  }

  // Trier par risk_score décroissant
  results.sort((a, b) => b.risk_score - a.risk_score);

  return { courses: results, total: results.length };
}

/**
 * Synchronise les AdminInboxItem :
 * - Crée des alertes pour les courses critiques (avec déduplication)
 * - Archive les alertes dont le risque a disparu
 */
export async function syncAdminAlerts(base44: any, courses: CourseRisk[], config: any) {
  // ── Charger les AdminInboxItem existants pour courses à risque ──
  const existingItems = await base44.asServiceRole.entities.AdminInboxItem.filter(
    {}, '-created_date', 500
  ).catch(() => []);

  const courseRiskItems = (existingItems || []).filter((item: any) =>
    item.deduplication_key && item.deduplication_key.startsWith('COURSE_RISQUE_')
  );

  // ── Archive les alertes dont le risque a disparu ──
  for (const item of courseRiskItems) {
    if (item.status === 'archived') continue;
    if (!item.course_id) continue;

    const course = courses.find(c => c.course_id === item.course_id);
    if (!course || course.niveau !== 'critique') {
      // La course n'est plus critique — archiver l'alerte
      await base44.asServiceRole.entities.AdminInboxItem.update(item.id, {
        status: 'archived',
      }).catch(() => {});
    }
  }

  // ── Crée des alertes pour les nouvelles courses critiques ──
  for (const course of courses) {
    if (course.niveau !== 'critique') continue;
    for (const risque of course.risques) {
      const dedupKey = `COURSE_RISQUE_${course.course_id}_${risque.type}`;
      const existing = courseRiskItems.find((item: any) => item.deduplication_key === dedupKey);
      if (existing) continue;

      const priority = course.risk_score >= 60 ? 'P0' : 'P1';
      const title = `🚨 Course à sauver: ${course.client_nom || 'Client'}`;
      const body = `${risque.label} — ${risque.description}. Score: ${course.risk_score}. Action: ${course.action_recommandee}`;

      await base44.asServiceRole.entities.AdminInboxItem.create({
        type: 'course',
        priority,
        title,
        body,
        source_entity: 'CourseExterne',
        source_id: course.course_id,
        course_id: course.course_id,
        livreur_id: course.livreur_id || null,
        country_code: course.country_code || 'ALL',
        action_url: '/admin/courses-a-sauver',
        status: 'unread',
        deduplication_key: dedupKey,
      }).catch(() => {});
    }
  }
}

/**
 * Calcule les statistiques "sauvées / échecs" à partir des AdminInboxItem du jour.
 * - Sauvée = course à risque qui s'est terminée en "livree"
 * - Échec = course à risque qui s'est terminée en "annulee"
 */
export async function computeRiskStats(base44: any): Promise<{ sauvees: number; echecs: number; detectees: number }> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Charger les AdminInboxItem créés aujourd'hui liés aux courses à risque
  const items = await base44.asServiceRole.entities.AdminInboxItem.filter(
    {}, '-created_date', 500
  ).catch(() => []);

  const todayItems = (items || []).filter((item: any) =>
    item.deduplication_key &&
    item.deduplication_key.startsWith('COURSE_RISQUE_') &&
    new Date(item.created_date) >= new Date(startOfDay)
  );

  const uniqueCourseIds = [...new Set(todayItems.map((i: any) => i.course_id).filter(Boolean))];
  if (uniqueCourseIds.length === 0) {
    return { sauvees: 0, echecs: 0, detectees: 0 };
  }

  let sauvees = 0;
  let echecs = 0;
  for (const courseId of uniqueCourseIds) {
    try {
      const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
      if (course.statut === 'livree') sauvees++;
      else if (course.statut === 'annulee') echecs++;
    } catch {}
  }

  return { sauvees, echecs, detectees: uniqueCourseIds.length };
}