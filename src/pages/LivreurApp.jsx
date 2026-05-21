import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  Truck, MapPin, Phone, User, Package, ArrowDown, 
  Check, X, Navigation, Clock, AlertTriangle 
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CourseStatusBadge from "../components/courses/CourseStatusBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const etapes = [
  { statut: "acceptee", label: "Accepter la course", next: "en_route_recuperation" },
  { statut: "en_route_recuperation", label: "Je pars récupérer", next: "colis_recupere" },
  { statut: "colis_recupere", label: "Colis récupéré", next: "en_livraison" },
  { statut: "en_livraison", label: "En route livraison", next: "livree" },
];

export default function LivreurApp() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(null);
  const [livreurProfil, setLivreurProfil] = useState(null);
  const [remarque, setRemarque] = useState("");

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs"],
    queryFn: () => base44.entities.Livreur.list(),
    initialData: [],
  });

  useEffect(() => {
    if (currentUser && livreurs.length > 0) {
      const found = livreurs.find(l => l.user_email === currentUser.email);
      setLivreurProfil(found || null);
    }
  }, [currentUser, livreurs]);

  const { data: mesCourses = [] } = useQuery({
    queryKey: ["mes-courses", livreurProfil?.id],
    queryFn: () => livreurProfil 
      ? base44.entities.Course.filter({ livreur_id: livreurProfil.id }, "-created_date", 50)
      : [],
    enabled: !!livreurProfil,
    initialData: [],
    refetchInterval: 10000,
  });

  const coursesActives = useMemo(
    () => mesCourses.filter(c => !["livree", "annulee"].includes(c.statut)),
    [mesCourses]
  );

  const toggleDispoMutation = useMutation({
    mutationFn: (newStatut) => base44.entities.Livreur.update(livreurProfil.id, { statut: newStatut }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreurs"] }),
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Course.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes-courses"] });
      toast.success("Course mise à jour");
    },
  });

  // GPS tracking
  useEffect(() => {
    if (!livreurProfil || livreurProfil.statut === "hors_ligne") return;

    const updatePos = () => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          base44.entities.Livreur.update(livreurProfil.id, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            derniere_position_date: new Date().toISOString(),
          });
        },
        () => {},
        { enableHighAccuracy: true }
      );
    };
    updatePos();
    const interval = setInterval(updatePos, 30000);
    return () => clearInterval(interval);
  }, [livreurProfil?.id, livreurProfil?.statut]);

  const handleAvancer = (course) => {
    const etape = etapes.find(e => e.statut === course.statut);
    if (!etape) return;
    const data = { statut: etape.next };
    if (etape.next === "acceptee" || course.statut === "en_attente_livreur") {
      data.statut = "acceptee";
      data.heure_acceptation = new Date().toISOString();
    }
    if (etape.next === "colis_recupere") data.heure_recuperation = new Date().toISOString();
    if (etape.next === "livree") data.heure_livraison = new Date().toISOString();
    updateCourseMutation.mutate({ id: course.id, data });
  };

  const handleAccepter = (course) => {
    updateCourseMutation.mutate({
      id: course.id,
      data: { statut: "acceptee", heure_acceptation: new Date().toISOString() },
    });
    if (livreurProfil) {
      base44.entities.Livreur.update(livreurProfil.id, { statut: "en_course" });
    }
  };

  const handleRefuser = (course) => {
    updateCourseMutation.mutate({
      id: course.id,
      data: { statut: "nouvelle", livreur_id: "", livreur_nom: "" },
    });
  };

  const handleRemarque = (course) => {
    if (!remarque.trim()) return;
    updateCourseMutation.mutate({
      id: course.id,
      data: { remarque_livreur: remarque },
    });
    setRemarque("");
  };

  if (!livreurProfil) {
    return (
      <div className="p-6 text-center space-y-4 max-w-md mx-auto mt-20">
        <Truck className="w-12 h-12 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-bold">Espace Livreur</h1>
        <p className="text-sm text-muted-foreground">
          Votre compte n'est pas lié à un profil livreur. Contactez l'administrateur Silga.
        </p>
      </div>
    );
  }

  const isDisponible = livreurProfil.statut === "disponible" || livreurProfil.statut === "en_course";

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-sm">{livreurProfil.nom}</p>
            <p className="text-xs text-muted-foreground">{livreurProfil.telephone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">En ligne</span>
          <Switch
            checked={isDisponible}
            onCheckedChange={(checked) =>
              toggleDispoMutation.mutate(checked ? "disponible" : "hors_ligne")
            }
          />
        </div>
      </div>

      {/* Status */}
      <Card className={cn(
        "p-3 text-center",
        isDisponible ? "bg-accent/10 border-accent" : "bg-muted"
      )}>
        <p className="text-sm font-medium">
          {livreurProfil.statut === "disponible" && "✅ Vous êtes disponible"}
          {livreurProfil.statut === "en_course" && "🚀 En course"}
          {livreurProfil.statut === "hors_ligne" && "⏸️ Hors ligne"}
        </p>
      </Card>

      {/* Active courses */}
      <h2 className="font-semibold text-sm">
        Courses actives ({coursesActives.length})
      </h2>

      {coursesActives.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-8">
          Aucune course active pour le moment
        </p>
      )}

      {coursesActives.map(course => {
        const nextEtape = etapes.find(e => e.statut === course.statut);
        return (
          <Card key={course.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <CourseStatusBadge statut={course.statut} />
              <span className="text-xs text-muted-foreground">
                {format(new Date(course.created_date), "HH:mm", { locale: fr })}
              </span>
            </div>

            {/* Client */}
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">{course.client_nom}</span>
              <a href={`tel:${course.client_telephone}`} className="ml-auto">
                <Button size="icon" variant="outline" className="h-8 w-8">
                  <Phone className="w-4 h-4" />
                </Button>
              </a>
            </div>

            {/* Route */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span>{course.adresse_depart}</span>
                {course.gps_depart_lat && (
                  <a
                    href={`https://www.google.com/maps?q=${course.gps_depart_lat},${course.gps_depart_lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation className="w-3 h-3 text-primary" />
                  </a>
                )}
              </div>
              <div className="ml-2"><ArrowDown className="w-3 h-3 text-muted-foreground" /></div>
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="w-3.5 h-3.5 text-accent" />
                <span>{course.adresse_arrivee}</span>
                {course.gps_arrivee_lat && (
                  <a
                    href={`https://www.google.com/maps?q=${course.gps_arrivee_lat},${course.gps_arrivee_lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation className="w-3 h-3 text-accent" />
                  </a>
                )}
              </div>
            </div>

            {course.prix && (
              <p className="text-sm font-bold">{course.prix.toLocaleString()} FCFA</p>
            )}

            {course.notes && (
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{course.notes}</p>
            )}

            {/* Actions */}
            {course.statut === "en_attente_livreur" && (
              <div className="flex gap-2">
                <Button className="flex-1 bg-accent gap-1.5" onClick={() => handleAccepter(course)}>
                  <Check className="w-4 h-4" /> Accepter
                </Button>
                <Button variant="destructive" className="flex-1 gap-1.5" onClick={() => handleRefuser(course)}>
                  <X className="w-4 h-4" /> Refuser
                </Button>
              </div>
            )}

            {nextEtape && course.statut !== "en_attente_livreur" && (
              <Button
                className="w-full bg-primary gap-1.5"
                onClick={() => handleAvancer(course)}
              >
                {nextEtape.next === "livree" ? <Check className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                {nextEtape.next === "en_route_recuperation" && "Je pars récupérer"}
                {nextEtape.next === "colis_recupere" && "Colis récupéré"}
                {nextEtape.next === "en_livraison" && "En route livraison"}
                {nextEtape.next === "livree" && "Marquer comme livré"}
              </Button>
            )}

            {/* Remarque */}
            <div className="flex gap-2">
              <Textarea
                placeholder="Ajouter une remarque..."
                value={remarque}
                onChange={(e) => setRemarque(e.target.value)}
                className="text-xs h-8 min-h-[32px]"
              />
              <Button size="sm" variant="outline" className="h-8" onClick={() => handleRemarque(course)}>
                <AlertTriangle className="w-3 h-3" />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}