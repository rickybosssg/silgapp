import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowLeft, ArrowRight, MapPin, Navigation, Package, 
  User, FileText, CheckCircle, Smartphone, Truck, AlertCircle
} from "lucide-react";

const STORAGE_KEY = "silgapp_course_draft";

// Props séparées : formData (données pures), gpsHandlers (fonctions)
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
  const progress = ((step + 1) / totalSteps) * 100;

  // Sauvegarder UNIQUEMENT les données (pas les fonctions) dans localStorage
  useEffect(() => {
    try {
      // eslint-disable-next-line no-unused-vars
      const { onGetGPSDepart: _a, onGetGPSArrivee: _b, ...dataOnly } = formData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataOnly));
    } catch (err) {
      console.error("Erreur sauvegarde brouillon:", err);
    }
  }, [formData]);

  const renderStep = () => {
    switch (step) {
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

      case 1:
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <MapPin className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Où récupérer le colis ?</h2>
              <p className="text-sm text-muted-foreground mt-1">Adresse ou quartier de départ</p>
            </div>
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
            <Button type="button" variant="outline" className="w-full" onClick={gpsHandlers?.onGetGPSDepart}>
              <Navigation className="w-4 h-4 mr-2" />
              {formData.recuperationGPS ? "✓ Position GPS utilisée comme point de départ" : "Utiliser ma position actuelle"}
            </Button>
          </div>
        );

      case 2: {
        const destinationInconnue = formData.destination_inconnue || false;
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
                <MapPin className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Où livrer le colis ?</h2>
              <p className="text-sm text-muted-foreground mt-1">Adresse ou quartier d'arrivée</p>
            </div>
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
              <>
                <div>
                  <Label>Adresse de livraison *</Label>
                  <Input
                    value={formData.adresse_arrivee}
                    onChange={(e) => setFormData({ ...formData, adresse_arrivee: e.target.value })}
                    placeholder="Quartier, rue, point de repère..."
                    className="h-12"
                    autoFocus
                  />
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={gpsHandlers?.onGetGPSArrivee}>
                  <Navigation className="w-4 h-4 mr-2" />
                  {formData.livraisonGPS ? "✓ Position GPS enregistrée" : "Utiliser ma position actuelle"}
                </Button>
              </>
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
          </div>
        );
      }

      case 3:
        return (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
                <User className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {formData.type_course === "expedier" ? "Qui reçoit le colis ?" : "Qui envoie le colis ?"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {formData.type_course === "expedier" ? "Informations du destinataire" : "Informations de l'expéditeur"}
              </p>
            </div>
            <div>
              <Label>Nom complet <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
              <Input
                value={formData.type_course === "expedier" ? formData.destinataire_nom : formData.expediteur_nom}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  [formData.type_course === "expedier" ? "destinataire_nom" : "expediteur_nom"]: e.target.value 
                })}
                placeholder="Nom et prénom (optionnel)"
                className="h-12"
                autoFocus
              />
            </div>
            <div>
              <Label>Téléphone *</Label>
              <Input
                type="tel"
                value={formData.type_course === "expedier" ? formData.destinataire_telephone : formData.expediteur_telephone}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  [formData.type_course === "expedier" ? "destinataire_telephone" : "expediteur_telephone"]: e.target.value 
                })}
                placeholder="+226 XX XX XX XX"
                className="h-12"
              />
            </div>
          </div>
        );

      case 4:
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

      case 5:
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

      case 6:
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
                { icon: <MapPin className="w-4 h-4 text-red-600" />, bg: "bg-red-100", label: "Récupération", value: formData.adresse_depart },
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

      default:
        return null;
    }
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
            disabled={
              (step === 0 && !formData.type_course) ||
              (step === 1 && !formData.adresse_depart && !(formData.gps_depart_lat && formData.gps_depart_lng)) ||
              (step === 2 && !formData.destination_inconnue && !formData.adresse_arrivee) ||
              (step === 3 && !(formData.type_course === "expedier" ? formData.destinataire_telephone : formData.expediteur_telephone)) ||
              (step === 4 && !formData.type_colis)
            }
            className="flex-1 h-12 bg-primary"
          >
            Continuer
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={isLoading || !formData.adresse_depart || !(formData.type_course === "expedier" ? formData.destinataire_telephone : formData.expediteur_telephone) || !formData.type_colis}
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