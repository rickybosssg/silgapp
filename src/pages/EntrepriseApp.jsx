import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, RefreshCw, UserPlus } from "lucide-react";
import EnterpriseLayout from "@/components/enterprise/EnterpriseLayout.jsx";
import EnterpriseDashboard from "@/components/enterprise/EnterpriseDashboard.jsx";
import BrandingTab from "@/components/enterprise/BrandingTab.jsx";
import InvitationsTab from "@/components/enterprise/InvitationsTab.jsx";
import PendingDriversTab from "@/components/enterprise/PendingDriversTab.jsx";
import CourseCreateTab from "@/components/enterprise/CourseCreateTab.jsx";
import CourseDetailModal from "@/components/enterprise/CourseDetailModal.jsx";
import LivreurFicheModal from "@/components/enterprise/LivreurFicheModal.jsx";
import CreateLivreurEnterpriseModal from "@/components/enterprise/CreateLivreurEnterpriseModal.jsx";
import CarteDispatchTab from "@/components/enterprise/CarteDispatchTab.jsx";
import { EN_TRAITEMENT_STATUSES, STATUS_BADGE } from "@/components/enterprise/courseStatus.js";

export default function EntrepriseApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [showCreateLivreur, setShowCreateLivreur] = useState(false);

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
  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => loadDashboard(true), 30000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement du dashboard entreprise...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-sm text-destructive">{error}</p>
          <button onClick={loadDashboard} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">Réessayer</button>
        </div>
      </div>
    );
  }

  if (!data?.enterprise) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-3 max-w-sm">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Aucune entreprise rattachée à ce compte.</p>
          <button onClick={() => base44.auth.logout()} className="px-4 py-2 border rounded-lg text-sm">Se déconnecter</button>
        </div>
      </div>
    );
  }

  const { enterprise, stats, courses, livreurs, ledger } = data;
  const pendingCount = stats?.candidats_en_attente || 0;

  return (
    <EnterpriseLayout
      enterprise={enterprise}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      pendingCount={pendingCount}
      onRefresh={() => loadDashboard()}
    >
      <div className="p-4 lg:p-0">
        {activeTab === "overview" && (
          <EnterpriseDashboard stats={stats} enterprise={enterprise} courses={courses} onTabChange={setActiveTab} />
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
          <LivreursTab
            livreurs={livreurs}
            onLivreurClick={setSelectedLivreur}
            onCreateClick={() => setShowCreateLivreur(true)}
          />
        )}
        {activeTab === "pending" && <PendingDriversTab />}
        {activeTab === "invitations" && <InvitationsTab />}
        {activeTab === "branding" && <BrandingTab enterprise={enterprise} onRefresh={loadDashboard} />}
        {activeTab === "comptabilite" && <ComptabiliteTab stats={stats} ledger={ledger} enterprise={enterprise} />}
      </div>

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
      <CreateLivreurEnterpriseModal
        open={showCreateLivreur}
        onClose={() => setShowCreateLivreur(false)}
        onCreated={loadDashboard}
      />
    </EnterpriseLayout>
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
function LivreursTab({ livreurs, onLivreurClick, onCreateClick }) {
  return (
    <div className="space-y-3">
      {/* Bouton Nouveau livreur */}
      <button
        onClick={onCreateClick}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition"
      >
        <UserPlus className="w-4 h-4" /> Nouveau livreur
      </button>

      {/* Liste */}
      {(!livreurs || livreurs.length === 0) ? (
        <p className="text-sm text-gray-400 text-center py-4">Aucun livreur. Cliquez sur « Nouveau livreur » pour en créer un.</p>
      ) : (
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
      )}
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