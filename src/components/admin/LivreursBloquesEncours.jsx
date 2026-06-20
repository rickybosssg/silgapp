import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Unlock, RotateCcw, Loader2, Phone, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import CountrySelector from "@/components/international/CountrySelector";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function LivreursBloquesEncours({ countryCode }) {
  const queryClient = useQueryClient();
  const { isPays, countryCode: adminCountryCode, selectedCountry, setSelectedCountry } = useAdminContext();
  const effectiveCountry = countryCode || (isPays ? adminCountryCode : selectedCountry) || "";
  const [reductionMap, setReductionMap] = useState({}); // { livreurId: montant }
  const [modeReduction, setModeReduction] = useState({}); // { livreurId: "reset" | "partiel" }
  const [confirmId, setConfirmId] = useState(null);

  const { data: bloquesData, isLoading } = useQuery({
    queryKey: ["livreurs-bloques-encours", effectiveCountry],
    queryFn: async () => {
      if (!effectiveCountry) return [];
      const res = await base44.functions.invoke("verifierEncoursLivreur", {
        action: "get_livreurs_bloques",
        country_code: effectiveCountry,
      });
      return res.data?.bloques || [];
    },
    initialData: [],
    enabled: !!effectiveCountry,
    refetchInterval: 30000,
  });

  const debloquerMutation = useMutation({
    mutationFn: async ({ livreurId, reset, reduction }) => {
      const res = await base44.functions.invoke("verifierEncoursLivreur", {
        action: "debloquer",
        livreur_id: livreurId,
        reset_complet: reset,
        reduction: reduction || undefined,
        commentaire: reset ? "Déblocage complet" : `Réduction de ${reduction}`,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs-bloques-encours"] });
      setConfirmId(null);
      setModeReduction({});
      setReductionMap({});
      toast.success("Livreur débloqué ");
    },
    onError: () => toast.error("Erreur lors du déblocage"),
  });

  const handleDebloquer = (livreur, mode = "reset") => {
    const reduction = mode === "partiel" ? (reductionMap[livreur.id] || 0) : undefined;
    debloquerMutation.mutate({
      livreurId: livreur.id,
      reset: mode === "reset",
      reduction,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!effectiveCountry) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-lg text-foreground">Livreurs bloqués</h2>
            <p className="text-xs text-muted-foreground">Sélectionnez un pays pour respecter l'isolation des données.</p>
          </div>
          <CountrySelector value={selectedCountry || ""} onChange={setSelectedCountry} className="w-48" />
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-800 font-semibold">
          Aucun pays sélectionné.
        </div>
      </div>
    );
  }

  if (bloquesData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-3">
          <ShieldAlert className="w-8 h-8 text-green-400" />
        </div>
        <p className="font-bold text-foreground">Aucun livreur bloqué</p>
        <p className="text-xs text-muted-foreground mt-1">Tous les livreurs sont dans les limites d'encours autorisées</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <h2 className="font-black text-lg text-foreground">Livreurs bloqués ({bloquesData.length}) · {effectiveCountry}</h2>
        </div>
        {!countryCode && !isPays && (
          <CountrySelector value={effectiveCountry} onChange={setSelectedCountry} className="w-48" />
        )}
      </div>

      <div className="space-y-3">
        {bloquesData.map((l) => {
          const mode = modeReduction[l.id] || "reset";
          const isConfirming = confirmId === l.id;
          const pourcentageColor = l.pourcentage >= 150 ? "text-red-600 bg-red-50" : "text-orange-600 bg-orange-50";

          return (
            <div key={l.id} className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-red-50 to-orange-50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-500">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-black text-foreground">{l.nom}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{l.telephone || "—"}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{l.country_code}</span>
                    </div>
                  </div>
                </div>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${pourcentageColor}`}>
                  {l.pourcentage}%
                </span>
              </div>

              {/* Stats */}
              <div className="px-4 py-3 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Encours</p>
                  <p className="text-sm font-black text-red-600">{l.encours.toLocaleString()} {l.devise}</p>
                </div>
                <div className="text-center border-x border-gray-100">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Plafond</p>
                  <p className="text-sm font-black text-gray-800">{l.seuil.toLocaleString()} {l.devise}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold">Blocage</p>
                  <p className="text-xs font-semibold text-gray-600 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(l.bloque_at)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 pb-3">
                {!isConfirming ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-xl border-gray-200 text-xs font-semibold"
                      onClick={() => {
                        setConfirmId(l.id);
                        setModeReduction(prev => ({ ...prev, [l.id]: "reset" }));
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Remise à zéro
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-xl border-gray-200 text-xs font-semibold"
                      onClick={() => {
                        setConfirmId(l.id);
                        setModeReduction(prev => ({ ...prev, [l.id]: "partiel" }));
                      }}
                    >
                      Réduction partielle
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mode === "partiel" && (
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
                          Montant à réduire ({l.devise})
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={l.encours}
                          placeholder="Ex: 2000"
                          value={reductionMap[l.id] || ""}
                          onChange={(e) => setReductionMap(prev => ({ ...prev, [l.id]: Number(e.target.value) }))}
                          className="rounded-xl text-sm h-9"
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-xl border-gray-200 text-xs"
                        onClick={() => { setConfirmId(null); setReductionMap(prev => ({ ...prev, [l.id]: 0 })); }}
                      >
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDebloquer(l, mode)}
                        disabled={debloquerMutation.isPending || (mode === "partiel" && (!reductionMap[l.id] || reductionMap[l.id] <= 0))}
                        className="flex-1 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white text-xs font-bold gap-1.5"
                      >
                        {debloquerMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                        Confirmer déblocage
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
