import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, MapPin, Phone, CheckCircle, Clock, X, Truck, ChefHat, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUTS = {
  commande_envoyee: { label: "Reçue", color: "bg-blue-50 text-blue-600", border: "border-l-blue-500", icon: Clock },
  commande_recue: { label: "Reçue", color: "bg-blue-50 text-blue-600", border: "border-l-blue-500", icon: Clock },
  paiement_verification: { label: "Paiement à vérifier", color: "bg-amber-50 text-amber-600", border: "border-l-amber-500", icon: Clock },
  paiement_valide: { label: "Paiement validé", color: "bg-green-50 text-green-600", border: "border-l-green-500", icon: CheckCircle },
  paiement_refuse: { label: "Paiement refusé", color: "bg-red-50 text-red-600", border: "border-l-red-500", icon: X },
  en_preparation: { label: "En préparation", color: "bg-orange-50 text-orange-600", border: "border-l-orange-500", icon: ChefHat },
  prete_recuperation: { label: "Prête — livraison", color: "bg-purple-50 text-purple-600", border: "border-l-purple-500", icon: Package },
  livreur_assigne: { label: "Livreur assigné", color: "bg-indigo-50 text-indigo-600", border: "border-l-indigo-500", icon: Truck },
  en_livraison: { label: "En livraison", color: "bg-indigo-50 text-indigo-600", border: "border-l-indigo-500", icon: Truck },
  livree: { label: "Livrée", color: "bg-green-50 text-green-600", border: "border-l-green-500", icon: CheckCircle },
  annulee: { label: "Annulée", color: "bg-red-50 text-red-600", border: "border-l-red-500", icon: X },
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

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

  const activeFilters = [
    { key: "all", label: "Toutes", count: commandes.length },
    { key: "commande_envoyee", label: "Reçues", count: counts.commande_envoyee || 0 },
    { key: "paiement_verification", label: "À vérifier", count: counts.paiement_verification || 0 },
    { key: "en_preparation", label: "En préparation", count: counts.en_preparation || 0 },
    { key: "prete_recuperation", label: "Prêtes", count: counts.prete_recuperation || 0 },
    { key: "en_livraison", label: "En livraison", count: (counts.en_livraison || 0) + (counts.livreur_assigne || 0) },
    { key: "livree", label: "Livrées", count: counts.livree || 0 },
  ].filter(f => f.count > 0 || f.key === "all");

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-gray-900 text-base px-1">Commandes reçues</h2>

      {/* Filtres */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {activeFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={"px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all " + (filter === f.key ? "bg-purple-600 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200")}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /></div>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Aucune commande</p>
        </div>
      )}

      {/* Liste des commandes */}
      <div className="space-y-3">
        {filtered.map(cmd => {
          const s = STATUTS[cmd.statut] || STATUTS.commande_envoyee;
          const items = (() => { try { return JSON.parse(cmd.items || "[]"); } catch { return []; } })();
          const itemCount = items.reduce((sum, it) => sum + (it.quantite || 1), 0);
          return (
            <div key={cmd.id} className={"bg-white rounded-2xl border border-gray-100 shadow-sm border-l-4 " + s.border + " overflow-hidden"}>
              {/* Header */}
              <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={"w-8 h-8 rounded-lg flex items-center justify-center " + s.color}>
                    <s.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400">#{(cmd.id || "").slice(-6)}</p>
                    <p className="text-[10px] text-gray-400">{timeAgo(cmd.created_date)}</p>
                  </div>
                </div>
                <span className={"text-[10px] font-bold px-2.5 py-1 rounded-full " + s.color}>{s.label}</span>
              </div>

              {/* Client info */}
              <div className="px-4 pb-2 space-y-1">
                <p className="font-bold text-gray-900 text-sm">{cmd.client_nom || "Client"}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {cmd.client_telephone || "—"}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {(cmd.adresse_livraison || cmd.quartier_livraison || "—").substring(0, 30)}</span>
                </div>
              </div>

              {/* Items */}
              <div className="px-4 pb-2 bg-gray-50/50 mx-4 rounded-xl p-2.5 space-y-1">
                {items.map((it, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-600">{it.nom} × {it.quantite}</span>
                    <span className="font-semibold text-gray-700">{((it.prix || 0) * (it.quantite || 1)).toLocaleString()} F</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="px-4 py-2 flex justify-between items-center">
                <span className="text-xs text-gray-400">{itemCount} article(s)</span>
                <span className="font-black text-primary text-base">{(cmd.total || 0).toLocaleString()} FCFA</span>
              </div>

              {/* Preuve de paiement */}
              {cmd.preuve_paiement_url && (
                <div className="px-4 pb-2">
                  <p className="text-[10px] text-gray-400 mb-1 font-medium">Preuve de paiement:</p>
                  <img src={cmd.preuve_paiement_url} alt="Preuve" className="w-full rounded-xl max-h-40 object-cover border border-gray-100" />
                </div>
              )}

              {cmd.note_client && (
                <div className="px-4 pb-2 text-xs text-gray-500 italic bg-amber-50/50 mx-4 rounded-lg p-2"> {cmd.note_client}</div>
              )}

              {/* Actions */}
              <div className="px-4 pb-3 pt-1 flex gap-2 flex-wrap">
                {cmd.statut === "commande_envoyee" && (
                  <Button size="sm" onClick={() => handleAction(cmd, "verifier_paiement")} disabled={actionLoading === cmd.id} className="bg-amber-500 hover:bg-amber-600 text-xs h-9">
                    {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />} Vérifier paiement
                  </Button>
                )}
                {cmd.statut === "paiement_verification" && (
                  <>
                    <Button size="sm" onClick={() => handleAction(cmd, "valider_paiement")} disabled={actionLoading === cmd.id} className="bg-green-600 hover:bg-green-700 text-xs h-9">
                      {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Valider
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleAction(cmd, "refuser_paiement")} disabled={actionLoading === cmd.id} className="text-red-500 border-red-200 text-xs h-9">
                      <X className="w-3 h-3" /> Refuser
                    </Button>
                  </>
                )}
                {cmd.statut === "paiement_valide" && (
                  <Button size="sm" onClick={() => handleAction(cmd, "commencer_preparation")} disabled={actionLoading === cmd.id} className="bg-orange-500 hover:bg-orange-600 text-xs h-9">
                    {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChefHat className="w-3 h-3" />} Commencer préparation
                  </Button>
                )}
                {cmd.statut === "en_preparation" && (
                  <Button size="sm" onClick={() => handleAction(cmd, "prete_recuperation")} disabled={actionLoading === cmd.id} className="bg-purple-600 hover:bg-purple-700 text-xs h-9">
                    {actionLoading === cmd.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />} Prête — déclencher livraison
                  </Button>
                )}
                {cmd.statut === "prete_recuperation" && (
                  <p className="text-xs text-purple-600 font-bold flex items-center gap-1 py-1"><Loader2 className="w-3 h-3 animate-spin" /> Recherche livreur en cours...</p>
                )}
                {cmd.statut === "livreur_assigne" && (
                  <p className="text-xs text-indigo-600 font-bold flex items-center gap-1 py-1"><Truck className="w-3 h-3" /> Livreur assigné — course #{(cmd.course_id || "").slice(-6)}</p>
                )}
                {cmd.statut === "en_livraison" && (
                  <p className="text-xs text-indigo-600 font-bold flex items-center gap-1 py-1"><Truck className="w-3 h-3" /> En livraison</p>
                )}
                {cmd.statut === "livree" && (
                  <p className="text-xs text-green-600 font-bold flex items-center gap-1 py-1"><CheckCircle className="w-3 h-3" /> Livrée</p>
                )}
                {!["livree", "annulee", "prete_recuperation", "livreur_assigne", "en_livraison"].includes(cmd.statut) && (
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Annuler cette commande ?")) handleAction(cmd, "annuler"); }} disabled={actionLoading === cmd.id} className="text-red-500 text-xs h-9 ml-auto">Annuler</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
