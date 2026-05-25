import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Navigation, MapPin, Phone, Package, DollarSign, Clock, LogOut, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function LivreurExterneApp({ livreurProfil }) {
  const queryClient = useQueryClient();
  const [gpsActif, setGpsActif] = useState(false);
  const [statut, setStatut] = useState(livreurProfil?.statut || "hors_ligne");

  // Récupérer le profil livreur en temps réel
  const { data: livreur } = useQuery({
    queryKey: ["livreur-externe-profil", livreurProfil?.id],
    queryFn: () => base44.entities.Livreur.get(livreurProfil.id),
    initialData: livreurProfil,
    refetchInterval: 10000,
  });

  // Mes courses
  const { data: mesCourses = [] } = useQuery({
    queryKey: ["mes-courses-externes", livreur?.id],
    queryFn: () => base44.entities.CourseExterne.filter({ livreur_id: livreur?.id }, "-created_date", 50),
    enabled: !!livreur?.id,
    initialData: [],
    refetchInterval: 5000,
  });

  const courseEnCours = mesCourses.find(c => ["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut));
  const totalEncaisse = mesCourses
    .filter(c => c.statut === "livree" && c.montant_livreur)
    .reduce((sum, c) => sum + c.montant_livreur, 0);

  const montantDüSilga = livreur?.montant_du_silga || 0;

  // Mutation statut
  const statutMutation = useMutation({
    mutationFn: (newStatut) => base44.entities.Livreur.update(livreur.id, { statut: newStatut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreur-externe-profil"] });
      toast.success("Statut mis à jour");
    },
  });

  const handleToggleLigne = () => {
    statutMutation.mutate(statut === "hors_ligne" ? "disponible" : "hors_ligne");
  };

  // GPS
  const handleActiverGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsActif(true);
        base44.entities.Livreur.update(livreur.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          derniere_position_date: new Date().toISOString(),
        });
        toast.success("GPS activé");
      },
      () => toast.error("Permission GPS refusée")
    );
  };

  // Tracking GPS périodique
  useEffect(() => {
    if (!livreur?.id || statut === "hors_ligne" || !gpsActif) return;
    const interval = setInterval(() => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => base44.entities.Livreur.update(livreur.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          derniere_position_date: new Date().toISOString(),
        })
      );
    }, 30000);
    return () => clearInterval(interval);
  }, [livreur?.id, statut, gpsActif]);

  // Accepter/Refuser course
  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CourseExterne.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
    },
  });

  const handleAccepter = (course) => {
    updateCourseMutation.mutate({ 
      id: course.id, 
      data: { statut: "livreur_en_route", heure_acceptation: new Date().toISOString() } 
    });
    setStatut("en_course");
    statutMutation.mutate("en_course");
    toast.success("Course acceptée !");
  };

  const handleRefuser = (course) => {
    updateCourseMutation.mutate({ 
      id: course.id, 
      data: { statut: "recherche_livreur", livreur_id: "", livreur_nom: "" } 
    });
    setStatut("disponible");
    statutMutation.mutate("disponible");
    toast("Course refusée");
  };

  const handleColisRecupere = (course) => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateCourseMutation.mutate({
          id: course.id,
          data: {
            statut: "en_livraison",
            heure_recuperation: new Date().toISOString(),
            latitude_recuperation: pos.coords.latitude,
            longitude_recuperation: pos.coords.longitude,
          },
        });
        toast.success("Colis récupéré ! En route vers la livraison");
      },
      () => toast.error("GPS non disponible")
    );
  };

  const handleColisLivre = (course) => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateCourseMutation.mutate({
          id: course.id,
          data: {
            statut: "livree",
            heure_livraison: new Date().toISOString(),
            latitude_livraison: pos.coords.latitude,
            longitude_livraison: pos.coords.longitude,
          },
        });
        // Appel fonction pour calcul prix final
        base44.functions.invoke("calculPrixCourseExterne", { course_id: course.id });
        setStatut("disponible");
        statutMutation.mutate("disponible");
        toast.success("Course livrée ! Prix calculé automatiquement");
      },
      () => toast.error("GPS non disponible")
    );
  };

  const handleLogout = () => {
    base44.entities.Livreur.update(livreur.id, { app_active: false, statut: "hors_ligne" });
    ['base44_access_token', 'access_token'].forEach(k => localStorage.removeItem(k));
    base44.auth.logout();
    setTimeout(() => window.location.reload(), 300);
  };

  if (!livreur) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Truck className="w-8 h-8 text-primary animate-pulse mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  const isEnLigne = statut !== "hors_ligne";

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-foreground">{livreur.prenom} {livreur.nom}</h1>
              <p className="text-xs text-muted-foreground">Livreur Externe</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isEnLigne ? "default" : "secondary"}>
                {isEnLigne ? "En ligne" : "Hors ligne"}
              </Badge>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={isEnLigne ? "destructive" : "default"}
              onClick={handleToggleLigne}
              disabled={statutMutation.isPending}
            >
              {isEnLigne ? "Hors ligne" : "En ligne"}
            </Button>
            {!gpsActif && (
              <Button variant="outline" onClick={handleActiverGPS} className="gap-1">
                <Navigation className="w-3 h-3" />
                GPS
              </Button>
            )}
          </div>

          {!gpsActif && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Activez le GPS pour recevoir des courses et être visible sur la carte
              </p>
            </div>
          )}
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 bg-green-50 border-green-200">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-600" />
              <p className="text-xs text-green-700 font-semibold">Gagné aujourd'hui</p>
            </div>
            <p className="text-xl font-bold text-green-900">{totalEncaisse.toLocaleString()} F</p>
          </Card>
          <Card className="p-3 bg-red-50 border-red-200">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-xs text-red-700 font-semibold">Dû à Silga</p>
            </div>
            <p className="text-xl font-bold text-red-900">{montantDüSilga.toLocaleString()} F</p>
            <p className="text-[10px] text-red-600">(30% commission)</p>
          </Card>
        </div>

        {/* Course en cours */}
        {courseEnCours ? (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-foreground">Course en cours</h2>
              <Badge>{courseEnCours.statut}</Badge>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Récupération</p>
                <p className="font-semibold">{courseEnCours.adresse_depart}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Livraison</p>
                <p className="font-semibold">{courseEnCours.adresse_arrivee}</p>
              </div>

              {courseEnCours.prix_estimate && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                  <p className="text-xs text-blue-700">
                    Prix estimé : ~{courseEnCours.prix_estimate.toLocaleString()} F
                  </p>
                  <p className="text-[10px] text-blue-600 mt-1">
                    Prix final calculé à la livraison (100 F/km réel)
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {courseEnCours.statut === "livreur_en_route" && (
                  <Button
                    className="flex-1 bg-primary"
                    onClick={() => handleColisRecupere(courseEnCours)}
                  >
                    <Package className="w-3 h-3 mr-2" />
                    Colis récupéré
                  </Button>
                )}
                {courseEnCours.statut === "en_livraison" && (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleColisLivre(courseEnCours)}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-2" />
                    Colis livré
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ) : (
          isEnLigne && gpsActif && (
            <Card className="p-8 text-center">
              <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">En attente de course...</p>
              <p className="text-xs text-muted-foreground mt-2">
                Vous recevrez une notification quand une course est disponible
              </p>
            </Card>
          )
        )}

        {/* Historique */}
        <Card className="p-4">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Historique
          </h3>
          <div className="space-y-2">
            {mesCourses.filter(c => c.statut === "livree").slice(0, 5).map(course => (
              <div key={course.id} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <p className="text-xs font-semibold">{course.adresse_depart} → {course.adresse_arrivee}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {course.heure_livraison ? format(new Date(course.heure_livraison), "dd/MM HH:mm", { locale: fr }) : "-"}
                  </p>
                </div>
                {course.montant_livreur && (
                  <p className="text-sm font-bold text-green-600">+{course.montant_livreur.toLocaleString()} F</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}