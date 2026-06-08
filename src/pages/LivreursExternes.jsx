import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import {
  Button
} from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Users, UserCheck, UserX, Phone, Mail, MapPin, Ban, CheckCircle2, RefreshCw, Bike, Car, Truck,
  XCircle, Banknote, Star, Wifi, WifiOff, Power, PowerOff
} from "lucide-react";
import CreateLivreurDialog from "@/components/livreurs/CreateLivreurDialog";
import NotationLivreurPanel from "@/components/admin/NotationLivreurPanel";
import LivreurPhotoUploader from "@/components/livreur/LivreurPhotoUploader";
import AdminStatutLivreurPanel from "@/components/livreurs/AdminStatutLivreurPanel";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ── Helpers (logique unifiée avec CarteLivreursExterne) ───────────────────────
const HEARTBEAT_ON_SEUIL_MIN = 10;
const HEARTBEAT_APP_SEUIL_MIN = 5;

/** ON = statut actif EN BASE + heartbeat < 10 min (idem carte) */
function isON(livreur) {
  const actifEnDB = livreur.statut === "disponible" || livreur.statut === "en_course";
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return false;
  return actifEnDB && (Date.now() - new Date(dt).getTime()) < HEARTBEAT_ON_SEUIL_MIN * 60 * 1000;
}
/** Libre = peut recevoir une nouvelle course */
function isLibre(livreur) {
  return livreur.statut === "disponible" && isON(livreur);
}
/** App ouverte = heartbeat < 5 min (idem carte) */
function isEnLigne(livreur) {
  const dt = livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < HEARTBEAT_APP_SEUIL_MIN * 60 * 1000;
}

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
  const enLigne = isEnLigne(livreur);

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
  const montantPaye = coursesLivrees
    .filter(c => c.statut_paiement_livreur === "paye")
    .reduce((s, c) => s + (c.commission_silga || 0), 0);
  const resteAPayerSilga = Math.max(0, montantDu);

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
                        OFF par l'administration
                      </span>
                    )}
                    {!isAdminOff && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${on ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${on ? "bg-green-500" : "bg-gray-300"}`} />
                      {on ? (livreur.statut === "en_course" ? "🟠 En course (livreur)" : "🟢 ON par le livreur") : "⚫ OFF par le livreur"}
                    </span>
                    )}
                    {on && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${libre ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-blue-100 text-blue-700 border-blue-200"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${libre ? "bg-emerald-500" : "bg-blue-500"}`} />
                        {libre ? "Libre" : "En course"}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${enLigne ? "text-green-700" : "text-gray-400"}`}>
                      {enLigne ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {enLigne ? "App ouverte" : "App fermée"}
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
              <span className="text-muted-foreground">Montant dû à Silga</span>
              <span className="font-bold text-orange-600">{montantDu.toLocaleString()} {livreur.devise || "FCFA"}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span>Reste à payer</span>
              <span className={resteAPayerSilga > 0 ? "text-red-600" : "text-green-600"}>
                {resteAPayerSilga.toLocaleString()} FCFA
              </span>
            </div>
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
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : selectedCountry;

  const livreurFilter = effectiveCountry
    ? { type_livreur: "externe", country_code: effectiveCountry }
    : { type_livreur: "externe" };

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes", effectiveCountry || "all"],
    queryFn: () => base44.entities.Livreur.filter(livreurFilter, "-created_date"),
    initialData: [],
    refetchInterval: 10000,
  });

  const coursesFilter = effectiveCountry ? { country_code: effectiveCountry } : {};

  const { data: coursesAll = [] } = useQuery({
    queryKey: ["courses-externes-all-livreurs", isPays ? adminCountryCode : "all"],
    queryFn: () => base44.entities.CourseExterne.filter(coursesFilter, "-created_date", 500),
    initialData: [],
    refetchInterval: 30000,
  });

  const stats = useMemo(() => ({
    total:     livreurs.length,
    on:        livreurs.filter(l => isON(l) && l.actif !== false).length,
    off:       livreurs.filter(l => !isON(l) && l.actif !== false).length,
    libres:    livreurs.filter(l => isLibre(l) && l.actif !== false).length,
    enCourse:  livreurs.filter(l => l.statut === "en_course" && l.actif !== false).length,
    appOuverte: livreurs.filter(l => isEnLigne(l) && l.actif !== false).length,
    appFermee:  livreurs.filter(l => !isEnLigne(l) && l.actif !== false).length,
    valide:    livreurs.filter(l => l.validation === "valide").length,
    bloque:    livreurs.filter(l => l.actif === false).length,
  }), [livreurs]);

  const livreursFiltres = useMemo(() => {
    if (filterStatut === "tous")        return livreurs;
    if (filterStatut === "on")          return livreurs.filter(l => isON(l) && l.actif !== false);
    if (filterStatut === "off")         return livreurs.filter(l => !isON(l) && l.actif !== false);
    if (filterStatut === "libres")      return livreurs.filter(l => isLibre(l) && l.actif !== false);
    if (filterStatut === "en_course")   return livreurs.filter(l => l.statut === "en_course" && l.actif !== false);
    if (filterStatut === "app_ouverte") return livreurs.filter(l => isEnLigne(l) && l.actif !== false);
    if (filterStatut === "app_fermee")  return livreurs.filter(l => !isEnLigne(l) && l.actif !== false);
    if (filterStatut === "bloque")      return livreurs.filter(l => l.actif === false);
    if (filterStatut === "en_attente")  return livreurs.filter(l => l.validation === "en_attente");
    return livreurs;
  }, [livreurs, filterStatut]);

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
    { id: "tous",        label: `Tous (${stats.total})`,              activeClass: "bg-foreground text-background border-foreground",             inactiveClass: "bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground" },
    { id: "on",          label: `ON (${stats.on})`,                   activeClass: "bg-green-500 text-white border-green-500",                     inactiveClass: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
    { id: "off",         label: `OFF (${stats.off})`,                 activeClass: "bg-gray-500 text-white border-gray-500",                       inactiveClass: "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100" },
    { id: "libres",      label: `Libres (${stats.libres})`,           activeClass: "bg-emerald-500 text-white border-emerald-500",                 inactiveClass: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
    { id: "en_course",   label: `En course (${stats.enCourse})`,      activeClass: "bg-blue-500 text-white border-blue-500",                       inactiveClass: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
    { id: "app_ouverte", label: `App ouverte (${stats.appOuverte})`,  activeClass: "bg-green-600 text-white border-green-600",                     inactiveClass: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
    { id: "app_fermee",  label: `App fermée (${stats.appFermee})`,    activeClass: "bg-slate-500 text-white border-slate-500",                     inactiveClass: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" },
    { id: "bloque",      label: `Bloqués (${stats.bloque})`,          activeClass: "bg-destructive text-white border-destructive",                 inactiveClass: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20" },
    { id: "en_attente",  label: `En attente`,                         activeClass: "bg-amber-500 text-white border-amber-500",                     inactiveClass: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
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
          <CreateLivreurDialog reseau="externe" countryCode={effectiveCountry} />
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: "ON",          value: stats.on,         grad: "from-green-500 to-emerald-500",   shadow: "shadow-green-100" },
          { label: "OFF",         value: stats.off,        grad: "from-gray-400 to-gray-500",       shadow: "shadow-gray-100" },
          { label: "Libres",      value: stats.libres,     grad: "from-emerald-500 to-teal-500",    shadow: "shadow-emerald-100" },
          { label: "En course",   value: stats.enCourse,   grad: "from-blue-500 to-indigo-500",     shadow: "shadow-blue-100" },
          { label: "App ouverte", value: stats.appOuverte, grad: "from-cyan-500 to-sky-500",        shadow: "shadow-cyan-100" },
          { label: "App fermée",  value: stats.appFermee,  grad: "from-slate-400 to-slate-500",     shadow: "shadow-slate-100" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-2xl p-3 text-center text-white shadow-md ${s.shadow}`}>
            <p className="text-2xl font-black leading-none">{s.value}</p>
            <p className="text-[10px] font-semibold opacity-80 mt-0.5 uppercase tracking-wide">{s.label}</p>
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
      {livreursFiltres.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7 opacity-30" />
          </div>
          <p className="font-semibold">Aucun livreur</p>
          <p className="text-xs mt-1 opacity-60">Modifiez le filtre ou ajoutez un livreur.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {livreursFiltres.map(livreur => {
            const nomComplet = `${livreur.prenom || ""} ${livreur.nom}`.trim();
            const vb = validationBadge(livreur.validation);
            const isBloque = livreur.actif === false;
            const isAdminOff = !!livreur.admin_hors_ligne;
            const on = isON(livreur);
            const libre = isLibre(livreur);
            const enLigne = isEnLigne(livreur);
            const montantDu = livreur.montant_du_silga || 0;

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
                        {!isAdminOff && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${on ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${on ? "bg-green-500" : "bg-gray-300"}`} />
                            {on ? (livreur.statut === "en_course" ? "🟠 En course" : "🟢 ON") : "⚫ OFF"}
                          </span>
                        )}
                        {on && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${libre ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${libre ? "bg-emerald-500" : "bg-blue-500"}`} />
                            {libre ? "Libre" : "En course"}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${enLigne ? "bg-cyan-100 text-cyan-700" : "bg-gray-100 text-gray-400"}`}>
                          {enLigne ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                          {enLigne ? "App active" : "App fermée"}
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
                    {montantDu > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-100 rounded-full px-2 py-0.5">
                        <Banknote className="w-2.5 h-2.5" />{montantDu.toLocaleString()} F dû
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