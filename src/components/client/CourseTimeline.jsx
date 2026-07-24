import React from "react";
import { motion } from "framer-motion";
import { Check, Package, Search, Bike, Box, Truck, CheckCircle2, User } from "lucide-react";

const STEPS_COLIS = [
  { icon: Package, label: "Course créée" },
  { icon: Search, label: "Recherche livreur" },
  { icon: Bike, label: "Livreur en route" },
  { icon: Box, label: "Colis récupéré" },
  { icon: Truck, label: "En livraison" },
  { icon: CheckCircle2, label: "Livré" },
];

const STEPS_DEPLACEMENT = [
  { icon: Package, label: "Course créée" },
  { icon: Search, label: "Recherche chauffeur" },
  { icon: Bike, label: "Chauffeur en route" },
  { icon: User, label: "Passager à bord" },
  { icon: Truck, label: "En route" },
  { icon: CheckCircle2, label: "Arrivé" },
];

const STATUS_TO_STEP = {
  nouvelle: 0,
  recherche_livreur: 1,
  livreur_en_route: 2,
  arrive_prise_en_charge: 2,
  colis_recupere: 3,
  passager_embarque: 3,
  pris_en_charge: 3,
  en_livraison: 4,
  arrivee: 4,
  livree: 5,
};

export default function CourseTimeline({ statut, typeCourse = "expedier", compact = false }) {
  const steps = typeCourse === "deplacement" ? STEPS_DEPLACEMENT : STEPS_COLIS;
  const currentStep = STATUS_TO_STEP[statut] ?? 0;

  if (compact) {
    // Horizontal compact timeline for bottom sheets
    return (
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          return (
            <React.Fragment key={i}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${isDone ? "bg-emerald-500" : isActive ? "bg-primary" : "bg-gray-200"}`}>
                {isDone ? <Check className="w-3.5 h-3.5 text-white" /> : <step.icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-gray-400"}`} />}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 min-w-[8px] rounded-full transition-colors ${i < currentStep ? "bg-emerald-500" : "bg-gray-200"}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        const isFuture = i > currentStep;
        return (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${isDone ? "bg-emerald-500" : isActive ? "bg-primary" : "bg-gray-100"}`}
              >
                {isDone ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <step.icon className={`w-4 h-4 ${isActive ? "text-white" : "text-gray-400"}`} />
                )}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary"
                    animate={{ scale: [1, 1.3], opacity: [0.6, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </motion.div>
              {i < steps.length - 1 && (
                <div className={`w-0.5 h-7 transition-colors ${isDone ? "bg-emerald-500" : "bg-gray-200"}`} />
              )}
            </div>
            <div className="pt-1.5">
              <p className={`text-sm font-semibold ${isDone ? "text-emerald-600" : isActive ? "text-gray-900" : "text-gray-400"}`}>
                {step.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}