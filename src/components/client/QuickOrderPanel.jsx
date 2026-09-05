import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { RotateCcw, MapPin, Loader2, ChevronRight } from "lucide-react";
import {
  fetchDeliveredCourses,
  fetchClientAddresses,
  extractFrequentTrips,
  buildPrefillFromTrip,
} from "@/lib/quickOrder";

/**
 * Panneau "Commande rapide" — Phase 3
 *
 * Affiche les trajets fréquents du client en un seul tap.
 * Réutilise le mécanisme de préremplissage de RefaireCourseButton.
 *
 * NE CRÉE PAS de nouvelle base. NE MODIFIE PAS la tarification.
 */
export default function QuickOrderPanel({ clientProfil, position, user }) {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!clientProfil?.id || !user?.id) {
        setLoading(false);
        return;
      }
      try {
        const [courses, addresses] = await Promise.all([
          fetchDeliveredCourses(clientProfil.id, user),
          fetchClientAddresses(clientProfil.id),
        ]);
        if (cancelled) return;
        const frequentTrips = extractFrequentTrips(courses);
        setTrips(frequentTrips);
      } catch (err) {
        console.error("[QuickOrder] Erreur chargement trajets:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [clientProfil?.id, user?.id]);

  // Ne rien afficher si chargement ou aucun trajet fréquent
  if (loading) return null;
  if (!trips || trips.length === 0) return null;

  const handleTripClick = (trip) => {
    const prefillData = buildPrefillFromTrip(trip);
    if (!prefillData) return;
    const route = `/client/course/${trip.course.type_course || "expedier"}`;
    navigate(route, {
      state: {
        position,
        clientProfil,
        prefillCourse: prefillData,
      },
    });
  };

  return (
    <div className="bg-white border border-black/5 rounded-2xl p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
          <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <p className="text-xs font-black text-gray-700 uppercase tracking-wide">Vos trajets fréquents</p>
      </div>
      <div className="space-y-2">
        {trips.map((trip, i) => (
          <button
            key={i}
            onClick={() => handleTripClick(trip)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50 active:scale-[0.98] transition-all text-left"
          >
            <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <div className="w-0.5 h-4 bg-gray-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {trip.depart_label}
              </p>
              <p className="text-sm font-bold text-gray-700 truncate">
                {trip.arrivee_label}
              </p>
              {trip.count > 1 && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {trip.count} courses
                </p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}