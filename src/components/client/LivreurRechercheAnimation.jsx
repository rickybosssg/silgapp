import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Truck, 
  MapPin, 
  Package, 
  User, 
  Smartphone,
  CheckCircle2,
  Loader2,
  Navigation
} from "lucide-react";

export default function LivreurRechercheAnimation({ course }) {
  const [currentMessage, setCurrentMessage] = useState(0);
  const [livreursContactes, setLivreursContactes] = useState(0);

  const messages = [
    "Recherche des livreurs disponibles...",
    "Vérification des positions GPS...",
    "Analyse des distances...",
    "Contact des livreurs les plus proches...",
    "En attente de confirmation...",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % messages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLivreursContactes((prev) => Math.min(prev + 1, 5));
    }, 800);

    return () => clearInterval(interval);
  }, []);

  const typeColisLabels = {
    petit_colis: "Petit colis",
    moyen_colis: "Moyen colis",
    gros_colis: "Gros colis",
    document: "Document",
    nourriture: "Nourriture",
    autre: "Autre"
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 p-4">
      <div className="max-w-lg mx-auto space-y-6">
        
        {/* Header animé */}
        <Card className="p-6 bg-gradient-to-r from-primary to-red-600 text-white border-0 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Truck className="w-6 h-6" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Recherche en cours</h1>
                <p className="text-xs text-white/80">Nous trouvons le meilleur livreur</p>
              </div>
            </div>
            <Loader2 className="w-8 h-8 animate-spin opacity-80" />
          </div>

          {/* Message dynamique */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
            <p className="text-sm font-medium animate-pulse">
              {messages[currentMessage]}
            </p>
          </div>
        </Card>

        {/* Animation des livreurs contactés */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              Livreurs contactés
            </h2>
            <Badge className="bg-primary/10 text-primary">
              {livreursContactes} / 5
            </Badge>
          </div>
          
          <div className="flex gap-2 justify-center">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                  i < livreursContactes
                    ? "bg-green-500 text-white scale-110"
                    : "bg-gray-200 text-gray-400 scale-90"
                }`}
              >
                <User className="w-5 h-5" />
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-3">
            {livreursContactes === 5 
              ? "Tous les livreurs proches ont été contactés" 
              : `${5 - livreursContactes} livreurs restants...`}
          </p>
        </Card>

        {/* Résumé de la course */}
        <Card className="p-5 bg-gradient-to-br from-white to-gray-50">
          <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Votre course
          </h2>
          
          <div className="space-y-3">
            {/* Type */}
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Type</p>
                <p className="font-semibold text-foreground capitalize">
                  {course.type_course === "expedier" ? "📦 Expédition" : "📥 Réception"}
                </p>
              </div>
            </div>

            {/* Récupération */}
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Récupération</p>
                <p className="font-medium text-foreground text-sm">{course.adresse_depart}</p>
              </div>
            </div>

            {/* Livraison */}
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Livraison</p>
                <p className="font-medium text-foreground text-sm">{course.adresse_arrivee}</p>
              </div>
            </div>

            {/* Contact */}
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Contact</p>
                <p className="font-medium text-foreground text-sm">
                  {course.type_course === "expedier" 
                    ? `${course.destinataire_nom} - ${course.destinataire_telephone}`
                    : `${course.expediteur_nom} - ${course.expediteur_telephone}`}
                </p>
              </div>
            </div>

            {/* Colis */}
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Type de colis</p>
                <p className="font-medium text-foreground text-sm capitalize">
                  {typeColisLabels[course.type_colis] || course.type_colis}
                </p>
              </div>
            </div>

            {/* Tarif */}
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-primary/5 to-accent/5 rounded-lg border border-primary/20">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Navigation className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Tarif</p>
                <p className="font-bold text-primary text-sm">
                  Calculé à la livraison (100 F/km)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Selon la distance GPS réelle parcourue
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Statut */}
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75" />
            </div>
            <div>
              <p className="font-bold text-green-900">Course créée avec succès</p>
              <p className="text-xs text-green-700">
                Un livreur va bientôt accepter votre course
              </p>
            </div>
          </div>
        </Card>

        {/* Instruction */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            ⏱️ Temps d'attente moyen : 2-5 minutes
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Vous serez redirigé vers le suivi quand un livreur acceptera
          </p>
        </div>

      </div>
    </div>
  );
}