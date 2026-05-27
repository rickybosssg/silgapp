import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Ruler, Clock, Banknote, User, Package } from "lucide-react";

/**
 * Historique du Jour - Dashboard Admin Externe
 * Affiche les courses terminées (livrées ou annulées) du jour
 */
export default function HistoriqueDuJour({ courses }) {
  const today = new Date().toDateString();
  const coursesHistorique = courses
    .filter(c => 
      (c.statut === "livree" || c.statut === "annulee") &&
      new Date(c.heure_livraison || c.updated_date || c.created_date).toDateString() === today
    )
    .sort((a, b) => new Date(b.heure_livraison || b.updated_date) - new Date(a.heure_livraison || a.updated_date));

  const livrees = coursesHistorique.filter(c => c.statut === "livree");

  // Fonctions de fallback pour les calculs
  const getDistance = (c) => c.distance_reelle_km
    || (c.latitude_recuperation && c.longitude_recuperation && c.latitude_livraison && c.longitude_livraison
      ? (() => {
          const R = 6371, dLat = ((c.latitude_livraison - c.latitude_recuperation) * Math.PI) / 180;
          const dLon = ((c.longitude_livraison - c.longitude_recuperation) * Math.PI) / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(c.latitude_recuperation*Math.PI/180)*Math.cos(c.latitude_livraison*Math.PI/180)*Math.sin(dLon/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        })()
      : null) || 0;
  const getPrix = (c) => c.prix_final || (getDistance(c) > 0 ? Math.round(getDistance(c) * 100) : 0);
  const getCommission = (c) => c.commission_silga || (getPrix(c) > 0 ? Math.round(getPrix(c) * 0.3) : 0);

  const totalCA = livrees.reduce((sum, c) => sum + getPrix(c), 0);
  const totalCommission = livrees.reduce((sum, c) => sum + getCommission(c), 0);
  const totalDistance = livrees.reduce((sum, c) => sum + getDistance(c), 0);

  if (coursesHistorique.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-sm font-semibold text-gray-600">Aucune course terminée aujourd'hui</p>
        <p className="text-xs text-gray-400 mt-1">Les courses livrées ou annulées apparaîtront ici</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Résumé stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatBox label="Total courses" value={coursesHistorique.length} color="bg-primary" />
        <StatBox label="Livrées" value={coursesHistorique.filter(c => c.statut === "livree").length} color="bg-green-500" />
        <StatBox label="Annulées" value={coursesHistorique.filter(c => c.statut === "annulee").length} color="bg-red-400" />
        <StatBox label="CA du jour" value={`${totalCA.toLocaleString()} F`} color="bg-indigo-500" />
        <StatBox label="Commission Silga" value={`${totalCommission.toLocaleString()} F`} color="bg-purple-500" />
      </div>

      {/* Liste détaillée */}
      <Card className="p-4">
        <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          Historique détaillé ({coursesHistorique.length})
        </h3>
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {coursesHistorique.map(course => (
            <CourseHistoriqueRow key={course.id} course={course} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className={`${color} text-white rounded-xl p-3 text-center`}>
      <p className="text-[10px] opacity-90">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function CourseHistoriqueRow({ course }) {
  const isLivree = course.statut === "livree";
  // Durée : priorité récupération→livraison, sinon acceptation→livraison
  const dureeMinutes = course.heure_livraison && course.heure_recuperation
    ? Math.round((new Date(course.heure_livraison) - new Date(course.heure_recuperation)) / 60000)
    : course.heure_livraison && course.heure_acceptation
      ? Math.round((new Date(course.heure_livraison) - new Date(course.heure_acceptation)) / 60000)
      : null;
  // Distance avec fallback GPS
  const distance = course.distance_reelle_km
    || haversineKm(course.latitude_recuperation, course.longitude_recuperation, course.latitude_livraison, course.longitude_livraison)
    || haversineKm(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
  // Prix avec fallback distance
  const prixFinal = course.prix_final || (distance ? Math.round(distance * 100) : null);
  const commission = course.commission_silga || (prixFinal ? Math.round(prixFinal * 0.3) : null);

  return (
    <div className={`border rounded-xl p-3 ${isLivree ? "bg-green-50/50 border-green-200" : "bg-red-50/50 border-red-200"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge className={isLivree ? "bg-green-600" : "bg-red-600"}>
            {isLivree ? "✅ Livrée" : "❌ Annulée"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            #{course.id.slice(-6)}
          </span>
        </div>
        <span className="text-xs font-semibold text-primary">
          {format(new Date(course.heure_livraison || course.created_date), "HH:mm", { locale: fr })}
        </span>
      </div>

      {/* Infos principales */}
      <div className="grid sm:grid-cols-2 gap-3 text-xs mb-3">
        {/* Expéditeur */}
        <div className="flex items-start gap-2">
          <User className="w-3.5 h-3.5 text-blue-500 mt-0.5" />
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Expéditeur</p>
            <p className="font-semibold text-foreground">{course.expediteur_nom || "—"}</p>
            {course.expediteur_telephone && (
              <p className="text-muted-foreground text-[10px]">{course.expediteur_telephone}</p>
            )}
          </div>
        </div>

        {/* Destinataire */}
        <div className="flex items-start gap-2">
          <User className="w-3.5 h-3.5 text-purple-500 mt-0.5" />
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Destinataire</p>
            <p className="font-semibold text-foreground">{course.destinataire_nom || "—"}</p>
            {course.destinataire_telephone && (
              <p className="text-muted-foreground text-[10px]">{course.destinataire_telephone}</p>
            )}
          </div>
        </div>
      </div>

      {/* Trajet */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <MapPin className="w-3 h-3" />
        <span className="truncate">{course.adresse_depart}</span>
        <span className="text-gray-400">→</span>
        <span className="truncate">{course.adresse_arrivee || "Destination inconnue"}</span>
      </div>

      {/* Livreur */}
      {course.livreur_nom && (
        <div className="flex items-center gap-2 text-xs mb-2">
          <User className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-medium text-foreground">{course.livreur_nom}</span>
        </div>
      )}

      {/* Métriques */}
      {isLivree && (
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-dashed border-green-200">
          {distance && (
            <Metric icon={Ruler} label="Distance" value={`${Number(distance).toFixed(1)} km`} />
          )}
          {dureeMinutes && (
            <Metric icon={Clock} label="Durée" value={`${dureeMinutes} min`} />
          )}
          {prixFinal && (
            <Metric icon={Banknote} label="Prix" value={`${prixFinal.toLocaleString()} F`} />
          )}
          {commission && (
            <Metric icon={Banknote} label="Commission" value={`${commission.toLocaleString()} F`} color="text-orange-600" />
          )}
        </div>
      )}

      {/* Timestamps */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        {course.heure_acceptation && (
          <span>Début: {format(new Date(course.heure_acceptation), "HH:mm", { locale: fr })}</span>
        )}
        {course.heure_livraison && (
          <span>Fin: {format(new Date(course.heure_livraison), "HH:mm", { locale: fr })}</span>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, color = "text-foreground" }) {
  return (
    <div className="text-center">
      <Icon className={`w-3.5 h-3.5 mx-auto mb-0.5 ${color}`} />
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={`text-xs font-bold ${color}`}>{value}</p>
    </div>
  );
}