import React from "react";
import { AlertCircle } from "lucide-react";

/**
 * HeatmapLegend — Légende contextuelle pour les cartes thermiques
 * Affiche des informations détaillées selon le mode actif
 */
export default function HeatmapLegend({ mode, clients, livreurs, courses }) {
  if (mode === "off") return null;

  // Calcul des points
  const clientPoints = clients.filter(c => c.latitude && c.longitude).length;
  const coursePoints = courses.filter(c => c.gps_depart_lat && c.gps_depart_lng).length;
  const livreurDispo = livreurs.filter(l => l.latitude && l.longitude && l.statut === "disponible").length;
  const livreurCourse = livreurs.filter(l => l.latitude && l.longitude && l.statut === "en_course").length;

  if (mode === "demande") {
    const totalPoints = clientPoints + coursePoints;

    if (totalPoints < 3) {
      return (
        <div className="bg-yellow-50/95 backdrop-blur-sm border border-yellow-200 rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2 text-yellow-800">
            <AlertCircle className="w-4 h-4" />
            <p className="text-sm font-medium">Données insuffisantes</p>
          </div>
          <p className="text-xs text-yellow-700 mt-1">
            Minimum 3 points requis (actuellement {totalPoints})
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white/95 backdrop-blur-sm border border-red-200 rounded-lg shadow-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-red-800"> Demande clients</p>

        {/* Gradient */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 h-3 rounded overflow-hidden">
            <div className="flex-1 h-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-600" />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-green-700 font-medium">Faible</span>
            <span className="text-yellow-700 font-medium">Moyenne</span>
            <span className="text-red-700 font-medium">Forte</span>
          </div>
        </div>

        {/* Données */}
        <div className="pt-2 border-t border-red-100 space-y-1 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Clients GPS :</span>
            <span className="font-medium">{clientPoints}</span>
          </div>
          <div className="flex justify-between">
            <span>Courses récentes :</span>
            <span className="font-medium">{coursePoints}</span>
          </div>
          <div className="flex justify-between font-bold text-red-700">
            <span>Total :</span>
            <span>{totalPoints}</span>
          </div>
        </div>

        {/* Conseils */}
        <div className="pt-2 border-t border-red-100">
          <p className="text-xs font-semibold text-red-800 mb-1"> Analyse stratégique</p>
          <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
            <li>Zones rouges : forte concentration de clients</li>
            <li>Zones jaunes : demande modérée</li>
            <li>Zones vertes : demande faible</li>
          </ul>
        </div>
      </div>
    );
  }

  if (mode === "couverture") {
    const totalLivreurs = livreurDispo + livreurCourse;

    if (totalLivreurs < 3) {
      return (
        <div className="bg-yellow-50/95 backdrop-blur-sm border border-yellow-200 rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2 text-yellow-800">
            <AlertCircle className="w-4 h-4" />
            <p className="text-sm font-medium">Données insuffisantes</p>
          </div>
          <p className="text-xs text-yellow-700 mt-1">
            Minimum 3 livreurs requis (actuellement {totalLivreurs})
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white/95 backdrop-blur-sm border border-emerald-200 rounded-lg shadow-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-emerald-800"> Couverture livreurs</p>

        {/* Gradient */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 h-3 rounded overflow-hidden">
            <div className="flex-1 h-full bg-gradient-to-r from-red-500 via-yellow-400 to-emerald-600" />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-red-700 font-medium">Manque</span>
            <span className="text-yellow-700 font-medium">Moyenne</span>
            <span className="text-emerald-700 font-medium">Bonne</span>
          </div>
        </div>

        {/* Données */}
        <div className="pt-2 border-t border-emerald-100 space-y-1 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Disponibles :</span>
            <span className="font-medium">{livreurDispo}</span>
          </div>
          <div className="flex justify-between">
            <span>En course :</span>
            <span className="font-medium">{livreurCourse}</span>
          </div>
          <div className="flex justify-between font-bold text-emerald-700">
            <span>Total :</span>
            <span>{totalLivreurs}</span>
          </div>
        </div>

        {/* Conseils */}
        <div className="pt-2 border-t border-emerald-100">
          <p className="text-xs font-semibold text-emerald-800 mb-1"> Analyse stratégique</p>
          <ul className="text-xs text-emerald-700 space-y-0.5 list-disc list-inside">
            <li>Zones rouges : sous-couvertes (manque de livreurs)</li>
            <li>Zones jaunes : couverture modérée</li>
            <li>Zones vertes : bonne couverture</li>
          </ul>
        </div>
      </div>
    );
  }

  return null;
}