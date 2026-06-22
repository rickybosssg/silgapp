import React from "react";
import { Package, CheckCircle, AlertCircle } from "lucide-react";
import ColisDestinataireForm from "./ColisDestinataireForm";

const LETTER_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

/**
 * Étape multi-colis : affiche N formulaires de colis.
 * Remplace l'étape "destinataire" du formulaire simple quand nb_colis > 1.
 */
export default function MultiColisFormStep({
  colis, // array of colis objects
  onChange, // (index, field, value) => void
  clientId,
  countryCode,
  savedLat,
  savedLng,
}) {
  const totalColis = colis.length;
  const colisValides = colis.filter(c => !!c.destinataire_telephone).length;
  const tousValides = colisValides === totalColis;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-purple-100 to-purple-50 shadow-purple-200 shadow-lg flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8 text-purple-600" />
        </div>
        <h2 className="text-2xl font-black text-gray-900">Vos {totalColis} colis</h2>
        <p className="text-sm text-gray-500 mt-1.5">Renseignez les destinataires un par un</p>
      </div>

      {/* Progression */}
      <div className={`flex items-center gap-2 p-3 rounded-2xl border ${
        tousValides ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
      }`}>
        {tousValides
          ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          : <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
        <p className={`text-xs font-semibold ${tousValides ? "text-green-800" : "text-amber-700"}`}>
          {tousValides
            ? ` Tous les ${totalColis} colis sont renseignés`
            : `${colisValides} / ${totalColis} colis renseignés — téléphone requis pour chaque`}
        </p>
      </div>

      {/* Formulaires des colis */}
      <div className="space-y-3">
        {colis.map((colisItem, index) => (
          <ColisDestinataireForm
            key={index}
            index={index}
            colisData={colisItem}
            onChange={onChange}
            clientId={clientId}
            countryCode={countryCode}
            savedLat={savedLat}
            savedLng={savedLng}
          />
        ))}
      </div>
    </div>
  );
}
