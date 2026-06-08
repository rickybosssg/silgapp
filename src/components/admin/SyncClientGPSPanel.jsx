import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle, AlertCircle, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function SyncClientGPSPanel() {
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await base44.functions.invoke("syncClientGPS", {});
      setStats(response.data);
      
      if (response.data.success) {
        toast.success(`✅ ${response.data.message}`);
      } else {
        toast.error(`❌ ${response.data.error}`);
      }
    } catch (error) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Synchronisation GPS des clients
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Cette fonction vérifie le statut GPS de tous les clients externes.
          <br />
          <strong>Note:</strong> Le GPS est maintenant automatiquement sauvegardé lors de l'onboarding.
        </div>

        <Button 
          onClick={handleSync} 
          disabled={syncing}
          className="w-full"
        >
          {syncing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Synchronisation en cours...
            </>
          ) : (
            <>
              <Users className="w-4 h-4 mr-2" />
              Vérifier le statut GPS de tous les clients
            </>
          )}
        </Button>

        {stats && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-700 font-semibold">Total clients</p>
                <p className="text-2xl font-bold text-blue-900">{stats.stats?.total || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-xs text-green-700 font-semibold">Avec GPS</p>
                <p className="text-2xl font-bold text-green-900">{stats.stats?.synced || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700 font-semibold">Sans GPS</p>
                <p className="text-2xl font-bold text-amber-900">{stats.stats?.skipped || 0}</p>
              </div>
            </div>

            {stats.details && stats.details.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {stats.details.map((client) => (
                  <div 
                    key={client.id}
                    className="flex items-center justify-between p-2 rounded-lg border"
                  >
                    <div>
                      <p className="text-sm font-semibold">{client.nom || 'Inconnu'}</p>
                      <p className="text-xs text-muted-foreground">{client.telephone}</p>
                    </div>
                    {client.latitude && client.longitude ? (
                      <div className="text-right">
                        <Badge className="bg-green-200 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          GPS synchronisé
                        </Badge>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {Number(client.latitude).toFixed(4)}, {Number(client.longitude).toFixed(4)}
                        </p>
                      </div>
                    ) : (
                      <Badge className="bg-red-200 text-red-800">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        GPS manquant
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