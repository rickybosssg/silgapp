import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MapPin, CheckCircle2, Circle, Navigation, Clock } from "lucide-react";

export default function PendingCoursesStatus() {
  const { data: convs = [] } = useQuery({
    queryKey: ["venus-pending-courses-status"],
    queryFn: () => base44.entities.Conversation.filter(
      { source: "whatsapp", archived: false, venus_active: true },
      "-last_message_date", 50
    ),
    refetchInterval: 10000,
  });

  const pendingConvs = convs.filter(c => {
    if (!c.venus_pending_course) return false;
    try {
      const pc = JSON.parse(c.venus_pending_course);
      return Object.keys(pc).length > 0;
    } catch { return false; }
  });

  if (pendingConvs.length === 0) return null;

  const totalPickup = pendingConvs.filter(c => {
    try {
      const pc = JSON.parse(c.venus_pending_course);
      return pc.adresse_depart || pc.gps_depart_lat != null;
    } catch { return false; }
  }).length;
  const totalDelivery = pendingConvs.filter(c => {
    try {
      const pc = JSON.parse(c.venus_pending_course);
      return pc.adresse_arrivee || pc.gps_arrivee_lat != null;
    } catch { return false; }
  }).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-purple-600" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Courses en collecte</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-green-600 font-semibold">{totalPickup} départ ✓</span>
          <span className="text-green-600 font-semibold">{totalDelivery} arrivée ✓</span>
          <span className="text-muted-foreground">{pendingConvs.length} conv.</span>
        </div>
      </div>
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {pendingConvs.slice(0, 10).map((conv) => {
          let pc = {};
          try { pc = JSON.parse(conv.venus_pending_course); } catch {}
          const hasPickup = pc.adresse_depart || pc.gps_depart_lat != null;
          const hasDelivery = pc.adresse_arrivee || pc.gps_arrivee_lat != null;
          const hasPendingLoc = pc.pending_location_lat != null;
          const hasType = !!pc.type_course;

          return (
            <div key={conv.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">{conv.title || conv.whatsapp_phone}</span>
                {hasType && (
                  <span className="text-[9px] text-purple-600 font-semibold bg-purple-50 px-1.5 py-0.5 rounded flex-shrink-0">
                    {pc.type_course}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                {hasPendingLoc && (
                  <span className="text-[9px] text-amber-600 font-semibold flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded">
                    <MapPin className="w-2.5 h-2.5" /> En attente
                  </span>
                )}
                <span className="flex items-center gap-0.5" title="Lieu de récupération">
                  {hasPickup ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-gray-300" />
                  )}
                  <span className="text-[9px] text-muted-foreground">Départ</span>
                </span>
                <span className="flex items-center gap-0.5" title="Lieu de livraison">
                  {hasDelivery ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-gray-300" />
                  )}
                  <span className="text-[9px] text-muted-foreground">Arrivée</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}