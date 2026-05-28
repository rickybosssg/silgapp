import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import LivreurRecapitulatifPaiement from "@/components/livreur/LivreurRecapitulatifPaiement";

export default function TestRecapitulatifPaiement() {
  const [showRecap, setShowRecap] = React.useState(false);
  const [isPaying, setIsPaying] = React.useState(false);

  const courseExemple = {
    id: "test-123",
    adresse_depart: "Ouaga 2000, Rue 12.345",
    adresse_arrivee: "Koulouba, Avenue 5.67",
    distance_reelle_km: 3.45,
    prix_final: 345,
    commission_silga: 104,
    montant_livreur: 241,
    heure_recuperation: new Date(Date.now() - 1800000).toISOString(),
    heure_livraison: new Date().toISOString(),
    statut: "livree",
  };

  const handlePayer = () => {
    setIsPaying(true);
    setTimeout(() => {
      setIsPaying(false);
      setShowRecap(false);
      alert("✅ Paiement simulé réussi !");
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">Test Récapitulatif Paiement</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Ce test affiche le récapitulatif que le livreur verra après une livraison.
          </p>
          <Button
            className="w-full h-12"
            onClick={() => setShowRecap(true)}
          >
            Afficher le récapitulatif
          </Button>
        </Card>

        {showRecap && (
          <LivreurRecapitulatifPaiement
            course={courseExemple}
            onPayer={handlePayer}
            isPaying={isPaying}
          />
        )}
      </div>
    </div>
  );
}