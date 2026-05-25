import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Navigation, MapPin, Phone, Package, DollarSign, Clock, LogOut, AlertCircle, CheckCircle2, QrCode, Hash, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import VenusChat from "@/components/client/VenusChat";

export default function LivreurExterneApp({ livreurProfil }) {
  const queryClient = useQueryClient();
  const [gpsActif, setGpsActif] = useState(false);
  const [statut, setStatut] = useState(livreurProfil?.statut || "hors_ligne");
  const [showVenusChat, setShowVenusChat] = useState(false);

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

  // États pour validation QR/manual
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationType, setValidationType] = useState(null); // 'pickup' ou 'delivery'
  const [validationMode, setValidationMode] = useState('qr'); // 'qr' ou 'manual'
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);

  const handleColisRecupere = (course) => {
    setValidationType('pickup');
    setValidationMode('qr');
    setManualCode('');
    setShowValidationModal(true);
  };

  const handleColisLivre = (course) => {
    setValidationType('delivery');
    setValidationMode('qr');
    setManualCode('');
    setShowValidationModal(true);
  };

  const handleGetGPS = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("GPS non disponible"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => reject(new Error("GPS non disponible"))
      );
    });
  };

  const handleValidateQR = async () => {
    if (!courseEnCours) return;

    try {
      const gps = await handleGetGPS();
      
      const action = validationType === 'pickup' ? 'validate_pickup_qr' : 'validate_delivery_qr';
      
      const result = await base44.functions.invoke("validateQRCode", {
        course_id: courseEnCours.id,
        action,
        qr_token: manualCode, // Le token QR scanné
        livreur_id: livreur.id,
        latitude: gps.latitude,
        longitude: gps.longitude,
      });

      if (result.success) {
        toast.success(result.message);
        setShowValidationModal(false);
        
        if (validationType === 'delivery') {
          setStatut("disponible");
          statutMutation.mutate("disponible");
        }
        
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      }
    } catch (err) {
      toast.error(err.message || "Erreur de validation");
    }
  };

  const handleValidateManual = async () => {
    if (!courseEnCours || manualCode.length !== 4) {
      toast.error("Code à 4 chiffres requis");
      return;
    }

    try {
      const gps = await handleGetGPS();
      
      const action = validationType === 'pickup' ? 'validate_pickup_manual' : 'validate_delivery_manual';
      
      const result = await base44.functions.invoke("validateQRCode", {
        course_id: courseEnCours.id,
        action,
        code_4_digits: manualCode,
        livreur_id: livreur.id,
        latitude: gps.latitude,
        longitude: gps.longitude,
      });

      if (result.success) {
        toast.success(result.message);
        setShowValidationModal(false);
        
        if (validationType === 'delivery') {
          setStatut("disponible");
          statutMutation.mutate("disponible");
        }
        
        queryClient.invalidateQueries({ queryKey: ["mes-courses-externes"] });
      }
    } catch (err) {
      toast.error(err.message || "Erreur de validation");
    }
  };

  const handleSimulateScan = () => {
    // Simulation : le livreur entre manuellement le code QR token
    toast.info("Pour tester, utilisez le mode 'Code manuel' et entrez le code à 4 chiffres affiché chez le client");
    setValidationMode('manual');
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
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 hover:bg-pink-50"
                onClick={() => setShowVenusChat(true)}
              >
                <img src="https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png" alt="VENUS" className="w-5 h-5 rounded-full object-cover" />
                <span className="text-xs font-medium">VENUS</span>
              </Button>
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
                    <QrCode className="w-3 h-3 mr-2" />
                    Scanner / Valider
                  </Button>
                )}
                {courseEnCours.statut === "en_livraison" && (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleColisLivre(courseEnCours)}
                  >
                    <QrCode className="w-3 h-3 mr-2" />
                    Scanner / Valider
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

        {/* Modal de validation QR/Code */}
        {showValidationModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md p-6 bg-white">
              <div className="flex items-center gap-2 mb-4">
                {validationMode === 'qr' ? (
                  <>
                    <QrCode className="w-6 h-6 text-primary" />
                    <h3 className="font-bold text-lg">
                      {validationType === 'pickup' ? 'Scanner code récupération' : 'Scanner code livraison'}
                    </h3>
                  </>
                ) : (
                  <>
                    <Hash className="w-6 h-6 text-primary" />
                    <h3 className="font-bold text-lg">
                      {validationType === 'pickup' ? 'Code récupération' : 'Code livraison'}
                    </h3>
                  </>
                )}
              </div>

              {validationMode === 'qr' ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900 font-semibold mb-2">
                      Mode scan QR code
                    </p>
                    <p className="text-xs text-blue-700">
                      Demandez au client de vous montrer son QR code. 
                      Si la caméra ne fonctionne pas, utilisez le code manuel.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      className="flex-1" 
                      onClick={handleSimulateScan}
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      Scanner QR
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setValidationMode('manual')}
                    >
                      Code manuel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold">
                      Code à 4 chiffres
                    </Label>
                    <Input
                      type="text"
                      maxLength={4}
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="0000"
                      className="text-2xl text-center tracking-widest h-16"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Demandez au client le code affiché sur son écran
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      className="flex-1" 
                      onClick={handleValidateManual}
                      disabled={manualCode.length !== 4}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Valider
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setValidationMode('qr')}
                    >
                      Retour QR
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t">
                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={() => setShowValidationModal(false)}
                >
                  Annuler
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Chat VENUS */}
      {showVenusChat && <VenusChat onClose={() => setShowVenusChat(false)} />}
    </div>
  );
}