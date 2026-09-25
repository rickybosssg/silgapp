import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Package, TrendingUp, Wallet, LogOut, RefreshCw, Truck, MapPin } from "lucide-react";

/**
 * EntrepriseApp — Dashboard de l'Admin Entreprise.
 *
 * L'Admin Entreprise voit UNIQUEMENT les données de son entreprise.
 * L'enterprise_id est résolu côté backend depuis l'utilisateur authentifié.
 *
 * Fonctionnalités:
 *   - Vue d'ensemble (stats, courses, livreurs, comptabilité)
 *   - Courses (aujourd'hui, en cours, récentes)
 *   - Livreurs (liste, statut)
 *   - Comptabilité SILGAPP (dû, commissions, paiements, ledger)
 */
export default function EntrepriseApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getEnterpriseDashboard", {});
      setData(res?.data || res);
    } catch (err) {
      setError(err?.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleLogout = () => {
    if (!window.confirm("Voulez-vous vraiment vous déconnecter ?")) return;
    base44.auth.logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm text-gray-500">Chargement du dashboard entreprise...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-sm text-red-500">{error}</p>
          <Button onClick={loadDashboard}>Réessayer</Button>
        </div>
      </div>
    );
  }

  if (!data?.enterprise) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-3 max-w-sm">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto" />
          <p className="text-sm text-gray-500">Aucune entreprise rattachée à ce compte.</p>
          <Button onClick={handleLogout} variant="outline">Se déconnecter</Button>
        </div>
      </div>
    );
  }

  const { enterprise, stats, courses, livreurs, ledger } = data;
  const primaryColor = enterprise.couleur_primaire || "#007AFF";

  const tabs = [
    { id: "overview", label: "Tableau de bord", icon: TrendingUp },
    { id: "courses", label: "Courses", icon: Package },
    { id: "livreurs", label: "Livreurs", icon: Users },
    { id: "comptabilite", label: "Comptabilité", icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}DD)` }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {enterprise.logo_url ? (
              <img src={enterprise.logo_url} alt={enterprise.nom} className="w-10 h-10 rounded-lg object-cover bg-white/10" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold leading-tight">{enterprise.nom}</h1>
              <p className="text-[10px] opacity-80">Dashboard Entreprise</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-white/10">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav className="sticky top-[56px] z-30 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition ${
                  activeTab === tab.id
                    ? "border-current text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
                style={activeTab === tab.id ? { color: primaryColor, borderColor: primaryColor } : {}}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="max-w-4xl mx-auto px-4 py-4 pb-20">
        {activeTab === "overview" && (
          <OverviewTab stats={stats} enterprise={enterprise} courses={courses} />
        )}
        {activeTab === "courses" && <CoursesTab courses={courses} stats={stats} />}
        {activeTab === "livreurs" && <LivreursTab livreurs={livreurs} />}
        {activeTab === "comptabilite" && <ComptabiliteTab stats={stats} ledger={ledger} enterprise={enterprise} />}
      </main>
    </div>
  );
}

// ── Onglet Vue d'ensemble ──
function OverviewTab({ stats, enterprise, courses }) {
  const statCards = [
    { icon: Package, label: "Courses aujourd'hui", value: stats?.courses_today || 0, color: "text-blue-600", bg: "bg-blue-50" },
    { icon: Truck, label: "En cours", value: stats?.courses_in_progress || 0, color: "text-amber-600", bg: "bg-amber-50" },
    { icon: Users, label: "Livreurs dispos", value: stats?.livreurs_disponibles || 0, color: "text-emerald-600", bg: "bg-emerald-50" },
    { icon: Wallet, label: "Dû SILGAPP", value: `${(stats?.montant_du_silgapp || 0).toLocaleString("fr-FR")} F`, color: "text-red-600", bg: "bg-red-50" },
  ];

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-3">
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{stat.value}</p>
                <p className="text-[10px] text-gray-500 leading-tight">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Taux et volume */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Taux SILGAPP</span>
            <span className="text-sm font-bold text-gray-900">{stats?.taux_silgapp || 0}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Volume courses (livrées)</span>
            <span className="text-sm font-bold text-gray-900">{(stats?.volume_courses || 0).toLocaleString("fr-FR")} F</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Commissions générées</span>
            <span className="text-sm font-bold text-gray-900">{(stats?.total_commissions || 0).toLocaleString("fr-FR")} F</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Total payé</span>
            <span className="text-sm font-bold text-emerald-600">{(stats?.total_paiements || 0).toLocaleString("fr-FR")} F</span>
          </div>
        </CardContent>
      </Card>

      {/* Courses récentes */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">Courses récentes</h3>
        {courses?.recent?.length > 0 ? (
          <div className="space-y-2">
            {courses.recent.slice(0, 5).map((c) => (
              <CourseRow key={c.id} course={c} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Aucune course</p>
        )}
      </div>
    </div>
  );
}

// ── Onglet Courses ──
function CoursesTab({ courses, stats }) {
  const [subTab, setSubTab] = useState("recent");
  const subTabs = [
    { id: "recent", label: "Récentes", data: courses?.recent || [] },
    { id: "today", label: "Aujourd'hui", data: courses?.today || [] },
    { id: "in_progress", label: "En cours", data: courses?.in_progress || [] },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              subTab === t.id ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {t.label} ({t.data.length})
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {subTabs.find((t) => t.id === subTab)?.data.length > 0 ? (
          subTabs.find((t) => t.id === subTab).data.map((c) => (
            <CourseRow key={c.id} course={c} />
          ))
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Aucune course</p>
        )}
      </div>
    </div>
  );
}

// ── Onglet Livreurs ──
function LivreursTab({ livreurs }) {
  if (!livreurs || livreurs.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Aucun livreur</p>;
  }
  return (
    <div className="space-y-2">
      {livreurs.map((l) => (
        <Card key={l.id}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
              {l.photo_url ? (
                <img src={l.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-gray-500">
                  {(l.prenom?.[0] || "") + (l.nom?.[0] || "")}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {l.prenom} {l.nom}
              </p>
              <p className="text-xs text-gray-500">{l.telephone}</p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              l.statut === "disponible" ? "bg-emerald-100 text-emerald-700" :
              l.statut === "en_course" ? "bg-amber-100 text-amber-700" :
              "bg-gray-100 text-gray-500"
            }`}>
              {l.statut === "disponible" ? "Dispo" : l.statut === "en_course" ? "En course" : "Hors ligne"}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Onglet Comptabilité ──
function ComptabiliteTab({ stats, ledger, enterprise }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-900">Synthèse financière</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Volume courses (livrées)</span>
            <span className="text-sm font-bold text-gray-900">{(stats?.volume_courses || 0).toLocaleString("fr-FR")} F</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Nombre de courses comptabilisées</span>
            <span className="text-sm font-bold text-gray-900">{stats?.courses_completed || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Taux SILGAPP actuel</span>
            <span className="text-sm font-bold text-gray-900">{stats?.taux_silgapp || 0}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Commissions SILGAPP générées</span>
            <span className="text-sm font-bold text-gray-900">{(stats?.total_commissions || 0).toLocaleString("fr-FR")} F</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Total payé</span>
            <span className="text-sm font-bold text-emerald-600">{(stats?.total_paiements || 0).toLocaleString("fr-FR")} F</span>
          </div>
          <div className="border-t pt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">Reste dû à SILGAPP</span>
            <span className="text-lg font-bold text-red-600">{(stats?.montant_du_silgapp || 0).toLocaleString("fr-FR")} F</span>
          </div>
        </CardContent>
      </Card>

      {/* Ledger */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">Historique financier</h3>
        {ledger && ledger.length > 0 ? (
          <div className="space-y-2">
            {ledger.slice(0, 20).map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${
                      entry.type === "commission_course" ? "text-blue-600" :
                      entry.type === "paiement" ? "text-emerald-600" :
                      "text-gray-600"
                    }`}>
                      {entry.type === "commission_course" ? "Commission" :
                       entry.type === "paiement" ? "Paiement" :
                       "Ajustement"}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {entry.montant > 0 ? "+" : ""}{entry.montant.toLocaleString("fr-FR")} F
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    {new Date(entry.created_date).toLocaleString("fr-FR")}
                    {entry.taux ? ` · Taux: ${entry.taux}%` : ""}
                    {entry.reference ? ` · Réf: ${entry.reference}` : ""}
                  </p>
                  {entry.motif && <p className="text-[10px] text-gray-500 mt-1">{entry.motif}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Aucune écriture financière</p>
        )}
      </div>
    </div>
  );
}

// ── Composant: ligne de course ──
function CourseRow({ course }) {
  const statusColors = {
    nouvelle: "bg-blue-100 text-blue-700",
    livree: "bg-emerald-100 text-emerald-700",
    annulee: "bg-red-100 text-red-700",
    en_livraison: "bg-amber-100 text-amber-700",
    pris_en_charge: "bg-purple-100 text-purple-700",
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-gray-900 truncate flex-1">
            {course.adresse_depart || "—"} → {course.adresse_arrivee || "—"}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ml-2 ${
            statusColors[course.statut] || "bg-gray-100 text-gray-500"
          }`}>
            {course.statut}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {course.client_nom || "Client"} · {new Date(course.created_date).toLocaleDateString("fr-FR")}
          </span>
          {course.prix_final > 0 && (
            <span className="text-xs font-bold text-gray-900">{course.prix_final.toLocaleString("fr-FR")} F</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}