import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Users, UserCheck, UserX, Phone, Mail, MapPin,
  Ban, CheckCircle2, RefreshCw, Bike, Car, Truck,
  XCircle, Banknote, Star, Wifi, WifiOff, Power, PowerOff, Send, Search
} from "lucide-react";
import CreateLivreurDialog from "@/components/livreurs/CreateLivreurDialog";
import EmailLivreursModal from "@/components/livreurs/EmailLivreursModal";
import NotationLivreurPanel from "@/components/admin/NotationLivreurPanel";
import LivreurPhotoUploader from "@/components/livreur/LivreurPhotoUploader";
import AdminStatutLivreurPanel from "@/components/livreurs/AdminStatutLivreurPanel";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { isLibre, isEnCourse, isON, isAppActive } from "@/lib/dispatchRules.js";
import { isLivreurNoir } from "@/lib/livreurCounters.js";

function validationBadge(v) {
  if (v === "valide") return { label: "Validé", color: "bg-emerald-100 text-emerald-700" };
  if (v === "refuse") return { label: "Refusé", color: "bg-red-100 text-red-700" };
  return { label: "En attente", color: "bg-amber-100 text-amber-700" };
}

function vehiculeIcon(v) {
  if (v === "voiture") return <Car className="w-3.5 h-3.5" />;
  return <Bike className="w-3.5 h-3.5" />;
}

// ── Modal profil complet ──────────────────────────────────────────────────────
function ProfilLivreurModal({ livreur, courses, onClose, onAction }) {
  const [showCourses, setShowCourses] = useState(false);
  const nomComplet = `${livreur.prenom || ""} ${livreur.nom}`.trim();
  const vb = validationBadge(livreur.validation);
  const isBloque = !livreur.actif;
  const isAdminOff = !!livreur.admin_hors_ligne;
  const on = isON(livreur);
  const libre = isLibre(livreur);
  const enMission = isEnCourse(livreur);
  const appActive = isAppActive(livreur);

  // Mise à jour photo livreur
  const handlePhotoChange = async (newPhotoUrl) => {
    try {
      await base44.entities.Livreur.update(livreur.id, { photo_url: newPhotoUrl });
      // Refresh local state
      livreur.photo_url = newPhotoUrl;
    } catch (err) {
      console.error("Erreur update photo:", err);
      toast.error("Erreur lors de la mise à jour de la photo");
    }
  };

  const coursesLivrees = courses.filter(c => c.statut === "livree");
  const coursesActives = courses.filter(c => !["livree", "annulee"].includes(c.statut));
  const montantTotal = coursesLivrees.reduce((s, c) => s + (c.prix_final || 0), 0);
  const montantDu = livreur.montant_du_silga || 0;
  const encoursReel = livreur.encours || 0;
  const resteAPayerSilga = Math.max(0, encoursReel);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-red-600 p-5 flex items-start justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <LivreurPhotoUploader
              photoUrl={livreur.photo_url}
              nomComplet={nomComplet}
              livreurId={livreur.id}
              onPhotoChange={handlePhotoChange}
              canEdit={true}
              size="lg"
            />
            <div>
              <p className="font-bold text-lg text-white">{nomComplet}</p>
              <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                {isBloque ? (
                  <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-red-100 text-red-700 border-red-200">Bloqué</span>
                ) : (
                  <>
                    {isAdminOff && (
                      <span className="text-xs px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 bg-red-100 text-red-700 border-red-200">
                        <PowerOff className="w-3 h-3" />
                        OFF Admin
                      </span>
                    )}
                    {/* Badge statut carte (vert/orange/gris) */}
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${
                      libre       ? "bg-green-100 text-green-700 border-green-200" :
                      enMission   ? "bg-orange-100 text-orange-700 border-orange-200" :
                                    "bg-gray-100 text-gray-500 border-gray-200"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${libre ? "bg-green-500" : enMission ? "bg-orange-500" : "bg-gray-400"}`} />
                      {libre ? "Libre" : enMission ? "En mission" : "Hors ligne"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${appActive ? "text-green-700" : "text-gray-400"}`}>
                      {appActive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {appActive ? "App ouverte" : "App fermée"}
                    </span>
                  </>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vb.color}`}>{vb.label}</span>
                {livreur.note_moyenne > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    {livreur.note_moyenne.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Infos de base */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {livreur.telephone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{livreur.telephone}</span>
              </div>
            )}
            {livreur.user_email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate text-xs">{livreur.user_email}</span>
              </div>
            )}
            {livreur.code_identification && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Truck className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{livreur.code_identification}</span>
              </div>
            )}
            {livreur.quartier && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{livreur.quartier}</span>
              </div>
            )}
            {livreur.vehicule && (
              <div className="flex items-center gap-2 text-muted-foreground">
                {vehiculeIcon(livreur.vehicule)}
                <span className="capitalize">{livreur.vehicule}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-700">{courses.length}</p>
              <p className="text-[10px] text-blue-500 mt-0.5">Total courses</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-green-700">{coursesLivrees.length}</p>
              <p className="text-[10px] text-green-500 mt-0.5">Livrées</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-amber-700">{coursesActives.length}</p>
              <p className="text-[10px] text-amber-500 mt-0.5">En cours</p>
            </div>
          </div>

          {/* Finances */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-primary" /> Situation financière
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total cours générées</span>
              <span className="font-semibold">{montantTotal.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Encours (commissions accumulées)</span>
              <span className={`font-bold ${encoursReel > 0 ? "text-red-600" : "text-green-600"}`}>
                {encoursReel.toLocaleString()} {livreur.devise || "FCFA"}
              </span>
            </div>
            {montantDu !== encoursReel && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Ancien montant_du_silga</span>
                <span className="text-gray-400 line-through">{montantDu.toLocaleString()} FCFA</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span>Reste à payer</span>
              <span className={encoursReel > 0 ? "text-red-600" : "text-green-600"}>
                {encoursReel.toLocaleString()} FCFA
              </span>
            </div>
            {livreur.bloque_encours && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 font-medium">
                ⚠️ Bloqué automatiquement — plafond d'encours atteint
              </div>
            )}
          </div>

          {/* Gestion statut admin */}
          <div>
            <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <Power className="w-4 h-4 text-primary" /> Statut administratif
            </p>
            <AdminStatutLivreurPanel
              livreur={livreur}
              coursesActives={courses.filter(c => !["livree", "annulee"].includes(c.statut))}
            />
          </div>

          {/* Notation */}
          <div>
            <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" /> Réputation
            </p>
            <NotationLivreurPanel livreur={livreur} courses={courses} />
          </div>

          {/* Courses récentes */}
          <div>
            <button
              className="flex items-center justify-between w-full text-sm font-semibold text-foreground mb-2"
              onClick={() => setShowCourses(!showCourses)}
            >
              <span>Historique des courses ({courses.length})</span>
              <span className="text-primary text-xs">{showCourses ? "Masquer" : "Voir tout"}</span>
            </button>
            {showCourses && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {courses.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Aucune course</p>
                ) : courses.slice(0, 20).map(c => (
                  <div key={c.id} className="border rounded-lg p-2.5 text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-muted-foreground">
                        {format(new Date(c.created_date), "dd/MM/yyyy HH:mm", { locale: fr })}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        c.statut === "livree" ? "bg-green-100 text-green-700" :
                        c.statut === "annulee" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {c.statut === "livree" ? "Livrée" : c.statut === "annulee" ? "Annulée" : "En cours"}
                      </span>
                    </div>
                    <p className="text-foreground truncate">{c.adresse_depart} → {c.adresse_arrivee || "?"}</p>
                    {c.statut === "livree" && (
                      <div className="flex gap-2 mt-1 text-muted-foreground">
                        {c.distance_reelle_km && <span>📏 {Number(c.distance_reelle_km).toFixed(1)} km</span>}
                        {c.prix_final && <span>💰 {c.prix_final.toLocaleString()} F</span>}
                        {c.commission_silga && <span className="text-orange-600">Dû: {c.commission_silga.toLocaleString()} F</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => onAction("resync", livreur)}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Resynchroniser
            </Button>
            {livreur.validation !== "valide" ? (
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700"
                onClick={() => onAction("valider", livreur)}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Valider
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onAction("refuser", livreur)}
              >
                <UserX className="w-3.5 h-3.5" />
                Révoquer
              </Button>
            )}
          </div>
          {isBloque ? (
            <Button
              size="sm"
              className="w-full gap-1.5 bg-green-600 hover:bg-green-700"
              onClick={() => { onAction("debloquer", livreur); onClose(); }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Débloquer le livreur
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="w-full gap-1.5"
              onClick={() => { onAction("bloquer", livreur); onClose(); }}
            >
              <Ban className="w-3.5 h-3.5" />
              Bloquer le livreur
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            className="w-full gap-1.5 border-2 border-red-200"
            onClick={() => { onAction("supprimer", livreur); onClose(); }}
          >
            <XCircle className="w-3.5 h-3.5" />
            Supprimer définitivement
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function LivreursExternes() {
  const queryClient = useQueryClient();
  const [selectedLivreur, setSelectedLivreur] = useState(null);
  const [filterStatut, setFilterStatut] = useState("tous");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : selectedCountry;

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes", effectiveCountry],
    queryFn: () => effectiveCountry
      ? base44.entities.Livreur.filter({ type_livreur: "externe", country_code: effectiveCountry }, "-created_date")
      : Promise.resolve([]),
    initialData: [],
    refetchInterval: effectiveCountry ? 10000 : false,
    enabled: !!effectiveCountry,
  });

  const { data: coursesAll = [] } = useQuery({
    queryKey: ["courses-externes-all-livreurs", effectiveCountry],
    queryFn: () => effectiveCountry
      ? base44.entities.CourseExterne.filter({ country_code: effectiveCountry }, "-created_date", 500)
      : Promise.resolve([]),
    initialData: [],
    refetchInterval: effectiveCountry ? 30000 : false,
    enabled: !!effectiveCountry,
  });

  const stats = useMemo(() => {
    const actifs = livreurs.filter(l => l.actif !== false);
    return {
      total:      livreurs.length,
      libres:     actifs.filter(l => isLibre(l)).length,
      enMission:  actifs.filter(l => isEnCourse(l)).length,
      horsLigne:  actifs.filter(l => isLivreurNoir(l)).length,
      appOuverte: actifs.filter(l => isAppActive(l)).length,
      valide:     livreurs.filter(l => l.validation === "valide").length,
      bloque:     livreurs.filter(l => l.actif === false).length,
      enAttente:  livreurs.filter(l => l.validation === "en_attente").length,
    };
  }, [livreurs]);

  const livreursFiltres = useMemo(() => {
    if (filterStatut === "tous")        return livreurs;
    if (filterStatut === "libres")      return livreurs.filter(l => isLibre(l) && l.actif !== false);
    if (filterStatut === "en_mission")  return livreurs.filter(l => isEnCourse(l) && l.actif !== false);
    if (filterStatut === "hors_ligne")  return livreurs.filter(l => isLivreurNoir(l) && l.actif !== false);
    if (filterStatut === "app_ouverte") return livreurs.filter(l => isAppActive(l) && l.actif !== false);
    if (filterStatut === "bloque")      return livreurs.filter(l => l.actif === false);
    if (filterStatut === "en_attente")  return livreurs.filter(l => l.validation === "en_attente");
    return livreurs;
  }, [livreurs, filterStatut]);

  const livreursRecherches = useMemo(() => {
    if (!searchQuery.trim()) return livreursFiltres;
    const q = searchQuery.trim().toLowerCase();
    return livreursFiltres.filter(l => {
      const nomComplet = `${l.prenom || ""} ${l.nom || ""}`.trim().toLowerCase();
      const tel = (l.telephone || "").toLowerCase();
      const quartier = (l.quartier || "").toLowerCase();
      const code = (l.code_identification || "").toLowerCase();
      return nomComplet.includes(q) || tel.includes(q) || quartier.includes(q) || code.includes(q);
    });
  }, [livreursFiltres, searchQuery]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.functions.invoke("updateLivreur", { id, data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes"] });
      toast.success("Mis à jour ✓");
    },
    onError: () => toast.error("Erreur de mise à jour"),
  });

  const validationMutation = useMutation({
    mutationFn: ({ id, validation }) => base44.entities.Livreur.update(id, { validation }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes"] });
      toast.success("Validation mise à jour ✓");
    },
    onError: () => toast.error("Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Livreur.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes"] });
      toast.success("Livreur supprimé ✓");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const handleAction = async (action, livreur) => {
    if (action === "bloquer") {
      updateMutation.mutate({ id: livreur.id, data: { actif: false } });
    } else if (action === "debloquer") {
      updateMutation.mutate({ id: livreur.id, data: { actif: true } });
    } else if (action === "valider") {
      validationMutation.mutate({ id: livreur.id, validation: "valide" });
    } else if (action === "refuser") {
      validationMutation.mutate({ id: livreur.id, validation: "refuse" });
    } else if (action === "resync") {
      // Resynchroniser statut : si en_course mais aucune course active, passer à disponible
      const coursesLivreur = coursesAll.filter(c => c.livreur_id === livreur.id);
      const activeStatuts = ["livreur_en_route", "colis_recupere", "en_livraison", "recherche_livreur"];
      const courseActive = coursesLivreur.find(c => activeStatuts.includes(c.statut));
      if (!courseActive && livreur.statut === "en_course") {
        updateMutation.mutate({ id: livreur.id, data: { statut: "disponible" } });
        toast.success("Statut resynchronisé → Disponible");
      } else if (courseActive) {
        toast.info("Ce livreur a une course active en cours — statut correct.");
      } else {
        toast.info("Statut déjà synchronisé.");
      }
    } else if (action === "supprimer") {
      if (window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement ${livreur.nom} ? Cette action est irréversible.`)) {
        deleteMutation.mutate(livreur.id);
      }
    }
  };

  const coursesForLivreur = (livreurId) =>
    coursesAll.filter(c => c.livreur_id === livreurId);

  const FILTRES = [
    { id: "tous",        label: `Tous (${stats.total})`,                 activeClass: "bg-slate-800 text-white border-slate-800",                    inactiveClass: "bg-gray-100 text-gray-500 hover:bg-gray-200 border-transparent" },
    { id: "libres",      label: `Libres (${stats.libres})`,              activeClass: "bg-green-500 text-white border-green-500",                    inactiveClass: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
    { id: "en_mission",  label: `En mission (${stats.enMission})`,       activeClass: "bg-orange-500 text-white border-orange-500",                  inactiveClass: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100" },
    { id: "hors_ligne",  label: `Hors ligne (${stats.horsLigne})`,       activeClass: "bg-gray-600 text-white border-gray-600",                      inactiveClass: "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200" },
    { id: "app_ouverte", label: `App ouverte (${stats.appOuverte})`,     activeClass: "bg-cyan-600 text-white border-cyan-600",                      inactiveClass: "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100" },
    { id: "bloque",      label: `Bloqués (${stats.bloque})`,             activeClass: "bg-destructive text-white border-destructive",                inactiveClass: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20" },
    { id: "en_attente",  label: `En attente (${stats.enAttente})`,       activeClass: "bg-amber-500 text-white border-amber-500",                    inactiveClass: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  ];

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={isPays ? "/" : "/admin/global"}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{isPays ? "Retour" : "Admin Global"}</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Livreurs Externes</h1>
            <p className="text-xs text-muted-foreground">
              {stats.total} livreurs {effectiveCountry ? `(${effectiveCountry})` : "(tous pays)"} • {stats.valide} validés
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={async () => {
              try {
                const res = await base44.functions.invoke("resyncLivreurStatut", {});
                if (res.data?.resynchronises > 0) {
                  toast.success(`${res.data.resynchronises} livreur(s) resynchronisé(s) ✓`);
                  queryClient.invalidateQueries({ queryKey: ["livreurs-externes"] });
                } else {
                  toast.info("Tous les statuts sont déjà corrects.");
                }
              } catch (e) {
                toast.error("Erreur : " + e.message);
              }
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Resync tous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={() => setEmailModalOpen(true)}
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Email tous</span>
          </Button>
          <CreateLivreurDialog reseau="externe" countryCode={effectiveCountry} />
        </div>
      </div>

      {/* Modal envoi email groupé */}
      {emailModalOpen && (
        <EmailLivreursModal
          onClose={() => setEmailModalOpen(false)}
          countryCode={effectiveCountry}
        />
      )}

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par nom, téléphone, quartier ou code..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Statistiques — harmonisées avec la carte dispatch */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Libres",      value: stats.libres,    grad: "from-green-500 to-emerald-500",  shadow: "shadow-green-100",  dot: "bg-green-400" },
          { label: "En mission",  value: stats.enMission, grad: "from-orange-500 to-amber-500",   shadow: "shadow-orange-100", dot: "bg-orange-400" },
          { label: "Hors ligne",  value: stats.horsLigne, grad: "from-gray-600 to-slate-700",     shadow: "shadow-gray-100",   dot: "bg-gray-400" },
          { label: "App ouverte", value: stats.appOuverte,grad: "from-cyan-500 to-sky-500",       shadow: "shadow-cyan-100",   dot: "bg-cyan-400" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-2xl p-3.5 text-white shadow-md ${s.shadow}`}>
            <div className={`w-2 h-2 rounded-full ${s.dot} mb-2`} />
            <p className="text-2xl font-black leading-none">{s.value}</p>
            <p className="text-[10px] font-semibold opacity-80 mt-1 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {FILTRES.map(f => (
          <button
            key={f.id}
            onClick={() => setFilterStatut(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              filterStatut === f.id ? f.activeClass : f.inactiveClass
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {livreursRecherches.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7 opacity-30" />
          </div>
          <p className="font-semibold">Aucun livreur</p>
          <p className="text-xs mt-1 opacity-60">{searchQuery ? "Aucun résultat pour votre recherche." : "Modifiez le filtre ou ajoutez un livreur."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {livreursRecherches.map(livreur => {
            const nomComplet = `${livreur.prenom || ""} ${livreur.nom}`.trim();
            const vb = validationBadge(livreur.validation);
            const isBloque = livreur.actif === false;
            const isAdminOff = !!livreur.admin_hors_ligne;
            const libre = isLibre(livreur);
            const enMission = isEnCourse(livreur);
            const appActive = isAppActive(livreur);
            const encoursReel = livreur.encours || 0;

            return (
              <div
                key={livreur.id}
                className={`flex items-center gap-3 p-3 rounded-2xl border transition-all duration-200 hover:shadow-md cursor-pointer ${
                  isBloque ? "bg-red-50/60 border-red-200" : "bg-white border-gray-100 hover:border-gray-200"
                }`}
                onClick={() => setSelectedLivreur(livreur)}
              >
                {/* Photo / Avatar */}
                <div className="flex-shrink-0">
                  <LivreurPhotoUploader
                    photoUrl={livreur.photo_url}
                    nomComplet={nomComplet}
                    canEdit={false}
                    size="md"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Nom + badges statut */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="font-bold text-sm text-foreground truncate">{nomComplet}</span>
                    {isBloque ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">🔒 Bloqué</span>
                    ) : (
                      <>
                        {isAdminOff && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 bg-red-100 text-red-700">
                            <PowerOff className="w-2.5 h-2.5" />OFF Admin
                          </span>
                        )}
                        {/* Badge statut harmonisé avec la carte dispatch */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${
                          libre      ? "bg-green-100 text-green-700" :
                          enMission  ? "bg-orange-100 text-orange-700" :
                                       "bg-gray-100 text-gray-500"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${libre ? "bg-green-500" : enMission ? "bg-orange-500" : "bg-gray-400"}`} />
                          {libre ? "Libre" : enMission ? "En mission" : "Hors ligne"}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${appActive ? "bg-cyan-100 text-cyan-700" : "bg-gray-100 text-gray-400"}`}>
                          {appActive ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                          {appActive ? "App ouverte" : "App fermée"}
                        </span>
                      </>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${vb.color}`}>{vb.label}</span>
                  </div>

                  {/* Infos contact */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mb-1.5">
                    {livreur.telephone && (
                      <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5" />{livreur.telephone}</span>
                    )}
                    {livreur.quartier && (
                      <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{livreur.quartier}</span>
                    )}
                    {livreur.vehicule && (
                      <span className="flex items-center gap-1">{vehiculeIcon(livreur.vehicule)}{livreur.vehicule}</span>
                    )}
                  </div>

                  {/* Pills finance + note */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {encoursReel > 0 && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${livreur.bloque_encours ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100"}`}>
                        <Banknote className="w-2.5 h-2.5" />{encoursReel.toLocaleString()} F dû
                      </span>
                    )}
                    {livreur.note_moyenne > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow-700 bg-yellow-100 rounded-full px-2 py-0.5">
                        <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                        {livreur.note_moyenne.toFixed(1)} ({livreur.nombre_avis || 0})
                      </span>
                    )}
                    {livreur.code_identification && (
                      <span className="text-[10px] font-mono font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                        #{livreur.code_identification}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions rapides */}
                <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {livreur.validation === "en_attente" && (
                    <Button
                      size="sm"
                      className="h-7 w-7 p-0 rounded-lg bg-green-600 hover:bg-green-700"
                      onClick={() => validationMutation.mutate({ id: livreur.id, validation: "valide" })}
                      disabled={validationMutation.isPending}
                      title="Valider"
                    >
                      <UserCheck className="w-3 h-3" />
                    </Button>
                  )}
                  {isBloque ? (
                    <Button
                      size="sm"
                      className="h-7 w-7 p-0 rounded-lg bg-green-600 hover:bg-green-700"
                      onClick={() => handleAction("debloquer", livreur)}
                      disabled={updateMutation.isPending}
                      title="Débloquer"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 w-7 p-0 rounded-lg"
                      onClick={() => handleAction("bloquer", livreur)}
                      disabled={updateMutation.isPending}
                      title="Bloquer"
                    >
                      <Ban className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal profil */}
      {selectedLivreur && (
        <ProfilLivreurModal
          livreur={selectedLivreur}
          courses={coursesForLivreur(selectedLivreur.id)}
          onClose={() => setSelectedLivreur(null)}
          onAction={(action, livreur) => {
            handleAction(action, livreur);
            if (["valider", "refuser"].includes(action)) {
              // Mettre à jour le livreur sélectionné localement pour refresh de la modal
            }
          }}
        />
      )}
    </div>
  );
}