import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { FileText, ChevronDown, ChevronUp, Sunrise, Moon, BarChart3, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const SOUS_TYPE_CONFIG = {
  matin: { label: "Rapport du matin", icon: Sunrise, color: "bg-amber-100 text-amber-700 border-amber-200" },
  soir: { label: "Rapport du soir", icon: Moon, color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  journee: { label: "Point intelligent", icon: AlertCircle, color: "bg-orange-100 text-orange-700 border-orange-200" },
  hebdomadaire: { label: "Rapport hebdomadaire", icon: BarChart3, color: "bg-blue-100 text-blue-700 border-blue-200" },
};

export default function VenusRapportsTab() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);

  const { data: rapports = [], isLoading } = useQuery({
    queryKey: ["venus-rapports"],
    queryFn: () => base44.entities.VenusRapport.list("-created_date", 50),
    refetchInterval: 30000,
  });

  const markAsRead = useMutation({
    mutationFn: (rapportId) => base44.entities.VenusRapport.update(rapportId, {
      statut_lecture: "lu",
      lu_at: new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries(["venus-rapports"]),
  });

  const rapportsByType = useMemo(() => {
    const groups = { matin: [], soir: [], journee: [], hebdomadaire: [] };
    rapports.forEach(r => {
      if (groups[r.sous_type]) groups[r.sous_type].push(r);
    });
    return groups;
  }, [rapports]);

  const latestRapport = rapports[0];
  const unreadCount = rapports.filter(r => r.statut_lecture === "non_lu").length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Compteur non lus */}
      {unreadCount > 0 && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
          <p className="text-xs text-blue-700 font-medium">
            {unreadCount} rapport{unreadCount > 1 ? "s non lu" : " non lu"}
          </p>
        </div>
      )}

      {/* Liste des rapports */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-500">Chargement des rapports...</p>
          </div>
        ) : rapports.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-400 font-medium">Aucun rapport disponible</p>
              <p className="text-xs text-slate-400">Les rapports sont générés automatiquement</p>
            </div>
          </div>
        ) : (
          rapports.map(rapport => {
            const config = SOUS_TYPE_CONFIG[rapport.sous_type] || SOUS_TYPE_CONFIG.journee;
            const Icon = config.icon;
            const isUnread = rapport.statut_lecture === "non_lu";
            const isExpanded = expandedId === rapport.id;
            let contenu = null;
            try { contenu = rapport.contenu_json ? JSON.parse(rapport.contenu_json) : null; } catch {}

            return (
              <div
                key={rapport.id}
                className={cn(
                  "rounded-xl border bg-white shadow-sm transition-all",
                  isUnread ? "border-primary/30 ring-1 ring-primary/10" : "border-slate-200 opacity-80"
                )}
              >
                {/* Header */}
                <div
                  className="p-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : rapport.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border", config.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", config.color)}>
                          {config.label}
                        </span>
                        {isUnread && <span className="w-2 h-2 bg-primary rounded-full" />}
                      </div>
                      <p className="text-xs text-slate-500 mb-1">
                        {format(new Date(rapport.created_date), "EEE dd MMM yyyy à HH:mm", { locale: fr })}
                      </p>
                      <p className="text-sm font-medium text-slate-900 leading-snug">{rapport.resume}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  </div>
                </div>

                {/* Détails */}
                {isExpanded && contenu && (
                  <div className="px-3 pb-3 border-t border-slate-100 pt-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <DetailItem label="Courses créées" value={contenu.courses_crees} />
                      <DetailItem label="Courses livrées" value={contenu.courses_livrees} />
                      <DetailItem label="Courses annulées" value={contenu.courses_annulees} />
                      {contenu.courses_en_cours !== undefined && <DetailItem label="En cours" value={contenu.courses_en_cours} />}
                      <DetailItem label="CA total" value={`${(contenu.ca || 0).toLocaleString('fr-FR')} F`} />
                      <DetailItem label="Commissions" value={`${(contenu.commissions || 0).toLocaleString('fr-FR')} F`} />
                      <DetailItem label="Montants dus" value={`${(contenu.montants_dus || 0).toLocaleString('fr-FR')} F`} />
                      {contenu.paiements_recus !== undefined && <DetailItem label="Paiements reçus" value={`${(contenu.paiements_recus || 0).toLocaleString('fr-FR')} F`} />}
                      {contenu.livreurs_disponibles !== undefined && <DetailItem label="Livreurs dispo" value={contenu.livreurs_disponibles} />}
                      {contenu.nb_livreurs_dette !== undefined && <DetailItem label="Livreurs en dette" value={contenu.nb_livreurs_dette} />}
                    </div>

                    {/* Comparaison */}
                    {contenu.comparison && (
                      <div className="mt-2 p-2 bg-slate-50 rounded-lg">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Comparaison veille</p>
                        <div className="flex gap-3 text-xs">
                          {contenu.comparison.ca_evol !== 0 && (
                            <span className={contenu.comparison.ca_evol > 0 ? "text-green-600" : "text-red-600"}>
                              CA {contenu.comparison.ca_evol > 0 ? "+" : ""}{contenu.comparison.ca_evol}%
                            </span>
                          )}
                          {contenu.comparison.annul_evol !== 0 && (
                            <span className={contenu.comparison.annul_evol > 0 ? "text-red-600" : "text-green-600"}>
                              Annulations {contenu.comparison.annul_evol > 0 ? "+" : ""}{contenu.comparison.annul_evol}%
                            </span>
                          )}
                          {contenu.comparison.vol_evol !== 0 && (
                            <span className={contenu.comparison.vol_evol > 0 ? "text-green-600" : "text-red-600"}>
                              Volume {contenu.comparison.vol_evol > 0 ? "+" : ""}{contenu.comparison.vol_evol}%
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Top livreurs */}
                    {contenu.top_livreurs && contenu.top_livreurs.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Top livreurs</p>
                        <div className="space-y-1">
                          {contenu.top_livreurs.map((d, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-slate-700">{i + 1}. {d.nom}</span>
                              <span className="font-bold text-slate-900">{d.count} courses</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sources */}
                    {contenu.sources && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400">Sources: {contenu.sources.join(', ')}</p>
                      </div>
                    )}

                    {/* Action marquer comme lu */}
                    {isUnread && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 h-7 text-[11px]"
                        onClick={() => markAsRead.mutate(rapport.id)}
                      >
                        Marquer comme lu
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-slate-500 uppercase">{label}</span>
      <span className="font-bold text-slate-900">{value}</span>
    </div>
  );
}
