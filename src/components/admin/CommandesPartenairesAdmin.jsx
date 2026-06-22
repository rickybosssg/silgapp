import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, UtensilsCrossed, Phone, MapPin, Loader2 } from "lucide-react";

const STATUTS = {
  commande_envoyee: { label: "Reçue", color: "bg-blue-50 text-blue-600" },
  paiement_verification: { label: "Paiement à vérifier", color: "bg-amber-50 text-amber-600" },
  paiement_valide: { label: "Paiement validé", color: "bg-green-50 text-green-600" },
  paiement_refuse: { label: "Paiement refusé", color: "bg-red-50 text-red-600" },
  en_preparation: { label: "En préparation", color: "bg-orange-50 text-orange-600" },
  prete_recuperation: { label: "Prête — livraison", color: "bg-purple-50 text-purple-600" },
  livreur_assigne: { label: "Livreur assigné", color: "bg-indigo-50 text-indigo-600" },
  en_livraison: { label: "En livraison", color: "bg-indigo-50 text-indigo-600" },
  livree: { label: "Livrée", color: "bg-green-50 text-green-600" },
  annulee: { label: "Annulée", color: "bg-red-50 text-red-600" },
};

export default function CommandesPartenairesAdmin({ countryCode }) {
  const [filter, setFilter] = useState("all");

  const { data: commandesBoutique = [], isLoading: loadingB } = useQuery({
    queryKey: ["admin-commandes-boutique", countryCode],
    queryFn: () => base44.entities.CommandeBoutique.filter(countryCode ? { pays_code: countryCode } : {}, "-created_date", 500),
  });

  const { data: commandesRestaurant = [], isLoading: loadingR } = useQuery({
    queryKey: ["admin-commandes-restaurant", countryCode],
    queryFn: () => base44.entities.CommandeRestaurant.filter(countryCode ? { pays_code: countryCode } : {}, "-created_date", 500),
  });

  const allCommandes = useMemo(() => [
    ...commandesBoutique.map(c => ({ ...c, _type: "boutique" })),
    ...commandesRestaurant.map(c => ({ ...c, _type: "restaurant" })),
  ].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)), [commandesBoutique, commandesRestaurant]);

  const counts = allCommandes.reduce((acc, c) => { acc[c.statut] = (acc[c.statut] || 0) + 1; return acc; }, {});
  const filtered = filter === "all" ? allCommandes : allCommandes.filter(c => c.statut === filter);

  if (loadingB || loadingR) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Store className="w-4 h-4 text-purple-500" />
          Commandes Boutiques & Restaurants ({allCommandes.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filtres */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button onClick={() => setFilter("all")} className={"px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap " + (filter === "all" ? "bg-purple-600 text-white" : "bg-white text-gray-500 border border-gray-200")}>
            Toutes ({allCommandes.length})
          </button>
          {Object.entries(STATUTS).map(([key, s]) => counts[key] ? (
            <button key={key} onClick={() => setFilter(key)} className={"px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap " + (filter === key ? "bg-purple-600 text-white" : "bg-white text-gray-500 border border-gray-200")}>
              {s.label} ({counts[key]})
            </button>
          ) : null)}
        </div>

        {/* Liste */}
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-4">Aucune commande</p>}
          {filtered.map(cmd => {
            const s = STATUTS[cmd.statut] || STATUTS.commande_envoyee;
            const items = (() => { try { return JSON.parse(cmd.items || "[]"); } catch { return []; } })();
            const Icon = cmd._type === "restaurant" ? UtensilsCrossed : Store;
            return (
              <div key={cmd.id} className="bg-white rounded-xl border border-gray-100 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={"w-7 h-7 rounded-lg flex items-center justify-center " + (cmd._type === "restaurant" ? "bg-orange-50" : "bg-blue-50")}>
                      <Icon className={"w-3.5 h-3.5 " + (cmd._type === "restaurant" ? "text-orange-500" : "text-blue-500")} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-xs">{cmd.boutique_nom || cmd.restaurant_nom || "—"}</p>
                      <p className="text-[10px] text-gray-400">#{cmd.id?.slice(-6)} · {cmd._type}</p>
                    </div>
                  </div>
                  <span className={"text-[10px] font-bold px-2 py-1 rounded-full " + s.color}>{s.label}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> {cmd.client_telephone || "—"}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> {cmd.adresse_livraison || cmd.quartier_livraison || "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">{items.length} article(s)</span>
                  <span className="font-bold text-primary">{(cmd.total || 0).toLocaleString()} FCFA</span>
                </div>
                {cmd.course_id && (
                  <p className="text-[10px] text-indigo-500 font-bold"> Course #{cmd.course_id.slice(-6)}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
