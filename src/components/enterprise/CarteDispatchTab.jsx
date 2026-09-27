import React, { useMemo } from "react";
import DispatchMap from "@/components/carte/DispatchMap";
import { RefreshCw } from "lucide-react";

/**
 * CarteDispatchTab — Carte temps réel SILGAPP Enterprise
 *
 * RÉUTILISE le moteur cartographique SILGAPP existant (DispatchMap).
 * Aucun second moteur cartographique créé.
 *
 * ISOLATION ENTERPRISE :
 *   - Les livreurs proviennent de getEnterpriseDashboard (backend)
 *   - L'enterprise_id est résolu côté backend depuis l'admin authentifié
 *   - Le frontend ne fournit JAMAIS d'enterprise_id comme autorité
 *
 * GPS — LECTURE SEULE ABSOLUE :
 *   - Aucune écriture latitude/longitude
 *   - Aucun heartbeat
 *   - Aucune modification de statut, actif, admin_hors_ligne, manual_hors_ligne
 *   - Aucune modification de fréquence GPS
 *
 * DISPATCH V2 — NON MODIFIÉ :
 *   - Aucune nouvelle règle d'éligibilité introduite
 *   - La carte est un affichage uniquement
 *
 * POLLING :
 *   - Réutilise le polling centralisé Enterprise (30s) du parent (EntrepriseApp)
 *   - Aucun timer interne
 */
export default function CarteDispatchTab({ enterprise, data, onRefresh, onCourseClick, onLivreurClick }) {
  // ── Les données proviennent du parent (EntrepriseApp) — polling centralisé 30s ──
  // Aucun polling interne pour éviter les requêtes dupliquées.
  const allLivreurs = data?.livreurs || [];
  const allCourses = data?.courses?.in_progress || [];

  // ── Livreurs avec GPS valide pour l'affichage carte ──
  const livreursSurCarte = allLivreurs.filter((l) => l.latitude && l.longitude);

  // ── IDs des livreurs actuellement en course réelle (pour le statut visuel orange) ──
  // Calculé depuis les courses enterprise en cours — lecture seule.
  const livreurIdsEnCourseReelle = useMemo(() => {
    const ids = new Set();
    allCourses.forEach((c) => {
      if (c.livreur_id && !["livree", "annulee"].includes(c.statut)) {
        ids.add(c.livreur_id);
      }
    });
    return ids;
  }, [allCourses]);

  // ── Position centrale : calculée depuis les livreurs, fallback Ouaga ──
  // Ne dépend QUE des données enterprise (déjà filtrées par tenant côté backend).
  const centerPosition = useMemo(() => {
    const withGPS = allLivreurs.filter((l) => l.latitude && l.longitude);
    if (withGPS.length > 0) {
      const avgLat = withGPS.reduce((s, l) => s + l.latitude, 0) / withGPS.length;
      const avgLng = withGPS.reduce((s, l) => s + l.longitude, 0) / withGPS.length;
      return { latitude: avgLat, longitude: avgLng, zoom: 12 };
    }
    return { latitude: 12.3569, longitude: -1.5353, zoom: 12 };
  }, [allLivreurs]);

  if (!data) {
    return (
      <div className="text-center py-8">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-gray-400" />
      </div>
    );
  }

  // ── Courses en attente (avec GPS départ) pour affichage sur la carte ──
  // Lecture seule — aucun dispatch manuel depuis la carte.
  const coursesSurCarte = allCourses.filter(
    (c) => c.gps_depart_lat && c.gps_depart_lng
  );

  // ── Compteurs (lecture seule) ──
  const countDispo = allLivreurs.filter(
    (l) => l.statut === "disponible" && l.actif !== false && l.validation === "valide"
  ).length;
  const countEnCourse = allLivreurs.filter((l) => l.statut === "en_course").length;
  const countHorsLigne = allLivreurs.filter(
    (l) => l.statut === "hors_ligne" || l.actif === false || l.validation !== "valide"
  ).length;
  const countCoursesRecherche = allCourses.filter((c) =>
    ["nouvelle", "en_attente", "recherche_livreur"].includes(c.statut)
  ).length;

  // ── Handler clic marqueur ──
  // DispatchMap retourne l'entité cliquée. On route vers le bon modal.
  const handleMarkerClick = (entity) => {
    if (!entity) return;
    // Si c'est une course (marqueur rouge)
    if (entity._type === "course" || entity.gps_depart_lat !== undefined) {
      onCourseClick?.(entity);
      return;
    }
    // Sinon c'est un livreur → ouvre la fiche Enterprise
    onLivreurClick?.(entity);
  };

  return (
    <div className="space-y-3">
      {/* ── Compteurs (lecture seule) ── */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-emerald-50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Dispos</p>
          <p className="text-sm font-bold text-emerald-600">{countDispo}</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">En course</p>
          <p className="text-sm font-bold text-amber-600">{countEnCourse}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Recherche</p>
          <p className="text-sm font-bold text-blue-600">{countCoursesRecherche}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-[9px] text-gray-500">Total L.</p>
          <p className="text-sm font-bold text-gray-700">{allLivreurs.length}</p>
        </div>
      </div>

      {/* ── Carte — réutilise DispatchMap (moteur cartographique SILGAPP) ── */}
      <div
        className="rounded-xl overflow-hidden border border-gray-200 relative"
        style={{ height: "calc(100vh - 300px)", minHeight: "320px" }}
      >
        <DispatchMap
          position={centerPosition}
          livreurs={livreursSurCarte}
          clients={[]}
          courses={coursesSurCarte}
          partenaires={[]}
          onMarkerClick={handleMarkerClick}
          showClients={false}
          showLivreurs={true}
          showPartenaires={false}
          showHeatmap={false}
          livreurIdsEnCourseReelle={livreurIdsEnCourseReelle}
          showOldPositions={false}
        />
      </div>

      <button
        onClick={onRefresh}
        className="w-full text-xs text-blue-500 flex items-center justify-center gap-1 py-2"
      >
        <RefreshCw className="w-3 h-3" /> Rafraîchir (auto 30s)
      </button>

      <p className="text-[10px] text-gray-400 text-center">
        Carte scoped {enterprise?.nom || "agence"}. Mise à jour toutes les 30 secondes.
      </p>
    </div>
  );
}