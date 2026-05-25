import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Truck, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function CarteLivreursExterne() {
  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes"],
    queryFn: () => base44.entities.Livreur.filter({ reseau: "externe" }),
    initialData: [],
    refetchInterval: 15000,
  });

  const enLigne = livreurs.filter(l => l.statut !== "hors_ligne" && l.app_active === true);

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carte - Livreurs Externes</h1>
          <p className="text-sm text-muted-foreground">{enLigne.length} livreurs externes en ligne</p>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <MapPin className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Livreurs Externes Actifs</h2>
        </div>

        {enLigne.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aucun livreur externe en ligne actuellement</p>
          </div>
        ) : (
          <div className="space-y-2">
            {enLigne.map(livreur => (
              <div key={livreur.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-semibold">{livreur.prenom} {livreur.nom}</p>
                  <p className="text-sm text-muted-foreground">{livreur.statut} • {livreur.quartier}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${livreur.statut === "disponible" ? "bg-green-500" : "bg-red-500"}`} />
                  <a href={`tel:${livreur.telephone}`} className="text-sm text-primary hover:underline">
                    {livreur.telephone}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900">Carte interactive à venir</p>
          <p className="text-xs text-blue-700 mt-1">La carte Google Maps sera ajoutée prochainement pour voir la position en temps réel des livreurs externes.</p>
        </div>
      </div>
    </div>
  );
}