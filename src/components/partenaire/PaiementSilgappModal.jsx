import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, Wallet, CheckCircle } from "lucide-react";

export default function PaiementSilgappModal({ type, duRestant, onClose, onPaid }) {
  const [montant, setMontant] = useState("");
  const [preuveUrl, setPreuveUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPreuveUrl(file_url);
    } catch (err) {
      setError("Échec de l'upload: " + (err?.message || ""));
    }
    setUploading(false);
  };

  const handleSubmit = async () => {
    const mt = parseInt(montant);
    if (!mt || mt <= 0) { setError("Montant invalide"); return; }
    if (!preuveUrl) { setError("Preuve de dépôt requise"); return; }
    setSaving(true);
    setError("");
    try {
      await base44.functions.invoke("enregistrerPaiementPartenaire", { type, montant: mt, preuve_url: preuveUrl });
      setDone(true);
      setTimeout(() => { onPaid?.(); onClose?.(); }, 1500);
    } catch (err) {
      setError("Erreur: " + (err?.response?.data?.error || err?.message || "échec"));
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-red-500 to-rose-600 text-white px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            <h2 className="font-black text-base">Payer SILGAPP</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
            <p className="font-bold text-gray-900">Paiement envoyé !</p>
            <p className="text-xs text-gray-500">Votre paiement sera vérifié par l'admin SILGAPP. Le montant sera déduit de votre dû une fois confirmé.</p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-red-500 font-medium uppercase">Dû à SILGAPP (restant)</p>
              <p className="text-2xl font-black text-red-600">{(duRestant || 0).toLocaleString('fr-FR')} <span className="text-sm">FCFA</span></p>
            </div>

            <div>
              <Label className="text-xs font-semibold">Montant à payer (FCFA) *</Label>
              <Input type="number" value={montant} onChange={e => setMontant(e.target.value)} placeholder="Ex: 5000" className="mt-1 text-lg font-bold" />
            </div>

            <div>
              <Label className="text-xs font-semibold">Preuve de dépôt (photo) *</Label>
              <p className="text-[10px] text-gray-400 mb-2">Capture d'écran du dépôt Orange Money, reçu, etc.</p>
              {preuveUrl ? (
                <div className="relative">
                  <img src={preuveUrl} alt="Preuve" className="w-full rounded-xl max-h-48 object-cover" />
                  <button onClick={() => setPreuveUrl("")} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
                  <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-red-300 transition-colors">
                    {uploading ? <Loader2 className="w-6 h-6 animate-spin text-gray-400" /> : <Upload className="w-6 h-6 text-gray-400" />}
                    <span className="text-xs text-gray-500 font-medium">{uploading ? "Upload..." : "Télécharger une photo"}</span>
                  </div>
                </label>
              )}
            </div>

            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

            <Button onClick={handleSubmit} disabled={saving || uploading || !montant || !preuveUrl} className="w-full bg-red-500 hover:bg-red-600 h-11">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              Envoyer le paiement
            </Button>
            <p className="text-[10px] text-gray-400 text-center">Le paiement sera vérifié par l'admin avant d'être déduit de votre dû.</p>
          </div>
        )}
      </div>
    </div>
  );
}
