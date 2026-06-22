import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useClientNotifications } from "@/hooks/useClientNotifications";
import { registerPushToken } from "@/lib/notifications";
import PullToRefreshIndicator from "@/components/ui/PullToRefreshIndicator";
import { useQueryClient } from "@tanstack/react-query";
import { 
  MapPin, Navigation, MessageCircle, User, Package, 
  Clock, ChevronRight, TrendingUp, Loader2, ArrowLeft, RefreshCw,
  Store, UtensilsCrossed
} from "lucide-react";
import LivreurRatingDialog from "@/components/client/LivreurRatingDialog";
import CourseAnnuleeRelanceDialog from "@/components/client/CourseAnnuleeRelanceDialog";
import VenusFloatingButton from "@/components/client/VenusFloatingButton";
import LiveCounterBadge from "@/components/ui/LiveCounterBadge";
import MessagesPage from "@/components/chat/MessagesPage";
import ModernMap from "@/components/client/ModernMap";
import ProfilModal from "@/components/client/ProfilModal";
import SupportWhatsApp from "@/components/client/SupportWhatsApp";
import ClientOnboarding from "@/components/client/ClientOnboarding";
import OngletCodePromo from "@/components/client/OngletCodePromo";
import PubliciteCarousel from "@/components/publicite/PubliciteCarousel";
import PubliciteFullscreen from "@/components/publicite/PubliciteFullscreen";
import MultiColisProgressBadge from "@/components/multi-colis/MultiColisProgressBadge";


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
  const [courseANoter, setCourseANoter] = useState(null);
  const [notationShownFor, setNotationShownFor] = useState(null);
  const [courseAnnuleeRelance, setCourseAnnuleeRelance] = useState(null); // course annulée auto → proposer relance
  const [showMessages, setShowMessages] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    try { return localStorage.getItem("silgapp_client_session_id") || null; } catch { return null; }
  });
  const [sessionExpired, setSessionExpired] = useState(false);

  const [userId, setUserId] = useState(null);
  const queryClient = useQueryClient();
  const clientProfilRef = useRef(null);
  useEffect(() => { clientProfilRef.current = clientProfil; }, [clientProfil]);

  // Pull-to-refresh
  const { pulling, refreshing } = usePullToRefresh(async () => {
    await loadProfil();
    if (position && clientProfil) {
      await checkStatus(position, clientProfil);
    }
    await queryClient.invalidateQueries({ queryKey: ["livreurs"] });
  });

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

  // Notifications push client — son + vibration pour expéditeurs et destinataires
  useClientNotifications(clientProfil?.user_email, (notif) => {
    // Recharger les courses si notification liée à une course
    if (notif.course_id && clientProfil && position) {
      checkStatus(position, clientProfil);
    }
  });

  // Heartbeat automatique — sync toutes les 30s + événements lifecycle
  // Activé dès que le profil est chargé (même sans GPS pour anciens utilisateurs)
  // --- GESTION SESSION UNIQUE CLIENT ---
  useEffect(() => {
    if (!onboardingDone || !clientProfil?.id || sessionExpired) return;
    
    const initSession = async () => {
      try {
        const deviceId = navigator.userAgent.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
        const res = await base44.functions.invoke("gestionSessionClient", {
          device_id: deviceId,
          plateforme: "android",
        });
        
        if (res?.data?.session_id) {
          const newSessionId = res.data.session_id;
          setSessionId(newSessionId);
          try { localStorage.setItem("silgapp_client_session_id", newSessionId); } catch {}
          console.log("[Session Client] Nouvelle session:", newSessionId);
        }
      } catch (err) {
        console.error("[Session Client] Erreur init:", err);
      }
    };
    
    initSession();
  }, [onboardingDone, clientProfil?.id, sessionExpired]);

  const handleClientSessionExpired = () => {
    console.log("[Session Client] Session expirée");
    setSessionExpired(true);
    try { localStorage.removeItem("silgapp_client_session_id"); } catch {}
    toast.error("Session expirée", {
      description: "Vous avez été déconnecté car une autre session a été ouverte sur un autre appareil.",
      duration: 8000,
    });
  };

  // Heartbeat automatique
  useHeartbeat({
    user_type: "client",
    position: position,
    enabled: !!clientProfil && !sessionExpired,
    session_id: sessionId,
    onSessionExpired: handleClientSessionExpired,
  });

  // Enregistrement token push pour les clients (notifications même app fermée)
  useEffect(() => {
    if (!clientProfil?.id || !clientProfil?.user_email) return;
    registerPushToken(null, {
      email: clientProfil.user_email,
      user_type: "client",
      client_id: clientProfil.id,
    }).catch(() => null);
  }, [clientProfil?.id, clientProfil?.user_email]);

  useEffect(() => {
    loadProfil();
    base44.auth.me().then(u => setUserId(u?.id)).catch(() => null);
  }, []);

  // Détecter les courses livrées sans notation → afficher le dialog depuis le dashboard
  useEffect(() => {
    if (!clientProfil?.id) return;
    const checkCourseNotation = async () => {
      try {
        const user = await base44.auth.me();
        const courses = await base44.entities.CourseExterne.filter(
          { created_by_id: user.id, statut: "livree" }, "-updated_date", 10
        );
        const sanNote = (courses || []).find(c =>
          !c.note_livreur &&
          c.livreur_id &&
          notationShownFor !== c.id
        );
        if (sanNote) {
          setCourseANoter(sanNote);
          setNotationShownFor(sanNote.id);
        }
      } catch (_) {}
    };
    // Vérifier au montage et toutes les 60s (notation non urgente)
    checkCourseNotation();
    const iv = setInterval(checkCourseNotation, 60000); // ⚡ 10s → 60s
    return () => clearInterval(iv);
  }, [clientProfil?.id, notationShownFor]);

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
  // syncGpsDestinataire appelé ici (toutes les 15s) au lieu du polling (toutes les 5s) → -66% requêtes
  const lastQuartierSync = useRef(0);
  const clientProfilForGps = useRef(null);
  useEffect(() => { clientProfilForGps.current = clientProfil; }, [clientProfil]);

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
          // syncGpsDestinataire ici (15s) — pas dans le polling 8s pour réduire les requêtes
          const profil = clientProfilForGps.current;
          if (profil) syncGpsDestinataire(posData, profil);
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

  // Polling automatique des courses actives toutes les 8s
  // syncGpsDestinataire est appelé uniquement dans le watch GPS (15s) pour éviter le rate limit
  useEffect(() => {
    if (!onboardingDone || !clientProfil || !position) return;
    const interval = setInterval(() => {
      checkStatus(position, clientProfil);
    }, 8000); // ⚡ 5s → 8s : checkStatus fait 4-5 requêtes imbriquées
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
          // ⚠️ PAS de country_code ici — sera défini par l'onboarding (EtapeProfil)
          // Mettre BF par défaut causait des courses créées avec le mauvais pays
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

        // ── Détecter les annulations automatiques (timeout 4 min) ─────────────
        // Si une notif course_annulee existe et qu'aucun dialog n'est déjà ouvert
        const notifAnnulee = userNotifications.find(n => n.type === 'course_annulee' && n.course_id);
        if (notifAnnulee && !courseAnnuleeRelance) {
          // Vérifier que la course est bien annulée par timeout (pas manuellement)
          try {
            const coursesAnnulees = await base44.entities.CourseExterne.filter({ id: notifAnnulee.course_id });
            const c = coursesAnnulees?.[0];
            if (c && c.statut === 'annulee' && c.dispatch_status === 'expire') {
              setCourseAnnuleeRelance(c);
              // Marquer la notif comme lue pour éviter de re-déclencher
              base44.entities.Notification.update(notifAnnulee.id, { lue: true }).catch(() => null);
            }
          } catch (_) {}
        }
      }

      await loadLivreursProches(pos);
    } catch (err) {
      console.error("Erreur vérification statut:", err);
    }
  };

  const loadLivreursProches = async (pos) => {
    try {
      if (!pos) return;
      // Filtrer par pays du client
      const filter = {
        type_livreur: "externe",
        statut: "disponible",
        actif: true,
        validation: "valide",
      };
      if (clientProfil?.country_code) {
        filter.country_code = clientProfil.country_code;
      }
      const livreurs = await base44.entities.Livreur.filter(filter);

      // Seul critère restant : GPS renseigné (latitude + longitude)
      // app_active n'est PAS un critère de disponibilité — seulement un critère de mode de notification
      const eligibles = (livreurs || []).filter(l => l.latitude && l.longitude);
      console.log(`[Carte] Affichés sur la carte: ${eligibles.length}`);

      // Ne pas écraser si la requête retourne vide (protection anti-flash)
      if (eligibles.length > 0) {
        setLivreursProches(eligibles);
      } else if ((livreurs || []).length === 0) {
        // Vraiment aucun livreur dispo — on peut vider
        setLivreursProches([]);
      }
      // Si eligibles.length === 0 mais livreurs.length > 0, c'est un pb de GPS → on garde l'ancienne liste
    } catch (err) {
      console.error("Erreur chargement livreurs:", err);
      // En cas d'erreur réseau, NE PAS vider la liste existante
    }
  };





  // ── Session expirée ───────────────────────────────────────────────────────
  if (sessionExpired) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <span className="text-4xl">📱</span>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">Session expirée</h2>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">
              Vous avez été déconnecté car une autre session a été ouverte sur un autre appareil.
            </p>
          </div>
          <button
            onClick={() => {
              try { localStorage.removeItem("silgapp_client_session_id"); } catch {}
              base44.auth.logout();
              setTimeout(() => window.location.reload(), 300);
            }}
            className="inline-flex items-center justify-center w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition-colors"
          >
            Se reconnecter
          </button>
        </div>
      </div>
    );
  }

  // ── Client bloqué pour frais d'annulation impayés ─────────────────────────
  if (!loading && clientProfil?.bloque_frais_annulation) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <span className="text-4xl">🔒</span>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">Compte bloqué</h2>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">
              Votre compte est temporairement bloqué pour frais d'annulation impayés. Veuillez contacter SILGAPP.
            </p>
          </div>
          <a
            href="https://wa.me/22667572857"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-full h-12 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors"
          >
            💬 Contacter SILGAPP via WhatsApp
          </a>
        </div>
      </div>
    );
  }

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
    <div className="min-h-screen bg-gray-50">
      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} />

      {/* ── COURSES ACTIVES — bannière flottante ─────── */}
      {coursesActives.length > 0 && (
        <div className="fixed top-3 left-3 right-3 z-50 space-y-2">
          {coursesActives.map((course) => (
            <div
              key={course.id}
              className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-primary/20 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => navigate("/client/suivi", { state: { course_id: course.id } })}
            >
              <div className="h-1 bg-gradient-to-r from-primary to-red-500 w-full" />
              <div className="p-3 flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-primary">
                    {course.type_course === "deplacement" && course.statut === "recherche_livreur" ? "🔍 Recherche chauffeur..." :
                     course.type_course === "deplacement" && course.statut === "livreur_en_route" ? "🚗 Chauffeur en route" :
                     course.type_course === "deplacement" && course.statut === "arrive_prise_en_charge" ? "📍 Arrivé au point de prise en charge" :
                     course.type_course === "deplacement" && course.statut === "passager_embarque" ? "👤 Passager à bord" :
                     course.type_course === "deplacement" && course.statut === "livree" ? "✅ Déplacement terminé" :
                     course.statut === "recherche_livreur" ? "🔍 Recherche livreur..." :
                     course.statut === "livreur_en_route"  ? "🚀 Livreur en route" :
                     course.statut === "colis_recupere"    ? "📦 Colis récupéré" : "🚚 En livraison"}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {course.livreur_nom || "Livreur assigné"} · {course.adresse_depart} → {course.adresse_arrivee}
                  </p>
                  {course.is_multi_colis && (
                    <div className="mt-1">
                      <MultiColisProgressBadge
                        nbColis={course.nb_colis || 1}
                        nbLivres={course.nb_colis_livres || 0}
                        nbAnnules={course.nb_colis_annules || 0}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pb-24" style={coursesActives.length > 0 ? { paddingTop: `${coursesActives.length * 76 + 16}px` } : { paddingTop: "16px" }}>
        <div className="max-w-lg mx-auto space-y-4">

          {/* ── ONGLETS PROMO ─────────────────────── */}
          {aUnCodePromo && (
            <div className="flex bg-white rounded-2xl p-1 gap-1 shadow-sm border border-gray-100">
              <button
                onClick={() => setOngletActif("accueil")}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${ongletActif === "accueil" ? "bg-primary text-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              >
                🏠 Accueil
              </button>
              <button
                onClick={() => setOngletActif("promo")}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${ongletActif === "promo" ? "bg-purple-600 text-white shadow" : "text-gray-500 hover:text-gray-700"}`}
              >
                🎁 Code Promo
              </button>
            </div>
          )}

          {/* ── ONGLET CODE PROMO ─────────────────── */}
          {ongletActif === "promo" && aUnCodePromo && (
            <OngletCodePromo clientProfil={clientProfil} />
          )}

          {ongletActif !== "promo" && (
            <>

              {/* ── NOTIFICATIONS ─────────────────── */}
              {notifications.length > 0 && (
                <div className="space-y-2">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-amber-900 text-sm">{notif.titre}</p>
                        <p className="text-xs text-amber-700 mt-0.5">{notif.message}</p>
                        {notif.course_id && (
                          <button
                            className="mt-2 text-xs font-bold text-amber-800 underline"
                            onClick={() => navigate("/client/suivi")}
                          >
                            Voir la course →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── PUBLICITÉS CARROUSEL ──────────── */}
              <PubliciteCarousel cible="clients" userId={clientProfil?.id} userType="client" />

              {/* ── HERO HEADER ───────────────────── */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-red-500 to-red-700 p-5 shadow-xl shadow-red-200">
                {/* Cercles déco */}
                <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full" />
                <div className="absolute -bottom-8 -left-4 w-36 h-36 bg-white/5 rounded-full" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white/70 text-xs font-medium">Bonjour 👋</p>
                      <h1 className="text-2xl font-black text-white mt-0.5">{prenom}</h1>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">
                          <MapPin className="w-3 h-3 text-white" />
                          <span className="text-xs text-white font-semibold">
                            {clientProfil?.quartier || "Ouagadougou"}
                          </span>
                        </div>
                        <GPSBadge profil={clientProfil} onForceSync={handleForceGPSSync} />
                        <LiveCounterBadge type="livreurs" count={livreursProches.length} />
                      </div>
                    </div>
                    <button
                      className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors"
                      onClick={() => setShowProfilModal(true)}
                    >
                      <User className="w-5 h-5 text-white" />
                    </button>
                  </div>

                  {/* Stats rapides dans le header */}
                  {coursesActives.length > 0 && (
                    <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-2.5 flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <p className="text-white text-xs font-semibold">
                        {coursesActives.length} course{coursesActives.length > 1 ? "s" : ""} en cours · appuyez ci-dessus
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── ACTIONS PRINCIPALES ───────────── */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-5 text-left active:scale-[0.97] transition-all hover:shadow-md hover:border-primary/20"
                  onClick={() => navigate("/client/course/expedier", { state: { position, clientProfil } })}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-lg shadow-red-200 mb-2 group-hover:scale-105 transition-transform">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-black text-gray-900 text-xs">Expédier</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Envoyer un colis</p>
                </button>

                <button
                  className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-5 text-left active:scale-[0.97] transition-all hover:shadow-md hover:border-green-200"
                  onClick={() => navigate("/client/course/recevoir", { state: { position, clientProfil } })}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-200 mb-2 group-hover:scale-105 transition-transform">
                    <span className="text-xl">📥</span>
                  </div>
                  <p className="font-black text-gray-900 text-xs">Recevoir</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Attendre un colis</p>
                </button>

                <button
                  className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-5 text-left active:scale-[0.97] transition-all hover:shadow-md hover:border-sky-200"
                  onClick={() => navigate("/client/course/deplacement", { state: { position, clientProfil } })}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-200 mb-2 group-hover:scale-105 transition-transform">
                    <span className="text-xl">👤</span>
                  </div>
                  <p className="font-black text-gray-900 text-xs">Déplacement</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Transport personne</p>
                </button>

                <button
                  className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-5 text-left active:scale-[0.97] transition-all hover:shadow-md hover:border-purple-200"
                  onClick={() => setShowMessages(true)}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-200 mb-2 group-hover:scale-105 transition-transform">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-black text-gray-900 text-xs">Messages</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Discuter avec clients / livreurs</p>
                </button>

                <button
                  className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-5 text-left active:scale-[0.97] transition-all hover:shadow-md hover:border-blue-200"
                  onClick={() => navigate("/client/boutiques")}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200 mb-2 group-hover:scale-105 transition-transform">
                    <Store className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-black text-gray-900 text-xs">Boutiques</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Commander en boutique</p>
                </button>

                <button
                  className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-5 text-left active:scale-[0.97] transition-all hover:shadow-md hover:border-orange-200"
                  onClick={() => navigate("/client/restaurants")}
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-200 mb-2 group-hover:scale-105 transition-transform">
                    <UtensilsCrossed className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-black text-gray-900 text-xs">Restaurants</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Commander à manger</p>
                </button>
              </div>

              {/* ── BOUTON CARTE ──────────────────── */}
              {position && (
                <button
                  className="w-full bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:shadow-md hover:border-primary/20 transition-all active:scale-[0.98]"
                  onClick={() => setShowMap(true)}
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="flex-1 text-left font-semibold text-gray-800 text-sm">
                    {coursesActives.some(c => ["livreur_en_route","colis_recupere","en_livraison"].includes(c.statut))
                      ? "📍 Voir le livreur en temps réel"
                      : "🗺️ Voir la carte"}
                  </p>
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              )}

              {/* ── RACCOURCIS ────────────────────── */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Accès rapide</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { icon: <Package className="w-5 h-5" />, label: "Courses",   color: "text-blue-600",   bg: "bg-blue-50",   action: () => navigate("/client/suivi") },
                    { icon: <Clock className="w-5 h-5" />,   label: "Historique",color: "text-purple-600", bg: "bg-purple-50", action: () => navigate("/client/suivi") },
                    { icon: <Package className="w-5 h-5" />, label: "Commandes", color: "text-indigo-600", bg: "bg-indigo-50", action: () => navigate("/client/mes-commandes") },
                    { icon: <span className="text-xs">💬</span>, label: "Support", color: "text-green-600", bg: "bg-green-50", action: () => {
                      const msg = encodeURIComponent("Bonjour SILGAPP 👋\nJ'ai besoin d'aide sur SILGAPP.");
                      const a = document.createElement("a");
                      a.href = `whatsapp://send?phone=22667572857&text=${msg}`;
                      a.click();
                      setTimeout(() => { if (document.hasFocus()) window.open(`https://wa.me/22667572857?text=${msg}`, "_blank"); }, 500);
                    }},
                    { icon: <User className="w-5 h-5" />,    label: "Profil",    color: "text-orange-600", bg: "bg-orange-50", action: () => setShowProfilModal(true) },
                  ].map((item, i) => (
                    <button
                      key={i}
                      onClick={item.action}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
                    >
                      <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center ${item.color}`}>
                        {item.icon}
                      </div>
                      <span className="text-[10px] font-semibold text-gray-600">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── BANNIÈRE CODE PROMO ───────────── */}
              {clientProfil?.code_promo_utilise && !clientProfil?.premiere_course_faite && (
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-4 shadow-lg shadow-purple-200">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎁</span>
                    <div className="flex-1">
                      <p className="font-black text-white text-sm">Code promo actif</p>
                      <p className="text-white/80 text-xs mt-0.5">
                        <span className="font-black font-mono bg-white/20 px-1.5 py-0.5 rounded">{clientProfil.code_promo_utilise}</span>
                        {" "}· −100 FCFA sur votre prochaine course
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SUPPORT + TARIF ───────────────── */}
              <SupportWhatsApp />

              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                  </div>
                  <p className="font-bold text-gray-800 text-sm">Pourquoi SILGAPP ?</p>
                </div>
                <div className="space-y-2">
                  {[
                    { icon: "⚡", color: "bg-green-50 text-green-700",   title: "Livraison rapide",  desc: "Livreurs disponibles 24/7" },
                    { icon: "🔒", color: "bg-blue-50 text-blue-700",     title: "Service sécurisé",  desc: "Livreurs vérifiés et suivis" },
                    { icon: "💬", color: "bg-purple-50 text-purple-700", title: "Support réactif",   desc: "Aide disponible à tout moment" },
                    { icon: "💰", color: "bg-amber-50 text-amber-700",   title: "100 F/km",          desc: "Tarif transparent et calculé au km" },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl ${item.color}`}>
                      <span className="text-base">{item.icon}</span>
                      <div>
                        <p className="text-xs font-bold">{item.title}</p>
                        <p className="text-[10px] opacity-70">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </>
          )}
        </div>
      </div>

      {/* Modale carte temps réel */}
      {showMap && position && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between p-4 border-b bg-card flex-shrink-0">
            <h2 className="text-lg font-bold text-foreground">
              {coursesActives.find(c => ["livreur_en_route","colis_recupere","en_livraison"].includes(c.statut))
                ? "📍 Suivi en temps réel"
                : "🗺️ Carte"}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setShowMap(false)} className="h-10 w-10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex-1 relative">
            <ModernMap
              position={position}
              livreursProches={livreursProches}
              courseActive={coursesActives.find(c => ["livreur_en_route","colis_recupere","en_livraison"].includes(c.statut)) || null}
            />
          </div>
        </div>
      )}

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

      {/* ── COURSE ANNULÉE AUTO — proposer relance ou terminer ── */}
      {courseAnnuleeRelance && (
        <CourseAnnuleeRelanceDialog
          course={courseAnnuleeRelance}
          onRelancer={() => {
            setCourseAnnuleeRelance(null);
            navigate("/client/course/" + (courseAnnuleeRelance.type_course || "expedier"), {
              state: { position, clientProfil }
            });
          }}
          onTerminer={() => setCourseAnnuleeRelance(null)}
        />
      )}

      {/* ── NOTATION LIVREUR — déclenchée depuis le dashboard ── */}
      {courseANoter && (
        <LivreurRatingDialog
          course={courseANoter}
          onClose={() => setCourseANoter(null)}
          onRated={() => setCourseANoter(null)}
        />
      )}

      {/* ── PUBLICITÉ PLEIN ÉCRAN ── */}
      <PubliciteFullscreen cible="clients" userId={clientProfil?.id} userType="client" />

      {/* ── MESSAGES ── */}
      {showMessages && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <MessagesPage
            myType="client"
            myId={clientProfil?.id}
            myName={prenom}
            onBack={() => setShowMessages(false)}
          />
        </div>
      )}
    </div>
  );
}