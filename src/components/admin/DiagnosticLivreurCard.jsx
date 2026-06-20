import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bug, Search, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export default function DiagnosticLivreurCard() {
  const [courseId, setCourseId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const diagnosticMutation = useMutation({
    mutationFn: async (id) => {
      const response = await base44.functions.invoke("diagnosticLivraison", { course_id: id });
      return response.data;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.success) {
        toast.success("Diagnostic terminé ");
      } else {
        toast.error("Erreur: " + data.error);
      }
    },
    onError: (err) => {
      toast.error("Erreur: " + err.message);
    },
  });

  const handleDiagnostic = () => {
    if (!courseId.trim()) {
      toast.error("ID de course requis");
      return;
    }
    setLoading(true);
    diagnosticMutation.mutate(courseId.trim());
  };

  return (
    <Card className="p-4 border-orange-200 bg-orange-50">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
          <Bug className="w-4 h-4 text-orange-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">Diagnostic Livraison</p>
          <p className="text-xs text-gray-500">Trouver pourquoi le résumé n'apparaît pas</p>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs">ID de la course</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              placeholder="collez l'ID ici"
              className="flex-1 bg-white text-sm"
            />
            <Button
              size="sm"
              onClick={handleDiagnostic}
              disabled={loading || !courseId.trim()}
              className="flex-shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {result && (
          <div className="mt-3 space-y-2 text-xs">
            {result.success ? (
              <>
                <div className="flex items-center gap-2 text-green-700 bg-green-100 p-2 rounded">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">Course trouvée</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500">Statut</p>
                    <p className="font-semibold">{result.diagnostics.statut}</p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500">Confirmé par</p>
                    <p className="font-semibold">{result.diagnostics.delivery_confirmed_by || "—"}</p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500">Token QR</p>
                    <p className={`font-semibold ${result.checks.delivery_token_exists ? "text-green-600" : "text-red-600"}`}>
                      {result.diagnostics.delivery_qr_token}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <p className="text-gray-500">Code 4 chiffres</p>
                    <p className={`font-semibold ${result.checks.delivery_code_exists ? "text-green-600" : "text-red-600"}`}>
                      {result.diagnostics.delivery_code_4_digits || "MANQUANT"}
                    </p>
                  </div>
                </div>

                {result.recommendations.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="font-semibold text-orange-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Problèmes détectés:
                    </p>
                    {result.recommendations.map((rec, i) => (
                      <p key={i} className="text-orange-800 bg-orange-100 p-1.5 rounded">
                        {rec}
                      </p>
                    ))}
                  </div>
                )}

                {result.livreur_info && (
                  <div className="mt-2 bg-blue-50 p-2 rounded border border-blue-200">
                    <p className="font-semibold text-blue-900">Livreur assigné:</p>
                    <p className="text-blue-800">{result.livreur_info.nom} {result.livreur_info.prenom}</p>
                    <p className="text-blue-700 text-[10px]">
                      {result.livreur_info.type_livreur} • {result.livreur_info.actif ? "Actif" : "Inactif"}
                    </p>
                  </div>
                )}

                {result.distance_calculated && (
                  <div className="mt-2 bg-purple-50 p-2 rounded border border-purple-200">
                    <p className="font-semibold text-purple-900">Distance calculée:</p>
                    <p className="text-purple-800 font-bold">{result.distance_calculated.toFixed(2)} km</p>
                    <p className="text-purple-700 text-[10px]">
                      Prix estimé: {Math.round(result.distance_calculated * 100)} FCFA
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-red-700 bg-red-100 p-2 rounded">
                <XCircle className="w-4 h-4" />
                <span className="font-semibold">{result.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}