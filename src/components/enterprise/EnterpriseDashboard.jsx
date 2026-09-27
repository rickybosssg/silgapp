import React from "react";
import StatCard from "@/components/dashboard/StatCard";
import { Package, Clock, Truck, CheckCircle2, Users, UserCheck, UserX, TrendingUp, Wallet, Percent, AlertCircle, XCircle } from "lucide-react";

export default function EnterpriseDashboard({ stats, enterprise, courses, onTabChange }) {
  const isAgenceActive = enterprise?.actif !== false && enterprise?.statut === "actif";
  const candidatsCount = stats?.candidats_en_attente || 0;

  return (
    <div className="space-y-6">
      {/* Alerte agence suspendue */}
      {!isAgenceActive && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700">Agence suspendue</p>
            <p className="text-xs text-red-600">Votre entreprise est temporairement suspendue. Contactez SILGAPP.</p>
          </div>
        </div>
      )}

      {/* Alerte candidats en attente */}
      {candidatsCount > 0 && (
        <button
          onClick={() => onTabChange?.("livreurs")}
          className="w-full rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center justify-between hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-bold text-amber-700">{candidatsCount} candidat(s) en attente</p>
              <p className="text-xs text-amber-600">Validez les nouveaux livreurs de votre agence</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-amber-700">Valider →</span>
        </button>
      )}

      {/* KPI Courses */}
      <div>
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Courses</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard
            title="Aujourd'hui"
            value={stats?.courses_today || 0}
            icon={Package}
            iconBg="bg-blue-500"
          />
          <StatCard
            title="En traitement"
            value={stats?.courses_in_progress || 0}
            icon={Clock}
            iconBg="bg-amber-500"
          />
          <StatCard
            title="Livrées aujourd'hui"
            value={stats?.courses_completed_today || 0}
            icon={CheckCircle2}
            iconBg="bg-emerald-500"
          />
          <StatCard
            title="Programmées"
            value={stats?.courses_pending || 0}
            icon={Clock}
            iconBg="bg-indigo-500"
          />
          <StatCard
            title="Total livrées"
            value={stats?.courses_completed || 0}
            icon={Package}
            iconBg="bg-emerald-600"
          />
          <StatCard
            title="Annulées"
            value={stats?.courses_cancelled || 0}
            icon={XCircle}
            iconBg="bg-red-500"
          />
        </div>
      </div>

      {/* KPI Livreurs */}
      <div>
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Livreurs</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard
            title="Total"
            value={stats?.livreurs_total || 0}
            icon={Users}
            iconBg="bg-slate-500"
          />
          <StatCard
            title="Actifs"
            value={stats?.livreurs_actifs || 0}
            icon={UserCheck}
            iconBg="bg-emerald-500"
          />
          <StatCard
            title="Disponibles"
            value={stats?.livreurs_disponibles || 0}
            icon={Truck}
            iconBg="bg-green-500"
          />
          <StatCard
            title="En course"
            value={stats?.livreurs_en_course || 0}
            icon={Truck}
            iconBg="bg-amber-500"
          />
          <StatCard
            title="Hors ligne"
            value={stats?.livreurs_hors_ligne || 0}
            icon={UserX}
            iconBg="bg-slate-400"
          />
        </div>
      </div>

      {/* KPI Financiers */}
      <div>
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Finance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Taux SILGAPP"
            value={`${stats?.taux_silgapp || 0}%`}
            icon={Percent}
            iconBg="bg-primary"
          />
          <StatCard
            title="Volume courses"
            value={`${(stats?.volume_courses || 0).toLocaleString("fr-FR")} F`}
            icon={TrendingUp}
            iconBg="bg-blue-600"
          />
          <StatCard
            title="Commissions générées"
            value={`${(stats?.total_commissions || 0).toLocaleString("fr-FR")} F`}
            icon={Wallet}
            iconBg="bg-purple-500"
          />
          <StatCard
            title="Total payé"
            value={`${(stats?.total_paiements || 0).toLocaleString("fr-FR")} F`}
            icon={CheckCircle2}
            iconBg="bg-emerald-600"
          />
        </div>

        {/* Reste dû — mis en évidence */}
        <div className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-red-600 uppercase tracking-wider">Reste dû à SILGAPP</p>
            <p className="text-3xl font-bold text-red-700 mt-1">
              {(stats?.montant_du_silgapp || 0).toLocaleString("fr-FR")} <span className="text-lg">F</span>
            </p>
          </div>
          <Wallet className="w-10 h-10 text-red-300" />
        </div>
      </div>

      {/* Courses récentes */}
      {courses?.recent && courses.recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Courses récentes</h3>
            <button
              onClick={() => onTabChange?.("courses")}
              className="text-xs font-semibold text-primary hover:text-primary-dark"
            >
              Voir tout →
            </button>
          </div>
          <div className="space-y-2">
            {courses.recent.slice(0, 5).map((c) => (
              <div key={c.id} className="bg-card rounded-xl border border-border p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">#{c.id?.slice(-6)}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {c.created_date ? new Date(c.created_date).toLocaleString("fr-FR") : ""}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground truncate mt-1">{c.client_nom || "Client"}</p>
                <p className="text-xs text-muted-foreground truncate">{c.adresse_depart} → {c.adresse_arrivee}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {c.livreur_nom ? `🛵 ${c.livreur_nom}` : "En attente"}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {c.prix_final ? `${c.prix_final.toLocaleString("fr-FR")} F` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}