import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { requestNativeAppPermissions } from "@/lib/nativePermissions";
import { toast } from "sonner";
import { User, Check, Loader2, Phone, Gift, ShieldCheck, Sparkles } from "lucide-react";
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

  const inputClass = "w-full h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 placeholder-slate-400 shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  const labelClass = "text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,#dbeafe_0,#eef6ff_34%,#f8fafc_72%)] flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="max-w-md w-full my-4 overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-blue-950/15 border border-white/80">
        <div className="relative bg-gradient-to-br from-slate-950 via-blue-900 to-sky-700 px-6 py-7 text-white">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute -left-12 bottom-0 h-28 w-28 rounded-full bg-sky-300/20" />
          <div className="relative grid grid-cols-[64px_1fr] gap-4 [&>p]:col-start-2 [&>p]:m-0 [&>p:first-of-type]:text-2xl [&>p:first-of-type]:font-black [&>p:first-of-type]:leading-tight [&>p:first-of-type]:text-white [&>p:last-of-type]:text-sm [&>p:last-of-type]:leading-relaxed [&>p:last-of-type]:text-blue-100">
          <div className="w-16 h-16 rounded-3xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg shadow-blue-950/20">
            <User className="w-8 h-8 text-white" />
          </div>
          <p className="text-2xl font-black leading-tight text-white">Complétez vos informations</p>
          <p className="text-sm leading-relaxed text-blue-100">Ces informations permettent de synchroniser vos courses.</p>
        </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white text-blue-700 flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Une seule fiche a remplir</p>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Selectionnez votre pays, ajoutez vos coordonnees et accedez directement au tableau de bord.
                </p>
              </div>
            </div>
          </div>
          {/* Pays */}
          <div>
            <label className={labelClass}>Pays d'utilisation *</label>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-1">
              <CountryCodeSelect
                value={countryCode}
                onChange={(code) => { setCountryCode(code); setTelAffiche(""); }}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Nom *</label>
            <input
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Votre nom de famille"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">Prénom *</label>
            <input
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              placeholder="Votre prénom"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">Ville *</label>
            <input
              value={ville}
              onChange={e => setVille(e.target.value)}
              placeholder="Votre ville"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">Quartier / Adresse *</label>
            <input
              value={quartier}
              onChange={e => setQuartier(e.target.value)}
              placeholder="Votre quartier ou adresse"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-800 mb-1 block">
              Téléphone * {paysSelectionne ? `(${paysSelectionne.digits} chiffres)` : "(sélectionnez un pays)"}
            </label>
            <div className="flex gap-2">
              <div className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 flex items-center gap-2 text-sm font-black text-slate-800 flex-shrink-0 shadow-sm">
                <Phone className="w-4 h-4 text-blue-600" />
                {paysSelectionne ? `${paysSelectionne.emoji} ${paysSelectionne.indicatif}` : ""}
              </div>
              <input
                inputMode="numeric"
                value={telAffiche}
                onChange={handleTelChange}
                placeholder={paysSelectionne ? "0".repeat(paysSelectionne.digits).replace(/(.{2})/g, "$1 ").trim() : "—"}
                disabled={!countryCode}
                className={`${inputClass} flex-1 tracking-widest font-mono disabled:bg-slate-50 disabled:text-slate-400`}
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
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <label className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 mb-2 flex items-center gap-2">
                <Gift className="w-4 h-4 text-blue-600" />
                Code promo optionnel
              </label>
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
                  "border-slate-200 bg-white text-slate-900 focus:ring-blue-100 focus:border-blue-500"
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
          className="w-[calc(100%-2.5rem)] sm:w-[calc(100%-3rem)] mx-5 sm:mx-6 mb-6 h-14 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white font-black text-base shadow-lg shadow-blue-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
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
