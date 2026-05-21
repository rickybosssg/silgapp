import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Phone, MapPin, Check, X, Clock, UserCheck, Copy } from "lucide-react";
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

function LivreurCard({ livreur, onValider, onRefuser, onToggleStatut, isPending }) {
  const nomComplet = `${livreur.prenom || ""} ${livreur.nom}`.trim();
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        {livreur.photo_url ? (
          <img src={livreur.photo_url} alt={nomComplet} className="w-12 h-12 rounded-full object-cover flex-shrink-0 border" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Truck className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{nomComplet}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span>{livreur.telephone}</span>
          </div>
          {livreur.quartier && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span>{livreur.quartier}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {livreur.validation === "valide" && (
            <Badge variant="outline" className={cn("text-[10px]", statusColors[livreur.statut])}>
              {statusLabels[livreur.statut] || "Hors ligne"}
            </Badge>
          )}
          {livreur.validation === "en_attente" && (
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              En attente
            </Badge>
          )}
          {livreur.validation === "refuse" && (
            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">
              Refusé
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{livreur.vehicule || "moto"}</span>
        </div>
      </div>

      {/* Actions selon validation */}
      {livreur.validation === "en_attente" && (
        <div className="flex gap-2">
          <Button
            size="sm" className="flex-1 h-8 bg-accent text-accent-foreground gap-1 text-xs"
            onClick={() => onValider(livreur)} disabled={isPending}
          >
            <Check className="w-3.5 h-3.5" /> Valider
          </Button>
          <Button
            size="sm" variant="destructive" className="flex-1 h-8 gap-1 text-xs"
            onClick={() => onRefuser(livreur)} disabled={isPending}
          >
            <X className="w-3.5 h-3.5" /> Refuser
          </Button>
        </div>
      )}

      {livreur.validation === "valide" && (
        <div className="flex gap-2">
          {livreur.statut !== "disponible" && (
            <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
              onClick={() => onToggleStatut(livreur, "disponible")} disabled={isPending}>
              Marquer disponible
            </Button>
          )}
          {livreur.statut !== "hors_ligne" && (
            <Button size="sm" variant="outline" className="flex-1 text-xs h-7"
              onClick={() => onToggleStatut(livreur, "hors_ligne")} disabled={isPending}>
              Mettre hors ligne
            </Button>
          )}
          <span className="text-xs text-muted-foreground self-center ml-auto">
            {livreur.courses_du_jour || 0} courses
          </span>
        </div>
      )}
    </Card>
  );
}

export default function Livreurs() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("en_attente");

  const { data: livreurs = [], isLoading } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list("-created_date", 200),
    initialData: [],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Livreur.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreurs"] }),
  });

  const handleValider = (livreur) => {
    updateMutation.mutate({ id: livreur.id, data: { validation: "valide", statut: "hors_ligne" } });
    toast.success(`${livreur.prenom || livreur.nom} validé ✅`);
  };

  const handleRefuser = (livreur) => {
    updateMutation.mutate({ id: livreur.id, data: { validation: "refuse" } });
    toast("Livreur refusé");
  };

  const handleToggleStatut = (livreur, statut) => {
    updateMutation.mutate({ id: livreur.id, data: { statut } });
  };

  const enAttente = livreurs.filter(l => l.validation === "en_attente" || !l.validation);
  const valides = livreurs.filter(l => l.validation === "valide");
  const refuses = livreurs.filter(l => l.validation === "refuse");

  const currentList = tab === "en_attente" ? enAttente : tab === "valide" ? valides : refuses;

  const inscriptionLink = `${window.location.origin}/inscription-livreur`;

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Livreurs</h1>
        </div>
        <Button
          variant="outline" size="sm" className="gap-1.5 text-xs"
          onClick={() => { navigator.clipboard.writeText(inscriptionLink); toast.success("Lien copié !"); }}
        >
          <Copy className="w-3.5 h-3.5" /> Copier lien inscription
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="en_attente" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            En attente
            {enAttente.length > 0 && (
              <Badge className="ml-1 bg-amber-500 text-white text-[10px] h-4 min-w-4 flex items-center justify-center">
                {enAttente.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="valide" className="gap-1.5">
            <UserCheck className="w-3.5 h-3.5" />
            Validés ({valides.length})
          </TabsTrigger>
          <TabsTrigger value="refuse" className="gap-1.5">
            <X className="w-3.5 h-3.5" />
            Refusés ({refuses.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Statuts des validés */}
      {tab === "valide" && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(statusLabels).map(([key, label]) => {
            const count = valides.filter(l => l.statut === key).length;
            return (
              <Badge key={key} variant="outline" className={cn("text-xs py-1 px-3", statusColors[key])}>
                {label}: {count}
              </Badge>
            );
          })}
        </div>
      )}

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading && (
          <p className="col-span-2 text-center text-muted-foreground text-sm py-12">Chargement...</p>
        )}
        {!isLoading && currentList.length === 0 && (
          <p className="col-span-2 text-center text-muted-foreground text-sm py-12">
            {tab === "en_attente" && "Aucune candidature en attente"}
            {tab === "valide" && "Aucun livreur validé"}
            {tab === "refuse" && "Aucun livreur refusé"}
          </p>
        )}
        {currentList.map(livreur => (
          <LivreurCard
            key={livreur.id}
            livreur={livreur}
            onValider={handleValider}
            onRefuser={handleRefuser}
            onToggleStatut={handleToggleStatut}
            isPending={updateMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}