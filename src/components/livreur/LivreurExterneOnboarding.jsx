import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Camera, Upload, Check } from "lucide-react";

// ─── Téléphone helpers ────────────────────────────────────────────────────────
export function normaliserTelephone(tel) {
  if (!tel) return "";
  let t = tel.replace(/[\s\-().]/g, "");
  if (t.startsWith("+226")) return t;
  if (t.startsWith("226") && t.length >= 11) return "+" + t;
  if (t.length === 8) return "+226" + t;
  return t;
}

export function formaterTelephone(tel) {
  if (!tel) return "";
  let digits = tel.replace(/\D/g, "").slice(-8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + " " + digits.slice(2);
  if (digits.length <= 6) return digits.slice(0, 2) + " " + digits.slice(2, 4) + " " + digits.slice(4);
  return digits.slice(0, 2) + " " + digits.slice(2, 4) + " " + digits.slice(4, 6) + " " + digits.slice(6, 8);
}

// ─── Upload photo helper ──────────────────────────────────────────────────────
async function uploadPhoto(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}

// ─── Écran GPS ─────────────────────────────────────────────────────────────────
function EcranGPS({ onGpsOk }) {
  const [loading, setLoading] = useState(false);

  const handleActiver = () => {
    if (!navigator.geolocation) {
      toast.error("GPS non disponible sur cet appareil");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(false);
        onGpsOk({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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
            Activez votre GPS pour recevoir des courses et être visible sur la carte SILGAPP Externe.
          </p>
        </div>
        <div className="bg-amber-950/50 border border-amber-700 rounded-2xl p-4">
          <p className="text-xs text-amber-400 leading-relaxed">
            ⚠️ Sans GPS, vous ne pourrez pas recevoir de courses ni être localisé par les clients.
          </p>
        </div>
        <button
          onClick={handleActiver}
          disabled={loading}
          className="w-full h-14 rounded-2xl bg-red-600 text-white font-black text-base active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-3"
        >
          {loading ? (
            <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Activation...</>
          ) : (
            "📍 Activer le GPS"
          )}
        </button>
        <p className="text-xs text-gray-600">
          Appuyez sur "Autoriser" lorsque l'appareil vous le demande
        </p>
      </div>
    </div>
  );
}

// ─── Formulaire profil ─────────────────────────────────────────────────────────
function FormulaireProfilLivreur({ livreurId, gpsData, onTermine }) {
  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    telephone: "",
    quartier: "",
    vehicule: "moto",
    numero_plaque: "",
  });
  const [photoLivreur, setPhotoLivreur] = useState(null);
  const [photoMoto, setPhotoMoto] = useState(null);
  const [cnibRecto, setCnibRecto] = useState(null);
  const [cnibVerso, setCnibVerso] = useState(null);
  const [uploading, setUploading] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleTelephone = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    set("telephone", raw);
  };

  const handlePhoto = async (field, setFn, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(u => ({ ...u, [field]: true }));
    try {
      const url = await uploadPhoto(file);
      setFn(url);
    } catch {
      toast.error("Erreur upload photo");
    } finally {
      setUploading(u => ({ ...u, [field]: false }));
    }
  };

  const peutSauvegarder = form.nom && form.prenom && form.telephone.length === 8 && form.quartier && form.vehicule;

  const handleSauvegarder = async () => {
    if (!peutSauvegarder) return;
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
      await base44.functions.invoke('updateLivreur', { id: livreurId, data });
      toast.success("Profil enregistré !");
      onTermine();
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-y-auto z-50">
      <div className="max-w-sm mx-auto px-5 py-8 space-y-5">

        {/* Logo + titre */}
        <div className="text-center mb-2">
          <div className="w-16 h-16 rounded-2xl bg-red-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">⚡</span>
          </div>
          <h1 className="text-2xl font-black text-white">Complétez votre profil</h1>
          <p className="text-sm text-gray-400 mt-1">Ces informations sont indispensables pour recevoir des courses</p>
        </div>

        {/* Champ texte helper */}
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
              onChange={e => set(key, e.target.value)}
              placeholder={placeholder}
              className="w-full h-12 rounded-xl bg-zinc-900 border border-zinc-700 text-white px-4 text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
        ))}

        {/* Téléphone avec formatage automatique */}
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
          {form.telephone.length > 0 && form.telephone.length < 8 && (
            <p className="text-xs text-red-400 mt-1">8 chiffres requis ({form.telephone.length}/8)</p>
          )}
          {form.telephone.length === 8 && (
            <p className="text-xs text-green-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> {normaliserTelephone(form.telephone)}</p>
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
                onClick={() => set("vehicule", val)}
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

          {[
            { key: "photo", label: "📸 Photo de vous (face)", state: photoLivreur, setFn: setPhotoLivreur },
            { key: "moto", label: "🏍️ Photo du véhicule", state: photoMoto, setFn: setPhotoMoto },
            { key: "cnib_recto", label: "🪪 CNIB Recto", state: cnibRecto, setFn: setCnibRecto },
            { key: "cnib_verso", label: "🪪 CNIB Verso", state: cnibVerso, setFn: setCnibVerso },
          ].map(({ key, label, state, setFn }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                {state ? (
                  <div className="flex items-center gap-2">
                    <img src={state} alt="" className="w-14 h-14 rounded-xl object-cover border border-zinc-700" />
                    <label className="text-xs text-red-400 cursor-pointer underline">
                      Changer
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handlePhoto(key, setFn, e)} />
                    </label>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className="flex-1 h-11 rounded-xl bg-zinc-900 border border-dashed border-zinc-600 flex items-center justify-center gap-2 text-xs text-gray-400 cursor-pointer active:bg-zinc-800">
                      <Camera className="w-4 h-4" />
                      {uploading[key] ? "Upload..." : "Appareil photo"}
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handlePhoto(key, setFn, e)} disabled={uploading[key]} />
                    </label>
                    <label className="flex-1 h-11 rounded-xl bg-zinc-900 border border-dashed border-zinc-600 flex items-center justify-center gap-2 text-xs text-gray-400 cursor-pointer active:bg-zinc-800">
                      <Upload className="w-4 h-4" />
                      {uploading[key] ? "Upload..." : "Galerie"}
                      <input type="file" accept="image/*" className="hidden" onChange={e => handlePhoto(key, setFn, e)} disabled={uploading[key]} />
                    </label>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bouton sauvegarder */}
        <button
          onClick={handleSauvegarder}
          disabled={!peutSauvegarder || saving}
          className="w-full h-14 rounded-2xl bg-red-600 text-white font-black text-base disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-3 mt-4"
        >
          {saving ? (
            <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sauvegarde...</>
          ) : (
            <><Check className="w-5 h-5" /> Valider mon profil</>
          )}
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
  const [etape, setEtape] = useState("gps"); // "gps" | "profil"
  const [gpsData, setGpsData] = useState(null);

  // Vérifier si le profil est déjà complet
  const profilComplet = !!(
    livreurProfil?.nom &&
    livreurProfil?.prenom &&
    livreurProfil?.telephone &&
    livreurProfil?.quartier &&
    livreurProfil?.vehicule
  );

  if (profilComplet) {
    // Juste besoin du GPS
    if (etape === "gps") {
      return (
        <EcranGPS
          onGpsOk={(gps) => {
            setGpsData(gps);
            onComplete(gps);
          }}
        />
      );
    }
    return null;
  }

  if (etape === "gps") {
    return (
      <EcranGPS
        onGpsOk={(gps) => {
          setGpsData(gps);
          setEtape("profil");
        }}
      />
    );
  }

  return (
    <FormulaireProfilLivreur
      livreurId={livreurProfil.id}
      gpsData={gpsData}
      onTermine={() => onComplete(gpsData)}
    />
  );
}