import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Truck, MapPin, Phone, User, Check, X, Navigation, ArrowDown, Package, AlertTriangle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

// Vibration répétée tant qu'une course est en attente
function useVibration(active) {
  const intervalRef = useRef(null);
  useEffect(() => {
    if (active && navigator.vibrate) {
      navigator.vibrate([400, 200, 400, 200, 400]);
      intervalRef.current = setInterval(() => {
        navigator.vibrate([400, 200, 400, 200, 400]);
      }, 3000);
    } else {
      navigator.vibrate?.(0);
      clearInterval(intervalRef.current);
    }
    return () => {
      navigator.vibrate?.(0);
      clearInterval(intervalRef.current);
    };
  }, [active]);
}

function CourseEnAttente({ course, onAccepter, onRefuser, isPending }) {
  useVibration(true);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-white border-4 border-primary shadow-2xl animate-pulse">
        <div className="bg-primary text-white text-center py-3 rounded-t-lg">
          <p className="text-lg font-bold">🚨 NOUVELLE COURSE !</p>
          <p className="text-xs opacity-80">Répondez maintenant</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-bold text-base">{course.client_nom || "Client"}</span>
            </div>
            <div className="flex items-center gap-2">
              <a href={`https://wa.me/${course.client_telephone?.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                <Button size="icon" variant="outline" className="h-9 w-9 border-green-500 text-green-600 hover:bg-green-50">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.126 1.535 5.862L0 24l6.335-1.656A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.374l-.36-.214-3.762.983 1.004-3.663-.233-.374A9.818 9.818 0 1112 21.818z"/></svg>
                </Button>
              </a>
              <a href={`tel:${course.client_telephone}`}>
                <Button size="icon" variant="outline" className="h-9 w-9">
                  <Phone className="w-4 h-4" />
                </Button>
              </a>
            </div>
          </div>

          <div className="bg-muted/60 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Récupérer ici</p>
                <p className="text-sm font-semibold">{course.adresse_depart}</p>
              </div>
              {course.gps_depart_lat && (
                <a href={`https://www.google.com/maps?q=${course.gps_depart_lat},${course.gps_depart_lng}`} target="_blank" rel="noreferrer" className="ml-auto">
                  <Navigation className="w-4 h-4 text-primary" />
                </a>
              )}
            </div>
            <ArrowDown className="w-4 h-4 text-muted-foreground mx-auto" />
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Livrer ici</p>
                <p className="text-sm font-semibold">{course.adresse_arrivee}</p>
              </div>
              {course.gps_arrivee_lat && (
                <a href={`https://www.google.com/maps?q=${course.gps_arrivee_lat},${course.gps_arrivee_lng}`} target="_blank" rel="noreferrer" className="ml-auto">
                  <Navigation className="w-4 h-4 text-accent" />
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            {course.prix ? (
              <span className="text-xl font-bold text-foreground">{course.prix.toLocaleString()} FCFA</span>
            ) : <span />}
            {course.urgence === "tres_urgente" && (
              <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-1 rounded">⚡ TRÈS URGENT</span>
            )}
            {course.urgence === "urgente" && (
              <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-1 rounded">⚡ URGENT</span>
            )}
          </div>

          {course.notes && (
            <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">{course.notes}</p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button
              className="h-14 text-base font-bold bg-primary hover:bg-primary/90 flex flex-col gap-0.5"
              onClick={() => onAccepter(course)}
              disabled={isPending}
            >
              <Check className="w-5 h-5" />
              <span className="text-xs">Oui, je prends</span>
            </Button>
            <Button
              variant="destructive"
              className="h-14 text-base font-bold flex flex-col gap-0.5"
              onClick={() => onRefuser(course)}
              disabled={isPending}
            >
              <X className="w-5 h-5" />
              <span className="text-xs">Non, occupé</span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CourseActive({ course, onColisRecupere, onColisLivre, onClientAnnule, isPending }) {
  const [remarque, setRemarque] = useState("");
  const [showRemarque, setShowRemarque] = useState(false);
  const [prixReel, setPrixReel] = useState("");
  const [showPrixModal, setShowPrixModal] = useState(false);

  const colisRecupere = course.statut === "colis_recupere" || course.statut === "en_livraison";
  const colisLivre = course.statut === "livree";

  const handleRemarque = () => {
    if (!remarque.trim()) return;
    base44.entities.Course.update(course.id, { remarque_livreur: remarque });
    setRemarque("");
    setShowRemarque(false);
    toast.success("Remarque enregistrée");
  };

  const handleConfirmerLivraison = () => {
    const montant = parseFloat(prixReel);
    if (!prixReel || isNaN(montant) || montant <= 0) {
      toast.error("Entrez le montant reçu du client");
      return;
    }
    onColisLivre(course, montant);
    setShowPrixModal(false);
    setPrixReel("");
  };

  return (
    <>
      {showPrixModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <p className="text-lg font-bold">💰 Montant reçu du client</p>
              <p className="text-sm text-muted-foreground mt-1">Entrez le montant exact payé par le client</p>
            </div>
            <div className="space-y-2">
              <Input
                type="number"
                placeholder="Ex: 1500"
                value={prixReel}
                onChange={(e) => setPrixReel(e.target.value)}
                className="text-center text-xl font-bold h-14"
                autoFocus
              />
              <p className="text-xs text-center text-muted-foreground">FCFA</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setShowPrixModal(false)}>Annuler</Button>
              <Button className="bg-primary font-bold" onClick={handleConfirmerLivraison} disabled={isPending}>
                Confirmer ✅
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden border-2 border-accent/30">
        <div className="bg-accent/10 px-4 py-2 border-b border-accent/20">
          <p className="text-xs font-semibold text-accent uppercase tracking-wide">Course acceptée ✅</p>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-bold">{course.client_nom}</span>
            </div>
            <a href={`tel:${course.client_telephone}`}>
              <Button size="icon" variant="outline" className="h-8 w-8">
                <Phone className="w-4 h-4" />
              </Button>
            </a>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className={cn(colisRecupere && "line-through text-muted-foreground")}>{course.adresse_depart}</span>
              {course.gps_depart_lat && (
                <a href={`https://www.google.com/maps?q=${course.gps_depart_lat},${course.gps_depart_lng}`} target="_blank" rel="noreferrer">
                  <Navigation className="w-3 h-3 text-primary" />
                </a>
              )}
            </div>
            <ArrowDown className="w-3 h-3 text-muted-foreground ml-1.5" />
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              <span>{course.adresse_arrivee}</span>
              {course.gps_arrivee_lat && (
                <a href={`https://www.google.com/maps?q=${course.gps_arrivee_lat},${course.gps_arrivee_lng}`} target="_blank" rel="noreferrer">
                  <Navigation className="w-3 h-3 text-accent" />
                </a>
              )}
            </div>
          </div>

          {course.prix && <p className="font-bold text-base">{course.prix.toLocaleString()} FCFA</p>}
          {course.notes && <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">{course.notes}</p>}

          <div className="space-y-2 pt-1">
            {!colisRecupere && (
              <Button className="w-full h-12 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white gap-2" onClick={() => onColisRecupere(course)} disabled={isPending}>
                <Package className="w-5 h-5" /> Colis récupéré
              </Button>
            )}
            {colisRecupere && !colisLivre && (
              <Button className="w-full h-12 text-sm font-bold bg-primary gap-2" onClick={() => setShowPrixModal(true)} disabled={isPending}>
                <Check className="w-5 h-5" /> Colis livré ✅
              </Button>
            )}
            {colisLivre && (
              <div className="text-center text-sm font-semibold text-accent py-2 bg-green-50 rounded-lg">
                ✅ Course terminée ! {course.prix_reel ? `— ${course.prix_reel.toLocaleString()} FCFA encaissés` : ""}
              </div>
            )}
          </div>

          {!colisLivre && (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full h-9 text-xs border-destructive text-destructive hover:bg-destructive/10 gap-1.5"
                onClick={() => onClientAnnule(course)}
                disabled={isPending}
              >
                <X className="w-3.5 h-3.5" /> Le client a annulé
              </Button>
              {!showRemarque ? (
                <button className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground" onClick={() => setShowRemarque(true)}>
                  <AlertTriangle className="w-3 h-3" /> Signaler un problème
                </button>
              ) : (
                <div className="flex gap-2">
                  <Textarea placeholder="Décrivez le problème..." value={remarque} onChange={(e) => setRemarque(e.target.value)} className="text-xs min-h-[60px]" />
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRemarque}>OK</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowRemarque(false)}>✕</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

export default function LivreurApp() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoadingAuth, navigateToLogin, logout } = useAuth();

  // Rediriger les admins vers le dashboard
  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated && user?.role === "admin") {
      navigate("/", { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, navigate]);

  // Charger le profil livreur lié à l'email de l'utilisateur connecté
  const { data: livreurProfil } = useQuery({
    queryKey: ["livreur-profil", user?.email],
    queryFn: () => base44.entities.Livreur.filter({ user_email: user.email }),
    enabled: !!user,
    refetchInterval: 10000,
    select: (data) => data[0] || null,
  });

  // Vérifier si le compte est désactivé
  useEffect(() => {
    if (livreurProfil?.actif === false) {
      toast.error("Votre compte a été désactivé.");
      logout();
    }
  }, [livreurProfil?.actif]);

  const { data: mesCourses = [] } = useQuery({
    queryKey: ["mes-courses", livreurProfil?.id],
    queryFn: () => base44.entities.Course.filter({ livreur_id: livreurProfil.id }, "-created_date", 50),
    enabled: !!livreurProfil?.id,
    initialData: [],
    refetchInterval: 5000,
  });

  const courseEnAttente = useMemo(() => mesCourses.find(c => c.statut === "en_attente_livreur"), [mesCourses]);
  const coursesActives = useMemo(() => mesCourses.filter(c => ["acceptee", "colis_recupere", "en_livraison"].includes(c.statut)), [mesCourses]);

  const totalEncaisse = useMemo(() => {
    const today = new Date().toDateString();
    return mesCourses
      .filter(c => c.statut === "livree" && c.prix_reel && new Date(c.heure_livraison || c.updated_date).toDateString() === today)
      .reduce((sum, c) => sum + (c.prix_reel || 0), 0);
  }, [mesCourses]);

  const toggleDispoMutation = useMutation({
    mutationFn: (newStatut) => base44.entities.Livreur.update(livreurProfil.id, { statut: newStatut }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["livreur-profil"] }),
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Course.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes-courses"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });

  const handleAccepter = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "acceptee", heure_acceptation: new Date().toISOString() } });
    base44.entities.Livreur.update(livreurProfil.id, { statut: "en_course" });
    toast.success("Course acceptée !");
  };

  const handleRefuser = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "nouvelle", livreur_id: "", livreur_nom: "" } });
    toast("Course refusée");
  };

  const handleColisRecupere = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "colis_recupere", heure_recuperation: new Date().toISOString() } });
    toast.success("Colis récupéré !");
  };

  const handleColisLivre = (course, prixReel) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "livree", heure_livraison: new Date().toISOString(), prix_reel: prixReel } });
    base44.entities.Livreur.update(livreurProfil.id, { statut: "disponible" });
    queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
    toast.success(`Livraison terminée ! 🎉 ${prixReel.toLocaleString()} FCFA encaissés`);
  };

  const handleClientAnnule = (course) => {
    updateCourseMutation.mutate({ id: course.id, data: { statut: "annulee", remarque_livreur: "Annulé par le client" } });
    base44.entities.Livreur.update(livreurProfil.id, { statut: "disponible" });
    queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
    toast("Course annulée par le client");
  };

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

  // Chargement
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Non connecté → rediriger vers login Base44
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <Truck className="w-14 h-14 text-primary" />
        <h1 className="text-2xl font-bold">Silga Livraison</h1>
        <p className="text-muted-foreground">Connectez-vous pour accéder à votre espace livreur</p>
        <Button className="mt-2 bg-primary" onClick={() => navigateToLogin()}>Se connecter</Button>
      </div>
    );
  }

  // Connecté mais aucun profil livreur trouvé
  if (!livreurProfil) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <Truck className="w-14 h-14 text-muted-foreground opacity-40" />
        <h1 className="text-xl font-bold">Compte non configuré</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          Votre compte n'est pas encore lié à un profil livreur. Contactez un administrateur Silga.
        </p>
        <Button variant="outline" onClick={() => logout()}>Se déconnecter</Button>
      </div>
    );
  }

  const isEnLigne = livreurProfil.statut !== "hors_ligne";

  return (
    <div className="min-h-screen bg-background">
      {courseEnAttente && (
        <CourseEnAttente
          course={courseEnAttente}
          onAccepter={handleAccepter}
          onRefuser={handleRefuser}
          isPending={updateCourseMutation.isPending}
        />
      )}

      <div className="p-4 space-y-4 max-w-lg mx-auto pb-10">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold">{livreurProfil.prenom ? `${livreurProfil.prenom} ${livreurProfil.nom}` : livreurProfil.nom}</p>
              <p className="text-xs text-muted-foreground">{livreurProfil.telephone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{isEnLigne ? "En ligne" : "Hors ligne"}</span>
              <Switch
                checked={isEnLigne}
                onCheckedChange={(checked) => toggleDispoMutation.mutate(checked ? "disponible" : "hors_ligne")}
              />
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => logout()} title="Déconnexion">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Statut */}
        <div className={cn(
          "rounded-xl p-3 text-center font-semibold text-sm",
          livreurProfil.statut === "disponible" && "bg-green-100 text-green-700",
          livreurProfil.statut === "en_course" && "bg-amber-100 text-amber-700",
          livreurProfil.statut === "hors_ligne" && "bg-slate-100 text-slate-500",
        )}>
          {livreurProfil.statut === "disponible" && "✅ Disponible — en attente de courses"}
          {livreurProfil.statut === "en_course" && "🚀 En course"}
          {livreurProfil.statut === "hors_ligne" && "⏸️ Hors ligne"}
        </div>

        {/* Total du jour */}
        {totalEncaisse > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-600 font-medium">Total encaissé aujourd'hui</p>
            <p className="text-xl font-bold text-blue-700">{totalEncaisse.toLocaleString()} FCFA</p>
            <p className="text-xs text-blue-500">Doit à Silga : {totalEncaisse.toLocaleString()} FCFA</p>
          </div>
        )}

        {coursesActives.length === 0 && isEnLigne && (
          <div className="text-center text-muted-foreground text-sm py-12 space-y-2">
            <Package className="w-10 h-10 mx-auto opacity-30" />
            <p>Aucune course en cours</p>
            <p className="text-xs">Vous serez notifié dès qu'une course vous est assignée</p>
          </div>
        )}

        {coursesActives.map(course => (
          <CourseActive
            key={course.id}
            course={course}
            onColisRecupere={handleColisRecupere}
            onColisLivre={handleColisLivre}
            onClientAnnule={handleClientAnnule}
            isPending={updateCourseMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}