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
import { ArrowLeft, MapPin, Navigation, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CourseExterneForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const typeCourse = location.pathname.includes("expedier") ? "expedier" : "recevoir";
  const position = location.state?.position || JSON.parse(localStorage.getItem("client_gps_position") || "null");
  const clientProfil = location.state?.clientProfil;

  const [formData, setFormData] = useState({
    client_nom: "",
    client_telephone: "",
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
    mutationFn: (data) => base44.entities.CourseExterne.create(data),
    onSuccess: () => {
      toast.success("Course créée ! Recherche d'un livreur en cours...");
      navigate("/client/suivi");
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

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

    // Calcul distance estimée (Haversine)
    const courseCountryCode = clientProfil?.country_code;
    if (!courseCountryCode) {
      toast.error("Erreur : votre profil client n'a pas de pays. Veuillez contacter le support.");
      return;
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
      ...formData,
      country_code: courseCountryCode,
      type_course: typeCourse,
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nom</Label>
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
                {recuperationGPS ? " GPS enregistré" : "Obtenir position GPS"}
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
                {livraisonGPS ? " GPS enregistré" : "Obtenir position GPS"}
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
          </form>
        </Card>
      </div>
    </div>
  );
}
