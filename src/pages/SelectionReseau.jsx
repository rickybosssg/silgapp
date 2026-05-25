import React from "react";
import { Truck, Users, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SelectionReseau({ onSelect }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Truck className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">SILGAPP 2</h1>
          <p className="text-muted-foreground">Sélectionnez votre espace de travail</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Silga Interne */}
          <Card className="p-6 hover:shadow-lg transition-shadow border-2 hover:border-primary/50 cursor-pointer group">
            <div
              className="flex flex-col items-center text-center space-y-4"
              onClick={() => onSelect("interne")}
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground mb-1">Silga Interne</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Espace réservé aux livreurs internes de Silga Livraison
                </p>
              </div>
              <Button className="w-full bg-primary hover:bg-primary/90" onClick={() => onSelect("interne")}>
                Accéder à l'espace Interne
              </Button>
            </div>
          </Card>

          {/* Silga Externe */}
          <Card className="p-6 hover:shadow-lg transition-shadow border-2 hover:border-accent/50 cursor-pointer group">
            <div
              className="flex flex-col items-center text-center space-y-4"
              onClick={() => onSelect("externe")}
            >
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Globe className="w-8 h-8 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground mb-1">Silga Externe</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Espace pour les livreurs externes partenaires
                </p>
              </div>
              <Button className="w-full bg-accent hover:bg-accent/90 text-white" onClick={() => onSelect("externe")}>
                Accéder à l'espace Externe
              </Button>
            </div>
          </Card>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Les deux espaces sont indépendants : livreurs, courses et rapports séparés
          </p>
        </div>
      </div>
    </div>
  );
}