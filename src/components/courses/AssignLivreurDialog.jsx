import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Truck, Star, Phone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function getDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default function AssignLivreurDialog({ course, open, onClose }) {
  const queryClient = useQueryClient();

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
  });

  const assignMutation = useMutation({
    mutationFn: async ({ courseId, livreur }) => {
      await base44.entities.Course.update(courseId, {
        livreur_id: livreur.id,
        livreur_nom: livreur.nom,
        statut: "en_attente_livreur",
      });
      await base44.entities.Notification.create({
        titre: "Course assignée",
        message: `Course de ${course.client_nom} vous est assignée. Départ: ${course.adresse_depart}`,
        type: "course_assignee",
        course_id: courseId,
        destinataire_email: livreur.user_email || "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Livreur assigné avec succès");
      onClose();
    },
  });

  const disponibles = livreurs.filter(l => l.statut === "disponible");
  const sorted = [...disponibles].sort((a, b) => {
    if (!course?.gps_depart_lat) return 0;
    const distA = getDistance(course.gps_depart_lat, course.gps_depart_lng, a.latitude, a.longitude);
    const distB = getDistance(course.gps_depart_lat, course.gps_depart_lng, b.latitude, b.longitude);
    if (distA === null) return 1;
    if (distB === null) return -1;
    return distA - distB;
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Assigner un livreur
          </DialogTitle>
        </DialogHeader>

        {course && (
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {course.adresse_depart} → {course.adresse_arrivee}
          </div>
        )}

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {sorted.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">
              Aucun livreur disponible
            </p>
          )}
          {sorted.map((livreur, index) => {
            const dist = course?.gps_depart_lat 
              ? getDistance(course.gps_depart_lat, course.gps_depart_lng, livreur.latitude, livreur.longitude)
              : null;
            return (
              <div
                key={livreur.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50",
                  index === 0 && "border-accent bg-accent/5"
                )}
              >
                <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{livreur.nom}</span>
                    {index === 0 && (
                      <Badge className="bg-accent text-accent-foreground text-[10px] h-4">
                        <Star className="w-2.5 h-2.5 mr-0.5" /> Recommandé
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />{livreur.telephone}
                    </span>
                    {dist !== null && (
                      <span>{dist.toFixed(1)} km</span>
                    )}
                    <span>{livreur.courses_du_jour || 0} courses</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => assignMutation.mutate({ courseId: course.id, livreur })}
                  disabled={assignMutation.isPending}
                >
                  Assigner
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}