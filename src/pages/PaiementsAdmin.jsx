import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Clock, Image as ImageIcon, Phone, X, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const USER_TYPE_LABEL = {
  client: "Client",
  livreur: "Livreur",
  boutique: "Boutique",
  restaurant: "Restaurant",
};

const USER_TYPE_COLOR = {
  client: "bg-blue-100 text-blue-700",
  livreur: "bg-purple-100 text-purple-700",
  boutique: "bg-amber-100 text-amber-700",
  restaurant: "bg-red-100 text-red-700",
};

const FILTRES = [
  { id: "en_attente", label: "En attente" },
  { id: "traite", label: "Traités" },
  { id: "tous", label: "Tous" },
];

function PaiementCard({ paiement, onTraiter, onRefuser, isPending }) {
  const [showProof, setShowProof] = useState(false);
  const isPendingPayment = paiement.statut === "en_attente";

  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm ${isPendingPayment ? "border-orange-200" : "border-slate-100"}`}>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${USER_TYPE_COLOR[paiement.user_type] || "bg-slate-100 text-slate-700"}`}>
            {USER_TYPE_LABEL[paiement.user_type] || paiement.user_type}
          </span>
          {isPendingPayment ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" /> En attente
            </span>
          ) : paiement.statut === "traite" ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Traité
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Refusé
            </span>
          )}
        </div>
        {paiement.date_envoi && (
          <span className="text-[11px] text-slate-400 whitespace-nowrap">{format(new Date(paiement.date_envoi), "dd/MM/yyyy 'à' HH:mm", { locale: fr })}</span>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
          {(paiement.user_nom || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 truncate">{paiement.user_nom || "Inconnu"}</p>
          {paiement.user_telephone && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Phone className="w-3 h-3" /> {paiement.user_telephone}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-slate-400">Montant dû</p>
          <p className="font-bold text-slate-800">{(paiement.montant_du || 0).toLocaleString()} F</p>
        </div>
        <div className="bg-green-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-slate-400">Montant payé</p>
          <p className="font-bold text-green-700">{(paiement.montant_paye || 0).toLocaleString()} F</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
        <span>Dépôt : <strong className="text-slate-700">{paiement.numero_depot || "+226 66 92 51 90"}</strong></span>
      </div>

      {paiement.preuve_url && (
        <button onClick={() => setShowProof(true)} className="w-full mb-3">
          <img src={paiement.preuve_url} alt="Preuve" className="w-full rounded-xl max-h-40 object-cover" />
        </button>
      )}

      {isPendingPayment && (
        <div className="flex gap-2">
          <Button className="flex-1 bg-green-600 hover:bg-green-700 rounded-xl" disabled={isPending} onClick={() => onTraiter(paiement)}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Traiter
          </Button>
          <Button variant="destructive" className="flex-1 rounded-xl" disabled={isPending} onClick={() => onRefuser(paiement)}>
            <XCircle className="w-4 h-4 mr-1" /> Refuser
          </Button>
        </div>
      )}

      {showProof && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowProof(false)}>
          <div className="relative max-w-md w-full">
            <button onClick={() => setShowProof(false)} className="absolute -top-10 right-0 text-white">
              <X className="w-6 h-6" />
            </button>
            <img src={paiement.preuve_url} alt="Preuve" className="w-full rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaiementsAdmin() {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState("en_attente");

  const { data: paiements = [], isLoading } = useQuery({
    queryKey: ["paiements-silgapp"],
    queryFn: () => base44.entities.PaiementSilgapp.list("-date_envoi", 200),
    initialData: [],
    refetchInterval: 10000,
  });

  const filtered = useMemo(() => {
    if (filtre === "tous") return paiements;
    return paiements.filter((p) => p.statut === filtre);
  }, [paiements, filtre]);

  const nbEnAttente = paiements.filter((p) => p.statut === "en_attente").length;
  const totalEnAttente = paiements.filter((p) => p.statut === "en_attente").reduce((s, p) => s + (p.montant_paye || 0), 0);

  const traiterMutation = useMutation({
    mutationFn: ({ id, action }) => base44.functions.invoke("traiterPaiementSilgapp", { payment_id: id, action }),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["paiements-silgapp"] });
      toast.success(action === "refuser" ? "Paiement refusé" : "Paiement traité - régularisation appliquée");
    },
    onError: (e) => toast.error("Erreur : " + (e.message || "échec")),
  });

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="sm" className="rounded-2xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-black text-slate-900">Paiements SILGAPP</h1>
          <p className="text-xs text-slate-500">Preuves de dépôt reçues</p>
        </div>
      </div>

      {nbEnAttente > 0 && (
        <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 rounded-2xl p-4 text-white flex items-center justify-between shadow-lg shadow-blue-100">
          <div>
            <p className="text-xs opacity-80">En attente de traitement</p>
            <p className="text-3xl font-black">
              {nbEnAttente}<span className="text-sm font-normal ml-2">paiement{nbEnAttente > 1 ? "s" : ""}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-80">Total</p>
            <p className="text-2xl font-black">
              {totalEnAttente.toLocaleString()}<span className="text-sm font-normal ml-1">F</span>
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {FILTRES.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltre(f.id)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
              filtre === f.id ? "bg-blue-700 text-white" : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {f.label}
            {f.id === "en_attente" && nbEnAttente > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{nbEnAttente}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-slate-400 text-sm">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucun paiement</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <PaiementCard
              key={p.id}
              paiement={p}
              onTraiter={(payment) => traiterMutation.mutate({ id: payment.id, action: "traiter" })}
              onRefuser={(payment) => traiterMutation.mutate({ id: payment.id, action: "refuser" })}
              isPending={traiterMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
