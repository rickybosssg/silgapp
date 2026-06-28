import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UtensilsCrossed, Pill, X, CheckCircle, XCircle, Loader2, Bell } from "lucide-react";
import PartenaireDetailDialog from "./PartenaireDetailDialog";

export default function DemandesPartenairesPopup() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("partenaire_demandes_dismissed") || "[]"); } catch { return []; }
  });
  const [selected, setSelected] = useState(null);

  // Fetch all partners en attente
  const { data: boutiquesAttente = [] } = useQuery({
    queryKey: ["partenaires-en-attente-boutiques"],
    queryFn: () => base44.entities.Boutique.filter({ validation: "en_attente" }, "-created_date", 50),
    refetchInterval: 30000,
  });
  const { data: restaurantsAttente = [] } = useQuery({
    queryKey: ["partenaires-en-attente-restaurants"],
    queryFn: () => base44.entities.Restaurant.filter({ validation: "en_attente" }, "-created_date", 50),
    refetchInterval: 30000,
  });
  const { data: pharmaciesAttente = [] } = useQuery({
    queryKey: ["partenaires-en-attente-pharmacies"],
    queryFn: () => base44.entities.Pharmacie.filter({ validation: "en_attente" }, "-created_date", 50),
    refetchInterval: 30000,
  });

  const allDemandes = [
    ...boutiquesAttente.map(b => ({ ...b, _type: "boutique" })),
    ...restaurantsAttente.map(r => ({ ...r, _type: "restaurant" })),
    ...pharmaciesAttente.map(p => ({ ...p, _type: "pharmacie" })),
  ].filter(d => !dismissed.includes(d.id));

  // Auto-open modal si nouvelles demandes
  useEffect(() => {
    if (allDemandes.length > 0 && !showModal) {
      // Vérifier si on a déjà montré ces demandes
      const shownIds = JSON.parse(localStorage.getItem("partenaire_demandes_shown") || "[]");
      const hasNew = allDemandes.some(d => !shownIds.includes(d.id));
      if (hasNew) {
        setShowModal(true);
        localStorage.setItem("partenaire_demandes_shown", JSON.stringify(allDemandes.map(d => d.id)));
      }
    }
  }, [allDemandes.length]);

  const handleDismiss = (id) => {
    const newDismissed = [...new Set([...dismissed, id])];
    setDismissed(newDismissed);
    localStorage.setItem("partenaire_demandes_dismissed", JSON.stringify(newDismissed));
  };

  const handleOpenDetail = (item) => {
    setSelected({ etablissement: item, type: item._type });
  };

  if (allDemandes.length === 0 && !showModal) return null;

  const typeIcon = (type) => type === "restaurant" ? UtensilsCrossed : type === "pharmacie" ? Pill : Store;
  const typeColor = (type) => type === "restaurant" ? "bg-orange-100 text-orange-600" : type === "pharmacie" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-600";
  const typeLabel = (type) => type === "restaurant" ? "Restaurant" : type === "pharmacie" ? "Pharmacie" : "Boutique";

  return (
    <>
      {/* Bouton flottant — point rouge si demandes en attente */}
      {allDemandes.length > 0 && !showModal && (
        <button
          onClick={() => setShowModal(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 shadow-xl shadow-purple-500/30 flex items-center justify-center transition-all hover:scale-105"
        >
          <Bell className="w-6 h-6 text-white" />
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {allDemandes.length}
          </span>
        </button>
      )}

      {/* Modal des demandes */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-violet-600 px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-white" />
                <div>
                  <h2 className="text-base font-black text-white">Demandes partenaires</h2>
                  <p className="text-xs text-white/70">{allDemandes.length} en attente de validation</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Liste */}
            <div className="p-4 space-y-3">
              {allDemandes.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Aucune demande en attente</p>
              ) : (
                allDemandes.map(item => {
                  const Icon = typeIcon(item._type);
                  return (
                    <div key={item.id} className="rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                      <div className={`w-11 h-11 rounded-xl ${typeColor(item._type)} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                        {item.logo_url ? <img src={item.logo_url} alt="" className="w-full h-full object-cover" /> : <Icon className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">{item.nom}</p>
                        <p className="text-xs text-gray-500">{typeLabel(item._type)} · {item.user_email || "—"}</p>
                        <p className="text-[10px] text-gray-400">{item.quartier || ""} {item.ville ? `· ${item.ville}` : ""} · {item.pays_code}</p>
                      </div>
                      <button
                        onClick={() => handleOpenDetail(item)}
                        className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex-shrink-0"
                      >
                        Examiner
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog détail */}
      <PartenaireDetailDialog
        open={!!selected}
        etablissement={selected?.etablissement}
        type={selected?.type}
        onClose={() => setSelected(null)}
      />
    </>
  );
}