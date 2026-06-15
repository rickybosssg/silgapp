import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
  QrCode,
  AlertCircle,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import QRCodeDisplay from "@/components/client/QRCodeDisplay";

const APK_DOWNLOAD_URL = "/telecharger-app";
const LOADING_TIMEOUT_MS = 8000; // 8 secondes max avant d'afficher une erreur

export default function PublicSuiviCourse() {
  // 🔧 CORRECTION : lire le token depuis l'URL via useParams (React Router v6)
  const { token } = useParams();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState(null);       // "not_found" | "timeout" | "server_error"
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [livreurPos, setLivreurPos] = useState(null);

  // Récupérer la course avec timeout
  useEffect(() => {
    if (!token) {
      console.warn("[PublicSuivi] ❌ Aucun token dans l'URL");
      setError("not_found");
      setLoading(false);
      return;
    }

    console.log("[PublicSuivi] 🔍 Token reçu:", token);

    let cancelled = false;
    let timeoutId = null;

    async function fetchCourse() {
      try {
        console.log("[PublicSuivi] 📡 Recherche course...");

        // Timeout de sécurité : si la requête prend plus de 8s, afficher erreur
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("TIMEOUT")), LOADING_TIMEOUT_MS);
        });

        // Chercher d'abord par tracking_token
        let courses = await Promise.race([
          base44.entities.CourseExterne.filter({ tracking_token: token }),
          timeoutPromise.then(() => { throw new Error("TIMEOUT"); }),
        ]);

        if (cancelled) return;
        clearTimeout(timeoutId);

        // Fallback : chercher par ID direct
        if (!courses || courses.length === 0) {
          console.log("[PublicSuivi] 🔄 Pas trouvé par tracking_token, essai par ID:", token);
          try {
            const byId = await base44.entities.CourseExterne.get(token);
            if (byId) {
              courses = [byId];
              console.log("[PublicSuivi] ✅ Course trouvée par ID:", byId.id);
            }
          } catch (idErr) {
            console.warn("[PublicSuivi] ⚠️ Erreur recherche par ID:", idErr?.message || idErr);
          }
        } else {
          console.log("[PublicSuivi] ✅ Course trouvée par tracking_token");
        }

        if (cancelled) return;

        if (courses && courses.length > 0) {
          console.log("[PublicSuivi] 🎉 Course chargée:", courses[0].id, "statut:", courses[0].statut);
          setCourse(courses[0]);
          setError(null);
        } else {
          console.warn("[PublicSuivi] ❌ Aucune course trouvée pour le token:", token);
          setError("not_found");
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[PublicSuivi] 💥 Erreur:", err?.message || err);

        if (err?.message === "TIMEOUT") {
          setError("timeout");
        } else {
          setError("server_error");
        }
      } finally {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    }

    setLoading(true);
    setError(null);
    setCourse(null);
    fetchCourse();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [token]);

  // Rafraîchir toutes les 10 secondes (seulement si course trouvée)
  const { data: freshCourse } = useQuery({
    queryKey: ["public-course", token],
    queryFn: async () => {
      const courses = await base44.entities.CourseExterne.filter({ tracking_token: token });
      if (!courses || courses.length === 0) {
        try {
          const byId = await base44.entities.CourseExterne.get(token);
          return byId || null;
        } catch (_) { return null; }
      }
      return courses[0] || null;
    },
    initialData: null,
    refetchInterval: 10000,
    enabled: !!course && !error,
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

    const container = document.getElementById("public-map");
    if (!container) {
      console.warn("[PublicSuivi] Container #public-map non trouvé dans le DOM");
      return;
    }

    const map = window.L.map(container).setView([livreurPos.lat, livreurPos.lng], 14);

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

  // ── ÉCRAN : Erreur serveur ──
  if (error === "server_error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 px-4">
        <Card className="max-w-md w-full p-8 text-center border-red-200 shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-black text-red-900 mb-2">Erreur de chargement</h1>
          <p className="text-sm text-red-700 mb-6">
            Impossible de charger les informations de suivi pour le moment. 
            Veuillez réessayer dans quelques instants.
          </p>
          <p className="text-xs text-red-500 mb-6 font-mono bg-red-100 rounded-lg px-3 py-2 break-all">
            ID : {token || "—"}
          </p>
          <Button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 hover:bg-red-700 text-white"
          >
            Réessayer
          </Button>
        </Card>
      </div>
    );
  }

  // ── ÉCRAN : Timeout ──
  if (error === "timeout") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 px-4">
        <Card className="max-w-md w-full p-8 text-center border-amber-200 shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-xl font-black text-amber-900 mb-2">Délai dépassé</h1>
          <p className="text-sm text-amber-700 mb-6">
            Le chargement des informations prend trop de temps. 
            Vérifiez votre connexion internet et réessayez.
          </p>
          <p className="text-xs text-amber-500 mb-6 font-mono bg-amber-100 rounded-lg px-3 py-2 break-all">
            ID : {token || "—"}
          </p>
          <Button 
            onClick={() => window.location.reload()}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            Réessayer
          </Button>
        </Card>
      </div>
    );
  }

  // ── ÉCRAN : Course introuvable ──
  if (error === "not_found") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full p-8 text-center border-gray-200 shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-xl font-black text-gray-900 mb-2">Course introuvable</h1>
          <p className="text-sm text-gray-500 mb-6">
            Aucune course ne correspond à cet identifiant. 
            Vérifiez le lien ou contactez l'expéditeur.
          </p>
          <p className="text-xs text-gray-400 mb-6 font-mono bg-gray-100 rounded-lg px-3 py-2 break-all">
            ID : {token || "—"}
          </p>
          <a href={APK_DOWNLOAD_URL}>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white">
              <Download className="w-4 h-4 mr-2" />
              Télécharger SILGAPP
            </Button>
          </a>
        </Card>
      </div>
    );
  }

  // ── ÉCRAN : Chargement (avec spinner temporisé) ──
  if (loading || !course) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <p className="text-gray-600 font-semibold">Chargement du suivi...</p>
          <p className="text-xs text-gray-400 mt-2 font-mono">{token || "..."}</p>
          <div className="mt-4 flex justify-center gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statusLabels = {
    nouvelle: "Course créée",
    recherche_livreur: "Recherche de livreur",
    livreur_en_route: "Livreur en route",
    arrive_prise_en_charge: "Arrivé prise en charge",
    colis_recupere: "Colis récupéré",
    passager_embarque: "Passager embarqué",
    en_livraison: "En livraison",
    livree: "Livré / Terminé",
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

  // === Cartes ETA dynamiques ===
  function haversineKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  const PRIX_MIN = 1000;
  const colisRecupere = ["colis_recupere", "en_livraison"].includes(course.statut);
  const cibleLat = colisRecupere ? course.gps_arrivee_lat : course.gps_depart_lat;
  const cibleLng = colisRecupere ? course.gps_arrivee_lng : course.gps_depart_lng;
  const distLivreurCible = livreurPos && cibleLat && cibleLng
    ? haversineKm(livreurPos.lat, livreurPos.lng, cibleLat, cibleLng) : null;
  const distReelle = isDelivered
    ? (course.distance_reelle_km || haversineKm(course.latitude_recuperation, course.longitude_recuperation, course.latitude_livraison, course.longitude_livraison))
    : null;
  const distAffichee = isDelivered ? distReelle : distLivreurCible;
  const etaMin = distLivreurCible != null ? Math.max(1, Math.round((distLivreurCible / 25) * 60)) : null;
  const dureeMs = isDelivered && course.heure_livraison && course.heure_recuperation
    ? new Date(course.heure_livraison) - new Date(course.heure_recuperation)
    : isDelivered && course.heure_livraison && course.heure_acceptation
      ? new Date(course.heure_livraison) - new Date(course.heure_acceptation) : null;
  const dureeMin = dureeMs ? Math.round(dureeMs / 60000) : etaMin;
  const distCourse = haversineKm(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
  const isFinalPrix = isDelivered && course.prix_final > 0;
  const prixBrut = isFinalPrix ? course.prix_final : (distCourse ? Math.round(distCourse * 100) : (course.prix_estimate || 0));
  const prixAffiche = prixBrut > 0 ? Math.max(prixBrut, PRIX_MIN) : 0;
  const showEtaCards = ["livreur_en_route", "colis_recupere", "en_livraison", "livree"].includes(course.statut);

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

        {/* Cartes ETA dynamiques */}
        {showEtaCards && (
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-3 text-center shadow-lg">
                <span className="text-2xl font-black text-white block">
                  {distAffichee != null ? Number(distAffichee).toFixed(1) : "—"}
                </span>
                <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wide">
                  {isDelivered ? "Distance (km)" : colisRecupere ? "→ Livraison" : "→ Récup."}
                </span>
              </div>
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-3 text-center shadow-lg">
                <span className="text-2xl font-black text-white block">{dureeMin != null ? dureeMin : "—"}</span>
                <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wide">
                  {isDelivered ? "Durée (min)" : "ETA (min)"}
                </span>
              </div>
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-3 text-center shadow-lg">
                <span className="text-2xl font-black text-white block">{prixAffiche > 0 ? prixAffiche.toLocaleString() : "—"}</span>
                <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wide">
                  {isFinalPrix ? "Prix final" : "Prix approx."}
                </span>
              </div>
            </div>
          </Card>
        )}

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

        {/* Message fin — résumé complet type Uber */}
        {isDelivered && (
          <Card className="overflow-hidden border-2 border-green-300 shadow-xl">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-6 text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-9 h-9 text-white" />
              </div>
              <h2 className="font-black text-white text-xl">Livraison terminée ! 🎉</h2>
              <p className="text-white/80 text-sm mt-1">Votre colis a bien été livré</p>
            </div>
            <div className="p-5 bg-green-50 space-y-3">
              {/* Métriques */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                  <Clock className="w-4 h-4 mx-auto mb-1 text-purple-500" />
                  <p className="text-sm font-black text-gray-900">
                    {course.heure_livraison
                      ? format(new Date(course.heure_livraison), "HH:mm", { locale: fr })
                      : "—"}
                  </p>
                  <p className="text-[9px] text-gray-400 font-semibold uppercase">Heure</p>
                </div>
                <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                  <Truck className="w-4 h-4 mx-auto mb-1 text-blue-500" />
                  <p className="text-sm font-black text-gray-900">
                    {course.distance_reelle_km > 0
                      ? `${Number(course.distance_reelle_km).toFixed(1)} km`
                      : "—"}
                  </p>
                  <p className="text-[9px] text-gray-400 font-semibold uppercase">Distance</p>
                </div>
                <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                  <Star className="w-4 h-4 mx-auto mb-1 text-yellow-500" />
                  <p className="text-sm font-black text-gray-900">
                    {course.prix_final > 0 ? `${course.prix_final.toLocaleString()} F` : "—"}
                  </p>
                  <p className="text-[9px] text-gray-400 font-semibold uppercase">Prix final</p>
                </div>
              </div>
              {/* Durée si disponible */}
              {course.heure_livraison && course.heure_acceptation && (
                <div className="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm">
                  <span className="text-sm text-gray-600">⏱ Durée totale de livraison</span>
                  <span className="font-bold text-gray-900">
                    {Math.round((new Date(course.heure_livraison) - new Date(course.heure_acceptation)) / 60000)} min
                  </span>
                </div>
              )}
              <p className="text-center text-xs text-green-700 font-medium pt-1">
                Merci d'avoir utilisé SILGAPP 🙏
              </p>
              <a href={APK_DOWNLOAD_URL}>
                <Button className="w-full bg-primary hover:bg-primary/90 font-semibold gap-2">
                  <Download className="w-4 h-4" />
                  Télécharger SILGAPP
                </Button>
              </a>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}