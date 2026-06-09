import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Phone, User, Package, Clock, Truck, ArrowDown, Navigation, XCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CourseStatusBadge from "./CourseStatusBadge";
import UrgenceBadge from "./UrgenceBadge";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const statuts = [
  "nouvelle", "en_attente_livreur", "acceptee", "en_route_recuperation",
  "colis_recupere", "en_livraison", "livree", "annulee"
];

export default function CourseDetailDialog({ course, open, onClose }) {
  const queryClient = useQueryClient();
  const [newStatut, setNewStatut] = React.useState(course?.statut || "");
  const [confirmAnnulation, setConfirmAnnulation] = React.useState(false);

  React.useEffect(() => {
    setNewStatut(course?.statut || "");
    setConfirmAnnulation(false);
  }, [course]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const result = await base44.entities.Course.update(id, data);
      return result;
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries();
      if (variables.data.statut === "annulee") {
        toast.success("Course annulée avec succès");
        onClose();
      } else {
        toast.success("Statut mis à jour");
      }
    },
    onError: (error) => {
      console.error("Erreur annulation:", error);
      toast.error("Erreur : " + (error?.message || "impossible d'annuler"));
    },
  });

  if (!course) return null;

  const handleStatusUpdate = () => {
    const updateData = { statut: newStatut };
    if (newStatut === "livree") {
      updateData.heure_livraison = new Date().toISOString();
    }
    updateMutation.mutate({ id: course.id, data: updateData });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Course #{course.id?.slice(-6)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <CourseStatusBadge statut={course.statut} />
            {course.urgence && <UrgenceBadge urgence={course.urgence} />}
            {course.prix && <span className="text-sm font-bold">{course.prix.toLocaleString()} FCFA</span>}
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
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
              <Truck className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{course.livreur_nom}</span>
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
          {(course.distance_km || course.duree_livraison_minutes || course.colis_recupere_at) && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Navigation className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-bold text-blue-700 uppercase">Suivi GPS</p>
              </div>
              
              {course.distance_km && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-blue-600" />
                    <span className="text-xs text-blue-600 font-semibold">Distance</span>
                  </div>
                  <span className="text-sm font-black text-blue-700">{course.distance_km.toFixed(2)} km</span>
                  {course.gps_distance_type && (
                    <span className="text-[10px] text-blue-400 uppercase font-bold">({course.gps_distance_type})</span>
                  )}
                </div>
              )}

              {course.duree_livraison_minutes && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-purple-600" />
                    <span className="text-xs text-purple-600 font-semibold">Durée</span>
                  </div>
                  <span className="text-sm font-black text-purple-700">{course.duree_livraison_minutes} min</span>
                </div>
              )}

              {(course.latitude_depart_livraison || course.colis_recupere_at) && (
                <div className="pt-2 border-t border-blue-200">
                  <p className="text-[10px] text-blue-400 font-semibold uppercase mb-1">Départ livraison</p>
                  {course.latitude_depart_livraison && (
                    <p className="text-xs font-medium text-blue-700">
                      {course.latitude_depart_livraison.toFixed(6)}, {course.longitude_depart_livraison?.toFixed(6)}
                    </p>
                  )}
                  {course.colis_recupere_at && (
                    <p className="text-[10px] text-blue-400 mt-0.5">
                      {format(new Date(course.colis_recupere_at), "HH:mm:ss")}
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

          {/* Notes */}
          {course.notes && (
            <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
              {course.notes}
            </div>
          )}

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
                      onClick={() => updateMutation.mutate({ id: course.id, data: { statut: "annulee" } })}
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