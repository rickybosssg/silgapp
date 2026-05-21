import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Phone, MapPin, Check, X, Clock, UserCheck, Copy, Banknote, Plus, Pencil, UserX } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import LivreurFormDialog from "@/components/livreurs/LivreurFormDialog";

function LivreurCard({ livreur, courses, onValider, onRefuser, onToggleStatut, onValiderPaiement, onEdit, isPending }) {
  const nomComplet = `${livreur.prenom || ""} ${livreur.nom}`.trim();

  // Calcul montant dû à partir des prix réels des courses du jour livrées
  const today = new Date().toDateString();
  const coursesLivrees = courses.filter(c =>
    c.livreur_id === livreur.id &&
    c.statut === "livree" &&
    new Date(c.heure_livraison || c.updated_date).toDateString() === today
  );
  const totalDu = coursesLivrees.reduce((sum, c) => sum + (c.prix_reel || 0), 0);
  const nbCourses = coursesLivrees.length;

  const isPaye = livreur.statut_paiement === "paye";
  const isDisponible = livreur.statut === "disponible";
  const isEnCourse = livreur.statut === "en_course";

  // Couleur de fond selon statut
  const bgColor = isDisponible
    ? "bg-green-50 border-green-300"
    : isEnCourse
    ? "bg-red-50 border-red-300"
    : "bg-white";

  return (
    <Card className={cn("p-4 space-y-3 border-2", bgColor)}>
      <div className="flex items-start gap-3">
        {livreur.photo_url ? (
          <img src={livreur.photo_url} alt={nomComplet} className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-white shadow" />
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
            <Badge variant="outline" className={cn("text-[10px]",
              isDisponible && "bg-green-100 text-green-700 border-green-200",
              isEnCourse && "bg-red-100 text-red-700 border-red-200",
              livreur.statut === "hors_ligne" && "bg-slate-100 text-slate-500 border-slate-200"
            )}>
              {isDisponible ? "Disponible" : isEnCourse ? "En course" : "Hors ligne"}
            </Badge>
          )}
          {livreur.validation === "en_attente" && (
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">En attente</Badge>
          )}
          {livreur.validation === "refuse" && (
            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">Refusé</Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{livreur.vehicule || "moto"}</span>
        </div>
      </div>

      {/* Actions validation */}
      {livreur.validation === "en_attente" && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-8 bg-accent text-accent-foreground gap-1 text-xs" onClick={() => onValider(livreur)} disabled={isPending}>
            <Check className="w-3.5 h-3.5" /> Valider
          </Button>
          <Button size="sm" variant="destructive" className="flex-1 h-8 gap-1 text-xs" onClick={() => onRefuser(livreur)} disabled={isPending}>
            <X className="w-3.5 h-3.5" /> Refuser
          </Button>
        </div>
      )}

      {/* Actions statut livreur validé */}
      {livreur.validation === "valide" && (
        <div className="flex gap-2 flex-wrap">
          {livreur.statut !== "disponible" && (
            <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => onToggleStatut(livreur, "disponible")} disabled={isPending}>
              Marquer disponible
            </Button>
          )}
          {livreur.statut !== "hors_ligne" && (
            <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => onToggleStatut(livreur, "hors_ligne")} disabled={isPending}>
              Hors ligne
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => onEdit(livreur)} disabled={isPending}>
            <Pencil className="w-3 h-3" /> Modifier
          </Button>
          <Button
            size="sm"
            variant={livreur.actif === false ? "outline" : "destructive"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => onToggleStatut(livreur, null, livreur.actif !== false)}
            disabled={isPending}
          >
            <UserX className="w-3 h-3" />
            {livreur.actif === false ? "Réactiver" : "Désactiver"}
          </Button>
        </div>
      )}

      {/* Montant dû à Silga */}
      {livreur.validation === "valide" && (
        <div className={cn(
          "rounded-lg p-3 space-y-1",
          isPaye ? "bg-green-50 border border-green-200" : "bg-blue-50 border border-blue-200"
        )}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{nbCourses} course{nbCourses > 1 ? "s" : ""} livrée{nbCourses > 1 ? "s" : ""} aujourd'hui</span>
            {isPaye ? (
              <Badge className="bg-green-500 text-white text-[10px]">✅ Payé</Badge>
            ) : totalDu > 0 ? (
              <Badge className="bg-amber-500 text-white text-[10px]">Non payé</Badge>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <span className={cn("font-bold text-sm", isPaye ? "text-green-700" : "text-blue-700")}>
              Doit à Silga : {totalDu.toLocaleString()} FCFA
            </span>
          </div>
          {isPaye && livreur.heure_paiement && (
            <p className="text-[10px] text-muted-foreground">
              Payé à {format(new Date(livreur.heure_paiement), "HH:mm", { locale: fr })} par {livreur.admin_paiement || "admin"}
            </p>
          )}
          {!isPaye && totalDu > 0 && (
            <Button
              size="sm"
              className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1 mt-1"
              onClick={() => onValiderPaiement(livreur, totalDu)}
              disabled={isPending}
            >
              <Banknote className="w-3.5 h-3.5" /> Valider paiement
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Livreurs() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("en_attente");
  const [currentUser, setCurrentUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingLivreur, setEditingLivreur] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: livreurs = [], isLoading } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list("-created_date", 200),
    initialData: [],
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.list("-created_date", 200),
    initialData: [],
    refetchInterval: 30000,
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

  const handleToggleStatut = (livreur, statut, desactiver) => {
    if (desactiver !== undefined) {
      // toggle actif/inactif
      updateMutation.mutate({ id: livreur.id, data: { actif: !desactiver } });
      toast(desactiver ? `${livreur.prenom || livreur.nom} désactivé` : `${livreur.prenom || livreur.nom} réactivé`);
    } else {
      updateMutation.mutate({ id: livreur.id, data: { statut } });
    }
  };

  const handleValiderPaiement = (livreur, montant) => {
    updateMutation.mutate({
      id: livreur.id,
      data: {
        statut_paiement: "paye",
        montant_paye: montant,
        heure_paiement: new Date().toISOString(),
        admin_paiement: currentUser?.full_name || currentUser?.email || "admin",
      },
    });
    toast.success(`Paiement de ${montant.toLocaleString()} FCFA validé ✅`);
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
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline" size="sm" className="gap-1.5 text-xs"
            onClick={() => { navigator.clipboard.writeText(inscriptionLink); toast.success("Lien copié !"); }}
          >
            <Copy className="w-3.5 h-3.5" /> Copier lien inscription
          </Button>
          <Button
            size="sm" className="gap-1.5 text-xs bg-primary"
            onClick={() => { setEditingLivreur(null); setShowForm(true); }}
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter un livreur
          </Button>
        </div>
      </div>

      {/* Légende couleurs */}
      <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" /> Disponible</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> En course</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-300 inline-block" /> Hors ligne</span>
      </div>

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
            courses={courses}
            onValider={handleValider}
            onRefuser={handleRefuser}
            onToggleStatut={handleToggleStatut}
            onValiderPaiement={handleValiderPaiement}
            onEdit={(l) => { setEditingLivreur(l); setShowForm(true); }}
            isPending={updateMutation.isPending}
          />
        ))}
      </div>

      <LivreurFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingLivreur(null); }}
        livreur={editingLivreur}
      />
    </div>
  );
}