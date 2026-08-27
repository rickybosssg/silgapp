import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { UtensilsCrossed, Bike, Package, CheckCircle2, Clock, MapPin, ChefHat } from "lucide-react";

/**
 * RestaurantParallelTracking — Affichage client type Glovo
 *
 * Deux lignes parallèles qui montrent simultanément :
 *   1. L'état du restaurant (préparation / prête)
 *   2. L'état du livreur (recherche / en route / arrivé / attend / récupéré / en livraison)
 *
 * États UX :
 *   État 1 — Préparation sans livreur
 *   État 2 — Préparation + livreur en route
 *   État 3 — Livreur arrivé avant fin préparation (attend)
 *   État 4 — Commande prête + livreur récupère
 *   État 5 — Livraison en cours
 */
export default function RestaurantParallelTracking({ course, commande, livreur, etaRange }) {
  const restaurantNom = commande?.restaurant_nom || "Restaurant";
  const restaurantLogo = commande?.restaurant_logo_url || null;
  const livreurNom = livreur?.prenom
    ? `${livreur.prenom} ${livreur.nom || ""}`.trim()
    : course?.livreur_nom || "Le livreur";

  // ── État restaurant ──
  const restaurantState = useMemo(() => {
    if (!commande) return null;
    const isPrep = commande.statut === "en_preparation";
    const isPrete = ["prete_recuperation", "livreur_assigne", "commande_recuperee", "en_livraison", "livree"].includes(commande.statut);
    if (isPrep) {
      return {
        icon: ChefHat,
        label: `${restaurantNom} prépare votre commande`,
        sublabel: commande.preparation_time_minutes
          ? `Préparation estimée : ${commande.preparation_time_minutes} min`
          : "Préparation en cours",
        color: "text-orange-600",
        bg: "bg-orange-50",
        ring: "border-orange-200",
        active: true,
      };
    }
    if (isPrete) {
      return {
        icon: CheckCircle2,
        label: "Votre commande est prête",
        sublabel: `${restaurantNom} a terminé la préparation`,
        color: "text-green-600",
        bg: "bg-green-50",
        ring: "border-green-200",
        active: false,
      };
    }
    return null;
  }, [commande, restaurantNom]);

  // ── État livreur ──
  const livreurState = useMemo(() => {
    if (!course) return null;
    const hasLivreur = !!course.livreur_id;
    const statut = course.statut;
    const commandePrep = commande?.statut === "en_preparation";

    // Pas de livreur assigné
    if (!hasLivreur) {
      return {
        icon: Bike,
        label: commandePrep ? "Recherche du livreur au moment optimal" : "Recherche d'un livreur en cours",
        sublabel: "SILGAPP trouvera le livreur idéal",
        color: "text-blue-600",
        bg: "bg-blue-50",
        ring: "border-blue-200",
        active: true,
        spin: true,
      };
    }

    // Livreur assigné, en route vers le restaurant
    if (["recherche_livreur", "livreur_en_route"].includes(statut)) {
      // Si le livreur est arrivé (GPS très proche du restaurant) mais préparation en cours
      const livreurLat = livreur?.latitude || course.latitude_prise_en_charge;
      const livreurLng = livreur?.longitude || course.longitude_prise_en_charge;
      const restLat = course.gps_depart_lat;
      const restLng = course.gps_depart_lng;
      const isClose = livreurLat && restLat
        ? Math.abs(livreurLat - restLat) < 0.002 && Math.abs(livreurLng - restLng) < 0.002
        : false;

      if (commandePrep && (statut === "arrive_prise_en_charge" || isClose)) {
        return {
          icon: Clock,
          label: `${livreurNom} attend votre commande`,
          sublabel: "Arrivé au restaurant, en attente de la préparation",
          color: "text-amber-600",
          bg: "bg-amber-50",
          ring: "border-amber-200",
          active: true,
        };
      }

      return {
        icon: Bike,
        label: `${livreurNom} est en route vers ${restaurantNom}`,
        sublabel: "Le livreur se dirige vers le restaurant",
        color: "text-blue-600",
        bg: "bg-blue-50",
        ring: "border-blue-200",
        active: true,
      };
    }

    // Livreur arrivé au restaurant
    if (statut === "arrive_prise_en_charge") {
      if (commandePrep) {
        return {
          icon: Clock,
          label: `${livreurNom} attend votre commande`,
          sublabel: "Arrivé au restaurant, en attente de la préparation",
          color: "text-amber-600",
          bg: "bg-amber-50",
          ring: "border-amber-200",
          active: true,
        };
      }
      return {
        icon: MapPin,
        label: `${livreurNom} est arrivé au restaurant`,
        sublabel: "Récupération de votre commande",
        color: "text-blue-600",
        bg: "bg-blue-50",
        ring: "border-blue-200",
        active: true,
      };
    }

    // Colis récupéré
    if (["colis_recupere", "pris_en_charge", "passager_embarque"].includes(statut)) {
      return {
        icon: Package,
        label: `${livreurNom} récupère votre commande`,
        sublabel: "Colis en cours de récupération",
        color: "text-purple-600",
        bg: "bg-purple-50",
        ring: "border-purple-200",
        active: true,
      };
    }

    // En livraison
    if (["en_livraison", "arrivee"].includes(statut)) {
      return {
        icon: Bike,
        label: `${livreurNom} est en route vers vous`,
        sublabel: "Livraison en cours",
        color: "text-green-600",
        bg: "bg-green-50",
        ring: "border-green-200",
        active: true,
      };
    }

    return null;
  }, [course, livreur, livreurNom, restaurantNom, commande]);

  if (!restaurantState && !livreurState) return null;

  return (
    <div className="space-y-2.5">
      {/* ── ETA Range ── */}
      {etaRange && (
        <div className="flex items-center justify-center gap-2 py-1">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-bold text-gray-700">{etaRange}</span>
        </div>
      )}

      {/* ── Ligne restaurant ── */}
      {restaurantState && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={`flex items-center gap-3 rounded-2xl border ${restaurantState.ring} ${restaurantState.bg} p-3`}
        >
          <div className={`w-10 h-10 rounded-xl ${restaurantState.bg} ${restaurantState.color} flex items-center justify-center flex-shrink-0 border ${restaurantState.ring}`}>
            {restaurantState.icon ? <restaurantState.icon className="w-5 h-5" /> : <UtensilsCrossed className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {restaurantLogo ? (
                <span className="inline-flex items-center gap-1.5">
                  <img src={restaurantLogo} alt="" className="w-5 h-5 rounded-full object-cover" />
                  {restaurantState.label.replace(restaurantNom, "").trim() || restaurantState.label}
                </span>
              ) : (
                <>
                  <span className="mr-1"></span>{restaurantState.label}
                </>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{restaurantState.sublabel}</p>
          </div>
          {restaurantState.active && (
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
          )}
        </motion.div>
      )}

      {/* ── Ligne livreur ── */}
      {livreurState && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className={`flex items-center gap-3 rounded-2xl border ${livreurState.ring} ${livreurState.bg} p-3`}
        >
          <div className={`w-10 h-10 rounded-xl ${livreurState.bg} ${livreurState.color} flex items-center justify-center flex-shrink-0 border ${livreurState.ring}`}>
            {livreurState.icon ? <livreurState.icon className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              <span className="mr-1">🛵</span>{livreurState.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{livreurState.sublabel}</p>
          </div>
          {livreurState.active && (
            <div className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${livreurState.spin ? "bg-blue-400" : "bg-current " + livreurState.color}`} />
          )}
        </motion.div>
      )}
    </div>
  );
}