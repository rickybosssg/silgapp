import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, MapPin, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CourseStatusBadge from "@/components/courses/CourseStatusBadge";
import CanalNotifBadge from "@/components/courses/CanalNotifBadge";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import MultiColisProgressBadge from "@/components/multi-colis/MultiColisProgressBadge";

const STATUT_FILTRES = [
  { key: "tous",        label: "Toutes" },
  { key: "nouvelle",    label: "Nouvelles" },
  { key: "en_cours",    label: "En cours" },
  { key: "livree",      label: "Livrées" },
  { key: "annulee",     label: "Annulées" },
];

export default function ToutesCoursesExternes() {
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : selectedCountry;
  const [filtreActif, setFiltreActif] = useState("tous");

  const [filtreType, setFiltreType] = useState("tous");

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes", effectiveCountry],
    queryFn: () => effectiveCountry
      ? base44.entities.CourseExterne.filter({ country_code: effectiveCountry }, "-created_date", 200)
      : Promise.resolve([]),
    initialData: [],
    refetchInterval: effectiveCountry ? 10000 : false,
    enabled: !!effectiveCountry,
  });

  const stats = useMemo(() => ({
    totale:   courses.length,
    nouvelle: courses.filter(c => c.statut === "nouvelle").length,
    enCours:  courses.filter(c => ["recherche_livreur", "livreur_en_route", "colis_recupere", "en_livraison", "arrive_prise_en_charge", "passager_embarque"].includes(c.statut)).length,
    livree:   courses.filter(c => c.statut === "livree").length,
    annulee:  courses.filter(c => c.statut === "annulee").length,
  }), [courses]);

  const coursesFiltrees = useMemo(() => {
    let filtered = courses;
    if (filtreType !== "tous") {
      filtered = filtered.filter(c => c.type_course === filtreType);
    }
    if (filtreActif === "tous")     return filtered;
    if (filtreActif === "nouvelle") return filtered.filter(c => c.statut === "nouvelle");
    if (filtreActif === "en_cours") return filtered.filter(c => ["recherche_livreur", "livreur_en_route", "colis_recupere", "en_livraison", "arrive_prise_en_charge", "passager_embarque"].includes(c.statut));
    if (filtreActif === "livree")   return filtered.filter(c => c.statut === "livree");
    if (filtreActif === "annulee")  return filtered.filter(c => c.statut === "annulee");
    return filtered;
  }, [courses, filtreActif, filtreType]);

  return (
    <div className="p-4 space-y-5 max-w-5xl mx-auto">

      {/* ── HERO HEADER ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-red-600 to-rose-600 p-5 shadow-xl shadow-red-200">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center gap-3">
          <Link to={isPays ? "/" : "/admin/global"}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-white hover:bg-white/20 border border-white/30">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{isPays ? "Retour" : "Admin Global"}</span>
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-xl flex-shrink-0">
              📦
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Courses Externes</h1>
              <p className="text-white/65 text-xs mt-0.5">
                {stats.totale} courses {effectiveCountry ? `· pays ${effectiveCountry}` : "· tous pays"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── STATS KPI ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {[
          { label: "Total",     value: stats.totale,   grad: "from-primary to-red-600",         shadow: "shadow-red-100" },
          { label: "Nouvelles", value: stats.nouvelle, grad: "from-orange-500 to-amber-500",    shadow: "shadow-orange-100" },
          { label: "En cours",  value: stats.enCours,  grad: "from-blue-500 to-indigo-500",     shadow: "shadow-blue-100" },
          { label: "Livrées",   value: stats.livree,   grad: "from-green-500 to-emerald-500",   shadow: "shadow-green-100" },
          { label: "Annulées",  value: stats.annulee,  grad: "from-red-400 to-rose-500",        shadow: "shadow-red-100" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-2xl p-3.5 text-white shadow-md ${s.shadow}`}>
            <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide mb-1">{s.label}</p>
            <p className="text-2xl font-black leading-none">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── FILTRES ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Filtre par type de course */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 uppercase self-center mr-1">Type:</span>
          {[
            { key: "tous", label: "Tous" },
            { key: "expedier", label: "📦 Expédition" },
            { key: "recevoir", label: "📥 Réception" },
            { key: "deplacement", label: "👤 Déplacement" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltreType(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                filtreType === f.key
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-white text-slate-600 border-gray-200 hover:border-sky-400 hover:text-sky-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Filtre par statut */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 uppercase self-center mr-1">Statut:</span>
          {STATUT_FILTRES.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltreActif(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                filtreActif === f.key
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-600 border-gray-200 hover:border-primary/40 hover:text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── LISTE DES COURSES ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-sm">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-foreground">Historique complet</p>
              <p className="text-xs text-muted-foreground">{coursesFiltrees.length} résultat{coursesFiltrees.length > 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {coursesFiltrees.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-2xl">📦</div>
            <p className="font-semibold text-sm">Aucune course dans cette catégorie</p>
          </div>
        ) : (
          <div className="space-y-2">
            {coursesFiltrees.map(course => (
              <div
                key={course.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
              >
                {/* Icône statut */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base ${
                  course.statut === "livree"   ? "bg-green-100" :
                  course.statut === "annulee"  ? "bg-red-100" :
                  course.statut === "nouvelle" ? "bg-orange-100" :
                  "bg-blue-100"
                }`}>
                  {course.statut === "livree"   ? "✅" :
                   course.statut === "annulee"  ? "❌" :
                   course.statut === "nouvelle" ? "🆕" : "🚀"}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    {course.type_course && course.type_course !== "expedier" && (
                      <span className="text-[10px] font-bold bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">
                        {course.type_course === "deplacement" ? "👤" : "📥"}
                      </span>
                    )}
                    <span className="font-bold text-sm text-foreground truncate">{course.client_nom || "Client"}</span>
                    <CourseStatusBadge statut={course.statut} />
                    {course.livreur_id && <CanalNotifBadge course={course} />}
                    <MultiColisProgressBadge
                      nbColis={course.nb_colis || 1}
                      nbLivres={course.nb_colis_livres || 0}
                      nbAnnules={course.nb_colis_annules || 0}
                      size="sm"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{course.adresse_depart} → {course.adresse_arrivee || "?"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                    <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                    <span>{format(new Date(course.created_date), "dd/MM/yyyy · HH:mm", { locale: fr })}</span>
                    {course.livreur_nom && <><span>·</span><span>👤 {course.livreur_nom}</span></>}
                    {course.country_code && <span className="ml-1 text-[9px] font-bold bg-gray-200 text-gray-500 rounded px-1">{course.country_code}</span>}
                  </div>
                </div>

                {/* Prix */}
                <div className="flex-shrink-0 text-right ml-2">
                  {course.prix_final ? (
                    <span className="font-black text-sm text-green-600">{course.prix_final.toLocaleString()} F</span>
                  ) : course.prix_estimate ? (
                    <span className="text-xs text-muted-foreground">~{course.prix_estimate.toLocaleString()} F</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  {course.distance_reelle_km && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{Number(course.distance_reelle_km).toFixed(1)} km</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}