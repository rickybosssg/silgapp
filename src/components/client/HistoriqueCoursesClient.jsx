import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Package, Clock, Search,
  Star, ChevronRight, Truck, AlertTriangle
} from "lucide-react";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { getCourseStatusLabel, getCourseStatusColor } from "@/lib/courseStatuses";
import RefaireCourseButton from "./RefaireCourseButton";

const TYPE_COLIS_ICONS = {
  petit_colis: "",
  moyen_colis: "",
  gros_colis: "",
  document: "",
  nourriture: "",
  autre: "",
};

function CourseHistoriqueCard({ course, fraisAnnulation, onSelect, onRefaireCourse }) {
  const isTerminee = course.statut === "livree";
  const isAnnulee = course.statut === "annulee";
  const frais = fraisAnnulation?.find(f => f.course_id === course.id);

  return (
    <div className="w-full">
      <div
        onClick={() => onSelect(course.id)}
        className="w-full text-left active:scale-[0.99] transition-transform cursor-pointer"
      >
        <Card className={`p-4 border-2 transition-colors hover:border-primary/30 ${
          isTerminee ? "border-green-100" :
          isAnnulee ? "border-red-100" :
          "border-gray-100"
        }`}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xl flex-shrink-0">{TYPE_COLIS_ICONS[course.type_colis] || ""}</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-500 uppercase">
                  {course.type_course === "expedier" ? "Expédition" : course.type_course === "deplacement" ? "Déplacement" : "Réception"}
                </p>
                <p className="text-sm font-black text-gray-900 truncate">
                  {course.adresse_depart || "—"} → {course.adresse_arrivee || "—"}
                </p>
              </div>
            </div>
            <Badge className={`text-xs flex-shrink-0 ${getCourseStatusColor(course.statut)}`}>
              {getCourseStatusLabel(course.statut)}
            </Badge>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              {course.livreur_nom && (
                <span className="flex items-center gap-1">
                  <Truck className="w-3 h-3" />
                  {course.livreur_nom}
                </span>
              )}
              {course.created_date && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(course.created_date), "dd/MM HH:mm", { locale: fr })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isTerminee && (
                (() => {
                  const isPrixManuel = course.pricing_mode === "manual"
                    && course.manual_price_status === "accepted"
                    && course.manual_price > 0;
                  const prix = isPrixManuel
                    ? Number(course.manual_price)
                    : (course.prix_final || 0);
                  return prix > 0 ? (
                    <span className="font-bold text-green-700">
                      {prix.toLocaleString()} {course.devise || "F"}
                    </span>
                  ) : null;
                })()
              )}
              {isTerminee && course.note_livreur && (
                <span className="flex items-center gap-0.5 text-yellow-600 font-bold">
                  <Star className="w-3 h-3 fill-yellow-400" />
                  {course.note_livreur}/5
                </span>
              )}
              {frais && frais.statut_paiement === "impaye" && (
                <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  {frais.montant || 250} {course.devise || "F"} dû
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </div>
          </div>
        </Card>
      </div>
      {isTerminee && (
        <div className="mt-2">
          <RefaireCourseButton course={course} onNavigate={onRefaireCourse} />
        </div>
      )}
    </div>
  );
}

export default function HistoriqueCoursesClient({ courses = [], fraisAnnulation = [], onSelectCourse, clientProfil, position }) {
  const navigate = useNavigate();
  const [filtre, setFiltre] = useState("tout");
  const [periode, setPeriode] = useState("tout");
  const [recherche, setRecherche] = useState("");

  const handleRefaireCourse = (route, state) => {
    // Effacer le brouillon existant pour démarrer depuis les données pré-remplies
    try { localStorage.removeItem("silgapp_course_draft"); localStorage.removeItem("silgapp_course_step"); } catch {}
    navigate(route, { state });
  };

  // Filtrage par période
  const coursesPeriode = useMemo(() => {
    if (periode === "tout") return courses;
    return courses.filter(c => {
      const d = c.created_date ? new Date(c.created_date) : null;
      if (!d) return false;
      if (periode === "aujourdhui") return isToday(d);
      if (periode === "semaine") return isThisWeek(d, { weekStartsOn: 1 });
      if (periode === "mois") return isThisMonth(d);
      return true;
    });
  }, [courses, periode]);

  // Filtrage par statut + recherche texte
  const filtrees = useMemo(() => {
    let result = coursesPeriode.filter(c => {
      if (filtre === "livrees") return c.statut === "livree";
      if (filtre === "annulees") return c.statut === "annulee";
      if (filtre === "encours") return c.statut !== "livree" && c.statut !== "annulee";
      return true;
    });

    if (recherche.trim()) {
      const q = recherche.toLowerCase().trim();
      result = result.filter(c =>
        (c.destinataire_nom || "").toLowerCase().includes(q) ||
        (c.expediteur_nom || "").toLowerCase().includes(q) ||
        (c.adresse_depart || "").toLowerCase().includes(q) ||
        (c.adresse_arrivee || "").toLowerCase().includes(q) ||
        (c.quartier_depart || "").toLowerCase().includes(q) ||
        (c.quartier_arrivee || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [coursesPeriode, filtre, recherche]);

  // Compteurs
  const nbCreees = coursesPeriode.length;
  const nbLivrees = coursesPeriode.filter(c => c.statut === "livree").length;
  const nbAnnulees = coursesPeriode.filter(c => c.statut === "annulee").length;
  const nbEnRecherche = coursesPeriode.filter(c => c.statut === "recherche_livreur" || c.statut === "nouvelle" || c.statut === "en_attente").length;
  const nbEnCours = coursesPeriode.filter(c => c.statut !== "livree" && c.statut !== "annulee" && !["recherche_livreur", "nouvelle", "en_attente"].includes(c.statut)).length;
  const totalDepense = coursesPeriode
    .filter(c => c.statut === "livree")
    .reduce((s, c) => {
      // Prix manuel accepté = priorité absolue
      const isPrixManuel = c.pricing_mode === "manual"
        && c.manual_price_status === "accepted"
        && c.manual_price > 0;
      const prix = isPrixManuel ? Number(c.manual_price) : (c.prix_final || 0);
      return s + (prix > 0 ? prix : 0);
    }, 0);
  const noteMoyenne = coursesPeriode
    .filter(c => c.note_livreur)
    .reduce((acc, c, _, arr) => acc + c.note_livreur / arr.length, 0);

  if (courses.length === 0) {
    return (
      <div className="py-12 text-center space-y-3">
        <Package className="w-12 h-12 mx-auto text-gray-200" />
        <p className="text-sm text-gray-600">Aucune course dans l'historique</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats résumé */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-green-50 rounded-2xl p-3 text-center border border-green-100">
          <p className="text-xl font-black text-green-700">{nbLivrees}</p>
          <p className="text-[10px] text-green-600 font-semibold uppercase">Livrées</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-3 text-center border border-blue-100">
          <p className="text-xl font-black text-blue-700">
            {totalDepense > 0 ? `${(totalDepense / 1000).toFixed(0)}k` : "—"}
          </p>
          <p className="text-[10px] text-blue-600 font-semibold uppercase">Dépensés</p>
        </div>
        <div className="bg-yellow-50 rounded-2xl p-3 text-center border border-yellow-100">
          <p className="text-xl font-black text-yellow-700">
            {noteMoyenne > 0 ? noteMoyenne.toFixed(1) : "—"}
          </p>
          <p className="text-[10px] text-yellow-600 font-semibold uppercase">Note moy.</p>
        </div>
      </div>

      {/* Compteurs par statut */}
      <div className="grid grid-cols-4 gap-1.5">
        <div className="bg-gray-50 rounded-xl p-2 text-center">
          <p className="text-sm font-black text-gray-700">{nbCreees}</p>
          <p className="text-[9px] text-gray-500 font-semibold uppercase">Créées</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-2 text-center">
          <p className="text-sm font-black text-orange-700">{nbEnRecherche}</p>
          <p className="text-[9px] text-orange-600 font-semibold uppercase">Recherche</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-2 text-center">
          <p className="text-sm font-black text-blue-700">{nbEnCours}</p>
          <p className="text-[9px] text-blue-600 font-semibold uppercase">En cours</p>
        </div>
        <div className="bg-red-50 rounded-xl p-2 text-center">
          <p className="text-sm font-black text-red-700">{nbAnnulees}</p>
          <p className="text-[9px] text-red-600 font-semibold uppercase">Annulées</p>
        </div>
      </div>

      {/* Filtres période */}
      <div className="flex gap-2">
        {[
          { id: "tout", label: "Tout" },
          { id: "aujourdhui", label: "Aujourd'hui" },
          { id: "semaine", label: "Semaine" },
          { id: "mois", label: "Mois" },
        ].map(p => (
          <button
            key={p.id}
            onClick={() => setPeriode(p.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              periode === p.id
                ? "bg-primary text-white shadow"
                : "bg-white border border-gray-200 text-gray-600"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Recherche texte */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher par destinataire, adresse..."
          className="pl-9 h-10 text-sm"
        />
      </div>

      {/* Filtres statut */}
      <div className="flex gap-2">
        {[
          { id: "tout", label: `Tout (${nbCreees})` },
          { id: "encours", label: `En cours (${nbEnCours + nbEnRecherche})` },
          { id: "livrees", label: `Livrées (${nbLivrees})` },
          { id: "annulees", label: `Annulées (${nbAnnulees})` },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFiltre(f.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filtre === f.id
                ? "bg-primary text-white shadow"
                : "bg-white border border-gray-200 text-gray-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {filtrees.map(course => (
          <CourseHistoriqueCard
            key={course.id}
            course={course}
            fraisAnnulation={fraisAnnulation}
            onSelect={onSelectCourse}
            onRefaireCourse={handleRefaireCourse}
          />
        ))}
      </div>
    </div>
  );
}