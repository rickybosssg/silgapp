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

  const [formData, setFormData] = useState(
    draft || {
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
      gps_depart_lat: position?.latitude || null,
      gps_depart_lng: position?.longitude || null,
      gps_arrivee_lat: null,
      gps_arrivee_lng: null,
      recuperationGPS: false,
      livraisonGPS: false,
    }
  );

  // Pré-remplir depuis profil si pas de brouillon
  useEffect(() => {
    if (clientProfil && !draft) {
      setFormData((prev) => ({
        ...prev,
        client_nom: clientProfil.nom || "",
        client_telephone: clientProfil.telephone || "",
      }));
    }
  }, [clientProfil]);

  // Sauvegarder l'étape dans localStorage
  useEffect(() => {
    localStorage.setItem(STEP_KEY, String(currentStep));
  }, [currentStep]);

  // Handlers GPS — fonctions séparées de formData
  const gpsHandlers = {
    onGetGPSDepart: () => {
      if (!navigator.geolocation) { toast.error("GPS non disponible"); return; }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          // Geocoding inverse pour auto-remplir l'adresse
          let adresse = "";
          try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`);
            const geo = await resp.json();
            adresse = geo?.address?.suburb || geo?.address?.neighbourhood || geo?.address?.quarter || geo?.address?.city_district || geo?.address?.village || "";
          } catch (_) {}
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
    // GPS livraison supprimé — le client n'est pas à la destination

  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const course = await base44.entities.CourseExterne.create(data);
      if (data.destinataire_client_id || data.expediteur_client_id) {
        try {
          await base44.functions.invoke("notifyClientSync", { course_id: course.id });
        } catch (err) {
          console.error("Erreur notification:", err);
        }
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
      adresse_arrivee: formData.destination_inconnue ? "Destination à définir" : formData.adresse_arrivee,
      type_colis: formData.type_colis,
      notes: formData.notes,
      gps_depart_lat: formData.gps_depart_lat,
      gps_depart_lng: formData.gps_depart_lng,
      gps_arrivee_lat: formData.destination_inconnue ? null : formData.gps_arrivee_lat,
      gps_arrivee_lng: formData.destination_inconnue ? null : formData.gps_arrivee_lng,
      destination_inconnue: formData.destination_inconnue || false,
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