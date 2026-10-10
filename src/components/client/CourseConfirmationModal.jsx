import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, User, Phone, Package, Clock, Truck, Leaf, Check, X } from "lucide-react";

/**
 * CourseConfirmationModal — Récapitulatif + confirmation explicite avant création.
 *
 * RÈGLES :
 *   - Aucune course n'est créée tant que le client n'a pas cliqué sur "Confirmer".
 *   - "Annuler" ferme le modal sans aucune création.
 *   - Le mode de livraison (Standard / Éco) choisi est conservé et affiché.
 *   - Protection anti-double : le bouton "Confirmer" est désactivé pendant la mutation.
 */
export default function CourseConfirmationModal({
  open,
  onClose,
  onConfirm,
  recap,
  isLoading = false,
}) {
  if (!recap) return null;

  const isEco = recap.delivery_mode === "eco";
  const isMulti = recap.is_multi_colis;
  const isDeplacement = recap.type_course === "deplacement";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Check className="w-5 h-5 text-primary" />
            Confirmer votre course
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Mode de livraison */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isEco ? "bg-green-50 border border-green-200" : "bg-blue-50 border border-blue-200"}`}>
            {isEco ? <Leaf className="w-4 h-4 text-green-600" /> : <Truck className="w-4 h-4 text-blue-600" />}
            <span className="text-sm font-bold text-gray-900">
              Mode {isEco ? "Éco" : "Standard"}
            </span>
            {isEco && (
              <span className="text-[10px] text-green-600 ml-auto">Regroupement possible</span>
            )}
          </div>

          {/* Type de course */}
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-700">
              {recap.type_course === "expedier" ? "Expédition" : recap.type_course === "recevoir" ? "Réception" : "Déplacement"}
            </span>
            {isMulti && (
              <span className="ml-auto text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                {recap.nb_colis} colis
              </span>
            )}
          </div>

          {/* Trajet */}
          <div className="space-y-2 bg-gray-50 rounded-xl p-3">
            {/* Départ */}
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center pt-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-gray-400">Départ</p>
                <p className="text-sm text-gray-900 font-medium">{recap.adresse_depart || "Position GPS"}</p>
                {recap.quartier_depart && (
                  <p className="text-[11px] text-gray-500">{recap.quartier_depart}</p>
                )}
              </div>
            </div>
            {/* Arrivée */}
            <div className="flex items-start gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-gray-400">Arrivée</p>
                <p className="text-sm text-gray-900 font-medium">{recap.adresse_arrivee || "À définir"}</p>
                {recap.quartier_arrivee && (
                  <p className="text-[11px] text-gray-500">{recap.quartier_arrivee}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contacts */}
          {!isDeplacement && (
            <div className="space-y-1.5">
              {recap.contact_createur && (
                <div className="flex items-center gap-2 text-xs">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-600">Client :</span>
                  <span className="font-medium text-gray-900">{recap.contact_createur}</span>
                </div>
              )}
              {recap.destinataire && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-600">Destinataire :</span>
                  <span className="font-medium text-gray-900">{recap.destinataire}</span>
                </div>
              )}
              {recap.expediteur && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-600">Expéditeur :</span>
                  <span className="font-medium text-gray-900">{recap.expediteur}</span>
                </div>
              )}
            </div>
          )}

          {isDeplacement && (
            <div className="space-y-1.5">
              {recap.passager_nom && (
                <div className="flex items-center gap-2 text-xs">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-600">Passager :</span>
                  <span className="font-medium text-gray-900">{recap.passager_nom}</span>
                </div>
              )}
              {recap.passager_telephone && (
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-600">Tél passager :</span>
                  <span className="font-medium text-gray-900">{recap.passager_telephone}</span>
                </div>
              )}
            </div>
          )}

          {/* Prix */}
          {recap.prix > 0 && (
            <div className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
              <span className="text-xs font-bold text-amber-700">Prix proposé</span>
              <span className="text-lg font-black text-amber-700">
                {recap.prix.toLocaleString()} <span className="text-xs">{recap.devise || "FCFA"}</span>
              </span>
            </div>
          )}

          {/* Date souhaitée */}
          {recap.date_souhaitee && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Programmée : {new Date(recap.date_souhaitee).toLocaleString("fr-FR")}</span>
            </div>
          )}

          {/* Notes */}
          {recap.notes && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
              <span className="font-semibold">Notes : </span>{recap.notes}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col-reverse sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-12"
          >
            <X className="w-4 h-4 mr-1" />
            Annuler
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 h-12 bg-gradient-to-r from-primary to-primary-dark text-white font-bold"
          >
            {isLoading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-1" />
            ) : (
              <Check className="w-4 h-4 mr-1" />
            )}
            {isLoading ? "Création..." : "Confirmer la course"}
          </Button>
        </DialogFooter>

        <p className="text-[10px] text-center text-gray-400">
          Aucune course ne sera créée tant que vous n'aurez pas confirmé.
        </p>
      </DialogContent>
    </Dialog>
  );
}