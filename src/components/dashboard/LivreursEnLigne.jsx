import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Truck, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LivreursEnLigne({ livreurs = [], reseau = "interne" }) {
  const enLigne = livreurs.filter(l =>
    l.validation === "valide" && l.actif !== false && l.statut !== "hors_ligne" && (l.reseau || "interne") === reseau && (l.type_livreur || "interne") === "interne"
  );

  const disponibles = enLigne.filter(l => l.statut === "disponible");
  const enCourse = enLigne.filter(l => l.statut === "en_course");

  if (enLigne.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" /> Livreurs en ligne
            <span className="text-xs text-muted-foreground font-normal">(0)</span>
          </h2>
          <Link to="/livreurs" className="text-xs text-primary hover:underline">Voir tous</Link>
        </div>
        <p className="text-xs text-muted-foreground text-center py-3">Aucun livreur en ligne</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" /> Livreurs en ligne
          <span className="text-xs bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded-full">{enLigne.length}</span>
        </h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />{disponibles.length} dispo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />{enCourse.length} en course</span>
          <Link to="/livreurs" className="text-primary hover:underline">Voir tous</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {enLigne.map(l => {
          const nom = `${l.prenom || ""} ${l.nom}`.trim();
          const isDispo = l.statut === "disponible";
          return (
            <div
              key={l.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium",
                isDispo
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
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
              <span className={cn(
                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                isDispo ? "bg-green-500" : "bg-red-500"
              )} />
              <span className={cn("text-[10px]", isDispo ? "text-green-600" : "text-red-600")}>
                {isDispo ? "Dispo" : "En course"}
              </span>
              {l.telephone && (
                <a
                  href={`tel:${l.telephone}`}
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