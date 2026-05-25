import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Truck, Building, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SelectionReseau({ onSelect }) {
  const [loading, setLoading] = useState(false);

  const handleSelect = (reseau) => {
    setLoading(true);
    onSelect(reseau);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">SILGAPP</h1>
            <p className="text-muted-foreground mt-1">Sélectionnez votre espace de travail</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary group" onClick={() => handleSelect("interne")}>
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Building className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Silga Interne</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Espace de gestion interne Silga Livraison
                </p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• Livreurs internes</p>
                <p>• Courses internes</p>
                <p>• Rapports internes</p>
              </div>
              <Button className="w-full bg-primary hover:bg-primary/90">
                Accéder à Silga Interne
              </Button>
            </div>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-accent group" onClick={() => handleSelect("externe")}>
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                <Users className="w-7 h-7 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Silga Externe</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Plateforme clients et livreurs externes
                </p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• Clients autonomes</p>
                <p>• Livreurs externes</p>
                <p>• Dispatch automatique</p>
              </div>
              <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                Accéder à Silga Externe
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}