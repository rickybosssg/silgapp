import { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { haversineKm } from "@/lib/priceEstimate";

/**
 * Helpers Éco — parsing du route_plan_json et calculs de distance.
 * Source de vérité unique pour EcoMissionCard et EcoMissionDashboard.
 */

export function parseRoutePlan(mission) {
  if (!mission?.route_plan_json) return [];
  try {
    const parsed = typeof mission.route_plan_json === "string"
      ? JSON.parse(mission.route_plan_json)
      : mission.route_plan_json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function prixCourseEco(course) {
  return Number(course?.prix_final)
    || Number(course?.prix_propose_client)
    || Number(course?.prix_propose_admin)
    || Number(course?.prix_estimate)
    || 0;
}

export function totalPriceEco(courses = []) {
  return courses.reduce((sum, c) => sum + prixCourseEco(c), 0);
}

export function totalDistanceKm(courses = [], routePlan = []) {
  if (!routePlan.length || courses.length < 2) return null;
  const points = routePlan
    .filter(step => step.lat != null && step.lng != null)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    if (d != null && d >= 0) total += d;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Détermine l'étape actuelle de la mission à partir des statuts des courses.
 * Le route_plan_json donne l'ordre optimal, les statuts donnent la progression.
 *
 * Règle : un colis doit toujours être récupéré avant d'être livré.
 */
export function computeActiveStepIndex(routePlan = [], courses = []) {
  if (!routePlan.length || !courses.length) return 0;
  const courseMap = new Map(courses.map(c => [c.id, c]));

  for (let i = 0; i < routePlan.length; i++) {
    const step = routePlan[i];
    const course = courseMap.get(step.course_id);
    if (!course) continue;

    if (step.type === "pickup") {
      // Pickup non fait si la course n'est pas encore à colis_recupere ou au-delà
      const pickupDone = [
        "colis_recupere", "en_livraison", "arrivee", "livree",
      ].includes(course.statut);
      if (!pickupDone) return i;
    } else if (step.type === "delivery") {
      // Delivery non fait si la course n'est pas livree
      if (course.statut !== "livree" && course.statut !== "annulee") return i;
    }
  }
  // Toutes les étapes sont terminées
  return routePlan.length;
}

export function getStepCourse(routePlan, stepIndex, courses) {
  if (stepIndex >= routePlan.length) return null;
  const step = routePlan[stepIndex];
  if (!step) return null;
  return courses.find(c => c.id === step.course_id) || null;
}