import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle, RefreshCw, Wifi } from "lucide-react";
import { toast } from "sonner";

export default function ForceGPSSyncPanel() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleForceSync = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke("syncClientGPS", {});
      setResults(response.data);
      if (response.data?.success) {
        toast.success(`Audit terminé : ${response.data.stats?.synced || 0} clients avec GPS`);
      } else {
        toast.error(response.data?.error || "Erreur inconnue");
      }
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-2 border-dashed border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wifi className="w-5 h-5 text-blue-600" />
          Audit GPS Clients
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Vérifie quels clients ont leurs coordonnées synchronisées en base de données.
          Le GPS est maintenant sauvegardé automatiquement : au login, au lancement, et toutes les 30s.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleForceSync}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Audit en cours...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" />Lancer l'audit GPS clients</>
          )}
        </Button>

        {results && (
          <div className="space-y-3">
            {/* Stats globales */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
                <p className="text-2xl font-black text-blue-900">{results.stats?.total ?? 0}</p>
                <p className="text-xs text-blue-700 font-semibold">Total</p>
              </div>
              <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-center">
                <p className="text-2xl font-black text-green-900">{results.stats?.synced ?? 0}</p>
                <p className="text-xs text-green-700 font-semibold">GPS </p>
              </div>
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-center">
                <p className="text-2xl font-black text-red-900">{results.stats?.sans_gps ?? 0}</p>
                <p className="text-xs text-red-700 font-semibold">Sans GPS</p>
              </div>
            </div>

            {/* Message */}
            <p className="text-xs text-center text-muted-foreground italic">{results.message}</p>

            {/* Liste détaillée */}
            {results.details?.length > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-xl border p-2">
                {results.details.map((client) => (
                  <div key={client.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold">{client.nom}</p>
                      <p className="text-xs text-muted-foreground">{client.telephone}</p>
                    </div>
                    {client.latitude && client.longitude ? (
                      <div className="text-right">
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />GPS OK
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {Number(client.latitude).toFixed(4)}, {Number(client.longitude).toFixed(4)}
                        </p>
                      </div>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 border-red-200">
                        <AlertCircle className="w-3 h-3 mr-1" />Manquant
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}