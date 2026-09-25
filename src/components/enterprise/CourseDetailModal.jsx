import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, MapPin, User, Truck, Calendar, Wallet, Navigation } from "lucide-react";

const STATUS_LABELS = {
  nouvelle: "Nouvelle",
  en_attente: "En attente",
  programmee: "Programmée",
  recherche_livreur: "Recherche livreur",
  livreur_en_route: "Livreur en route",
  client_contacte: "Client contacté",
  en_route_expediteur: "En route expéditeur",
  arrive_prise_en_charge: "Arrivé prise en charge",
  colis_recupere: "Colis récupéré",
  passager_embarque: "Passager embarqué",
  pris_en_charge: "Pris en charge",
  en_livraison: "En livraison",
  arrivee: "Arrivée",
  livree: "Livrée",
  annulee: "Annulée",
};

const DISPATCH_LABELS = {
  en_attente: "En attente",
  propose: "Proposée",
  accepte: "Acceptée",
  expire: "Expirée",
  redispatch: "Redispatch",
  cycle_epuise: "Cycle épuisé",
  disponible_push: "Disponible (push)",
};

export default function CourseDetailModal({ course, open, onClose }) {
  if (!course) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Navigation className="w-4 h-4" />
            Course #{course.id?.slice(-8)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Statut */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
            <span className="text-xs text-gray-500">Statut</span>
            <span className="text-xs font-bold text-gray-900">
              {STATUS_LABELS[course.statut] || course.statut}
            </span>
          </div>

          {course.dispatch_status && (
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
              <span className="text-xs text-gray-500">Dispatch</span>
              <span className="text-xs font-bold text-gray-900">
                {DISPATCH_LABELS[course.dispatch_status] || course.dispatch_status}
              </span>
            </div>
          )}

          {/* Date */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            {course.created_date ? new Date(course.created_date).toLocaleString("fr-FR") : "—"}
          </div>

          {/* Client */}
          <div className="border-t pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Client</p>
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 text-gray-400" />
              <span className="text-sm text-gray-900">{course.client_nom || "—"}</span>
            </div>
            {course.client_telephone && (
              <div className="flex items-center gap-2 mt-1">
                <Phone className="w-3 h-3 text-gray-400" />
                <a href={`tel:${course.client_telephone}`} className="text-sm text-blue-600">{course.client_telephone}</a>
              </div>
            )}
          </div>

          {/* Livreur */}
          <div className="border-t pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Livreur</p>
            {course.livreur_nom ? (
              <>
                <div className="flex items-center gap-2">
                  <Truck className="w-3 h-3 text-gray-400" />
                  <span className="text-sm text-gray-900">{course.livreur_nom}</span>
                </div>
                {course.livreur_telephone && (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <a href={`tel:${course.livreur_telephone}`} className="text-sm text-blue-600">{course.livreur_telephone}</a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-amber-600 italic">En attente d'un livreur</p>
            )}
          </div>

          {/* Trajet */}
          <div className="border-t pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Trajet</p>
            <div className="flex items-start gap-2">
              <MapPin className="w-3 h-3 text-gray-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{course.adresse_depart || "—"}</p>
                <p className="text-xs text-gray-400">↓</p>
                <p className="text-sm text-gray-900">{course.adresse_arrivee || "—"}</p>
              </div>
            </div>
          </div>

          {/* Prix */}
          <div className="border-t pt-2 space-y-1">
            {course.prix_propose_admin != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Prix proposé</span>
                <span className="font-semibold text-gray-900">{course.prix_propose_admin.toLocaleString("fr-FR")} F</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Prix final</span>
              <span className="text-lg font-bold text-gray-900">
                {course.prix_final ? `${course.prix_final.toLocaleString("fr-FR")} F` : "Non défini"}
              </span>
            </div>
          </div>

          {course.notes && (
            <div className="border-t pt-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Notes</p>
              <p className="text-xs text-gray-600">{course.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}