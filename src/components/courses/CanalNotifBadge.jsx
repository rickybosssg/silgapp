import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MessageCircle, Smartphone, AlertCircle, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Affiche le canal de notification utilisé pour une course donnée.
 * Lit les WhatsAppAlerte liées à la course (notification_id = course.id ou alertes récentes du livreur).
 * Cliquable pour voir le détail (date, livreur, statut).
 */
export default function CanalNotifBadge({ course }) {
  const [open, setOpen] = useState(false);

  const { data: alertes = [] } = useQuery({
    queryKey: ["whatsapp-alertes-course", course.id],
    queryFn: () => base44.entities.WhatsAppAlerte.filter({ notification_id: course.id }),
    enabled: open, // Charger seulement quand on ouvre le détail
    staleTime: 30000,
  });

  // Déterminer le canal dominant depuis les alertes WhatsApp connues
  // Si aucune alerte → SILGAPP (app était active)
  const derniereAlerte = alertes.sort((a, b) =>
    new Date(b.created_date) - new Date(a.created_date)
  )[0];

  const canal = derniereAlerte?.canal || "silgapp";
  const statut = derniereAlerte?.statut;

  // Badge principal (avant ouverture)
  const badgeConfig = (() => {
    if (!derniereAlerte) {
      return { label: "SILGAPP", icon: Smartphone, color: "bg-blue-100 text-blue-700 border-blue-200" };
    }
    if (canal === "whatsapp" && statut === "sent") {
      return { label: "WhatsApp ✓", icon: MessageCircle, color: "bg-green-100 text-green-700 border-green-200" };
    }
    if (canal === "sms" && statut === "sent") {
      return { label: "SMS ✓", icon: MessageCircle, color: "bg-purple-100 text-purple-700 border-purple-200" };
    }
    if (statut === "failed") {
      return { label: "Échec", icon: AlertCircle, color: "bg-red-100 text-red-700 border-red-200" };
    }
    if (statut === "pending") {
      return { label: "En attente", icon: Clock, color: "bg-amber-100 text-amber-700 border-amber-200" };
    }
    return { label: canal.toUpperCase(), icon: Smartphone, color: "bg-gray-100 text-gray-600 border-gray-200" };
  })();

  const Icon = badgeConfig.icon;

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold transition-all ${badgeConfig.color} hover:opacity-80`}
      >
        <Icon className="w-2.5 h-2.5" />
        {badgeConfig.label}
        {open ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
      </button>

      {open && (
        <div
          className="absolute z-50 top-6 left-0 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[240px] max-w-[300px]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] font-black text-foreground mb-2 flex items-center gap-1.5">
            <span>📡</span> Audit notifications
          </p>

          {alertes.length === 0 ? (
            <div className="flex items-center gap-2 py-2">
              <Smartphone className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-blue-700">SILGAPP (app active)</p>
                <p className="text-[10px] text-muted-foreground">Livreur dans l'app — notification interne uniquement</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {alertes.map((a) => (
                <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-shrink-0 mt-0.5">
                    {a.statut === "sent" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    {a.statut === "failed" && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                    {a.statut === "pending" && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        a.canal === "whatsapp" ? "bg-green-100 text-green-700" :
                        a.canal === "sms"      ? "bg-purple-100 text-purple-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {a.canal?.toUpperCase() || "SILGAPP"}
                      </span>
                      <span className={`text-[10px] font-semibold ${
                        a.statut === "sent" ? "text-green-600" :
                        a.statut === "failed" ? "text-red-600" : "text-amber-600"
                      }`}>
                        {a.statut === "sent" ? "Envoyé" : a.statut === "failed" ? "Échec" : "En attente"}
                      </span>
                    </div>
                    {a.livreur_telephone && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">📞 {a.livreur_telephone}</p>
                    )}
                    {a.heure_envoi && (
                      <p className="text-[10px] text-muted-foreground">
                        🕐 {format(new Date(a.heure_envoi), "dd/MM · HH:mm", { locale: fr })}
                      </p>
                    )}
                    {a.erreur && (
                      <p className="text-[10px] text-red-500 mt-0.5 truncate" title={a.erreur}>⚠️ {a.erreur.slice(0, 60)}…</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Livreur assigné */}
          {course.livreur_nom && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-[10px] text-muted-foreground">👤 Livreur : <span className="font-bold text-foreground">{course.livreur_nom}</span></p>
              {course.heure_sollicitation && (
                <p className="text-[10px] text-muted-foreground">
                  Sollicité : {format(new Date(course.heure_sollicitation), "HH:mm:ss", { locale: fr })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}