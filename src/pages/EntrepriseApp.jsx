import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Users, Package, TrendingUp, Wallet, LogOut, RefreshCw, Truck, Palette, UserPlus, Clock, Plus, Map } from "lucide-react";
import BrandingTab from "@/components/enterprise/BrandingTab.jsx";
import InvitationsTab from "@/components/enterprise/InvitationsTab.jsx";
import PendingDriversTab from "@/components/enterprise/PendingDriversTab.jsx";
import CourseCreateTab from "@/components/enterprise/CourseCreateTab.jsx";
import CourseDetailModal from "@/components/enterprise/CourseDetailModal.jsx";
import LivreurFicheModal from "@/components/enterprise/LivreurFicheModal.jsx";
import CarteDispatchTab from "@/components/enterprise/CarteDispatchTab.jsx";
import { EN_TRAITEMENT_STATUSES, STATUS_BADGE } from "@/components/enterprise/courseStatus.js";

export default function EntrepriseApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLivreur, setSelectedLivreur] = useState(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getEnterpriseDashboard", {});
      setData(res?.data || res);
    } catch (err) {
      if (!silent) setError(err?.message || "Erreur lors du chargement");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ── Polling centralisé 30s — LECTURE SEULE (getEnterpriseDashboard ne fait que des filter()).
  //    Aucun GPS, heartbeat, dispatch, notification ni écriture déclenché.
  //    CarteDispatchTab et CoursesTab utilisent les mêmes données → pas de double polling.
  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => loadDashboard(true), 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  const handleLogout = () => {
    if (!window.confirm("Voulez-vous vraiment vous déconnecter ?")) return;
    base44.auth.logout();
  };

  if (loading && !data) {
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
          <button onClick={loadDashboard} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm">Réessayer</button>
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
          <button onClick={handleLogout} className="px-4 py-2 border rounded-lg text-sm">Se déconnecter</button>
        </div>
      </div>
    );
  }

  const { enterprise, stats, courses, livreurs, ledger } = data;
  const primaryColor = enterprise.couleur_primaire || "#007AFF";

  const tabs = [
    { id: "overview", label: "Tableau de bord", icon: TrendingUp },
    { id: "courses", label: "Courses", icon: Package },
    { id: "create", label: "Nouvelle course", icon: Plus },
    { id: "carte", label: "Carte", icon: Map },
    { id: "livreurs", label: "Livreurs", icon: Truck },
    { id: "pending", label: "Candidats", icon: Clock },
    { id: "invitations", label: "Invitations", icon: UserPlus },
    { id: "branding", label: "Identité", icon: Palette },
    { id: "comptabilite", label: "Comptabilité", icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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

      {/* Tabs */}
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

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-4 pb-20">
        {activeTab === "overview" && (
          <OverviewTab stats={stats} enterprise={enterprise} courses={courses} />
        )}
        {activeTab === "courses" && (
          <CoursesTab courses={courses} stats={stats} onCourseClick={setSelectedCourse} />
        )}
        {activeTab === "create" && <CourseCreateTab enterprise={enterprise} onCreated={loadDashboard} />}
        {activeTab === "carte" && (
          <CarteDispatchTab
            enterprise={enterprise}
            data={data}
            onRefresh={() => loadDashboard()}
            onCourseClick={setSelectedCourse}
            onLivreurClick={setSelectedLivreur}
          />
        )}
        {activeTab === "livreurs" && (
          <LivreursTab livreurs={livreurs} onLivreurClick={setSelectedLivreur} />
        )}
        {activeTab === "pending" && <PendingDriversTab />}
        {activeTab === "invitations" && <InvitationsTab />}
        {activeTab === "branding" && <BrandingTab enterprise={enterprise} onRefresh={loadDashboard} />}
        {activeTab === "comptabilite" && <ComptabiliteTab stats={stats} ledger={ledger} enterprise={enterprise} />}
      </main>

      {/* Modals */}
      <CourseDetailModal
        course={selectedCourse}
        open={!!selectedCourse}
        onClose={() => setSelectedCourse(null)}
      />
      <LivreurFicheModal
        livreur={selectedLivreur}
        open={!!selectedLivreur}
        onClose={() => setSelectedLivreur(null)}
        onAction={loadDashboard}
      />
    </div>
  );
}

// ── Onglet Vue d'ensemble ──
function OverviewTab({ stats, enterprise, courses }) {
  const statCards = [
    { icon: Package, label: "Courses aujourd'hui", value: stats?.courses_today || 0, color: "text-blue-600", bg: "bg-blue-50" },
    { icon: Clock, label: "En attente", value: stats?.courses_pending || 0, color: "text-amber-600", bg: "bg-amber-50" },
    { icon: Truck, label: "En cours", value: stats?.courses_in_progress || 0, color: "text-purple-600", bg: "bg-purple-50" },
    { icon: Package, label: "Livrées aujourd'hui", value: stats?.courses_completed_today || 0, color: "text-emerald-600", bg: "bg-emerald-50" },
    { icon: Users, label: "Livreurs actifs", value: stats?.livreurs_actifs || 0, color: "text-emerald-600", bg: "bg-emerald-50" },
    { icon: Truck, label: "Disponibles", value: stats?.livreurs_disponibles || 0, color: "text-green-600", bg: "bg-green-50" },
    { icon: Truck, label: "En course", value: stats?.livreurs_en_course || 0, color: "text-amber-600", bg: "bg-amber-50" },
    { icon: Users, label: "Hors ligne", value: stats?.livreurs_hors_ligne || 0, color: "text-gray-600", bg: "bg-gray-50" },
  ];

  const isAgenceActive = enterprise?.actif !== false && enterprise?.statut === "actif";

  return (
    <div className="space-y-4">
      {/* Statut agence */}
      <div className={`rounded-xl p-3 flex items-center gap-2 ${isAgenceActive ? "bg-emerald-50" : "bg-red-50"}`}>
        <div className={`w-2.5 h-2.5 rounded-full ${isAgenceActive ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="text-sm font-bold text-gray-900">{isAgenceActive ? "Agence active" : "Agence suspendue"}</span>
      </div>

      {/* Candidats */}
      {(stats?.candidats_en_attente || 0) > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 flex items-center justify-between">
          <span className="text-sm text-amber-700">Candidats en attente</span>
          <span className="text-sm font-bold text-amber-700">{stats?.candidats_en_attente}</span>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-white rounded-xl border p-3 shadow-sm">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-2`}>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-gray-500 leading-tight">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Taux et volume */}
      <div className="bg-white rounded-xl border p-4 space-y-3 shadow-sm">
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
      </div>

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
function CoursesTab({ courses, stats, onCourseClick }) {
  const [subTab, setSubTab] = useState("en_traitement");

  const allCourses = courses?.recent || [];
  const filtered = {
    all: allCourses,
    en_traitement: allCourses.filter((c) => EN_TRAITEMENT_STATUSES.includes(c.statut)),
    nouvelles: allCourses.filter((c) => c.statut === "nouvelle"),
    programmee: allCourses.filter((c) => c.statut === "programmee"),
    recherche: allCourses.filter((c) => ["recherche_livreur", "en_attente"].includes(c.statut)),
    acceptees: allCourses.filter((c) => ["livreur_en_route", "client_contacte", "en_route_expediteur", "arrive_prise_en_charge"].includes(c.statut)),
    en_cours: allCourses.filter((c) => ["pris_en_charge", "en_livraison", "colis_recupere", "passager_embarque", "arrivee"].includes(c.statut)),
    terminees: allCourses.filter((c) => c.statut === "livree"),
    annulees: allCourses.filter((c) => c.statut === "annulee"),
  };

  const subTabs = [
    { id: "all", label: "Toutes", data: filtered.all },
    { id: "en_traitement", label: "En traitement", data: filtered.en_traitement },
    { id: "nouvelles", label: "Nouvelles", data: filtered.nouvelles },
    { id: "programmee", label: "Programmées", data: filtered.programmee },
    { id: "recherche", label: "En recherche", data: filtered.recherche },
    { id: "acceptees", label: "Acceptées", data: filtered.acceptees },
    { id: "en_cours", label: "En cours", data: filtered.en_cours },
    { id: "terminees", label: "Terminées", data: filtered.terminees },
    { id: "annulees", label: "Annulées", data: filtered.annulees },
  ];

  const currentData = subTabs.find((t) => t.id === subTab)?.data || [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              subTab === t.id ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {t.label} ({t.data.length})
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {currentData.length > 0 ? (
          currentData.map((c) => (
            <CourseRow key={c.id} course={c} onClick={() => onCourseClick?.(c)} />
          ))
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Aucune course</p>
        )}
      </div>
    </div>
  );
}

// ── Onglet Livreurs ──
function LivreursTab({ livreurs, onLivreurClick }) {
  if (!livreurs || livreurs.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Aucun livreur</p>;
  }
  return (
    <div className="space-y-2">
      {livreurs.map((l) => (
        <button
          key={l.id}
          onClick={() => onLivreurClick?.(l)}
          className="w-full text-left bg-white rounded-xl border p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition"
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0">
            {l.photo_url ? (
              <img src={l.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-gray-500">
                {(l.prenom?.[0] || "") + (l.nom?.[0] || "")}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{l.prenom} {l.nom}</p>
            <p className="text-xs text-gray-500">{l.telephone}</p>
            {l.user_email && <p className="text-[10px] text-gray-400 truncate">{l.user_email}</p>}
            <p className="text-[10px] text-gray-400">{l.vehicule || l.type_vehicule || "moto"} · {l.courses_du_jour || 0} courses aujourd'hui</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {l.validation === "en_attente" && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">En attente</span>
            )}
            {l.validation === "valide" && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                l.actif === false ? "bg-red-100 text-red-700" :
                l.statut === "disponible" ? "bg-emerald-100 text-emerald-700" :
                l.statut === "en_course" ? "bg-amber-100 text-amber-700" :
                "bg-gray-100 text-gray-500"
              }`}>
                {l.actif === false ? "Suspendu" :
                 l.statut === "disponible" ? "Dispo" :
                 l.statut === "en_course" ? "En course" :
                 "Hors ligne"}
              </span>
            )}
            {l.validation === "refuse" && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Refusé</span>
            )}
            <span className="text-[10px] text-blue-500">Voir fiche →</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Onglet Comptabilité ──
function ComptabiliteTab({ stats, ledger, enterprise }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-4 space-y-3 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">Synthèse financière</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Volume courses (livrées)</span>
          <span className="text-sm font-bold text-gray-900">{(stats?.volume_courses || 0).toLocaleString("fr-FR")} F</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Nombre de courses livrées</span>
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
      </div>

      {/* Ledger */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">Historique financier</h3>
        {ledger && ledger.length > 0 ? (
          <div className="space-y-2">
            {ledger.slice(0, 20).map((entry) => (
              <div key={entry.id} className="bg-white rounded-xl border p-3 shadow-sm">
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
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Aucune écriture financière</p>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        La commission SILGAPP et les paiements sont gérés par le Super Admin.
      </p>
    </div>
  );
}

// ── Composant: ligne de course ──
function CourseRow({ course, onClick }) {
  const badge = STATUS_BADGE[course.statut] || { label: course.statut, cls: "bg-gray-100 text-gray-500" };

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border p-3 shadow-sm hover:shadow-md transition"
    >
      {/* #COURSE */}
      <span className="text-[10px] font-mono text-gray-400">#{course.id?.slice(-6) || "—"}</span>
      {/* Client */}
      <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{course.client_nom || "Client"}</p>
      {/* Départ → Destination */}
      <p className="text-xs text-gray-500 truncate">{course.adresse_depart || "—"} → {course.adresse_arrivee || "—"}</p>
      {/* Livreur • Statut */}
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs text-gray-500 truncate flex-1">
          {course.livreur_nom ? (
            <>🛵 {course.livreur_nom}</>
          ) : (
            <span className="text-amber-600 italic">Recherche d'un livreur</span>
          )}
        </span>
        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      {/* Prix • Heure */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs font-bold text-gray-900">
          {course.prix_final > 0 ? `${course.prix_final.toLocaleString("fr-FR")} F` : "—"}
        </span>
        {course.created_date && (
          <span className="text-[10px] text-gray-400">{new Date(course.created_date).toLocaleString("fr-FR")}</span>
        )}
      </div>
    </button>
  );
}
