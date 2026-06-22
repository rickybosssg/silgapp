import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Clock, Store, UtensilsCrossed, Wallet, Eye, X } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const STATUT_STYLE = {
  en_attente: { label: "En attente", color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
  confirme: { label: "Confirmé", color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
  refuse: { label: "Refusé", color: "text-red-500", bg: "bg-red-50", icon: XCircle },
};

export default function PaiementsPartenairesAdmin({ countryCode }) {
  const [filter, setFilter] = useState("en_attente");
  const [actionLoading, setActionLoading] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const queryClient = useQueryClient();

  const { data: paiements = [], isLoading } = useQuery({
    queryKey: ["paiements-partenaires-admin", countryCode, filter],
    queryFn: async () => {
      const query = {};
      if (countryCode) query.pays_code = countryCode;
      if (filter !== "all") query.statut = filter;
      const list = await base44.entities.PaiementPartenaire.filter(query, "-created_date", 200);
      return list || [];
    },
  });

  const handleAction = async (paiement, action) => {
    let motif_refus = "";
    if (action === "refuser") {
      motif_refus = prompt("Motif du refus ?") || "";
      if (!motif_refus) return;
    }
    setActionLoading(paiement.id);
    try {
      await base44.functions.invoke("validerPaiementPartenaire", {
        paiement_id: paiement.id,
        action,
        motif_refus,
      });
      queryClient.invalidateQueries({ queryKey: ["paiements-partenaires-admin"] });
      queryClient.invalidateQueries({ queryKey: ["comptabilite"] });
    } catch (err) {
      alert("Erreur: " + (err?.response?.data?.error || err?.message || "échec"));
    }
    setActionLoading(null);
  };

  const counts = {
    en_attente: paiements.filter(p => p.statut === "en_attente").length,
    confirme: paiements.filter(p => p.statut === "confirme").length,
    refuse: paiements.filter(p => p.statut === "refuse").length,
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-red-500" />
          Paiements Partenaires vers SILGAPP
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filtres */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {[
            { key: "en_attente", label: "En attente" },
            { key: "confirme", label: "Confirmés" },
            { key: "refuse", label: "Refusés" },
            { key: "all", label: "Tous" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={"px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap " + (filter === f.key ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500")}>
              {f.label} {f.key !== "all" && counts[f.key] > 0 && `(${counts[f.key]})`}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

        {!isLoading && paiements.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">Aucun paiement</p>
        )}

        <div className="space-y-2">
          {paiements.map(p => {
            const st = STATUT_STYLE[p.statut] || STATUT_STYLE.en_attente;
            const Icon = st.icon;
            return (
              <div key={p.id} className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.type === "restaurant"
                      ? <UtensilsCrossed className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      : <Store className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{p.etablissement_nom || "—"}</p>
                      <p className="text-[10px] text-gray-400">{format(new Date(p.created_date), 'dd MMM yyyy à HH:mm', { locale: fr })}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${st.bg} ${st.color} flex items-center gap-1 flex-shrink-0`}>
                    <Icon className="w-3 h-3" /> {st.label}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Montant</p>
                    <p className="font-black text-red-600 text-lg">{(p.montant || 0).toLocaleString('fr-FR')} FCFA</p>
                  </div>
                  {p.preuve_url && (
                    <button onClick={() => setPreviewUrl(p.preuve_url)} className="flex items-center gap-1 text-xs text-blue-600 font-semibold">
                      <Eye className="w-3.5 h-3.5" /> Voir preuve
                    </button>
                  )}
                </div>

                {p.statut === "refuse" && p.motif_refus && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">Motif: {p.motif_refus}</p>
                )}
                {p.statut === "confirme" && p.traite_par && (
                  <p className="text-[10px] text-gray-400">Confirmé par {p.traite_par} le {p.traite_at ? format(new Date(p.traite_at), 'dd MMM yyyy', { locale: fr }) : "—"}</p>
                )}

                {p.statut === "en_attente" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => handleAction(p, "confirmer")} disabled={actionLoading === p.id}
                      className="bg-green-600 hover:bg-green-700 text-xs flex-1">
                      {actionLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Confirmer
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleAction(p, "refuser")} disabled={actionLoading === p.id}
                      className="text-red-500 text-xs">
                      <XCircle className="w-3.5 h-3.5" /> Refuser
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Preview preuve */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-md w-full">
            <button onClick={() => setPreviewUrl(null)} className="absolute -top-10 right-0 text-white"><X className="w-6 h-6" /></button>
            <img src={previewUrl} alt="Preuve de dépôt" className="w-full rounded-xl" />
          </div>
        </div>
      )}
    </Card>
  );
}
