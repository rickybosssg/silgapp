import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, X, UserCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Dialog pour assigner/modifier les admins pays.
 * Affiche les admins existants du pays et permet d'en assigner un depuis la liste des admins globaux.
 */
export default function AdminPaysDialog({ pays, admins, onClose, onSuccess }) {
  const queryClient = useQueryClient();

  // Admins globaux (non encore assignés à ce pays)
  const adminsGlobaux = admins.filter(a => a.admin_type !== "pays" || a.country_code !== pays.code);
  const adminsDeJaPays = admins.filter(a => a.admin_type === "pays" && a.country_code === pays.code);

  const [selectedUserId, setSelectedUserId] = useState("");

  const assignMutation = useMutation({
    mutationFn: (userId) => base44.auth.updateMe
      ? Promise.reject("Utiliser le SDK admin")
      : base44.entities.User.update(userId, {
          admin_type: "pays",
          country_code: pays.code,
        }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-admins"] });
      toast.success(`Admin assigné au ${pays.nom} ✓`);
      onSuccess?.();
    },
    onError: (e) => toast.error("Erreur : " + e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (userId) => base44.entities.User.update(userId, {
      admin_type: "global",
      country_code: null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-admins"] });
      toast.success("Admin redevenu global ✓");
    },
    onError: (e) => toast.error("Erreur : " + e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{pays.emoji}</span>
            <div>
              <h2 className="font-bold text-foreground">Admins — {pays.nom}</h2>
              <p className="text-xs text-muted-foreground">Gérer les administrateurs de ce pays</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admins actuels de ce pays */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">Admins actuels</p>
          {adminsDeJaPays.length === 0 ? (
            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5 py-2">
              <AlertCircle className="w-3.5 h-3.5" />
              Aucun admin spécifique à ce pays
            </div>
          ) : (
            <div className="space-y-2">
              {adminsDeJaPays.map(a => (
                <div key={a.id} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.full_name || a.email}</p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 text-[10px]">Admin {pays.code}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => removeMutation.mutate(a.id)}
                    disabled={removeMutation.isPending}
                  >
                    Retirer
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assigner un nouvel admin pays */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">Assigner un admin existant</p>
          {adminsGlobaux.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Tous les admins sont déjà assignés ou aucun disponible.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="flex-1 border border-input rounded-md bg-background text-foreground px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Choisir un admin...</option>
                {adminsGlobaux.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.full_name || a.email} {a.admin_type === "pays" && a.country_code ? `(${a.country_code})` : "(Global)"}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => selectedUserId && assignMutation.mutate(selectedUserId)}
                disabled={!selectedUserId || assignMutation.isPending}
                className="gap-1.5"
              >
                <UserCheck className="w-4 h-4" />
                Assigner
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
          💡 Un admin pays ne voit que les données de son pays ({pays.code}). Il peut gérer livreurs, clients, courses et comptabilité pour {pays.nom} uniquement.
        </p>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}