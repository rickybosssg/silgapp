import React, { useMemo } from "react";
import { TrendingUp, Users, Target, AlertTriangle, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * HeatmapInsights — Analyse stratégique des cartes thermiques
 * Génère des recommandations basées sur les données de demande et couverture
 */
export default function HeatmapInsights({ clients, livreurs, courses, mode }) {
  const insights = useMemo(() => {
    if (mode === "off") return null;

    // Calculer les points
    const clientPoints = clients.filter(c => c.latitude && c.longitude).length;
    const coursePoints = courses.filter(c => c.gps_depart_lat && c.gps_depart_lng).length;
    const livreurDispo = livreurs.filter(l => l.latitude && l.longitude && l.statut === "disponible").length;
    const livreurCourse = livreurs.filter(l => l.latitude && l.longitude && l.statut === "en_course").length;

    const totalDemande = clientPoints + coursePoints;
    const totalCouverture = livreurDispo + livreurCourse;

    // Ratio offre/demande
    const ratio = totalDemande > 0 ? totalCouverture / totalDemande : 0;

    const recommendations = [];

    if (mode === "demande") {
      if (totalDemande < 3) {
        recommendations.push({
          type: "warning",
          title: "Données insuffisantes",
          description: "Attendez plus de clients ou de courses pour analyser la demande",
          icon: AlertTriangle,
          color: "text-yellow-700 bg-yellow-50 border-yellow-200"
        });
      } else if (totalDemande < 10) {
        recommendations.push({
          type: "info",
          title: "Demande faible",
          description: `${totalDemande} points de demande - Envisagez des actions marketing`,
          icon: Target,
          color: "text-blue-700 bg-blue-50 border-blue-200"
        });
      } else {
        recommendations.push({
          type: "success",
          title: "Forte activité",
          description: `${totalDemande} points de demande - Réseau bien sollicité`,
          icon: CheckCircle,
          color: "text-green-700 bg-green-50 border-green-200"
        });
      }

      // Recommandations spécifiques
      if (coursePoints > clientPoints) {
        recommendations.push({
          type: "action",
          title: "Pic de commandes",
          description: "Beaucoup de courses récentes - Vérifiez la couverture livreurs",
          icon: TrendingUp,
          color: "text-orange-700 bg-orange-50 border-orange-200"
        });
      }
    }

    if (mode === "couverture") {
      if (totalCouverture < 3) {
        recommendations.push({
          type: "warning",
          title: "Couverture insuffisante",
          description: "Seulement " + totalCouverture + " livreurs - Recrutement nécessaire",
          icon: AlertTriangle,
          color: "text-red-700 bg-red-50 border-red-200"
        });
      } else if (ratio < 0.5) {
        recommendations.push({
          type: "critical",
          title: "Déséquilibre critique",
          description: "Peu de livreurs par rapport à la demande - Urgence recrutement",
          icon: AlertTriangle,
          color: "text-red-700 bg-red-50 border-red-200"
        });
      } else if (ratio < 1) {
        recommendations.push({
          type: "action",
          title: "Renforcement recommandé",
          description: "Ratio livreurs/demande : " + ratio.toFixed(2) + " - Recrutez 1-2 livreurs",
          icon: Users,
          color: "text-orange-700 bg-orange-50 border-orange-200"
        });
      } else if (ratio > 2) {
        recommendations.push({
          type: "info",
          title: "Surcouverture",
          description: "Ratio : " + ratio.toFixed(2) + " - Beaucoup de livreurs disponibles",
          icon: CheckCircle,
          color: "text-blue-700 bg-blue-50 border-blue-200"
        });
      } else {
        recommendations.push({
          type: "success",
          title: "Équilibre optimal",
          description: "Ratio : " + ratio.toFixed(2) + " - Bonne répartition livreurs/demande",
          icon: CheckCircle,
          color: "text-green-700 bg-green-50 border-green-200"
        });
      }

      // Statut des livreurs
      if (livreurDispo === 0 && livreurCourse > 0) {
        recommendations.push({
          type: "warning",
          title: "Aucun livreur disponible",
          description: "Tous les livreurs sont en course - Risque de délais",
          icon: AlertTriangle,
          color: "text-orange-700 bg-orange-50 border-orange-200"
        });
      }
    }

    return recommendations;
  }, [clients, livreurs, courses, mode]);

  if (!insights || insights.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-700 px-1"> Insights stratégiques</p>
      {insights.map((insight, idx) => {
        const Icon = insight.icon;
        return (
          <Card key={idx} className={`p-3 border ${insight.color}`}>
            <div className="flex items-start gap-2">
              <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-bold">{insight.title}</p>
                <p className="text-xs opacity-90 leading-tight mt-0.5">{insight.description}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}