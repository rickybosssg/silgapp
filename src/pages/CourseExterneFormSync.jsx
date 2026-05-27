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
    // Pour "recevoir" : départ = inconnu (chez l'expéditeur), arrivée = position client
    gps_depart_lat: typeCourse === "expedier" ? clientGpsLat : null,
    gps_depart_lng: typeCourse === "expedier" ? clientGpsLng : null,
    gps_arrivee_lat: typeCourse === "recevoir" ? clientGpsLat : null,
    gps_arrivee_lng: typeCourse === "recevoir" ? clientGpsLng : null,
    recuperationGPS: false,
    livraisonGPS: typeCourse === "recevoir" && !!clientGpsLat,
  };

  const [formData, setFormData] = useState(initialData);

  // Pré-remplir depuis profil si pas de brouillon
  useEffect(() => {
    if (clientProfil && !draft) {
      setFormData((prev) => ({
        ...prev,
        client_nom: clientProfil.nom || "",
        client_telephone: clientProfil.telephone || "",
        // Pour "recevoir" : arrivée auto = position client si dispo
        gps_arrivee_lat: prev.type_course === "recevoir" ? (clientGpsLat || prev.gps_arrivee_lat) : prev.gps_arrivee_lat,
        gps_arrivee_lng: prev.type_course === "recevoir" ? (clientGpsLng || prev.gps_arrivee_lng) : prev.gps_arrivee_lng,
        adresse_arrivee: prev.type_course === "recevoir" && !prev.adresse_arrivee ? (clientAdresse || prev.adresse_arrivee) : prev.adresse_arrivee,
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
      if (!navigator.geolocation) { toast.error("GPS non disponible"); return; }
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
            adresse_depart: prev.adresse_depart || adresse,
          }));
        },
        () => toast.error("Impossible d'obtenir la position GPS")
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
          const digits = finalData.expediteur_telephone.replace(/\D/g, "").slice(-8);
          const found = await base44.entities.ClientExterne.filter({ telephone: digits })
            || await base44.entities.ClientExterne.filter({ telephone: "+226" + digits });
          if (found?.length > 0) {
            finalData.expediteur_client_id = found[0].id;
          }
        } catch (_) {}
      }
      // Génération QR/codes dès la création
      const pickupQrToken = crypto.randomUUID().replace(/-/g, "");
      const deliveryQrToken = crypto.randomUUID().replace(/-/g, "");
      const pickupCode4 = String(Math.floor(1000 + Math.random() * 9000));
      const deliveryCode4 = String(Math.floor(1000 + Math.random() * 9000));
      finalData.pickup_qr_token = pickupQrToken;
      finalData.pickup_code_4_digits = pickupCode4;
      finalData.delivery_qr_token = deliveryQrToken;
      finalData.delivery_code_4_digits = deliveryCode4;

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

  const handleSubmit = (e) => {
    e.preventDefault();

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
      prixEstime = Math.round(distance * 100);
    }

    // Pour "recevoir" : la destination = position du client destinataire (jamais inconnue)
    const isRecevoir = formData.type_course === "recevoir";
    const adresseArrivee = isRecevoir
      ? (formData.adresse_arrivee || (formData.livraisonGPS ? "Position GPS client" : clientProfil?.quartier || "Chez le destinataire"))
      : (formData.destination_inconnue ? "Destination à définir" : formData.adresse_arrivee);

    const gpsArriveLat = isRecevoir ? formData.gps_arrivee_lat : (formData.destination_inconnue ? null : formData.gps_arrivee_lat);
    const gpsArriveLng = isRecevoir ? formData.gps_arrivee_lng : (formData.destination_inconnue ? null : formData.gps_arrivee_lng);
    const destInconnue = isRecevoir ? false : (formData.destination_inconnue || false);

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
      adresse_depart: formData.adresse_depart || (formData.recuperationGPS ? "Position GPS" : ""),
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