import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Lock,
  Shield,
  AlertCircle,
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";

export default function PinVerification({ onVerify, onCancel, networkName }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  // Code PIN en dur (la variable d'environnement n'est pas accessible ici)
  const PIN_CODE = "707145";

  const validatePin = (inputPin) => {
    if (inputPin.length !== 6) {
      setError("Le code doit contenir 6 chiffres");
      return false;
    }

    if (inputPin === PIN_CODE) {
      toast.success("Accès autorisé");
      onVerify();
      return true;
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= 5) {
        setError("Trop de tentatives. Veuillez réessayer plus tard.");
        toast.error("Trop de tentatives échouées");
      } else {
        setError(`Code incorrect. ${5 - newAttempts} tentatives restantes.`);
        toast.error("Code incorrect");
      }

      setPin("");
      return false;
    }
  };

  const handleNumberClick = (num) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
      setError("");

      // Validation automatique après 6 chiffres
      if (newPin.length === 6) {
        setTimeout(() => {
          validatePin(newPin);
        }, 150);
      }
    }
  };

  const handleClear = () => {
    setPin("");
    setError("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent/10 via-background to-primary/10 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <img
            src="https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/ecff74f77_IMG-20260523-WA0003.jpg"
            alt="Logo SILGAPP"
            className="w-32 h-32 object-contain mx-auto"
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Silga Externe</h1>
            <p className="text-muted-foreground mt-1">Accès sécurisé</p>
          </div>
        </div>

        {/* Carte de vérification */}
        <Card className="p-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Lock className="w-5 h-5 text-accent" />
              <p className="text-sm font-semibold text-foreground">
                Code PIN requis
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Entrez le code à 6 chiffres pour accéder au mode externe
            </p>
          </div>

          {/* Affichage du PIN */}
          <div className="flex justify-center gap-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-all ${
                  i < pin.length
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-gray-300 bg-gray-50"
                }`}
              >
                {i < pin.length ? "•" : ""}
              </div>
            ))}
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* Pavé numérique */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <Button
                key={num}
                type="button"
                variant="outline"
                className="h-14 text-xl font-bold"
                onClick={() => handleNumberClick(num.toString())}
              >
                {num}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="h-14 text-sm font-medium text-muted-foreground"
              onClick={onCancel}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 text-xl font-bold"
              onClick={() => handleNumberClick("0")}
            >
              0
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 text-sm font-medium"
              onClick={handleClear}
            >
              Effacer
            </Button>
          </div>

          {/* Info sécurité */}
          <div className="flex items-center justify-center gap-2 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Accès réservé au personnel autorisé
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}