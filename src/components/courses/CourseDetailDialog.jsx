import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Phone, User, Package, Clock, Truck, ArrowDown, Navigation, XCircle, KeyRound, Copy, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CourseStatusBadge from "./CourseStatusBadge";
import UrgenceBadge from "./UrgenceBadge";
import MultiColisAdminView from "./MultiColisAdminView";
import ProposedLivreursList from "./ProposedLivreursList";
import ManualAssignLivreurDialog from "./ManualAssignLivreurDialog";
import ChatWindow from "@/components/chat/ChatWindow";
import CoursePriceEditor from "./CoursePriceEditor";
import { UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { genererReferenceCourse } from "@/lib/courseReference";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import { MessageSquareWarning } from "lucide-react";
import AdminETABadge from "./AdminETABadge";
import { getPrixAffichable } from "@/utils/getPrixAffichable";

const STATUTS_INTERNE = [
  "nouvelle", "en_attente_livreur", "acceptee", "en_route_recuperation",
  "colis_recupere", "en_livraison", "livree", "annulee"
];

const STATUTS_EXTERNE = [
  "nouvelle", "en_attente", "recherche_livreur", "livreur_en_route", "arrive_prise_en_charge",
  "colis_recupere", "passager_embarque", "en_livraison", "livree", "annulee"
];

const TYPE_LABELS = { expedier: "📦 Expédition", recevoir: "📥 Réception", deplacement: "👤 Déplacement" };

export default function CourseDetailDialog({ course: courseProp, open, onClose, reseau = "interne" }) {
  const queryClient = useQueryClient();
  const { isPays, countryCode: adminCountryCode } = useAdminContext();
  const statuts = reseau === "externe" ? STATUTS_EXTERNE : STATUTS_INTERNE;
  const [newStatut, setNewStatut] = React.useState(courseProp?.statut || "");
  const [confirmAnnulation, setConfirmAnnulation] = React.useState(false);
  const [adminEmail, setAdminEmail] = React.useState("");
  const [reattributing, setReattributing] = React.useState(false);
  const [relaunching, setRelaunching] = React.useState(false);
  const [showManualAssign, setShowManualAssign] = React.useState(false);
  const countryMismatch = reseau === "externe" && isPays && courseProp?.country_code && courseProp.country_code !== adminCountryCode;

  React.useEffect(() => {
    base44.auth.me().then(u => setAdminEmail(u?.email || "")).catch(() => {});
  }, []);

  // Récupérer la raison d'annulation du livreur si la course a été annulée par un livreur
  const { data: annulationLivreur } = useQuery({
    queryKey: ["annulationLivreur", courseProp?.id],
    queryFn: async () => {
      if (!courseProp?.id) return null;
      const results = await base44.entities.AnnulationLivreur.filter({ course_id: courseProp.id });
      return results?.[0] || null;
    },
    enabled: !!courseProp?.id && reseau === "externe" && ["annulee", "en_attente", "nouvelle", "recherche_livreur"].includes(courseProp?.statut),
  });

  // ── Refetch temps réel de la course pendant que le dialog est ouvert ──
  // Évite l'affichage d'un statut stale (ex: "En route" alors que la course est annulée)
  const { data: courseData } = useQuery({
    queryKey: ["course-detail", courseProp?.id, reseau],
    queryFn: async () => {
      if (!courseProp?.id) return null;
      const entity = reseau === "externe" ? base44.entities.CourseExterne : base44.entities.Course;
      return await entity.get(courseProp.id);
    },
    enabled: open && !!courseProp?.id,
    staleTime: 0,
    refetchInterval: open ? 5000 : false,
  });

  const course = courseData || courseProp;

  React.useEffect(() => {
    setNewStatut(course?.statut || "");
    setConfirmAnnulation(false);
  }, [course]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      if (countryMismatch) {
        throw new Error("Action interdite : cette course appartient a un autre pays");
      }
      if (data.statut === "annulee" && reseau === "externe") {
        // Utiliser la fonction backend dédiée pour les courses externes
        const result = await base44.functions.invoke("annulerCourseExterne", { course_id: id, source: "admin" });
        if (!result?.data?.success) {
          throw new Error(result?.data?.error || "Échec annulation");
        }
        return result.data;
      }
      // Utiliser l'entité correcte selon le réseau
      if (reseau === "externe") {
        return await base44.entities.CourseExterne.update(id, data);
      }
      return await base44.entities.Course.update(id, data);
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries();
      if (variables.data.statut === "annulee") {
        toast.success("Course annulée avec succès");
        onClose();
      } else {
        toast.success("Statut mis à jour");
        onClose();
      }
    },
    onError: (error) => {
      console.error("[CourseDetailDialog] Erreur mutation:", error);
      toast.error("Erreur : " + (error?.message || "impossible de mettre à jour"));
    },
  });

  if (!course) return null;
  if (countryMismatch) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              Acces refuse
            </DialogTitle>
          </DialogHeader>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            Cette course appartient au pays {course.country_code}. Votre compte admin est limite au pays {adminCountryCode}.
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleReattribuer = async () => {
    setReattributing(true);
    try {
      let livreurId = course.livreur_id || annulationLivreur?.livreur_id;
      let livreurNom = course.livreur_nom || annulationLivreur?.livreur_nom;
      // Si livreur_id manquant, rechercher par nom
      if (!livreurId && livreurNom) {
        const parts = livreurNom.trim().split(/\s+/);
        const nom = parts.pop() || "";
        const prenom = parts.join(" ");
        const filters = [];
        if (prenom) filters.push({ prenom, nom });
        filters.push({ nom: livreurNom });
        let found = null;
        for (const f of filters) {
          found = await base44.entities.Livreur.filter(f).catch(() => []);
          if (found?.length > 0) { found = found[0]; break; }
        }
        if (found?.id) livreurId = found.id;
      }
      if (!livreurId) {
        toast.error("Impossible de retrouver ce livreur en base");
        setReattributing(false);
        return;
      }
      await base44.entities.CourseExterne.update(course.id, {
        statut: "livreur_en_route",
        dispatch_status: "accepte",
        livreur_id: livreurId,
        livreur_nom: livreurNom,
        heure_acceptation: new Date().toISOString(),
        notes: (course.notes || "") + "\n[Réattribué au même livreur par admin]",
      });
      // Remettre le livreur en course
      await base44.entities.Livreur.update(livreurId, { statut: "en_course" });
      toast.success("Course réattribuée à " + (livreurNom || "ce livreur") + " — statut: En route");
      queryClient.invalidateQueries();
      onClose();
    } catch (error) {
      toast.error("Erreur : " + (error?.message || "réattribution impossible"));
    } finally {
      setReattributing(false);
    }
  };

  const handleRelancerVague0 = async () => {
    setRelaunching(true);
    try {
      await base44.entities.CourseExterne.update(course.id, {
        statut: "recherche_livreur",
        dispatch_status: "en_attente",
        dispatch_wave: 0,
        dispatch_cycle_count: 0,
        dispatch_notified_ids: "[]",
        dispatch_wave_notified_ids: "[]",
        dispatch_refused_ids: "[]",
        dispatch_locked_until: null,
        timeout_expires_at: null,
        livreur_id: "",
        livreur_nom: "",
        livreur_telephone: "",
        livreur_photo_url: "",
        livreur_vehicule: "",
        livreur_note_moyenne: 0,
        livreur_nombre_avis: 0,
      });
      // ── Réinitialiser les notifications DispatchNotification pour permettre
      //    au dispatch engine de re-notifier tous les livreurs ──
      await base44.entities.DispatchNotification.deleteMany({ course_id: course.id }).catch(() => null);
      // Déclencher le dispatch immédiatement
      await base44.functions.invoke("dispatchExterneAuto", {}).catch(() => null);
      toast.success("Course relancée depuis la vague 0");
      queryClient.invalidateQueries();
      onClose();
    } catch (error) {
      toast.error("Erreur : " + (error?.message || "relance impossible"));
    } finally {
      setRelaunching(false);
    }
  };

  const handleStatusUpdate = () => {
    const updateData = { statut: newStatut };
    if (newStatut === "livree") {
      updateData.heure_livraison = new Date().toISOString();
    }
    updateMutation.mutate({ id: course.id, data: updateData });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Course {genererReferenceCourse(course)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + Type */}
          <div className="flex items-center gap-2 flex-wrap">
            {course.type_course && (
              <span className="text-xs font-bold bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full border border-sky-200">
                {TYPE_LABELS[course.type_course] || course.type_course}
              </span>
            )}
            <CourseStatusBadge statut={course.statut} />
            {course.priority && course.priority !== "normal" && <UrgenceBadge urgence={course.priority} />}
            {(() => { const p = getPrixAffichable(course); return p ? <span className="text-sm font-bold">{p.toLocaleString()} FCFA</span> : null; })()}
            {course.delivery_confirmed_by === 'pin_secours' && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">🔑 PIN secours</span>
            )}
          </div>

          {/* Client */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">{course.client_nom}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{course.client_telephone}</span>
            </div>
          </div>

          {/* Route */}
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Départ</p>
                <p className="text-sm font-medium">{course.adresse_depart}</p>
              </div>
            </div>
            <div className="ml-2"><ArrowDown className="w-3 h-3 text-muted-foreground" /></div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-accent mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Arrivée</p>
                <p className="text-sm font-medium">{course.adresse_arrivee}</p>
              </div>
            </div>
          </div>

          {/* Livreur */}
          {course.livreur_nom && (
            <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-2 min-w-0">
                <Truck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium truncate">{course.livreur_nom}</span>
              </div>
              <AdminETABadge course={course} />
            </div>
          )}

          {/* Prix modifiable */}
          {reseau === "externe" && (
            <CoursePriceEditor course={course} context="admin" />
          )}

          {/* Réattribuer au même livreur (course annulée) — placé ici pour être visible immédiatement */}
          {reseau === "externe" && course.statut === "annulee" && (course.livreur_id || course.livreur_nom || annulationLivreur?.livreur_id || annulationLivreur?.livreur_nom) && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Réattribuer cette course au même livreur
              </p>
              <Button
                variant="outline"
                className="w-full border-blue-400 text-blue-700 hover:bg-blue-100 font-bold"
                disabled={updateMutation.isPending || reattributing}
                onClick={handleReattribuer}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Réattribuer à {course.livreur_nom || annulationLivreur?.livreur_nom}
              </Button>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Créée : {format(new Date(course.created_date), "dd/MM HH:mm", { locale: fr })}
            </div>
            {course.heure_acceptation && (
              <div>Acceptée : {format(new Date(course.heure_acceptation), "HH:mm")}</div>
            )}
            {course.heure_recuperation && (
              <div>Récupérée : {format(new Date(course.heure_recuperation), "HH:mm")}</div>
            )}
            {course.heure_livraison && (
              <div>Livrée : {format(new Date(course.heure_livraison), "HH:mm")}</div>
            )}
          </div>

          {/* GPS tracking info */}
          {(course.distance_reelle_km || course.colis_recupere_at) && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Navigation className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-bold text-blue-700 uppercase">Suivi GPS</p>
              </div>
              
              {course.distance_reelle_km && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-blue-600" />
                    <span className="text-xs text-blue-600 font-semibold">Distance</span>
                  </div>
                  <span className="text-sm font-black text-blue-700">{course.distance_reelle_km.toFixed(2)} km</span>
                </div>
              )}

              {course.heure_recuperation && course.heure_livraison && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-purple-600" />
                    <span className="text-xs text-purple-600 font-semibold">Durée</span>
                  </div>
                  <span className="text-sm font-black text-purple-700">
                    {Math.round((new Date(course.heure_livraison).getTime() - new Date(course.heure_recuperation).getTime()) / 60000)} min
                  </span>
                </div>
              )}

              {(course.latitude_recuperation || course.colis_recupere_at) && (
                <div className="pt-2 border-t border-blue-200">
                  <p className="text-[10px] text-blue-400 font-semibold uppercase mb-1">Départ livraison</p>
                  {course.latitude_recuperation && (
                    <p className="text-xs font-medium text-blue-700">
                      {course.latitude_recuperation.toFixed(6)}, {course.longitude_recuperation?.toFixed(6)}
                    </p>
                  )}
                  {course.heure_recuperation && (
                    <p className="text-[10px] text-blue-400 mt-0.5">
                      {format(new Date(course.heure_recuperation), "HH:mm:ss")}
                    </p>
                  )}
                </div>
              )}

              {(course.latitude_arrivee_livraison || course.colis_livre_at) && (
                <div className="pt-2 border-t border-blue-200">
                  <p className="text-[10px] text-blue-400 font-semibold uppercase mb-1">Arrivée livraison</p>
                  {course.latitude_arrivee_livraison && (
                    <p className="text-xs font-medium text-blue-700">
                      {course.latitude_arrivee_livraison.toFixed(6)}, {course.longitude_arrivee_livraison?.toFixed(6)}
                    </p>
                  )}
                  {course.colis_livre_at && (
                    <p className="text-[10px] text-blue-400 mt-0.5">
                      {format(new Date(course.colis_livre_at), "HH:mm:ss")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Multi-colis admin view */}
          {reseau === "externe" && course.is_multi_colis && course.nb_colis > 1 && (
            <MultiColisAdminView course={course} />
          )}

          {/* Codes PIN récupération / livraison */}
          {reseau === "externe" && (course.pickup_code_4_digits || course.delivery_code_4_digits) && (
            <div className="grid grid-cols-2 gap-2">
              {course.pickup_code_4_digits && (
                <button
                  onClick={() => { navigator.clipboard?.writeText(course.pickup_code_4_digits); toast.success("Code récupération copié"); }}
                  className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-200 rounded-xl p-3 hover:bg-amber-100 transition"
                >
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase">Récupération</span>
                  <span className="text-xl font-black text-amber-800 tracking-widest">{course.pickup_code_4_digits}</span>
                  <Copy className="w-3 h-3 text-amber-400" />
                </button>
              )}
              {course.delivery_code_4_digits && (
                <button
                  onClick={() => { navigator.clipboard?.writeText(course.delivery_code_4_digits); toast.success("Code livraison copié"); }}
                  className="flex flex-col items-center gap-1 bg-green-50 border border-green-200 rounded-xl p-3 hover:bg-green-100 transition"
                >
                  <KeyRound className="w-4 h-4 text-green-600" />
                  <span className="text-[10px] font-bold text-green-700 uppercase">Livraison</span>
                  <span className="text-xl font-black text-green-800 tracking-widest">{course.delivery_code_4_digits}</span>
                  <Copy className="w-3 h-3 text-green-400" />
                </button>
              )}
            </div>
          )}

          {/* Raison d'annulation du livreur */}
          {annulationLivreur && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-bold text-red-700 flex items-center gap-1.5 uppercase">
                <MessageSquareWarning className="w-3.5 h-3.5" />
                Raison de l'annulation — {annulationLivreur.livreur_nom || "Livreur"}
              </p>
              <p className="text-sm text-red-800 font-medium capitalize">
                {annulationLivreur.motif?.replace(/_/g, " ") || "Non précisé"}
              </p>
              {annulationLivreur.motif_detail && (
                <p className="text-sm text-red-600 italic">« {annulationLivreur.motif_detail} »</p>
              )}
              {annulationLivreur.date_annulation && (
                <p className="text-[10px] text-red-400">
                  {format(new Date(annulationLivreur.date_annulation), "dd/MM/yyyy à HH:mm", { locale: fr })}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          {course.notes && (
            <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
              {course.notes}
            </div>
          )}

          {/* Relance depuis la vague 0 — visible quand le cycle dispatch est épuisé */}
          {reseau === "externe" && course.dispatch_status === "cycle_epuise" && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Cycle dispatch épuisé
              </p>
              <Button
                variant="outline"
                className="w-full border-amber-400 text-amber-700 hover:bg-amber-100 font-bold"
                disabled={relaunching || updateMutation.isPending}
                onClick={handleRelancerVague0}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {relaunching ? "Relance en cours..." : "Relancer depuis la vague 0"}
              </Button>
            </div>
          )}

          {/* Assignation manuelle par l'admin */}
          {reseau === "externe" && course.statut !== "livree" && course.statut !== "annulee" && (
            <Button
              variant="outline"
              className="w-full border-primary/30 text-primary hover:bg-primary/5 font-bold"
              onClick={() => setShowManualAssign(true)}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Assigner manuellement un livreur
            </Button>
          )}

          {showManualAssign && (
            <ManualAssignLivreurDialog
              course={course}
              open={showManualAssign}
              onClose={() => setShowManualAssign(false)}
              reseau={reseau}
            />
          )}

          {/* Livreurs proposés (dispatch externe) */}
          {reseau === "externe" && <ProposedLivreursList course={course} />}

          {/* Update status */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Select value={newStatut} onValueChange={setNewStatut}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuts.map(s => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={handleStatusUpdate} 
              disabled={newStatut === course.statut || updateMutation.isPending}
              size="sm"
            >
              Mettre à jour
            </Button>
          </div>

          {/* 💬 Messagerie admin */}
          {reseau === "externe" && course.livreur_id && !["livree", "annulee"].includes(course.statut) && (
            <div className="pt-2 border-t">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">💬 Messagerie</p>
              <ChatWindow
                courseId={course.id}
                senderType="admin"
                senderId={adminEmail || "admin"}
                senderName="Admin SILGAPP"
              />
            </div>
          )}

          {/* Annulation rapide */}
          {course.statut !== "annulee" && course.statut !== "livree" && (
            <div className="pt-2 space-y-2">
              {!confirmAnnulation ? (
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={updateMutation.isPending}
                  onClick={() => setConfirmAnnulation(true)}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Annuler la course
                </Button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-red-700 font-medium text-center">Confirmer l'annulation ?</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setConfirmAnnulation(false)}
                    >
                      Non
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={updateMutation.isPending}
                      onClick={() => {
                        console.log("[Annulation] Clic confirmé, course.id:", course.id);
                        updateMutation.mutate({ id: course.id, data: { statut: "annulee" } });
                      }}
                    >
                      {updateMutation.isPending ? "..." : "Oui, annuler"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
