import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { MapPin, User, Phone, Check, Loader2 } from "lucide-react";

// Normalise un numéro de téléphone au format +226XXXXXXXX
export function normaliserTelephone(raw) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("226") && digits.length === 11) return "+" + digits;
  if (digits.startsWith("0226") && digits.length === 12) return "+" + digits.slice(1);
  if (digits.length === 8) return "+226" + digits;
  return "+" + digits;
}

// Formater visuellement : XX XX XX XX
function formaterAffichage(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

// ─── Étape 1 : GPS ────────────────────────────────────────────────────────────
function EtapeGPS({ onSuccess }) {
  const [loading, setLoading] = useState(false);

  const handleGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible sur cet appareil");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        localStorage.setItem("client_gps_active", "true");
        localStorage.setItem("client_gps_position", JSON.stringify(posData));
        setLoading(false);
        onSuccess(posData);
      },
      () => {
        setLoading(false);
        toast.error("Permission GPS refusée – obligatoire pour continuer");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary/10 to-red-50 flex items-center justify-center p-6 z-50">
      <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-7 space-y-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <MapPin className="w-10 h-10 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-black text-gray-900 mb-2">Activer votre GPS</p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Le GPS est obligatoire pour créer une course et être localisé par le livreur.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-xs text-amber-700 font-semibold">
            ⚠️ Sans GPS, vous ne pourrez pas commander une livraison.
          </p>
        </div>
        <button
          onClick={handleGPS}
          disabled={loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
          {loading ? "Activation..." : "Activer le GPS"}
        </button>
        <p className="text-xs text-gray-400">
          Appuyez sur "Autoriser" lorsque votre appareil vous demande la permission
        </p>
      </div>
    </div>
  );
}

// ─── Étape 2 : Profil ─────────────────────────────────────────────────────────
function EtapeProfil({ clientProfil, onSuccess }) {
  const [nom, setNom] = useState(clientProfil?.nom || "");
  const [prenom, setPrenom] = useState(clientProfil?.prenom || "");
  const [telAffiche, setTelAffiche] = useState(
    clientProfil?.telephone ? formaterAffichage(clientProfil.telephone.replace(/^\+226/, "")) : ""
  );
  const [loading, setLoading] = useState(false);

  const handleTelChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    setTelAffiche(formaterAffichage(raw));
  };

  const handleSave = async () => {
    const telDigits = telAffiche.replace(/\D/g, "");
    if (!nom.trim()) { toast.error("Veuillez entrer votre nom"); return; }
    if (!prenom.trim()) { toast.error("Veuillez entrer votre prénom"); return; }
    if (telDigits.length !== 8) { toast.error("Numéro de téléphone invalide (8 chiffres requis)"); return; }

    const telNormalise = normaliserTelephone(telDigits);
    setLoading(true);
    try {
      const updated = await base44.entities.ClientExterne.update(clientProfil.id, {
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: telNormalise,
      });
      toast.success("Profil complété !");
      onSuccess(updated);
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary/10 to-red-50 flex items-center justify-center p-6 z-50">
      <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-7 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-primary" />
          </div>
          <p className="text-xl font-black text-gray-900">Complétez vos informations</p>
          <p className="text-xs text-gray-500">
            Ces informations permettent de synchroniser vos courses automatiquement.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Nom *</label>
            <input
              type="text"
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Votre nom de famille"
              className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Prénom *</label>
            <input
              type="text"
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              placeholder="Votre prénom"
              className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Numéro de téléphone *</label>
            <div className="flex items-center gap-2">
              <div className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-600 flex-shrink-0">
                +226
              </div>
              <input
                type="tel"
                value={telAffiche}
                onChange={handleTelChange}
                placeholder="70 71 45 00"
                className="flex-1 h-12 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary tracking-widest"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Format : 70 71 45 00 (8 chiffres)</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          {loading ? "Sauvegarde..." : "Valider et continuer"}
        </button>
      </div>
    </div>
  );
}

// ─── Orchestrateur onboarding ─────────────────────────────────────────────────
export default function ClientOnboarding({ clientProfil, onComplete }) {
  const [step, setStep] = useState(null); // null = calcul en cours

  // Calculer l'étape initiale
  React.useEffect(() => {
    const gpsOk = localStorage.getItem("client_gps_active") === "true";
    const profilComplet = !!(clientProfil?.nom && clientProfil?.prenom && clientProfil?.telephone &&
      clientProfil.telephone.replace(/\D/g, "").length >= 8);

    if (!gpsOk) {
      setStep("gps");
    } else if (!profilComplet) {
      setStep("profil");
    } else {
      setStep("done");
      onComplete({ gps: JSON.parse(localStorage.getItem("client_gps_position") || "null"), profil: clientProfil });
    }
  }, []);

  if (step === null) return null;
  if (step === "done") return null;

  if (step === "gps") {
    return (
      <EtapeGPS onSuccess={(posData) => {
        const profilComplet = !!(clientProfil?.nom && clientProfil?.prenom && clientProfil?.telephone &&
          clientProfil.telephone.replace(/\D/g, "").length >= 8);
        if (profilComplet) {
          setStep("done");
          onComplete({ gps: posData, profil: clientProfil });
        } else {
          setStep("profil");
        }
      }} />
    );
  }

  if (step === "profil") {
    return (
      <EtapeProfil
        clientProfil={clientProfil}
        onSuccess={(updatedProfil) => {
          setStep("done");
          const gpsPos = JSON.parse(localStorage.getItem("client_gps_position") || "null");
          onComplete({ gps: gpsPos, profil: updatedProfil });
        }}
      />
    );
  }

  return null;
}