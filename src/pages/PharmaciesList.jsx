import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Loader2, MapPin, Pill } from "lucide-react";

export default function PharmaciesList() {
  const navigate = useNavigate();
  const [clientProfil, setClientProfil] = useState(null);

  useEffect(() => {
    base44.auth.me().then((user) => {
      if (!user?.email) return;
      base44.entities.ClientExterne.filter({ user_email: user.email })
        .then((clients) => setClientProfil(clients?.[0] || null))
        .catch(() => {});
    }).catch(() => {});
  }, []);

  const { data: pharmacies = [], isLoading } = useQuery({
    queryKey: ["pharmacies", clientProfil?.country_code],
    queryFn: () => base44.entities.Pharmacie.filter(
      { pays_code: clientProfil.country_code, actif: true },
      "-created_date",
      100
    ),
    enabled: !!clientProfil?.country_code,
    refetchInterval: 15000,
  });

  if (!clientProfil) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-[#071737] to-[#0B2A5B] text-white px-4 py-4 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-white/80 hover:text-white p-1"
            aria-label="Retour"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Pill className="w-5 h-5 text-cyan-100" />
          </div>
          <div>
            <h1 className="text-lg font-black">Pharmacies</h1>
            <p className="text-white/70 text-xs">Discutez avec vos pharmacies partenaires</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!isLoading && pharmacies.length === 0 && (
          <div className="text-center py-12">
            <Pill className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Aucune pharmacie disponible</p>
          </div>
        )}

        {pharmacies.map((pharmacie) => (
          <button
            key={pharmacie.id}
            onClick={() => navigate(`/client/pharmacies/${pharmacie.id}`)}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-all text-left"
          >
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {pharmacie.logo_url ? (
                <img src={pharmacie.logo_url} alt={pharmacie.nom} className="w-full h-full object-cover" />
              ) : (
                <Pill className="w-8 h-8 text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{pharmacie.nom}</p>
              <p className="text-xs text-gray-500 truncate">{pharmacie.description || "Pharmacie partenaire"}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <MapPin className="w-3 h-3" />
                  {pharmacie.quartier || pharmacie.ville || "Adresse disponible"}
                </span>
                {pharmacie.horaires && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Clock className="w-3 h-3" />
                    {pharmacie.horaires}
                  </span>
                )}
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${pharmacie.ouvert ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50"}`}>
              {pharmacie.ouvert ? "Ouvert" : "Ferme"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
