import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Truck, AlertCircle, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ModernMap from "@/components/client/ModernMap";

export default function CarteLivreursExterne() {
  const [showMap, setShowMap] = useState(false);
  
  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes"],
    queryFn: () => base44.entities.Livreur.filter({ reseau: "externe", statut: ["disponible", "en_course"], app_active: true }),
    initialData: [],
    refetchInterval: 15000,
  });

  const enLigne = livreurs.filter(l => l.statut !== "hors_ligne" && l.app_active === true);
  
  // Position centrale (Ouagadougou) si pas de livreurs
  const centerPosition = enLigne.length > 0 && enLigne[0].latitude && enLigne[0].longitude
    ? { latitude: enLigne[0].latitude, longitude: enLigne[0].longitude }
    : { latitude: 12.3714, longitude: -1.5197 }; // Ouagadougou

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

      {/* Bouton pour ouvrir la carte */}
      <Card className="p-4 cursor-pointer hover:shadow-lg transition-all" onClick={() => setShowMap(true)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">🗺️ Voir la carte interactive</p>
            <p className="text-xs text-muted-foreground">{enLigne.length} livreurs en ligne</p>
          </div>
        </div>
      </Card>

      {/* Liste des livreurs */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Truck className="w-5 h-5 text-accent" />
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

      {/* Modale carte interactive */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="flex items-center justify-between p-4 border-b bg-card">
            <h2 className="text-lg font-bold text-foreground">Carte - Livreurs Externes</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowMap(false)} className="h-10 w-10">
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="h-[calc(100vh-80px)]">
            <ModernMap
              position={centerPosition}
              livreursProches={enLigne}
              courseActive={null}
            />
          </div>
        </div>
      )}
    </div>
  );
}