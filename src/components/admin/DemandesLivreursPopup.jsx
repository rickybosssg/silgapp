import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { X, User, Phone, MapPin, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function DemandesLivreursPopup() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  const { data: demandes } = useQuery({
    queryKey: ["demandes_livreurs_popup"],
    queryFn: () => base44.entities.Livreur.filter({ validation: "en_attente", type_livreur: "externe" }, "-created_date", 5),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  useEffect(() => {
    // Afficher automatiquement si des demandes sont en attente ET pas déjà vu cette session
    if (demandes && demandes.length > 0) {
      const dismissed = sessionStorage.getItem("silgapp_demandes_dismissed");
      if (!dismissed) {
        setVisible(true);
      }
    }
  }, [demandes]);

  if (!visible || !demandes || demandes.length === 0) return null;

  const latest = demandes[0];

  const handleDismiss = () => {
    sessionStorage.setItem("silgapp_demandes_dismissed", "1");
    setVisible(false);
  };

  const handleVoir = () => {
    sessionStorage.setItem("silgapp_demandes_dismissed", "1");
    setVisible(false);
    navigate("/admin/demandes-livreurs");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">

        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-red-600 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">

              </div>
              <div>
                <p className="text-white font-black text-lg">Demandes en attente</p>
                <p className="text-white/70 text-xs">{demandes.length} livreur{(demandes.length || 0) > 1 ? "s" : ""} à valider</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="text-white/60 hover:text-white" onClick={handleDismiss}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Dernier livreur */}
        <div className="p-5 space-y-4">
          <p className="text-sm font-bold text-gray-700">Dernière demande reçue</p>
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              {latest.photo_url ? (
                <img src={latest.photo_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
              )}
              <div>
                <p className="font-black text-gray-900">{latest.prenom || ""} {latest.nom}</p>
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                  <Phone className="w-3 h-3" /> {latest.telephone || "N/A"}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="w-3 h-3" /> {latest.country_code || "BF"} · {latest.ville || "N/A"}
                </div>
              </div>
              <div className="ml-auto text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {(() => {
                  const d = new Date(latest.created_date);
                  const now = new Date();
                  const diffH = Math.round((now - d) / (1000 * 60 * 60));
                  return diffH <= 1 ? "Il y a < 1h" : `Il y a ${diffH}h`;
                })()}
              </div>
            </div>
          </div>

          {demandes.length > 1 && (
            <p className="text-xs text-gray-500 text-center">
              + {demandes.length - 1} autre{(demandes.length - 1) > 1 ? "s" : ""} demande{(demandes.length - 1) > 1 ? "s" : ""} en attente
            </p>
          )}

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Button
              className="h-12 rounded-xl bg-gradient-to-r from-primary to-red-700 text-white font-bold shadow-md"
              onClick={handleVoir}>
              Voir le dossier
            </Button>
            <Button
              className="h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold shadow-sm"
              onClick={handleVoir}>
              Valider
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-xl text-gray-600 font-semibold"
              onClick={handleDismiss}>
              Plus tard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
