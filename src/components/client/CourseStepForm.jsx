import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, ArrowRight, MapPin, Navigation, Package,
  User, FileText, CheckCircle, Truck, AlertCircle,
  Loader2, Search, Send, Inbox, Sparkles, Car, DollarSign,
  Pencil, ChevronDown, ChevronUp, Info
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { calculerPrixApproximatif } from "@/lib/priceEstimate";
import { isPaysTarificationGrandOuaga, calculerTarifGrandOuagaAsync } from "@/lib/tarifGrandOuaga";
import CarnetAdresses from "@/components/client/CarnetAdresses";
import ContactPickerButton from "@/components/client/ContactPickerButton";
import { SILGAPP_COUNTRIES, phoneVariants } from "@/lib/phoneUtils";
import NombreColisSelector from "@/components/multi-colis/NombreColisSelector";
import MultiColisFormStep from "@/components/multi-colis/MultiColisFormStep";
import SmartAddressInput from "@/components/location/SmartAddressInput";
import { useCountryPricing } from "@/hooks/useCountryPricing";

// ─── Palette premium ─────────────────────────────────────────────────────────
// Vert émeraude #059669 — Bleu ardoise #1E293B — Fond #F8FAFC
// Texte principal #0F172A — Accent corail #F97316
const COLORS = {
  primary: "#007AFF",
  primaryHover: "#0051D5",
  primaryLight: "#E3F0FF",
  secondary: "#1E293B",
  secondaryLight: "#F1F5F9",
  accent: "#F97316",
  accentLight: "#FFF7ED",
  textMain: "#1D1D1F",
  textSecondary: "#64748B",
  textLabel: "#334155",
  textHint: "#94A3B8",
  textError: "#FF3B30",
  bgMain: "#F5F5F7",
  bgCard: "#FFFFFF",
  bgSection: "#F1F5F9",
  border: "#E2E8F0",
  borderInput: "#CBD5E1",
};

// ─── Helpers téléphone ────────────────────────────────────────────────────────
function getDialCode(countryCode) {
  const c = SILGAPP_COUNTRIES.find(x => x.code === countryCode);
  return c ? `+${c.dial}` : "+226";
}
function getPhonePlaceholder(countryCode) {
  const c = SILGAPP_COUNTRIES.find(x => x.code === countryCode);
  if (!c) return "+226 XX XX XX XX";
  const xs = "X".repeat(c.len).replace(/(.{2})/g, "$1 ").trim();
  return `+${c.dial} ${xs}`;
}
function normalizeForSearch(phone, countryCode) {
  const raw = (phone || "").replace(/\D/g, "");
  if (!raw) return phone || "";
  const c = SILGAPP_COUNTRIES.find(x => x.code === countryCode);
  if (!c) return raw;
  if (raw.startsWith(c.dial) && raw.length === c.dial.length + c.len) return "+" + raw;
  if (raw.length === c.len) return "+" + c.dial + raw;
  if (raw.startsWith("0") && raw.length === c.len + 1) return "+" + c.dial + raw.slice(1);
  return "+" + raw;
}

const STORAGE_KEY = "silgapp_course_draft";

// ─── Composant icône d'étape ──────────────────────────────────────────────────
function StepIcon({ icon: Icon }) {
  return (
    <div
      className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
      style={{ background: COLORS.primaryLight }}
    >
      <Icon className="w-7 h-7" style={{ color: COLORS.primary }} />
    </div>
  );
}

// ─── Champ input premium ──────────────────────────────────────────────────────
function PremiumInput({ label, required, hint, children, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <Label className="text-sm font-semibold flex items-center gap-1" style={{ color: COLORS.textLabel }}>
          {label}
          {required && <span className="text-red-500">*</span>}
          {!required && <span className="text-xs font-normal" style={{ color: COLORS.textHint }}>(optionnel)</span>}
        </Label>
      )}
      {children || (
        <Input
          {...props}
          className="h-14 rounded-xl border bg-white px-4 text-base font-medium transition-all focus:outline-none"
          style={{ borderColor: COLORS.borderInput }}
        />
      )}
      {hint && <p className="text-xs pl-1" style={{ color: COLORS.textHint }}>{hint}</p>}
    </div>
  );
}

// ─── Barre de progression premium ────────────────────────────────────────────
function ProgressBar({ step, totalSteps, stepTitle }) {
  const progress = ((step + 1) / totalSteps) * 100;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: COLORS.textSecondary }}>
          Étape {step + 1} sur {totalSteps}
          {stepTitle && <span className="ml-1.5 font-bold" style={{ color: COLORS.secondary }}>— {stepTitle}</span>}
        </span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: COLORS.bgSection }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%`, background: COLORS.primary }}
        />
      </div>
      <div className="flex justify-between mt-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: 8,
              height: 8,
              background: i <= step ? COLORS.primary : COLORS.border,
              transform: i === step ? "scale(1.3)" : "scale(1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Boutons de navigation ───────────────────────────────────────────────────
function NavButtons({ step, totalSteps, onBack, onNext, onAnnuler, onSubmit, isLoading, isContinueDisabled, isLastStep }) {
  return (
    <div className="flex gap-3 pt-2">
      {step > 0 ? (
        <button
          type="button"
          onClick={onBack}
          className="flex-1 h-14 rounded-xl border-2 bg-white font-semibold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          style={{ borderColor: COLORS.border, color: COLORS.textSecondary }}
        >
          <ArrowLeft className="w-5 h-5" />
          Retour
        </button>
      ) : (
        <button
          type="button"
          onClick={onAnnuler}
          className="flex-1 h-14 rounded-xl border-2 bg-white font-semibold text-base transition-all active:scale-[0.98] flex items-center justify-center"
          style={{ borderColor: COLORS.border, color: COLORS.textSecondary }}
        >
          Annuler
        </button>
      )}

      {!isLastStep ? (
        <button
          type="button"
          onClick={onNext}
          disabled={isContinueDisabled}
          className="flex-1 h-14 rounded-xl text-white font-bold text-base shadow-md transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: COLORS.primary }}
        >
          Continuer
          <ArrowRight className="w-5 h-5" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 h-14 rounded-xl text-white font-black text-base shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: COLORS.primary }}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Création...
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              Confirmer la course
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default function CourseStepForm({
  step,
  totalSteps,
  formData,
  gpsHandlers,
  gpsLoading,
  setFormData,
  onNext,
  onBack,
  onAnnuler,
  onGoToStep,
  isLoading,
  clientId,
  countryCode,
  colis,
  onColisChange,
  savedLat,
  savedLng,
}) {
  const activeCountry = countryCode || "BF";
  const phonePlaceholder = getPhonePlaceholder(activeCountry);
  const [expediteurFound, setExpediteurFound] = useState(null);
  const [destinataireFound, setDestinataireFound] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const { devise: countryDevise, prixSuggeres: countryPrixSuggeres } = useCountryPricing(activeCountry);

  const isExpedie = formData.type_course === "expedier";
  const isRecevoir = formData.type_course === "recevoir";
  const isDeplacement = formData.type_course === "deplacement";

  // ── Source unique : calcul ORS Grand Ouaga (BF uniquement) ──────────────
  // Un SEUL appel ORS par paire de coordonnées. Le résultat complet est
  // stocké dans formData._tarifGrandOuaga et réutilisé par CourseExterneFormSync.
  const prixManuelModifie = useRef(false);
  const derniereCleCoords = useRef("");
  const [recalculerDisponible, setRecalculerDisponible] = useState(false);

  useEffect(() => {
    if (!isPaysTarificationGrandOuaga(activeCountry)) return;
    if (!formData.gps_depart_lat || !formData.gps_depart_lng ||
        !formData.gps_arrivee_lat || !formData.gps_arrivee_lng) return;

    const cleCoords = `${formData.gps_depart_lat},${formData.gps_depart_lng},${formData.gps_arrivee_lat},${formData.gps_arrivee_lng}`;

    // Si les coordonnées ont changé après une modif manuelle → proposer recalcul
    if (prixManuelModifie.current && derniereCleCoords.current && derniereCleCoords.current !== cleCoords) {
      setRecalculerDisponible(true);
      return;
    }

    let cancelled = false;
    calculerTarifGrandOuagaAsync(
      formData.gps_depart_lat, formData.gps_depart_lng,
      formData.gps_arrivee_lat, formData.gps_arrivee_lng,
      activeCountry,
      formData.gps_depart_source,
      formData.gps_arrivee_source
    ).then((tarif) => {
      if (cancelled || !tarif) return;
      derniereCleCoords.current = cleCoords;
      // Ne pas écraser le prix si l'utilisateur l'a modifié manuellement
      if (!prixManuelModifie.current) {
        setFormData(prev => ({
          ...prev,
          prix_propose: tarif.prix || prev.prix_propose,
          _tarifGrandOuaga: tarif,
        }));
      } else {
        // Garder le résultat pour CourseExterneFormSync, mais ne pas écraser le prix
        setFormData(prev => ({ ...prev, _tarifGrandOuaga: tarif }));
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [formData.gps_depart_lat, formData.gps_depart_lng,
      formData.gps_arrivee_lat, formData.gps_arrivee_lng,
      formData.gps_depart_source, formData.gps_arrivee_source,
      activeCountry]);

  // ── Recalculer le tarif après modif manuelle + changement de coordonnées ──
  const handleRecalculerTarif = async () => {
    if (!formData.gps_depart_lat || !formData.gps_arrivee_lat) return;
    const tarif = await calculerTarifGrandOuagaAsync(
      formData.gps_depart_lat, formData.gps_depart_lng,
      formData.gps_arrivee_lat, formData.gps_arrivee_lng,
      activeCountry,
      formData.gps_depart_source,
      formData.gps_arrivee_source
    );
    if (tarif?.prix) {
      prixManuelModifie.current = false;
      setRecalculerDisponible(false);
      setFormData(prev => ({
        ...prev,
        prix_propose: tarif.prix,
        _tarifGrandOuaga: tarif,
      }));
    }
  };

  // ─── Titre de l'étape courante ──────────────────────────────────────────────
  const stepTitles = isExpedie
    ? ["Récupération", "Destinataire", "Livraison", "Détails", "Récapitulatif"]
    : isRecevoir
    ? ["Expéditeur", "Récupération", "Détails", "Récapitulatif"]
    : ["Prise en charge", "Destination", "Passager", "Détails", "Récapitulatif"];

  const updateAddress = (side, text, location) => {
    const isDeparture = side === "depart";
    setFormData((previous) => ({
      ...previous,
      [isDeparture ? "adresse_depart" : "adresse_arrivee"]: text,
      [isDeparture ? "quartier_depart" : "quartier_arrivee"]:
        location?.quartier || (location ? location.label : text),
      ...(location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
        ? {
            [isDeparture ? "gps_depart_lat" : "gps_arrivee_lat"]: Number(location.latitude),
            [isDeparture ? "gps_depart_lng" : "gps_arrivee_lng"]: Number(location.longitude),
            [isDeparture ? "recuperationGPS" : "livraisonGPS"]: true,
          }
        : {}),
    }));
  };

  // ─── Auto-remplir le prix proposé avec l'estimation GPS (conseil uniquement) ──
  useEffect(() => {
    const lat1 = formData.gps_depart_lat;
    const lng1 = formData.gps_depart_lng;
    const lat2 = formData.gps_arrivee_lat;
    const lng2 = formData.gps_arrivee_lng;
    if (lat1 && lng1 && lat2 && lng2) {
      const estimation = calculerPrixApproximatif(lat1, lng1, lat2, lng2, activeCountry);
      // Ne pré-remplir que si le client n'a pas encore saisi de prix
      if (estimation && !formData.prix_propose) {
        setFormData(prev => ({ ...prev, prix_propose: estimation.prix }));
      }
    }
  }, [formData.gps_depart_lat, formData.gps_depart_lng, formData.gps_arrivee_lat, formData.gps_arrivee_lng, activeCountry]);

  // ─── Sauvegarder le brouillon ──────────────────────────────────────────────
  const formDataStr = JSON.stringify(formData);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, formDataStr);
    } catch (err) {
      console.error("Erreur sauvegarde brouillon:", err);
    }
  }, [formDataStr]);

  // ─── Vérification expéditeur ───────────────────────────────────────────────
  const verifyExpediteur = async () => {
    const phone = formData.expediteur_telephone?.replace(/\D/g, "") || "";
    if (phone.length < 8) { toast.error("Numéro de téléphone invalide"); return; }
    setVerifying(true);
    try {
      const normalized = normalizeForSearch(phone, activeCountry);
      const variants = phoneVariants(phone);
      let clients = await base44.entities.ClientExterne.filter({ telephone: normalized, actif: true });
      if (!clients || clients.length === 0) {
        for (const v of variants) {
          clients = await base44.entities.ClientExterne.filter({ telephone: v, actif: true }).catch(() => []);
          if (clients?.length > 0) break;
        }
      }
      if (clients && clients.length > 0) {
        const client = clients[0];
        setExpediteurFound(client);
        const hasGps = !!(client.latitude && client.longitude);
        setFormData(prev => ({
          ...prev,
          expediteur_nom: prev.expediteur_nom || client.nom || client.prenom || "",
          expediteur_client_id: client.id,
          expediteur_has_app: true,
          expediteur_gps_available: hasGps,
          expediteur_gps_lat: hasGps ? client.latitude : null,
          expediteur_gps_lng: hasGps ? client.longitude : null,
          ...(hasGps ? {
            gps_depart_lat: client.latitude,
            gps_depart_lng: client.longitude,
            recuperationGPS: true,
            adresse_depart: "Position GPS de l'expéditeur",
          } : {}),
        }));
        toast.success(`${client.nom || client.prenom} trouvé dans SILGAPP !`);
        if (hasGps) toast.success("Position GPS de l'expéditeur disponible !");
        try {
          await base44.functions.invoke("notifyClientSync", {
            course_id: "pending", expediteur_id: client.id, notification_type: "preparation_expedition"
          });
        } catch (_) {}
      } else {
        setExpediteurFound(null);
        setFormData(prev => ({
          ...prev,
          expediteur_client_id: null,
          expediteur_has_app: false,
          expediteur_gps_available: false,
          expediteur_gps_lat: null,
          expediteur_gps_lng: null,
        }));
        toast.info("Expéditeur non trouvé dans SILGAPP - flux standard activé");
      }
    } catch (err) {
      toast.error("Erreur lors de la vérification");
      setExpediteurFound(null);
    } finally {
      setVerifying(false);
    }
  };

  // ─── Vérification destinataire ─────────────────────────────────────────────
  const verifyDestinataire = async () => {
    const phone = formData.destinataire_telephone?.replace(/\D/g, "") || "";
    if (phone.length < 8) { toast.error("Numéro de téléphone invalide"); return; }
    setVerifying(true);
    try {
      const normalized = normalizeForSearch(phone, activeCountry);
      const variants = phoneVariants(phone);
      let clients = await base44.entities.ClientExterne.filter({ telephone: normalized, actif: true });
      if (!clients || clients.length === 0) {
        for (const v of variants) {
          clients = await base44.entities.ClientExterne.filter({ telephone: v, actif: true }).catch(() => []);
          if (clients?.length > 0) break;
        }
      }
      if (clients && clients.length > 0) {
        const client = clients[0];
        setDestinataireFound(client);
        const hasGps = !!(client.latitude && client.longitude);
        setFormData(prev => ({
          ...prev,
          destinataire_nom: prev.destinataire_nom || client.nom || client.prenom || "",
          destinataire_client_id: client.id,
          recipient_has_app: true,
          ...(hasGps ? {
            gps_arrivee_lat: client.latitude,
            gps_arrivee_lng: client.longitude,
            livraisonGPS: true,
            adresse_arrivee: "Position GPS du destinataire",
          } : {}),
        }));
        toast.success(`${client.nom || client.prenom} trouvé dans SILGAPP !`);
        if (hasGps) toast.success("Position GPS du destinataire disponible !");
        try {
          await base44.functions.invoke("notifyClientSync", {
            course_id: "pending", destinataire_id: client.id, notification_type: "preparation_reception"
          });
        } catch (_) {}
      } else {
        setDestinataireFound(null);
        setFormData(prev => ({
          ...prev,
          destinataire_client_id: null,
          recipient_has_app: false,
        }));
        toast.info("Destinataire non trouvé dans SILGAPP - flux standard activé");
      }
    } catch (err) {
      toast.error("Erreur lors de la vérification");
      setDestinataireFound(null);
    } finally {
      setVerifying(false);
    }
  };

  // ─── Composant résultat vérification ──────────────────────────────────────
  const VerificationResult = ({ found, nom, latitude, longitude, labelTrouve, labelNonTrouve }) => {
    if (found) {
      return (
        <div
          className="p-4 rounded-2xl border-2"
          style={{ background: COLORS.primaryLight, borderColor: COLORS.primary }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: COLORS.primary }}
            >
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold" style={{ color: COLORS.secondary }}>{labelTrouve}</p>
              <p className="text-sm mt-1" style={{ color: COLORS.textSecondary }}>
                <strong>{nom}</strong> est inscrit dans SILGAPP
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: COLORS.primaryLight, color: COLORS.primary }}>Synchronisation</span>
                <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: COLORS.primaryLight, color: COLORS.primary }}>Notifications</span>
                {latitude && longitude
                  ? <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: COLORS.primaryLight, color: COLORS.primary }}>GPS disponible</span>
                  : <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: COLORS.accentLight, color: COLORS.accent }}>GPS inactif</span>}
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (found === null) {
      return (
        <div
          className="p-4 rounded-2xl border-2"
          style={{ background: COLORS.accentLight, borderColor: COLORS.accent }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: COLORS.accentLight }}
            >
              <AlertCircle className="w-5 h-5" style={{ color: COLORS.accent }} />
            </div>
            <div>
              <p className="font-bold" style={{ color: COLORS.secondary }}>{labelNonTrouve}</p>
              <p className="text-sm mt-1" style={{ color: COLORS.textSecondary }}>Vous pourrez quand même créer la course.</p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // ─── Bouton GPS ────────────────────────────────────────────────────────────
  const GPSButton = ({ onClick, loading, label, sublabel }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-2xl text-white font-bold text-base shadow-md transition-all active:scale-[0.98] overflow-hidden disabled:opacity-75 disabled:cursor-wait"
      style={{ background: COLORS.secondary }}
    >
      <div className="flex flex-col items-center justify-center gap-1 py-5 px-4">
        <div className="flex items-center gap-2 text-lg font-black">
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Navigation className="w-6 h-6" />}
          {loading ? "Détection en cours..." : label}
        </div>
        <p className="text-xs font-normal opacity-80">{loading ? "Détection de votre position en cours..." : sublabel}</p>
      </div>
    </button>
  );

  // ─── Divider ───────────────────────────────────────────────────────────────
  const Divider = () => (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: COLORS.border }} />
      <span className="text-xs font-medium" style={{ color: COLORS.textHint }}>ou saisir manuellement</span>
      <div className="flex-1 h-px" style={{ background: COLORS.border }} />
    </div>
  );

  // ─── Carte GPS récupéré ────────────────────────────────────────────────────
  const GPSAcquiredCard = ({ address, lat, lng, onClear }) => (
    <div
      className="flex items-center gap-4 p-5 rounded-2xl border-2"
      style={{ background: COLORS.primaryLight, borderColor: COLORS.primary }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ background: COLORS.primary }}
      >
        <CheckCircle className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold" style={{ color: COLORS.secondary }}>Position GPS récupérée</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: COLORS.textSecondary }}>{address || "Position GPS"}</p>
        {lat && lng && (
          <p className="text-xs mt-0.5" style={{ color: COLORS.primary }}>
            {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0"
        style={{ background: COLORS.primaryLight, color: COLORS.primary }}
      >
        Changer
      </button>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── RENDU DES ÉTAPES ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  const renderStep = () => {
    switch (step) {
      // ─── ÉTAPE 0 ───────────────────────────────────────────────────────────
      case 0: {
        // Déplacement : adresse de prise en charge
        if (isDeplacement) {
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={MapPin} />
                <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Point de prise en charge</h2>
                <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Où récupérer le passager ?</p>
              </div>
              {formData.recuperationGPS ? (
                <GPSAcquiredCard
                  address={formData.adresse_depart}
                  lat={formData.gps_depart_lat}
                  lng={formData.gps_depart_lng}
                  onClear={() => setFormData({ ...formData, recuperationGPS: false, gps_depart_lat: null, gps_depart_lng: null, adresse_depart: "" })}
                />
              ) : (
                <>
                  <GPSButton onClick={gpsHandlers?.onGetGPSDepart} loading={gpsLoading?.depart} label="Utiliser ma position actuelle" sublabel="Détection automatique de votre position" />
                  <Divider />
                  <SmartAddressInput
                    countryCode={activeCountry}
                    label="Adresse de prise en charge"
                    value={formData.adresse_depart}
                    onChange={(text, location) => updateAddress("depart", text, location)}
                    placeholder="Quartier, rue, boutique, pharmacie..."
                  />
                </>
              )}
            </div>
          );
        }
        // Recevoir : expéditeur
        if (isRecevoir) {
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={User} />
                <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Chez qui récupérer ?</h2>
                <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Identifiez la personne qui détient votre colis</p>
              </div>
              <PremiumInput
                label="Nom de l'expéditeur"
                required={false}
                value={formData.expediteur_nom}
                onChange={(e) => setFormData({ ...formData, expediteur_nom: e.target.value })}
                placeholder="Nom complet de l'expéditeur"
                autoFocus
              />
              <div className="space-y-3">
                <Label className="text-sm font-semibold" style={{ color: COLORS.textLabel }}>
                  Téléphone de l'expéditeur <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="tel"
                  value={formData.expediteur_telephone}
                  onChange={(e) => setFormData({ ...formData, expediteur_telephone: e.target.value })}
                  placeholder={phonePlaceholder}
                  className="h-14 rounded-xl border-2 bg-white px-4 text-base focus:outline-none"
                  style={{ borderColor: COLORS.borderInput }}
                />
                <p className="text-xs pl-1" style={{ color: COLORS.textHint }}>Format : {phonePlaceholder}</p>
                <div className="flex gap-2 flex-wrap">
                  <CarnetAdresses
                    clientId={clientId}
                    type="expediteur"
                    onSelect={(contact) => {
                      setFormData({
                        ...formData,
                        expediteur_nom: contact.nom || formData.expediteur_nom,
                        expediteur_telephone: contact.telephone,
                      });
                    }}
                  />
                  <ContactPickerButton
                    countryCode={activeCountry}
                    onSelect={(contact) => {
                      setFormData({
                        ...formData,
                        expediteur_nom: contact.nom || formData.expediteur_nom,
                        expediteur_telephone: contact.telephone,
                      });
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={verifyExpediteur}
                disabled={!formData.expediteur_telephone || verifying}
                className="w-full h-14 rounded-xl text-white font-bold text-base shadow-md active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: COLORS.secondary }}
              >
                {verifying
                  ? <><Loader2 className="w-5 h-5 animate-spin" />Recherche en cours...</>
                  : <><Search className="w-5 h-5" />Vérifier dans SILGAPP</>}
              </button>
              <VerificationResult
                found={expediteurFound}
                nom={expediteurFound?.nom || expediteurFound?.prenom}
                latitude={expediteurFound?.latitude}
                longitude={expediteurFound?.longitude}
                labelTrouve="Expéditeur trouvé !"
                labelNonTrouve="Expéditeur non trouvé dans SILGAPP"
              />
            </div>
          );
        }
        // Expedier : adresse de récupération
        return (
          <div className="space-y-5">
            <div className="text-center">
              <StepIcon icon={MapPin} />
              <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Où récupérer le colis ?</h2>
              <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Votre adresse de récupération</p>
            </div>
            {formData.recuperationGPS ? (
              <GPSAcquiredCard
                address={formData.adresse_depart}
                lat={formData.gps_depart_lat}
                lng={formData.gps_depart_lng}
                onClear={() => setFormData({ ...formData, recuperationGPS: false, gps_depart_lat: null, gps_depart_lng: null, adresse_depart: "" })}
              />
            ) : (
              <>
                <GPSButton onClick={gpsHandlers?.onGetGPSDepart} loading={gpsLoading?.depart} label="Utiliser ma position actuelle" sublabel="Détection automatique de votre position" />
                <Divider />
                <SmartAddressInput
                  countryCode={activeCountry}
                  label="Adresse de récupération"
                  value={formData.adresse_depart}
                  onChange={(text, location) => updateAddress("depart", text, location)}
                  placeholder="Quartier, rue, boutique, pharmacie..."
                />
              </>
            )}
            {/* Sélecteur nombre de colis — uniquement pour "expedier" */}
            <div className="p-4 rounded-2xl border" style={{ background: COLORS.bgCard, borderColor: COLORS.border }}>
              <NombreColisSelector
                value={formData.nb_colis || 1}
                onChange={(nb) => setFormData({ ...formData, nb_colis: nb })}
              />
            </div>
          </div>
        );
      }

      // ─── ÉTAPE 1 ───────────────────────────────────────────────────────────
      case 1: {
        // Déplacement : adresse de destination
        if (isDeplacement) {
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={MapPin} />
                <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Point de destination</h2>
                <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Où déposer le passager ?</p>
              </div>
              <SmartAddressInput
                countryCode={activeCountry}
                label="Adresse de destination"
                hint="Indiquez le quartier, la rue ou un point de repère connu."
                value={formData.adresse_arrivee}
                onChange={(text, location) => updateAddress("arrivee", text, location)}
                placeholder="Quartier, rue, restaurant, pharmacie..."
                autoFocus
              />
              <GPSButton onClick={gpsHandlers?.onGetGPSArrivee} loading={gpsLoading?.arrivee} label="Utiliser ma position actuelle" sublabel="Définir la destination avec le GPS" />
            </div>
          );
        }
        // Recevoir : adresse de récupération
        if (isRecevoir) {
          const gpsDispo = !!(formData.expediteur_gps_lat && formData.expediteur_gps_lng && formData.expediteur_gps_available);
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={MapPin} />
                <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Adresse de récupération</h2>
                <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Où le livreur doit récupérer le colis</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!gpsDispo) return;
                  const newVal = !(gpsDispo && formData.recuperationGPS);
                  if (newVal) {
                    setFormData({ ...formData, recuperationGPS: true, adresse_depart: "Position GPS de l'expéditeur" });
                  } else {
                    setFormData({ ...formData, recuperationGPS: false, adresse_depart: formData.adresse_depart === "Position GPS de l'expéditeur" ? "" : formData.adresse_depart });
                  }
                }}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${gpsDispo && formData.recuperationGPS ? "" : gpsDispo ? "" : "opacity-60 cursor-not-allowed"}`}
                style={{
                  borderColor: gpsDispo && formData.recuperationGPS ? COLORS.primary : COLORS.border,
                  background: gpsDispo && formData.recuperationGPS ? COLORS.primaryLight : COLORS.bgCard,
                }}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={gpsDispo && formData.recuperationGPS}
                    disabled={!gpsDispo}
                    className="pointer-events-none"
                  />
                  <div className="flex-1">
                    <p className="font-bold" style={{ color: COLORS.secondary }}>Position GPS de l'expéditeur</p>
                    {gpsDispo
                      ? <p className="text-xs mt-0.5" style={{ color: COLORS.primary }}>Position disponible</p>
                      : <p className="text-xs mt-0.5" style={{ color: COLORS.textHint }}>Non disponible (expéditeur sans GPS)</p>}
                  </div>
                </div>
              </button>
              {!(gpsDispo && formData.recuperationGPS) && (
                <SmartAddressInput
                  countryCode={activeCountry}
                  label="Adresse de récupération"
                  value={formData.adresse_depart}
                  onChange={(text, location) => updateAddress("depart", text, location)}
                  placeholder="Quartier, rue, boutique, pharmacie..."
                  autoFocus
                />
              )}
            </div>
          );
        }
        // Expedier : destinataire
        if (isExpedie && (formData.nb_colis || 1) > 1) {
          return (
            <MultiColisFormStep
              colis={colis || []}
              onChange={onColisChange}
              clientId={clientId}
              countryCode={countryCode}
              savedLat={savedLat}
              savedLng={savedLng}
            />
          );
        }
        if (isExpedie) {
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={User} />
                <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>À qui envoyer le colis ?</h2>
                <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Identifiez le destinataire</p>
              </div>
              <PremiumInput
                label="Nom du destinataire"
                required={false}
                value={formData.destinataire_nom}
                onChange={(e) => setFormData({ ...formData, destinataire_nom: e.target.value })}
                placeholder="Nom complet du destinataire"
                autoFocus
              />
              <div className="space-y-3">
                <Label className="!text-sm !font-semibold" style={{ color: COLORS.textLabel }}>
                  Téléphone du destinataire <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="tel"
                  value={formData.destinataire_telephone}
                  onChange={(e) => {
                    setFormData({ ...formData, destinataire_telephone: e.target.value });
                    setDestinataireFound(undefined);
                  }}
                  placeholder={phonePlaceholder}
                  className="h-14 rounded-xl border-2 bg-white px-4 text-base focus:outline-none"
                  style={{ borderColor: COLORS.borderInput }}
                />
                <p className="text-xs pl-1" style={{ color: COLORS.textHint }}>Format : {phonePlaceholder}</p>
                <div className="flex gap-2 flex-wrap">
                  <CarnetAdresses
                    clientId={clientId}
                    type="destinataire"
                    onSelect={(contact) => {
                      setFormData({
                        ...formData,
                        destinataire_nom: contact.nom || formData.destinataire_nom,
                        destinataire_telephone: contact.telephone,
                      });
                      setDestinataireFound(undefined);
                    }}
                  />
                  <ContactPickerButton
                    countryCode={activeCountry}
                    onSelect={(contact) => {
                      setFormData({
                        ...formData,
                        destinataire_nom: contact.nom || formData.destinataire_nom,
                        destinataire_telephone: contact.telephone,
                      });
                      setDestinataireFound(undefined);
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={verifyDestinataire}
                disabled={!formData.destinataire_telephone || verifying}
                className="w-full h-14 rounded-xl text-white font-bold text-base shadow-md active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: COLORS.secondary }}
              >
                {verifying
                  ? <><Loader2 className="w-5 h-5 animate-spin" />Recherche en cours...</>
                  : <><Search className="w-5 h-5" />Vérifier dans SILGAPP</>}
              </button>
              <VerificationResult
                found={destinataireFound}
                nom={destinataireFound?.nom || destinataireFound?.prenom}
                latitude={destinataireFound?.latitude}
                longitude={destinataireFound?.longitude}
                labelTrouve="Destinataire trouvé !"
                labelNonTrouve="Destinataire non trouvé dans SILGAPP"
              />
            </div>
          );
        }
        return null;
      }

      // ─── ÉTAPE 2 ───────────────────────────────────────────────────────────
      case 2: {
        // Déplacement : infos passager
        if (isDeplacement) {
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={User} />
                <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Qui se déplace ?</h2>
                <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Informations du passager</p>
              </div>
              <PremiumInput
                label="Nom du passager"
                required={false}
                value={formData.passager_nom || ""}
                onChange={(e) => setFormData({ ...formData, passager_nom: e.target.value })}
                placeholder="Nom complet du passager"
                autoFocus
              />
              <div className="space-y-3">
                <Label className="text-sm font-semibold" style={{ color: COLORS.textLabel }}>
                  Téléphone du passager <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="tel"
                  value={formData.passager_telephone || ""}
                  onChange={(e) => setFormData({ ...formData, passager_telephone: e.target.value })}
                  placeholder={phonePlaceholder}
                  className="h-14 rounded-xl border-2 bg-white px-4 text-base focus:outline-none"
                  style={{ borderColor: COLORS.borderInput }}
                />
                <p className="text-xs pl-1" style={{ color: COLORS.textHint }}>Format : {phonePlaceholder}</p>
              </div>
              <PremiumInput
                label="Nombre de passagers"
                required={false}
                hint="Nombre de personnes à transporter"
              >
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.nb_passagers || 1}
                  onChange={(e) => setFormData({ ...formData, nb_passagers: parseInt(e.target.value) || 1 })}
                  className="h-14 rounded-xl border-2 bg-white px-4 text-base focus:outline-none"
                  style={{ borderColor: COLORS.borderInput }}
                />
              </PremiumInput>
            </div>
          );
        }
        // Expedier : adresse de livraison
        if (isExpedie) {
          const gpsDestDispo = !!(formData.gps_arrivee_lat && formData.gps_arrivee_lng && formData.livraisonGPS);
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={MapPin} />
                <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Où livrer le colis ?</h2>
                <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Adresse ou quartier d'arrivée</p>
              </div>
              {gpsDestDispo ? (
                <GPSAcquiredCard
                  address={formData.adresse_arrivee}
                  onClear={() => setFormData({ ...formData, livraisonGPS: false, gps_arrivee_lat: null, gps_arrivee_lng: null, adresse_arrivee: "" })}
                />
              ) : (
                <SmartAddressInput
                  countryCode={activeCountry}
                  label="Adresse de livraison"
                  hint="Indiquez le quartier, la rue ou un point de repère connu."
                  value={formData.adresse_arrivee}
                  onChange={(text, location) => updateAddress("arrivee", text, location)}
                  placeholder="Quartier, rue, restaurant, pharmacie..."
                  autoFocus
                />
              )}
            </div>
          );
        }
        // Recevoir : type de colis + prix proposé + notes (regroupés)
        return renderDetailsStep();
      }

      // ─── ÉTAPE 3 ───────────────────────────────────────────────────────────
      case 3: {
        // Déplacement : prix proposé + notes
        if (isDeplacement) return renderDetailsStep();
        // Expedier : type de colis + prix proposé + notes
        if (isExpedie) return renderDetailsStep();
        // Recevoir : récapitulatif
        return renderRecap();
      }

      // ─── ÉTAPE 4 ───────────────────────────────────────────────────────────
      case 4: {
        // Déplacement : récapitulatif
        if (isDeplacement) return renderRecap();
        // Expedier : récapitulatif
        if (isExpedie) return renderRecap();
        return null;
      }

      default:
        return null;
    }
  };

  // ─── Étape Détails (type de colis + prix proposé + notes) ───────────────────
  function renderDetailsStep() {
    const isMulti = formData.type_course === "expedier" && (formData.nb_colis || 1) > 1;
    const lat1 = formData.gps_depart_lat;
    const lng1 = formData.gps_depart_lng;
    const lat2 = formData.gps_arrivee_lat;
    const lng2 = formData.gps_arrivee_lng;
    const estimation = (lat1 && lng1 && lat2 && lng2)
      ? calculerPrixApproximatif(lat1, lng1, lat2, lng2, activeCountry)
      : null;

    const typesColis = [
      { value: "petit_colis", label: "Petit colis", icon: "", desc: "< 2 kg" },
      { value: "moyen_colis", label: "Moyen colis", icon: "", desc: "2 - 10 kg" },
      { value: "gros_colis", label: "Gros colis", icon: "", desc: "> 10 kg" },
      { value: "document", label: "Document", icon: "", desc: "Papiers, courrier" },
      { value: "nourriture", label: "Nourriture", icon: "", desc: "Repas, boissons" },
      { value: "autre", label: "Autre", icon: "", desc: "Autre type" },
    ];

    return (
      <div className="space-y-5">
        <div className="text-center">
          <StepIcon icon={Package} />
          <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Détails</h2>
          <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>
            {isDeplacement ? "Prix et informations" : "Type de colis et prix"}
          </p>
        </div>

        {/* Type de colis — sauf déplacement */}
        {!isDeplacement && !isMulti && (
          <div className="grid grid-cols-2 gap-3">
            {typesColis.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setFormData({ ...formData, type_colis: type.value })}
                className="p-4 rounded-2xl border-2 transition-all duration-200 active:scale-[0.97] text-left"
                style={{
                  borderColor: formData.type_colis === type.value ? COLORS.primary : COLORS.border,
                  background: formData.type_colis === type.value ? COLORS.primaryLight : COLORS.bgCard,
                }}
              >
                <div className="text-3xl mb-2">{type.icon}</div>
                <div className="font-bold text-sm" style={{ color: COLORS.textMain }}>{type.label}</div>
                <div className="text-xs mt-0.5" style={{ color: COLORS.textSecondary }}>{type.desc}</div>
                {formData.type_colis === type.value && (
                  <div className="mt-2 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS.primary }} />
                    <span className="text-xs font-semibold" style={{ color: COLORS.primary }}>Sélectionné</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Prompt recalcul tarif (coords changées après modif manuelle) ── */}
        {recalculerDisponible && (
          <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ background: COLORS.primaryLight, borderColor: COLORS.primary }}>
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.primary }} />
              <p className="text-xs font-semibold" style={{ color: COLORS.primary }}>
                Coordonnées modifiées. Recalculer le tarif conseillé ?
              </p>
            </div>
            <button
              type="button"
              onClick={handleRecalculerTarif}
              className="px-3 py-1.5 rounded-lg text-white text-xs font-bold transition-all"
              style={{ background: COLORS.primary }}
            >
              Recalculer
            </button>
          </div>
        )}

        {/* Prix proposé — sauf multi-colis */}
        {!isMulti && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-semibold" style={{ color: COLORS.textLabel }}>
                Prix proposé <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={formData.prix_propose || ""}
                  onChange={(e) => {
                    prixManuelModifie.current = true;
                    setFormData({ ...formData, prix_propose: parseInt(e.target.value) || 0 });
                  }}
                  className="h-16 rounded-xl border-2 bg-white px-4 text-2xl font-black text-center pr-20 focus:outline-none"
                  style={{ borderColor: COLORS.borderInput }}
                  placeholder="1500"
                  autoFocus
                  min={1}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: COLORS.textSecondary }}>{countryDevise}</span>
              </div>
              {estimation && (
                <div
                  className="flex items-start gap-2 p-3 rounded-xl"
                  style={{ background: COLORS.secondaryLight }}
                >
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: COLORS.secondary }} />
                  <p className="text-xs" style={{ color: COLORS.secondary }}>
                    Estimation GPS indicative : ~{estimation.prix.toLocaleString()} {countryDevise} ({estimation.distance} km).
                    Le prix reste librement choisi par vous.
                  </p>
                </div>
              )}
            </div>

            {countryPrixSuggeres.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.textSecondary }}>Suggestions rapides</p>
                <div className="flex gap-3">
                  {countryPrixSuggeres.map((montant) => (
                    <button
                      key={montant}
                      type="button"
                      onClick={() => setFormData({ ...formData, prix_propose: montant })}
                      className="flex-1 h-14 rounded-xl border-2 font-bold text-base transition-all active:scale-[0.97]"
                      style={{
                        borderColor: formData.prix_propose === montant ? COLORS.primary : COLORS.border,
                        background: formData.prix_propose === montant ? COLORS.primaryLight : COLORS.bgCard,
                        color: formData.prix_propose === montant ? COLORS.primary : COLORS.textMain,
                      }}
                    >
                      {montant.toLocaleString()} {countryDevise}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Notes — repliable */}
        <div>
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            className="w-full flex items-center justify-between p-3 rounded-xl border"
            style={{ background: COLORS.bgCard, borderColor: COLORS.border }}
          >
            <span className="text-sm font-semibold flex items-center gap-2" style={{ color: COLORS.textLabel }}>
              <FileText className="w-4 h-4" />
              Notes (optionnel)
            </span>
            {showNotes ? <ChevronUp className="w-4 h-4" style={{ color: COLORS.textSecondary }} /> : <ChevronDown className="w-4 h-4" style={{ color: COLORS.textSecondary }} />}
          </button>
          {showNotes && (
            <div className="mt-2">
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Point de repère, code porte, étage, sonnette..."
                rows={4}
                className="rounded-xl border-2 bg-white text-base resize-none p-4 focus:outline-none"
                style={{ borderColor: COLORS.borderInput }}
                autoFocus
              />
              <p className="text-xs pl-1 mt-1" style={{ color: COLORS.textHint }}>Facultatif — Aide le livreur à vous trouver facilement</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Étape Récapitulatif premium ───────────────────────────────────────────
  function renderRecap() {
    const isMulti = isExpedie && (formData.nb_colis || 1) > 1;

    // Section récapitulatif avec bouton "Modifier"
    const RecapSection = ({ icon: Icon, title, children, onEdit, editLabel }) => (
      <div
        className="rounded-2xl border p-4"
        style={{ background: COLORS.bgCard, borderColor: COLORS.border }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: COLORS.secondaryLight }}
            >
              <Icon className="w-4 h-4" style={{ color: COLORS.secondary }} />
            </div>
            <h3 className="font-bold text-sm" style={{ color: COLORS.secondary }}>{title}</h3>
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: COLORS.secondaryLight, color: COLORS.secondary }}
            >
              <Pencil className="w-3 h-3" />
              {editLabel || "Modifier"}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {children}
        </div>
      </div>
    );

    const RecapRow = ({ label, value }) => (
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: COLORS.textSecondary }}>{label}</span>
        <span className="text-sm font-bold text-right" style={{ color: COLORS.textMain }}>{value || "—"}</span>
      </div>
    );

    // ─── Mapping des étapes pour le bouton "Modifier" ──────────────────────
    // Expedier: 0=Récup, 1=Destinataire, 2=Livraison, 3=Détails, 4=Récap
    // Recevoir: 0=Expéditeur, 1=Récup, 2=Détails, 3=Récap
    // Déplacement: 0=Prise en charge, 1=Destination, 2=Passager, 3=Détails, 4=Récap
    const editSteps = isExpedie
      ? { trajet: 0, contact: 1, details: 3, prix: 3 }
      : isRecevoir
      ? { trajet: 1, contact: 0, details: 2, prix: 2 }
      : { trajet: 0, contact: 2, details: 3, prix: 3 };

    const handleEditStep = (targetStep) => {
      if (onGoToStep && typeof targetStep === "number") {
        onGoToStep(targetStep);
      }
    };

    // Contact info selon le type
    const contactLabel = isExpedie ? "Destinataire" : isRecevoir ? "Expéditeur" : "Passager";
    const contactNom = isExpedie
      ? formData.destinataire_nom
      : isRecevoir
      ? formData.expediteur_nom
      : formData.passager_nom;
    const contactTel = isExpedie
      ? formData.destinataire_telephone
      : isRecevoir
      ? formData.expediteur_telephone
      : formData.passager_telephone;

    const prixClient = Number(formData.prix_propose) || 0;

    return (
      <div className="space-y-4">
        <div className="text-center">
          <StepIcon icon={CheckCircle} />
          <h2 className="text-2xl font-black" style={{ color: COLORS.secondary }}>Vérifiez votre commande</h2>
          <p className="text-sm mt-1.5" style={{ color: COLORS.textSecondary }}>Récapitulatif de votre course</p>
        </div>

        {/* Section Trajet */}
        <RecapSection icon={Truck} title="Trajet" editLabel="Modifier le trajet" onEdit={() => handleEditStep(editSteps.trajet)}>
          <RecapRow label="Récupération" value={formData.adresse_depart || (formData.recuperationGPS ? "Position GPS" : "—")} />
          <RecapRow label="Livraison" value={formData.adresse_arrivee || "—"} />
        </RecapSection>

        {/* Section Contact */}
        <RecapSection icon={User} title="Contact" editLabel="Modifier le contact" onEdit={() => handleEditStep(editSteps.contact)}>
          <RecapRow label={contactLabel} value={contactNom || "—"} />
          <RecapRow label="Téléphone" value={contactTel || "—"} />
        </RecapSection>

        {/* Section Détails */}
        <RecapSection icon={Package} title="Détails" editLabel="Modifier les détails" onEdit={() => handleEditStep(editSteps.details)}>
          {!isDeplacement && (
            <RecapRow label="Type de colis" value={formData.type_colis?.replace(/_/g, " ") || "—"} />
          )}
          {isExpedie && (
            <RecapRow label="Nombre de colis" value={formData.nb_colis > 1 ? `${formData.nb_colis} colis` : "1 colis"} />
          )}
          {isDeplacement && (
            <RecapRow label="Nombre de passagers" value={formData.nb_passagers || 1} />
          )}
          {formData.notes && (
            <RecapRow label="Notes" value={formData.notes} />
          )}
        </RecapSection>

        {/* Section Prix */}
        {!isMulti && (
          <div
            className="rounded-2xl border-2 p-4"
            style={{ background: COLORS.primaryLight, borderColor: COLORS.primary }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.primary }}>Prix proposé</span>
              <button
                type="button"
                onClick={() => handleEditStep(editSteps.prix)}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{ background: COLORS.bgCard, color: COLORS.primary }}
              >
                <Pencil className="w-3 h-3" />
                Modifier le prix
              </button>
            </div>
            <p className="text-2xl font-black" style={{ color: COLORS.primary }}>
              {prixClient > 0 ? `${prixClient.toLocaleString()} ${countryDevise}` : "Non défini"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: COLORS.primary }}>Montant proposé au livreur</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Logique désactivation bouton Continuer ───────────────────────────────
  const isContinueDisabled = () => {
    const isMulti = isExpedie && (formData.nb_colis || 1) > 1;
    if (step === 0) {
      if (isRecevoir) return !formData.expediteur_telephone;
      return false;
    }
    if (step === 1) {
      if (isDeplacement) return false;
      if (isMulti) return !(colis || []).every(c => !!c.destinataire_telephone);
      if (isExpedie) return !formData.destinataire_telephone;
      return false;
    }
    if (step === 2) {
      if (isDeplacement) return !formData.passager_telephone;
      if (isRecevoir) return !(formData.prix_propose > 0);
      return false;
    }
    if (step === 3) {
      if (isDeplacement) return !(formData.prix_propose > 0);
      if (isExpedie) return !(formData.prix_propose > 0);
      return false;
    }
    return false;
  };

  const isLastStep = step === totalSteps - 1;
  const currentStepTitle = stepTitles[step] || "";

  return (
    <div className="w-full">
      <ProgressBar step={step} totalSteps={totalSteps} stepTitle={currentStepTitle} />
      <div className="mb-6">{renderStep()}</div>
      <NavButtons
        step={step}
        totalSteps={totalSteps}
        onBack={onBack}
        onNext={onNext}
        onAnnuler={onAnnuler}
        onSubmit={onNext}
        isLoading={isLoading}
        isContinueDisabled={isContinueDisabled()}
        isLastStep={isLastStep}
      />
    </div>
  );
}