import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { KeyRound, User, Upload } from "lucide-react";
import { toast } from "sonner";
import { isIdentificationCodeAlreadyUsed } from "@/lib/codeIdentificationAuth";

const emptyForm = {
  prenom: "",
  nom: "",
  telephone: "",
  user_email: "",
  code_identification: "",
  quartier: "",
  vehicule: "moto",
  photo_url: "",
  actif: true,
};

export default function LivreurFormDialog({ open, onClose, livreur }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const isEdit = !!livreur;

  useEffect(() => {
    if (livreur) {
      setForm({
        prenom: livreur.prenom || "",
        nom: livreur.nom || "",
        telephone: livreur.telephone || "",
        user_email: livreur.user_email || "",
        code_identification: livreur.code_identification || "",
        quartier: livreur.quartier || "",
        vehicule: livreur.vehicule || "moto",
        photo_url: livreur.photo_url || "",
        actif: livreur.actif !== false,
      });
    } else {
      setForm(emptyForm);
    }
  }, [livreur, open]);

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit
        ? base44.entities.Livreur.update(livreur.id, data)
        : base44.entities.Livreur.create({ ...data, validation: "valide", statut: "hors_ligne" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs"] });
      toast.success(isEdit ? "Livreur mis à jour ✅" : "Livreur créé ✅");
      onClose();
    },
    onError: () => toast.error("Erreur. Réessayez."),
  });

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm((p) => ({ ...p, photo_url: file_url }));
    setUploadingPhoto(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom || !form.telephone) {
      toast.error("Nom et téléphone sont obligatoires");
      return;
    }

    const codeIdentification = form.code_identification.trim().toUpperCase();
    if (!codeIdentification) {
      toast.error("Code d'identification obligatoire");
      return;
    }

    try {
      const codeExists = await isIdentificationCodeAlreadyUsed(codeIdentification, livreur?.id);
      if (codeExists) {
        toast.error("Ce code d'identification est deja utilise");
        return;
      }
      mutation.mutate({ ...form, code_identification: codeIdentification });
    } catch (error) {
      console.error("[LivreurFormDialog] Code uniqueness check failed:", error);
      toast.error("Impossible de verifier le code. Reessayez.");
    }
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
            <Label className="text-xs">Email Base44 du livreur</Label>
            <Input placeholder="email@exemple.com" type="email" value={form.user_email} onChange={(e) => setForm((p) => ({ ...p, user_email: e.target.value }))} />
            <p className="text-[10px] text-muted-foreground">Email du compte Base44 invité pour ce livreur</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Code d'identification *</Label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ex: LVR-001"
                value={form.code_identification}
                onChange={(e) => setForm((p) => ({ ...p, code_identification: e.target.value.toUpperCase() }))}
                className="pl-9 uppercase"
                required
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Code unique utilise par le livreur pour se connecter dans l'APK</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Quartier</Label>
            <Input placeholder="Ex: Ouaga 2000" value={form.quartier} onChange={(e) => setForm((p) => ({ ...p, quartier: e.target.value }))} />
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
              {form.photo_url ? (
                <img src={form.photo_url} alt="Photo" className="w-12 h-12 rounded-full object-cover border-2 border-primary" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                <div className="flex items-center gap-2 text-xs border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingPhoto ? "Envoi..." : form.photo_url ? "Changer" : "Ajouter"}
                </div>
              </label>
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
            <Button type="submit" className="flex-1 bg-primary" disabled={mutation.isPending || uploadingPhoto}>
              {mutation.isPending ? "Enregistrement..." : isEdit ? "Mettre à jour" : "Créer le compte"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
