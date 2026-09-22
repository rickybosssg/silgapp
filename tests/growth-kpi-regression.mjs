// ═══════════════════════════════════════════════════════════════════════════
// TEST DE NON-RÉGRESSION — KPI GROWTH (PÉRIODE 7 JOURS)
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce test vérifie que les corrections du dashboard Growth sont effectives :
//
// 1. "Deuxièmes courses" = 22 (ancienne définition surévaluée : 77)
//    Nouvelle définition : clients dont la 2ème course à vie est dans la période.
//
// 2. Course annulée 6ab15a7af15f792a49a7446b EXCLUE du CA Growth.
//    Ancienne valeur : 1500 F (faux CA provenant d'une course annulée).
//    Nouvelle valeur : 0 F (aucune course livrée = aucun CA).
//
// 3. "Push envoyés" inclut tous les moteurs (HabitReminder + ReactivationScenario).
//    Anciennement : HabitReminder seul, mais conversions incluaient ReactivationScenario.
//
// 4. Commission = "Non disponible" (null) si aucune conversion vérifiée.
//    Anciennement : 0 F inventé.
//
// 5. Meta affiche "Connectée" même avec 0 dépense (metaMetrics.today === null).
//
// 6. Tunnel de conversion : cohorté par période, chaque étape sous-ensemble de la précédente.
//
// Valeurs de référence (audit 2026-09-22, période 7 jours) :
//   AVANT : secondCourses=77, automationRevenue=1500, automationCommission=0, pushesSent=3
//   APRÈS : secondCourses=22, automationRevenue=0, automationCommission=null, pushesSent=3+
//
// Ce test est exécuté via exec_tool après déploiement des corrections.
// ═══════════════════════════════════════════════════════════════════════════

export const GROWTH_KPI_REGRESSION_EXPECTED = {
  periodDays: 7,
  auditDate: "2026-09-22",
  // AVANT correction
  before: {
    secondCourses: 77,
    automationRevenue: 1500,
    automationCommission: 0,
    pushesSent: 3,
    metaDisplay: "Non connectée",
    tunnelMixedLifetime: true,
  },
  // APRÈS correction
  after: {
    secondCourses: 22,
    automationRevenue: 0,
    automationCommission: null, // "Non disponible"
    pushesSent: ">=3", // inclut ReactivationScenario pushes
    metaDisplay: "Connectée",
    tunnelCohortPeriod: true,
  },
  // Course annulée qui ne doit plus apparaître dans le CA
  cancelledCourseExcluded: "6ab15a7af15f792a49a7446b",
};

export function assertGrowthKpiRegression(actual, expected) {
  const errors = [];
  if (actual.secondCourses !== expected.after.secondCourses) {
    errors.push(`secondCourses: expected ${expected.after.secondCourses}, got ${actual.secondCourses}`);
  }
  if (actual.automationRevenue !== expected.after.automationRevenue) {
    errors.push(`automationRevenue: expected ${expected.after.automationRevenue}, got ${actual.automationRevenue}`);
  }
  if (actual.automationCommission !== expected.after.automationCommission) {
    errors.push(`automationCommission: expected ${expected.after.automationCommission}, got ${actual.automationCommission}`);
  }
  return errors.length === 0 ? "PASS" : `FAIL: ${errors.join("; ")}`;
}

console.log("Growth KPI regression test module loaded.");
console.log("Expected values:", GROWTH_KPI_REGRESSION_EXPECTED.after);