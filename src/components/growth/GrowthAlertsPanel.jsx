import React from "react";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Bell, ShieldAlert, Clock, Ban } from "lucide-react";

function AlertItem({ type, title, message, severity = "warning" }) {
  const icons = {
    budget: AlertTriangle,
    fcm_errors: AlertTriangle,
    workflow_error: ShieldAlert,
    automation_disabled: Ban,
    anti_solicitation: Bell,
    no_execution: Clock,
    ok: CheckCircle2,
  };
  const colors = {
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  const Icon = icons[type] || icons.ok;

  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2.5 ${colors[severity]}`}>
      <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold">{title}</p>
        {message && <p className="text-[11px] mt-0.5 opacity-90">{message}</p>}
      </div>
    </div>
  );
}

export default function GrowthAlertsPanel({ automationStatus, adBudget, primeBudget, tunnel }) {
  const alerts = [];

  // ── Budget publicité atteint ──
  if (adBudget && adBudget.spentToday >= adBudget.budgetPerDay) {
    alerts.push({
      type: "budget",
      title: "Budget publicité atteint",
      message: `${adBudget.spentToday} / ${adBudget.budgetPerDay} FCFA aujourd'hui`,
      severity: "warning",
    });
  }

  // ── Budget primes atteint ──
  if (primeBudget && primeBudget.spentToday >= primeBudget.budgetPerDay) {
    alerts.push({
      type: "budget",
      title: "Budget primes atteint",
      message: `${primeBudget.spentToday} / ${primeBudget.budgetPerDay} FCFA aujourd'hui`,
      severity: "warning",
    });
  }

  // ── Automatisation désactivée ──
  if (automationStatus) {
    if (automationStatus.reactivation?.status === "OFF") {
      alerts.push({
        type: "automation_disabled",
        title: "Réactivation clients désactivée",
        message: "Le moteur de réactivation est OFF",
        severity: "info",
      });
    }
    if (automationStatus.firstCourseRelance?.status === "OFF") {
      alerts.push({
        type: "automation_disabled",
        title: "Relance 1ère course désactivée",
        severity: "info",
      });
    }
    if (automationStatus.habitReminders?.status === "OFF") {
      alerts.push({
        type: "automation_disabled",
        title: "Rappels d'habitude désactivés",
        severity: "info",
      });
    }
  }

  // ── Couverture FCM faible ──
  if (tunnel && tunnel.withAccount > 0) {
    const fcmRate = (tunnel.fcmActive / tunnel.withAccount * 100).toFixed(1);
    if (parseFloat(fcmRate) < 50) {
      alerts.push({
        type: "fcm_errors",
        title: "Couverture FCM faible",
        message: `${tunnel.fcmActive} tokens actifs / ${tunnel.withAccount} comptes User (${fcmRate}%)`,
        severity: "danger",
      });
    }
  }

  // ── Aucune exécution récente ──
  if (automationStatus) {
    const now = Date.now();
    const SIX_HOURS = 6 * 3600000;
    for (const [key, label] of [
      ["reactivation", "Réactivation"],
      ["firstCourseRelance", "Relance 1ère course"],
      ["habitReminders", "Rappels d'habitude"],
    ]) {
      const lastRun = automationStatus[key]?.lastRun;
      if (lastRun && (now - new Date(lastRun).getTime()) > SIX_HOURS) {
        alerts.push({
          type: "no_execution",
          title: `${label} — pas d'exécution récente`,
          message: `Dernière exécution: ${new Date(lastRun).toLocaleString("fr-FR")}`,
          severity: "warning",
        });
      }
    }
  }

  // ── Aucune alerte ──
  if (alerts.length === 0) {
    alerts.push({
      type: "ok",
      title: "Aucune alerte",
      message: "Tous les systèmes Growth fonctionnent normalement.",
      severity: "ok",
    });
  }

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-bold text-slate-800">Alertes</h3>
        {alerts.filter(a => a.severity !== "ok").length > 0 && (
          <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {alerts.filter(a => a.severity !== "ok").length}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {alerts.map((alert, i) => (
          <AlertItem key={i} {...alert} />
        ))}
      </div>
    </Card>
  );
}