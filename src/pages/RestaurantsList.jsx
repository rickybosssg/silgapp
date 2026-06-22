import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { UtensilsCrossed, MapPin, ArrowLeft, Loader2 } from "lucide-react";

export default function RestaurantsList() {
  const navigate = useNavigate();
  const [clientProfil, setClientProfil] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      if (u?.email) {
        base44.entities.ClientExterne.filter({ user_email: u.email })
          .then(c => setClientProfil(c?.[0] || null))
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ["restaurants", clientProfil?.country_code],
    queryFn: () => base44.entities.Restaurant.filter({ pays_code: clientProfil.country_code, actif: true }, "-created_date", 100),
    enabled: !!clientProfil?.country_code,
  });

  if (!clientProfil) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white px-4 py-4 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-white/80 hover:text-white p-1"><ArrowLeft className="w-6 h-6" /></button>
          <div><h1 className="text-lg font-black">Restaurants</h1><p className="text-white/70 text-xs">Commandez chez nos restaurants partenaires</p></div>
        </div>
      </div>
      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
        {!isLoading && restaurants.length === 0 && <div className="text-center py-12"><UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-sm text-gray-500">Aucun restaurant disponible</p></div>}
        {restaurants.map(r => (
          <button key={r.id} onClick={() => navigate("/client/restaurants/" + r.id)} className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-all text-left">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {r.logo_url ? <img src={r.logo_url} alt={r.nom} className="w-full h-full object-cover" /> : <UtensilsCrossed className="w-8 h-8 text-orange-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{r.nom}</p>
              <p className="text-xs text-gray-500 truncate">{r.specialite || r.description || ""}</p>
              <span className="flex items-center gap-1 text-[10px] text-gray-400 mt-1"><MapPin className="w-3 h-3" /> {r.quartier || r.ville || ""}</span>
            </div>
            <span className={"text-[10px] font-bold px-2 py-1 rounded-full " + (r.ouvert ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50")}>{r.ouvert ? "Ouvert" : "Fermé"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
