import React, { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, Package, DollarSign, TrendingUp, ArrowLeft, Truck,
  AlertCircle, AlertTriangle, Eye, MapPin, CreditCard, Download,
  Save, ExternalLink, Bug, Search, CheckCircle2, XCircle,
  Loader2, MessageCircle, Tag, Globe, Zap, ChevronRight
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import ClientsExternesPanel from "@/components/admin/ClientsExternesPanel";
import CodePromoPanel from "@/components/admin/CodePromoPanel";
import HistoriqueDuJour from "@/components/admin/HistoriqueDuJour";
import SyncClientGPSPanel from "@/components/admin/SyncClientGPSPanel";
import SyncLivreurGPSPanel from "@/components/admin/SyncLivreurGPSPanel";
import StatsPays from "@/components/international/StatsPays.jsx";
import DownloadStatsWidget from "@/components/admin/DownloadStatsWidget";

export default function DashboardAdminExterne() {
  {/* 🚨 BLOC DE TEST - SI CE TEXTE N'APPARAÎT PAS, LE FICHIER N'EST PAS CHARGÉ */}
  console.log("🚨 DashboardAdminExterne.jsx EST CHARGÉ ET EXÉCUTÉ");
  
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 200),
    initialData: [],
    refetchInterval: 10000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes"],
    queryFn: () => base44.entities.Livreur.filter({ type_livreur: "externe" }, "-created_date"),
    initialData: [],
    refetchInterval: 15000,
  });

  const [apkUrl, setApkUrl] = useState("");
  const [apkSaving, setApkSaving] = useState(false);
  const [apkConfigId, setApkConfigId] = useState(null);

  useEffect(() => {
    base44.entities.AppConfig.filter({ cle: "GOOGLE_DRIVE_APK_URL" }).then((configs) => {
      if (configs?.[0]) {
        setApkUrl(configs[0].valeur || "");
        setApkConfigId(configs[0].id);
      }
    }).catch(() => null);
  }, []);

  const handleSaveApkUrl = async () => {
    setApkSaving(true);
    try {
      if (apkConfigId) {
        await base44.entities.AppConfig.update(apkConfigId, { valeur: apkUrl });
      } else {
        await base44.entities.AppConfig.create({
          cle: "GOOGLE_DRIVE_APK_URL",
          valeur: apkUrl,
          description: "Lien Google Drive vers le fichier APK SILGAPP Externe"
        });
      }
      toast.success("Lien APK sauvegardé ✓");
    } finally {
      setApkSaving(false);
    }
  };

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes"],
    queryFn: () => base44.entities.ClientExterne.list("-created_date", 100),
    initialData: [],
    refetchInterval: 30000,
  });

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const coursesToday = courses.filter(c => new Date(c.created_date).toDateString() === today);
    const livrees = courses.filter(c => c.statut === "livree");
    const annulees = courses.filter(c => c.statut === "annulee");
    const livreursEnLigne = livreurs.filter(l =>
      l.app_active === true &&
      l.actif !== false &&
      (l.statut === "disponible" || l.statut === "en_course")
    ).length;

    return {
      coursesTotale: courses.length,
      coursesToday: coursesToday.length,
      enTraitement: courses.filter(c => !["livree", "annulee"].includes(c.statut)).length,
      livrees: livrees.length,
      annulees: annulees.length,
      caTotal: livrees.reduce((sum, c) => sum + (c.prix_final || 0), 0),
      commissionSilga: livrees.reduce((sum, c) => sum + (c.commission_silga || 0), 0),
      livreursTotal: livreurs.length,
      livreursEnLigne,
      livreursDisponibles: livreurs.filter(l => l.statut === "disponible" && l.actif !== false && l.app_active === true).length,
      livreursEnCourse: livreurs.filter(l => l.statut === "en_course" && l.actif !== false).length,
      livreursEnAttente: livreurs.filter(l => l.validation === "en_attente").length,
      clientsTotal: clients.length,
    };
  }, [courses, livreurs, clients]);

  const QUICK_LINKS = [
    {
      to: "/livreurs",
      label: "Livreurs externes",
      sub: "Validations & blocages",
      icon: Users,
      grad: "from-emerald-500 to-teal-500",
      shadow: "shadow-emerald-100",
    },
    {
      to: "/admin/externe/dus-livreurs",
      label: "Dus livreurs",
      sub: "Commissions 30%",
      icon: CreditCard,
      grad: "from-orange-500 to-amber-500",
      shadow: "shadow-orange-100",
    },
    {
      to: "/admin/gestion-pays",
      label: "Gestion des pays",
      sub: "Multi-pays, tarifs",
      icon: Globe,
      grad: "from-blue-500 to-indigo-500",
      shadow: "shadow-blue-100",
    },
    {
      to: "/admin/externe/twilio-sandbox",
      label: "Twilio WhatsApp",
      sub: "Sandbox & stats",
      icon: MessageCircle,
      grad: "from-green-500 to-emerald-600",
      shadow: "shadow-green-100",
    },
    {
      scroll: "codes-promo",
      label: "Codes Promo",
      sub: "Ambassadeurs & parrainages",
      icon: Tag,
      grad: "from-purple-500 to-violet-500",
      shadow: "shadow-purple-100",
    },
    {
      to: "/admin/externe/clients",
      label: "Clients inscrits",
      sub: `${stats.clientsTotal} comptes`,
      icon: Users,
      grad: "from-pink-500 to-rose-500",
      shadow: "shadow-pink-100",
    },
    {
      to: "/admin/externe/stats-telechargements",
      label: "Stats téléchargements",
      sub: "Visites & analytics",
      icon: Download,
      grad: "from-red-500 to-orange-500",
      shadow: "shadow-red-100",
    },
  ];

  return (
    <div className="px-4 py-4 lg:p-6 space-y-6 max-w-7xl mx-auto">



      {/* ── HERO HEADER ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-red-600 to-rose-600 p-5 sm:p-6 shadow-xl shadow-red-200">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-1.5 text-white hover:bg-white/20 border border-white/30">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Retour</span>
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-300" />
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Silga Externe</h1>
              </div>
              <p className="text-white/70 text-xs mt-0.5 capitalize">
                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-xs bg-white/10 border border-white/20 rounded-xl px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>{stats.livreursEnLigne} livreur{stats.livreursEnLigne > 1 ? "s" : ""} en ligne</span>
          </div>
        </div>
      </div>

      {/* ── ALERTE VALIDATION ──────────────────────────────────────── */}
      {stats.livreursEnAttente > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-900 text-sm">{stats.livreursEnAttente} livreur(s) en attente de validation</p>
          </div>
          <Link to="/livreurs">
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl gap-1 text-xs">
              Voir <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      )}

      {/* ── WIDGET TÉLÉCHARGEMENTS ─────────────────────────────────── */}
      <DownloadStatsWidget />

      {/* ── TÉLÉCHARGEMENTS SILGAPP ───────────────────────────────── */}
      <DownloadStatsWidget />

      {/* ── STATS KPI ──────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Vue d'ensemble</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { label: "Total courses",    value: stats.coursesTotale,               grad: "from-primary to-red-600",          shadow: "shadow-red-100" },
            { label: "Aujourd'hui",      value: stats.coursesToday,                grad: "from-blue-500 to-indigo-500",       shadow: "shadow-blue-100" },
            { label: "En traitement",    value: stats.enTraitement,                grad: "from-orange-500 to-amber-500",      shadow: "shadow-orange-100" },
            { label: "Livrées",          value: stats.livrees,                     grad: "from-green-500 to-emerald-500",     shadow: "shadow-green-100" },
            { label: "Annulées",         value: stats.annulees,                    grad: "from-red-400 to-rose-500",          shadow: "shadow-red-100" },
            { label: "CA total",         value: `${stats.caTotal.toLocaleString()}`, grad: "from-indigo-500 to-violet-500",  shadow: "shadow-indigo-100", suffix: "F" },
            { label: "Commission Silga", value: `${stats.commissionSilga.toLocaleString()}`, grad: "from-purple-500 to-fuchsia-500", shadow: "shadow-purple-100", suffix: "F" },
            { label: "Livreurs en ligne",value: stats.livreursEnLigne,             grad: "from-emerald-500 to-teal-500",      shadow: "shadow-emerald-100" },
            { label: "Disponibles",      value: stats.livreursDisponibles,         grad: "from-cyan-500 to-sky-500",          shadow: "shadow-cyan-100" },
            { label: "Clients",          value: stats.clientsTotal,                grad: "from-pink-500 to-rose-500",         shadow: "shadow-pink-100" },
          ].map(s => (
            <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-2xl p-3.5 text-white shadow-md ${s.shadow}`}>
              <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide mb-1">{s.label}</p>
              <p className="text-2xl font-black leading-none">
                {s.value}
                {s.suffix && <span className="text-xs font-normal ml-0.5">{s.suffix}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── RACCOURCIS ADMIN ──────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Accès rapide</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {QUICK_LINKS.map(link => {
            const Icon = link.icon;
            const inner = (
              <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer group">
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${link.grad} flex items-center justify-center flex-shrink-0 shadow-md ${link.shadow}`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{link.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{link.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
              </div>
            );
            if (link.scroll) {
              return (
                <a key={link.label} href={`#${link.scroll}`} onClick={e => { e.preventDefault(); document.getElementById(link.scroll)?.scrollIntoView({ behavior: "smooth" }); }}>
                  {inner}
                </a>
              );
            }
            return <Link key={link.label} to={link.to}>{inner}</Link>;
          })}
        </div>
      </div>

      {/* ── CONFIG APK ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-md shadow-red-100">
            <Download className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-foreground">Lien de téléchargement APK</p>
            <p className="text-xs text-muted-foreground">Affiché sur la page /telecharger-app</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={apkUrl}
            onChange={(e) => setApkUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/..."
            className="flex-1 bg-gray-50 rounded-xl text-sm border-gray-200"
          />
          <Button size="sm" onClick={handleSaveApkUrl} disabled={apkSaving} className="rounded-xl flex-shrink-0 gap-1">
            <Save className="w-3.5 h-3.5" />
            {apkSaving ? "..." : "Sauver"}
          </Button>
          {apkUrl && (
            <a href="/telecharger-app" target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="rounded-xl flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* ── DIAGNOSTIC LIVRAISON ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-100">
            <Bug className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-foreground">Diagnostic Livraison</p>
            <p className="text-xs text-muted-foreground">Analyser pourquoi le résumé n'apparaît pas</p>
          </div>
        </div>
        <DiagnosticInterne />
      </div>

      {/* ── CODES PROMO ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <CodePromoPanel />
      </div>

      {/* ── COURSES EN TEMPS RÉEL ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-100">
              <Eye className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">Courses en temps réel</p>
              <p className="text-xs text-muted-foreground">Actualisé toutes les 10s</p>
            </div>
          </div>
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-bold px-2.5">
            {stats.enTraitement} en cours
          </Badge>
        </div>
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {courses.filter(c => !["livree", "annulee"].includes(c.statut)).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
              Aucune course en cours
            </div>
          ) : (
            courses
              .filter(c => !["livree", "annulee"].includes(c.statut))
              .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
              .map(course => {
                const statutConfig = {
                  colis_recupere: { label: "📦 Récupéré",  cls: "bg-blue-100 text-blue-700" },
                  en_livraison:   { label: "🚀 En livraison", cls: "bg-indigo-100 text-indigo-700" },
                  livreur_en_route: { label: "🛵 En route", cls: "bg-cyan-100 text-cyan-700" },
                  recherche_livreur: { label: "🔍 Recherche", cls: "bg-amber-100 text-amber-700" },
                  nouvelle:       { label: "🆕 Nouvelle",   cls: "bg-gray-100 text-gray-600" },
                }[course.statut] || { label: course.statut, cls: "bg-gray-100 text-gray-500" };

                return (
                  <div key={course.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm truncate">{course.client_nom || "Client"}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statutConfig.cls}`}>
                          {statutConfig.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        <MapPin className="w-2.5 h-2.5 inline mr-1" />
                        {course.adresse_depart} → {course.adresse_arrivee || "?"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {course.livreur_nom && `👤 ${course.livreur_nom} • `}
                        {format(new Date(course.created_date), "dd/MM HH:mm", { locale: fr })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {course.prix_final ? (
                        <p className="font-black text-sm text-green-600">{course.prix_final.toLocaleString()} F</p>
                      ) : course.prix_estimate ? (
                        <p className="text-xs text-muted-foreground">~{course.prix_estimate.toLocaleString()} F</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">Calcul...</p>
                      )}
                      {course.distance_reelle_km && (
                        <p className="text-[10px] text-muted-foreground">{Number(course.distance_reelle_km).toFixed(1)} km</p>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* ── CLIENTS INSCRITS ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <ClientsExternesPanel />
      </div>

      {/* ── STATS PAR PAYS ───────────────────────────────────────── */}
      <StatsPays courses={courses} livreurs={livreurs} clients={clients} />

      {/* ── HISTORIQUE DU JOUR ───────────────────────────────────── */}
      <HistoriqueDuJour courses={courses} />

      {/* ── SYNCHRONISATION GPS ──────────────────────────────────── */}
      <div className="grid gap-4">
        <SyncClientGPSPanel />
        <SyncLivreurGPSPanel />
      </div>
    </div>
  );
}

function DiagnosticInterne() {
  const [courseId, setCourseId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleDiagnostic = async () => {
    if (!courseId.trim()) { toast.error("ID de course requis"); return; }
    setLoading(true);
    try {
      const response = await base44.functions.invoke("diagnosticLivraison", { course_id: courseId.trim() });
      setResult(response.data);
      if (response.data.success) toast.success("Diagnostic terminé ✅");
      else toast.error("Erreur: " + response.data.error);
    } catch (err) {
      toast.error("Erreur: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          placeholder="Collez l'ID de la course ici"
          className="flex-1 bg-gray-50 rounded-xl text-sm border-gray-200"
        />
        <Button
          size="sm"
          onClick={handleDiagnostic}
          disabled={loading || !courseId.trim()}
          className="rounded-xl flex-shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {result && (
        <div className="mt-2 space-y-2 text-xs">
          {result.success ? (
            <>
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 p-2.5 rounded-xl">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span className="font-semibold">Course trouvée</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Statut", value: result.diagnostics.statut },
                  { label: "Confirmé par", value: result.diagnostics.delivery_confirmed_by || "—" },
                  { label: "Token QR", value: result.diagnostics.delivery_qr_token ? "✅ Présent" : "❌ Manquant", ok: result.checks.delivery_token_exists },
                  { label: "Code 4 chiffres", value: result.diagnostics.delivery_code_4_digits || "❌ Manquant", ok: result.checks.delivery_code_exists },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 border border-gray-100 p-2.5 rounded-xl">
                    <p className="text-gray-400 mb-0.5">{item.label}</p>
                    <p className={`font-bold ${item.ok === false ? "text-red-600" : item.ok === true ? "text-green-600" : ""}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {result.recommendations?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-bold text-orange-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Problèmes détectés
                  </p>
                  {result.recommendations.map((rec, i) => (
                    <p key={i} className="text-orange-800 bg-orange-50 border border-orange-100 p-2 rounded-xl">{rec}</p>
                  ))}
                </div>
              )}

              {result.livreur_info && (
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl">
                  <p className="font-bold text-blue-900 mb-1">Livreur assigné</p>
                  <p className="text-blue-800">{result.livreur_info.nom} {result.livreur_info.prenom}</p>
                  <p className="text-blue-600 text-[10px] mt-0.5">{result.livreur_info.type_livreur} • {result.livreur_info.actif ? "Actif" : "Inactif"}</p>
                </div>
              )}

              {result.distance_calculated && (
                <div className="bg-purple-50 border border-purple-100 p-3 rounded-xl">
                  <p className="font-bold text-purple-900 mb-1">Distance calculée</p>
                  <p className="text-purple-800 font-black text-base">{result.distance_calculated.toFixed(2)} km</p>
                  <p className="text-purple-600 text-[10px] mt-0.5">Prix estimé : {Math.round(result.distance_calculated * 100)} FCFA</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-xl">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{result.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}