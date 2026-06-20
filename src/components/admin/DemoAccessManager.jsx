import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Link2, Copy, Trash2, Loader2, ExternalLink, Key, Plus, AlertCircle, CheckCircle2, Clock, XCircle
} from "lucide-react";
import { toast } from "sonner";

export default function DemoAccessManager() {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: res, isLoading } = useQuery({
    queryKey: ["demo-access-tokens"],
    queryFn: () => base44.functions.invoke("gererDemoAccess", { action: "list" }),
    initialData: { data: { tokens: [] } },
  });

  const tokens = res?.data?.tokens || [];

  const createToken = async () => {
    setCreating(true);
    try {
      const r = await base44.functions.invoke("gererDemoAccess", {
        action: "create",
        note: note || "Accès démo Google Play",
      });
      queryClient.invalidateQueries({ queryKey: ["demo-access-tokens"] });
      setNote("");

      const url = r.data?.demo_url;
      if (url) {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié dans le presse-papier !", {
          description: "Tu peux maintenant le coller dans un email.",
          duration: 6000,
        });
      }
    } catch (err) {
      toast.error("Erreur lors de la création");
    }
    setCreating(false);
  };

  const revokeToken = async (token) => {
    try {
      await base44.functions.invoke("gererDemoAccess", { action: "revoke", token });
      queryClient.invalidateQueries({ queryKey: ["demo-access-tokens"] });
      toast.success("Accès révoqué");
    } catch (err) {
      toast.error("Erreur");
    }
  };

  const copyLink = async (token) => {
    const url = `${window.location.origin}/demo/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Lien copié !");
  };

  const getStatus = (t) => {
    if (!t.actif) return { label: "Révoqué", color: "bg-red-100 text-red-700", icon: XCircle };
    if (new Date(t.expire_le) < new Date()) return { label: "Expiré", color: "bg-orange-100 text-orange-700", icon: Clock };
    return { label: "Actif", color: "bg-green-100 text-green-700", icon: CheckCircle2 };
  };

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Key className="w-4 h-4 text-gray-400" />
          Accès démo Google Play
        </CardTitle>
        <p className="text-xs text-gray-500">
          Génère un lien temporaire (30 jours) permettant à Google de consulter le dashboard sans authentification.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Création */}
        <div className="flex gap-2">
          <Input
            placeholder="Note (ex: Envoyé à Google Play le 20/06)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 h-10 text-sm rounded-xl"
          />
          <Button
            onClick={createToken}
            disabled={creating}
            className="gap-1.5 rounded-xl bg-primary text-white"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Générer
          </Button>
        </div>

        {/* Liste des tokens */}
        {isLoading ? (
          <div className="text-center py-4">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <Link2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Aucun lien démo créé
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => {
              const status = getStatus(t);
              const StatusIcon = status.icon;
              const isExpired = new Date(t.expire_le) < new Date();
              const isActive = t.actif && !isExpired;
              const demoUrl = `${window.location.origin}/demo/${t.token}`;

              return (
                <div
                  key={t.id}
                  className={`rounded-xl border p-3 flex items-center gap-3 ${
                    isActive ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-gray-50/50 opacity-70"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isActive ? "bg-green-100" : "bg-gray-100"
                  }`}>
                    <StatusIcon className={`w-3.5 h-3.5 ${isActive ? "text-green-600" : "text-gray-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[10px] ${status.color} border-0`}>
                        {status.label}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        Expire le {new Date(t.expire_le).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{t.note || "-"}</p>
                    {isActive && (
                      <a
                        href={demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-primary hover:underline mt-1 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        {demoUrl.substring(0, 50)}...
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isActive && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg hover:bg-green-100"
                        onClick={() => copyLink(t.token)}
                        title="Copier le lien"
                      >
                        <Copy className="w-3.5 h-3.5 text-gray-500" />
                      </Button>
                    )}
                    {isActive && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg hover:bg-red-100"
                        onClick={() => revokeToken(t.token)}
                        title="Révoquer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}