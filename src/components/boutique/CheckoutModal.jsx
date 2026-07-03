import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, X, CheckCircle, MapPin, CreditCard, Package } from "lucide-react";

const STEPS = [
  { icon: Package, label: "Récap" },
  { icon: MapPin, label: "Livraison" },
  { icon: CreditCard, label: "Paiement" },
];

export default function CheckoutModal({ type, etablissementId, etablissementNom, cart, total, clientProfil, onClose, onSuccess }) {
  const [adresse, setAdresse] = useState(clientProfil?.quartier ? clientProfil.quartier + ", " + (clientProfil.ville || "") : "");
  const [quartier, setQuartier] = useState(clientProfil?.quartier || "");
  const [note, setNote] = useState("");
  const [preuveUrl, setPreuveUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const currentStep = !preuveUrl ? (!adresse ? 0 : 1) : 2;

  const handlePreuveUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPreuveUrl(file_url);
    } catch (err) {}
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!adresse || !preuveUrl) return;
    setSubmitting(true);
    try {
      const items = cart.map(item => ({ id: item.id, nom: item.nom, prix: item.prix, quantite: item.quantite, photo_url: item.photo_url || "" }));
      await base44.functions.invoke("creerCommandePartenaire", {
        type,
        boutique_id: type === "boutique" ? etablissementId : undefined,
        restaurant_id: type === "restaurant" ? etablissementId : undefined,
        items,
        total,
        adresse_livraison: adresse,
        quartier_livraison: quartier,
        gps_lat: clientProfil?.latitude || null,
        gps_lng: clientProfil?.longitude || null,
        note_client: note,
        preuve_paiement_url: preuveUrl,
      });
      setDone(true);
      setTimeout(() => onSuccess?.(), 2000);
    } catch (err) {
      alert("Erreur: " + (err?.message || "échec"));
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto"><CheckCircle className="w-8 h-8 text-green-600" /></div>
          <h2 className="text-lg font-black text-gray-900">Commande envoyée !</h2>
          <p className="text-sm text-gray-500">Votre commande a été transmise à {etablissementNom}. Vous recevrez des notifications à chaque étape.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 rounded-t-3xl">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-gray-900">Confirmer la commande</h2>
            <button onClick={onClose} className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
          </div>
          {/* Indicateur de progression */}
          <div className="flex items-center gap-1">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === currentStep;
              const isDone = i < currentStep;
              return (
                <React.Fragment key={i}>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all ${isActive ? "bg-primary text-white" : isDone ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    <Icon className="w-3 h-3" />
                    <span className="text-[10px] font-bold">{step.label}</span>
                    {isDone && <CheckCircle className="w-3 h-3" />}
                  </div>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 rounded-full ${isDone ? "bg-green-400" : "bg-gray-200"}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{item.nom} × {item.quantite}</span>
                <span className="font-semibold">{((item.prix || 0) * (item.quantite || 1)).toLocaleString()} F</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t font-bold">
              <span>Total</span>
              <span className="text-primary">{(total || 0).toLocaleString()} FCFA</span>
            </div>
          </div>
          <div><Label className="text-xs">Adresse de livraison *</Label><Input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Adresse complète" className="mt-1" /></div>
          <div><Label className="text-xs">Quartier</Label><Input value={quartier} onChange={e => setQuartier(e.target.value)} placeholder="Quartier" className="mt-1" /></div>
          <div><Label className="text-xs">Note (optionnel)</Label><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Instructions pour le livreur..." rows={2} className="mt-1" /></div>
          <div>
            <Label className="text-xs">Preuve de paiement *</Label>
            <p className="text-[10px] text-gray-400 mb-2">Effectuez le paiement de <strong>{(total || 0).toLocaleString()} FCFA</strong> via Orange Money, puis téléchargez la capture.</p>
            {preuveUrl ? (
              <div className="relative">
                <img src={preuveUrl} alt="Preuve" className="w-full rounded-xl" />
                <button onClick={() => setPreuveUrl("")} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"><X className="w-4 h-4 text-red-500" /></button>
              </div>
            ) : (
              <label className="cursor-pointer block">
                <input type="file" accept="image/*" onChange={handlePreuveUpload} className="hidden" disabled={uploading} />
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary/30">
                  {uploading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /> : <Upload className="w-6 h-6 mx-auto text-gray-400" />}
                  <p className="text-xs text-gray-500 mt-2">Télécharger la preuve de paiement</p>
                </div>
              </label>
            )}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3"><p className="text-xs text-amber-700">⚠️ La commande n'est effective qu'après validation du paiement par le partenaire.</p></div>
          <Button onClick={handleSubmit} disabled={submitting || !adresse || !preuveUrl} className="w-full h-12 bg-primary hover:bg-primary/90 text-base font-bold">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmer la commande"}
          </Button>
        </div>
      </div>
    </div>
  );
}