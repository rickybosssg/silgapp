import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { ArrowLeft, MapPin, Navigation, AlertCircle, Loader2, Share2, CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export default function CourseExterneFormSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const typeCourse = location.pathname.includes("expedier") ? "expedier" : "recevoir";
  const position = location.state?.position || JSON.parse(localStorage.getItem("client_gps_position") || "null");
  const clientProfil = location.state?.clientProfil;

  const [formData, setFormData] = useState({
    client_nom: "",
    client_telephone: "",
    expediteur_nom: "",
    expediteur_telephone: "",
    destinataire_nom: "",
    destinataire_telephone: "",
    type_colis: "petit_colis",
    adresse_depart: "",
    adresse_arrivee: "",
    notes: "",
    gps_depart_lat: position?.latitude || null,
    gps_depart_lng: position?.longitude || null,
    gps_arrivee_lat: null,
    gps_arrivee_lng: null,
  });

  const [recuperationGPS, setRecuperationGPS] = useState(false);
  const [livraisonGPS, setLivraisonGPS] = useState(false);
  const [expediteurFound, setExpediteurFound] = useState(null);
  const [destinataireFound, setDestinataireFound] = useState(null);
  const [showShareButton, setShowShareButton] = useState(false);
  const [createdCourseId, setCreatedCourseId] = useState(null);

  // Pré-remplir nom et téléphone depuis le profil client
  useEffect(() => {
    if (clientProfil) {
      setFormData((prev) => ({
        ...prev,
        client_nom: clientProfil.nom || "",
        client_telephone: clientProfil.telephone || "",
      }));
    }
  }, [clientProfil]);

  // Vérifier si expéditeur/destinataire existe dans SILGAPP
  useEffect(() => {
    async function checkClient() {
      if (typeCourse === "expedier" && formData.destinataire_telephone?.length >= 8) {
        try {
          const result = await base44.functions.invoke("clientSync", {
            action: "find_client",
            phone: formData.destinataire_telephone
          });
          
          if (result.found) {
            setDestinataireFound(result);
          } else {
            setDestinataireFound(null);
            setShowShareButton(true);
          }
        } catch (err) {
          console.error("Erreur check client:", err);
        }
      } else if (typeCourse === "recevoir" && formData.expediteur_telephone?.length >= 8) {
        try {
          const result = await base44.functions.invoke("clientSync", {
            action: "find_client",
            phone: formData.expediteur_telephone
          });
          
          if (result.found) {
            setExpediteurFound(result);
          } else {
            setExpediteurFound(null);
            setShowShareButton(true);
          }
        } catch (err) {
          console.error("Erreur check client:", err);
        }
      }
    }

    const timer = setTimeout(checkClient, 500);
    return () => clearTimeout(timer);
  }, [formData.destinataire_telephone, formData.expediteur_telephone, typeCourse]);

  const handleGetGPSDepart = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData({
          ...formData,
          gps_depart_lat: pos.coords.latitude,
          gps_depart_lng: pos.coords.longitude,
        });
        setRecuperationGPS(true);
        toast.success("Position GPS de récupération enregistrée");
      },
      () => toast.error("Impossible d'obtenir la position GPS")
    );
  };

  const handleGetGPSArrivee = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData({
          ...formData,
          gps_arrivee_lat: pos.coords.latitude,
          gps_arrivee_lng: pos.coords.longitude,
        });
        setLivraisonGPS(true);
        toast.success("Position GPS de livraison enregistrée");
      },
      () => toast.error("Impossible d'obtenir la position GPS")
    );
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const course = await base44.entities.CourseExterne.create(data);
      // Créer les notifications si des clients SILGAPP sont impliqués
      if (data.destinataire_client_id || data.expediteur_client_id) {
        try {
          await base44.functions.invoke("notifyClientSync", {
            course_id: course.id
          });
        } catch (err) {
          console.error("Erreur notification:", err);
        }
      }
      return course;
    },
    onSuccess: (response) => {
      toast.success("Course créée ! Recherche d'un livreur en cours...");
      setCreatedCourseId(response.id);
      navigate("/client/suivi");
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const handleShareWhatsApp = async () => {
    if (!createdCourseId) {
      toast.error("Course non créée");
      return;
    }

    try {
      // Créer le lien de suivi
      const trackingResult = await base44.functions.invoke("clientSync", {
        action: "create_tracking_link",
        course_id: createdCourseId
      });

      const trackingLink = trackingResult.tracking_link;
      
      // Message WhatsApp
      const message = typeCourse === "expedier"
        ? `Bonjour, je suis en train de vous envoyer un colis avec SILGAPP. Vous pouvez suivre la livraison en direct ici : ${trackingLink}`
        : `Bonjour, je viens de demander la récupération d'un colis avec SILGAPP. Vous pouvez suivre la livraison en direct ici : ${trackingLink}`;

      // Numéro destinataire
      const recipientPhone = typeCourse === "expedier" 
        ? formData.destinataire_telephone 
        : formData.expediteur_telephone;

      // Nettoyer le numéro pour WhatsApp
      const cleanPhone = recipientPhone.replace(/[^\d]/g, "");
      const whatsappNumber = cleanPhone.startsWith("226") ? cleanPhone : `226${cleanPhone}`;

      // Ouvrir WhatsApp
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank");

      // Mettre à jour la course
      await base44.entities.CourseExterne.update(createdCourseId, {
        tracking_shared_at: new Date().toISOString()
      });

      toast.success("Lien de suivi envoyé sur WhatsApp !");
    } catch (err) {
      console.error("Erreur partage WhatsApp:", err);
      toast.error("Erreur lors du partage");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.client_telephone) {
      toast.error("Le téléphone est obligatoire");
      return;
    }
    if (!formData.gps_depart_lat || !formData.gps_arrivee_lat) {
      toast.error("Les positions GPS de départ et d'arrivée sont obligatoires");
      return;
    }

    // Déterminer expéditeur et destinataire selon le type de course
    let expediteurNom, expediteurTel, expediteurClientId, expediteurPhoneNormalized;
    let destinataireNom, destinataireTel, destinataireClientId, destinatairePhoneNormalized;
    let recipientHasApp = false;

    if (typeCourse === "expedier") {
      // Client = expéditeur
      expediteurNom = formData.client_nom;
      expediteurTel = formData.client_telephone;
      expediteurClientId = clientProfil?.id || null;
      expediteurPhoneNormalized = formData.client_telephone.replace(/\D/g, "").replace(/^226/, "");
      
      destinataireNom = formData.destinataire_nom;
      destinataireTel = formData.destinataire_telephone;
      destinataireClientId = destinataireFound?.client_id || null;
      destinatairePhoneNormalized = formData.destinataire_telephone.replace(/\D/g, "").replace(/^226/, "");
      recipientHasApp = !!destinataireFound;
    } else {
      // Client = destinataire
      destinataireNom = formData.client_nom;
      destinataireTel = formData.client_telephone;
      destinataireClientId = clientProfil?.id || null;
      destinatairePhoneNormalized = formData.client_telephone.replace(/\D/g, "").replace(/^226/, "");
      
      expediteurNom = formData.expediteur_nom;
      expediteurTel = formData.expediteur_telephone;
      expediteurClientId = expediteurFound?.client_id || null;
      expediteurPhoneNormalized = formData.expediteur_telephone.replace(/\D/g, "").replace(/^226/, "");
      recipientHasApp = !!expediteurFound;
    }

    // Calcul distance estimée (Haversine)
    const R = 6371;
    const dLat = ((formData.gps_arrivee_lat - formData.gps_depart_lat) * Math.PI) / 180;
    const dLon = ((formData.gps_arrivee_lng - formData.gps_depart_lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((formData.gps_depart_lat * Math.PI) / 180) *
      Math.cos((formData.gps_arrivee_lat * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceEstimee = R * c;
    const prixEstime = Math.round(distanceEstimee * 100);

    createMutation.mutate({
      client_nom: formData.client_nom,
      client_telephone: formData.client_telephone,
      type_course: typeCourse,
      expediteur_nom: expediteurNom,
      expediteur_telephone: expediteurTel,
      expediteur_phone_normalized: expediteurPhoneNormalized,
      expediteur_client_id: expediteurClientId,
      destinataire_nom: destinataireNom,
      destinataire_telephone: destinataireTel,
      destinataire_phone_normalized: destinatairePhoneNormalized,
      destinataire_client_id: destinataireClientId,
      recipient_has_app: recipientHasApp,
      adresse_depart: formData.adresse_depart,
      adresse_arrivee: formData.adresse_arrivee,
      type_colis: formData.type_colis,
      notes: formData.notes,
      gps_depart_lat: formData.gps_depart_lat,
      gps_depart_lng: formData.gps_depart_lng,
      gps_arrivee_lat: formData.gps_arrivee_lat,
      gps_arrivee_lng: formData.gps_arrivee_lng,
      prix_estimate: prixEstime,
      statut: "recherche_livreur",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/client")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {typeCourse === "expedier" ? "Expédier un colis" : "Recevoir un colis"}
            </h1>
            <p className="text-xs text-muted-foreground">Remplissez les informations</p>
          </div>
        </div>

        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Infos client */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nom {typeCourse === "expedier" ? "(expéditeur)" : "(destinataire)"}</Label>
                <Input
                  value={formData.client_nom}
                  onChange={(e) => setFormData({ ...formData, client_nom: e.target.value })}
                  placeholder="Votre nom"
                  required
                />
              </div>
              <div>
                <Label>Téléphone *</Label>
                <Input
                  type="tel"
                  value={formData.client_telephone}
                  onChange={(e) => setFormData({ ...formData, client_telephone: e.target.value })}
                  placeholder="+226 XX XX XX XX"
                  required
                />
              </div>
            </div>

            {/* Infos autre partie */}
            {typeCourse === "expedier" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nom du destinataire</Label>
                    <Input
                      value={formData.destinataire_nom}
                      onChange={(e) => setFormData({ ...formData, destinataire_nom: e.target.value })}
                      placeholder="Nom complet"
                    />
                  </div>
                  <div>
                    <Label>Téléphone destinataire *</Label>
                    <Input
                      type="tel"
                      value={formData.destinataire_telephone}
                      onChange={(e) => setFormData({ ...formData, destinataire_telephone: e.target.value })}
                      placeholder="+226 XX XX XX XX"
                      required
                    />
                  </div>
                </div>
                
                {/* Status destinataire */}
                {formData.destinataire_telephone?.length >= 8 && (
                  <div className={`p-3 rounded-lg border ${
                    destinataireFound 
                      ? "bg-green-50 border-green-200" 
                      : "bg-yellow-50 border-yellow-200"
                  }`}>
                    <div className="flex items-center gap-2">
                      {destinataireFound ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="text-sm font-semibold text-green-900">
                              Destinataire trouvé sur SILGAPP !
                            </p>
                            <p className="text-xs text-green-700">
                              {destinataireFound.client_nom} sera automatiquement notifié
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-5 h-5 text-yellow-600" />
                          <div>
                            <p className="text-sm font-semibold text-yellow-900">
                              Destinataire non inscrit
                            </p>
                            <p className="text-xs text-yellow-700">
                              Partagez le lien de suivi par WhatsApp
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nom de l'expéditeur</Label>
                    <Input
                      value={formData.expediteur_nom}
                      onChange={(e) => setFormData({ ...formData, expediteur_nom: e.target.value })}
                      placeholder="Nom complet"
                    />
                  </div>
                  <div>
                    <Label>Téléphone expéditeur *</Label>
                    <Input
                      type="tel"
                      value={formData.expediteur_telephone}
                      onChange={(e) => setFormData({ ...formData, expediteur_telephone: e.target.value })}
                      placeholder="+226 XX XX XX XX"
                      required
                    />
                  </div>
                </div>
                
                {/* Status expéditeur */}
                {formData.expediteur_telephone?.length >= 8 && (
                  <div className={`p-3 rounded-lg border ${
                    expediteurFound 
                      ? "bg-green-50 border-green-200" 
                      : "bg-yellow-50 border-yellow-200"
                  }`}>
                    <div className="flex items-center gap-2">
                      {expediteurFound ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="text-sm font-semibold text-green-900">
                              Expéditeur trouvé sur SILGAPP !
                            </p>
                            <p className="text-xs text-green-700">
                              {expediteurFound.client_nom} sera automatiquement notifié
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <MessageCircle className="w-5 h-5 text-yellow-600" />
                          <div>
                            <p className="text-sm font-semibold text-yellow-900">
                              Expéditeur non inscrit
                            </p>
                            <p className="text-xs text-yellow-700">
                              Partagez le lien de suivi par WhatsApp
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <Label>Type de colis</Label>
              <Select
                value={formData.type_colis}
                onValueChange={(value) => setFormData({ ...formData, type_colis: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="petit_colis">Petit colis</SelectItem>
                  <SelectItem value="moyen_colis">Moyen colis</SelectItem>
                  <SelectItem value="gros_colis">Gros colis</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="nourriture">Nourriture</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Adresse de récupération */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                {typeCourse === "expedier" ? "Lieu de récupération" : "Chez l'expéditeur"} *
              </Label>
              <Input
                value={formData.adresse_depart}
                onChange={(e) => setFormData({ ...formData, adresse_depart: e.target.value })}
                placeholder="Quartier, rue, point de repère"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={recuperationGPS ? "bg-green-50 text-green-700 border-green-200" : ""}
                onClick={handleGetGPSDepart}
              >
                <Navigation className="w-3 h-3 mr-2" />
                {recuperationGPS ? "✓ GPS enregistré" : "Obtenir position GPS"}
              </Button>
            </div>

            {/* Adresse de livraison */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-accent" />
                {typeCourse === "expedier" ? "Lieu de livraison" : "Votre adresse"} *
              </Label>
              <Input
                value={formData.adresse_arrivee}
                onChange={(e) => setFormData({ ...formData, adresse_arrivee: e.target.value })}
                placeholder="Quartier, rue, point de repère"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={livraisonGPS ? "bg-green-50 text-green-700 border-green-200" : ""}
                onClick={handleGetGPSArrivee}
              >
                <Navigation className="w-3 h-3 mr-2" />
                {livraisonGPS ? "✓ GPS enregistré" : "Obtenir position GPS"}
              </Button>
            </div>

            <div>
              <Label>Notes supplémentaires</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Instructions, point de repère, etc."
                rows={3}
              />
            </div>

            {/* Info tarification */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-900">Prix calculé à la livraison</p>
                  <p className="text-xs text-blue-700 mt-1">
                    100 F/km selon la distance réellement parcourue
                  </p>
                  {formData.prix_estimate && (
                    <p className="text-xs text-blue-600 mt-2 font-semibold">
                      Estimation : ~{formData.prix_estimate.toLocaleString()} FCFA
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-bold bg-primary"
              disabled={createMutation.isPending || !recuperationGPS || !livraisonGPS}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Création en cours...
                </>
              ) : (
                "Créer la course"
              )}
            </Button>

            {/* Bouton partage WhatsApp */}
            {createdCourseId && showShareButton && (
              <Button
                type="button"
                className="w-full h-12 bg-green-600 hover:bg-green-700"
                onClick={handleShareWhatsApp}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Partager le suivi WhatsApp
              </Button>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}