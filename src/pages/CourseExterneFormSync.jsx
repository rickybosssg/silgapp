import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import CourseStepForm from "@/components/client/CourseStepForm";
import { sauvegarderContactDB } from "@/components/client/CarnetAdresses";
import LivreurRechercheAnimation from "@/components/client/LivreurRechercheAnimation";
import InvitationWhatsAppModal from "@/components/client/InvitationWhatsAppModal";
import { normalizePhone, phoneVariants } from "@/lib/phoneUtils";

// GÃ©nÃ¨re les IDs de colis : A, B, C...
const COLIS_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function createColisDefaults(nb) {
  return Array.from({ length: nb }, (_, i) => ({
    colis_uid: COLIS_LETTERS[i] || String(i + 1),
    numero_ordre: i + 1,
    destinataire_nom: "",
    destinataire_telephone: "",
    destinataire_phone_normalized: "",
    destinataire_client_id: null,
    recipient_has_app: false,
    adresse_livraison: "",
    gps_livraison_lat: null,
    gps_livraison_lng: null,
    type_colis: "petit_colis",
    description_colis: "",
    instructions: "",
    statut: "en_attente",
    montant_a_encaisser: 0,
    mode_paiement: "especes",
    ordre_livraison: i + 1,
  }));
}

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
  const typeCourse = location.pathname.includes("expedier") ? "expedier" : location.pathname.includes("deplacement") ? "deplacement" : "recevoir";
  const position = location.state?.position || JSON.parse(localStorage.getItem("client_gps_position") || "null");
  const clientProfil = location.state?.clientProfil;
  // Coords sauvegardÃ©es en DB â€” utilisÃ©es comme fallback si getCurrentPosition timeout
  const savedLat = clientProfil?.latitude || position?.latitude || null;
  const savedLng = clientProfil?.longitude || position?.longitude || null;

  // Restaurer l'Ã©tape depuis localStorage si disponible
  const savedStep = parseInt(localStorage.getItem(STEP_KEY) || "0", 10);
  const [currentStep, setCurrentStep] = useState(isNaN(savedStep) ? 0 : savedStep);
  const [courseCreated, setCourseCreated] = useState(false);
  const [createdCourse, setCreatedCourse] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // verrou anti-double-clic
  const [invitationModal, setInvitationModal] = useState(null); // { telephone, nom } ou null
  const [gpsLoading, setGpsLoading] = useState({ depart: false, arrivee: false });

  // Lire brouillon (donnÃ©es pures, sans fonctions)
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

  // Pour "recevoir" : prÃ©-remplir la destination avec la position GPS du client
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
    quartier_depart: "",
    quartier_arrivee: "",
    destination_inconnue: false,
    notes: "",
    date_souhaitee: "",
    mode_immediat: true,
    // Pour "recevoir" : dÃ©part = chez l'expÃ©diteur (Ã  saisir), arrivÃ©e = position client (auto)
    gps_depart_lat: null,
    gps_depart_lng: null,
    gps_arrivee_lat: typeCourse === "recevoir" ? clientGpsLat : null,
    gps_arrivee_lng: typeCourse === "recevoir" ? clientGpsLng : null,
    recuperationGPS: false,
    livraisonGPS: typeCourse === "recevoir" && !!clientGpsLat,
    // Champs GPS expÃ©diteur (pour "recevoir") - IMPORTANT : persister entre Ã©tapes
    expediteur_gps_available: false,
    expediteur_gps_lat: null,
    expediteur_gps_lng: null,
  };

  const [formData, setFormData] = useState(initialData);

  // â”€â”€ Ã‰tat multi-colis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [colis, setColis] = useState(() => createColisDefaults(1));

  // Sync: quand nb_colis change, adapter le tableau de colis
  useEffect(() => {
    const nb = formData.nb_colis || 1;
    setColis(prev => {
      if (prev.length === nb) return prev;
      if (nb > prev.length) {
        // Ajouter des colis
        const extra = createColisDefaults(nb).slice(prev.length);
        return [...prev, ...extra];
      }
      // RÃ©duire
      return prev.slice(0, nb);
    });
  }, [formData.nb_colis]);

  const handleColisChange = (index, field, value) => {
    setColis(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  // PrÃ©-remplir depuis profil si pas de brouillon â€” UNE SEULE FOIS au mount
  useEffect(() => {
    if (clientProfil && !draft) {
      setFormData((prev) => ({
        ...prev,
        client_nom: clientProfil.nom || "",
        client_telephone: clientProfil.telephone || "",
        gps_arrivee_lat: prev.type_course === "recevoir" ? (clientGpsLat || prev.gps_arrivee_lat) : prev.gps_arrivee_lat,
        gps_arrivee_lng: prev.type_course === "recevoir" ? (clientGpsLng || prev.gps_arrivee_lng) : prev.gps_arrivee_lng,
        adresse_arrivee: prev.type_course === "recevoir" ? (clientAdresse || prev.adresse_arrivee || "Position GPS client") : prev.adresse_arrivee,
        livraisonGPS: prev.type_course === "recevoir" && !!clientGpsLat ? true : prev.livraisonGPS,
      }));
    }

  }, []); //  ExÃ©cutÃ© UNE fois au mount uniquement

  // Sauvegarder l'Ã©tape dans localStorage
  useEffect(() => {
    localStorage.setItem(STEP_KEY, String(currentStep));
  }, [currentStep]);

  // Helper geocoding inverse
  const reverseGeocode = async (lat, lng) => {
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`);
      const geo = await resp.json();
      const quartier = geo?.address?.suburb || geo?.address?.neighbourhood || geo?.address?.quarter || geo?.address?.city_district || geo?.address?.village || "";
      const ville = geo?.address?.city || geo?.address?.town || geo?.address?.municipality || "";
      return {
        adresse: geo?.display_name || [quartier, ville].filter(Boolean).join(", ") || "Position GPS",
        quartier,
      };
    } catch (_) { return { adresse: "Position GPS", quartier: "" }; }
  };

  const getGPSPosition = async () => {
    if (!navigator.geolocation) {
      throw new Error("no_geolocation");
    }

    const getPosition = (options) => new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

    try {
      return await getPosition({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      });
    } catch (firstError) {
      if (firstError?.code === 1) {
        throw firstError;
      }
      return getPosition({
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      });
    }
  };

  const gpsHandlers = {
    onGetGPSDepart: async () => {
      if (gpsLoading.depart) return;
      setGpsLoading(prev => ({ ...prev, depart: true }));

      try {
        let lat;
        let lng;
        try {
          const pos = await getGPSPosition();
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (gpsError) {
          if (savedLat && savedLng) {
            lat = savedLat;
            lng = savedLng;
          } else {
            if (gpsError?.code === 1) {
              toast.error("Permission GPS refusee. Autorisez la localisation dans les parametres.");
            } else if (gpsError?.code === 2) {
              toast.error("Position GPS indisponible. Verifiez le GPS ou saisissez l'adresse manuellement.");
            } else {
              toast.error("Impossible de detecter votre position. Saisissez l'adresse manuellement.");
            }
            return;
          }
        }

        const { adresse, quartier } = await reverseGeocode(lat, lng);
        setFormData((prev) => ({
          ...prev,
          gps_depart_lat: lat,
          gps_depart_lng: lng,
          recuperationGPS: true,
          adresse_depart: adresse || "Position GPS",
          quartier_depart: quartier || prev.quartier_depart,
        }));
        toast.success("Position detectee avec succes");
      } finally {
        setGpsLoading(prev => ({ ...prev, depart: false }));
      }
    },
    onGetGPSArrivee: async () => {
      if (gpsLoading.arrivee) return;
      setGpsLoading(prev => ({ ...prev, arrivee: true }));

      try {
        let lat;
        let lng;
        try {
          const pos = await getGPSPosition();
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (gpsError) {
          if (savedLat && savedLng) {
            lat = savedLat;
            lng = savedLng;
          } else {
            if (gpsError?.code === 1) {
              toast.error("Permission GPS refusee. Autorisez la localisation dans les parametres.");
            } else {
              toast.error("Impossible de detecter votre position. Verifiez le GPS ou saisissez l'adresse manuellement.");
            }
            return;
          }
        }

        const { adresse, quartier } = await reverseGeocode(lat, lng);
        setFormData((prev) => ({
          ...prev,
          gps_arrivee_lat: lat,
          gps_arrivee_lng: lng,
          livraisonGPS: true,
          adresse_arrivee: prev.adresse_arrivee || adresse,
          quartier_arrivee: quartier || prev.quartier_arrivee,
        }));
        toast.success("Position detectee avec succes");
      } finally {
        setGpsLoading(prev => ({ ...prev, arrivee: false }));
      }
    },
  };
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async (data) => {
      let finalData = { ...data };

      // â”€â”€â”€ OPTIMISTIC UI: CrÃ©er un brouillon temporaire pour affichage immÃ©diat â”€â”€
      const tempId = `temp_${Date.now()}`;
      const tempCourse = {
        ...data,
        id: tempId,
        statut: 'recherche_livreur',
        dispatch_status: 'en_attente',
        created_date: new Date().toISOString(),
      };
      queryClient.setQueryData(['courses-externes-client'], (old) => [...(old || []), tempCourse]);

      // â”€â”€â”€ ANTI-DOUBLON RENFORCÃ‰ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // CritÃ¨res larges : mÃªme client + mÃªme type, crÃ©Ã©e < 3 min (peu importe l'adresse)
      const now = Date.now();
      try {
        const coursesRecentes = await base44.entities.CourseExterne.filter(
          { client_telephone: finalData.client_telephone, type_course: finalData.type_course },
          "-created_date",
          5
        );
        const doublon = (coursesRecentes || []).find(course => {
          const age = now - new Date(course.created_date).getTime();
          return age < 3 * 60 * 1000 && !["livree", "annulee"].includes(course.statut);
        });
        if (doublon) {
          const secs = Math.round((now - new Date(doublon.created_date).getTime()) / 1000);
          // Retirer le brouillon temporaire en cas d'erreur
          queryClient.setQueryData(['courses-externes-client'], (old) => (old || []).filter(c => c.id !== tempId));
          throw new Error(`Course dÃ©jÃ  crÃ©Ã©e il y a ${secs}s. Patientez avant de rÃ©essayer.`);
        }
      } catch (err) {
        if (err.message?.includes('Course dÃ©jÃ  crÃ©Ã©e')) throw err;
        // Ignorer les autres erreurs rÃ©seau (ne pas bloquer la crÃ©ation)
      }

      // Lookup destinataire (pour "expedier") â€” lie si inscrit
      if (!finalData.destinataire_client_id && finalData.destinataire_telephone) {
        try {
          const variants = phoneVariants(finalData.destinataire_telephone);
          for (const v of variants) {
            const found = await base44.entities.ClientExterne.filter({ telephone: v }).catch(() => []);
            if (found?.length > 0) {
              finalData.destinataire_client_id = found[0].id;
              finalData.recipient_has_app = true;
              break;
            }
          }
        } catch (_) {}
      }

      // Lookup expÃ©diteur (pour "recevoir") â€” lie si inscrit dans la base clients
      if (finalData.type_course === "recevoir" && !finalData.expediteur_client_id && finalData.expediteur_telephone) {
        try {
          const variants = phoneVariants(finalData.expediteur_telephone);
          for (const v of variants) {
            const found = await base44.entities.ClientExterne.filter({ telephone: v }).catch(() => []);
            if (found?.length > 0) {
              finalData.expediteur_client_id = found[0].id;
              finalData.expediteur_has_app = true;
              break;
            }
          }
        } catch (_) {}
      }
      // GÃ©nÃ©ration QR/codes dÃ¨s la crÃ©ation
      // Pour "recevoir" : pickup = chez l'expÃ©diteur, delivery = chez le destinataire
      if (!finalData.is_multi_colis) {
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
      }

      const course = await base44.entities.CourseExterne.create(finalData);

      // â”€â”€ CrÃ©er les sous-colis si mode multi-colis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (finalData.is_multi_colis && finalData._colisData?.length > 1) {
        const colisPromises = finalData._colisData.map((c) => {
          return base44.entities.ColisExterne.create({
            course_id: course.id,
            colis_uid: c.colis_uid,
            numero_ordre: c.numero_ordre,
            destinataire_nom: c.destinataire_nom || "Destinataire",
            destinataire_telephone: c.destinataire_telephone,
            destinataire_phone_normalized: normalizePhone(c.destinataire_telephone) || c.destinataire_telephone,
            destinataire_client_id: c.destinataire_client_id || null,
            recipient_has_app: c.recipient_has_app || false,
            adresse_livraison: c.adresse_livraison || "",
            gps_livraison_lat: c.gps_livraison_lat || null,
            gps_livraison_lng: c.gps_livraison_lng || null,
            type_colis: c.type_colis || "petit_colis",
            description_colis: c.description_colis || "",
            instructions: c.instructions || "",
            statut: "en_attente",
            montant_a_encaisser: 0,
            mode_paiement: "especes",
            ordre_livraison: c.ordre_livraison || c.numero_ordre,
          });
        });
        await Promise.all(colisPromises);
      }

      // Notifier toujours (la fonction vÃ©rifie en interne)
      try {
        await base44.functions.invoke("notifyClientSync", { course_id: course.id });
      } catch (err) {
        console.error("Erreur notification:", err);
      }
      // Ne pas lancer le dispatch pour les courses programmÃ©es
      if (!formData.date_souhaitee) {
        try {
          await base44.functions.invoke("dispatchExterneAuto", {
            action: "lancer_recherche_auto",
            course_id: course.id
          });
        } catch (err) {
          console.error("Erreur dispatch:", err);
        }
      }
      return course;
    },
    onSuccess: (response) => {
      // OPTIMISTIC UI: Remplacer le brouillon temporaire par la vraie course
      queryClient.setQueryData(['courses-externes-client'], (old) =>
        (old || []).filter(c => c.id !== `temp_${Date.now()}`).concat(response)
      );
      setIsSubmitting(false);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STEP_KEY);
      queryClient.invalidateQueries({ queryKey: ['courses-externes-client'] });

      if (formData.date_souhaitee || response?.statut === "programmee") {
        toast.success("Course programmee creee");
        navigate("/client", { replace: true });
        return;
      }

      toast.success("Course creee ! Recherche d'un livreur en cours...");
      setCreatedCourse(response);
      // Sauvegarde contacts en base de donnÃ©es (sauf dÃ©placement)
      const cid = clientProfil?.id;
      const ctel = clientProfil?.telephone;
      if (formData.type_course === "expedier") {
        sauvegarderContactDB(cid, ctel, formData.destinataire_nom, formData.destinataire_telephone, "destinataire").catch(() => {});
        if (!formData.destinataire_client_id && formData.destinataire_telephone) {
          setInvitationModal({ telephone: formData.destinataire_telephone, nom: formData.destinataire_nom });
        } else { setCourseCreated(true); }
      } else if (formData.type_course === "recevoir") {
        sauvegarderContactDB(cid, ctel, formData.expediteur_nom, formData.expediteur_telephone, "expediteur").catch(() => {});
        if (!formData.expediteur_client_id && formData.expediteur_telephone) {
          setInvitationModal({ telephone: formData.expediteur_telephone, nom: formData.expediteur_nom });
        } else { setCourseCreated(true); }
      } else {
        setCourseCreated(true);
      }
    },
    onError: (err) => {
      // OPTIMISTIC UI: Retirer le brouillon en cas d'erreur
      queryClient.setQueryData(['courses-externes-client'], (old) => (old || []).filter(c => !c.id?.startsWith('temp_')));
      toast.error("Erreur : " + err.message);
      setIsSubmitting(false);
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    // â”€â”€â”€ Verrou anti-double-soumission (double-clic, re-render) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (isSubmitting || createMutation.isPending) return;
    setIsSubmitting(true);

    //  country_code DOIT Ãªtre dÃ©clarÃ© AVANT toute utilisation dans normalizePhone()
    // â”€â”€â”€ Validation des champs obligatoires â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const isExpedie = formData.type_course === "expedier";
    const isRecevoir = formData.type_course === "recevoir";
    const isDeplacementValid = formData.type_course === "deplacement";
    const missingFields = [];

    if (!formData.type_course) missingFields.push("type de course");
    if (isExpedie) {
      if (!formData.destinataire_telephone) missingFields.push("tÃ©lÃ©phone du destinataire");
    }
    if (isRecevoir) {
      if (!formData.expediteur_telephone) missingFields.push("tÃ©lÃ©phone de l'expÃ©diteur");
    }
    if (isDeplacementValid) {
      if (!formData.passager_telephone) missingFields.push("tÃ©lÃ©phone du passager");
    }
    if (!isDeplacementValid && !formData.type_colis) missingFields.push("type de colis");

    if (missingFields.length > 0) {
      console.warn("[CourseForm] Champs manquants :", missingFields);
      toast.error(`Champs manquants : ${missingFields.join(", ")}`);
      setIsSubmitting(false);
      return;
    }

    // RÃ©cupÃ©rer l'utilisateur connectÃ©
    let user;
    try {
      user = await base44.auth.me();
    } catch (err) {
      console.error("[CourseForm] Erreur auth:", err);
      toast.error("Session expirÃ©e ou problÃ¨me de connexion. RafraÃ®chissez la page.");
      setIsSubmitting(false);
      return;
    }

    // country_code obligatoire : relire le profil client avant toute utilisation.
    let clientFromDB = clientProfil || null;
    try {
      if (clientProfil?.id) {
        clientFromDB = await base44.entities.ClientExterne.get(clientProfil.id);
      } else if (user?.email) {
        const clients = await base44.entities.ClientExterne.filter({ user_email: user.email }, "-created_date", 1);
        clientFromDB = clients?.[0] || clientFromDB;
      }
    } catch (err) {
      console.warn("[CourseForm] Impossible de relire le profil client, fallback local:", err.message);
    }

    const courseCountryCode = clientFromDB?.country_code || clientProfil?.country_code || "";
    if (!courseCountryCode) {
      console.error("[CourseForm] country_code manquant sur clientFromDB:", clientFromDB);
      toast.error("Erreur : votre profil client n'a pas de pays. Veuillez contacter le support.");
      setIsSubmitting(false);
      return;
    }

    let expediteurNom, expediteurTel, expediteurClientId, expediteurPhoneNormalized;
    let destinataireNom, destinataireTel, destinataireClientId, destinatairePhoneNormalized;

    if (isExpedie) {
      expediteurNom = formData.client_nom;
      expediteurTel = formData.client_telephone;
      expediteurClientId = clientFromDB?.id || null;
      expediteurPhoneNormalized = normalizePhone(formData.client_telephone, courseCountryCode);
      destinataireNom = formData.destinataire_nom;
      destinataireTel = formData.destinataire_telephone;
      destinataireClientId = formData.destinataire_client_id || null;
      destinatairePhoneNormalized = normalizePhone(formData.destinataire_telephone, courseCountryCode);
    } else if (isDeplacementValid) {
      expediteurNom = formData.client_nom;
      expediteurTel = formData.client_telephone;
      expediteurClientId = clientFromDB?.id || null;
      expediteurPhoneNormalized = normalizePhone(formData.client_telephone, courseCountryCode);
      destinataireNom = formData.passager_nom || formData.client_nom;
      destinataireTel = formData.passager_telephone || formData.client_telephone;
      destinataireClientId = null;
      destinatairePhoneNormalized = normalizePhone(destinataireTel, courseCountryCode);
    } else {
      destinataireNom = formData.client_nom;
      destinataireTel = formData.client_telephone;
      destinataireClientId = clientFromDB?.id || null;
      destinatairePhoneNormalized = normalizePhone(formData.client_telephone, courseCountryCode);
      expediteurNom = formData.expediteur_nom;
      expediteurTel = formData.expediteur_telephone;
      expediteurClientId = formData.expediteur_client_id || null;
      expediteurPhoneNormalized = normalizePhone(formData.expediteur_telephone, courseCountryCode);
    }

    console.log("[CourseForm] Soumission :", {
      type_course: formData.type_course,
      expediteurClientId,
      destinataireClientId,
      destinataireTel,
      expediteurTel,
    });

    // Calcul prix â€” sÃ©curisÃ© : uniquement si les 4 coordonnÃ©es GPS sont valides
    let prixEstime = 0;
    if (
      formData.gps_depart_lat && formData.gps_depart_lng &&
      formData.gps_arrivee_lat && formData.gps_arrivee_lng
    ) {
      const distance = calculerDistance(
        formData.gps_depart_lat, formData.gps_depart_lng,
        formData.gps_arrivee_lat, formData.gps_arrivee_lng
      );
      // RÃ¨gle : prix minimum SILGAPP = 1 000 F CFA
      prixEstime = Math.max(Math.round(distance * 100), 1000);
    }

    // Pour "recevoir" : la destination = position du client destinataire (jamais inconnue)
    const adresseArrivee = isRecevoir
      ? (formData.adresse_arrivee || (formData.livraisonGPS ? "Position GPS client" : clientProfil?.quartier || "Chez le destinataire"))
      : (formData.adresse_arrivee || "");

    const gpsArriveLat = isRecevoir
      ? (formData.gps_arrivee_lat || clientGpsLat)
      : (formData.gps_arrivee_lat || null);
    const gpsArriveLng = isRecevoir
      ? (formData.gps_arrivee_lng || clientGpsLng)
      : (formData.gps_arrivee_lng || null);
    const destInconnue = false; // supprimÃ© â€” les adresses sont simplement optionnelles

    // Validation des rÃ´les â€” ne bloque PAS si le destinataire est hors SILGAPP
    const isDeplacement = formData.type_course === "deplacement";
    if (!isDeplacement) {
      try {
        const validationRes = await base44.functions.invoke('validateCourseRoles', {
          type_course: formData.type_course,
          expediteur_client_id: expediteurClientId,
          destinataire_client_id: destinataireClientId,
          created_by_id: user?.id
        });
        if (validationRes.data?.valid === false) {
          const errMsg = validationRes.data.errors?.[0] || "IncohÃ©rence dÃ©tectÃ©e dans les rÃ´les";
          console.warn("[CourseForm] Validation rÃ´les Ã©chouÃ©e :", errMsg);
          toast.error(errMsg);
          setIsSubmitting(false);
          return;
        }
      } catch (err) {
        console.warn("[CourseForm] validateCourseRoles indisponible, on continue :", err.message);
      }
    }

    const nbColis = isDeplacement ? 1 : (formData.nb_colis || 1);
    const isMulti = isExpedie && nbColis > 1;

    // Pour multi-colis : rÃ©sumÃ© des destinataires
    const adresseArriveeFinale = isMulti
      ? "TournÃ©e multi-colis"
      : isDeplacement ? (formData.adresse_arrivee || "") : adresseArrivee;
    const destinataireNomFinal = isMulti
      ? `${nbColis} destinataires`
      : isDeplacement ? (formData.passager_nom || "Passager")
      : (destinataireNom || "Destinataire");
    const destinataireTelFinal = isMulti
      ? (colis[0]?.destinataire_telephone || "")
      : isDeplacement ? (formData.passager_telephone || "")
      : destinataireTel;

    createMutation.mutate({
      country_code: courseCountryCode,
      client_nom: formData.client_nom,
      client_telephone: formData.client_telephone,
      type_course: formData.type_course,
      expediteur_nom: expediteurNom || "ExpÃ©diteur",
      expediteur_telephone: expediteurTel,
      expediteur_phone_normalized: expediteurPhoneNormalized,
      expediteur_client_id: expediteurClientId,
      destinataire_nom: destinataireNomFinal,
      destinataire_telephone: destinataireTelFinal,
      destinataire_phone_normalized: isMulti ? "" : destinatairePhoneNormalized,
      destinataire_client_id: isMulti ? null : destinataireClientId,
      recipient_has_app: false,
      expediteur_has_app: false,
      adresse_depart: isDeplacement ? (formData.adresse_depart || (formData.recuperationGPS ? "Position GPS" : "Ã€ dÃ©finir")) : (formData.adresse_depart || (formData.recuperationGPS ? "Position GPS" : "Ã€ dÃ©finir")),
      adresse_arrivee: adresseArriveeFinale,
      quartier_depart: formData.quartier_depart || null,
      quartier_arrivee: formData.quartier_arrivee || null,
      type_colis: isDeplacement ? "autre" : (isMulti ? (colis[0]?.type_colis || "petit_colis") : formData.type_colis),
      notes: formData.notes,
      gps_depart_lat: formData.gps_depart_lat,
      gps_depart_lng: formData.gps_depart_lng,
      gps_arrivee_lat: isMulti ? null : gpsArriveLat,
      gps_arrivee_lng: isMulti ? null : gpsArriveLng,
      destination_inconnue: destInconnue,
      prix_estimate: isMulti ? 0 : prixEstime,
      statut: formData.date_souhaitee ? "programmee" : "recherche_livreur",
      dispatch_status: "en_attente",
      date_souhaitee: formData.date_souhaitee || null,
      // Champs dÃ©placement
      passager_nom: isDeplacement ? (formData.passager_nom || "") : "",
      passager_telephone: isDeplacement ? (formData.passager_telephone || "") : "",
      nb_passagers: isDeplacement ? (formData.nb_passagers || 1) : 1,
      // Champs multi-colis
      is_multi_colis: isMulti,
      nb_colis: nbColis,
      nb_colis_livres: 0,
      nb_colis_annules: 0,
      // DonnÃ©es internes pour crÃ©ation des sous-colis (non persistÃ©es sur la course)
      _colisData: isMulti ? colis : null,
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

  // Modal invitation WhatsApp â€” affichÃ© aprÃ¨s crÃ©ation rÃ©ussie si contact hors SILGAPP
  if (invitationModal && createdCourse) {
    return (
      <>
        <LivreurRechercheAnimation course={createdCourse} />
        <InvitationWhatsAppModal
          telephone={invitationModal.telephone}
          nomContact={invitationModal.nom}
          nomExpediteur={clientProfil?.nom || formData.client_nom || "Votre contact"}
          onClose={() => { setInvitationModal(null); setCourseCreated(true); }}
          onSend={() => { setInvitationModal(null); setCourseCreated(true); }}
        />
      </>
    );
  }

  // â”€â”€ Blocage client pour frais d'annulation impayÃ©s â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (clientProfil?.bloque_frais_annulation) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <span className="text-4xl"></span>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">Compte bloquÃ©</h2>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">
              Votre compte est temporairement bloquÃ© pour frais d'annulation impayÃ©s. Veuillez contacter SILGAPP.
            </p>
          </div>
          <a
            href="https://wa.me/22667572857"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-full h-12 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors"
          >
             Contacter SILGAPP via WhatsApp
          </a>
          <button
            onClick={() => navigate("/")}
            className="w-full h-10 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  const totalSteps = typeCourse === "deplacement" ? 6 : 7;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="outline" size="sm" onClick={handleAnnuler} className="h-10 w-10 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">
              {formData.type_course === "expedier" ? "ExpÃ©dier un colis" : formData.type_course === "deplacement" ? "DÃ©placement" : "Recevoir un colis"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, mode_immediat: true }))}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${formData.mode_immediat ? "bg-primary text-white shadow" : "bg-gray-100 text-gray-500"}`}
            >
              Maintenant
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, mode_immediat: false }))}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${!formData.mode_immediat ? "bg-primary text-white shadow" : "bg-gray-100 text-gray-500"}`}
            >
              Programmer
            </button>
          </div>
        </div>

        {!formData.mode_immediat && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
            <p className="text-xs font-bold text-amber-700 mb-2"> Date et heure souhaitÃ©es</p>
            <input
              type="datetime-local"
              value={formData.date_souhaitee ? formData.date_souhaitee.slice(0, 16) : ""}
              onChange={e => setFormData(prev => ({ ...prev, date_souhaitee: e.target.value ? new Date(e.target.value).toISOString() : "" }))}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm text-gray-900"
            />
          </div>
        )}

        <Card className="p-6" style={{ background: "#ffffff" }}>
          <form onSubmit={handleSubmit}>
            <CourseStepForm
              step={currentStep}
              totalSteps={totalSteps}
              formData={formData}
              gpsHandlers={gpsHandlers}
              gpsLoading={gpsLoading}
              setFormData={setFormData}
              onNext={handleNext}
              onBack={handleBack}
              onAnnuler={handleAnnuler}
              isLoading={createMutation.isPending || isSubmitting}
              clientId={clientProfil?.id}
              countryCode={clientProfil?.country_code}
              colis={colis}
              onColisChange={handleColisChange}
              savedLat={savedLat}
              savedLng={savedLng}
            />
          </form>
        </Card>
      </div>
    </div>
  );
}