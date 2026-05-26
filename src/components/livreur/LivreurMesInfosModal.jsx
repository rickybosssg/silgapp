import React, { useState } from "react";
import { toast } from "sonner";
import { Check, User } from "lucide-react";
import { normaliserTelephone, formaterTelephone } from "./LivreurExterneOnboarding";
import PhotoPicker from "./PhotoPicker";
import { base44 } from "@/api/base44Client";

export default function LivreurMesInfosModal({ livreurProfil, onSave }) {
  const [form, setForm] = useState({
    nom: livreurProfil?.nom || "",
    prenom: livreurProfil?.prenom || "",
    telephone: livreurProfil?.telephone ? (livreurProfil.telephone.replace(/\D/g, "").slice(-8)) : "",
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
  const peutSauvegarder = form.nom.trim() && form.prenom.trim() && telValide && form.quartier.trim();

  const handleSave = async () => {
    if (!peutSauvegarder || saving) return;
    setSaving(true);
    const data = {
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      telephone: normaliserTelephone(form.telephone),
      quartier: form.quartier.trim(),
      vehicule: form.vehicule,
      type_vehicule: form.vehicule,
      numero_plaque: form.numero_plaque.trim(),
    };
    if (photoLivreur) data.photo_url = photoLivreur;
    if (photoMoto) data.photo_moto_url = photoMoto;
    if (cnibRecto) data.photo_cnib_recto_url = cnibRecto;
    if (cnibVerso) data.photo_cnib_verso_url = cnibVerso;

    try {
      await base44.functions.invoke('updateLivreur', { id: livreurProfil.id, data });
      onSave?.({ ...livreurProfil, ...data });
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      {/* Entête */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          {photoLivreur ? (
            <img src={photoLivreur} alt="profil" className="w-12 h-12 rounded-2xl object-cover" />
          ) : (
            <User className="w-6 h-6 text-primary" />
          )}
        </div>
        <div>
          <p className="font-bold text-gray-900">{livreurProfil?.prenom || ""} {livreurProfil?.nom || ""}</p>
          <p className="text-xs text-gray-500">Livreur SILGAPP Externe</p>
        </div>
      </div>

      {/* Champs */}
      {[
        { key: "nom", label: "Nom *", placeholder: "Ex: Ouédraogo" },
        { key: "prenom", label: "Prénom *", placeholder: "Ex: Ibrahim" },
        { key: "quartier", label: "Quartier *", placeholder: "Ex: Wemtenga" },
        { key: "numero_plaque", label: "N° de plaque", placeholder: "Ex: 12AB3456" },
      ].map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
          <input
            value={form[key]}
            onChange={e => setF(key, e.target.value)}
            placeholder={placeholder}
            className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      ))}

      {/* Téléphone */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">Téléphone * (8 chiffres)</label>
        <div className="flex gap-2">
          <div className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-500 flex-shrink-0">+226</div>
          <input
            value={formaterTelephone(form.telephone)}
            onChange={handleTelephone}
            placeholder="70 71 45 00"
            inputMode="numeric"
            className="flex-1 h-12 rounded-xl border border-gray-200 px-4 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        {form.telephone.length > 0 && (
          <p className={`text-xs mt-1 flex items-center gap-1 ${telValide ? "text-green-600" : "text-red-400"}`}>
            {telValide ? <><Check className="w-3 h-3" />{normaliserTelephone(form.telephone)}</> : `${form.telephone.length}/8 chiffres`}
          </p>
        )}
      </div>

      {/* Véhicule */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">Type de véhicule</label>
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
              className={`h-11 rounded-xl border-2 font-semibold text-sm transition-all ${
                form.vehicule === val ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Photos */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-500">Photos</label>
        <PhotoPicker label="📸 Photo de profil" value={photoLivreur} onChange={setPhotoLivreur} />
        <PhotoPicker label="🚗 Photo du moyen de déplacement" value={photoMoto} onChange={setPhotoMoto} />
        <PhotoPicker label="🪪 CNIB Recto" value={cnibRecto} onChange={setCnibRecto} />
        <PhotoPicker label="🪪 CNIB Verso" value={cnibVerso} onChange={setCnibVerso} />
      </div>

      <button
        onClick={handleSave}
        disabled={!peutSauvegarder || saving}
        className="w-full h-12 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {saving ? (
          <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sauvegarde...</>
        ) : <><Check className="w-4 h-4" /> Enregistrer les modifications</>}
      </button>
    </div>
  );
}