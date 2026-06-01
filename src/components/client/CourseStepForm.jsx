import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, ArrowRight, MapPin, Navigation, Package, 
  User, FileText, CheckCircle, Smartphone, Truck, AlertCircle,
  Loader2, Search, XCircle
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import ContactPicker from "@/components/client/ContactPicker";

const STORAGE_KEY = "silgapp_course_draft";

export default function CourseStepForm({ 
  step, 
  totalSteps, 
  formData,
  gpsHandlers,
  setFormData, 
  onNext, 
  onBack,
  onAnnuler,
  isLoading 
}) {
  const [expediteurFound, setExpediteurFound] = useState(null);
  const [destinataireFound, setDestinataireFound] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const progress = ((step + 1) / totalSteps) * 100;

  // Auto-activer GPS expéditeur si disponible (flux "recevoir")
  useEffect(() => {
    const isRecevoir = formData.type_course === "recevoir";
    const gpsDispo = !!(formData.expediteur_gps_lat && formData.expediteur_gps_lng && formData.expediteur_gps_available);
    if (isRecevoir && gpsDispo && !formData.recuperationGPS) {
      setFormData(prev => ({
        ...prev,
        recuperationGPS: true,
        adresse_depart: prev.adresse_depart && prev.adresse_depart !== "" ? prev.adresse_depart : "Position GPS de l'expéditeur",
      }));
    }
  }, [formData.expediteur_gps_lat, formData.expediteur_gps_lng, formData.expediteur_gps_available, formData.type_course]);

  // Sauvegarder le brouillon
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    } catch (err) {
      console.error("Erreur sauvegarde brouillon:", err);
    }
  }, [formData]);

  // ─── Vérification expéditeur (flux "recevoir") ───────────────────────────
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

  // ─── Vérification destinataire (flux "expedier") ─────────────────────────
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
          // GPS destinataire → pré-remplir l'adresse d'arrivée
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

  const renderStep = () => {
    const isExpedie = formData.type_course === "expedier";
    const isRecevoir = formData.type_course === "recevoir";

    switch (step) {
      // ─── ÉTAPE 0 : TYPE DE COURSE ────────────────────────────────────────
      case 0:
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Truck className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Que souhaitez-vous faire ?</h2>
              <p className="text-sm text-muted-foreground mt-1">Sélectionnez le type de course</p>
            </div>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type_course: "expedier" })}
                className={`p-5 rounded-2xl border-2 transition-all text-left ${formData.type_course === "expedier" ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/50"}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.type_course === "expedier" ? "bg-primary text-white" : "bg-gray-100"}`}>
                    <Package className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-foreground">Expédier un colis</span>
                </div>
                <p className="text-xs text-muted-foreground">Vous envoyez un colis à quelqu'un</p>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type_course: "recevoir" })}
                className={`p-5 rounded-2xl border-2 transition-all text-left ${formData.type_course === "recevoir" ? "border-accent bg-accent/5" : "border-gray-200 hover:border-accent/50"}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.type_course === "recevoir" ? "bg-accent text-white" : "bg-gray-100"}`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-foreground">Recevoir un colis</span>
                </div>
                <p className="text-xs text-muted-foreground">On vous envoie un colis</p>
              </button>
            </div>
          </div>
        );

      // ─── ÉTAPE 1 ─────────────────────────────────────────────────────────
      // "expedier" → Adresse de récupération (position GPS du livreur)
      // "recevoir" → Identité expéditeur
      case 1: {
        if (isRecevoir) {
          return (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
                  <User className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Chez qui récupérer le colis ?</h2>
                <p className="text-sm text-muted-foreground mt-1">Identifiez la personne qui détient votre colis</p>
              </div>
              <div>
                <Label>Nom de l'expéditeur <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                <Input
                  value={formData.expediteur_nom}
                  onChange={(e) => setFormData({ ...formData, expediteur_nom: e.target.value })}
                  placeholder="Nom complet"
                  className="h-12"
                  autoFocus
                />
              </div>
              <div>
                <Label>Téléphone de l'expéditeur *</Label>
                <div className="space-y-2">
                  <ContactPicker
                    type="expediteur"
                    onSelect={(contact) => {
                      setFormData({
                        ...formData,
                        expediteur_nom: contact.nom || formData.expediteur_nom,
                        expediteur_telephone: contact.telephone,
                      });
                    }}
                  />
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 text-xs text-gray-500 font-medium">
                      ou saisissez manuellement
                    </div>
                    <Input
                      type="tel"
                      value={formData.expediteur_telephone}
                      onChange={(e) => setFormData({ ...formData, expediteur_telephone: e.target.value })}
                      placeholder="+226 XX XX XX XX"
                      className="h-12"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Format : +226 XX XX XX XX</p>
              </div>
              <Button
                type="button"
                onClick={verifyExpediteur}
                disabled={!formData.expediteur_telephone || verifying}
                className="w-full h-14 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold"
              >
                {verifying ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Recherche dans SILGAPP...</> : <><Search className="w-5 h-5 mr-2" />Vérifier dans la base clients</>}
              </Button>
              {expediteurFound && (
                <Card className="p-4 bg-green-50 border-green-200">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-green-900">✅ Expéditeur trouvé !</p>
                      <p className="text-sm text-green-700 mt-1"><strong>{expediteurFound.nom || expediteurFound.prenom}</strong> est inscrit dans SILGAPP</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className="bg-green-200 text-green-800">✓ Synchronisation activée</Badge>
                        <Badge className="bg-green-200 text-green-800">✓ Notifications temps réel</Badge>
                        {expediteurFound.latitude && expediteurFound.longitude
                          ? <Badge className="bg-green-200 text-green-800">✓ GPS disponible</Badge>
                          : <Badge className="bg-amber-200 text-amber-800">⚠ GPS non activé</Badge>}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
              {expediteurFound === null && formData.expediteur_telephone && !verifying && (
                <Card className="p-4 bg-amber-50 border-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-amber-900">Expéditeur non trouvé</p>
                      <p className="text-sm text-amber-700 mt-1">Ce numéro n'est pas dans la base SILGAPP. Vous pourrez quand même créer la course.</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          );
        }

        // "expedier" : Adresse de récupération
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <MapPin className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Où récupérer le colis ?</h2>
              <p className="text-sm text-muted-foreground mt-1">Votre adresse de récupération</p>
            </div>
            {!formData.recuperationGPS ? (
              <button
                type="button"
                onClick={gpsHandlers?.onGetGPSDepart}
                className="w-full h-14 rounded-2xl bg-primary text-white font-bold flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
              >
                <Navigation className="w-5 h-5" />
                Utiliser ma position actuelle
              </button>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-200">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-green-900">✅ Position GPS récupérée</p>
                  <p className="text-xs text-green-700 mt-0.5">{formData.adresse_depart || "Position GPS"}</p>
                  {formData.gps_depart_lat && formData.gps_depart_lng && (
                    <p className="text-xs text-green-600 mt-0.5">
                      📍 {Number(formData.gps_depart_lat).toFixed(4)}, {Number(formData.gps_depart_lng).toFixed(4)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recuperationGPS: false, gps_depart_lat: null, gps_depart_lng: null, adresse_depart: "" })}
                  className="text-green-600 text-xs underline"
                >
                  Changer
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-muted-foreground">ou saisir manuellement</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div>
              <Label>Adresse de récupération {formData.recuperationGPS ? "(optionnel)" : "*"}</Label>
              <Input
                value={formData.adresse_depart}
                onChange={(e) => setFormData({ ...formData, adresse_depart: e.target.value })}
                placeholder="Quartier, rue, point de repère..."
                className="h-12"
              />
            </div>
          </div>
        );
      }

      // ─── ÉTAPE 2 ─────────────────────────────────────────────────────────
      // "expedier" → Identité destinataire + vérification base clients
      // "recevoir" → Adresse de récupération (GPS expéditeur ou manuelle)
      case 2: {
        if (isExpedie) {
          return (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
                  <User className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-foreground">À qui envoyer le colis ?</h2>
                <p className="text-sm text-muted-foreground mt-1">Identifiez le destinataire</p>
              </div>

              <div>
                <Label>Nom du destinataire <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                <Input
                  value={formData.destinataire_nom}
                  onChange={(e) => setFormData({ ...formData, destinataire_nom: e.target.value })}
                  placeholder="Nom complet"
                  className="h-12"
                  autoFocus
                />
              </div>

              <div>
                <Label>Téléphone du destinataire *</Label>
                <div className="space-y-2">
                  <ContactPicker
                    type="destinataire"
                    onSelect={(contact) => {
                      setFormData({
                        ...formData,
                        destinataire_nom: contact.nom || formData.destinataire_nom,
                        destinataire_telephone: contact.telephone,
                      });
                      setDestinataireFound(undefined); // reset résultat
                    }}
                  />
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10 text-xs text-gray-500 font-medium">
                      ou saisissez manuellement
                    </div>
                    <Input
                      type="tel"
                      value={formData.destinataire_telephone}
                      onChange={(e) => {
                        setFormData({ ...formData, destinataire_telephone: e.target.value });
                        setDestinataireFound(undefined); // reset résultat si on retape
                      }}
                      placeholder="+226 XX XX XX XX"
                      className="h-12"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">Format : +226 XX XX XX XX</p>
              </div>

              <Button
                type="button"
                onClick={verifyDestinataire}
                disabled={!formData.destinataire_telephone || verifying}
                className="w-full h-14 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold"
              >
                {verifying
                  ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Recherche dans SILGAPP...</>
                  : <><Search className="w-5 h-5 mr-2" />Vérifier dans la base clients</>}
              </Button>

              {destinataireFound && (
                <Card className="p-4 bg-green-50 border-green-200">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-green-900">✅ Destinataire trouvé !</p>
                      <p className="text-sm text-green-700 mt-1">
                        <strong>{destinataireFound.nom || destinataireFound.prenom}</strong> est inscrit dans SILGAPP
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className="bg-green-200 text-green-800">✓ Synchronisation activée</Badge>
                        <Badge className="bg-green-200 text-green-800">✓ Notifications temps réel</Badge>
                        {destinataireFound.latitude && destinataireFound.longitude
                          ? <Badge className="bg-green-200 text-green-800">✓ GPS disponible</Badge>
                          : <Badge className="bg-amber-200 text-amber-800">⚠ GPS non activé</Badge>}
                      </div>
                      {destinataireFound.latitude && destinataireFound.longitude && (
                        <p className="text-xs text-green-600 mt-2">
                          📍 Position GPS : {Number(destinataireFound.latitude).toFixed(4)}, {Number(destinataireFound.longitude).toFixed(4)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {destinataireFound === null && formData.destinataire_telephone && !verifying && (
                <Card className="p-4 bg-amber-50 border-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-amber-900">Destinataire non trouvé</p>
                      <p className="text-sm text-amber-700 mt-1">
                        Ce numéro n'est pas dans la base SILGAPP. Vous pourrez quand même créer la course.
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          );
        }

        // "recevoir" : Adresse de récupération
        const gpsDispo = !!(formData.expediteur_gps_lat && formData.expediteur_gps_lng && formData.expediteur_gps_available);
        const destinationInconnueR = formData.destination_inconnue || false;
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
                <MapPin className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Adresse de récupération</h2>
              <p className="text-sm text-muted-foreground mt-1">Où le livreur doit récupérer le colis</p>
            </div>

            <Card className={`p-4 border-2 transition-all ${gpsDispo ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="gps-expediteur"
                  checked={gpsDispo && formData.recuperationGPS}
                  disabled={!gpsDispo}
                  onCheckedChange={(checked) => {
                    if (checked && gpsDispo) {
                      setFormData({ ...formData, recuperationGPS: true, adresse_depart: "Position GPS de l'expéditeur" });
                    } else {
                      setFormData({ ...formData, recuperationGPS: false, adresse_depart: formData.adresse_depart === "Position GPS de l'expéditeur" ? "" : formData.adresse_depart });
                    }
                  }}
                  className={`data-[state=checked]:bg-accent ${!gpsDispo ? "opacity-40" : ""}`}
                />
                <Label htmlFor="gps-expediteur" className="font-bold cursor-pointer flex-1">
                  📍 Utiliser la position de l'expéditeur
                </Label>
              </div>
              {gpsDispo ? (
                <div className="mt-2 ml-6 flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  <p className="text-sm font-semibold">Position GPS disponible</p>
                </div>
              ) : (
                <div className="mt-2 ml-6 flex items-center gap-2 text-gray-500">
                  <XCircle className="w-4 h-4" />
                  <p className="text-sm">GPS non disponible (expéditeur non inscrit ou GPS inactif)</p>
                </div>
              )}
            </Card>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
              <Checkbox
                id="destination_inconnue_r"
                checked={destinationInconnueR}
                onCheckedChange={(checked) => setFormData({
                  ...formData, destination_inconnue: checked,
                  adresse_depart: checked ? "" : formData.adresse_depart,
                  gps_depart_lat: checked ? null : formData.gps_depart_lat,
                  gps_depart_lng: checked ? null : formData.gps_depart_lng,
                  recuperationGPS: checked ? false : formData.recuperationGPS
                })}
                className="border-blue-400 data-[state=checked]:bg-blue-600"
              />
              <Label htmlFor="destination_inconnue_r" className="text-sm font-medium text-blue-900 cursor-pointer flex-1">
                Lieu de récupération inconnu pour le moment
              </Label>
            </div>

            {!destinationInconnueR && !(gpsDispo && formData.recuperationGPS) && (
              <div>
                <Label>Adresse de récupération *</Label>
                <Input
                  value={formData.adresse_depart}
                  onChange={(e) => setFormData({ ...formData, adresse_depart: e.target.value })}
                  placeholder="Quartier, rue, point de repère..."
                  className="h-12"
                  autoFocus
                />
              </div>
            )}

            {destinationInconnueR && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">Le lieu de récupération sera défini plus tard.</p>
                  <p className="text-xs text-amber-700 mt-1">L'expéditeur pourra envoyer sa position au livreur.</p>
                </div>
              </div>
            )}
          </div>
        );
      }

      // ─── ÉTAPE 3 ─────────────────────────────────────────────────────────
      // "expedier" → Adresse de livraison (GPS destinataire ou inconnue ou manuelle)
      // "recevoir" → Type de colis
      case 3: {
        if (isExpedie) {
          const destinationInconnue = formData.destination_inconnue || false;
          const gpsDestDispo = !!(formData.gps_arrivee_lat && formData.gps_arrivee_lng && formData.livraisonGPS);
          return (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
                  <MapPin className="w-8 h-8 text-accent" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Où livrer le colis ?</h2>
                <p className="text-sm text-muted-foreground mt-1">Adresse ou quartier d'arrivée</p>
              </div>

              {/* GPS destinataire si disponible */}
              {gpsDestDispo && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-200">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-green-900">✅ Position GPS du destinataire utilisée</p>
                    <p className="text-xs text-green-700 mt-0.5">{formData.adresse_arrivee || "Position GPS"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, livraisonGPS: false, gps_arrivee_lat: null, gps_arrivee_lng: null, adresse_arrivee: "" })}
                    className="text-green-600 text-xs underline"
                  >
                    Changer
                  </button>
                </div>
              )}

              {!gpsDestDispo && (
                <>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <Checkbox
                      id="destination_inconnue"
                      checked={destinationInconnue}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        destination_inconnue: checked,
                        adresse_arrivee: checked ? "" : formData.adresse_arrivee,
                        gps_arrivee_lat: checked ? null : formData.gps_arrivee_lat,
                        gps_arrivee_lng: checked ? null : formData.gps_arrivee_lng,
                        livraisonGPS: checked ? false : formData.livraisonGPS
                      })}
                      className="border-blue-400 data-[state=checked]:bg-blue-600"
                    />
                    <Label htmlFor="destination_inconnue" className="text-sm font-medium text-blue-900 cursor-pointer flex-1">
                      Destination inconnue pour le moment
                    </Label>
                  </div>

                  {!destinationInconnue && (
                    <div>
                      <Label>Adresse de livraison *</Label>
                      <Input
                        value={formData.adresse_arrivee}
                        onChange={(e) => setFormData({ ...formData, adresse_arrivee: e.target.value })}
                        placeholder="Quartier, rue, point de repère..."
                        className="h-12"
                        autoFocus
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">Indiquez le quartier, la rue ou un point de repère connu.</p>
                    </div>
                  )}

                  {destinationInconnue && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900">Le destinataire pourra envoyer sa position plus tard.</p>
                        <p className="text-xs text-amber-700 mt-1">Un lien de suivi sera envoyé au destinataire.</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        }

        // "recevoir" : Type de colis
        return renderTypeColis();
      }

      // ─── ÉTAPE 4 ─────────────────────────────────────────────────────────
      // "expedier" → Type de colis
      // "recevoir" → Notes
      case 4: {
        if (isExpedie) return renderTypeColis();
        return renderNotes();
      }

      // ─── ÉTAPE 5 ─────────────────────────────────────────────────────────
      // "expedier" → Notes
      // "recevoir" → Récapitulatif
      case 5: {
        if (isExpedie) return renderNotes();
        return renderRecap();
      }

      // ─── ÉTAPE 6 ─────────────────────────────────────────────────────────
      // "expedier" → Récapitulatif
      case 6: {
        return renderRecap();
      }

      default:
        return null;
    }
  };

  function renderTypeColis() {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-3">
            <Package className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Quel type de colis ?</h2>
          <p className="text-sm text-muted-foreground mt-1">Sélectionnez la catégorie</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "petit_colis", label: "Petit colis", icon: "📦" },
            { value: "moyen_colis", label: "Moyen colis", icon: "📦" },
            { value: "gros_colis", label: "Gros colis", icon: "📦" },
            { value: "document", label: "Document", icon: "📄" },
            { value: "nourriture", label: "Nourriture", icon: "🍔" },
            { value: "autre", label: "Autre", icon: "🎁" },
          ].map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setFormData({ ...formData, type_colis: type.value })}
              className={`p-4 rounded-xl border-2 transition-all ${formData.type_colis === type.value ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/50"}`}
            >
              <div className="text-2xl mb-2">{type.icon}</div>
              <div className="text-sm font-medium text-foreground">{type.label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderNotes() {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-8 h-8 text-orange-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Instructions particulières ?</h2>
          <p className="text-sm text-muted-foreground mt-1">Informations pour le livreur</p>
        </div>
        <div>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Point de repère, instructions, étage, code porte..."
            rows={5}
            className="resize-none"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-2">Facultatif</p>
        </div>
      </div>
    );
  }

  function renderRecap() {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Vérifiez les informations</h2>
          <p className="text-sm text-muted-foreground mt-1">Récapitulatif de votre course</p>
        </div>
        <Card className="p-4 space-y-3 bg-gradient-to-br from-white to-gray-50">
          {[
            { icon: <Truck className="w-4 h-4 text-primary" />, bg: "bg-primary/10", label: "Type", value: formData.type_course === "expedier" ? "Expédition" : "Réception" },
            { icon: <MapPin className="w-4 h-4 text-red-600" />, bg: "bg-red-100", label: "Récupération", value: formData.adresse_depart || (formData.recuperationGPS ? "📍 Position GPS" : "") },
            { icon: <MapPin className="w-4 h-4 text-green-600" />, bg: "bg-green-100", label: "Livraison", value: formData.destination_inconnue ? "📍 Destination à définir" : formData.adresse_arrivee },
            { icon: <User className="w-4 h-4 text-blue-600" />, bg: "bg-blue-100", label: "Contact", value: formData.type_course === "expedier" ? `${formData.destinataire_nom || "Destinataire"} - ${formData.destinataire_telephone}` : `${formData.expediteur_nom || "Expéditeur"} - ${formData.expediteur_telephone}` },
            { icon: <Package className="w-4 h-4 text-purple-600" />, bg: "bg-purple-100", label: "Colis", value: formData.type_colis?.replace(/_/g, " ") },
          ].map((row, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg ${row.bg} flex items-center justify-center flex-shrink-0`}>{row.icon}</div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">{row.label}</p>
                <p className="font-medium text-foreground capitalize">{row.value}</p>
              </div>
            </div>
          ))}
          {formData.notes && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Notes</p>
                <p className="font-medium text-foreground text-sm">{formData.notes}</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ─── Logique de désactivation du bouton Continuer ────────────────────────
  const isContinueDisabled = () => {
    const isExpedie = formData.type_course === "expedier";
    const isRecevoir = formData.type_course === "recevoir";

    if (step === 0) return !formData.type_course;

    // Étape 1 : récupération (expedier) ou identité expéditeur (recevoir)
    if (step === 1) {
      if (isRecevoir) return !formData.expediteur_telephone;
      if (isExpedie) return !formData.adresse_depart && !formData.recuperationGPS;
    }

    // Étape 2 : identité destinataire (expedier) ou adresse récup (recevoir)
    if (step === 2) {
      if (isExpedie) return !formData.destinataire_telephone;
      if (isRecevoir) return !formData.destination_inconnue && !formData.adresse_depart && !formData.recuperationGPS;
    }

    // Étape 3 : adresse livraison (expedier) ou type colis (recevoir)
    if (step === 3) {
      if (isExpedie) return !formData.destination_inconnue && !formData.adresse_arrivee && !formData.livraisonGPS;
      if (isRecevoir) return !formData.type_colis;
    }

    // Étape 4 : type colis (expedier) ou notes (recevoir - optionnel)
    if (step === 4) {
      if (isExpedie) return !formData.type_colis;
    }

    return false;
  };

  return (
    <div className="w-full">
      {/* Barre de progression */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground">Étape {step + 1} sur {totalSteps}</span>
          <span className="text-xs font-semibold text-primary">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-red-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mb-6">{renderStep()}</div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={onBack} className="flex-1 h-12">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onAnnuler} className="flex-1 h-12">
            Annuler
          </Button>
        )}

        {step < totalSteps - 1 ? (
          <Button
            type="button"
            onClick={onNext}
            disabled={isContinueDisabled()}
            className="flex-1 h-12 bg-primary"
          >
            Continuer
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={isLoading}
            className="flex-1 h-12 bg-gradient-to-r from-primary to-red-600"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Création...
              </>
            ) : "Confirmer la course"}
          </Button>
        )}
      </div>
    </div>
  );
}