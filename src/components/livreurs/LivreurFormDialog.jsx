import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import LivreurPhotoUploader from "@/components/livreur/LivreurPhotoUploader";
import { toast } from "sonner";

const emptyForm = {
  prenom: "",
  nom: "",
  telephone: "",
  user_email: "",
  quartier: "",
  vehicule: "moto",
  photo_url: "",
  actif: true,
  type_livreur: "interne",
  reseau: "interne",
};


export default function LivreurFormDialog({ open, onClose, livreur }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const isEdit = !!livreur;

  useEffect(() => {
    if (livreur) {
      setForm({
        prenom: livreur.prenom || "",
        nom: livreur.nom || "",
        telephone: livreur.telephone || "",
        user_email: livreur.user_email || "",
        quartier: livreur.quartier || "",
        vehicule: livreur.vehicule || "moto",
        photo_url: livreur.photo_url || "",
        actif: livreur.actif !== false,
        type_livreur: livreur.type_livreur || "interne",
        reseau: livreur.reseau || "interne",
      });
    } else {
      setForm(emptyForm);
    }
  }, [livreur, open]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (isEdit) {
        const res = await base44.functions.invoke('updateLivreur', { id: livreur.id, data });
        if (!res.data?.success) throw new Error(res.data?.error || 'Erreur mise à jour');
        return res.data.livreur;
      } else {
        const res = await base44.functions.invoke('createLivreur', { data });
        if (!res.data?.success) throw new Error(res.data?.error || 'Erreur création');
        return res.data.livreur;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs"] });
      toast.success(isEdit ? "Livreur mis à jour " : "Livreur créé ");
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || "Erreur. Réessayez.");
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation stricte
    const errors = [];
    if (!form.nom?.trim()) errors.push("Le nom est obligatoire");
    if (!form.telephone?.trim()) errors.push("Le téléphone est obligatoire");
    if (!form.user_email?.trim()) errors.push("L'email du compte livreur est obligatoire");

    if (errors.length > 0) {
      errors.forEach(err => toast.error(err));
      return;
    }

    mutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le livreur" : "Ajouter un livreur"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Prénom</Label>
              <Input placeholder="Prénom" value={form.prenom} onChange={(e) => setForm((p) => ({ ...p, prenom: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nom *</Label>
              <Input placeholder="Nom" value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Email du compte livreur *</Label>
            <Input
              type="email"
              placeholder="livreur@gmail.com"
              value={form.user_email}
              onChange={(e) => setForm((p) => ({ ...p, user_email: e.target.value.trim().toLowerCase() }))}
            />
            <p className="text-[10px] text-muted-foreground">Cet email est utilisé pour identifier le livreur lors de la connexion</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Téléphone *</Label>
            <Input
              placeholder="+226 70 00 00 00"
              value={form.telephone}
              onChange={(e) => {
                // Garder uniquement + et chiffres, puis formater
                const raw = e.target.value.replace(/[^\d+]/g, "");
                let formatted = raw;
                if (raw.startsWith("+226")) {
                  const local = raw.slice(4).replace(/(\d{2})(?=\d)/g, "$1 ").trim();
                  formatted = "+226 " + local;
                } else if (raw.startsWith("+")) {
                  formatted = raw;
                } else {
                  formatted = raw.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
                }
                setForm((p) => ({ ...p, telephone: formatted }));
              }}
              required
              type="tel"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Quartier</Label>
            <Input placeholder="Ex: Ouaga 2000" value={form.quartier} onChange={(e) => setForm((p) => ({ ...p, quartier: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type de livreur *</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                  form.type_livreur === "interne"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setForm((p) => ({ ...p, type_livreur: "interne", reseau: "interne" }))}
              >
                 Interne
              </button>
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                  form.type_livreur === "externe"
                    ? "border-accent bg-accent/5 text-accent"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => setForm((p) => ({ ...p, type_livreur: "externe", reseau: "externe" }))}
              >
                 Externe
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Véhicule</Label>
            <Select value={form.vehicule} onValueChange={(v) => setForm((p) => ({ ...p, vehicule: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="moto">Moto</SelectItem>
                <SelectItem value="velo">Vélo</SelectItem>
                <SelectItem value="voiture">Voiture</SelectItem>
                <SelectItem value="a_pied">À pied</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Photo */}
          <div className="space-y-1.5">
            <Label className="text-xs">Photo</Label>
            <div className="flex items-center gap-3">
              <LivreurPhotoUploader
                photoUrl={form.photo_url}
                nomComplet={`${form.prenom || ""} ${form.nom}`.trim()}
                onPhotoChange={(newUrl) => setForm((p) => ({ ...p, photo_url: newUrl }))}
                canEdit={true}
                size="md"
              />
              <p className="text-xs text-muted-foreground">
                Cliquez sur la photo pour la modifier
              </p>
            </div>
          </div>

          {isEdit && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <Label className="text-xs">Compte actif</Label>
              <Switch checked={form.actif} onCheckedChange={(v) => setForm((p) => ({ ...p, actif: v }))} />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button type="submit" className="flex-1 bg-primary" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement..." : isEdit ? "Mettre à jour" : "Créer le compte"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}