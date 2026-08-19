import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MapPin, Package, Sparkles, Loader2, Flame } from "lucide-react";

// ── Distance haversine (identique à dispatchConstants/geoUtils) ──
function haversineKm(lat1, lon1, lat2, lon2) {
  if (typeof lat1 !== "number" || typeof lon1 !== "number") return null;
  if (typeof lat2 !== "number" || typeof lon2 !== "number") return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RAYON_INITIAL_KM = 3;
const RAYON_MAX_KM = 8;
const RAYON_STEPS = [3, 5, 8];

/**
 * ActiviteTempsReel — remplace l'ancienne carte sombre "RECHERCHE ACTIVE".
 * Carte compacte, lecture seule, utilisant uniquement des données réelles.
 *
 * Données affichées:
 *  - Statut: DISPONIBLE — Recherche en cours
 *  - AUTOUR DE MOI: rayon, courses disponibles, livreurs à proximité
 *  - AUJOURD'HUI: courses terminées, montant total, dû SILGAPP
 *  - VENUS: message contextuel discret (pas de grande illustration)
 *
 * Règles respectées:
 *  - Éligibilité courses: statut "recherche_livreur" + dispatch_status "disponible_push" ou "propose"
 *  - Pas de course refusée (DispatchNotification statut "refuse")
 *  - Pas de course expirée (timeout_expires_at)
 *  - Rayon 3 → 5 → 8 km affiché à titre informatif (aucune règle métier modifiée)
 */
export default function ActiviteTempsReel({ livreurProfil, mesCourses = [], isExterne = false }) {
  const {
    statut,
    latitude,
    longitude,
    country_code,
    montant_du_silga = 0,
    type_livreur,
  } = livreurProfil || {};

  const isDisponible = statut === "disponible";
  const livreurId = livreurProfil?.id;
  const hasGPS = typeof latitude === "number" && typeof longitude === "number";

  // ── AUJOURD'HUI: courses terminées et montant total ──
  const todayStr = new Date().toDateString();
  const livreesToday = useMemo(
    () =>
      (mesCourses || []).filter(
        (c) =>
          c.statut === "livree" &&
          new Date(c.heure_livraison || c.colis_livre_at || c.updated_date || c.created_date).toDateString() === todayStr
      ),
    [mesCourses, todayStr]
  );
  const montantToday = useMemo(
    () => livreesToday.reduce((s, c) => s + (c.prix_final || c.prix_reel || 0), 0),
    [livreesToday]
  );

  // ── Courses refusées par ce livreur (DispatchNotification) ──
  const { data: refusedCourseIds = [] } = useQuery({
    queryKey: ["activite-refused-courses", livreurId],
    queryFn: async () => {
      if (!livreurId) return [];
      const refused = await base44.entities.DispatchNotification.filter(
        { livreur_id: livreurId, statut: "refuse" },
        "-date_reponse",
        50
      );
      return (refused || []).map((n) => n.course_id);
    },
    enabled: !!livreurId && isDisponible,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // ── AUTOUR DE MOI: courses disponibles (mêmes règles que CoursesDisponibles) ──
  const { data: coursesDispo = [], isLoading: loadingCourses } = useQuery({
    queryKey: ["activite-courses-dispo", country_code, livreurId],
    queryFn: async () => {
      if (!country_code) return [];
      const all = await base44.entities.CourseExterne.filter(
        { dispatch_status: { $in: ["disponible_push", "propose"] }, country_code },
        "-created_date",
        50
      );
      return (all || []).filter(
        (c) =>
          c.statut === "recherche_livreur" &&
          !c.livreur_id &&
          c.dispatch_status !== "redispatch" &&
          (!c.timeout_expires_at || new Date(c.timeout_expires_at) > new Date()) &&
          !refusedCourseIds.includes(c.id)
      );
    },
    enabled: !!country_code && isDisponible && isExterne,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // ── Distance de chaque course disponible ──
  const coursesWithDistance = useMemo(() => {
    if (!hasGPS || !coursesDispo.length) return [];
    return coursesDispo
      .map((c) => ({
        ...c,
        __distance: haversineKm(latitude, longitude, c.gps_depart_lat, c.gps_depart_lng),
      }))
      .filter((c) => c.__distance !== null)
      .sort((a, b) => a.__distance - b.__distance);
  }, [coursesDispo, latitude, longitude, hasGPS]);

  const closestCourse = coursesWithDistance[0] || null;

  // ── Livreurs à proximité (même pays, disponibles, GPS dans le rayon max) ──
  const { data: nearbyDriversCount = 0 } = useQuery({
    queryKey: ["activite-nearby-drivers", country_code, latitude, longitude, livreurId],
    queryFn: async () => {
      if (!country_code || !hasGPS) return 0;
      const all = await base44.entities.Livreur.filter(
        { country_code, statut: "disponible", actif: true },
        "-created_date",
        100
      );
      const others = (all || []).filter(
        (d) => d.id !== livreurId && typeof d.latitude === "number" && typeof d.longitude === "number"
      );
      return others.filter((d) => {
        const dist = haversineKm(latitude, longitude, d.latitude, d.longitude);
        return dist !== null && dist <= RAYON_MAX_KM;
      }).length;
    },
    enabled: !!country_code && isDisponible && hasGPS,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  // ── VENUS: zone plus active (uniquement si ≥ 2 courses dans le même quartier) ──
  const hotZone = useMemo(() => {
    if (coursesWithDistance.length < 2) return null;
    const counts = {};
    coursesWithDistance.forEach((c) => {
      const q = c.quartier_depart || c.adresse_depart;
      if (q) counts[q] = (counts[q] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    if (!top || top[1] < 2) return null;
    return { quartier: top[0], count: top[1] };
  }, [coursesWithDistance]);

  // ── VENUS message contextuel ──
  const venusMessage = useMemo(() => {
    if (!isExterne) {
      return "Recherche en cours — nous te préviendrons dès qu'une mission sera disponible.";
    }
    if (loadingCourses) return "Analyse des courses disponibles autour de toi…";
    if (coursesWithDistance.length === 0) {
      return "Aucune course disponible autour de toi pour le moment. Je continue la recherche.";
    }
    if (coursesWithDistance.length === 1) {
      return "1 course est actuellement disponible dans ton rayon.";
    }
    return `${coursesWithDistance.length} courses sont actuellement disponibles dans ton rayon.`;
  }, [isExterne, loadingCourses, coursesWithDistance.length]);

  // ── Rendu ──
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] overflow-hidden">
      {/* En-tête: statut */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border-b border-green-100">
        <span className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
        <p className="text-[11px] font-black text-success uppercase tracking-wider leading-none">
          Disponible — Recherche en cours
        </p>
      </div>

      {/* Section: AUTOUR DE MOI */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Autour de moi</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="min-w-0">
            <p className="text-[9px] text-slate-400 leading-tight">Rayon</p>
            <p className="text-sm font-black text-slate-900 leading-tight">{RAYON_INITIAL_KM} km</p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-slate-400 leading-tight">Courses dispo</p>
            {loadingCourses && isExterne ? (
              <Loader2 className="w-3.5 h-3.5 text-slate-300 animate-spin mt-0.5" />
            ) : (
              <p
                className={`text-sm font-black leading-tight ${
                  coursesWithDistance.length > 0 ? "text-orange-500" : "text-slate-300"
                }`}
              >
                {isExterne ? coursesWithDistance.length : "—"}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-slate-400 leading-tight">Livreurs</p>
            <p className="text-sm font-black text-slate-700 leading-tight">
              {hasGPS ? nearbyDriversCount : "—"}
            </p>
          </div>
        </div>

        {/* Course la plus proche */}
        {closestCourse && closestCourse.__distance !== null && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
            <Flame className="w-3 h-3 text-orange-400 flex-shrink-0" />
            <span className="whitespace-nowrap">
              Plus proche: <strong className="text-slate-700">{closestCourse.__distance.toFixed(1)} km</strong>
            </span>
            {closestCourse.quartier_depart && (
              <span className="truncate">• {closestCourse.quartier_depart}</span>
            )}
          </div>
        )}

        {/* Aucune course */}
        {isExterne && !loadingCourses && coursesWithDistance.length === 0 && (
          <p className="mt-2 text-[11px] text-slate-400 italic leading-tight">
            Recherche automatique en cours…
          </p>
        )}

        {/* Rayon extension */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 bg-slate-100 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full"
              style={{ width: `${(RAYON_INITIAL_KM / RAYON_MAX_KM) * 100}%` }}
            />
          </div>
          <p className="text-[9px] text-slate-400 whitespace-nowrap">
            {RAYON_STEPS.join(" → ")} km
          </p>
        </div>
      </div>

      {/* Section: AUJOURD'HUI */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5 mb-2">
          <Package className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Aujourd'hui</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="min-w-0">
            <p className="text-[9px] text-slate-400 leading-tight">Terminées</p>
            <p className="text-sm font-black text-slate-900 leading-tight">{livreesToday.length}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-slate-400 leading-tight">Total</p>
            <p className="text-sm font-black text-slate-900 leading-tight">
              {montantToday.toLocaleString()}
              <span className="text-[9px] font-normal ml-0.5">F</span>
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-slate-400 leading-tight">Dû SILGAPP</p>
            <p
              className={`text-sm font-black leading-tight ${
                montant_du_silga > 0 ? "text-orange-500" : "text-slate-300"
              }`}
            >
              {montant_du_silga.toLocaleString()}
              <span className="text-[9px] font-normal ml-0.5">F</span>
            </p>
          </div>
        </div>
      </div>

      {/* Section: VENUS (discrète) */}
      <div className="px-4 py-2.5 bg-slate-50 flex items-start gap-2">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[8px] font-black text-purple-500 uppercase tracking-wider leading-none">
            Venus
          </p>
          <p className="text-[11px] text-slate-600 leading-snug mt-0.5">{venusMessage}</p>
          {hotZone && (
            <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
              L'activité est actuellement plus forte vers{" "}
              <strong className="text-slate-800">{hotZone.quartier}</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}