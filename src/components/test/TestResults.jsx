import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";

/**
 * Affichage détaillé des erreurs de test
 */
export function TestErrorDisplay({ detailedError, errors, currentStep }) {
  return (
    <Card className="p-6 bg-red-50 border-red-200">
      <div className="flex items-start gap-4">
        <XCircle className="w-12 h-12 text-red-600 flex-shrink-0" />
        <div className="flex-1">
          <h2 className="text-xl font-bold text-red-900">❌ TEST ÉCHOUÉ</h2>
          <p className="text-sm text-red-700 mb-4">
            {errors.length} erreur(s) détectée(s) • Étape {currentStep}/20
          </p>
          
          {detailedError && (
            <div className="bg-white rounded-lg p-4 border border-red-200 mb-4">
              <h3 className="font-bold text-red-900 mb-2">🔍 Cause exacte :</h3>
              <div className="grid gap-3 text-sm">
                <div>
                  <span className="font-bold text-gray-700">Composant :</span>
                  <span className="ml-2 text-red-800">{detailedError.component}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Étape :</span>
                  <span className="ml-2 text-red-800">{detailedError.step}/20</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Attendu :</span>
                  <span className="ml-2 text-green-800">{detailedError.expected}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Reçu :</span>
                  <span className="ml-2 text-red-800 font-mono">{detailedError.received}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Timestamp :</span>
                  <span className="ml-2 text-gray-600">{new Date(detailedError.timestamp).toLocaleString()}</span>
                </div>
                {detailedError.stack && (
                  <div className="mt-3">
                    <span className="font-bold text-gray-700">Stack trace :</span>
                    <pre className="bg-gray-100 p-2 rounded text-xs text-red-800 overflow-auto mt-1 max-h-48">
                      {detailedError.stack}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            {errors.map((err, i) => (
              <div key={i} className="text-sm text-red-800 bg-white p-2 rounded border border-red-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Affichage des résultats de test réussis
 */
export function TestSuccessDisplay({ testData, timings }) {
  return (
    <Card className="p-6 bg-green-50 border-green-200">
      <div className="flex items-center gap-4">
        <CheckCircle2 className="w-12 h-12 text-green-600" />
        <div className="flex-1">
          <h2 className="text-xl font-bold text-green-900">✅ TEST RÉUSSI !</h2>
          <p className="text-sm text-green-700">
            Chaîne SILGAPP totalement stable et cohérente
          </p>
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div>
              <p className="text-xs text-green-600">Succès</p>
              <p className="text-lg font-bold text-green-900">20/20</p>
            </div>
            <div>
              <p className="text-xs text-green-600">Échecs</p>
              <p className="text-lg font-bold text-green-900">0/20</p>
            </div>
            <div>
              <p className="text-xs text-green-600">Temps total</p>
              <p className="text-lg font-bold text-green-900">
                {Object.values(timings).reduce((a, b) => a + b, 0)} ms
              </p>
            </div>
            <div>
              <p className="text-xs text-green-600">Distance</p>
              <p className="text-lg font-bold text-green-900">
                {testData?.course?.distance_reelle_km?.toFixed(2)} km
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Indicateur de statut de test
 */
export function TestStatusBadge({ testState }) {
  if (testState === "running") {
    return (
      <Badge className="bg-blue-600 text-white animate-pulse">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        TEST EN COURS
      </Badge>
    );
  }
  if (testState === "completed") {
    return (
      <Badge className="bg-green-600 text-white">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        TEST TERMINÉ
      </Badge>
    );
  }
  if (testState === "failed") {
    return (
      <Badge className="bg-red-600 text-white">
        <XCircle className="w-3 h-3 mr-1" />
        ÉCHEC TEST
      </Badge>
    );
  }
  return null;
}