import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  CreditCard, CheckCircle, Clock, User, Truck, 
  AlertTriangle, Ban, Search, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Input } from "@/components/ui/input";

export default function FraisAnnulationAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: frais = [], isLoading, refetch } = useQuery({
    queryKey: ["frais-annulation"],
    queryFn: () => base44.entities.FraisAnnulation.list("-created_date", 200),
    refetchInterval: 30000,
  });

  const marquerPayeMutation = useMutation({
    mutationFn: (id) =>
      base44.entities.FraisAnnulation.update(id, {
        statut_paiement: "paye",
        paye_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries(["frais-annulation"]);
      toast.success("Frais marqués comme payés");
    },
  });

  const bloquerClientMutation = useMutation({
    mutationFn: async ({ clientId, bloquer }) => {
      await base44.entities.ClientExterne.update(clientId, {
        bloque_frais_annulation: bloquer,
        actif: !bloquer,
      });
    },
    onSuccess: (_, { bloquer }) => {
      qc.invalidateQueries(["frais-annulation"]);
      toast.success(bloquer ? "Client bloqué" : "Client débloqué");
    },
  });

  const filtered = frais.filter((f) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (f.client_nom || "").toLowerCase().includes(s) ||
      (f.client_telephone || "").includes(s) ||
      (f.livreur_nom || "").toLowerCase().includes(s) ||
      (f.course_id || "").includes(s)
    );
  });

  const totalImpaye = frais.filter((f) => f.statut_paiement === "impaye").reduce((s, f) => s + (f.montant || 0), 0);
  const totalPaye = frais.filter((f) => f.statut_paiement === "paye").reduce((s, f) => s + (f.montant || 0), 0);

  return (
    <div className="p-4 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-orange-500" />
            Frais d'annulation clients
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Suivi des frais d'annulation après acceptation livreur</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Impayés</p>
            <p className="text-2xl font-black text-orange-700 mt-1">{totalImpaye} FCFA</p>
            <p className="text-xs text-orange-500">{frais.filter(f => f.statut_paiement === "impaye").length} dossier(s)</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Payés</p>
            <p className="text-2xl font-black text-green-700 mt-1">{totalPaye} FCFA</p>
            <p className="text-xs text-green-500">{frais.filter(f => f.statut_paiement === "paye").length} dossier(s)</p>
          </CardContent>
        </Card>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Rechercher par client, livreur, course..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 rounded-xl border-gray-200"
        />
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Aucun frais d'annulation</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <FraisCard
              key={f.id}
              frais={f}
              onPayer={() => marquerPayeMutation.mutate(f.id)}
              onBloquer={(bloquer) => bloquerClientMutation.mutate({ clientId: f.client_id, bloquer })}
              payerLoading={marquerPayeMutation.isPending}
              bloquerLoading={bloquerClientMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FraisCard({ frais, onPayer, onBloquer, payerLoading, bloquerLoading }) {
  const [clientInfo, setClientInfo] = React.useState(null);

  useEffect(() => {
    if (!frais.client_id) return;
    base44.entities.ClientExterne.filter({ id: frais.client_id })
      .then((r) => setClientInfo(r?.[0] || null))
      .catch(() => {});
  }, [frais.client_id]);

  const estPaye = frais.statut_paiement === "paye";
  const estBloque = clientInfo?.bloque_frais_annulation || false;

  return (
    <Card className={`border-2 ${estPaye ? "border-green-200" : "border-orange-200"}`}>
      <CardContent className="p-4 space-y-3">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={estPaye ? "bg-green-100 text-green-800 border-green-200" : "bg-orange-100 text-orange-800 border-orange-200"}>
                {estPaye ? <><CheckCircle className="w-3 h-3 mr-1" />Payé</> : <><Clock className="w-3 h-3 mr-1" />Impayé</>}
              </Badge>
              <span className="text-lg font-black text-gray-900">{frais.montant || 250} FCFA</span>
              {estBloque && (
                <Badge className="bg-red-100 text-red-800 border-red-200">
                  <Ban className="w-3 h-3 mr-1" /> Client bloqué
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">{frais.raison || "Annulation après acceptation livreur"}</p>
          </div>
          {frais.date_annulation && (
            <span className="text-xs text-gray-400 flex-shrink-0">
              {format(new Date(frais.date_annulation), "dd/MM/yyyy HH:mm", { locale: fr })}
            </span>
          )}
        </div>

        {/* Infos */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 truncate">{frais.client_nom || "—"}</p>
              <p className="text-xs text-gray-500">{frais.client_telephone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 truncate">{frais.livreur_nom || "—"}</p>
              <p className="text-xs text-gray-500 truncate">Livreur</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <span className="font-mono">Course : {(frais.course_id || "").substring(0, 16)}...</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {!estPaye && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white rounded-xl"
              onClick={onPayer}
              disabled={payerLoading}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Marquer Payé
            </Button>
          )}
          {!estBloque ? (
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50 rounded-xl"
              onClick={() => onBloquer(true)}
              disabled={bloquerLoading}
            >
              <Ban className="w-4 h-4 mr-1" /> Bloquer le client
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50 rounded-xl"
              onClick={() => onBloquer(false)}
              disabled={bloquerLoading}
            >
              <CheckCircle className="w-4 h-4 mr-1" /> Débloquer le client
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}