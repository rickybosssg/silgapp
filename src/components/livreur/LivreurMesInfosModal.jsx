import React, { useState } from "react";
import { toast } from "sonner";
import { Check, Trash2 } from "lucide-react";
import { normaliserTelephone, formaterTelephone } from "./LivreurExterneOnboarding";
import PhotoPicker from "./PhotoPicker";
import LivreurPhotoUploader from "./LivreurPhotoUploader";
import { base44 } from "@/api/base44Client";

export default function LivreurMesInfosModal({ livreurProfil, onSave }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      photo_url: photoLivreur || null,
    };
    if (photoMoto) data.photo_moto_url = photoMoto;
    if (cnibRecto) data.photo_cnib_recto_url = cnibRecto;
    if (cnibVerso) data.photo_cnib_verso_url = cnibVerso;

    try {
      await base44.functions.invoke('updateLivreur', { id: livreurProfil.id, data });
      onSave?.({ photo_url: photoLivreur || null });
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
        <LivreurPhotoUploader
          photoUrl={photoLivreur}
          nomComplet={`${livreurProfil?.prenom || ""} ${livreurProfil?.nom || ""}`.trim()}
          livreurId={livreurProfil?.id}
          onPhotoChange={setPhotoLivreur}
          canEdit={true}
          size="md"
        />
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
        <label className="block text-xs font-semibold text-gray-500">Autres photos</label>
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

      {/* Supprimer le compte */}
      {!showDeleteConfirm ? (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full h-10 rounded-xl border border-red-200 text-red-500 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Supprimer mon compte
        </button>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-red-700 text-center">⚠️ Confirmer la suppression ?</p>
          <p className="text-xs text-red-500 text-center">Cette action est irréversible. Votre profil livreur sera désactivé.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 h-10 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold"
            >
              Annuler
            </button>
            <button
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await base44.functions.invoke('updateLivreur', { id: livreurProfil.id, data: { actif: false, validation: "refuse" } });
                  toast.success("Compte désactivé. Contactez le support pour toute question.");
                  base44.auth.logout();
                } catch {
                  toast.error("Erreur lors de la suppression");
                  setDeleting(false);
                }
              }}
              className="flex-1 h-10 rounded-xl bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
            >
              {deleting ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> En cours...</> : "Oui, supprimer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}