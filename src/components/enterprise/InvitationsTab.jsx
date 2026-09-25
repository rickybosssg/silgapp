import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, QrCode, Copy, Ban, RefreshCw, Clock, CheckCircle, XCircle } from "lucide-react";

export default function InvitationsTab() {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newInvitation, setNewInvitation] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("manageDriverInvitation", { action: "list_invitations" });
      setInvitations(res?.invitations || []);
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await base44.functions.invoke("manageDriverInvitation", { action: "create_invitation" });
      setNewInvitation(res);
      load();
    } catch (err) {
      setError(err?.message || "Erreur");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm("Révoquer cette invitation ? Le lien ne sera plus utilisable.")) return;
    try {
      await base44.functions.invoke("manageDriverInvitation", { action: "revoke_invitation", invitation_id: id });
      load();
    } catch (err) {
      setError(err?.message || "Erreur");
    }
  };

  const copyUrl = (url) => {
    navigator.clipboard?.writeText(url);
  };

  if (loading) {
    return <div className="text-center py-8"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>;
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleCreate} disabled={creating} size="sm" className="w-full">
        <UserPlus className="w-4 h-4" /> {creating ? "Création..." : "Inviter un livreur"}
      </Button>

      {newInvitation?.url && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-bold text-gray-900">Lien d'inscription</p>
              <p className="text-xs text-gray-500 break-all bg-white rounded-lg p-2 mt-1 border">{newInvitation.url}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => copyUrl(newInvitation.url)}>
                <Copy className="w-4 h-4" /> Copier
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => window.open(newInvitation.url, "_blank")}>
                <QrCode className="w-4 h-4" /> Ouvrir
              </Button>
            </div>
            <p className="text-[10px] text-gray-400">Ce lien expire dans 7 jours. Partagez-le au candidat ou affichez le QR code.</p>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {invitations.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Aucune invitation créée.</p>
      ) : (
        invitations.map((inv) => (
          <Card key={inv.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-gray-500 truncate">{inv.token?.slice(0, 16)}...</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(inv.created_at).toLocaleDateString("fr-FR")}
                  </p>
                  {inv.used_by_user_email && (
                    <p className="text-xs text-emerald-600 mt-1">✓ {inv.used_by_user_email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={inv.status} />
                  {inv.status === "pending" && (
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleRevoke(inv.id)}>
                      <Ban className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    pending: { icon: Clock, label: "En attente", cls: "bg-amber-100 text-amber-700" },
    used: { icon: CheckCircle, label: "Utilisée", cls: "bg-emerald-100 text-emerald-700" },
    expired: { icon: XCircle, label: "Expirée", cls: "bg-gray-100 text-gray-500" },
    revoked: { icon: Ban, label: "Révoquée", cls: "bg-red-100 text-red-700" },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${c.cls}`}>
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  );
}