import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Leaf, MapPin, User, Phone, Package, Truck, CheckCircle2, XCircle,
  Clock, Navigation, Euro, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const STATUS_LABELS = {
  candidate: "Candidate",
  available: "Disponible",
  accepting: "Acceptation en cours",
  accepted: "Acceptée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
  invalidated: "Invalidée",
};

const STATUS_COLORS = {
  available: "bg-green-100 text-green-700",
  accepted: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
  invalidated: "bg-red-100 text-red-700",
  candidate: "bg-gray-100 text-gray-500",
  accepting: "bg-amber-100 text-amber-700",
};

/**
 * EcoMissionAdminView — Vue administrative détaillée d'une mission Éco.
 *
 * Affiche :
 *   - La mission complète (statut, livreur, prix total, score de compatibilité)
 *   - Toutes les courses associées avec adresses, clients, prix, statuts
 *   - Les étapes réelles du parcours optimisé (route_plan_json)
 *   - Les événements (acceptation, livraisons, annulations)
 */
export default function EcoMissionAdminView({ course, open, onClose }) {
  const missionId = course?.eco_mission_id;

  const { data: mission, isLoading: missionLoading } = useQuery({
    queryKey: ["eco-mission-admin", missionId],
    queryFn: async () => {
      if (!missionId) return null;
      return await base44.entities.EcoMission.get(missionId);
    },
    enabled: !!missionId && open,
    staleTime: 5000,
  });

  const courseIds = useMemo(() => {
    if (!mission?.course_ids?.length) return [];
    return mission.course_ids;
  }, [mission]);

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["eco-mission-admin-courses", courseIds],
    queryFn: async () => {
      if (!courseIds.length) return [];
      const results = await Promise.all(
        courseIds.map(id => base44.entities.CourseExterne.get(id).catch(() => null))
      );
      return results.filter(Boolean);
    },
    enabled: courseIds.length > 0 && open,
    staleTime: 5000,
  });

  const { data: livreur } = useQuery({
    queryKey: ["eco-mission-admin-livreur", mission?.livreur_id],
    queryFn: async () => {
      if (!mission?.livreur_id) return null;
      return await base44.entities.Livreur.get(mission.livreur_id).catch(() => null);
    },
    enabled: !!mission?.livreur_id && open,
    staleTime: 10000,
  });

  const routePlan = useMemo(() => {
    if (!mission?.route_plan_json) return [];
    try {
      return JSON.parse(mission.route_plan_json);
    } catch {
      return [];
    }
  }, [mission]);

  if (!open || !missionId) return null;

  const isLoading = missionLoading || coursesLoading;
  const devise = courses[0]?.devise || "FCFA";
  const totalPrice = Number(mission?.total_price) || courses.reduce((sum, c) => sum + (Number(c.prix_final) || Number(c.prix_propose_client) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Leaf className="w-5 h-5 text-green-600" />
            Mission Éco — Suivi administratif
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-green-600" />
          </div>
        ) : !mission ? (
          <div className="text-center py-8 text-gray-500">
            <Leaf className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Mission introuvable ou invalidée.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* En-tête mission */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase text-green-100">Statut mission</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[mission.status] || "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABELS[mission.status] || mission.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-black">{totalPrice.toLocaleString()}</p>
                  <p className="text-[10px] text-green-100">{devise} total</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-green-100">Compatibilité</p>
                  <p className="text-lg font-bold">{Number(mission.compatibility_score || 0).toFixed(0)}%</p>
                </div>
              </div>
            </div>

            {/* Livreur assigné */}
            {livreur && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1.5">
                <p className="text-[10px] font-bold uppercase text-blue-400 flex items-center gap-1">
                  <Truck className="w-3 h-3" /> Livreur assigné
                </p>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-bold text-gray-900">{livreur.prenom} {livreur.nom}</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{livreur.statut}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Phone className="w-3 h-3" />
                  <span>{livreur.telephone}</span>
                  {livreur.vehicule && <span className="ml-2">{livreur.vehicule}</span>}
                </div>
              </div>
            )}

            {/* Courses associées */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase text-gray-400">
                Courses associées ({courses.length})
              </p>
              {courses.map((c, index) => (
                <div key={c.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-gray-400">Colis {index + 1}</span>
                    <div className="flex items-center gap-1.5">
                      <CourseStatusBadge statut={c.statut} />
                      {c.statut === "livree" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                      {c.statut === "annulee" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                  </div>

                  {/* Client */}
                  <div className="flex items-center gap-2 text-xs">
                    <User className="w-3 h-3 text-gray-400" />
                    <span className="font-medium text-gray-700">{c.client_nom}</span>
                    <Phone className="w-3 h-3 text-gray-400 ml-2" />
                    <span className="text-gray-600">{c.client_telephone}</span>
                  </div>

                  {/* Trajet */}
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center pt-0.5">
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      <span className="my-0.5 min-h-3 w-px bg-gray-200 flex-1" />
                      <span className="w-2 h-2 rounded-sm bg-red-500 flex-shrink-0" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div>
                        <p className="text-[9px] font-bold uppercase text-gray-400">Récupération</p>
                        <p className="text-xs font-medium text-gray-900">{c.quartier_depart || c.adresse_depart || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase text-gray-400">Livraison</p>
                        <p className="text-xs font-medium text-gray-900">{c.quartier_arrivee || c.adresse_arrivee || "—"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Prix + dates */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-700">
                      {(Number(c.prix_final) || Number(c.prix_propose_client) || 0).toLocaleString()} {c.devise || "FCFA"}
                    </span>
                    {c.heure_acceptation && (
                      <span className="text-[10px] text-gray-400">
                        Acceptée : {format(new Date(c.heure_acceptation), "dd/MM HH:mm", { locale: fr })}
                      </span>
                    )}
                    {c.heure_livraison && (
                      <span className="text-[10px] text-green-600">
                        Livrée : {format(new Date(c.heure_livraison), "dd/MM HH:mm", { locale: fr })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Parcours optimisé */}
            {routePlan.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase text-gray-400 flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> Parcours optimisé
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {routePlan.map((step, i) => {
                    const course = courses.find(c => c.id === step.course_id);
                    const label = step.type === "pickup" ? "Récup" : "Livr.";
                    return (
                      <div key={i} className="flex items-center gap-1">
                        <div className={`px-2 py-1 rounded-md text-[9px] font-bold ${
                          step.type === "pickup" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {label} {course ? courses.indexOf(course) + 1 : "?"}
                        </div>
                        {i < routePlan.length - 1 && <span className="text-gray-300 text-[10px]">→</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Événements */}
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase text-gray-400">Événements</p>
              {mission.locked_at && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>Verrouillée : {format(new Date(mission.locked_at), "dd/MM/yyyy HH:mm", { locale: fr })}</span>
                </div>
              )}
              {mission.accepted_at && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span>Acceptée : {format(new Date(mission.accepted_at), "dd/MM/yyyy HH:mm", { locale: fr })}</span>
                </div>
              )}
              {mission.status === "cancelled" && (
                <div className="flex items-center gap-2 text-xs text-red-500">
                  <XCircle className="w-3 h-3" />
                  <span>Mission annulée</span>
                </div>
              )}
            </div>

            <Button variant="outline" onClick={onClose} className="w-full">
              Fermer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CourseStatusBadge({ statut }) {
  const colors = {
    livree: "bg-green-100 text-green-700",
    annulee: "bg-red-100 text-red-700",
    livreur_en_route: "bg-blue-100 text-blue-700",
    recherche_livreur: "bg-amber-100 text-amber-700",
    nouvelle: "bg-gray-100 text-gray-600",
    en_attente: "bg-amber-100 text-amber-700",
  };
  const labels = {
    livree: "Livrée",
    annulee: "Annulée",
    livreur_en_route: "En route",
    recherche_livreur: "Recherche",
    nouvelle: "Nouvelle",
    en_attente: "En attente",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${colors[statut] || "bg-gray-100 text-gray-600"}`}>
      {labels[statut] || statut}
    </span>
  );
}