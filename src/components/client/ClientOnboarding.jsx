import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { MapPin, User, Check, Loader2 } from "lucide-react";

// ─── Helpers téléphone ────────────────────────────────────────────────────────
export function normaliserTelephone(raw) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("226") && digits.length === 11) return "+" + digits;
  if (digits.length === 8) return "+226" + digits;
  if (digits.length > 8) return "+" + digits.slice(-11);
  return "";
}

function formaterAffichage(raw) {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

// ─── Vérification profil complet ──────────────────────────────────────────────
export function profilClientComplet(p) {
  if (!p) return false;
  const tel = (p.telephone || "").replace(/\D/g, "");
  return !!(p.nom && p.nom.trim() && p.prenom && p.prenom.trim() && tel.length >= 8);
}

// ─── GPS ──────────────────────────────────────────────────────────────────────
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
        try { localStorage.setItem("client_gps_active", "true"); } catch (_) {}
        try { localStorage.setItem("client_gps_position", JSON.stringify(posData)); } catch (_) {}
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
        <p className="text-xs text-gray-400">Appuyez sur "Autoriser" lorsque votre appareil vous demande</p>
      </div>
    </div>
  );
}

// ─── Profil ────────────────────────────────────────────────────────────────────
function EtapeProfil({ clientProfil, onSuccess }) {
  const [nom, setNom] = useState(clientProfil?.nom || "");
  const [prenom, setPrenom] = useState(clientProfil?.prenom || "");
  const [telAffiche, setTelAffiche] = useState(
    clientProfil?.telephone ? formaterAffichage(clientProfil.telephone) : ""
  );
  const [loading, setLoading] = useState(false);

  const handleTelChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    setTelAffiche(formaterAffichage(raw));
  };

  const telDigits = telAffiche.replace(/\D/g, "");
  const telValide = telDigits.length === 8;
  const peutSauvegarder = nom.trim() && prenom.trim() && telValide;

  const handleSave = async () => {
    if (!peutSauvegarder) return;
    const telNormalise = normaliserTelephone(telDigits);
    setLoading(true);
    try {
      // Utiliser update ou create selon que le profil existe
      let updated;
      if (clientProfil?.id) {
        updated = await base44.entities.ClientExterne.update(clientProfil.id, {
          nom: nom.trim(),
          prenom: prenom.trim(),
          telephone: telNormalise,
        });
      } else {
        const user = await base44.auth.me();
        updated = await base44.entities.ClientExterne.create({
          nom: nom.trim(),
          prenom: prenom.trim(),
          telephone: telNormalise,
          user_email: user?.email || "",
          actif: true,
        });
      }
      // Marquer en localStorage aussi
      try { localStorage.setItem("client_profil_complet", "true"); } catch (_) {}
      toast.success("Profil complété !");
      onSuccess(updated || { ...(clientProfil || {}), nom: nom.trim(), prenom: prenom.trim(), telephone: telNormalise });
    } catch {
      toast.error("Erreur lors de la sauvegarde – réessayez");
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
          <p className="text-xs text-gray-500">Ces informations permettent de synchroniser vos courses.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Nom *</label>
            <input
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Votre nom de famille"
              className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Prénom *</label>
            <input
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              placeholder="Votre prénom"
              className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Téléphone * (8 chiffres)</label>
            <div className="flex gap-2">
              <div className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-600 flex-shrink-0">
                +226
              </div>
              <input
                inputMode="numeric"
                value={telAffiche}
                onChange={handleTelChange}
                placeholder="70 71 45 00"
                className="flex-1 h-12 rounded-xl border border-gray-200 px-4 text-sm tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            {telAffiche.length > 0 && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${telValide ? "text-green-600" : "text-red-400"}`}>
                {telValide ? <><Check className="w-3 h-3" /> {normaliserTelephone(telDigits)}</> : `${telDigits.length}/8 chiffres`}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading || !peutSauvegarder}
          className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          {loading ? "Sauvegarde..." : "Valider et continuer"}
        </button>
      </div>
    </div>
  );
}

// ─── Orchestrateur principal ──────────────────────────────────────────────────
export default function ClientOnboarding({ clientProfil, onComplete }) {
  // "gps" | "profil" | "done" | null (calcul en cours)
  const [step, setStep] = useState(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!clientProfil) return; // Attendre que le profil soit chargé
    let gpsOk = false;
    try { gpsOk = localStorage.getItem("client_gps_active") === "true"; } catch (_) {}
    const complet = profilClientComplet(clientProfil);

    if (!gpsOk) {
      setStep("gps");
    } else if (!complet) {
      setStep("profil");
    } else {
      // Profil complet + GPS déjà ok → terminer directement
      let savedPos = null;
      try { savedPos = JSON.parse(localStorage.getItem("client_gps_position") || "null"); } catch (_) {}
      setStep("done");
      // setTimeout 0 pour éviter l'appel pendant le rendu
      setTimeout(() => onCompleteRef.current({ gps: savedPos, profil: clientProfil }), 0);
    }
  }, [clientProfil?.id]); // Dépend uniquement de l'ID pour éviter re-runs inutiles

  if (step === null || step === "done") return null;

  if (step === "gps") {
    return (
      <EtapeGPS
        onSuccess={(posData) => {
          if (profilClientComplet(clientProfil)) {
            setStep("done");
            setTimeout(() => onCompleteRef.current({ gps: posData, profil: clientProfil }), 0);
          } else {
            setStep("profil");
          }
        }}
      />
    );
  }

  if (step === "profil") {
    return (
      <EtapeProfil
        clientProfil={clientProfil}
        onSuccess={(updatedProfil) => {
          let gpsPos = null;
          try { gpsPos = JSON.parse(localStorage.getItem("client_gps_position") || "null"); } catch (_) {}
          setStep("done");
          setTimeout(() => onCompleteRef.current({ gps: gpsPos, profil: updatedProfil }), 0);
        }}
      />
    );
  }

  return null;
}