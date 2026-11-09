import React, { useState, useRef, useEffect } from "react";
import { readPartnerOrderResult } from "@/lib/partnerOrderResult";
import { PARTNER_ORDER_V2_ENABLED, submitPartnerOrderV2 } from "@/lib/partnerOrderV2";
import { COMMERCE_PRIVATE_PROOFS_ENABLED, uploadCommercePaymentProof, verifyCommerceProofClient } from "@/lib/commerceProofUpload";
import { createCommerceCreationIntent } from "@/lib/commerceCreationIntent";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, X, CheckCircle, Navigation, MapPin } from "lucide-react";

export default function CheckoutModal({ type, etablissementId, etablissementNom, cart, total, clientProfil, onClose, onSuccess }) {
  const [adresse, setAdresse] = useState(clientProfil?.quartier ? clientProfil.quartier + ", " + (clientProfil.ville || "") : "");
  const [gpsPosition, setGpsPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [note, setNote] = useState("");
  const [preuveUrl, setPreuveUrl] = useState("");
  const [proofId, setProofId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const proofReceipt = useRef(null);
  const uploadPending = useRef(false);
  const proofLifecycle = useRef({ generation: 0, preview: "", active: true, scope: "" });
  const checkoutScope = JSON.stringify([type, etablissementId, clientProfil?.id, clientProfil?.user_email, clientProfil?.country_code]);
  proofLifecycle.current.scope = checkoutScope;
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const pendingRef = useRef(false);
  const orderIntents = useRef(null);
  const [submitError, setSubmitError] = useState("");
  const [needsReview, setNeedsReview] = useState(false);

  const clearProof = () => {
    proofLifecycle.current.generation++;
    if (proofLifecycle.current.preview) URL.revokeObjectURL(proofLifecycle.current.preview);
    proofLifecycle.current.preview = "";
    proofReceipt.current = null;
    setProofId("");
    setPreuveUrl("");
  };
  useEffect(() => {
    clearProof();
    setUploadError("");
  }, [checkoutScope]);
  useEffect(() => {
    proofLifecycle.current.active = true;
    return () => {
      proofLifecycle.current.active = false;
      proofLifecycle.current.generation++;
      if (proofLifecycle.current.preview) URL.revokeObjectURL(proofLifecycle.current.preview);
      proofLifecycle.current.preview = "";
      proofReceipt.current = null;
    };
  }, []);

  useEffect(() => {
    if (!COMMERCE_PRIVATE_PROOFS_ENABLED || !PARTNER_ORDER_V2_ENABLED) return;
    let cancelled = false;
    // Read only: reopening must expose the original uncertain intention without
    // uploading another image or silently minting another order request ID.
    const restore = async () => {
      try {
        const context = await verifyCommerceProofClient(base44, clientProfil);
        if (cancelled || !proofLifecycle.current.active || proofLifecycle.current.scope !== checkoutScope) return;
        if (!orderIntents.current) orderIntents.current = createCommerceCreationIntent({ storage: globalThis.localStorage });
        const saved = orderIntents.current.read({ actorId: context.userId, operation: 'create_order', type, parentId: etablissementId, countryCode: context.profile.country_code });
        if (saved && ['pending', 'uncertain'].includes(saved.status)) {
          setNeedsReview(true);
          setSubmitError("Une commande enregistree reste a verifier. Reprenez la meme commande sans renvoyer de preuve.");
        }
      } catch (error) {
        if (!cancelled && proofLifecycle.current.active && proofLifecycle.current.scope === checkoutScope) {
          setNeedsReview(true);
          setSubmitError(error?.message || "Le brouillon de commande ne peut pas etre verifie.");
        }
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [checkoutScope]);

  const handlePreuveUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || uploadPending.current || pendingRef.current || done || needsReview) return;
    uploadPending.current = true;
    clearProof();
    const generation = proofLifecycle.current.generation;
    const isCurrent = () => proofLifecycle.current.active && proofLifecycle.current.generation === generation && proofLifecycle.current.scope === checkoutScope;
    setUploadError("");
    setUploading(true);
    try {
      if (COMMERCE_PRIVATE_PROOFS_ENABLED) {
        if (!PARTNER_ORDER_V2_ENABLED) throw new Error("Le depot prive exige le nouveau circuit de commande.");
        const receipt = await uploadCommercePaymentProof({ sdk: base44, file, type, parentId: etablissementId, profile: clientProfil, isCurrent });
        if (!isCurrent()) return;
        const preview = URL.createObjectURL(file);
        proofLifecycle.current.preview = preview;
        proofReceipt.current = receipt;
        setProofId(receipt.proofId);
        setPreuveUrl(preview);
      } else {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (isCurrent()) setPreuveUrl(file_url);
      }
    } catch (err) {
      if (isCurrent()) setUploadError(err?.message || "Envoi de la preuve non confirme. Aucun nouvel envoi automatique.");
    } finally {
      uploadPending.current = false;
      if (proofLifecycle.current.active) setUploading(false);
      e.target.value = "";
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("GPS non disponible. Saisissez l'adresse manuellement.");
      return;
    }
    setLocating(true);
    setLocationMessage("Detection de votre position en cours...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsPosition(coords);
        if (!adresse) setAdresse("Position GPS actuelle");
        setLocationMessage("Position detectee avec succes.");
        setLocating(false);
      },
      () => {
        setGpsPosition(null);
        setLocationMessage("Impossible de détecter votre position. Vérifiez le GPS ou saisissez l'adresse manuellement.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  };

  const handleSubmit = async (reconcile = false) => {
    const recover = reconcile === true && PARTNER_ORDER_V2_ENABLED;
    if (pendingRef.current || done || (needsReview && !recover) || uploading || uploadPending.current || (!recover && (!adresse || !(COMMERCE_PRIVATE_PROOFS_ENABLED ? proofId : preuveUrl)))) return;
    const generation = proofLifecycle.current.generation;
    const isCurrent = () => proofLifecycle.current.active && proofLifecycle.current.scope === checkoutScope && proofLifecycle.current.generation === generation;
    pendingRef.current = true;
    setSubmitError("");
    setSubmitting(true);
    try {
      const items = cart.map(item => ({ id: item.id, nom: item.nom, prix: item.prix, quantite: item.quantite, photo_url: item.photo_url || "" }));
      const payload = {
        type,
        boutique_id: type === "boutique" ? etablissementId : undefined,
        restaurant_id: type === "restaurant" ? etablissementId : undefined,
        items,
        total,
        adresse_livraison: adresse,
        quartier_livraison: "",
        gps_lat: gpsPosition?.lat ?? null,
        gps_lng: gpsPosition?.lng ?? null,
        note_client: note,
        ...(COMMERCE_PRIVATE_PROOFS_ENABLED ? { proof_id: proofId } : { preuve_paiement_url: preuveUrl }),
      };
      if (PARTNER_ORDER_V2_ENABLED) {
        const me = COMMERCE_PRIVATE_PROOFS_ENABLED
          ? await verifyCommerceProofClient(base44, clientProfil, recover ? undefined : proofReceipt.current?.actorId).then(context => ({ id: context.userId, email: context.userEmail }))
          : await base44.auth.me();
        if (COMMERCE_PRIVATE_PROOFS_ENABLED && !recover && (!proofReceipt.current || proofReceipt.current.proofId !== proofId || proofReceipt.current.profileId !== clientProfil.id || proofReceipt.current.countryCode !== clientProfil.country_code)) throw new Error("Ajoutez une preuve privee pour cette commande.");
        if (!me?.id || me.email !== clientProfil?.user_email || !clientProfil?.id || !clientProfil?.country_code) throw new Error("Session client a verifier avant de commander.");
        if (!orderIntents.current) orderIntents.current = createCommerceCreationIntent({ storage: globalThis.localStorage });
        const scope = { actorId: me.id, operation: 'create_order', type, parentId: etablissementId, countryCode: clientProfil.country_code };
        const saved = orderIntents.current.read(scope);
        if (recover) {
          if (!saved) throw new Error("Aucune commande enregistree a reprendre.");
          if (COMMERCE_PRIVATE_PROOFS_ENABLED && (!saved.data.proof_id || Object.hasOwn(saved.data, "preuve_paiement_url"))) throw new Error("Cette ancienne commande ne peut pas etre reprise dans le circuit prive. Verifiez son etat dans vos commandes avant toute nouvelle creation.");
          if (!window.confirm("Reprendre exactement la commande enregistree de " + saved.data.total + " FCFA ? Aucun nouvel identifiant ne sera cree.")) throw new Error("Reprise annulee.");
        } else if (saved?.status === 'completed') {
          if (!window.confirm("Une commande precedente est deja confirmee. Confirmer une nouvelle commande distincte ?")) throw new Error("Nouvelle commande annulee.");
          await orderIntents.current.startNew(scope);
        }
        if (!isCurrent()) return;
        const result = await submitPartnerOrderV2({
          invoke: (name, data) => base44.functions.invoke(name, data), intents: orderIntents.current,
          scope, payload: JSON.parse(JSON.stringify(payload)), reconcile: recover,
          expected: { type, etablissementId, clientId: clientProfil.id, total },
        });
        if (isCurrent() && result.localReceiptPending) setSubmitError("Commande confirmee. Son brouillon local reste a verifier dans vos commandes.");
      } else {
        if (COMMERCE_PRIVATE_PROOFS_ENABLED) throw new Error("Le depot prive exige le nouveau circuit de commande.");
        if (!isCurrent()) return;
        const response = await base44.functions.invoke("creerCommandePartenaire", payload);
        readPartnerOrderResult(response, { type, etablissementId, clientId: clientProfil?.id, total });
      }
      if (!isCurrent()) return;
      setDone(true);
      setTimeout(() => { if (isCurrent()) onSuccess?.(); }, 2000);
    } catch (err) {
      if (!isCurrent()) return;
      setNeedsReview(true);
      setSubmitError(err?.response?.data?.error || err?.message || "Commande non confirmée.");
    } finally {
      pendingRef.current = false;
      if (proofLifecycle.current.active) setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto"><CheckCircle className="w-8 h-8 text-green-600" /></div>
          <h2 className="text-lg font-black text-gray-900">Commande envoyée !</h2>
          {submitError && <p role="status" className="text-xs text-amber-700">{submitError}</p>}
          <p className="text-sm text-gray-500">Votre commande a été transmise à {etablissementNom}. Vous recevrez des notifications à chaque étape.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="font-bold text-gray-900">Confirmer la commande</h2>
          <button onClick={() => { proofLifecycle.current.active = false; clearProof(); onClose?.(); }} className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
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
          <div className="space-y-2">
            <Label className="text-xs">Adresse de livraison *</Label>
            <Input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Adresse complete" className="mt-1" />
            <Button type="button" variant="outline" onClick={useCurrentLocation} disabled={locating} className="w-full h-10 rounded-xl text-xs font-bold">
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              Utiliser ma position actuelle
            </Button>
            {locationMessage && (
              <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 p-2">
                <MapPin className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs font-semibold text-blue-700">
                  {locationMessage}
                  {gpsPosition ? ` (${gpsPosition.lat.toFixed(5)}, ${gpsPosition.lng.toFixed(5)})` : ""}
                </p>
              </div>
            )}
          </div>
          <div><Label className="text-xs">Note (optionnel)</Label><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Instructions pour le livreur..." rows={2} className="mt-1" /></div>
          <div>
            <Label className="text-xs">Preuve de paiement *</Label>
            <p className="text-[10px] text-gray-400 mb-2">Effectuez le paiement de <strong>{(total || 0).toLocaleString()} FCFA</strong> via Orange Money, puis téléchargez la capture.</p>
            {preuveUrl ? (
              <div className="relative">
                <img src={preuveUrl} alt="Preuve" className="w-full rounded-xl" />
                <button onClick={clearProof} disabled={submitting || uploading || needsReview} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"><X className="w-4 h-4 text-red-500" /></button>
              </div>
            ) : (
              <label className="cursor-pointer block">
                <input type="file" accept={COMMERCE_PRIVATE_PROOFS_ENABLED ? "image/png,image/jpeg,image/webp" : "image/*"} onChange={handlePreuveUpload} className="hidden" disabled={uploading || submitting || needsReview} />
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary/30">
                  {uploading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /> : <Upload className="w-6 h-6 mx-auto text-gray-400" />}
                  <p className="text-xs text-gray-500 mt-2">Télécharger la preuve de paiement</p>
                </div>
              </label>
            )}
          </div>
          {uploadError && <p role="alert" className="text-sm text-red-700">{uploadError}</p>}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3"><p className="text-xs text-amber-700"> La commande n'est effective qu'après validation du paiement par le partenaire.</p></div>
          {submitError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><p>{submitError}</p><p className="mt-1">Consultez vos commandes avant de réessayer. Si les prix ont changé, actualisez le catalogue puis vérifiez le montant avant une nouvelle confirmation.</p></div>}
          {PARTNER_ORDER_V2_ENABLED && needsReview && <Button variant="outline" disabled={submitting || uploading} onClick={() => handleSubmit(true)} className="w-full">Reprendre la meme commande enregistree</Button>}
          <Button onClick={() => handleSubmit(false)} disabled={submitting || done || needsReview || uploading || !adresse || !(COMMERCE_PRIVATE_PROOFS_ENABLED ? proofId : preuveUrl)} className="w-full h-12 bg-primary hover:bg-primary/90 text-base font-bold">
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmer la commande"}
          </Button>
        </div>
      </div>
    </div>
  );
}
