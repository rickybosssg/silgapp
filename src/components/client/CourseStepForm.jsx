import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, ArrowRight, MapPin, Navigation, Package, 
  User, FileText, CheckCircle, Truck, AlertCircle,
  Loader2, Search, Send, Inbox, Sparkles
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import CarnetAdresses from "@/components/client/CarnetAdresses";

const STORAGE_KEY = "silgapp_course_draft";

// ─── Composant icône d'étape ──────────────────────────────────────────────────
function StepIcon({ icon: Icon, color, bgColor }) {
  return (
    <div className={`w-16 h-16 rounded-3xl ${bgColor} flex items-center justify-center mx-auto mb-4 shadow-lg`}>
      <Icon className={`w-8 h-8 ${color}`} />
    </div>
  );
}

// ─── Champ input premium ──────────────────────────────────────────────────────
function PremiumInput({ label, required, hint, children, ...props }) {
  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          {label}
          {required && <span className="text-red-500">*</span>}
          {!required && <span className="text-xs text-gray-400 font-normal">(optionnel)</span>}
        </Label>
      )}
      {children || (
        <Input
          {...props}
          className={`h-14 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-primary px-4 text-base font-medium shadow-sm transition-all ${props.className || ""}`}
        />
      )}
      {hint && <p className="text-xs text-gray-400 pl-1">{hint}</p>}
    </div>
  );
}



export default function CourseStepForm({ 
  step, 
  totalSteps, 
  formData,
  gpsHandlers,
  setFormData, 
  onNext, 
  onBack,
  onAnnuler,
  isLoading,
  clientId,
}) {
  const [expediteurFound, setExpediteurFound] = useState(null);
  const [destinataireFound, setDestinataireFound] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const progress = ((step + 1) / totalSteps) * 100;

  // Auto-activer GPS expéditeur si disponible (flux "recevoir")
  // IMPORTANT : désactivé pour éviter boucle React #185
  // La logique est maintenant gérée directement dans le UI (bouton toggle étape 2)

  // Sauvegarder le brouillon — uniquement si changement significatif
  // Utilise JSON.stringify pour éviter les boucles sur des changements de référence mineurs
  const formDataStr = JSON.stringify(formData);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, formDataStr);
    } catch (err) {
      console.error("Erreur sauvegarde brouillon:", err);
    }
  }, [formDataStr]); // ✅ Stable : dépend de la string, pas de l'objet

  // ─── Vérification expéditeur ───────────────────────────────────────────────
  const verifyExpediteur = async () => {
    const phone = formData.expediteur_telephone?.replace(/\D/g, "") || "";
    if (phone.length < 8) { toast.error("Numéro de téléphone invalide"); return; }
    setVerifying(true);
    try {
      const normalized = phone.startsWith("226") ? "+" + phone : phone.length === 8 ? "+226" + phone : "+" + phone;
      let clients = await base44.entities.ClientExterne.filter({ telephone: normalized, actif: true });
      if (!clients || clients.length === 0) {
        try {
          const digits8 = phone.slice(-8);
          clients = await base44.entities.ClientExterne.filter({ telephone: digits8, actif: true });
        } catch (_) {}
      }
      if (clients && clients.length > 0) {
        const client = clients[0];
        setExpediteurFound(client);
        const hasGps = !!(client.latitude && client.longitude);
        setFormData(prev => ({
          ...prev,
          expediteur_nom: prev.expediteur_nom || client.nom || client.prenom || "",
          expediteur_client_id: client.id,
          expediteur_has_app: true,
          expediteur_gps_available: hasGps,
          expediteur_gps_lat: hasGps ? client.latitude : null,
          expediteur_gps_lng: hasGps ? client.longitude : null,
          ...(hasGps ? {
            gps_depart_lat: client.latitude,
            gps_depart_lng: client.longitude,
            recuperationGPS: true,
            adresse_depart: "Position GPS de l'expéditeur",
          } : {}),
        }));
        toast.success(`✅ ${client.nom || client.prenom} trouvé dans SILGAPP !`);
        if (hasGps) toast.success("📍 Position GPS de l'expéditeur disponible !");
        try {
          await base44.functions.invoke("notifyClientSync", {
            course_id: "pending", expediteur_id: client.id, notification_type: "preparation_expedition"
          });
        } catch (_) {}
      } else {
        setExpediteurFound(null);
        setFormData(prev => ({
          ...prev,
          expediteur_client_id: null,
          expediteur_has_app: false,
          expediteur_gps_available: false,
          expediteur_gps_lat: null,
          expediteur_gps_lng: null,
        }));
        toast.info("ℹ️ Expéditeur non trouvé dans SILGAPP - flux standard activé");
      }
    } catch (err) {
      toast.error("Erreur lors de la vérification");
      setExpediteurFound(null);
    } finally {
      setVerifying(false);
    }
  };

  // ─── Vérification destinataire ─────────────────────────────────────────────
  const verifyDestinataire = async () => {
    const phone = formData.destinataire_telephone?.replace(/\D/g, "") || "";
    if (phone.length < 8) { toast.error("Numéro de téléphone invalide"); return; }
    setVerifying(true);
    try {
      const normalized = phone.startsWith("226") ? "+" + phone : phone.length === 8 ? "+226" + phone : "+" + phone;
      let clients = await base44.entities.ClientExterne.filter({ telephone: normalized, actif: true });
      if (!clients || clients.length === 0) {
        try {
          const digits8 = phone.slice(-8);
          clients = await base44.entities.ClientExterne.filter({ telephone: digits8, actif: true });
        } catch (_) {}
      }
      if (clients && clients.length > 0) {
        const client = clients[0];
        setDestinataireFound(client);
        const hasGps = !!(client.latitude && client.longitude);
        setFormData(prev => ({
          ...prev,
          destinataire_nom: prev.destinataire_nom || client.nom || client.prenom || "",
          destinataire_client_id: client.id,
          recipient_has_app: true,
          ...(hasGps ? {
            gps_arrivee_lat: client.latitude,
            gps_arrivee_lng: client.longitude,
            livraisonGPS: true,
            adresse_arrivee: "Position GPS du destinataire",
          } : {}),
        }));
        toast.success(`✅ ${client.nom || client.prenom} trouvé dans SILGAPP !`);
        if (hasGps) toast.success("📍 Position GPS du destinataire disponible !");
        try {
          await base44.functions.invoke("notifyClientSync", {
            course_id: "pending", destinataire_id: client.id, notification_type: "preparation_reception"
          });
        } catch (_) {}
      } else {
        setDestinataireFound(null);
        setFormData(prev => ({
          ...prev,
          destinataire_client_id: null,
          recipient_has_app: false,
        }));
        toast.info("ℹ️ Destinataire non trouvé dans SILGAPP - flux standard activé");
      }
    } catch (err) {
      toast.error("Erreur lors de la vérification");
      setDestinataireFound(null);
    } finally {
      setVerifying(false);
    }
  };

  // ─── Composant résultat vérification ──────────────────────────────────────
  const VerificationResult = ({ found, nom, latitude, longitude, labelTrouve, labelNonTrouve }) => {
    if (found) {
      return (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-green-900">{labelTrouve}</p>
              <p className="text-sm text-green-700 mt-1">
                <strong>{nom}</strong> est inscrit dans SILGAPP
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">✓ Synchronisation</span>
                <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">✓ Notifications</span>
                {latitude && longitude
                  ? <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">✓ GPS disponible</span>
                  : <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">⚠ GPS inactif</span>}
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (found === null) {
      return (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-amber-900">{labelNonTrouve}</p>
              <p className="text-sm text-amber-700 mt-1">Vous pourrez quand même créer la course.</p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderStep = () => {
    const isExpedie = formData.type_course === "expedier";
    const isRecevoir = formData.type_course === "recevoir";

    switch (step) {
      // ─── ÉTAPE 0 : TYPE DE COURSE ──────────────────────────────────────────
      case 0:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <StepIcon icon={Sparkles} color="text-primary" bgColor="bg-gradient-to-br from-primary/20 to-red-100 shadow-red-200" />
              <h2 className="text-2xl font-black text-gray-900">Que souhaitez-vous faire ?</h2>
              <p className="text-sm text-gray-500 mt-1.5">Choisissez le type de livraison</p>
            </div>
            <div className="grid gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type_course: "expedier" })}
                className={`p-5 rounded-3xl border-2 transition-all duration-200 text-left active:scale-[0.98] shadow-sm ${
                  formData.type_course === "expedier"
                    ? "border-primary bg-gradient-to-br from-primary/5 to-red-50 shadow-primary/20 shadow-md"
                    : "border-gray-200 bg-white hover:border-primary/40 hover:shadow-md"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-md transition-all ${
                    formData.type_course === "expedier" ? "bg-gradient-to-br from-primary to-red-600 shadow-red-200" : "bg-gray-100"
                  }`}>
                    <Send className={`w-7 h-7 ${formData.type_course === "expedier" ? "text-white" : "text-gray-400"}`} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-black text-lg ${formData.type_course === "expedier" ? "text-primary" : "text-gray-800"}`}>
                      Expédier un colis
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">Vous envoyez un colis à quelqu'un</p>
                  </div>
                  {formData.type_course === "expedier" && (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, type_course: "recevoir" })}
                className={`p-5 rounded-3xl border-2 transition-all duration-200 text-left active:scale-[0.98] shadow-sm ${
                  formData.type_course === "recevoir"
                    ? "border-accent bg-gradient-to-br from-accent/5 to-green-50 shadow-accent/20 shadow-md"
                    : "border-gray-200 bg-white hover:border-accent/40 hover:shadow-md"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-md transition-all ${
                    formData.type_course === "recevoir" ? "bg-gradient-to-br from-accent to-green-600 shadow-green-200" : "bg-gray-100"
                  }`}>
                    <Inbox className={`w-7 h-7 ${formData.type_course === "recevoir" ? "text-white" : "text-gray-400"}`} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-black text-lg ${formData.type_course === "recevoir" ? "text-accent" : "text-gray-800"}`}>
                      Recevoir un colis
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">On vous envoie un colis</p>
                  </div>
                  {formData.type_course === "recevoir" && (
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        );

      // ─── ÉTAPE 1 ───────────────────────────────────────────────────────────
      case 1: {
        if (isRecevoir) {
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={User} color="text-blue-600" bgColor="bg-gradient-to-br from-blue-100 to-blue-50 shadow-blue-200" />
                <h2 className="text-2xl font-black text-gray-900">Chez qui récupérer ?</h2>
                <p className="text-sm text-gray-500 mt-1.5">Identifiez la personne qui détient votre colis</p>
              </div>

              <PremiumInput
                label="Nom de l'expéditeur"
                required={false}
                value={formData.expediteur_nom}
                onChange={(e) => setFormData({ ...formData, expediteur_nom: e.target.value })}
                placeholder="Nom complet de l'expéditeur"
                autoFocus
              />

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-700">
                  Téléphone de l'expéditeur <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="tel"
                  value={formData.expediteur_telephone}
                  onChange={(e) => setFormData({ ...formData, expediteur_telephone: e.target.value })}
                  placeholder="+226 XX XX XX XX"
                  className="h-14 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-400 px-4 text-base"
                />
                <p className="text-xs text-gray-400 pl-1">Format : +226 XX XX XX XX</p>
                <CarnetAdresses
                  clientId={clientId}
                  type="expediteur"
                  onSelect={(contact) => {
                    setFormData({
                      ...formData,
                      expediteur_nom: contact.nom || formData.expediteur_nom,
                      expediteur_telephone: contact.telephone,
                    });
                  }}
                />
              </div>

              <button
                type="button"
                onClick={verifyExpediteur}
                disabled={!formData.expediteur_telephone || verifying}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-base shadow-lg shadow-blue-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {verifying
                  ? <><Loader2 className="w-5 h-5 animate-spin" />Recherche en cours...</>
                  : <><Search className="w-5 h-5" />Vérifier dans SILGAPP</>}
              </button>

              <VerificationResult
                found={expediteurFound}
                nom={expediteurFound?.nom || expediteurFound?.prenom}
                latitude={expediteurFound?.latitude}
                longitude={expediteurFound?.longitude}
                labelTrouve="✅ Expéditeur trouvé !"
                labelNonTrouve="Expéditeur non trouvé dans SILGAPP"
              />
            </div>
          );
        }

        // "expedier" : Adresse de récupération
        return (
          <div className="space-y-5">
            <div className="text-center">
              <StepIcon icon={MapPin} color="text-primary" bgColor="bg-gradient-to-br from-red-100 to-red-50 shadow-red-200" />
              <h2 className="text-2xl font-black text-gray-900">Où récupérer le colis ?</h2>
              <p className="text-sm text-gray-500 mt-1.5">Votre adresse de récupération</p>
            </div>

            {!formData.recuperationGPS ? (
              <button
                type="button"
                onClick={gpsHandlers?.onGetGPSDepart}
                className="w-full rounded-3xl bg-gradient-to-r from-primary to-red-600 text-white font-bold text-base shadow-xl shadow-primary/30 active:scale-[0.98] transition-all overflow-hidden"
              >
                <div className="flex flex-col items-center justify-center gap-1 py-5 px-4">
                  <div className="flex items-center gap-2 text-lg font-black">
                    <Navigation className="w-6 h-6" />
                    Utiliser ma position actuelle
                  </div>
                  <p className="text-xs text-red-100 font-normal">📍 Détection automatique de votre position</p>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-4 p-5 rounded-3xl bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-green-200">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-green-900">Position GPS récupérée</p>
                  <p className="text-xs text-green-700 mt-0.5 truncate">{formData.adresse_depart || "Position GPS"}</p>
                  {formData.gps_depart_lat && formData.gps_depart_lng && (
                    <p className="text-xs text-green-600 mt-0.5">
                      📍 {Number(formData.gps_depart_lat).toFixed(4)}, {Number(formData.gps_depart_lng).toFixed(4)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recuperationGPS: false, gps_depart_lat: null, gps_depart_lng: null, adresse_depart: "" })}
                  className="text-xs text-green-700 font-bold bg-green-100 px-3 py-1.5 rounded-xl flex-shrink-0"
                >
                  Changer
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">ou saisir manuellement</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <PremiumInput
              label={`Adresse de récupération ${formData.recuperationGPS ? "" : "*"}`}
              required={!formData.recuperationGPS}
              value={formData.adresse_depart}
              onChange={(e) => setFormData({ ...formData, adresse_depart: e.target.value })}
              placeholder="Quartier, rue, point de repère..."
            />
          </div>
        );
      }

      // ─── ÉTAPE 2 ───────────────────────────────────────────────────────────
      case 2: {
        if (isExpedie) {
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={User} color="text-blue-600" bgColor="bg-gradient-to-br from-blue-100 to-blue-50 shadow-blue-200" />
                <h2 className="text-2xl font-black text-gray-900">À qui envoyer le colis ?</h2>
                <p className="text-sm text-gray-500 mt-1.5">Identifiez le destinataire</p>
              </div>

              <PremiumInput
                label="Nom du destinataire"
                required={false}
                value={formData.destinataire_nom}
                onChange={(e) => setFormData({ ...formData, destinataire_nom: e.target.value })}
                placeholder="Nom complet du destinataire"
                autoFocus
              />

              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-700">
                  Téléphone du destinataire <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="tel"
                  value={formData.destinataire_telephone}
                  onChange={(e) => {
                    setFormData({ ...formData, destinataire_telephone: e.target.value });
                    setDestinataireFound(undefined);
                  }}
                  placeholder="+226 XX XX XX XX"
                  className="h-14 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-400 px-4 text-base"
                />
                <p className="text-xs text-gray-400 pl-1">Format : +226 XX XX XX XX</p>
                <CarnetAdresses
                  clientId={clientId}
                  type="destinataire"
                  onSelect={(contact) => {
                    setFormData({
                      ...formData,
                      destinataire_nom: contact.nom || formData.destinataire_nom,
                      destinataire_telephone: contact.telephone,
                    });
                    setDestinataireFound(undefined);
                  }}
                />
              </div>

              <button
                type="button"
                onClick={verifyDestinataire}
                disabled={!formData.destinataire_telephone || verifying}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-base shadow-lg shadow-blue-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {verifying
                  ? <><Loader2 className="w-5 h-5 animate-spin" />Recherche en cours...</>
                  : <><Search className="w-5 h-5" />Vérifier dans SILGAPP</>}
              </button>

              <VerificationResult
                found={destinataireFound}
                nom={destinataireFound?.nom || destinataireFound?.prenom}
                latitude={destinataireFound?.latitude}
                longitude={destinataireFound?.longitude}
                labelTrouve="✅ Destinataire trouvé !"
                labelNonTrouve="Destinataire non trouvé dans SILGAPP"
              />
            </div>
          );
        }

        // "recevoir" : Adresse de récupération
        const gpsDispo = !!(formData.expediteur_gps_lat && formData.expediteur_gps_lng && formData.expediteur_gps_available);
        return (
          <div className="space-y-5">
            <div className="text-center">
              <StepIcon icon={MapPin} color="text-accent" bgColor="bg-gradient-to-br from-green-100 to-green-50 shadow-green-200" />
              <h2 className="text-2xl font-black text-gray-900">Adresse de récupération</h2>
              <p className="text-sm text-gray-500 mt-1.5">Où le livreur doit récupérer le colis</p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!gpsDispo) return;
                const newVal = !(gpsDispo && formData.recuperationGPS);
                if (newVal) {
                  setFormData({ ...formData, recuperationGPS: true, adresse_depart: "Position GPS de l'expéditeur" });
                } else {
                  setFormData({ ...formData, recuperationGPS: false, adresse_depart: formData.adresse_depart === "Position GPS de l'expéditeur" ? "" : formData.adresse_depart });
                }
              }}
              className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                gpsDispo && formData.recuperationGPS
                  ? "border-accent bg-gradient-to-br from-green-50 to-emerald-50"
                  : gpsDispo
                  ? "border-gray-200 bg-white hover:border-accent/40"
                  : "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={gpsDispo && formData.recuperationGPS}
                  disabled={!gpsDispo}
                  className="pointer-events-none data-[state=checked]:bg-accent"
                />
                <div className="flex-1">
                  <p className="font-bold text-gray-900">📍 Position GPS de l'expéditeur</p>
                  {gpsDispo
                    ? <p className="text-xs text-green-600 mt-0.5">Position disponible ✓</p>
                    : <p className="text-xs text-gray-400 mt-0.5">Non disponible (expéditeur sans GPS)</p>}
                </div>
              </div>
            </button>

            {!(gpsDispo && formData.recuperationGPS) && (
              <PremiumInput
                label="Adresse de récupération"
                required={false}
                value={formData.adresse_depart}
                onChange={(e) => setFormData({ ...formData, adresse_depart: e.target.value })}
                placeholder="Quartier, rue, point de repère... (optionnel)"
                autoFocus
              />
            )}
          </div>
        );
      }

      // ─── ÉTAPE 3 ───────────────────────────────────────────────────────────
      case 3: {
        if (isExpedie) {
          const gpsDestDispo = !!(formData.gps_arrivee_lat && formData.gps_arrivee_lng && formData.livraisonGPS);
          return (
            <div className="space-y-5">
              <div className="text-center">
                <StepIcon icon={MapPin} color="text-accent" bgColor="bg-gradient-to-br from-green-100 to-green-50 shadow-green-200" />
                <h2 className="text-2xl font-black text-gray-900">Où livrer le colis ?</h2>
                <p className="text-sm text-gray-500 mt-1.5">Adresse ou quartier d'arrivée</p>
              </div>

              {gpsDestDispo ? (
                <div className="flex items-center gap-4 p-5 rounded-3xl bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-green-200">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-green-900">Position GPS du destinataire</p>
                    <p className="text-xs text-green-700 mt-0.5 truncate">{formData.adresse_arrivee || "Position GPS"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, livraisonGPS: false, gps_arrivee_lat: null, gps_arrivee_lng: null, adresse_arrivee: "" })}
                    className="text-xs text-green-700 font-bold bg-green-100 px-3 py-1.5 rounded-xl flex-shrink-0"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <PremiumInput
                  label="Adresse de livraison"
                  required={false}
                  hint="Indiquez le quartier, la rue ou un point de repère connu."
                  value={formData.adresse_arrivee}
                  onChange={(e) => setFormData({ ...formData, adresse_arrivee: e.target.value })}
                  placeholder="Quartier, rue, point de repère... (optionnel)"
                  autoFocus
                />
              )}
            </div>
          );
        }
        return renderTypeColis();
      }

      case 4: {
        if (isExpedie) return renderTypeColis();
        return renderNotes();
      }

      case 5: {
        if (isExpedie) return renderNotes();
        return renderRecap();
      }

      case 6: {
        return renderRecap();
      }

      default:
        return null;
    }
  };

  function renderTypeColis() {
    const typesColis = [
      { value: "petit_colis", label: "Petit colis", icon: "📦", desc: "< 2 kg" },
      { value: "moyen_colis", label: "Moyen colis", icon: "📫", desc: "2 - 10 kg" },
      { value: "gros_colis", label: "Gros colis", icon: "🗃️", desc: "> 10 kg" },
      { value: "document", label: "Document", icon: "📄", desc: "Papiers, courrier" },
      { value: "nourriture", label: "Nourriture", icon: "🍔", desc: "Repas, boissons" },
      { value: "autre", label: "Autre", icon: "🎁", desc: "Autre type" },
    ];
    return (
      <div className="space-y-6">
        <div className="text-center">
          <StepIcon icon={Package} color="text-purple-600" bgColor="bg-gradient-to-br from-purple-100 to-purple-50 shadow-purple-200" />
          <h2 className="text-2xl font-black text-gray-900">Quel type de colis ?</h2>
          <p className="text-sm text-gray-500 mt-1.5">Sélectionnez la catégorie</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {typesColis.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setFormData({ ...formData, type_colis: type.value })}
              className={`p-4 rounded-2xl border-2 transition-all duration-200 active:scale-[0.97] text-left ${
                formData.type_colis === type.value
                  ? "border-purple-500 bg-gradient-to-br from-purple-50 to-purple-100 shadow-md shadow-purple-100"
                  : "border-gray-200 bg-white hover:border-purple-300 hover:shadow-sm"
              }`}
            >
              <div className="text-3xl mb-2">{type.icon}</div>
              <div className="font-bold text-sm text-gray-900">{type.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{type.desc}</div>
              {formData.type_colis === type.value && (
                <div className="mt-2 flex items-center gap-1">
                  <div className="w-2 h-2 bg-purple-500 rounded-full" />
                  <span className="text-xs text-purple-600 font-semibold">Sélectionné</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderNotes() {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <StepIcon icon={FileText} color="text-orange-600" bgColor="bg-gradient-to-br from-orange-100 to-orange-50 shadow-orange-200" />
          <h2 className="text-2xl font-black text-gray-900">Instructions particulières ?</h2>
          <p className="text-sm text-gray-500 mt-1.5">Informations utiles pour le livreur</p>
        </div>
        <div className="space-y-2">
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Point de repère, code porte, étage, sonnette..."
            rows={5}
            className="rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-orange-300 text-base resize-none p-4"
            autoFocus
          />
          <p className="text-xs text-gray-400 pl-1">Facultatif — Aide le livreur à vous trouver facilement</p>
        </div>
      </div>
    );
  }

  function renderRecap() {
    const rows = [
      { icon: <Truck className="w-4 h-4 text-primary" />, bg: "bg-red-50", border: "border-red-100", label: "Type", value: formData.type_course === "expedier" ? "Expédition" : "Réception" },
      { icon: <MapPin className="w-4 h-4 text-red-600" />, bg: "bg-red-50", border: "border-red-100", label: "Récupération", value: formData.adresse_depart || (formData.recuperationGPS ? "📍 Position GPS" : "—") },
      { icon: <MapPin className="w-4 h-4 text-green-600" />, bg: "bg-green-50", border: "border-green-100", label: "Livraison", value: formData.adresse_arrivee || "—" },
      { icon: <User className="w-4 h-4 text-blue-600" />, bg: "bg-blue-50", border: "border-blue-100", label: "Contact", value: formData.type_course === "expedier" ? `${formData.destinataire_nom || "Destinataire"} • ${formData.destinataire_telephone}` : `${formData.expediteur_nom || "Expéditeur"} • ${formData.expediteur_telephone}` },
      { icon: <Package className="w-4 h-4 text-purple-600" />, bg: "bg-purple-50", border: "border-purple-100", label: "Colis", value: formData.type_colis?.replace(/_/g, " ") || "—" },
    ];
    return (
      <div className="space-y-6">
        <div className="text-center">
          <StepIcon icon={CheckCircle} color="text-green-600" bgColor="bg-gradient-to-br from-green-100 to-green-50 shadow-green-200" />
          <h2 className="text-2xl font-black text-gray-900">Vérifiez votre commande</h2>
          <p className="text-sm text-gray-500 mt-1.5">Récapitulatif de votre course</p>
        </div>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl ${row.bg} border ${row.border}`}>
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                {row.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{row.label}</p>
                <p className="font-bold text-gray-900 capitalize mt-0.5 text-sm leading-snug">{row.value}</p>
              </div>
            </div>
          ))}
          {formData.notes && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-orange-50 border border-orange-100">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <FileText className="w-4 h-4 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Notes</p>
                <p className="font-medium text-gray-800 text-sm mt-0.5">{formData.notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Logique désactivation bouton Continuer (inchangée) ───────────────────
  const isContinueDisabled = () => {
    const isExpedie = formData.type_course === "expedier";
    const isRecevoir = formData.type_course === "recevoir";
    if (step === 0) return !formData.type_course;
    if (step === 1) {
      if (isRecevoir) return !formData.expediteur_telephone;
      if (isExpedie) return !formData.adresse_depart && !formData.recuperationGPS;
    }
    if (step === 2) {
      if (isExpedie) return !formData.destinataire_telephone;
      // "recevoir" : adresse de récupération optionnelle — toujours continuer
    }
    if (step === 3) {
      // "expedier" : adresse de livraison optionnelle — toujours continuer
      if (isRecevoir) return !formData.type_colis;
    }
    if (step === 4) {
      if (isExpedie) return !formData.type_colis;
    }
    return false;
  };

  return (
    <div className="w-full">
      {/* ─── Barre de progression premium ────────────────────────────────── */}
      <div className="mb-7">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-bold text-gray-600">Étape {step + 1} sur {totalSteps}</span>
          <span className="text-sm font-black text-primary">{Math.round(progress)}%</span>
        </div>
        <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-red-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-white/20 rounded-full" style={{
              backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 2s infinite"
            }} />
          </div>
        </div>
        <div className="flex justify-between mt-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${i <= step ? "bg-primary scale-125" : "bg-gray-200"}`}
            />
          ))}
        </div>
      </div>

      <div className="mb-6">{renderStep()}</div>

      {/* ─── Navigation ──────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={onBack}
            className="flex-1 h-14 rounded-2xl border-2 border-gray-200 bg-white text-gray-700 font-bold text-base active:scale-[0.98] transition-all hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour
          </button>
        ) : (
          <button
            type="button"
            onClick={onAnnuler}
            className="flex-1 h-14 rounded-2xl border-2 border-gray-200 bg-white text-gray-600 font-semibold text-base active:scale-[0.98] transition-all hover:bg-gray-50 flex items-center justify-center"
          >
            Annuler
          </button>
        )}

        {step < totalSteps - 1 ? (
          <button
            type="button"
            onClick={onNext}
            disabled={isContinueDisabled()}
            className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-primary to-red-600 text-white font-bold text-base shadow-lg shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Continuer
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-black text-base shadow-lg shadow-green-200 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Création...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Confirmer la course
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}