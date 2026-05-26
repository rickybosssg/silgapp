import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check } from "lucide-react";
import PhotoPicker from "./PhotoPicker";

// ─── Helpers téléphone ────────────────────────────────────────────────────────
export function normaliserTelephone(tel) {
  if (!tel) return "";
  const digits = tel.replace(/\D/g, "");
  if (digits.startsWith("226") && digits.length === 11) return "+" + digits;
  if (digits.length === 8) return "+226" + digits;
  if (digits.length > 8) return "+" + digits.slice(-11);
  return "";
}

export function formaterTelephone(tel) {
  if (!tel) return "";
  const digits = tel.replace(/\D/g, "").slice(-8);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

// ─── Vérification profil livreur complet ─────────────────────────────────────
export function profilLivreurComplet(p) {
  if (!p) return false;
  const tel = (p.telephone || "").replace(/\D/g, "");
  return !!(
    p.nom && p.nom.trim() &&
    p.prenom && p.prenom.trim() &&
    tel.length >= 8 &&
    p.quartier && p.quartier.trim() &&
    (p.vehicule || p.type_vehicule)
  );
}

// ─── Clé localStorage GPS livreur ────────────────────────────────────────────
const GPS_KEY = (id) => `livreur_gps_active_${id}`;
const GPS_POS_KEY = (id) => `livreur_gps_pos_${id}`;

// ─── Écran GPS ────────────────────────────────────────────────────────────────
function EcranGPS({ livreurId, onGpsOk }) {
  const [loading, setLoading] = useState(false);

  // Si GPS déjà accordé (session précédente), proposer réutiliser
  useEffect(() => {
    try {
      const deja = localStorage.getItem(GPS_KEY(livreurId)) === "true";
      if (deja) {
        const pos = JSON.parse(localStorage.getItem(GPS_POS_KEY(livreurId)) || "null");
        if (pos) {
          // Rafraîchir silencieusement la position mais ne pas bloquer
          navigator.geolocation?.getCurrentPosition(
            (p) => {
              const gps = { lat: p.coords.latitude, lng: p.coords.longitude };
              try { localStorage.setItem(GPS_POS_KEY(livreurId), JSON.stringify(gps)); } catch (_) {}
              onGpsOk(gps);
            },
            () => onGpsOk(pos), // Utiliser la position sauvegardée
            { enableHighAccuracy: true, timeout: 5000 }
          );
        }
      }
    } catch (_) {}
  }, []);

  const handleActiver = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible sur cet appareil");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try { localStorage.setItem(GPS_KEY(livreurId), "true"); } catch (_) {}
        try { localStorage.setItem(GPS_POS_KEY(livreurId), JSON.stringify(gps)); } catch (_) {}
        setLoading(false);
        onGpsOk(gps);
      },
      () => {
        setLoading(false);
        toast.error("Permission GPS refusée – obligatoire pour utiliser l'application");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-6 z-50">
      <div className="w-full max-w-sm bg-zinc-900 rounded-3xl p-8 space-y-6 text-center border border-zinc-800">
        <div className="w-24 h-24 rounded-full bg-red-600/20 border-2 border-red-600 flex items-center justify-center mx-auto animate-pulse">
          <span className="text-5xl">📍</span>
        </div>
        <div>
          <p className="text-2xl font-black text-white mb-2">GPS Obligatoire</p>
          <p className="text-sm text-gray-400 leading-relaxed">
            Activez votre GPS pour recevoir des courses et être visible sur la carte.
          </p>
        </div>
        <div className="bg-amber-950/50 border border-amber-700 rounded-2xl p-4">
          <p className="text-xs text-amber-400 leading-relaxed">
            ⚠️ Sans GPS, vous ne pourrez pas recevoir de courses.
          </p>
        </div>
        <button
          onClick={handleActiver}
          disabled={loading}
          className="w-full h-14 rounded-2xl bg-red-600 text-white font-black text-base active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-3"
        >
          {loading ? (
            <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Activation...</>
          ) : "📍 Activer le GPS"}
        </button>
        <p className="text-xs text-gray-600">Appuyez sur "Autoriser" lorsque l'appareil vous le demande</p>
      </div>
    </div>
  );
}

// ─── Formulaire profil livreur ────────────────────────────────────────────────
function FormulaireProfilLivreur({ livreurProfil, gpsData, onTermine }) {
  // Pré-remplir avec les données existantes
  const [form, setForm] = useState({
    nom: livreurProfil?.nom || "",
    prenom: livreurProfil?.prenom || "",
    telephone: livreurProfil?.telephone ? livreurProfil.telephone.replace(/\D/g, "").slice(-8) : "",
    quartier: livreurProfil?.quartier || "",
    vehicule: livreurProfil?.vehicule || livreurProfil?.type_vehicule || "moto",
    numero_plaque: livreurProfil?.numero_plaque || "",
  });
  const [photoLivreur, setPhotoLivreur] = useState(livreurProfil?.photo_url || null);
  const [photoMoto, setPhotoMoto] = useState(livreurProfil?.photo_moto_url || null);
  const [cnibRecto, setCnibRecto] = useState(livreurProfil?.photo_cnib_recto_url || null);
  const [cnibVerso, setCnibVerso] = useState(livreurProfil?.photo_cnib_verso_url || null);
  const [saving, setSaving] = useState(false);

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleTelephone = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    setF("telephone", raw);
  };

  const telValide = form.telephone.length === 8;
  const peutSauvegarder = form.nom.trim() && form.prenom.trim() && telValide && form.quartier.trim() && form.vehicule;

  const handleSauvegarder = async () => {
    if (!peutSauvegarder || saving) return;
    setSaving(true);
    const telNormalise = normaliserTelephone(form.telephone);
    const data = {
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      telephone: telNormalise,
      quartier: form.quartier.trim(),
      vehicule: form.vehicule,
      type_vehicule: form.vehicule,
      numero_plaque: form.numero_plaque.trim(),
      latitude: gpsData?.lat || null,
      longitude: gpsData?.lng || null,
      derniere_position_date: gpsData ? new Date().toISOString() : null,
    };
    if (photoLivreur) data.photo_url = photoLivreur;
    if (photoMoto) data.photo_moto_url = photoMoto;
    if (cnibRecto) data.photo_cnib_recto_url = cnibRecto;
    if (cnibVerso) data.photo_cnib_verso_url = cnibVerso;

    try {
      await base44.functions.invoke('updateLivreur', { id: livreurProfil.id, data });
      // Marquer en localStorage que le profil est complet
      try { localStorage.setItem(`livreur_profil_complet_${livreurProfil.id}`, "true"); } catch (_) {}
      toast.success("Profil enregistré !");
      onTermine({ ...livreurProfil, ...data });
    } catch {
      toast.error("Erreur lors de la sauvegarde – réessayez");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-y-auto z-50">
      <div className="max-w-sm mx-auto px-5 py-8 space-y-5">
        <div className="text-center mb-2">
          <div className="w-16 h-16 rounded-2xl bg-red-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">⚡</span>
          </div>
          <h1 className="text-2xl font-black text-white">Complétez votre profil</h1>
          <p className="text-sm text-gray-400 mt-1">Indispensable pour recevoir des courses</p>
        </div>

        {/* Champs texte */}
        {[
          { key: "nom", label: "Nom *", placeholder: "Ex: Ouédraogo" },
          { key: "prenom", label: "Prénom *", placeholder: "Ex: Ibrahim" },
          { key: "quartier", label: "Quartier de résidence *", placeholder: "Ex: Wemtenga" },
          { key: "numero_plaque", label: "N° de plaque (optionnel)", placeholder: "Ex: 12AB3456" },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">{label}</label>
            <input
              value={form[key]}
              onChange={e => setF(key, e.target.value)}
              placeholder={placeholder}
              className="w-full h-12 rounded-xl bg-zinc-900 border border-zinc-700 text-white px-4 text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
        ))}

        {/* Téléphone */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Téléphone * (8 chiffres)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">+226</span>
            <input
              value={formaterTelephone(form.telephone)}
              onChange={handleTelephone}
              placeholder="70 71 45 00"
              inputMode="numeric"
              className="w-full h-12 rounded-xl bg-zinc-900 border border-zinc-700 text-white pl-16 pr-4 text-sm font-mono focus:border-red-500 focus:outline-none tracking-widest"
            />
          </div>
          {form.telephone.length > 0 && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${telValide ? "text-green-400" : "text-red-400"}`}>
              {telValide ? <><Check className="w-3 h-3" /> {normaliserTelephone(form.telephone)}</> : `${form.telephone.length}/8 chiffres`}
            </p>
          )}
        </div>

        {/* Véhicule */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Type de véhicule *</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: "moto", label: "🏍️ Moto" },
              { val: "velo", label: "🚲 Vélo" },
              { val: "voiture", label: "🚗 Voiture" },
              { val: "a_pied", label: "🚶 À pied" },
            ].map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setF("vehicule", val)}
                className={`h-12 rounded-xl border-2 font-semibold text-sm transition-all ${
                  form.vehicule === val ? "border-red-600 bg-red-600/10 text-red-400" : "border-zinc-700 bg-zinc-900 text-gray-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Photos (optionnelles mais recommandées)</label>
          <PhotoPicker label="📸 Photo de vous" value={photoLivreur} onChange={setPhotoLivreur} darkMode />
          <PhotoPicker label="🚗 Photo du moyen de déplacement" value={photoMoto} onChange={setPhotoMoto} darkMode />
          <PhotoPicker label="🪪 CNIB Recto" value={cnibRecto} onChange={setCnibRecto} darkMode />
          <PhotoPicker label="🪪 CNIB Verso" value={cnibVerso} onChange={setCnibVerso} darkMode />
        </div>

        {/* Bouton sauvegarder */}
        <button
          onClick={handleSauvegarder}
          disabled={!peutSauvegarder || saving}
          className="w-full h-14 rounded-2xl bg-red-600 text-white font-black text-base disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-3 mt-4"
        >
          {saving ? (
            <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sauvegarde...</>
          ) : <><Check className="w-5 h-5" /> Valider mon profil</>}
        </button>
        <p className="text-center text-xs text-gray-600 pb-8">
          Ces informations sont visibles par les clients lors de la livraison
        </p>
      </div>
    </div>
  );
}

// ─── Composant principal exporté ──────────────────────────────────────────────
export default function LivreurExterneOnboarding({ livreurProfil, onComplete }) {
  // "loading" → "gps" → "profil" → "done"
  const [etape, setEtape] = useState("loading");
  const [gpsData, setGpsData] = useState(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (!livreurProfil?.id) return;

    const complet = profilLivreurComplet(livreurProfil);
    let gpsDeja = false;
    let posDejaData = null;
    try {
      gpsDeja = localStorage.getItem(GPS_KEY(livreurProfil.id)) === "true";
      posDejaData = JSON.parse(localStorage.getItem(GPS_POS_KEY(livreurProfil.id)) || "null");
    } catch (_) {}

    if (gpsDeja && posDejaData && complet) {
      // Tout ok : pas d'onboarding nécessaire
      setEtape("done");
      setTimeout(() => onCompleteRef.current(posDejaData), 0);
    } else if (!gpsDeja) {
      setEtape("gps");
    } else if (!complet) {
      // GPS ok mais profil incomplet
      setGpsData(posDejaData);
      setEtape("profil");
    } else {
      // GPS ok + profil ok
      setEtape("done");
      setTimeout(() => onCompleteRef.current(posDejaData), 0);
    }
  }, [livreurProfil?.id]);

  if (etape === "loading" || etape === "done") return null;

  if (etape === "gps") {
    return (
      <EcranGPS
        livreurId={livreurProfil?.id}
        onGpsOk={(gps) => {
          setGpsData(gps);
          if (profilLivreurComplet(livreurProfil)) {
            setEtape("done");
            setTimeout(() => onCompleteRef.current(gps), 0);
          } else {
            setEtape("profil");
          }
        }}
      />
    );
  }

  return (
    <FormulaireProfilLivreur
      livreurProfil={livreurProfil}
      gpsData={gpsData}
      onTermine={(updatedProfil) => {
        setEtape("done");
        setTimeout(() => onCompleteRef.current(gpsData, updatedProfil), 0);
      }}
    />
  );
}