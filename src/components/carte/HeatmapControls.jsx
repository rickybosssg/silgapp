import React from "react";
import { MapPin, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeatmapInsights from "./HeatmapInsights";

/**
 * HeatmapControls — Contrôles pour les cartes thermiques SILGAPP
 * Permet de basculer entre : Standard, Demande clients, Couverture livreurs
 */
export default function HeatmapControls({ mode, onModeChange, clients = [], livreurs = [], courses = [] }) {
  return (
    <div className="flex flex-col gap-2 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[200px]">
      <p className="text-xs font-semibold text-gray-700 px-1">Cartes thermiques</p>

      {/* Mode standard */}
      <Button
        size="sm"
        variant={mode === "off" ? "default" : "outline"}
        onClick={() => onModeChange("off")}
        className="text-xs justify-start"
      >
        <MapPin className="w-3 h-3 mr-1" /> Carte standard
      </Button>

      {/* Carte thermique Demande clients */}
      <Button
        size="sm"
        variant={mode === "demande" ? "default" : "outline"}
        onClick={() => onModeChange("demande")}
        className="text-xs justify-start bg-red-50 hover:bg-red-100 border-red-200 relative"
      >
        <TrendingUp className="w-3 h-3 mr-1" /> Demande clients
        <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full">NOUVEAU</span>
      </Button>

      {/* Carte thermique Couverture livreurs */}
      <Button
        size="sm"
        variant={mode === "couverture" ? "default" : "outline"}
        onClick={() => onModeChange("couverture")}
        className="text-xs justify-start bg-emerald-50 hover:bg-emerald-100 border-emerald-200 relative"
      >
        <Users className="w-3 h-3 mr-1" /> Couverture livreurs
        <span className="ml-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded-full">NOUVEAU</span>
      </Button>

      {/* Légende Demande clients */}
      {mode === "demande" && (
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
          <p className="text-xs font-semibold text-red-700"> Demande clients</p>
          <p className="text-xs text-gray-600 leading-tight">
            Basée sur les clients GPS actifs et les courses récentes
          </p>
          <div className="flex items-center gap-1 h-3 rounded overflow-hidden">
            <div className="flex-1 h-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-600" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span className="text-green-700 font-medium">Faible</span>
            <span className="text-yellow-700 font-medium">Moyenne</span>
            <span className="text-red-700 font-medium">Forte</span>
          </div>
          <div className="pt-2 border-t border-gray-100 space-y-1">
            <p className="text-xs text-gray-600"> Analyse :</p>
            <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside">
              <li>Zones rouges : forte concentration de clients</li>
              <li>Zones jaunes : demande modérée</li>
              <li>Zones vertes : demande faible</li>
            </ul>
          </div>
        </div>
      )}

      {/* Légende Couverture livreurs */}
      {mode === "couverture" && (
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
          <p className="text-xs font-semibold text-emerald-700"> Couverture livreurs</p>
          <p className="text-xs text-gray-600 leading-tight">
            Basée sur les livreurs disponibles et en course
          </p>
          <div className="flex items-center gap-1 h-3 rounded overflow-hidden">
            <div className="flex-1 h-full bg-gradient-to-r from-red-500 via-yellow-400 to-emerald-600" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span className="text-red-700 font-medium">Manque</span>
            <span className="text-yellow-700 font-medium">Moyenne</span>
            <span className="text-emerald-700 font-medium">Bonne</span>
          </div>
          <div className="pt-2 border-t border-gray-100 space-y-1">
            <p className="text-xs text-gray-600"> Analyse :</p>
            <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside">
              <li>Zones rouges : sous-couvertes (manque de livreurs)</li>
              <li>Zones jaunes : couverture modérée</li>
              <li>Zones vertes : bonne couverture</li>
            </ul>
          </div>
        </div>
      )}

      {/* Insights stratégiques */}
      {mode !== "off" && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <HeatmapInsights
            clients={clients}
            livreurs={livreurs}
            courses={courses}
            mode={mode}
          />
        </div>
      )}
    </div>
  );
}
