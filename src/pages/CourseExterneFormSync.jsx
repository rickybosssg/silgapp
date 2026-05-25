import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import CourseStepForm from "@/components/client/CourseStepForm";
import LivreurRechercheAnimation from "@/components/client/LivreurRechercheAnimation";

export default function CourseExterneFormSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const typeCourse = location.pathname.includes("expedier") ? "expedier" : "recevoir";
  const position = location.state?.position || JSON.parse(localStorage.getItem("client_gps_position") || "null");
  const clientProfil = location.state?.clientProfil;

  const [currentStep, setCurrentStep] = useState(0);
  const [courseCreated, setCourseCreated] = useState(false);
  const [createdCourse, setCreatedCourse] = useState(null);

  const [formData, setFormData] = useState({
    type_course: typeCourse,
    client_nom: "",
    client_telephone: "",
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
  });

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

  const handleGetGPSDepart = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          gps_depart_lat: pos.coords.latitude,
          gps_depart_lng: pos.coords.longitude,
          recuperationGPS: true,
        }));
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
        setFormData((prev) => ({
          ...prev,
          gps_arrivee_lat: pos.coords.latitude,
          gps_arrivee_lng: pos.coords.longitude,
          livraisonGPS: true,
        }));
        toast.success("Position GPS de livraison enregistrée");
      },
      () => toast.error("Impossible d'obtenir la position GPS")
    );
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const course = await base44.entities.CourseExterne.create(data);
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
      setCreatedCourse(response);
      setCourseCreated(true);
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let expediteurNom, expediteurTel, expediteurClientId, expediteurPhoneNormalized;
    let destinataireNom, destinataireTel, destinataireClientId, destinatairePhoneNormalized;
    let recipientHasApp = false;

    if (formData.type_course === "expedier") {
      expediteurNom = formData.client_nom;
      expediteurTel = formData.client_telephone;
      expediteurClientId = clientProfil?.id || null;
      expediteurPhoneNormalized = formData.client_telephone.replace(/\D/g, "").replace(/^226/, "");
      
      destinataireNom = formData.destinataire_nom;
      destinataireTel = formData.destinataire_telephone;
      destinataireClientId = null;
      destinatairePhoneNormalized = formData.destinataire_telephone.replace(/\D/g, "").replace(/^226/, "");
      recipientHasApp = false;
    } else {
      destinataireNom = formData.client_nom;
      destinataireTel = formData.client_telephone;
      destinataireClientId = clientProfil?.id || null;
      destinatairePhoneNormalized = formData.client_telephone.replace(/\D/g, "").replace(/^226/, "");
      
      expediteurNom = formData.expediteur_nom;
      expediteurTel = formData.expediteur_telephone;
      expediteurClientId = null;
      expediteurPhoneNormalized = formData.expediteur_telephone.replace(/\D/g, "").replace(/^226/, "");
      recipientHasApp = false;
    }

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
      type_course: formData.type_course,
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
      adresse_arrivee: formData.destination_inconnue ? "Destination à définir" : formData.adresse_arrivee,
      type_colis: formData.type_colis,
      notes: formData.notes,
      gps_depart_lat: formData.gps_depart_lat,
      gps_depart_lng: formData.gps_depart_lng,
      gps_arrivee_lat: formData.destination_inconnue ? null : formData.gps_arrivee_lat,
      gps_arrivee_lng: formData.destination_inconnue ? null : formData.gps_arrivee_lng,
      destination_inconnue: formData.destination_inconnue || false,
      prix_estimate: formData.destination_inconnue ? 0 : prixEstime,
      statut: "recherche_livreur",
    });
  };

  const handleNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  // Afficher l'animation de recherche
  if (courseCreated && createdCourse) {
    return <LivreurRechercheAnimation course={createdCourse} />;
  }

  const totalSteps = 7;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate("/client")}
            className="h-10 w-10 p-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {formData.type_course === "expedier" ? "Expédier un colis" : "Recevoir un colis"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Formulaire étape par étape
            </p>
          </div>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit}>
            <CourseStepForm
              step={currentStep}
              totalSteps={totalSteps}
              formData={{
                ...formData,
                onGetGPSDepart: handleGetGPSDepart,
                onGetGPSArrivee: handleGetGPSArrivee,
              }}
              setFormData={setFormData}
              onNext={handleNext}
              onBack={handleBack}
              isLoading={createMutation.isPending}
            />
          </form>
        </Card>
      </div>
    </div>
  );
}