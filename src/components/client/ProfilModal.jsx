import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { User, Save, X, Check, Trash2 } from "lucide-react";

// Normalise +226XXXXXXXX
function normaliserTel(raw) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("226") && digits.length === 11) return "+" + digits;
  if (digits.length === 8) return "+226" + digits;
  if (digits.length > 8) return "+" + digits.slice(-11);
  return "";
}

// Formater XX XX XX XX pour affichage
function formaterAffichage(raw) {
  const digits = (raw || "").replace(/\D/g, "").slice(-8);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

export default function ProfilModal({ clientProfil, onClose, onSave }) {
  const [nom, setNom] = useState(clientProfil?.nom || "");
  const [prenom, setPrenom] = useState(clientProfil?.prenom || "");
  const initTel = clientProfil?.telephone ? formaterAffichage(clientProfil.telephone) : "";
  const [telAffiche, setTelAffiche] = useState(initTel);
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleTelChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    setTelAffiche(formaterAffichage(raw));
  };

  const handleSave = async () => {
    const telDigits = telAffiche.replace(/\D/g, "");
    if (!nom.trim()) { toast.error("Veuillez entrer votre nom"); return; }
    if (!prenom.trim()) { toast.error("Veuillez entrer votre prénom"); return; }
    if (telDigits.length !== 8) { toast.error("Téléphone invalide (8 chiffres requis)"); return; }

    const telNormalise = normaliserTel(telDigits);
    if (!telNormalise) { toast.error("Numéro de téléphone invalide"); return; }

    setLoading(true);
    try {
      const updated = await base44.entities.ClientExterne.update(clientProfil.id, {
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: telNormalise,
      });
      toast.success("Profil mis à jour ✓");
      // Passer l'objet mis à jour au parent
      onSave?.(updated || { ...clientProfil, nom: nom.trim(), prenom: prenom.trim(), telephone: telNormalise });
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  const telValide = telAffiche.replace(/\D/g, "").length === 8;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Mes informations</h2>
              <p className="text-xs text-gray-400">Modifier vos coordonnées</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Champs */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1 block">Nom *</label>
            <input
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Votre nom de famille"
              className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1 block">Prénom *</label>
            <input
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              placeholder="Votre prénom"
              className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1 block">Téléphone * (8 chiffres)</label>
            <div className="flex gap-2">
              <div className="h-12 rounded-xl border border-gray-200 bg-gray-50 px-3 flex items-center text-sm font-semibold text-gray-500 flex-shrink-0">
                +226
              </div>
              <input
                value={telAffiche}
                onChange={handleTelChange}
                placeholder="70 71 45 00"
                inputMode="numeric"
                className="flex-1 h-12 rounded-xl border border-gray-200 px-4 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            {telAffiche.length > 0 && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${telValide ? "text-green-600" : "text-red-400"}`}>
                {telValide ? <><Check className="w-3 h-3" /> {normaliserTel(telAffiche.replace(/\D/g, ""))}</> : `${telAffiche.replace(/\D/g, "").length}/8 chiffres`}
              </p>
            )}
          </div>
        </div>

        {/* Boutons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !nom.trim() || !prenom.trim() || !telValide}
            className="flex-1 h-12 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sauvegarde...</>
            ) : (
              <><Save className="w-4 h-4" /> Enregistrer</>
            )}
          </button>
        </div>

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
            <p className="text-xs text-red-500 text-center">Cette action est irréversible. Votre compte client sera désactivé.</p>
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
                    await base44.entities.ClientExterne.update(clientProfil.id, { actif: false });
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
    </div>
  );
}