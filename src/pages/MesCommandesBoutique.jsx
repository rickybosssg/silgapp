import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Package, Store, UtensilsCrossed } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STATUTS = {
  commande_envoyee: { label: "Commande envoyee", color: "bg-gray-100 text-gray-700" },
  commande_recue: { label: "Recue par le partenaire", color: "bg-blue-100 text-blue-700" },
  paiement_verification: { label: "Paiement en verification", color: "bg-amber-100 text-amber-700" },
  paiement_valide: { label: "Paiement valide", color: "bg-green-100 text-green-700" },
  paiement_refuse: { label: "Paiement refuse", color: "bg-red-100 text-red-700" },
  en_preparation: { label: "En preparation", color: "bg-purple-100 text-purple-700" },
  prete_recuperation: { label: "Prete - livreur recherche", color: "bg-indigo-100 text-indigo-700" },
  livreur_assigne: { label: "Livreur assigne", color: "bg-blue-100 text-blue-700" },
  commande_recuperee: { label: "Commande recuperee", color: "bg-amber-100 text-amber-700" },
  en_livraison: { label: "En livraison", color: "bg-blue-100 text-blue-700" },
  livree: { label: "Livree", color: "bg-green-100 text-green-700" },
  annulee: { label: "Annulee", color: "bg-red-100 text-red-700" },
};

const STATUTS_SUIVI_ACTIF = new Set([
  "prete_recuperation",
  "livreur_assigne",
  "commande_recuperee",
  "en_livraison",
]);

export default function MesCommandesBoutique() {
  const navigate = useNavigate();
  const [clientProfil, setClientProfil] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (user?.email) {
        base44.entities.ClientExterne.filter({ user_email: user.email })
          .then(rows => setClientProfil(rows?.[0] || null))
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const { data: commandesBoutique = [], isLoading: loadingB } = useQuery({
    queryKey: ["mes-commandes-boutique", clientProfil?.id],
    queryFn: () => base44.entities.CommandeBoutique.filter({ client_id: clientProfil.id }, "-created_date", 50),
    enabled: !!clientProfil?.id,
    refetchInterval: 10000,
  });

  const { data: commandesRestaurant = [], isLoading: loadingR } = useQuery({
    queryKey: ["mes-commandes-restaurant", clientProfil?.id],
    queryFn: () => base44.entities.CommandeRestaurant.filter({ client_id: clientProfil.id }, "-created_date", 50),
    enabled: !!clientProfil?.id,
    refetchInterval: 10000,
  });

  if (!clientProfil || loadingB || loadingR) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const allCommandes = [
    ...commandesBoutique.map(c => ({ ...c, _type: "boutique", _icon: Store })),
    ...commandesRestaurant.map(c => ({ ...c, _type: "restaurant", _icon: UtensilsCrossed })),
  ].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-4 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-white/80 hover:text-white p-1">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-black">Mes Commandes</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {allCommandes.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Aucune commande pour le moment</p>
          </div>
        )}

        {allCommandes.map(cmd => {
          const statut = STATUTS[cmd.statut] || STATUTS.commande_envoyee;
          const Icon = cmd._icon;
          const items = (() => {
            try { return JSON.parse(cmd.items || "[]"); } catch { return []; }
          })();

          return (
            <div key={cmd.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cmd._type === "restaurant" ? "bg-orange-50" : "bg-blue-50"}`}>
                    <Icon className={`w-4 h-4 ${cmd._type === "restaurant" ? "text-orange-500" : "text-blue-500"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{cmd.boutique_nom || cmd.restaurant_nom}</p>
                    <p className="text-[10px] text-gray-400">{cmd._type === "restaurant" ? "Restaurant" : "Boutique"}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${statut.color}`}>{statut.label}</span>
              </div>

              <div className="text-xs text-gray-500">
                {items.map((item, index) => (
                  <div key={index} className="flex justify-between gap-3">
                    <span>{item.nom} x {item.quantite}</span>
                    <span>{((item.prix || 0) * (item.quantite || 1)).toLocaleString()} F</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-2 border-t">
                <span className="text-xs text-gray-500">Total</span>
                <span className="font-bold text-primary text-sm">{cmd.total?.toLocaleString()} FCFA</span>
              </div>

              {cmd.course_id && STATUTS_SUIVI_ACTIF.has(cmd.statut) && (
                <button
                  onClick={() => navigate("/client/suivi", { state: { course_id: cmd.course_id } })}
                  className="w-full text-xs font-bold text-primary underline mt-1"
                >
                  Suivre la livraison
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
