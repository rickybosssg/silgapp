import React from "react";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { User, Phone, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

// Reçoit les clients avec GPS actif (latitude && longitude)
export default function ClientsEnLigne({ clients = [] }) {
  if (clients.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> Clients en ligne
            <span className="text-xs text-muted-foreground font-normal">(0)</span>
          </h2>
        </div>
        <p className="text-xs text-muted-foreground text-center py-3">Aucun client avec GPS actif</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <User className="w-4 h-4 text-primary" /> Clients en ligne
          <span className="text-xs bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded-full">{clients.length}</span>
        </h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            GPS actif
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {clients.map(c => {
          const nom = `${c.prenom || ""} ${c.nom}`.trim();
          const hasGPS = !!(c.latitude && c.longitude);
          return (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium",
                "bg-red-50 border-red-200 text-red-800"
              )}
            >
              <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-red-700">
                {nom.charAt(0).toUpperCase()}
              </span>
              <span>{nom}</span>
              {hasGPS && <MapPin className="w-2.5 h-2.5 opacity-60" />}
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-500" />
              <span className="text-[10px] text-red-600">GPS</span>
              {c.telephone && (
                <a
                  href={`tel:${c.telephone}`}
                  className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()}
                >
                  <Phone className="w-3 h-3" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}