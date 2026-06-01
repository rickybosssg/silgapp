import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { 
  MapPin, Navigation, Phone, MessageCircle, User, Package, 
  Clock, HelpCircle, ChevronRight, TrendingUp, 
  Shield, Zap, Star, Loader2, ArrowLeft, RefreshCw
} from "lucide-react";
import VenusFloatingButton from "@/components/client/VenusFloatingButton";
import ModernMap from "@/components/client/ModernMap";
import ProfilModal from "@/components/client/ProfilModal";
import SupportWhatsApp from "@/components/client/SupportWhatsApp";
import ClientOnboarding from "@/components/client/ClientOnboarding";
import OngletCodePromo from "@/components/client/OngletCodePromo";

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function GPSBadge({ profil, onForceSync }) {
  const hasCoords = !!(profil?.latitude && profil?.longitude);
  const synced = hasCoords;
  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${synced ? "bg-green-500/90" : "bg-amber-500/90"}`}>
        <Navigation className="w-3 h-3 text-white" />
        <span className="text-xs text-white font-medium">
          {synced ? "GPS actif ✓" : "GPS manquant"}
        </span>
      </div>
      {!synced && (
        <button
          onClick={onForceSync}
          className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"
          title="Forcer sync GPS"
        >
          <RefreshCw className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
}

export default function ClientExterneApp() {
  const navigate = useNavigate();
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showProfilModal, setShowProfilModal] = useState(false);
  const [position, setPosition] = useState(null);
  const [clientProfil, setClientProfil] = useState(null);
  const [coursesActives, setCoursesActives] = useState([]);
  const [livreursProches, setLivreursProches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [showMap, setShowMap] = useState(false);
  const [ongletActif, setOngletActif] = useState("accueil"); // accueil | promo
  const [gpsSyncing, setGpsSyncing] = useState(false);
  const [gpsActif, setGpsActif] = useState(false);
  const [aUnCodePromo, setAUnCodePromo] = useState(false);
  const clientProfilRef = useRef(null);
  useEffect(() => { clientProfilRef.current = clientProfil; }, [clientProfil]);

  // Charger localStorage au montage (pas avant le rendu)
  useEffect(() => {
    try {
      const gpsActive = localStorage.getItem("client_gps_active") === "true";
      const savedPos = localStorage.getItem("client_gps_position");
      if (gpsActive) setOnboardingDone(true);
      if (savedPos) setPosition(JSON.parse(savedPos));
    } catch (e) {
      console.error("Erreur lecture localStorage:", e);
    }
  }, []);

  // Heartbeat automatique — sync toutes les 30s + événements lifecycle
  // Activé dès que le profil est chargé (même sans GPS pour anciens utilisateurs)
  useHeartbeat({
    user_type: "client",
    position: position,
    enabled: !!clientProfil, // heartbeat dès que profil chargé
  });

  useEffect(() => {
    loadProfil();
  }, []);

  // Vérifier si ce client possède un code promo ambassadeur
  useEffect(() => {
    if (!clientProfil?.id) return;
    base44.entities.CodePromo.filter({ proprietaire_client_id: clientProfil.id })
      .then(codes => setAUnCodePromo((codes?.length || 0) > 0))
      .catch(() => {});
  }, [clientProfil?.id]);

  // ─── GPS — Architecture unifiée clients = livreurs ─────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTÈME GPS UNIFIÉ — MÊME LOGIQUE POUR CLIENTS ET LIVREURS
  // 
  // 📋 ARCHITECTURE (identique pour ClientExterneApp et LivreurExterneApp)
  // ───────────────────────────────────────────────────────────────────────────
  // 1. ONBOARDING
  //    → getCurrentPosition() 
  //    → localStorage.setItem("client_gps_active", "true")
  //    → base44.entities.ClientExterne.update(id, { latitude, longitude })
  //
  // 2. WATCH GPS (toutes les 15 secondes)
  //    → setInterval(getCurrentPosition → update BDD, 15000)
  //    → Pas de filtrage distance/délai (sync systématique)
  //
  // 3. VISIBILITY CHANGE
  //    → document.visibilitychange → sync immédiate
  //
  // 4. DASHBOARD POLLING
  //    → Clients: 5s | Livreurs: 2s
  //
  // 5. BADGE GPS
  //    → Check simple: latitude && longitude
  //    → Pas de calcul de date (juste présence coords)
  //
  // 🗄️ CHAMPS BDD
  //    - latitude (number)
  //    - longitude (number)
  //    - Pas de champ gps_actif ou current_location
  //
  // ✅ POURQUOI ÇA MARCHE
  //    - Plus de logique conditionnelle complexe
  //    - Sync directe et systématique
  //    - Même code que livreurs (prouvé fonctionnel)
  //    - BDD mise à jour immédiatement à chaque position
  // ═══════════════════════════════════════════════════════════════════════════
  // Helper reverse geocoding
  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`);
      const geo = await res.json();
      return geo?.address?.suburb || geo?.address?.neighbourhood || geo?.address?.quarter || geo?.address?.city_district || geo?.address?.village || "";
    } catch (_) { return ""; }
  };

  // Sync immédiate au chargement du profil — UNIQUEMENT si pas déjà fait par onboarding
  useEffect(() => {
    if (!clientProfil?.id || !onboardingDone || position?.latitude) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setPosition(posData);
        setGpsActif(true);
        // Toujours faire le reverse geocoding au 1er GPS (pas seulement si quartier vide)
        const q = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        const quartierFinal = q || "Ouagadougou";
        base44.entities.ClientExterne.update(clientProfil.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          quartier: quartierFinal,
        }).catch(() => null);
        if (quartierFinal) setClientProfil(prev => prev ? { ...prev, quartier: quartierFinal } : prev);
      },
      (err) => console.error("[GPS Client] ❌ Permission refusée:", err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [clientProfil?.id, onboardingDone]);

  // Watch GPS continu (15s) — comme les livreurs
  // Met aussi à jour le quartier toutes les 5 min via reverse geocoding
  const lastQuartierSync = useRef(0);
  useEffect(() => {
    if (!clientProfil?.id || !onboardingDone || !gpsActif) return;
    const interval = setInterval(() => {
      navigator.geolocation?.getCurrentPosition(
        async (pos) => {
          const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setPosition(posData);
          const now = Date.now();
          // Reverse geocoding toutes les 5 minutes pour maintenir le quartier à jour
          let quartierUpdate = {};
          if (now - lastQuartierSync.current > 5 * 60 * 1000) {
            lastQuartierSync.current = now;
            const q = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            if (q) {
              quartierUpdate = { quartier: q };
              setClientProfil(prev => prev ? { ...prev, quartier: q } : prev);
            }
          }
          base44.entities.ClientExterne.update(clientProfil.id, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            ...quartierUpdate,
          }).catch(() => null);
        },
        () => setGpsActif(false),
        { enableHighAccuracy: true }
      );
    }, 15000);
    return () => clearInterval(interval);
  }, [clientProfil?.id, onboardingDone, gpsActif]);

  // Sync GPS au retour au premier plan
  useEffect(() => {
    if (!onboardingDone || !clientProfil?.id) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[GPS Client] App au premier plan → sync GPS");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setPosition(posData);
            base44.entities.ClientExterne.update(clientProfil.id, {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }).catch(() => null);
          },
          () => null,
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [onboardingDone, clientProfil?.id]);

  // Polling automatique des courses actives toutes les 5s + synchronisation GPS destinataire
  useEffect(() => {
    if (!onboardingDone || !clientProfil || !position) return;
    const interval = setInterval(() => {
      checkStatus(position, clientProfil);
      syncGpsDestinataire(position, clientProfil);
    }, 5000);
    return () => clearInterval(interval);
  }, [onboardingDone, clientProfil?.id, position]);

  // Forcer une sync GPS manuelle — EXACTEMENT comme les livreurs
  const handleForceGPSSync = () => {
    if (!clientProfil?.id || gpsSyncing) return;
    setGpsSyncing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setPosition(posData);
        setGpsActif(true);
        base44.entities.ClientExterne.update(clientProfil.id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }).then(() => {
          toast.success("GPS synchronisé ✓");
        }).catch(() => {
          toast.error("Erreur synchronisation");
        }).finally(() => {
          setGpsSyncing(false);
        });
      },
      () => {
        setGpsSyncing(false);
        toast.error("Permission GPS refusée");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Synchroniser le GPS du destinataire vers les courses où il est notifié
  const syncGpsDestinataire = async (pos, profil) => {
    try {
      if (!pos?.latitude || !pos?.longitude || !profil?.id) return;
      const user = await base44.auth.me();
      
      // Normaliser le téléphone UNE FOIS
      const phoneNorm = profil.telephone ? profil.telephone.replace(/\D/g, "") : null;
      const local = phoneNorm && phoneNorm.startsWith("226") ? phoneNorm.slice(3) : phoneNorm;
      
      // Trouver les courses où ce client est destinataire (PAR ID OU PAR TÉLÉPHONE)
      const coursesById = await base44.entities.CourseExterne.filter({
        destinataire_client_id: profil.id,
        statut: ["nouvelle", "recherche_livreur", "livreur_en_route", "colis_recupere", "en_livraison"]
      });
      
      // Fallback : chercher par téléphone normalisé UNIQUEMENT
      let coursesByPhone = [];
      if (local) {
        const res = await base44.entities.CourseExterne.filter({
          destinataire_telephone: local,
          statut: ["nouvelle", "recherche_livreur", "livreur_en_route", "colis_recupere", "en_livraison"]
        });
        if (res?.length > 0) {
          coursesByPhone = res;
        }
      }
      
      // Fusionner et dédupliquer
      const map = new Map();
      [...(coursesById || []), ...coursesByPhone].forEach(c => map.set(c.id, c));
      const courses = [...map.values()];
      
      // Mettre à jour uniquement si GPS différent ou absent
      for (const course of courses) {
        const needsUpdate = 
          !course.gps_arrivee_lat || 
          !course.gps_arrivee_lng ||
          Math.abs(course.gps_arrivee_lat - pos.latitude) > 0.001 ||
          Math.abs(course.gps_arrivee_lng - pos.longitude) > 0.001;
        if (needsUpdate) {
          await base44.entities.CourseExterne.update(course.id, {
            gps_arrivee_lat: pos.latitude,
            gps_arrivee_lng: pos.longitude
          });
        }
      }
    } catch (err) {
      console.error("Erreur sync GPS destinataire:", err);
    }
  };

  const loadProfil = async () => {
    try {
      const user = await base44.auth.me();
      const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });
      let profil;
      if (clients && clients.length > 0) {
        profil = clients[0];
      } else {
        profil = await base44.entities.ClientExterne.create({
          nom: user.full_name || user.email.split('@')[0],
          telephone: "",
          user_email: user.email,
          actif: true,
          country_code: "BF"
        });
      }
      setClientProfil(profil);

      // Heartbeat immédiat après chargement du profil (même sans GPS)
      // Cela mettra à jour last_seen_at et app_active pour TOUS les utilisateurs (anciens et nouveaux)
      if (profil?.id) {
        base44.functions.invoke('heartbeatAuto', {
          user_type: "client",
          latitude: profil.latitude || 0,
          longitude: profil.longitude || 0,
          app_active: true,
          device_id: navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50),
        }).catch(() => null);
      }
    } catch (err) {
      console.error("Erreur chargement profil:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingComplete = async ({ gps, profil }) => {
    setOnboardingDone(true);
    setClientProfil(profil);
    if (gps?.latitude && gps?.longitude) {
      setPosition(gps);
      setGpsActif(true);
      // Sync immédiate en BDD — EXACTEMENT comme les livreurs
      if (profil?.id) {
        base44.entities.ClientExterne.update(profil.id, {
          latitude: gps.latitude,
          longitude: gps.longitude,
        }).then(() => {
          console.log("[GPS Client] ✅ Onboarding sync BDD OK", gps.latitude, gps.longitude);
        }).catch(err => console.error("[GPS Client] ❌ Erreur sync onboarding:", err));
      }
    }
    checkStatus(gps, profil);
  };

  const checkStatus = async (pos, profil) => {
    try {
      const user = await base44.auth.me();
      
      // 1. Courses créées par l'utilisateur
      const coursesClient = await base44.entities.CourseExterne.filter({ created_by_id: user.id }, "-created_date", 20);
      const actives = (coursesClient || []).filter(c => !["livree", "annulee"].includes(c.statut));

      // 2. Courses où l'utilisateur est destinataire
      let activesDestinataire = [];
      if (profil?.id) {
        const coursesDestinataire = await base44.entities.CourseExterne.filter({ destinataire_client_id: profil.id }, "-created_date", 20);
        activesDestinataire = (coursesDestinataire || []).filter(c =>
          !["livree", "annulee"].includes(c.statut) &&
          c.created_by_id !== user.id
        );
      }

      // 3. Courses où l'utilisateur est expéditeur (mode "recevoir") — IMPORTANT : miroir du mode expedier
      let activesExpediteur = [];
      if (profil?.id) {
        const coursesExpediteur = await base44.entities.CourseExterne.filter({ expediteur_client_id: profil.id }, "-created_date", 20);
        activesExpediteur = (coursesExpediteur || []).filter(c =>
          !["livree", "annulee"].includes(c.statut) &&
          c.created_by_id !== user.id && // ne pas dupliquer
          c.type_course === "recevoir" // seulement mode recevoir
        );
      }

      // Fusionner sans doublons par id, trier par date desc
      const map = new Map();
      [...actives, ...activesDestinataire, ...activesExpediteur].forEach(c => map.set(c.id, c));
      const toutes = [...map.values()].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      setCoursesActives(toutes);

      // Nettoyer les notifications obsolètes (courses supprimées ou terminées)
      const userNotifications = await base44.entities.Notification.filter({ destinataire_email: user.email, lue: false });
      if (userNotifications && userNotifications.length > 0) {
        const validCourseIds = new Map(toutes.map(c => [c.id, true]));
        const notificationsValides = userNotifications.filter(n => 
          !n.course_id || validCourseIds.has(n.course_id)
        );
        // Dédupliquer : garder une seule notif par course_id + type (la plus récente)
        const seen = new Map();
        for (const n of notificationsValides) {
          const key = `${n.course_id || n.id}_${n.type || ''}`;
          if (!seen.has(key)) seen.set(key, n);
        }
        setNotifications([...seen.values()]);
      }

      await loadLivreursProches(pos);
    } catch (err) {
      console.error("Erreur vérification statut:", err);
    }
  };

  const loadLivreursProches = async (pos) => {
    try {
      if (!pos) return;
      const livreurs = await base44.entities.Livreur.filter({
        type_livreur: "externe",
        statut: "disponible",
        actif: true,
        validation: "valide"
      });
      const proches = livreurs.filter(l => {
        if (!l.latitude || !l.longitude) return false;
        return haversineDistance(pos.latitude, pos.longitude, l.latitude, l.longitude) <= 5;
      }).slice(0, 5);
      setLivreursProches(proches);
    } catch (err) {
      console.error("Erreur chargement livreurs:", err);
    }
  };





  // Spinner uniquement si vraiment en chargement et pas encore de profil
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-red-50">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Onboarding : laisser ClientOnboarding décider (GPS + profil)
  // ClientOnboarding attend clientProfil non-null pour calculer l'étape
  if (!onboardingDone) {
    return (
      <ClientOnboarding
        clientProfil={clientProfil}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  // Dashboard : clientProfil garanti non-null ici
  if (!clientProfil) return null;

  const prenom = (clientProfil?.prenom || (clientProfil?.nom || "").split(" ")[0] || "Client").trim() || "Client";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Courses actives - Floating cards */}
      {coursesActives.length > 0 && (
        <div className="fixed top-4 left-4 right-4 z-50 space-y-2 animate-in slide-in-from-top duration-300">
          {coursesActives.map((course) => (
            <Card key={course.id} className="border-l-4 border-l-primary shadow-lg cursor-pointer" onClick={() => navigate("/client/suivi", { state: { course_id: course.id } })}>
              <div className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <Badge className="bg-primary/10 text-primary text-xs">
                      {course.statut === "recherche_livreur" ? "🔍 Recherche" :
                       course.statut === "livreur_en_route" ? "🚀 En route" :
                       course.statut === "colis_recupere" ? "📦 Récupéré" : "🚚 Livraison"}
                    </Badge>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2">
                  {course.livreur_photo_url ? (
                    <img src={course.livreur_photo_url} alt={course.livreur_nom} className="w-8 h-8 rounded-full object-cover border-2 border-primary" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs">
                      {course.heure_acceptation && course.livreur_nom
                        ? course.livreur_nom
                        : "Recherche livreur..."}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {course.adresse_depart} → {course.adresse_arrivee}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className={`px-4 py-4`} style={coursesActives.length > 0 ? { marginTop: `${coursesActives.length * 90 + 8}px` } : {}}>
        <div className="max-w-lg mx-auto space-y-4">

          {/* Barre d'onglets — visible uniquement si le client a un code promo ambassadeur */}
          {aUnCodePromo && (
            <div className="flex bg-muted rounded-xl p-1 gap-1">
              <button
                onClick={() => setOngletActif("accueil")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${ongletActif === "accueil" ? "bg-white shadow text-foreground" : "text-muted-foreground"}`}
              >
                🏠 Accueil
              </button>
              <button
                onClick={() => setOngletActif("promo")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${ongletActif === "promo" ? "bg-white shadow text-purple-700" : "text-muted-foreground"}`}
              >
                🎁 Code Promo
              </button>
            </div>
          )}

          {/* Onglet Code Promo */}
          {ongletActif === "promo" && aUnCodePromo && (
            <OngletCodePromo clientProfil={clientProfil} />
          )}

          {ongletActif !== "promo" && (
            <>

          {/* Notifications */}
          {notifications.length > 0 && (
            <div className="mb-4 space-y-2">
              {notifications.map((notif) => (
                <Card key={notif.id} className="p-4 border-l-4 border-l-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-yellow-900">{notif.titre}</p>
                      <p className="text-sm text-yellow-700 mt-1">{notif.message}</p>
                      {notif.course_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                          onClick={() => navigate("/client/suivi")}
                        >
                          Voir la course
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-red-600 rounded-3xl p-5 shadow-lg shadow-red-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white/80 text-xs mb-0.5">Bonjour 👋</p>
                <h1 className="text-2xl font-black text-white">{prenom}</h1>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">
                    <MapPin className="w-3 h-3 text-white" />
                    <span className="text-xs text-white font-medium">Ouagadougou</span>
                  </div>
                  <GPSBadge profil={clientProfil} onForceSync={handleForceGPSSync} />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-xl"
                onClick={() => setShowProfilModal(true)}
              >
                <User className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Actions principales */}
          <div className="grid grid-cols-2 gap-3">
            <Card 
              className="group p-5 cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/30 bg-gradient-to-br from-white to-primary/5"
              onClick={() => navigate("/client/course/expedier", { state: { position, clientProfil } })}
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center mx-auto shadow-lg shadow-red-200 group-hover:scale-110 transition-transform">
                  <Package className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground">Expédier</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Envoyer un colis</p>
                </div>
              </div>
            </Card>

            <Card 
              className="group p-5 cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-accent/30 bg-gradient-to-br from-white to-accent/5"
              onClick={() => navigate("/client/course/recevoir", { state: { position, clientProfil } })}
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-green-600 flex items-center justify-center mx-auto shadow-lg shadow-green-200 group-hover:scale-110 transition-transform">
                  <span className="text-3xl">📥</span>
                </div>
                <div>
                  <p className="font-bold text-foreground">Recevoir</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Recevoir un colis</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Bouton carte — toujours visible si GPS actif */}
          {position && (
            <Card className="p-4 cursor-pointer hover:shadow-lg transition-all" onClick={() => setShowMap(true)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">
                    {coursesActives.some(c => ["livreur_en_route","colis_recupere","en_livraison"].includes(c.statut))
                      ? "📍 Voir le livreur en temps réel"
                      : "🗺️ Voir la carte"}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </Card>
          )}

          {/* Raccourcis */}
          <Card className="p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Raccourcis</p>
            <div className="grid grid-cols-4 gap-2">
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-blue-50"
                onClick={() => navigate("/client/suivi")}
              >
                <Package className="w-5 h-5 text-blue-600" />
                <span className="text-[10px] font-medium">Mes courses</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-purple-50"
                onClick={() => navigate("/client/suivi")}
              >
                <Clock className="w-5 h-5 text-purple-600" />
                <span className="text-[10px] font-medium">Historique</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-green-50"
                onClick={() => {
                  const msg = encodeURIComponent("Bonjour SILGAPP 👋\nJ'ai besoin d'aide sur SILGAPP.");
                  const a = document.createElement("a");
                  a.href = `whatsapp://send?phone=22667572857&text=${msg}`;
                  a.click();
                  setTimeout(() => { if (document.hasFocus()) window.open(`https://wa.me/22667572857?text=${msg}`, "_blank"); }, 500);
                }}
              >
                <MessageCircle className="w-5 h-5 text-green-600" />
                <span className="text-[10px] font-medium">Support</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-auto py-3 flex flex-col gap-1.5 hover:bg-orange-50"
                onClick={() => setShowProfilModal(true)}
              >
                <User className="w-5 h-5 text-orange-600" />
                <span className="text-[10px] font-medium">Mes infos</span>
              </Button>
            </div>
          </Card>

          {/* Bannière code promo si client a un code et n'a pas encore fait sa première course */}
          {clientProfil?.code_promo_utilise && !clientProfil?.premiere_course_faite && (
            <Card className="p-4 border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">🎁</span>
                </div>
                <div>
                  <p className="font-bold text-purple-900 text-sm">Code promo actif : <span className="font-black font-mono">{clientProfil.code_promo_utilise}</span></p>
                  <p className="text-xs text-purple-700">100 FCFA de réduction sur votre prochaine course (min. 1 000 FCFA)</p>
                </div>
              </div>
            </Card>
          )}

          {/* Support WhatsApp */}
          <SupportWhatsApp />

          {/* Tarification */}
          <Card className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 shadow-md">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-indigo-900">Tarification transparente</p>
                <p className="text-xs text-indigo-700 mt-1.5 leading-relaxed">
                  100 F/km — Prix calculé automatiquement selon la distance réellement parcourue.
                </p>
              </div>
            </div>
          </Card>

          {/* Avantages */}
          <Card className="p-5 bg-gradient-to-br from-white to-gray-50 shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-sm">
                <Star className="w-4 h-4 text-white" />
              </div>
              <p className="font-bold text-foreground text-base">Facilitez-vous la vie avec SILGAPP</p>
            </div>
            <div className="space-y-3">
              {[
                { color: "green", icon: <Zap className="w-3.5 h-3.5 text-white" />, title: "Livraison rapide", desc: "Livreurs disponibles 24/7 près de chez vous" },
                { color: "blue", icon: <Shield className="w-3.5 h-3.5 text-white" />, title: "Service sécurisé", desc: "Livreurs vérifiés et suivis en temps réel" },
                { color: "purple", icon: <HelpCircle className="w-3.5 h-3.5 text-white" />, title: "Support réactif", desc: "Assistance disponible à tout moment" },
              ].map((item, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl bg-gradient-to-r from-${item.color}-50 to-white border border-${item.color}-100`}>
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br from-${item.color}-500 to-${item.color}-600 flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          </>
          )}
        </div>
      </div>

      {/* Modale carte temps réel — utilise la première course avec livreur actif */}
      {showMap && position && (() => {
        const courseMap = coursesActives.find(c => ["livreur_en_route","colis_recupere","en_livraison"].includes(c.statut)) || coursesActives[0];
        if (!courseMap) return null;
        return (
          <div className="fixed inset-0 z-50 bg-background">
            <div className="flex items-center justify-between p-4 border-b bg-card">
              <h2 className="text-lg font-bold text-foreground">Suivi en temps réel</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowMap(false)} className="h-10 w-10">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>
            <ModernMap
              position={position}
              livreursProches={livreursProches}
              courseActive={courseMap}
            />
          </div>
        );
      })()}

      {/* Profil modal — "Mes infos" */}
      {showProfilModal && clientProfil && (
        <ProfilModal
          clientProfil={clientProfil}
          onClose={() => setShowProfilModal(false)}
          onSave={(updatedProfil) => {
            if (updatedProfil) setClientProfil(updatedProfil);
            setShowProfilModal(false);
          }}
        />
      )}

      <VenusFloatingButton />
    </div>
  );
}