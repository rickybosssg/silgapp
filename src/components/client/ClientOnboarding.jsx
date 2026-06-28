import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { requestNativeAppPermissions } from "@/lib/nativePermissions";
import { toast } from "sonner";
import { User, Check, Loader2 } from "lucide-react";
import CountryCodeSelect from "@/components/ui/CountryCodeSelect";
import { SILGAPP_COUNTRIES } from "@/lib/phoneUtils";

// ─── Pays disponibles ─────────────────────────────────────────────────────────
export const PAYS_LISTE = SILGAPP_COUNTRIES.map((country) => ({
  code: country.code,
  nom: country.name,
  emoji: country.flag,
  indicatif: `+${country.dial}`,
  digits: country.len,
}));

// ─── Helpers téléphone ────────────────────────────────────────────────────────
export function normaliserTelephone(raw, countryCode = "BF") {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const pays = PAYS_LISTE.find(p => p.code === countryCode) || PAYS_LISTE[0];
  const indicatifDigits = pays.indicatif.replace("+", "");
  if (digits.startsWith(indicatifDigits)) return "+" + digits;
  return pays.indicatif + digits;
}

function formaterAffichage(raw, maxDigits = 8) {
  const digits = (raw || "").replace(/\D/g, "").slice(0, maxDigits);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

// ─── Vérification profil complet ──────────────────────────────────────────────
export function profilClientComplet(p) {
  if (!p) return false;
  const tel = (p.telephone || "").replace(/\D/g, "");
  return !!(
    p.nom && p.nom.trim() &&
    p.prenom && p.prenom.trim() &&
    tel.length >= 8 &&
    p.country_code &&
    p.ville && p.ville.trim() &&
    p.quartier && p.quartier.trim()
  );
}

// ─── Reverse geocoding ────────────────────────────────────────────────────────
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`);
    const geo = await res.json();
    return geo?.address?.suburb || geo?.address?.neighbourhood || geo?.address?.quarter || geo?.address?.city_district || geo?.address?.village || "";
  } catch (_) { return ""; }
}

async function requestPostGpsPermissions(clientProfil) {
  const user = await base44.auth.me().catch(() => null);
  const email = user?.email || clientProfil?.user_email || clientProfil?.email || "";
  return requestNativeAppPermissions({
    email,
    userType: "client",
    clientId: clientProfil?.id || "",
    requestContacts: true,
  });
}

// GPS is requested with native permissions after profile detection; it must not block onboarding.
// ─── Profil ────────────────────────────────────────────────────────────────────
function EtapeProfil({ clientProfil, onSuccess }) {
  const [nom, setNom] = useState(clientProfil?.nom || "");
  const [prenom, setPrenom] = useState(clientProfil?.prenom || "");
  const [countryCode, setCountryCode] = useState(clientProfil?.country_code || "");
  const [ville, setVille] = useState(clientProfil?.ville || "");
  const [quartier, setQuartier] = useState(clientProfil?.quartier || "");
  const [telAffiche, setTelAffiche] = useState(
    clientProfil?.telephone ? formaterAffichage(clientProfil.telephone) : ""
  );
  const [codePromo, setCodePromo] = useState("");
  const [codePromoStatut, setCodePromoStatut] = useState(null); // null | "valide" | "invalide"
  const [codePromoData, setCodePromoData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Vérifier le code promo en temps réel
  const verifierCodePromo = async (code) => {
    if (!code || code.length < 3) { setCodePromoStatut(null); setCodePromoData(null); return; }
    try {
      const results = await base44.entities.CodePromo.filter({ code: code.toUpperCase() });
      const found = results?.find(c => c.actif);
      if (found) {
        setCodePromoStatut("valide");
        setCodePromoData(found);
      } else {
        setCodePromoStatut("invalide");
        setCodePromoData(null);
      }
    } catch {
      setCodePromoStatut(null);
    }
  };

  const paysSelectionne = PAYS_LISTE.find(p => p.code === countryCode);

  const handleTelChange = (e) => {
    const maxDigits = paysSelectionne?.digits || 8;
    const raw = e.target.value.replace(/\D/g, "").slice(0, maxDigits);
    setTelAffiche(formaterAffichage(raw, maxDigits));
  };

  const telDigits = telAffiche.replace(/\D/g, "");
  const telValide = paysSelectionne ? telDigits.length === paysSelectionne.digits : false;
  const peutSauvegarder = nom.trim() && prenom.trim() && telValide && countryCode && ville.trim() && quartier.trim();

  const handleSave = async () => {
    if (!peutSauvegarder) return;
    const telNormalise = normaliserTelephone(telDigits, countryCode);
    setLoading(true);
    try {
      let gpsData = null;
      try { gpsData = JSON.parse(localStorage.getItem("client_gps_position") || "null"); } catch (_) {}

      // Vérifier cohérence pays / indicatif téléphonique
      if (telDigits.length > 0 && paysSelectionne) {
        const indicatifDigits = paysSelectionne.indicatif.replace("+", "");
        if (telDigits.startsWith(indicatifDigits) && !telDigits.replace(indicatifDigits, "").length) {
          toast.error(`L'indicatif ${paysSelectionne.indicatif} ne correspond pas au pays sélectionné`);
          setLoading(false);
          return;
        }
      }

      let updated;
      const profileData = {
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: telNormalise,
        country_code: countryCode,
        ville: ville.trim(),
        quartier: quartier.trim(),
        actif: true,
        ...(gpsData ? { latitude: gpsData.latitude, longitude: gpsData.longitude } : {}),
        ...(codePromoStatut === "valide" && codePromoData ? {
          code_promo_utilise: codePromoData.code,
          code_promo_id: codePromoData.id,
        } : {}),
      };

      if (clientProfil?.id) {
        updated = await base44.entities.ClientExterne.update(clientProfil.id, profileData);
      } else {
        const user = await base44.auth.me();
        let existing = null;
        try {
          const found = await base44.entities.ClientExterne.filter({ telephone: telNormalise });
          if (found?.length > 0) existing = found[0];
        } catch (_) {}
        if (existing) {
          updated = await base44.entities.ClientExterne.update(existing.id, {
            ...profileData,
            user_email: user?.email || "",
          });
        } else {
          updated = await base44.entities.ClientExterne.create({
            ...profileData,
            user_email: user?.email || "",
          });
        }
      }

      // Incrémenter le compteur inscrits du code promo
      if (codePromoStatut === "valide" && codePromoData) {
        base44.entities.CodePromo.update(codePromoData.id, {
          nb_inscrits: (codePromoData.nb_inscrits || 0) + 1,
        }).catch(() => {});
      }

      try { localStorage.setItem("client_profil_complet", "true"); } catch (_) {}
      toast.success(codePromoStatut === "valide" ? "Profil complété ! Code promo appliqué " : "Profil complété !");

      base44.functions.invoke('initClientAuto', {
        device_id: navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50),
        platform: "web",
        notification_token: null,
        latitude: gpsData?.latitude,
        longitude: gpsData?.longitude,
        country_code: countryCode,
      }).catch(() => null);

      onSuccess(updated || { ...(clientProfil || {}), ...profileData });
    } catch {
      toast.error("Erreur lors de la sauvegarde – réessayez");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary/10 to-red-50 flex items-center justify-center p-6 z-50 overflow-y-auto">
      <div className="max-w-sm w-full bg-white rounded-3xl shadow-2xl p-7 space-y-5 my-4">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-primary" />
          </div>
          <p className="text-xl font-black text-gray-900">Complétez vos informations</p>
          <p className="text-xs text-gray-600">Ces informations permettent de synchroniser vos courses.</p>
        </div>

        <div className="space-y-3">
          {/* Pays */}
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block"> Pays *</label>
            <CountryCodeSelect
              value={countryCode}
              onChange={(code) => { setCountryCode(code); setTelAffiche(""); }}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">Nom *</label>
            <input
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Votre nom de famille"
              className="w-full h-12 rounded-xl border-2 border-gray-300 px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">Prénom *</label>
            <input
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              placeholder="Votre prénom"
              className="w-full h-12 rounded-xl border-2 border-gray-300 px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">Ville *</label>
            <input
              value={ville}
              onChange={e => setVille(e.target.value)}
              placeholder="Votre ville"
              className="w-full h-12 rounded-xl border-2 border-gray-300 px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">Quartier / Adresse *</label>
            <input
              value={quartier}
              onChange={e => setQuartier(e.target.value)}
              placeholder="Votre quartier ou adresse"
              className="w-full h-12 rounded-xl border-2 border-gray-300 px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">
              Téléphone * {paysSelectionne ? `(${paysSelectionne.digits} chiffres)` : "(sélectionnez un pays)"}
            </label>
            <div className="flex gap-2">
              <div className="h-12 rounded-xl border-2 border-gray-300 bg-gray-100 px-3 flex items-center text-sm font-bold text-gray-800 flex-shrink-0">
                {paysSelectionne ? `${paysSelectionne.emoji} ${paysSelectionne.indicatif}` : ""}
              </div>
              <input
                inputMode="numeric"
                value={telAffiche}
                onChange={handleTelChange}
                placeholder={paysSelectionne ? "0".repeat(paysSelectionne.digits).replace(/(.{2})/g, "$1 ").trim() : "—"}
                disabled={!countryCode}
                className="flex-1 h-12 rounded-xl border-2 border-gray-300 px-4 text-sm text-gray-900 tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            {telAffiche.length > 0 && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${telValide ? "text-green-600" : "text-red-400"}`}>
                {telValide
                  ? <><Check className="w-3 h-3" /> {normaliserTelephone(telDigits, countryCode)}</>
                  : `${telDigits.length}/${paysSelectionne?.digits || "?"} chiffres`
                }
              </p>
            )}
          </div>

          {/* Champ code promo */}
          {!clientProfil?.code_promo_utilise && (
            <div>
              <label className="text-xs font-bold text-gray-800 mb-1 block"> Code promo (optionnel)</label>
              <input
                value={codePromo}
                onChange={e => {
                  const val = e.target.value.toUpperCase();
                  setCodePromo(val);
                  verifierCodePromo(val);
                }}
                placeholder="ex: AISSA100"
                className={`w-full h-12 rounded-xl border px-4 text-sm font-mono font-bold tracking-widest focus:outline-none focus:ring-2 transition-all ${
                  codePromoStatut === "valide" ? "border-green-400 bg-green-50 text-green-700 focus:ring-green-200" :
                  codePromoStatut === "invalide" ? "border-red-300 bg-red-50 focus:ring-red-200" :
                  "border-gray-200 focus:ring-primary/30 focus:border-primary"
                }`}
              />
              {codePromoStatut === "valide" && codePromoData && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Code valide ! Bénéficiez de <strong>10% de réduction</strong> (100 FCFA) sur votre première course.
                </p>
              )}
              {codePromoStatut === "invalide" && (
                <p className="text-xs text-red-500 mt-1"> Code promo invalide ou désactivé</p>
              )}
              {!codePromoStatut && (
                <p className="text-xs text-gray-600 mt-1">Bénéficiez de 10% de réduction sur votre première course !</p>
              )}
            </div>
          )}
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
    if (!clientProfil) {
      setStep("profil");
      return;
    }
    let gpsOk = false;
    try { gpsOk = localStorage.getItem("client_gps_active") === "true"; } catch (_) {}
    const complet = profilClientComplet(clientProfil);

    if (!gpsOk) {
      requestPostGpsPermissions(clientProfil).catch(() => null);
      navigator.geolocation?.getCurrentPosition(
        async (pos) => {
          const posData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          try { localStorage.setItem("client_gps_active", "true"); } catch (_) {}
          try { localStorage.setItem("client_gps_position", JSON.stringify(posData)); } catch (_) {}
          try {
            const quartier = await reverseGeocode(posData.latitude, posData.longitude);
            if (clientProfil?.id) {
              await base44.entities.ClientExterne.update(clientProfil.id, {
                latitude: posData.latitude,
                longitude: posData.longitude,
                ...(quartier ? { quartier } : {}),
              });
            }
          } catch (_) {}
        },
        () => toast.info("GPS non activé. Vous pourrez l'activer plus tard dans les paramètres."),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }

    if (!complet) {
      setStep("profil");
    } else {
      let savedPos = null;
      try { savedPos = JSON.parse(localStorage.getItem("client_gps_position") || "null"); } catch (_) {}
      setStep("done");
      setTimeout(() => onCompleteRef.current({ gps: savedPos, profil: clientProfil }), 0);
    }
  }, [clientProfil?.id]); // Dépend uniquement de l'ID pour éviter re-runs inutiles

  if (step === null || step === "done") return null;

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
