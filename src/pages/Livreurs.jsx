import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Phone, MapPin, Check, X, Clock, UserCheck, Copy, Banknote, Pencil, UserX, Trash2, BatteryWarning, KeyRound } from "lucide-react";
import CreateLivreurDialog from "@/components/livreurs/CreateLivreurDialog";
import LivreurFormDialog from "@/components/livreurs/LivreurFormDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useSilgappAuth } from "@/lib/silgappAuth";

function LivreurCard({ livreur, courses, onValider, onRefuser, onToggleStatut, onValiderPaiement, onEdit, onSupprimer, isPending, hasAlerteBatterie }) {
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
    <Card className={cn("p-3 lg:p-4 space-y-3 border-2", bgColor)}>
      <div className="flex items-start gap-3">
        {livreur.photo_url ? (
          <img src={livreur.photo_url} alt={nomComplet} className="w-10 h-10 lg:w-12 lg:h-12 rounded-full object-cover flex-shrink-0 border-2 border-white shadow" />
        ) : (
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Truck className="w-5 h-5 lg:w-6 lg:h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm lg:text-base">{nomComplet}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span className="truncate">{livreur.telephone}</span>
          </div>
          {livreur.quartier && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{livreur.quartier}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {livreur.validation === "valide" && (
            <div className="flex flex-col items-end gap-1">
              {hasAlerteBatterie(livreur.id) && (
                <Badge className="bg-orange-500 text-white text-[9px] lg:text-[10px] gap-1 animate-pulse">
                  <BatteryWarning className="w-2.5 h-2.5 lg:w-3 lg:h-3" /> <span className="hidden lg:inline">Batterie faible</span><span className="lg:hidden">Batt.</span>
                </Badge>
              )}
              <Badge variant="outline" className={cn("text-[9px] lg:text-[10px]",
                isDisponible && "bg-green-100 text-green-700 border-green-200",
                isEnCourse && "bg-red-100 text-red-700 border-red-200",
                livreur.statut === "hors_ligne" && "bg-slate-100 text-slate-500 border-slate-200"
              )}>
                {isDisponible ? "Dispo" : isEnCourse ? "Course" : "Hors ligne"}
              </Badge>
            </div>
          )}
          {livreur.validation === "en_attente" && (
            <Badge variant="outline" className="text-[9px] lg:text-[10px] bg-amber-50 text-amber-700 border-amber-200">En attente</Badge>
          )}
          {livreur.validation === "refuse" && (
            <Badge variant="outline" className="text-[9px] lg:text-[10px] bg-red-50 text-red-600 border-red-200">Refusé</Badge>
          )}
          <span className="text-[9px] lg:text-[10px] text-muted-foreground">{livreur.vehicule || "moto"}</span>
        </div>
      </div>

      {/* Actions validation */}
      {livreur.validation === "en_attente" && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" className="flex-1 min-w-[100px] h-8 bg-accent text-accent-foreground gap-1 text-xs" onClick={() => onValider(livreur)} disabled={isPending}>
            <Check className="w-3.5 h-3.5" /> Valider
          </Button>
          <Button size="sm" variant="destructive" className="flex-1 min-w-[100px] h-8 gap-1 text-xs" onClick={() => onRefuser(livreur)} disabled={isPending}>
            <X className="w-3.5 h-3.5" /> Refuser
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onSupprimer(livreur)} disabled={isPending}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Suppression pour livreurs refusés */}
      {livreur.validation === "refuse" && (
        <Button size="sm" variant="ghost" className="w-full h-8 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onSupprimer(livreur)} disabled={isPending}>
          <Trash2 className="w-3 h-3" /> Supprimer définitivement
        </Button>
      )}

      {/* Actions statut livreur validé - empiler sur mobile */}
      {livreur.validation === "valide" && (
        <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
          <div className="flex flex-wrap gap-2 flex-1">
            {livreur.statut !== "disponible" && (
              <Button size="sm" variant="outline" className="flex-1 min-w-[120px] text-xs h-8" onClick={() => onToggleStatut(livreur, "disponible")} disabled={isPending}>
                Marquer disponible
              </Button>
            )}
            {livreur.statut !== "hors_ligne" && (
              <Button size="sm" variant="outline" className="flex-1 min-w-[120px] text-xs h-8" onClick={() => onToggleStatut(livreur, "hors_ligne")} disabled={isPending}>
                Hors ligne
              </Button>
            )}
            <Button size="sm" variant="outline" className="flex-1 min-w-[100px] h-8 text-xs gap-1" onClick={() => onEdit(livreur)} disabled={isPending}>
              <Pencil className="w-3 h-3" /> Modifier
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 flex-1">
            <Button
              size="sm"
              variant={livreur.actif === false ? "outline" : "destructive"}
              className="flex-1 min-w-[120px] h-8 text-xs gap-1"
              onClick={() => onToggleStatut(livreur, null, livreur.actif !== false)}
              disabled={isPending}
            >
              <UserX className="w-3 h-3" />
              {livreur.actif === false ? "Réactiver" : "Désactiver"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 min-w-[100px] h-8 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onSupprimer(livreur)}
              disabled={isPending}
            >
              <Trash2 className="w-3 h-3" /> Supprimer
            </Button>
          </div>
        </div>
      )}

      {/* Montant dû à Silga */}
      {livreur.validation === "valide" && (
        <div className={cn(
          "rounded-lg p-3 space-y-2",
          isPaye ? "bg-green-50 border border-green-200" : "bg-blue-50 border border-blue-200"
        )}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{nbCourses} course{nbCourses > 1 ? "s" : ""} livrée{nbCourses > 1 ? "s" : ""} aujourd'hui</span>
            {isPaye ? (
              <Badge className="bg-green-500 text-white text-[10px] self-start">✅ Payé</Badge>
            ) : totalDu > 0 ? (
              <Badge className="bg-amber-500 text-white text-[10px] self-start">Non payé</Badge>
            ) : null}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
              className="w-full h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1 mt-1"
              onClick={() => onValiderPaiement(livreur, totalDu)}
              disabled={isPending}
            >
              <Banknote className="w-3.5 h-3.5" /> Valider paiement ({totalDu.toLocaleString()} FCFA)
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
  const { user: currentUser } = useSilgappAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingLivreur, setEditingLivreur] = useState(null);

  const { data: livreurs = [], isLoading, error: livreursError } = useQuery({
    queryKey: ["livreurs"],
    queryFn: async () => {
      const res = await base44.functions.invoke('getLivreurs', {});
      if (!res.data?.success) throw new Error(res.data?.error || 'Erreur chargement livreurs');
      return res.data.livreurs || [];
    },
    initialData: [],
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: () => base44.entities.Course.list("-created_date", 200).catch(() => []),
    initialData: [],
    refetchInterval: 30000,
  });

  const { data: alertes = [] } = useQuery({
    queryKey: ["batterie-alertes"],
    queryFn: () => base44.entities.BatterieAlerte.list("-heure_signalement", 50).catch(() => []),
    initialData: [],
    refetchInterval: 10000,
  });

  // Vérifier si un livreur a une alerte non traitée
  const hasAlerteBatterie = (livreurId) => {
    return alertes.some(a => a.livreur_id === livreurId && !a.traitee);
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.functions.invoke('updateLivreur', { id, data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreurs"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke('deleteLivreur', { id }),
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

  const handleSupprimer = (livreur) => {
    const nomComplet = `${livreur.prenom || ""} ${livreur.nom}`.trim();
    if (!window.confirm(`Supprimer définitivement ${nomComplet} ? Cette action est irréversible.`)) return;
    deleteMutation.mutate(livreur.id);
    toast.success(`${nomComplet} supprimé`);
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

  const genererCodesMutation = useMutation({
    mutationFn: () => base44.functions.invoke("genererCodesLivreurs", {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["livreurs"] });
      toast.success(`${data.results?.length || 0} codes générés avec succès`);
    },
    onError: () => toast.error("Erreur lors de la génération des codes"),
  });

  // Séparer par type_livreur
  const internes = livreurs.filter(l => l.type_livreur === "interne");
  const externes = livreurs.filter(l => l.type_livreur === "externe");
  
  const enAttente = internes.filter(l => l.validation === "en_attente");
  const valides = internes.filter(l => l.validation === "valide");
  const refuses = internes.filter(l => l.validation === "refuse");
  const sansValidation = internes.filter(l => !l.validation);

  const disponibles = valides.filter(l => l.statut === "disponible");
  const enCourse = valides.filter(l => l.statut === "en_course");
  const horsLigne = valides.filter(l => l.statut === "hors_ligne" || !l.statut);

  const [statutFilter, setStatutFilter] = useState(null); // null = tous, "disponible", "en_course", "hors_ligne"

  const currentList = tab === "en_attente" ? [...enAttente, ...sansValidation] : tab === "refuse" ? refuses : [];

  const inscriptionLink = `${window.location.origin}/inscription-livreur`;

  return (
    <div className="px-4 py-4 lg:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
          <h1 className="text-xl lg:text-2xl font-bold">Livreurs Internes</h1>
          {!isLoading && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {internes.length} total
            </span>
          )}
          {livreursError && (
            <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full" title={livreursError?.message}>
              ⚠️ {livreursError?.message || 'Erreur chargement'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline" size="sm" className="gap-1.5 text-xs flex-1 sm:flex-none"
            onClick={() => genererCodesMutation.mutate()}
            disabled={genererCodesMutation.isPending}
          >
            <KeyRound className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{genererCodesMutation.isPending ? "Génération..." : "Générer codes"}</span><span className="sm:hidden">{genererCodesMutation.isPending ? "..." : "Codes"}</span>
          </Button>
          <CreateLivreurDialog reseau="interne" />
        </div>
      </div>

      {/* Filtres rapides statut — cliquables */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setTab("valide"); setStatutFilter(null); }}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            tab === "valide" && statutFilter === null ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground"
          )}
        >
          Tous ({valides.length})
        </button>
        <button
          onClick={() => { setTab("valide"); setStatutFilter("disponible"); }}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            tab === "valide" && statutFilter === "disponible" ? "bg-green-500 text-white border-green-500" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
          )}
        >
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Disponibles ({disponibles.length})
        </button>
        <button
          onClick={() => { setTab("valide"); setStatutFilter("en_course"); }}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            tab === "valide" && statutFilter === "en_course" ? "bg-red-500 text-white border-red-500" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          )}
        >
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> En course ({enCourse.length})
        </button>
        <button
          onClick={() => { setTab("valide"); setStatutFilter("hors_ligne"); }}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            tab === "valide" && statutFilter === "hors_ligne" ? "bg-slate-500 text-white border-slate-500" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
          )}
        >
          <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> Hors ligne ({horsLigne.length})
        </button>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setStatutFilter(null); }}>
        <TabsList>
          <TabsTrigger value="en_attente" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            En attente
            {(enAttente.length + sansValidation.length) > 0 && (
              <Badge className="ml-1 bg-amber-500 text-white text-[10px] h-4 min-w-4 flex items-center justify-center">
                {enAttente.length + sansValidation.length}
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

      {/* Vue 3 colonnes pour les livreurs validés - passe en 1 colonne sur mobile */}
      {tab === "valide" && (
        <div className="grid grid-cols-1 gap-4">
          {/* Section Disponibles */}
          {(statutFilter === null || statutFilter === "disponible") && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b-2 border-green-400">
              <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
              <h3 className="font-semibold text-sm text-green-700">Disponibles</h3>
              <span className="ml-auto text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{disponibles.length}</span>
            </div>
            {isLoading && <p className="text-xs text-muted-foreground text-center py-4">Chargement...</p>}
            {!isLoading && disponibles.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aucun livreur disponible</p>}
            {disponibles.map(livreur => (
              <LivreurCard key={livreur.id} livreur={livreur} courses={courses}
                onValider={handleValider} onRefuser={handleRefuser} onToggleStatut={handleToggleStatut}
                onValiderPaiement={handleValiderPaiement} onEdit={(l) => { setEditingLivreur(l); setShowForm(true); }}
                onSupprimer={handleSupprimer} isPending={updateMutation.isPending || deleteMutation.isPending}
                hasAlerteBatterie={hasAlerteBatterie} />
            ))}
          </div>
          )}

          {/* Section En course */}
          {(statutFilter === null || statutFilter === "en_course") && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b-2 border-red-400">
              <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
              <h3 className="font-semibold text-sm text-red-700">En course</h3>
              <span className="ml-auto text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{enCourse.length}</span>
            </div>
            {!isLoading && enCourse.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aucun livreur en course</p>}
            {enCourse.map(livreur => (
              <LivreurCard key={livreur.id} livreur={livreur} courses={courses}
                onValider={handleValider} onRefuser={handleRefuser} onToggleStatut={handleToggleStatut}
                onValiderPaiement={handleValiderPaiement} onEdit={(l) => { setEditingLivreur(l); setShowForm(true); }}
                onSupprimer={handleSupprimer} isPending={updateMutation.isPending || deleteMutation.isPending}
                hasAlerteBatterie={hasAlerteBatterie} />
            ))}
          </div>
          )}

          {/* Section Hors ligne */}
          {(statutFilter === null || statutFilter === "hors_ligne") && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b-2 border-slate-300">
              <span className="w-3 h-3 rounded-full bg-slate-300 inline-block" />
              <h3 className="font-semibold text-sm text-slate-500">Hors ligne</h3>
              <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{horsLigne.length}</span>
            </div>
            {!isLoading && horsLigne.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aucun livreur hors ligne</p>}
            {horsLigne.map(livreur => (
              <LivreurCard key={livreur.id} livreur={livreur} courses={courses}
                onValider={handleValider} onRefuser={handleRefuser} onToggleStatut={handleToggleStatut}
                onValiderPaiement={handleValiderPaiement} onEdit={(l) => { setEditingLivreur(l); setShowForm(true); }}
                onSupprimer={handleSupprimer} isPending={updateMutation.isPending || deleteMutation.isPending}
                hasAlerteBatterie={hasAlerteBatterie} />
            ))}
          </div>
          )}
        </div>
      )}

      {/* Vue liste pour en attente et refusés - 1 colonne sur mobile */}
      {tab !== "valide" && (
        <div className="grid grid-cols-1 gap-3">
          {isLoading && <p className="text-center text-muted-foreground text-sm py-12">Chargement...</p>}
          {!isLoading && currentList.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-12">
              {tab === "en_attente" && "Aucune candidature en attente"}
              {tab === "refuse" && "Aucun livreur refusé"}
            </p>
          )}
          {currentList.map(livreur => (
            <LivreurCard key={livreur.id} livreur={livreur} courses={courses}
              onValider={handleValider} onRefuser={handleRefuser} onToggleStatut={handleToggleStatut}
              onValiderPaiement={handleValiderPaiement} onEdit={(l) => { setEditingLivreur(l); setShowForm(true); }}
              onSupprimer={handleSupprimer} isPending={updateMutation.isPending || deleteMutation.isPending}
              hasAlerteBatterie={hasAlerteBatterie} />
          ))}
        </div>
      )}

      {/* Dialog modification livreur */}
      <LivreurFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingLivreur(null); }}
        livreur={editingLivreur}
      />
    </div>
  );
}