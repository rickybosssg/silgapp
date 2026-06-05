import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Package, MapPin, Clock, CheckCircle2, XCircle,
  Star, ChevronRight, Truck, CreditCard, AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const STATUT_LABELS = {
  nouvelle: "Nouvelle",
  recherche_livreur: "Recherche livreur",
  livreur_en_route: "Livreur en route",
  colis_recupere: "Colis récupéré",
  en_livraison: "En livraison",
  livree: "Livrée ✓",
  annulee: "Annulée",
};

const STATUT_COLORS = {
  nouvelle: "bg-gray-100 text-gray-700",
  recherche_livreur: "bg-orange-100 text-orange-700",
  livreur_en_route: "bg-blue-100 text-blue-700",
  colis_recupere: "bg-purple-100 text-purple-700",
  en_livraison: "bg-blue-100 text-blue-700",
  livree: "bg-green-100 text-green-700",
  annulee: "bg-red-100 text-red-700",
};

const TYPE_COLIS_ICONS = {
  petit_colis: "📦",
  moyen_colis: "📫",
  gros_colis: "🗃️",
  document: "📄",
  nourriture: "🍔",
  autre: "🎁",
};

function CourseHistoriqueCard({ course, fraisAnnulation, onSelect }) {
  const isTerminee = course.statut === "livree";
  const isAnnulee = course.statut === "annulee";
  const frais = fraisAnnulation?.find(f => f.course_id === course.id);

  return (
    <button
      onClick={() => onSelect(course.id)}
      className="w-full text-left active:scale-[0.99] transition-transform"
    >
      <Card className={`p-4 border-2 transition-colors hover:border-primary/30 ${
        isTerminee ? "border-green-100" :
        isAnnulee ? "border-red-100" :
        "border-gray-100"
      }`}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xl flex-shrink-0">{TYPE_COLIS_ICONS[course.type_colis] || "📦"}</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-500 uppercase">
                {course.type_course === "expedier" ? "Expédition" : "Réception"}
              </p>
              <p className="text-sm font-black text-gray-900 truncate">
                {course.adresse_depart || "—"} → {course.adresse_arrivee || "—"}
              </p>
            </div>
          </div>
          <Badge className={`text-xs flex-shrink-0 ${STATUT_COLORS[course.statut]}`}>
            {STATUT_LABELS[course.statut]}
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
            {isTerminee && course.prix_final > 0 && (
              <span className="font-bold text-green-700">{course.prix_final.toLocaleString()} {course.devise || "F"}</span>
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
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </div>
        </div>
      </Card>
    </button>
  );
}

export default function HistoriqueCoursesClient({ courses = [], fraisAnnulation = [], onSelectCourse }) {
  const [filtre, setFiltre] = useState("tout");

  const filtrees = courses.filter(c => {
    if (filtre === "livrees") return c.statut === "livree";
    if (filtre === "annulees") return c.statut === "annulee";
    return true;
  });

  const nbLivrees = courses.filter(c => c.statut === "livree").length;
  const nbAnnulees = courses.filter(c => c.statut === "annulee").length;
  const totalDepense = courses
    .filter(c => c.statut === "livree" && c.prix_final > 0)
    .reduce((s, c) => s + c.prix_final, 0);
  const noteMoyenne = courses
    .filter(c => c.note_livreur)
    .reduce((acc, c, _, arr) => acc + c.note_livreur / arr.length, 0);

  if (courses.length === 0) {
    return (
      <div className="py-12 text-center space-y-3">
        <Package className="w-12 h-12 mx-auto text-gray-200" />
        <p className="text-sm text-gray-400">Aucune course dans l'historique</p>
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

      {/* Filtres */}
      <div className="flex gap-2">
        {[
          { id: "tout", label: `Tout (${courses.length})` },
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
          />
        ))}
      </div>
    </div>
  );
}