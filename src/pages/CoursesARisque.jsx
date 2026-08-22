import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, ShieldAlert, ShieldCheck, ShieldX,
  RefreshCw, Phone, MapPin, User, Bike, Clock, ChevronRight, Activity
} from "lucide-react";

const NIVEAU_CONFIG = {
  critique: {
    label: "Critique",
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    dot: "bg-red-500",
    icon: ShieldAlert,
  },
  a_surveiller: {
    label: "À surveiller",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-500",
    icon: AlertTriangle,
  },
};

const STATUT_LABELS = {
  nouvelle: "Nouvelle",
  en_attente: "En attente",
  programmee: "Programmée",
  recherche_livreur: "Recherche livreur",
  livreur_en_route: "Livreur en route",
  client_contacte: "Client contacté",
  en_route_expediteur: "En route expéditeur",
  arrive_prise_en_charge: "Arrivé prise en charge",
  colis_recupere: "Colis récupéré",
  pris_en_charge: "Pris en charge",
  en_livraison: "En livraison",
  arrivee: "Arrivé",
  livree: "Livrée",
  annulee: "Annulée",
};

export default function CoursesARisque() {
  const [filterNiveau, setFilterNiveau] = useState("all");
  const [filterCountry, setFilterCountry] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["courses-a-risque"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getCoursesARisque", {});
      return res;
    },
    refetchInterval: 30000,
  });

  const courses = data?.courses || [];
  const stats = data?.stats || { sauvees: 0, echecs: 0, detectees: 0 };

  const filteredCourses = courses.filter((c) => {
    if (filterNiveau !== "all" && c.niveau !== filterNiveau) return false;
    if (filterCountry !== "all" && c.country_code !== filterCountry) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.client_nom?.toLowerCase().includes(q) && !c.course_id?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const critiqueCount = courses.filter((c) => c.niveau === "critique").length;
  const surveillerCount = courses.filter((c) => c.niveau === "a_surveiller").length;
  const countryCodes = [...new Set(courses.map((c) => c.country_code).filter(Boolean))];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link to="/admin/externe">
              <Button variant="ghost" size="sm" className="text-gray-600">
                ← Retour
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                Courses à sauver
              </h1>
              <p className="text-[11px] text-gray-500">
                Détection proactive des courses à risque d'échec
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-2">
          <KpiCard
            label="Critiques"
            value={critiqueCount}
            icon={ShieldAlert}
            color="text-red-600"
            bg="bg-red-50"
            border="border-red-100"
          />
          <KpiCard
            label="À surveiller"
            value={surveillerCount}
            icon={AlertTriangle}
            color="text-amber-600"
            bg="bg-amber-50"
            border="border-amber-100"
          />
          <KpiCard
            label="Sauvées (jour)"
            value={stats.sauvees}
            icon={ShieldCheck}
            color="text-emerald-600"
            bg="bg-emerald-50"
            border="border-emerald-100"
          />
          <KpiCard
            label="Échecs (jour)"
            value={stats.echecs}
            icon={ShieldX}
            color="text-gray-600"
            bg="bg-gray-50"
            border="border-gray-100"
          />
        </div>

        {/* Taux de sauvetage */}
        {stats.detectees > 0 && (
          <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-semibold text-blue-700">
              Taux de sauvetage: {Math.round((stats.sauvees / stats.detectees) * 100)}% ({stats.sauvees}/{stats.detectees} courses à risque sauvées aujourd'hui)
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterNiveau("all")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              filterNiveau === "all" ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600"
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setFilterNiveau("critique")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              filterNiveau === "critique" ? "bg-red-500 text-white" : "bg-white border border-gray-200 text-red-600"
            }`}
          >
            Critiques
          </button>
          <button
            onClick={() => setFilterNiveau("a_surveiller")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              filterNiveau === "a_surveiller" ? "bg-amber-500 text-white" : "bg-white border border-gray-200 text-amber-600"
            }`}
          >
            À surveiller
          </button>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="ml-auto px-2 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-gray-200 text-gray-600"
          >
            <option value="all">Tous pays</option>
            {countryCodes.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par client ou ID..."
          className="h-9 text-xs"
        />
      </div>

      {/* Course list */}
      <div className="px-4 pb-8 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            <span className="ml-2 text-sm text-gray-500">Détection en cours...</span>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldCheck className="w-12 h-12 text-emerald-300 mb-2" />
            <p className="text-sm font-semibold text-gray-700">Aucune course à risque</p>
            <p className="text-xs text-gray-400 mt-1">Toutes les courses actives sont dans un état normal</p>
          </div>
        ) : (
          filteredCourses.map((course) => (
            <CourseRiskCard key={course.course_id} course={course} />
          ))
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, bg, border }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl ${bg} ${border} border py-2 px-1`}>
      <Icon className={`w-4 h-4 ${color} mb-0.5`} />
      <span className={`text-lg font-black ${color}`}>{value}</span>
      <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function CourseRiskCard({ course }) {
  const config = NIVEAU_CONFIG[course.niveau] || NIVEAU_CONFIG.a_surveiller;
  const Icon = config.icon;

  return (
    <Card className={`overflow-hidden ${config.border} ${config.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${config.dot}`} />
          <span className="text-xs font-bold text-gray-900">#{course.course_id.slice(-6)}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${config.bg} ${config.color}`}>
            {config.label}
          </span>
          <span className="text-[10px] text-gray-400">Score: {course.risk_score}</span>
        </div>
        <div className="flex items-center gap-1">
          {course.country_code && (
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {course.country_code}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Course info */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-gray-600">
            <User className="w-3 h-3 text-gray-400" />
            <span className="truncate">{course.client_nom || "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-600">
            <Bike className="w-3 h-3 text-gray-400" />
            <span className="truncate">{course.livreur_nom || "Aucun livreur"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Clock className="w-3 h-3 text-gray-400" />
            <span>{STATUT_LABELS[course.statut] || course.statut}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <MapPin className="w-3 h-3 text-gray-400" />
            <span className="truncate">{course.adresse_depart || "—"}</span>
          </div>
        </div>

        {/* Risks */}
        <div className="space-y-1">
          {course.risques.map((risque, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px]">
              <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                risque.type.startsWith("R8") || risque.type.startsWith("R9") ? "bg-red-500" : "bg-amber-500"
              }`} />
              <span className="text-gray-700">
                <span className="font-semibold">{risque.label}</span>
                <span className="text-gray-400 ml-1">— {risque.description}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Action recommandée */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/60 border border-gray-100">
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-600">
            Action recommandée: <span className="text-gray-900">{course.action_recommandee}</span>
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 pt-1">
          <Link to="/courses" className="flex-1">
            <Button variant="outline" size="sm" className="w-full h-8 text-[11px] gap-1">
              <MapPin className="w-3 h-3" />
              Ouvrir
            </Button>
          </Link>
          {course.livreur_id && (
            <Link to="/livreurs" className="flex-1">
              <Button variant="outline" size="sm" className="w-full h-8 text-[11px] gap-1">
                <Bike className="w-3 h-3" />
                Livreur
              </Button>
            </Link>
          )}
          {course.client_telephone && (
            <a href={`tel:${course.client_telephone}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full h-8 text-[11px] gap-1">
                <Phone className="w-3 h-3" />
                Client
              </Button>
            </a>
          )}
          {course.livreur_telephone && (
            <a href={`tel:${course.livreur_telephone}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full h-8 text-[11px] gap-1">
                <Phone className="w-3 h-3" />
                Livreur
              </Button>
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}