// ═══════════════════════════════════════════════════════════════════════════
// GROWTH EVENT NORMALIZER — Couche d'abstraction pour les événements Growth
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : Normaliser les données métier (CourseExterne, AppInstall, etc.) en
// événements Growth génériques (Activation, Retention, Revenue).
//
// Cette couche permet de réutiliser le moteur Autopilote sur d'autres
// applications (DUO, etc.) en remplaçant uniquement ce normalizer.
//
// Mapping SILGAPP :
//   AcquisitionSource = AppInstall (meta_campaign_id, utm)
//   User             = ClientExterne
//   ActivationEvent  = 1ère course livrée (CourseExterne.statut=livree, 1ère fois)
//   RetentionEvent   = 2ème course livrée
//   RevenueEvent     = commission_silga sur course livrée
//
// NE MODIFIE PAS : Dispatch V2, finance livreur, tarification, paiements.
// ═══════════════════════════════════════════════════════════════════════════

export interface GrowthActivationEvent {
  client_key: string;
  source: 'meta_ads' | 'reactivation' | 'parrainage' | 'organique';
  source_id: string | null;
  timestamp: string;
  revenue_fcfa: number;
  commission_fcfa: number;
}

export interface GrowthRetentionEvent {
  client_key: string;
  timestamp: string;
  revenue_fcfa: number;
  commission_fcfa: number;
}

// ── Construire une clé client hybride (téléphone + email) ──
export function buildClientKey(phone: string | null | undefined, email: string | null | undefined): string {
  const p = (phone || '').trim();
  const e = (email || '').trim().toLowerCase();
  return p ? `phone:${p}` : (e ? `email:${e}` : '');
}

// ── Calculer les 1ères et 2èmes courses à partir de toutes les courses livrées ──
//
// Une "1ère course" pour la période = client avec EXACTEMENT 1 course livrée
// au total, dont la livraison est dans la période.
//
// Une "2ème course" pour la période = client avec EXACTEMENT 2 courses livrées
// au total, dont la 2ème livraison est dans la période.
export function computeFirstAndSecondCourses(
  allDeliveredCourses: any[],
  periodStart: number,
  periodEnd: number
): { firstCourses: any[]; secondCourses: any[] } {
  const byClient = new Map<string, any[]>();
  for (const c of allDeliveredCourses) {
    const key = buildClientKey(c.client_phone_normalized || c.client_telephone, c.client_user_email);
    if (!key) continue;
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key)!.push(c);
  }

  const firstCourses: any[] = [];
  const secondCourses: any[] = [];

  for (const courses of byClient.values()) {
    // Trier par heure_livraison (ancien d'abord)
    courses.sort((a, b) => {
      const da = a.heure_livraison ? new Date(a.heure_livraison).getTime() : 0;
      const db = b.heure_livraison ? new Date(b.heure_livraison).getTime() : 0;
      return da - db;
    });

    // 1ère course historique du client (index 0 dans le tri chronologique)
    // Comptée même si le client a 3+ courses au total
    if (courses.length >= 1) {
      const firstTs = courses[0].heure_livraison ? new Date(courses[0].heure_livraison).getTime() : 0;
      if (firstTs >= periodStart && firstTs <= periodEnd) {
        firstCourses.push(courses[0]);
      }
    }

    // 2ème course historique du client (index 1 dans le tri chronologique)
    // Comptée même si le client a 3+ courses au total
    if (courses.length >= 2) {
      const secondTs = courses[1].heure_livraison ? new Date(courses[1].heure_livraison).getTime() : 0;
      if (secondTs >= periodStart && secondTs <= periodEnd) {
        secondCourses.push(courses[1]);
      }
    }
  }

  return { firstCourses, secondCourses };
}

// ── Attribuer une source à un client ──
//
// Priorité : meta_ads > reactivation > parrainage > organique
export function attributeClientSource(
  clientKey: string,
  clientEmail: string | null,
  installsByEmail: Map<string, any>,
  convertedScenarioClientKeys: Set<string>,
  clientsWithPromoCode: Set<string>
): { source: string; source_id: string | null } {
  // 1. Meta Ads (via AppInstall → meta_campaign_id)
  const email = (clientEmail || '').trim().toLowerCase();
  if (email && installsByEmail.has(email)) {
    const install = installsByEmail.get(email);
    if (install.meta_campaign_id) {
      return { source: 'meta_ads', source_id: install.meta_campaign_id };
    }
  }

  // 2. Réactivation (via ReactivationScenario converted)
  if (convertedScenarioClientKeys.has(clientKey)) {
    return { source: 'reactivation', source_id: null };
  }

  // 3. Parrainage (via code_promo_utilise)
  if (clientsWithPromoCode.has(clientKey)) {
    return { source: 'parrainage', source_id: null };
  }

  return { source: 'organique', source_id: null };
}

// ── Calculer le mois courant (début et fin) ──
export function getCurrentMonthRange(): { start: number; end: number; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = now.getTime();
  const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { start, end, label };
}