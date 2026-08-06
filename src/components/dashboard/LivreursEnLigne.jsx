import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Truck, Phone, MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LivreursEnLigne({ livreurs = [] }) {
  const [open, setOpen] = useState(false);
  const disponibles = livreurs.filter(l => l.statut === "disponible");
  const enCourse = livreurs.filter(l => l.statut === "en_course");
  const avecGPS = livreurs.filter(l => l.latitude && l.longitude);
  const tauxDispo = livreurs.length > 0 ? Math.round((disponibles.length / livreurs.length) * 100) : 0;
  const tauxGPS = livreurs.length > 0 ? Math.round((avecGPS.length / livreurs.length) * 100) : 0;

  return (
    <div className="p-4">
      {/* Header cliquable */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between group"
      >
        <h2 className="font-bold text-sm flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" />
          Livreurs en ligne
          <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
            {livreurs.length}
          </span>
        </h2>
        <div className="flex items-center gap-3">
          {livreurs.length > 0 && (
            <>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                <span className="text-muted-foreground">Disponibles :</span>
                <span className="font-black text-green-700">{disponibles.length}</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                <span className="text-muted-foreground">En course :</span>
                <span className="font-black text-orange-700">{enCourse.length}</span>
              </span>
            </>
          )}
          <ChevronDown className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )} />
        </div>
      </button>

      {/* Barre de stats disponibilité + GPS */}
      {livreurs.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-green-50 border border-green-100 px-2.5 py-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] font-bold text-green-700 uppercase">Taux dispo</span>
              <span className="text-xs font-black text-green-700">{tauxDispo}%</span>
            </div>
            <div className="h-1 rounded-full bg-green-100 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${tauxDispo}%` }} />
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] font-bold text-blue-700 uppercase">GPS actif</span>
              <span className="text-xs font-black text-blue-700">{avecGPS.length}/{livreurs.length}</span>
            </div>
            <div className="h-1 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${tauxGPS}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Contenu déployable */}
      {open && (
        <div className="mt-3">
          {livreurs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Aucun livreur en ligne</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {livreurs.map(l => {
                  const nom = `${l.prenom || ""} ${l.nom}`.trim();
                  const isDispo = l.statut === "disponible";
                  const hasGPS = !!(l.latitude && l.longitude);
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium",
                        isDispo
                          ? "bg-green-50 border-green-200 text-green-800"
                          : "bg-orange-50 border-orange-200 text-orange-800"
                      )}
                    >
                      {l.photo_url ? (
                        <img src={l.photo_url} alt={nom} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-muted-foreground">
                          {nom.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span>{nom}</span>
                      {hasGPS && <MapPin className="w-2.5 h-2.5 opacity-60" />}
                      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isDispo ? "bg-green-500" : "bg-orange-500")} />
                      <span className={cn("text-[10px]", isDispo ? "text-green-600" : "text-orange-600")}>
                        {isDispo ? "Dispo" : "En course"}
                      </span>
                      {l.telephone && (
                        <a href={`tel:${l.telephone}`} className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <Phone className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-right">
                <Link to="/livreurs" className="text-xs text-primary hover:underline">Voir tous les livreurs →</Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
