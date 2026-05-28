import React from "react";
import { CheckCircle2, Banknote, MapPin, Clock, Ruler } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function LivreurRecapitulatifPaiement({ course }) {
  // Calcul du montant : distance réelle × 100 FCFA
  const distance = course.distance_reelle_km || 0;
  const montantTotal = Math.round(distance * 100);
  const commissionSilga = Math.round(montantTotal * 0.3);
  const montantLivreur = montantTotal - commissionSilga;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <Card className="w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-white" />
            <div>
              <p className="text-white font-black text-lg">Livraison terminée !</p>
              <p className="text-green-100 text-xs">Course #{course.id?.slice(-6).toUpperCase()}</p>
            </div>
          </div>
        </div>

        {/* Résumé */}
        <div className="p-6 space-y-4 bg-white">
          {/* Distance et durée */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <Ruler className="w-5 h-5 mx-auto mb-1 text-blue-600" />
              <p className="text-lg font-black text-blue-700">{Number(distance).toFixed(2)} km</p>
              <p className="text-[10px] text-blue-400 font-bold uppercase">Distance</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-purple-600" />
              <p className="text-lg font-black text-purple-700">
                {course.heure_livraison && course.heure_recuperation
                  ? Math.round((new Date(course.heure_livraison) - new Date(course.heure_recuperation)) / 60000)
                  : "--"} min
              </p>
              <p className="text-[10px] text-purple-400 font-bold uppercase">Durée</p>
            </div>
          </div>

          {/* Trajet */}
          <div className="space-y-2 bg-gray-50 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-[9px] text-gray-400 font-bold uppercase">Départ</p>
                <p className="text-xs font-semibold text-gray-700 truncate">{course.adresse_depart}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-accent mt-0.5" />
              <div className="flex-1">
                <p className="text-[9px] text-gray-400 font-bold uppercase">Arrivée</p>
                <p className="text-xs font-semibold text-gray-700 truncate">{course.adresse_arrivee}</p>
              </div>
            </div>
          </div>

          {/* Paiement */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 space-y-3 border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="w-5 h-5 text-green-600" />
              <p className="text-green-900 font-black">Récapitulatif financier</p>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Distance parcourue</span>
                <span className="font-bold text-gray-900">{distance.toFixed(2)} km</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tarif au km</span>
                <span className="font-bold text-gray-900">100 FCFA/km</span>
              </div>
              <div className="border-t border-green-300 pt-2 flex justify-between">
                <span className="font-bold text-green-900">Total à payer</span>
                <span className="font-black text-lg text-green-700">{montantTotal.toLocaleString()} FCFA</span>
              </div>
            </div>
          </div>

          {/* Montant à payer au livreur */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-4 text-center shadow-lg">
            <p className="text-green-100 text-xs font-bold uppercase mb-1">Total à payer au livreur</p>
            <p className="text-3xl font-black text-white">{montantLivreur.toLocaleString()} FCFA</p>
          </div>

          <div className="text-center">
            <p className="text-[10px] text-gray-400">
              Commission Silga (30%) : {commissionSilga.toLocaleString()} FCFA
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}