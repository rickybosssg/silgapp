// ═══════════════════════════════════════════════════════════════════════════
// hook useGrowthData — charge toutes les données du dashboard Growth
// RÉUTILISE les entités existantes : ClientExterne, CourseExterne, HabitReminder,
// ReactivationScenario, ReactivationCampaign, AppInstall, NotificationToken,
// PrimePromo, AppConfig, CrmProspection.
// NE CRÉE PAS de nouvelle architecture — lit uniquement les données existantes.
// ═══════════════════════════════════════════════════════════════════════════

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// ── Helper : filtre date ISO depuis N jours ──
export function dateNDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ── Helper : paginer toutes les CourseExterne livrées (anti-troncature) ──
// Récupère l'intégralité des courses livrées par batches de 500, sans limite fixe.
// Fonctionne avec des milliers ou dizaines de milliers de courses.
async function fetchAllDeliveredCourses() {
  const all = [];
  let skip = 0;
  const batchSize = 500;
  while (true) {
    const batch = await base44.entities.CourseExterne.filter(
      { statut: "livree" },
      "-heure_livraison", batchSize, skip
    );
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return all;
}

// ── Helper : parse AppConfig list → map ──
function parseAppConfig(configs) {
  const map = {};
  for (const c of configs || []) {
    if (c.cle) map[c.cle] = c.valeur;
  }
  return map;
}

// ── Vue d'ensemble : KPIs principaux ──
async function fetchOverview(periodDays) {
  const since = dateNDaysAgo(periodDays);
  const sinceDate = new Date(since);

  // ── Nouveaux clients (ClientExterne créés dans la période) ──
  const clients = await base44.entities.ClientExterne.list("-created_date", 500);
  const newClients = (clients || []).filter(c =>
    c.created_date && new Date(c.created_date) >= sinceDate
  );

  // ── Courses livrées (pagination complète — anti-troncature) ──
  const deliveredCourses = await fetchAllDeliveredCourses();
  const recentDelivered = (deliveredCourses || []).filter(c =>
    c.heure_livraison && new Date(c.heure_livraison) >= sinceDate
  );

  // ── Grouper les courses livrées par téléphone (triées par heure_livraison) ──
  // Utilisé pour les KPI cohortés : 1ère / 2ème / 3ème course à vie.
  const coursesByPhone = {};
  for (const c of deliveredCourses || []) {
    const phone = c.client_phone_normalized || c.client_telephone;
    if (!phone) continue;
    if (!coursesByPhone[phone]) coursesByPhone[phone] = [];
    coursesByPhone[phone].push(c);
  }
  for (const phone of Object.keys(coursesByPhone)) {
    coursesByPhone[phone].sort((a, b) =>
      new Date(a.heure_livraison || 0).getTime() - new Date(b.heure_livraison || 0).getTime()
    );
  }

  // ── Premières courses : clients dont la 1ère course à vie est dans la période ──
  const firstCourses = Object.values(coursesByPhone)
    .filter(cs => cs.length >= 1)
    .map(cs => cs[0])
    .filter(c => c.heure_livraison && new Date(c.heure_livraison) >= sinceDate);

  // ── Deuxièmes courses : clients dont la 2ème course à vie est dans la période ──
  // CORRECTION : un client ne compte qu'une fois, pour sa 2ème course à vie.
  // Ancienne définition (surévaluée) : toutes les courses de clients ayant ≥2 courses.
  const secondCourses = Object.values(coursesByPhone)
    .filter(cs => cs.length >= 2)
    .map(cs => cs[1])
    .filter(c => c.heure_livraison && new Date(c.heure_livraison) >= sinceDate);

  // ── Clients réguliers : clients dont la 3ème course à vie est dans la période ──
  // CORRECTION : cohorté par période (anciennement lifetime total).
  const regularClients = Object.values(coursesByPhone)
    .filter(cs => cs.length >= 3)
    .map(cs => cs[2])
    .filter(c => c.heure_livraison && new Date(c.heure_livraison) >= sinceDate);

  // ── Clients réactivés (ReactivationScenario converted dans la période) ──
  const reactivationScenarios = await base44.entities.ReactivationScenario.list("-converted_at", 500);
  const convertedScenarios = (reactivationScenarios || []).filter(s =>
    s.status === "converted" && s.converted_at && new Date(s.converted_at) >= sinceDate
  );

  // ── Push envoyés : HabitReminder sent + ReactivationScenario pushes dans la période ──
  // CORRECTION : périmètre cohérent — tous les moteurs de push inclus.
  // Anciennement : HabitReminder seul, mais conversions incluaient ReactivationScenario.
  const habitReminders = await base44.entities.HabitReminder.filter(
    { status: "sent" },
    "-sent_at", 500
  );
  const recentHabitPushes = (habitReminders || []).filter(r =>
    r.sent_at && new Date(r.sent_at) >= sinceDate
  );

  // ReactivationScenario : chaque push J0/J+2/J+5 envoyé dans la période compte
  let reactivationPushCount = 0;
  for (const s of reactivationScenarios || []) {
    if (s.j0_sent_at && new Date(s.j0_sent_at) >= sinceDate) reactivationPushCount++;
    if (s.j2_sent_at && new Date(s.j2_sent_at) >= sinceDate) reactivationPushCount++;
    if (s.j5_sent_at && new Date(s.j5_sent_at) >= sinceDate) reactivationPushCount++;
  }
  const pushesSent = recentHabitPushes.length + reactivationPushCount;

  // ── Conversions Growth : vérifier que la course attribuée est réellement livrée ──
  // CORRECTION : une course annulée/inexistante ne compte PAS comme conversion.
  const convertedReminders = (habitReminders || []).filter(r =>
    r.status === "converted" && r.converted_at && new Date(r.converted_at) >= sinceDate
  );

  // Collecter les course_ids à vérifier
  const conversionCourseIds = new Set();
  for (const s of convertedScenarios) { if (s.course_id) conversionCourseIds.add(s.course_id); }
  for (const r of convertedReminders) { if (r.course_id) conversionCourseIds.add(r.course_id); }

  // Fetch les courses réelles et vérifier statut === "livree"
  const courseCache = new Map();
  for (const courseId of conversionCourseIds) {
    try {
      const course = await base44.entities.CourseExterne.get(courseId);
      courseCache.set(courseId, course);
    } catch {
      courseCache.set(courseId, null);
    }
  }

  // Filtrer les conversions dont la course est réellement livrée
  const verifiedScenarios = convertedScenarios.filter(s => {
    const course = courseCache.get(s.course_id);
    return course && course.statut === "livree";
  });
  const verifiedReminders = convertedReminders.filter(r => {
    const course = courseCache.get(r.course_id);
    return course && course.statut === "livree";
  });

  // ── Courses générées par automatisations (conversions vérifiées) ──
  const automationCourses = verifiedScenarios.length + verifiedReminders.length;

  // ── CA généré : prix_final réel de la course livrée (plus le revenue stocké) ──
  // CORRECTION : lire le prix réel depuis CourseExterne, pas depuis ReactivationScenario.revenue.
  const automationRevenue = verifiedScenarios.reduce((sum, s) => {
    const course = courseCache.get(s.course_id);
    return sum + (course?.prix_final || 0);
  }, 0) + verifiedReminders.reduce((sum, r) => {
    const course = courseCache.get(r.course_id);
    return sum + (course?.prix_final || 0);
  }, 0);

  // ── Commission SILGAPP : lire la commission réelle depuis la course livrée ──
  // CORRECTION : ne pas inventer 0 F ; afficher null ("Non disponible") si non fiable.
  const allVerified = [...verifiedScenarios, ...verifiedReminders];
  let automationCommission;
  if (allVerified.length === 0) {
    automationCommission = null; // "Non disponible"
  } else {
    const allHaveCommission = allVerified.every(item => {
      const course = courseCache.get(item.course_id);
      return course?.commission_silga != null;
    });
    automationCommission = allHaveCommission
      ? allVerified.reduce((sum, item) => sum + (courseCache.get(item.course_id)?.commission_silga || 0), 0)
      : null; // "Non disponible"
  }

  return {
    periodDays,
    newClients: newClients.length,
    totalClients: (clients || []).length,
    firstCourses: firstCourses.length,
    secondCourses: secondCourses.length,
    reactivatedClients: verifiedScenarios.length,
    regularClients: regularClients.length,
    pushesSent,
    pushConversions: verifiedScenarios.length + verifiedReminders.length,
    pushConversionRate: pushesSent > 0
      ? ((verifiedScenarios.length + verifiedReminders.length) / pushesSent * 100).toFixed(1)
      : "0.0",
    automationCourses,
    automationRevenue,
    automationCommission,
    totalDeliveredCourses: recentDelivered.length,
  };
}

// ── État des automatisations ──
async function fetchAutomationStatus() {
  const configs = await base44.entities.AppConfig.list();
  const cfg = parseAppConfig(configs);

  // ── Dernière exécution des moteurs ──
  const habitReminders = await base44.entities.HabitReminder.list("-created_date", 5);
  const reactivationScenarios = await base44.entities.ReactivationScenario.list("-created_date", 5);
  const primePromos = await base44.entities.PrimePromo.list("-created_date", 5);

  return {
    reactivation: {
      status: cfg["REACTIVATION_ENGINE_ENABLED"] === "true" ? "LIVE" : "OFF",
      dryRun: cfg["REACTIVATION_ENGINE_DRY_RUN"] !== "false",
      lastRun: reactivationScenarios?.[0]?.created_date || null,
      analyzed: (reactivationScenarios || []).length,
      sent: (reactivationScenarios || []).filter(s => s.j0_sent_at).length,
      converted: (reactivationScenarios || []).filter(s => s.status === "converted").length,
    },
    firstCourseRelance: {
      status: cfg["FIRST_COURSE_RELANCE_SEND_ENABLED"] === "true" ? "LIVE" : "DRY-RUN",
      analysisEnabled: cfg["FIRST_COURSE_RELANCE_ANALYSIS_ENABLED"] !== "false",
      lastRun: habitReminders?.[0]?.created_date || null,
    },
    habitReminders: {
      status: cfg["HABIT_REMINDER_ENABLED"] === "true"
        ? (cfg["HABIT_REMINDER_DRY_RUN"] !== "false" ? "DRY-RUN" : "LIVE")
        : "OFF",
      lastRun: habitReminders?.[0]?.created_date || null,
      sent: (habitReminders || []).filter(r => r.status === "sent").length,
      converted: (habitReminders || []).filter(r => r.status === "converted").length,
    },
    primePromo: {
      status: cfg["PRIME_PROMO_AUTO_ENABLED"] === "true" ? "ON" : "OFF",
      lastRun: primePromos?.[0]?.created_date || null,
      count: (primePromos || []).length,
    },
    advertising: {
      status: cfg["ADVERTISING_AUTO_ENABLED"] === "true" ? "ON" : "OFF",
      budgetPerDay: parseInt(cfg["ADVERTISING_BUDGET_PER_DAY"] || "1000"),
      metaConnected: cfg["META_ADS_LATEST_INSIGHTS"] ? true : false,
    },
  };
}

// ── Budget publicité ──
// IMPORTANT : PubliciteVue n'est PAS une dépense réelle.
// Tant qu'aucune plateforme publicitaire payante n'est connectée,
// la dépense réelle = 0 FCFA.
async function fetchAdBudget() {
  const configs = await base44.entities.AppConfig.list();
  const cfg = parseAppConfig(configs);
  const budgetPerDay = parseInt(cfg["ADVERTISING_BUDGET_PER_DAY"] || "1000");
  const autoEnabled = cfg["ADVERTISING_AUTO_ENABLED"] === "true";

  // ── Dépenses réelles depuis GrowthSpend (publicité) ──
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let adSpends = [];
  try {
    adSpends = await base44.entities.GrowthSpend.filter(
      { moteur: "publicite", statut: ["engagee", "payee"] },
      "-date_depense", 500
    );
  } catch {
    // GrowthSpend peut être vide au début
  }

  const spentToday = (adSpends || [])
    .filter(s => s.date_depense && new Date(s.date_depense) >= todayStart)
    .reduce((sum, s) => sum + (s.montant || 0), 0);

  const spent7Days = (adSpends || [])
    .filter(s => s.date_depense && new Date(s.date_depense) >= dateNDaysAgo(7))
    .reduce((sum, s) => sum + (s.montant || 0), 0);

  const spent30Days = (adSpends || [])
    .filter(s => s.date_depense && new Date(s.date_depense) >= dateNDaysAgo(30))
    .reduce((sum, s) => sum + (s.montant || 0), 0);

  // ── Métriques Meta Ads (si connecté) ──
  let metaMetrics = null;
  try {
    const metaConfigs = await base44.entities.AppConfig.filter({ cle: 'META_ADS_LATEST_INSIGHTS' });
    if (metaConfigs?.[0]?.valeur) {
      metaMetrics = JSON.parse(metaConfigs[0].valeur);
    }
  } catch {}

  return {
    budgetPerDay,
    autoEnabled,
    spentToday,
    remainingToday: Math.max(0, budgetPerDay - spentToday),
    spent7Days,
    spent30Days,
    hasRealAdPlatform: !!metaMetrics,
    metaMetrics,
  };
}

// ── Budget primes ──
// Seules les primes réellement validées (statut=validee) sont comptées comme dépense réelle.
// Les primes pending, créées ou simulées ne sont PAS des dépenses.
async function fetchPrimeBudget() {
  const configs = await base44.entities.AppConfig.list();
  const cfg = parseAppConfig(configs);
  const budgetPerDay = parseInt(cfg["PRIME_PROMO_BUDGET_PER_DAY"] || "1000");
  const autoEnabled = cfg["PRIME_PROMO_AUTO_ENABLED"] === "true";

  const primes = await base44.entities.PrimePromo.list("-validee_at", 500);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // ── Uniquement les primes validées (statut=validee) ──
  const validatedPrimes = (primes || []).filter(p => p.statut === "validee");
  const primesToday = validatedPrimes.filter(p =>
    p.validee_at && new Date(p.validee_at) >= todayStart
  );

  const spent7Days = validatedPrimes
    .filter(p => p.validee_at && new Date(p.validee_at) >= dateNDaysAgo(7))
    .reduce((sum, p) => sum + (p.prime_proprietaire || 0), 0);

  const spent30Days = validatedPrimes
    .filter(p => p.validee_at && new Date(p.validee_at) >= dateNDaysAgo(30))
    .reduce((sum, p) => sum + (p.prime_proprietaire || 0), 0);

  return {
    budgetPerDay,
    autoEnabled,
    spentToday: primesToday.reduce((sum, p) => sum + (p.prime_proprietaire || 0), 0),
    primesCountToday: primesToday.length,
    coursesAttribuees: validatedPrimes.filter(p => p.course_id).length,
    totalPrimes: validatedPrimes.length,
    spent7Days,
    spent30Days,
  };
}

// ── Tunnel de conversion (cohorte période) ──
// CORRECTION : chaque étape est un sous-ensemble de la précédente, filtré par période.
// Anciennement : mélange incohérent lifetime + période + populations indépendantes.
async function fetchConversionTunnel(periodDays = 7) {
  const since = dateNDaysAgo(periodDays);
  const sinceDate = new Date(since);

  // ── Base cohorte : courses livrées (pagination complète — anti-troncature) ──
  const deliveredCourses = await fetchAllDeliveredCourses();

  // Grouper par téléphone, trier par heure_livraison
  const coursesByPhone = {};
  for (const c of deliveredCourses || []) {
    const phone = c.client_phone_normalized || c.client_telephone;
    if (!phone) continue;
    if (!coursesByPhone[phone]) coursesByPhone[phone] = [];
    coursesByPhone[phone].push(c);
  }
  for (const phone of Object.keys(coursesByPhone)) {
    coursesByPhone[phone].sort((a, b) =>
      new Date(a.heure_livraison || 0).getTime() - new Date(b.heure_livraison || 0).getTime()
    );
  }

  // ── Étapes du tunnel (cohorte période) ──
  const firstCourses = Object.values(coursesByPhone)
    .filter(cs => cs.length >= 1)
    .map(cs => cs[0])
    .filter(c => c.heure_livraison && new Date(c.heure_livraison) >= sinceDate);

  const secondCourses = Object.values(coursesByPhone)
    .filter(cs => cs.length >= 2)
    .map(cs => cs[1])
    .filter(c => c.heure_livraison && new Date(c.heure_livraison) >= sinceDate);

  const regularClients = Object.values(coursesByPhone)
    .filter(cs => cs.length >= 3)
    .map(cs => cs[2])
    .filter(c => c.heure_livraison && new Date(c.heure_livraison) >= sinceDate);

  const periodDelivered = (deliveredCourses || []).filter(c =>
    c.heure_livraison && new Date(c.heure_livraison) >= sinceDate
  );

  // ── CA livré dans la période ──
  const caLivre = periodDelivered.reduce((sum, c) => sum + (c.prix_final || 0), 0);

  // ── Commission : "Non disponible" si aucune course n'a commission_silga ──
  const coursesWithCommission = periodDelivered.filter(c => c.commission_silga != null);
  const commission = coursesWithCommission.length > 0
    ? periodDelivered.reduce((sum, c) => sum + (c.commission_silga || 0), 0)
    : null;

  // ── Attribution Meta → installations (lifetime, chaîne démontrable) ──
  let metaSpend = null;
  let attributedInstalls = null;
  let attributedSignups = null;

  try {
    const adSpends = await base44.entities.GrowthSpend.filter(
      { moteur: "publicite" }, "-date_depense", 500
    );
    const totalSpend = (adSpends || []).reduce((sum, s) => sum + (s.montant || 0), 0);
    if (totalSpend > 0) metaSpend = totalSpend;

    const installs = await base44.entities.AppInstall.list('-created_date', 1000);
    const attributed = (installs || []).filter(i => i.utm_source || i.meta_campaign_id);
    attributedInstalls = attributed.length;
    attributedSignups = attributed.filter(i => i.user_email).length;
  } catch {}

  return {
    // Tunnel cohérent (cohorte période)
    firstCourse: firstCourses.length,
    secondCourse: secondCourses.length,
    regular: regularClients.length,
    caLivre,
    commission, // null = "Non disponible"
    deliveredCourses: periodDelivered.length,
    // Attribution Meta (lifetime — non cohorté par période)
    metaSpend,
    attributedInstalls,
    attributedSignups,
  };
}

// ── Journal Growth ──
async function fetchGrowthJournal(periodDays, countryCode) {
  const since = dateNDaysAgo(periodDays);
  const sinceDate = new Date(since);

  // ── HabitReminder (rappels + relance première course) ──
  const habitReminders = await base44.entities.HabitReminder.list("-created_date", 200);
  const recentHabits = (habitReminders || []).filter(r =>
    r.created_date && new Date(r.created_date) >= sinceDate
  );

  // ── ReactivationScenario ──
  const reactivationScenarios = await base44.entities.ReactivationScenario.list("-created_date", 200);
  const recentReactivation = (reactivationScenarios || []).filter(s =>
    s.created_date && new Date(s.created_date) >= sinceDate
  );

  // ── PrimePromo ──
  const primePromos = await base44.entities.PrimePromo.list("-created_date", 100);
  const recentPrimes = (primePromos || []).filter(p =>
    p.created_date && new Date(p.created_date) >= sinceDate
  );

  // ── Combiner en journal unifié ──
  const journal = [];

  for (const r of recentHabits) {
    const isRelancePremiere = r.campaign_batch_id?.startsWith("relance_premiere_");
    journal.push({
      date: r.created_date,
      moteur: isRelancePremiere ? "Relance 1ère course" : "Rappels d'habitude",
      client_id: r.client_id,
      client_phone: r.client_telephone,
      country_code: r.country_code,
      action: r.is_control_group ? "Groupe contrôle" : "Push envoyé",
      statut: r.status,
      revenue: r.revenue || 0,
      commission: r.commission || 0,
      error: r.fcm_error || null,
    });
  }

  for (const s of recentReactivation) {
    journal.push({
      date: s.created_date,
      moteur: "Réactivation",
      client_id: s.client_id,
      client_phone: s.client_telephone,
      country_code: s.country_code,
      action: `Push ${s.next_push_step === 0 ? "J0" : `J+${s.next_push_step}`}`,
      statut: s.status,
      revenue: s.revenue || 0,
      commission: s.commission || 0,
      error: null,
    });
  }

  for (const p of recentPrimes) {
    journal.push({
      date: p.created_date,
      moteur: "Prime promo",
      client_id: p.client_nouveau_id,
      client_phone: null,
      country_code: p.country_code,
      action: `Prime ${p.prime_proprietaire || 0} FCFA`,
      statut: p.statut,
      revenue: p.prix_course || 0,
      commission: 0,
      error: null,
    });
  }

  // ── Filtrer par pays si demandé ──
  const filtered = countryCode
    ? journal.filter(e => e.country_code === countryCode)
    : journal;

  // ── Trier par date décroissante ──
  filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  return filtered.slice(0, 200);
}

// ── Attribution Meta → Install → Client → Courses ──
export function useAttributionStats() {
  return useQuery({
    queryKey: ["attribution-stats"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getAttributionStats", {});
      return res.data;
    },
    staleTime: 60000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Hook principal
// ═══════════════════════════════════════════════════════════════════════════

export function useGrowthData(periodDays = 7) {
  return useQuery({
    queryKey: ["growth-overview", periodDays],
    queryFn: () => fetchOverview(periodDays),
    staleTime: 60000,
  });
}

export function useGrowthAutomationStatus() {
  return useQuery({
    queryKey: ["growth-automation-status"],
    queryFn: fetchAutomationStatus,
    staleTime: 30000,
  });
}

export function useGrowthAdBudget() {
  return useQuery({
    queryKey: ["growth-ad-budget"],
    queryFn: fetchAdBudget,
    staleTime: 30000,
  });
}

export function useGrowthPrimeBudget() {
  return useQuery({
    queryKey: ["growth-prime-budget"],
    queryFn: fetchPrimeBudget,
    staleTime: 30000,
  });
}

export function useGrowthTunnel(periodDays = 7) {
  return useQuery({
    queryKey: ["growth-tunnel", periodDays],
    queryFn: () => fetchConversionTunnel(periodDays),
    staleTime: 120000,
  });
}

export function useGrowthJournal(periodDays = 7, countryCode = null) {
  return useQuery({
    queryKey: ["growth-journal", periodDays, countryCode],
    queryFn: () => fetchGrowthJournal(periodDays, countryCode),
    staleTime: 60000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Mutations — modifier budgets et contrôler les moteurs
// Utilise AppConfig existant — aucune nouvelle architecture.
// ═══════════════════════════════════════════════════════════════════════════

// ── Trouver ou créer une entrée AppConfig ──
async function upsertAppConfig(base44, cle, valeur) {
  const existing = await base44.entities.AppConfig.filter({ cle });
  if (existing && existing.length > 0) {
    return base44.entities.AppConfig.update(existing[0].id, { valeur: String(valeur) });
  }
  return base44.entities.AppConfig.create({ cle, valeur: String(valeur) });
}

// ── Mutation : modifier le budget publicité ──
export function useUpdateAdBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ budgetPerDay }) => {
      await upsertAppConfig(base44, "ADVERTISING_BUDGET_PER_DAY", budgetPerDay);
      // Journaliser le changement
      await base44.entities.GrowthSpend.create({
        moteur: "publicite",
        type_depense: "autre",
        montant: 0,
        country_code: "",
        description_depense: `Budget publicité modifié à ${budgetPerDay} FCFA/jour`,
        statut: "engagee",
        date_depense: new Date().toISOString(),
      }).catch(() => {});
      return { budgetPerDay };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-ad-budget"] });
      qc.invalidateQueries({ queryKey: ["growth-automation-status"] });
    },
  });
}

// ── Mutation : modifier le budget primes ──
export function useUpdatePrimeBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ budgetPerDay }) => {
      await upsertAppConfig(base44, "PRIME_PROMO_BUDGET_PER_DAY", budgetPerDay);
      await base44.entities.GrowthSpend.create({
        moteur: "prime_promo",
        type_depense: "autre",
        montant: 0,
        country_code: "",
        description_depense: `Budget primes modifié à ${budgetPerDay} FCFA/jour`,
        statut: "engagee",
        date_depense: new Date().toISOString(),
      }).catch(() => {});
      return { budgetPerDay };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-prime-budget"] });
      qc.invalidateQueries({ queryKey: ["growth-automation-status"] });
    },
  });
}

// ── Mutation : basculer un moteur Growth ──
// Utilise les clés AppConfig existantes — ne crée pas de nouveau mécanisme.
export function useToggleGrowthEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ engine, newState }) => {
      const configMap = {
        reactivation: {
          LIVE: { REACTIVATION_ENGINE_ENABLED: "true", REACTIVATION_ENGINE_DRY_RUN: "false" },
          "DRY-RUN": { REACTIVATION_ENGINE_ENABLED: "true", REACTIVATION_ENGINE_DRY_RUN: "true" },
          OFF: { REACTIVATION_ENGINE_ENABLED: "false", REACTIVATION_ENGINE_DRY_RUN: "true" },
        },
        firstCourseRelance: {
          LIVE: { FIRST_COURSE_RELANCE_SEND_ENABLED: "true", FIRST_COURSE_RELANCE_ANALYSIS_ENABLED: "true" },
          "DRY-RUN": { FIRST_COURSE_RELANCE_SEND_ENABLED: "false", FIRST_COURSE_RELANCE_ANALYSIS_ENABLED: "true" },
          OFF: { FIRST_COURSE_RELANCE_SEND_ENABLED: "false", FIRST_COURSE_RELANCE_ANALYSIS_ENABLED: "false" },
        },
        habitReminders: {
          LIVE: { HABIT_REMINDER_ENABLED: "true", HABIT_REMINDER_DRY_RUN: "false" },
          "DRY-RUN": { HABIT_REMINDER_ENABLED: "true", HABIT_REMINDER_DRY_RUN: "true" },
          OFF: { HABIT_REMINDER_ENABLED: "false", HABIT_REMINDER_DRY_RUN: "true" },
        },
        primePromo: {
          ON: { PRIME_PROMO_AUTO_ENABLED: "true" },
          OFF: { PRIME_PROMO_AUTO_ENABLED: "false" },
        },
        advertising: {
          ON: { ADVERTISING_AUTO_ENABLED: "true" },
          OFF: { ADVERTISING_AUTO_ENABLED: "false" },
        },
      };

      const configs = configMap[engine]?.[newState];
      if (!configs) throw new Error(`Configuration non trouvée: ${engine}/${newState}`);

      for (const [cle, valeur] of Object.entries(configs)) {
        await upsertAppConfig(base44, cle, valeur);
      }

      // Journaliser le changement d'état
      await base44.entities.GrowthSpend.create({
        moteur: engine,
        type_depense: "autre",
        montant: 0,
        country_code: "",
        description_depense: `Moteur ${engine} → ${newState}`,
        statut: "engagee",
        date_depense: new Date().toISOString(),
      }).catch(() => {});

      return { engine, newState };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth-automation-status"] });
      qc.invalidateQueries({ queryKey: ["growth-ad-budget"] });
      qc.invalidateQueries({ queryKey: ["growth-prime-budget"] });
    },
  });
}