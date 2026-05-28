import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import CourseStepForm from "@/components/client/CourseStepForm";
import LivreurRechercheAnimation from "@/components/client/LivreurRechercheAnimation";

// Haversine
function calculerDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STORAGE_KEY = "silgapp_course_draft";
const STEP_KEY = "silgapp_course_step";

export default function CourseExterneFormSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const typeCourse = location.pathname.includes("expedier") ? "expedier" : "recevoir";
  const position = location.state?.position || JSON.parse(localStorage.getItem("client_gps_position") || "null");
  const clientProfil = location.state?.clientProfil;

  // Restaurer l'étape depuis localStorage si disponible
  const savedStep = parseInt(localStorage.getItem(STEP_KEY) || "0", 10);
  const [currentStep, setCurrentStep] = useState(isNaN(savedStep) ? 0 : savedStep);
  const [courseCreated, setCourseCreated] = useState(false);
  const [createdCourse, setCreatedCourse] = useState(null);

  // Lire brouillon (données pures, sans fonctions)
  const getDraftFromStorage = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.type_course === typeCourse) return parsed;
      }
    } catch (err) {
      console.error("Erreur lecture brouillon:", err);
    }
    return null;
  };

  const draft = getDraftFromStorage();

  // Pour "recevoir" : pré-remplir la destination avec la position GPS du client
  const clientGpsLat = position?.latitude || null;
  const clientGpsLng = position?.longitude || null;
  const clientAdresse = clientProfil?.quartier || "";

  const initialData = draft || {
    type_course: typeCourse,
    client_nom: clientProfil?.nom || "",
    client_telephone: clientProfil?.telephone || "",
    expediteur_nom: "",
    expediteur_telephone: "",
    destinataire_nom: "",
    destinataire_telephone: "",
    type_colis: "petit_colis",
    adresse_depart: "",
    adresse_arrivee: "",
    destination_inconnue: false,
    notes: "",
    // Pour "recevoir" : départ = chez l'expéditeur (à saisir), arrivée = position client (auto)
    gps_depart_lat: null,
    gps_depart_lng: null,
    gps_arrivee_lat: typeCourse === "recevoir" ? clientGpsLat : null,
    gps_arrivee_lng: typeCourse === "recevoir" ? clientGpsLng : null,
    recuperationGPS: false,
    livraisonGPS: typeCourse === "recevoir" && !!clientGpsLat,
    // Champs GPS expéditeur (pour "recevoir") - IMPORTANT : persister entre étapes
    expediteur_gps_available: false,
    expediteur_gps_lat: null,
    expediteur_gps_lng: null,
  };

  const [formData, setFormData] = useState(initialData);

  // Pré-remplir depuis profil si pas de brouillon
  useEffect(() => {
    if (clientProfil && !draft) {
      setFormData((prev) => ({
        ...prev,
        client_nom: clientProfil.nom || "",
        client_telephone: clientProfil.telephone || "",
        // Pour "recevoir" : arrivée auto = position client si dispo (jamais inconnue)
        gps_arrivee_lat: prev.type_course === "recevoir" ? (clientGpsLat || prev.gps_arrivee_lat) : prev.gps_arrivee_lat,
        gps_arrivee_lng: prev.type_course === "recevoir" ? (clientGpsLng || prev.gps_arrivee_lng) : prev.gps_arrivee_lng,
        adresse_arrivee: prev.type_course === "recevoir" ? (clientAdresse || prev.adresse_arrivee || "Position GPS client") : prev.adresse_arrivee,
        livraisonGPS: prev.type_course === "recevoir" && !!clientGpsLat ? true : prev.livraisonGPS,
      }));
    }
  }, [clientProfil]);

  // Sauvegarder l'étape dans localStorage
  useEffect(() => {
    localStorage.setItem(STEP_KEY, String(currentStep));
  }, [currentStep]);

  // Helper geocoding inverse
  const reverseGeocode = async (lat, lng) => {
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`);
      const geo = await resp.json();
      return geo?.address?.suburb || geo?.address?.neighbourhood || geo?.address?.quarter || geo?.address?.city_district || geo?.address?.village || "";
    } catch (_) { return ""; }
  };

  // Handlers GPS
  const gpsHandlers = {
    // Récupération GPS — pour l'expéditeur (expedier) OU l'endroit où récupérer (recevoir)
    onGetGPSDepart: () => {
      if (!navigator.geolocation) {
        toast.error("GPS non disponible sur cet appareil");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const adresse = await reverseGeocode(lat, lng);
          setFormData((prev) => ({
            ...prev,
            gps_depart_lat: lat,
            gps_depart_lng: lng,
            recuperationGPS: true,
            adresse_depart: adresse || "Position GPS",
          }));
          toast.success("📍 Position GPS récupérée avec succès !");
        },
        (err) => {
          if (err.code === 1) {
            toast.error("Permission GPS refusée. Autorisez la localisation dans les paramètres.");
          } else if (err.code === 2) {
            toast.error("Position GPS indisponible. Vérifiez votre GPS.");
          } else {
            toast.error("Délai dépassé. Réessayez en extérieur.");
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    },
    // Livraison GPS — pour "recevoir" : position actuelle du client destinataire
    onGetGPSArrivee: () => {
      if (!navigator.geolocation) { toast.error("GPS non disponible"); return; }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const adresse = await reverseGeocode(lat, lng);
          setFormData((prev) => ({
            ...prev,
            gps_arrivee_lat: lat,
            gps_arrivee_lng: lng,
            livraisonGPS: true,
            adresse_arrivee: prev.adresse_arrivee || adresse,
          }));
        },
        () => toast.error("Impossible d'obtenir la position GPS")
      );
    },
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      let finalData = { ...data };

      // ─── ANTI-DOUBLON : Vérifier si une course similaire existe déjà ───
      // Critères : même client, même type, même adresse départ, créée < 5 min
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
      
      try {
        const coursesRecentes = await base44.entities.CourseExterne.filter({
          client_telephone: finalData.client_telephone,
          type_course: finalData.type_course,
          adresse_depart: finalData.adresse_depart,
        });
        
        // Vérifier si une course a été créée dans les 5 dernières minutes
        const doublon = coursesRecentes?.find(course => {
          const courseDate = new Date(course.created_date);
          const timeDiff = now - courseDate.getTime();
          return timeDiff < 5 * 60 * 1000; // 5 minutes
        });
        
        if (doublon) {
          const minutesAgo = Math.round((now - new Date(doublon.created_date).getTime()) / 60000);
          throw new Error(`Une course similaire a déjà été créée il y a ${minutesAgo} minute(s). ID: ${doublon.id?.slice(-6)}`);
        }
      } catch (err) {
        if (err.message?.includes('Une course similaire')) {
          throw err; // Rejeter l'erreur anti-doublon
        }
        // Ignorer les autres erreurs de vérification
      }

      // Lookup destinataire (pour "expedier") — lie si inscrit
      if (!finalData.destinataire_client_id && finalData.destinataire_telephone) {
        try {
          const digits = finalData.destinataire_telephone.replace(/\D/g, "").slice(-8);
          const found = await base44.entities.ClientExterne.filter({ telephone: digits })
            || await base44.entities.ClientExterne.filter({ telephone: "+226" + digits });
          if (found?.length > 0) {
            finalData.destinataire_client_id = found[0].id;
            finalData.recipient_has_app = true;
          }
        } catch (_) {}
      }

      // Lookup expéditeur (pour "recevoir") — lie si inscrit dans la base clients
      if (finalData.type_course === "recevoir" && !finalData.expediteur_client_id && finalData.expediteur_telephone) {
        try {
          const phoneRaw = finalData.expediteur_telephone.replace(/\D/g, "");
          const digits = phoneRaw.slice(-8);
          const indicatif = phoneRaw.startsWith("226") ? "+226" : "+226";
          const phoneNormalized = indicatif + digits;
          
          // Essayer plusieurs formats de recherche
          const searchFormats = [
            { telephone: phoneNormalized },
            { telephone: digits },
            { telephone: phoneRaw }
          ];
          
          for (const format of searchFormats) {
            const found = await base44.asServiceRole.entities.ClientExterne.filter(format);
            if (found && found.length > 0) {
              finalData.expediteur_client_id = found[0].id;
              finalData.expediteur_has_app = true;
              console.log(`[Lookup Expéditeur] ✅ Trouvé: ${found[0].nom} ${found[0].prenom} (${found[0].telephone})`);
              break;
            }
          }
        } catch (err) {
          console.error("[Lookup Expéditeur] ❌ Erreur:", err);
        }
      }
      // Génération QR/codes dès la création
      // Pour "recevoir" : pickup = chez l'expéditeur, delivery = chez le destinataire
      const pickupQrToken = crypto.randomUUID().replace(/-/g, "");
      const deliveryQrToken = crypto.randomUUID().replace(/-/g, "");
      const pickupCode4 = String(Math.floor(1000 + Math.random() * 9000));
      const deliveryCode4 = String(Math.floor(1000 + Math.random() * 9000));
      finalData.pickup_qr_token = pickupQrToken;
      finalData.pickup_code_4_digits = pickupCode4;
      finalData.delivery_qr_token = deliveryQrToken;
      finalData.delivery_code_4_digits = deliveryCode4;
      finalData.pickup_confirmed_at = null;
      finalData.delivery_confirmed_at = null;

      const course = await base44.entities.CourseExterne.create(finalData);
      // Notifier toujours (la fonction vérifie en interne)
      try {
        await base44.functions.invoke("notifyClientSync", { course_id: course.id });
      } catch (err) {
        console.error("Erreur notification:", err);
      }
      try {
        await base44.functions.invoke("dispatchExterneAuto", {
          action: "lancer_recherche_auto",
          course_id: course.id
        });
      } catch (err) {
        console.error("Erreur dispatch:", err);
      }
      return course;
    },
    onSuccess: (response) => {
      toast.success("Course créée ! Recherche d'un livreur en cours...");
      setCreatedCourse(response);
      setCourseCreated(true);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STEP_KEY);
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Récupérer l'utilisateur connecté
    const user = await base44.auth.me();

    let expediteurNom, expediteurTel, expediteurClientId, expediteurPhoneNormalized;
    let destinataireNom, destinataireTel, destinataireClientId, destinatairePhoneNormalized;

    if (formData.type_course === "expedier") {
      expediteurNom = formData.client_nom;
      expediteurTel = formData.client_telephone;
      expediteurClientId = clientProfil?.id || null;
      expediteurPhoneNormalized = formData.client_telephone.replace(/\D/g, "").replace(/^226/, "");
      destinataireNom = formData.destinataire_nom;
      destinataireTel = formData.destinataire_telephone;
      destinataireClientId = null;
      destinatairePhoneNormalized = formData.destinataire_telephone.replace(/\D/g, "").replace(/^226/, "");
    } else {
      destinataireNom = formData.client_nom;
      destinataireTel = formData.client_telephone;
      destinataireClientId = clientProfil?.id || null;
      destinatairePhoneNormalized = formData.client_telephone.replace(/\D/g, "").replace(/^226/, "");
      expediteurNom = formData.expediteur_nom;
      expediteurTel = formData.expediteur_telephone;
      expediteurClientId = null;
      expediteurPhoneNormalized = formData.expediteur_telephone.replace(/\D/g, "").replace(/^226/, "");
    }

    // Calcul prix — sécurisé : uniquement si les 4 coordonnées GPS sont valides
    let prixEstime = 0;
    if (
      !formData.destination_inconnue &&
      formData.gps_depart_lat && formData.gps_depart_lng &&
      formData.gps_arrivee_lat && formData.gps_arrivee_lng
    ) {
      const distance = calculerDistance(
        formData.gps_depart_lat, formData.gps_depart_lng,
        formData.gps_arrivee_lat, formData.gps_arrivee_lng
      );
      // Minimum 0.1 km = 10F pour éviter prix_estimate = 0
      prixEstime = Math.max(Math.round(distance * 100), 10);
    }

    // Pour "recevoir" : la destination = position du client destinataire (jamais inconnue)
    const isRecevoir = formData.type_course === "recevoir";
    const adresseArrivee = isRecevoir
      ? (formData.adresse_arrivee || (formData.livraisonGPS ? "Position GPS client" : clientProfil?.quartier || "Chez le destinataire"))
      : (formData.destination_inconnue ? "Destination à définir" : formData.adresse_arrivee);

    const gpsArriveLat = isRecevoir 
      ? (formData.gps_arrivee_lat || clientGpsLat)  // Toujours GPS pour recevoir
      : (formData.destination_inconnue ? null : formData.gps_arrivee_lat);
    const gpsArriveLng = isRecevoir 
      ? (formData.gps_arrivee_lng || clientGpsLng)  // Toujours GPS pour recevoir
      : (formData.destination_inconnue ? null : formData.gps_arrivee_lng);
    const destInconnue = isRecevoir ? false : (formData.destination_inconnue || false);

    // Validation backend des rôles avant création
    try {
      const validationRes = await base44.functions.invoke('validateCourseRoles', {
        type_course: formData.type_course,
        expediteur_client_id: expediteurClientId,
        destinataire_client_id: destinataireClientId,
        created_by_id: user?.id
      });
      
      if (!validationRes.data.valid) {
        toast.error(validationRes.data.errors?.[0] || "Incohérence détectée dans les rôles");
        return;
      }
    } catch (err) {
      console.error("Erreur validation:", err);
      toast.error("Erreur de validation des rôles");
      return;
    }

    createMutation.mutate({
      client_nom: formData.client_nom,
      client_telephone: formData.client_telephone,
      type_course: formData.type_course,
      expediteur_nom: expediteurNom || "Expéditeur",
      expediteur_telephone: expediteurTel,
      expediteur_phone_normalized: expediteurPhoneNormalized,
      expediteur_client_id: expediteurClientId,
      destinataire_nom: destinataireNom || "Destinataire",
      destinataire_telephone: destinataireTel,
      destinataire_phone_normalized: destinatairePhoneNormalized,
      destinataire_client_id: destinataireClientId,
      recipient_has_app: false,
      expediteur_has_app: false,
      adresse_depart: formData.adresse_depart || (formData.recuperationGPS ? "Position GPS" : "À définir"),
      adresse_arrivee: adresseArrivee,
      type_colis: formData.type_colis,
      notes: formData.notes,
      gps_depart_lat: formData.gps_depart_lat,
      gps_depart_lng: formData.gps_depart_lng,
      gps_arrivee_lat: gpsArriveLat,
      gps_arrivee_lng: gpsArriveLng,
      destination_inconnue: destInconnue,
      prix_estimate: prixEstime,
      statut: "recherche_livreur",
      dispatch_status: "en_attente",
    });
  };

  const handleNext = () => setCurrentStep((prev) => prev + 1);
  const handleBack = () => setCurrentStep((prev) => prev - 1);

  const handleAnnuler = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STEP_KEY);
    navigate("/client");
  };

  if (courseCreated && createdCourse) {
    return <LivreurRechercheAnimation course={createdCourse} />;
  }

  const totalSteps = 7;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="outline" size="sm" onClick={handleAnnuler} className="h-10 w-10 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {formData.type_course === "expedier" ? "Expédier un colis" : "Recevoir un colis"}
            </h1>
            <p className="text-xs text-muted-foreground">Formulaire étape par étape</p>
          </div>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit}>
            <CourseStepForm
              step={currentStep}
              totalSteps={totalSteps}
              formData={formData}
              gpsHandlers={gpsHandlers}
              setFormData={setFormData}
              onNext={handleNext}
              onBack={handleBack}
              onAnnuler={handleAnnuler}
              isLoading={createMutation.isPending}
            />
          </form>
        </Card>
      </div>
    </div>
  );
}