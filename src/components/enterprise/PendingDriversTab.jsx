import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, RefreshCw, Mail, Phone } from "lucide-react";

export default function PendingDriversTab() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("manageDriverInvitation", { action: "list_pending_drivers" });
      setDrivers(res?.livreurs || []);
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleValidate = async (id) => {
    setProcessing(id);
    try {
      await base44.functions.invoke("manageDriverInvitation", { action: "validate_driver", livreur_id: id });
      load();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setProcessing(null);
    }
  };

  const handleRefuse = async (id) => {
    if (!confirm("Refuser ce candidat ?")) return;
    setProcessing(id);
    try {
      await base44.functions.invoke("manageDriverInvitation", { action: "refuse_driver", livreur_id: id });
      load();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>;
  }

  if (drivers.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Aucun livreur en attente de validation.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {drivers.map((l) => (
        <Card key={l.id}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{l.prenom} {l.nom}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {l.telephone}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" /> {l.user_email || "—"}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  Inscrit le {l.created_date ? new Date(l.created_date).toLocaleDateString("fr-FR") : "—"}
                </p>
                <p className="text-[10px] text-gray-400">{l.vehicule || "moto"} · {l.ville || l.quartier || "—"}</p>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs"
                  disabled={processing === l.id}
                  onClick={() => handleValidate(l.id)}
                >
                  <CheckCircle className="w-3 h-3" /> Valider
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-500 border-red-200 h-8 text-xs"
                  disabled={processing === l.id}
                  onClick={() => handleRefuse(l.id)}
                >
                  <XCircle className="w-3 h-3" /> Refuser
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}