// ═══════════════════════════════════════════════════════════════════════════
// hook useGrowthData — charge toutes les données du dashboard Growth
// RÉUTILISE les entités existantes : ClientExterne, CourseExterne, HabitReminder,
// ReactivationScenario, ReactivationCampaign, AppInstall, NotificationToken,
// PrimePromo, AppConfig, CrmProspection.
// NE CRÉE PAS de nouvelle architecture — lit uniquement les données existantes.
// ═══════════════════════════════════════════════════════════════════════════

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// ── Helper : filtre date ISO depuis N jours ──
export function dateNDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
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

  // ── Courses livrées dans la période ──
  const deliveredCourses = await base44.entities.CourseExterne.filter(
    { statut: "livree" },
    "-heure_livraison", 500
  );
  const recentDelivered = (deliveredCourses || []).filter(c =>
    c.heure_livraison && new Date(c.heure_livraison) >= sinceDate
  );

  // ── Courses créées dans la période (toutes sources) ──
  const recentCreatedCourses = (deliveredCourses || []).filter(c =>
    c.created_date && new Date(c.created_date) >= sinceDate
  );

  // ── Premières courses (clients avec premiere_course_faite=false → true) ──
  // Approximation : courses livrées où le client n'avait pas de course livrée antérieure
  const firstCourses = recentDelivered.filter(c => {
    const clientCourses = deliveredCourses.filter(dc =>
      (dc.client_phone_normalized || dc.client_telephone) === (c.client_phone_normalized || c.client_telephone)
    );
    return clientCourses.length === 1;
  });

  // ── Deuxièmes courses (clients avec ≥2 courses livrées, 2ème dans la période) ──
  const secondCourses = recentDelivered.filter(c => {
    const phone = c.client_phone_normalized || c.client_telephone;
    const clientCourses = deliveredCourses.filter(dc =>
      (dc.client_phone_normalized || dc.client_telephone) === phone
    );
    return clientCourses.length >= 2;
  });

  // ── Clients réactivés (ReactivationScenario converted dans la période) ──
  const reactivationScenarios = await base44.entities.ReactivationScenario.list("-converted_at", 500);
  const reactivatedClients = (reactivationScenarios || []).filter(s =>
    s.status === "converted" && s.converted_at && new Date(s.converted_at) >= sinceDate
  );

  // ── Clients réguliers (≥3 courses livrées) ──
  const phoneCounts = {};
  for (const c of deliveredCourses) {
    const phone = c.client_phone_normalized || c.client_telephone;
    if (phone) phoneCounts[phone] = (phoneCounts[phone] || 0) + 1;
  }
  const regularClients = Object.values(phoneCounts).filter(count => count >= 3).length;

  // ── Push envoyés (HabitReminder sent + ReactivationScenario pushes) ──
  const habitReminders = await base44.entities.HabitReminder.filter(
    { status: "sent" },
    "-sent_at", 500
  );
  const recentPushes = (habitReminders || []).filter(r =>
    r.sent_at && new Date(r.sent_at) >= sinceDate
  );

  // ── Conversions après push (HabitReminder converted) ──
  const convertedReminders = (habitReminders || []).filter(r =>
    r.status === "converted" && r.converted_at && new Date(r.converted_at) >= sinceDate
  );

  // ── Courses générées par automatisations (ReactivationScenario converted) ──
  const automationCourses = reactivatedClients.length + convertedReminders.length;

  // ── CA généré (somme des prix_final des courses converties) ──
  const automationRevenue = reactivatedClients.reduce((sum, s) => sum + (s.revenue || 0), 0)
    + convertedReminders.reduce((sum, r) => sum + (r.revenue || 0), 0);

  // ── Commission SILGAPP générée ──
  const automationCommission = reactivatedClients.reduce((sum, s) => sum + (s.commission || 0), 0)
    + convertedReminders.reduce((sum, r) => sum + (r.commission || 0), 0);

  return {
    periodDays,
    newClients: newClients.length,
    totalClients: (clients || []).length,
    firstCourses: firstCourses.length,
    secondCourses: secondCourses.length,
    reactivatedClients: reactivatedClients.length,
    regularClients,
    pushesSent: recentPushes.length,
    pushConversions: convertedReminders.length + reactivatedClients.length,
    pushConversionRate: recentPushes.length > 0
      ? ((convertedReminders.length + reactivatedClients.length) / recentPushes.length * 100).toFixed(1)
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
      status: "OFF",
      budgetPerDay: parseInt(cfg["ADVERTISING_BUDGET_PER_DAY"] || "1000"),
    },
  };
}

// ── Budget publicité ──
async function fetchAdBudget() {
  const configs = await base44.entities.AppConfig.list();
  const cfg = parseAppConfig(configs);
  const budgetPerDay = parseInt(cfg["ADVERTISING_BUDGET_PER_DAY"] || "1000");
  const autoEnabled = cfg["ADVERTISING_AUTO_ENABLED"] === "true";

  // ── Dépensé aujourd'hui (PubliciteVue aujourd'hui) ──
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const pubVues = await base44.entities.PubliciteVue.list("-created_date", 500);
  const spentToday = (pubVues || []).filter(v =>
    v.created_date && new Date(v.created_date) >= todayStart
  ).length;

  return {
    budgetPerDay,
    autoEnabled,
    spentToday,
    remainingToday: Math.max(0, budgetPerDay - spentToday),
    spent7Days: (pubVues || []).filter(v =>
      v.created_date && new Date(v.created_date) >= dateNDaysAgo(7)
    ).length,
    spent30Days: (pubVues || []).filter(v =>
      v.created_date && new Date(v.created_date) >= dateNDaysAgo(30)
    ).length,
  };
}

// ── Budget primes ──
async function fetchPrimeBudget() {
  const configs = await base44.entities.AppConfig.list();
  const cfg = parseAppConfig(configs);
  const budgetPerDay = parseInt(cfg["PRIME_PROMO_BUDGET_PER_DAY"] || "1000");
  const autoEnabled = cfg["PRIME_PROMO_AUTO_ENABLED"] === "true";

  const primes = await base44.entities.PrimePromo.list("-validee_at", 500);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const primesToday = (primes || []).filter(p =>
    p.validee_at && new Date(p.validee_at) >= todayStart
  );

  return {
    budgetPerDay,
    autoEnabled,
    spentToday: primesToday.reduce((sum, p) => sum + (p.prime_proprietaire || 0), 0),
    primesCountToday: primesToday.length,
    coursesAttribuees: (primes || []).filter(p => p.course_id).length,
    totalPrimes: (primes || []).length,
  };
}

// ── Tunnel de conversion ──
async function fetchConversionTunnel() {
  const clients = await base44.entities.ClientExterne.list();
  const crmProspections = await base44.entities.CrmProspection.list();
  const appInstalls = await base44.entities.AppInstall.list();
  const notificationTokens = await base44.entities.NotificationToken.filter({ user_type: "client" });
  const courses = await base44.entities.CourseExterne.filter({ statut: "livree" }, "-heure_livraison", 500);

  // ── Compter par téléphone normalisé ──
  const phoneCourseCount = {};
  for (const c of courses || []) {
    const phone = c.client_phone_normalized || c.client_telephone;
    if (phone) phoneCourseCount[phone] = (phoneCourseCount[phone] || 0) + 1;
  }

  const firstCoursePhones = Object.entries(phoneCourseCount).filter(([, count]) => count === 1).map(([phone]) => phone);
  const secondCoursePhones = Object.entries(phoneCourseCount).filter(([, count]) => count >= 2).map(([phone]) => phone);
  const regularPhones = Object.entries(phoneCourseCount).filter(([, count]) => count >= 3).map(([phone]) => phone);

  // ── Tokens FCM actifs natifs ──
  const fcmTokens = (notificationTokens || []).filter(t =>
    t.actif && t.token && !String(t.token).startsWith("web_")
  );
  const fcmEmails = new Set(fcmTokens.map(t => t.user_email?.toLowerCase()).filter(Boolean));

  // ── Clients avec compte User (user_email renseigné) ──
  const clientsWithAccount = (clients || []).filter(c => c.user_email);
  const clientsWithAccountEmails = new Set(
    clientsWithAccount.map(c => c.user_email?.toLowerCase()).filter(Boolean)
  );

  // ── Installations uniques (par device_id) ──
  const installDeviceIds = new Set((appInstalls || []).map(i => i.device_id).filter(Boolean));

  // ── Clients réactivés ──
  const reactivationScenarios = await base44.entities.ReactivationScenario.filter({ status: "converted" });
  const reactivatedClientIds = new Set((reactivationScenarios || []).map(s => s.client_id));

  const totalProspects = (crmProspections || []).length + (clients || []).length;
  const totalClients = (clients || []).length;
  const totalWithAccount = clientsWithAccountEmails.size;
  const totalInstalls = installDeviceIds.size;
  const totalFcmActive = fcmEmails.size;
  const totalFirstCourse = firstCoursePhones.length;
  const totalSecondCourse = secondCoursePhones.length;
  const totalRegular = regularPhones.length;
  const totalReactivated = reactivatedClientIds.size;

  return {
    prospects: totalProspects,
    clients: totalClients,
    withAccount: totalWithAccount,
    installs: totalInstalls,
    fcmActive: totalFcmActive,
    firstCourse: totalFirstCourse,
    secondCourse: totalSecondCourse,
    regular: totalRegular,
    reactivated: totalReactivated,
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

export function useGrowthTunnel() {
  return useQuery({
    queryKey: ["growth-tunnel"],
    queryFn: fetchConversionTunnel,
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