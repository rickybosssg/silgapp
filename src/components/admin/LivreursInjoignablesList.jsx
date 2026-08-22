import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Truck, Phone, Clock, Smartphone, Bell, BellOff,
  ChevronDown, ChevronUp, AlertCircle, Zap, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatRelative(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const CRITERE_LABELS = {
  actif_aujourdhui: { label: "Actif aujourd'hui", color: "bg-red-50 text-red-700 border-red-200", icon: AlertCircle },
  inactif_recent: { label: "Inactif récent", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  inactif_longtemps: { label: "Inactif longtemps", color: "bg-gray-50 text-gray-600 border-gray-200", icon: Clock },
};

const PERM_LABELS = {
  accordée: { label: "Accordée", color: "text-emerald-600", icon: Bell },
  refusée: { label: "Refusée", color: "text-red-600", icon: BellOff },
  inconnue: { label: "Inconnue", color: "text-gray-400", icon: BellOff },
};

export default function LivreursInjoignablesList() {
  const [expanded, setExpanded] = useState(false);
  const [selectedLivreur, setSelectedLivreur] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["livreurs-injoignables"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getLivreursInjoignables", {});
      return res?.data || res;
    },
    enabled: expanded,
  });

  const livreurs = data?.livreurs || [];
  const critiqueCount = data?.critique_count || 0;
  const inactifLongtempsCount = data?.inactif_longtemps_count || 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* En-tête cliquable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center",
            critiqueCount > 0 ? "bg-red-50" : "bg-amber-50"
          )}>
            <Truck className={cn("w-4 h-4", critiqueCount > 0 ? "text-red-500" : "text-amber-500")} />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900">Livreurs non joignables</p>
            <p className="text-[10px] text-gray-400">
              {data?.total ?? "—"} livreur(s) · {critiqueCount} critique(s) · {inactifLongtempsCount} inactif(s) longue durée
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Liste détaillée */}
      {expanded && (
        <div className="border-t border-gray-100">
          {isLoading ? (
            <div className="p-6 text-center">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-400">Chargement...</p>
            </div>
          ) : livreurs.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-gray-400">Tous les livreurs actifs sont joignables ✓</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
              {livreurs.map((liv) => {
                const critere = CRITERE_LABELS[liv.critere] || CRITERE_LABELS.inactif_recent;
                const perm = PERM_LABELS[liv.notification_permission] || PERM_LABELS.inconnue;
                const PermIcon = perm.icon;
                const CritereIcon = critere.icon;
                const isExpanded = selectedLivreur === liv.livreur_id;

                return (
                  <div key={liv.livreur_id} className="p-3">
                    <button
                      onClick={() => setSelectedLivreur(isExpanded ? null : liv.livreur_id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold text-gray-900 truncate">
                              {liv.prenom} {liv.nom}
                            </p>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-0.5 shrink-0",
                              critere.color
                            )}>
                              <CritereIcon className="w-2.5 h-2.5" />
                              {critere.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-400">
                            <span className="flex items-center gap-0.5">
                              <Phone className="w-2.5 h-2.5" />
                              {liv.telephone || "—"}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {formatRelative(liv.last_seen_at)}
                            </span>
                            {liv.app_version && (
                              <span className="flex items-center gap-0.5">
                                <Smartphone className="w-2.5 h-2.5" />
                                v{liv.app_version}
                              </span>
                            )}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-300 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />
                        )}
                      </div>
                    </button>

                    {/* Détails étendus */}
                    {isExpanded && (
                      <div className="mt-3 ml-1 space-y-2 bg-gray-50 rounded-xl p-3">
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          {/* Dernier login */}
                          <div>
                            <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Dernier login</p>
                            <p className="text-gray-700 font-medium">{formatDate(liv.last_seen_at)}</p>
                          </div>
                          {/* Dernière activité GPS */}
                          <div>
                            <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Dernière activité GPS</p>
                            <p className="text-gray-700 font-medium">{formatDate(liv.derniere_position_date)}</p>
                          </div>
                          {/* Version APK */}
                          <div>
                            <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Version APK</p>
                            <p className="text-gray-700 font-medium flex items-center gap-1">
                              <Smartphone className="w-2.5 h-2.5" />
                              {liv.app_version || "— non disponible —"}
                            </p>
                          </div>
                          {/* Permission notif */}
                          <div>
                            <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Permission notif.</p>
                            <p className={cn("font-medium flex items-center gap-1", perm.color)}>
                              <PermIcon className="w-2.5 h-2.5" />
                              {perm.label}
                            </p>
                          </div>
                          {/* Dernier token connu */}
                          <div>
                            <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Dernier token connu</p>
                            <p className="text-gray-700 font-medium">{formatDate(liv.dernier_token_date)}</p>
                          </div>
                          {/* Statut app */}
                          <div>
                            <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">App active</p>
                            <p className={cn("font-medium", liv.app_active ? "text-emerald-600" : "text-gray-500")}>
                              {liv.app_active ? "Oui" : "Non"}
                            </p>
                          </div>
                          {/* Véhicule */}
                          <div>
                            <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Véhicule</p>
                            <p className="text-gray-700 font-medium capitalize">{liv.vehicule || "—"}</p>
                          </div>
                          {/* Localisation */}
                          <div>
                            <p className="text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Zone</p>
                            <p className="text-gray-700 font-medium flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />
                              {liv.quartier || liv.ville || "—"}
                            </p>
                          </div>
                        </div>

                        {/* Erreur FCM si présente */}
                        {liv.last_token_error && (
                          <div className="bg-red-50 border border-red-100 rounded-lg p-2">
                            <p className="text-[10px] font-semibold text-red-700 mb-0.5">Dernière erreur FCM</p>
                            <p className="text-[10px] text-red-600 font-mono break-all">{liv.last_token_error}</p>
                          </div>
                        )}

                        {/* Recommandation */}
                        {liv.is_critique && (
                          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-2">
                            <Zap className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                            <p className="text-[10px] font-medium text-red-700">
                              <strong>Critique :</strong> ce livreur est actif aujourd'hui mais ne reçoit pas les notifications push.
                              Il ne peut pas être dispatché efficacement. Contactez-le pour réenregistrer son token.
                            </p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1">
                          {liv.telephone && (
                            <a
                              href={`tel:${liv.telephone}`}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[11px] font-bold hover:bg-blue-600 transition-colors"
                            >
                              <Phone className="w-3 h-3" />
                              Appeler
                            </a>
                          )}
                          {liv.user_email && (
                            <a
                              href={`https://wa.me/${liv.telephone?.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 transition-colors"
                            >
                              <Bell className="w-3 h-3" />
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {data && (
            <div className="px-4 py-2 border-t border-gray-50 bg-gray-50/50">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                {isFetching ? "Actualisation..." : "Actualiser la liste"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}