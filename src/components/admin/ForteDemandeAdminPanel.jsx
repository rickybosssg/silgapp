import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ToggleLeft, ToggleRight, Loader2, Flame, Activity } from "lucide-react";
import { toast } from "sonner";
import { invalidateCountryCache } from "@/lib/countryService";

/**
 * ForteDemandeAdminPanel — Panneau admin pour configurer le mode Forte Demande par pays.
 *
 * Permet de régler :
 *   - Activation ON/OFF
 *   - Seuil d'activation (défaut 5)
 *   - Seuil de retour (défaut 3)
 *   - Titre et message personnalisables
 *
 * Affiche en temps réel :
 *   - Le nombre de courses actives actuellement
 *   - L'état (DEMANDE NORMALE / FORTE DEMANDE ACTIVE)
 *
 * Tout est modifiable sans rebuild APK — stocké sur l'entité Country.
 */
export default function ForteDemandeAdminPanel({ country }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    setForm({
      forte_demande_client_actif: country?.forte_demande_client_actif || false,
      forte_demande_seuil_activation: country?.forte_demande_seuil_activation ?? 5,
      forte_demande_seuil_retour: country?.forte_demande_seuil_retour ?? 3,
      forte_demande_titre: country?.forte_demande_titre || "🔥 FORTE DEMANDE EN COURS",
      forte_demande_message: country?.forte_demande_message || "Plusieurs commandes sont en cours. Proposez un prix attractif pour augmenter vos chances de trouver rapidement un livreur.",
    });
  }, [country?.id]);

  // ── Compteur temps réel : courses actives pour ce pays ──
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["forte-demande-status", country?.code],
    queryFn: () => base44.functions.invoke("getForteDemandeStatus", { country_code: country?.code }),
    enabled: !!country?.code,
    refetchInterval: 15000, // 15s — temps réel admin
  });

  const status = statusData?.data || statusData;
  const activeCount = status?.active_count ?? 0;
  const isForteDemande = !!status?.forte_demande;

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Country.update(country.id, data);
    },
    onSuccess: () => {
      invalidateCountryCache();
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      queryClient.invalidateQueries({ queryKey: ["forte-demande-status", country?.code] });
      setEditing(false);
      toast.success("Configuration Forte Demande mise à jour ");
    },
    onError: () => toast.error("Erreur de mise à jour"),
  });

  const toggleMutation = useMutation({
    mutationFn: (actif) => base44.entities.Country.update(country.id, { forte_demande_client_actif: actif }),
    onSuccess: (_, actif) => {
      invalidateCountryCache();
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      queryClient.invalidateQueries({ queryKey: ["forte-demande-status", country?.code] });
      toast.success(actif ? "Forte Demande activée " : "Forte Demande désactivée");
    },
  });

  if (!country) return null;

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-300";

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-red-500" />
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Forte Demande Clients</p>
      </div>

      {/* ── Compteur temps réel ── */}
      <div className={`rounded-xl p-3 mb-3 ${isForteDemande ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${isForteDemande ? "text-red-500" : "text-green-500"}`} />
            <span className="text-xs font-bold text-gray-700">Courses actives actuellement :</span>
            {statusLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
            ) : (
              <span className={`text-sm font-black ${isForteDemande ? "text-red-600" : "text-green-600"}`}>{activeCount}</span>
            )}
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isForteDemande ? "bg-red-500 text-white" : "bg-green-500 text-white"}`}>
            {isForteDemande ? "🔴 FORTE DEMANDE ACTIVE" : "🟢 DEMANDE NORMALE"}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5">
          Seuil activation : {country.forte_demande_seuil_activation ?? 5} · Seuil retour : {country.forte_demande_seuil_retour ?? 3}
        </p>
      </div>

      {/* ── Toggle ON/OFF ── */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-600">Activation</span>
        <button
          onClick={() => toggleMutation.mutate(!country.forte_demande_client_actif)}
          disabled={toggleMutation.isPending}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all hover:opacity-80"
        >
          {country.forte_demande_client_actif
            ? <><ToggleRight className="w-4 h-4 text-green-500" /><span className="text-green-600">ON</span></>
            : <><ToggleLeft className="w-4 h-4 text-gray-400" /><span className="text-gray-500">OFF</span></>
          }
        </button>
      </div>

      {/* ── Formulaire d'édition ── */}
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Seuil activation</label>
              <input
                type="number"
                className={inputClass}
                value={form.forte_demande_seuil_activation}
                onChange={e => setForm(prev => ({ ...prev, forte_demande_seuil_activation: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Seuil retour</label>
              <input
                type="number"
                className={inputClass}
                value={form.forte_demande_seuil_retour}
                onChange={e => setForm(prev => ({ ...prev, forte_demande_seuil_retour: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Titre</label>
            <input
              className={inputClass}
              value={form.forte_demande_titre}
              onChange={e => setForm(prev => ({ ...prev, forte_demande_titre: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Message</label>
            <textarea
              className={inputClass + " min-h-[60px] resize-none"}
              value={form.forte_demande_message}
              onChange={e => setForm(prev => ({ ...prev, forte_demande_message: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(false)}>Annuler</Button>
            <Button
              size="sm"
              onClick={() => updateMutation.mutate(form)}
              disabled={updateMutation.isPending}
              className="gap-1.5 rounded-xl bg-gradient-to-r from-red-500 to-orange-500"
            >
              {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5" />}
              Sauvegarder
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] bg-red-50 text-red-700 rounded-full px-2 py-0.5 font-medium">
            🔥 Activation : {country.forte_demande_seuil_activation ?? 5} courses
          </span>
          <span className="text-[10px] bg-green-50 text-green-700 rounded-full px-2 py-0.5 font-medium">
            ↩ Retour : {country.forte_demande_seuil_retour ?? 3} courses
          </span>
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] font-bold text-red-600 hover:underline ml-1"
          >
            Modifier
          </button>
        </div>
      )}
    </div>
  );
}