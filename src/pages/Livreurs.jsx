import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Truck, Plus, Phone, Mail, Bike, Car, Footprints } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const statusColors = {
  disponible: "bg-green-100 text-green-700 border-green-200",
  en_course: "bg-amber-100 text-amber-700 border-amber-200",
  hors_ligne: "bg-slate-100 text-slate-500 border-slate-200",
};

const statusLabels = {
  disponible: "Disponible",
  en_course: "En course",
  hors_ligne: "Hors ligne",
};

const vehicleIcons = {
  moto: Bike,
  velo: Bike,
  voiture: Car,
  a_pied: Footprints,
};

export default function Livreurs() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nom: "", telephone: "", vehicule: "moto", user_email: "" });

  const { data: livreurs = [], isLoading } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Livreur.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs"] });
      toast.success("Livreur ajouté");
      setShowAdd(false);
      setForm({ nom: "", telephone: "", vehicule: "moto", user_email: "" });
    },
  });

  const toggleStatutMutation = useMutation({
    mutationFn: ({ id, statut }) => base44.entities.Livreur.update(id, { statut }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreurs"] }),
  });

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Livreurs</h1>
          <span className="text-sm text-muted-foreground">({livreurs.length})</span>
        </div>
        <Button size="sm" className="gap-1.5 bg-primary" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(statusLabels).map(([key, label]) => {
          const count = livreurs.filter(l => l.statut === key).length;
          return (
            <Badge key={key} variant="outline" className={cn("text-xs py-1 px-3", statusColors[key])}>
              {label}: {count}
            </Badge>
          );
        })}
      </div>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading && <p className="text-muted-foreground text-sm col-span-2 text-center py-12">Chargement...</p>}
        {livreurs.map(livreur => {
          const VehicleIcon = vehicleIcons[livreur.vehicule] || Truck;
          return (
            <Card key={livreur.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <VehicleIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{livreur.nom}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      <span>{livreur.telephone}</span>
                    </div>
                    {livreur.user_email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        <span>{livreur.user_email}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", statusColors[livreur.statut])}>
                    {statusLabels[livreur.statut]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{livreur.courses_du_jour || 0} courses</span>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {livreur.statut !== "disponible" && (
                  <Button size="sm" variant="outline" className="text-xs h-7 flex-1"
                    onClick={() => toggleStatutMutation.mutate({ id: livreur.id, statut: "disponible" })}>
                    Marquer disponible
                  </Button>
                )}
                {livreur.statut !== "hors_ligne" && (
                  <Button size="sm" variant="outline" className="text-xs h-7 flex-1"
                    onClick={() => toggleStatutMutation.mutate({ id: livreur.id, statut: "hors_ligne" })}>
                    Hors ligne
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un livreur</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nom complet *</Label>
              <Input
                placeholder="Nom du livreur"
                value={form.nom}
                onChange={(e) => setForm(p => ({ ...p, nom: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Téléphone *</Label>
              <Input
                placeholder="+226 ..."
                value={form.telephone}
                onChange={(e) => setForm(p => ({ ...p, telephone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email (compte app)</Label>
              <Input
                placeholder="email@example.com"
                value={form.user_email}
                onChange={(e) => setForm(p => ({ ...p, user_email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Véhicule</Label>
              <Select value={form.vehicule} onValueChange={(v) => setForm(p => ({ ...p, vehicule: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="moto">Moto</SelectItem>
                  <SelectItem value="velo">Vélo</SelectItem>
                  <SelectItem value="voiture">Voiture</SelectItem>
                  <SelectItem value="a_pied">À pied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full bg-primary"
              onClick={() => createMutation.mutate(form)}
              disabled={!form.nom || !form.telephone || createMutation.isPending}
            >
              Ajouter le livreur
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}