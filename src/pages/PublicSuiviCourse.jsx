import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  Package, 
  CheckCircle2, 
  Clock, 
  User, 
  Phone, 
  Navigation,
  Download,
  Star,
  Truck,
  QrCode
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import QRCodeDisplay from "@/components/client/QRCodeDisplay";

const APK_DOWNLOAD_URL = "/telecharger-app";

export default function PublicSuiviCourse({ token }) {
  const [course, setCourse] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [livreurPos, setLivreurPos] = useState(null); // Position live du livreur

  // Récupérer la course par token ou par ID direct
  useEffect(() => {
    async function fetchCourse() {
      try {
        // Chercher par tracking_token d'abord, puis par id
        let courses = await base44.entities.CourseExterne.filter({
          tracking_token: token
        });
        
        // Fallback : chercher par ID
        if (!courses || courses.length === 0) {
          try {
            const byId = await base44.entities.CourseExterne.get(token);
            if (byId) courses = [byId];
          } catch (_) {}
        }

        if (courses && courses.length > 0) {
          setCourse(courses[0]);
        }
      } catch (err) {
        console.error("Erreur fetch course:", err);
      }
    }
    
    fetchCourse();
  }, [token]);

  // Rafraîchir toutes les 10 secondes
  const { data: freshCourse } = useQuery({
    queryKey: ["public-course", token],
    queryFn: async () => {
      const courses = await base44.entities.CourseExterne.filter({
        tracking_token: token
      });
      return courses?.[0] || null;
    },
    initialData: null,
    refetchInterval: 10000,
    enabled: !!course,
  });

  useEffect(() => {
    if (freshCourse) {
      setCourse(freshCourse);
    }
  }, [freshCourse]);

  // Charger la position live du livreur (GPS temps réel depuis entité Livreur)
  useEffect(() => {
    if (!course?.livreur_id) return;
    const fetchPos = () => {
      base44.entities.Livreur.filter({ id: course.livreur_id })
        .then(r => {
          const l = r?.[0];
          if (l?.latitude && l?.longitude) {
            setLivreurPos({ lat: l.latitude, lng: l.longitude, nom: l.prenom ? `${l.prenom} ${l.nom}` : l.nom });
          }
        })
        .catch(() => null);
    };
    fetchPos();
    const iv = setInterval(fetchPos, 10000);
    return () => clearInterval(iv);
  }, [course?.livreur_id]);

  // Charger Leaflet pour la carte
  useEffect(() => {
    if (!course?.livreur_id || !livreurPos) return;

    const loadLeaflet = async () => {
      // Injecter CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Injecter JS
      if (!window.L) {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => setMapLoaded(true);
        document.head.appendChild(script);
      } else {
        setMapLoaded(true);
      }
    };

    loadLeaflet();
  }, [course]);

  // Initialiser la carte avec position live du livreur
  useEffect(() => {
    if (!mapLoaded || !livreurPos) return;

    const map = window.L.map("public-map").setView([livreurPos.lat, livreurPos.lng], 14);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const marker = window.L.marker([livreurPos.lat, livreurPos.lng])
      .addTo(map)
      .bindPopup(`<b>🚴 ${course?.livreur_nom || livreurPos.nom || 'Livreur'}</b><br>Position en temps réel`)
      .openPopup();

    // Ajouter marqueurs départ et arrivée si GPS disponible
    if (course?.gps_depart_lat && course?.gps_depart_lng) {
      window.L.marker([course.gps_depart_lat, course.gps_depart_lng], {
        icon: window.L.divIcon({ html: '📍', iconSize: [24, 24], className: '' })
      }).addTo(map).bindPopup('Point de récupération');
    }
    if (course?.gps_arrivee_lat && course?.gps_arrivee_lng) {
      window.L.marker([course.gps_arrivee_lat, course.gps_arrivee_lng], {
        icon: window.L.divIcon({ html: '🏁', iconSize: [24, 24], className: '' })
      }).addTo(map).bindPopup('Point de livraison');
    }

    return () => { map.remove(); };
  }, [mapLoaded, livreurPos]);

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">Chargement du suivi...</p>
        </div>
      </div>
    );
  }

  const statusLabels = {
    nouvelle: "Course créée",
    recherche_livreur: "Recherche de livreur",
    livreur_en_route: "Livreur en route",
    colis_recupere: "Colis récupéré",
    en_livraison: "En livraison",
    livree: "Livré",
    annulee: "Annulée"
  };

  const statusColors = {
    nouvelle: "bg-gray-100 text-gray-800",
    recherche_livreur: "bg-yellow-100 text-yellow-800",
    livreur_en_route: "bg-blue-100 text-blue-800",
    colis_recupere: "bg-purple-100 text-purple-800",
    en_livraison: "bg-orange-100 text-orange-800",
    livree: "bg-green-100 text-green-800",
    annulee: "bg-red-100 text-red-800"
  };

  const isDelivered = course.statut === "livree";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <Card className="p-6 bg-gradient-to-r from-primary to-primary/80 text-white border-0">
          <div className="flex items-center gap-3 mb-4">
            <Truck className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">Suivi SILGAPP</h1>
              <p className="text-sm text-white/80">
                {course.type_course === "expedier" ? "Expédition de colis" : "Réception de colis"}
              </p>
            </div>
          </div>
          
          <Badge className={`${statusColors[course.statut]} border-0`}>
            {statusLabels[course.statut]}
          </Badge>
        </Card>

        {/* Progression */}
        <Card className="p-6">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" />
            Progression
          </h2>
          
          <div className="space-y-4">
            {[
              { key: "recherche_livreur", label: "Livreur recherché", icon: Package },
              { key: "livreur_en_route", label: "Livreur assigné", icon: User },
              { key: "colis_recupere", label: "Colis récupéré", icon: CheckCircle2 },
              { key: "en_livraison", label: "En route vers vous", icon: Truck },
              { key: "livree", label: "Colis livré", icon: CheckCircle2 }
            ].map((step, idx) => {
              const steps = ["nouvelle", "recherche_livreur", "livreur_en_route", "colis_recupere", "en_livraison", "livree"];
              const currentIndex = steps.indexOf(course.statut);
              const stepIndex = steps.indexOf(step.key);
              const isCompleted = stepIndex <= currentIndex && course.statut !== "annulee";
              const StepIcon = step.icon;
              
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isCompleted ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"
                  }`}>
                    <StepIcon className="w-5 h-5" />
                  </div>
                  <p className={`font-medium ${isCompleted ? "text-green-700" : "text-gray-500"}`}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Info livreur */}
        {course.livreur_nom && (
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Votre livreur
            </h2>
            
            <div className="flex items-center gap-4 mb-4">
              {course.livreur_photo_url ? (
                <img
                  src={course.livreur_photo_url}
                  alt={course.livreur_nom}
                  className="w-16 h-16 rounded-full object-cover border-4 border-primary/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
              )}
              
              <div className="flex-1">
                <p className="font-bold text-lg">{course.livreur_nom}</p>
                {course.livreur_vehicule && (
                  <p className="text-sm text-muted-foreground capitalize">
                    {course.livreur_vehicule.replace("_", " ")}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  📞 {course.livreur_telephone}
                </p>
              </div>
              
              <a href={`tel:${course.livreur_telephone}`}>
                <Button size="icon" className="rounded-full bg-green-500 hover:bg-green-600">
                  <Phone className="w-5 h-5" />
                </Button>
              </a>
            </div>
          </Card>
        )}

        {/* Carte — position live du livreur */}
        {course.livreur_id && livreurPos && (
          <Card className="p-4">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Position du livreur
            </h2>
            <div id="public-map" className="h-64 rounded-xl overflow-hidden" />
          </Card>
        )}

        {/* QR Code de livraison - visible automatiquement pour le destinataire */}
        {course.livreur_id && ["colis_recupere", "en_livraison"].includes(course.statut) && (
          <Card className="p-6 border-2 border-dashed border-primary/30 bg-blue-50">
            <div className="flex items-center gap-2 mb-3">
              <QrCode className="w-6 h-6 text-primary" />
              <h2 className="font-bold text-lg text-primary">Votre code de réception</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Le livreur est en route. Présentez ce code ou QR code pour confirmer la réception.
            </p>
            <QRCodeDisplay course={course} type="delivery" />
          </Card>
        )}

        {/* QR Code de récupération - pour le statut livreur_en_route */}
        {course.livreur_id && course.statut === "livreur_en_route" && (
          <Card className="p-6 border-2 border-dashed border-amber-300 bg-amber-50">
            <div className="flex items-center gap-2 mb-3">
              <QrCode className="w-6 h-6 text-amber-600" />
              <h2 className="font-bold text-lg text-amber-700">Code de récupération</h2>
            </div>
            <p className="text-sm text-amber-700 mb-4">
              Le livreur arrive bientôt. Présentez ce code pour confirmer la prise en charge.
            </p>
            <QRCodeDisplay course={course} type="pickup" />
          </Card>
        )}

        {/* Détails course */}
        <Card className="p-6">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Détails de la course
          </h2>
          
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-semibold">Départ</p>
                <p className="text-muted-foreground">{course.adresse_depart}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-semibold">Arrivée</p>
                <p className="text-muted-foreground">{course.adresse_arrivee}</p>
              </div>
            </div>
            
            {course.type_colis && (
              <div>
                <p className="font-semibold">Type de colis</p>
                <p className="text-muted-foreground capitalize">
                  {course.type_colis.replace("_", " ")}
                </p>
              </div>
            )}
            
            {course.prix_final && (
              <div>
                <p className="font-semibold">Prix</p>
                <p className="text-primary font-bold">{course.prix_final.toLocaleString()} FCFA</p>
              </div>
            )}
          </div>
        </Card>

        {/* Message fin */}
        {isDelivered && (
          <>
            <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-green-900 text-lg">Colis livré avec succès !</h2>
                  <p className="text-sm text-green-700">
                    Merci d'avoir utilisé SILGAPP
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-green-900 mb-2">
                    Avez-vous aimé l'expérience SILGAPP ?
                  </p>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-green-600 hover:bg-green-700">
                      <Star className="w-4 h-4 mr-2 fill-white" />
                      Noter
                    </Button>
                    <a href={APK_DOWNLOAD_URL} className="flex-1">
                      <Button variant="outline" className="w-full border-green-600 text-green-700 hover:bg-green-50">
                        <Download className="w-4 h-4 mr-2" />
                        Télécharger SILGAPP
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}