import React, { useState } from "react";
import { User, Phone, MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ClientsEnLigne({ clients = [] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-4">
      {/* Header cliquable */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between group"
      >
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          Clients en ligne
          <span className="text-xs bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded-full">
            {clients.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {clients.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
              GPS actif
            </span>
          )}
          <ChevronDown className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )} />
        </div>
      </button>

      {/* Contenu déployable */}
      {open && (
        <div className="mt-3">
          {clients.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Aucun client avec GPS actif
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {clients.map(c => {
                const nom = `${c.prenom || ""} ${c.nom}`.trim();
                const hasGPS = !!(c.latitude && c.longitude);
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium bg-red-50 border-red-200 text-red-800"
                  >
                    <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-red-700">
                      {nom.charAt(0).toUpperCase()}
                    </span>
                    <span>{nom}</span>
                    {hasGPS && <MapPin className="w-2.5 h-2.5 opacity-60" />}
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-500" />
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
          )}
        </div>
      )}
    </div>
  );
}