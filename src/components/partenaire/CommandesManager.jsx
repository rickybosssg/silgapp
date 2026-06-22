import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, MapPin, Phone, CheckCircle, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUTS = {
  commande_envoyee: { label: "Commande reçue", color: "bg-blue-50 text-blue-600", icon: Clock },
  commande_recue: { label: "Commande reçue", color: "bg-blue-50 text-blue-600", icon: Clock },
  paiement_verification: { label: "Paiement à vérifier", color: "bg-amber-50 text-amber-600", icon: Clock },
  paiement_valide: { label: "Paiement validé", color: "bg-green-50 text-green-600", icon: CheckCircle },
  paiement_refuse: { label: "Paiement refusé", color: "bg-red-50 text-red-600", icon: X },
  en_preparation: { label: "En préparation", color: "bg-orange-50 text-orange-600", icon: Clock },
  prete_recuperation: { label: "Prête — déclencher livraison", color: "bg-purple-50 text-purple-600", icon: Package },
  livreur_assigne: { label: "Livreur assigné", color: "bg-indigo-50 text-indigo-600", icon: Package },
  en_livraison: { label: "En livraison", color: "bg-indigo-50 text-indigo-600", icon: Package },
  livree: { label: "Livrée", color: "bg-green-50 text-green-600", icon: CheckCircle },
  annulee: { label: "Annulée", color: "bg-red-50 text-red-600", icon: X },
};

export default function CommandesManager({ type, etablissementId }) {
  const isRestaurant = type === "restaurant";
  const entityName = isRestaurant ? "CommandeRestaurant" : "CommandeBoutique";
  const idField = isRestaurant ? "restaurant_id" : "boutique_id";
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState(null);

  const { data: commandes = [], isLoading } = useQuery({
    queryKey: ["commandes", type, etablissementId],
    queryFn: () => base44.entities[entityName].filter({ [idField]: etablissementId }, "-created_date", 100),
  });

  const handleAction = async (commande, action) => {
    setActionLoading(commande.id);
    try {
      await base44.functions.invoke("changerStatutCommande", { commande_id: commande.id, type, action });
      queryClient.invalidateQueries({ queryKey: ["commandes", type, etablissementId] });
    } catch (err) {
      alert("Erreur: " + (err?.message || "échec"));
    }
    setActionLoading(null);
  };

  const filtered = filter === "all" ? commandes : commandes.filter(c => c.statut === filter);
  const counts = commandes.reduce((acc, c) => { acc[c.statut] = (acc[c.statut] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-gray-900 text-sm">Commandes reçues</h2>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setFilter("all")} className={"px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap " + (filter === "all" ? "bg-purple-600 text-white" : "bg-white text-gray-500 border border-gray-200")}>
          Toutes ({commandes.length})
        </button>
        {Object.entries(STATUTS).map(([key, s]) => counts[key] ? (
          <button key={key} onClick={() => setFilter(key)} className={"px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap " + (filter === key ? "bg-purple-600 text-white" : "bg-white text-gray-500 border border-gray-200")}>
            {s.label} ({counts[key]})
          </button>
        ) : null)}
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-8"><Package className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">Aucune commande</p></div>
      )}

      <div className="space-y-2">
        {filtered.map(cmd => {
          const s = STATUTS[cmd.statut] || STATUTS.commande_envoyee;
          const items = (() => { try { return JSON.parse(cmd.items || "[]"); } catch { return []; } })();
          return (
            <div key={cmd.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">#{(cmd.id || "").slice(-6)}</span>
                <span className={"text-[10px] font-bold px-2 py-1 rounded-full " + s.color}>{s.label}</span>
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{cmd.client_nom || "Client"}</p>
                <div className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" /> {cmd.client_telephone || "—"}</div>
                <div className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="w-3 h-3" /> {cmd.adresse_livraison || cmd.quartier_livraison || "—"}</div>
              </div>
              <div className="text-xs text-gray-600 space-y-0.5">
                {items.map((it, i) => (
                  <div key={i} className="flex justify-between"><span>{it.nom} × {it.quantite}</span><span>{((it.prix || 0) * (it.quantite || 1)).toLocaleString()} F</span></div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-sm pt-1 border-t"><span>Total</span><span className="text-primary">{(cmd.total || 0).toLocaleString()} FCFA</span></div>

              {cmd.preuve_paiement_url && (
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">Preuve de paiement:</p>
                  <img src={cmd.preuve_paiement_url} alt="Preuve" className="w-full rounded-xl max-h-40 object-cover" />
                </div>
              )}

              {cmd.note_client && <p className="text-xs text-gray-500 italic">📝 {cmd.note_client}</p>}

              <div className="flex gap-2 pt-1">
                {cmd.statut === "commande_envoyee" && (
                  <Button size="sm" onClick={() => handleAction(cmd, "verifier_paiement")} disabled={actionLoading === cmd.id} className="bg-amber-500 hover:bg-amber-600 text-xs">
                    {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Vérifier paiement
                  </Button>
                )}
                {cmd.statut === "paiement_verification" && (
                  <>
                    <Button size="sm" onClick={() => handleAction(cmd, "valider_paiement")} disabled={actionLoading === cmd.id} className="bg-green-600 hover:bg-green-700 text-xs">
                      {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Valider
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleAction(cmd, "refuser_paiement")} disabled={actionLoading === cmd.id} className="text-red-500 text-xs">Refuser</Button>
                  </>
                )}
                {cmd.statut === "paiement_valide" && (
                  <Button size="sm" onClick={() => handleAction(cmd, "commencer_preparation")} disabled={actionLoading === cmd.id} className="bg-orange-500 hover:bg-orange-600 text-xs">
                    {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Commencer préparation
                  </Button>
                )}
                {cmd.statut === "en_preparation" && (
                  <Button size="sm" onClick={() => handleAction(cmd, "prete_recuperation")} disabled={actionLoading === cmd.id} className="bg-purple-600 hover:bg-purple-700 text-xs">
                    {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} 🚀 Prête — déclencher livraison
                  </Button>
                )}
                {cmd.statut === "prete_recuperation" && (
                  <p className="text-xs text-purple-600 font-bold">⏳ Recherche livreur en cours...</p>
                )}
                {cmd.statut === "livreur_assigne" && (
                  <p className="text-xs text-indigo-600 font-bold">🚚 Livreur assigné — course #{(cmd.course_id || "").slice(-6)}</p>
                )}
                {cmd.statut === "en_livraison" && (
                  <p className="text-xs text-indigo-600 font-bold">🚚 En livraison</p>
                )}
                {cmd.statut === "livree" && (
                  <p className="text-xs text-green-600 font-bold">✅ Livrée</p>
                )}
                {!["livree", "annulee", "prete_recuperation", "livreur_assigne", "en_livraison"].includes(cmd.statut) && (
                  <Button size="sm" variant="outline" onClick={() => { if (confirm("Annuler cette commande ?")) handleAction(cmd, "annuler"); }} disabled={actionLoading === cmd.id} className="text-red-500 text-xs ml-auto">Annuler</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}