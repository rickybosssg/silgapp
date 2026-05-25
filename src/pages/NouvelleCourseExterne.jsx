import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MapPin, Phone, Package } from "lucide-react";

export default function NouvelleCourseExterne() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    client_nom: "",
    client_telephone: "",
    adresse_depart: "",
    adresse_arrivee: "",
    type_colis: "petit_colis",
    prix: "",
    urgence: "normale",
    notes: "",
    reseau: "externe",
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Course.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses-externes"] });
      toast.success("Course externe créée avec succès");
      navigate("/");
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.client_telephone) {
      toast.error("Le téléphone du client est obligatoire");
      return;
    }
    createMutation.mutate({
      ...formData,
      prix: formData.prix ? parseFloat(formData.prix) : 0,
    });
  };

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nouvelle Course (Externe)</h1>
          <p className="text-sm text-muted-foreground">Créer une course pour les livreurs externes</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nom du client</Label>
              <Input
                value={formData.client_nom}
                onChange={(e) => setFormData({ ...formData, client_nom: e.target.value })}
                placeholder="Nom complet"
              />
            </div>
            <div>
              <Label>Téléphone du client *</Label>
              <Input
                value={formData.client_telephone}
                onChange={(e) => setFormData({ ...formData, client_telephone: e.target.value })}
                placeholder="+226 XX XX XX XX"
                required
              />
            </div>
          </div>

          <div>
            <Label>Adresse de récupération</Label>
            <Input
              value={formData.adresse_depart}
              onChange={(e) => setFormData({ ...formData, adresse_depart: e.target.value })}
              placeholder="Quartier, rue, point de repère"
            />
          </div>

          <div>
            <Label>Adresse de livraison</Label>
            <Input
              value={formData.adresse_arrivee}
              onChange={(e) => setFormData({ ...formData, adresse_arrivee: e.target.value })}
              placeholder="Quartier, rue, point de repère"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Type de colis</Label>
              <Select
                value={formData.type_colis}
                onValueChange={(value) => setFormData({ ...formData, type_colis: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="petit_colis">Petit colis</SelectItem>
                  <SelectItem value="moyen_colis">Moyen colis</SelectItem>
                  <SelectItem value="gros_colis">Gros colis</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="nourriture">Nourriture</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prix estimé (FCFA)</Label>
              <Input
                type="number"
                value={formData.prix}
                onChange={(e) => setFormData({ ...formData, prix: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <Label>Niveau d'urgence</Label>
            <Select
              value={formData.urgence}
              onValueChange={(value) => setFormData({ ...formData, urgence: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normale">Normale</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
                <SelectItem value="tres_urgente">Très urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes supplémentaires</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Instructions, point de repère, etc."
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90" disabled={createMutation.isPending}>
              <Plus className="w-4 h-4 mr-2" />
              {createMutation.isPending ? "Création..." : "Créer la course"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/")}>
              <X className="w-4 h-4 mr-2" />
              Annuler
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}