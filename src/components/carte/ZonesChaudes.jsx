import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Flame, RefreshCw } from "lucide-react";

const NIVEAU_STYLE = {
  faible: { emoji: "", color: "#22c55e", label: "Faible", ring: "rgba(34,197,94,0.25)", glow: "rgba(34,197,94,0.15)" },
  moyenne: { emoji: "", color: "#eab308", label: "Moyenne", ring: "rgba(234,179,8,0.30)", glow: "rgba(234,179,8,0.15)" },
  forte: { emoji: "", color: "#f97316", label: "Forte", ring: "rgba(249,115,22,0.35)", glow: "rgba(249,115,22,0.18)" },
  tres_forte: { emoji: "", color: "#ef4444", label: "Très forte", ring: "rgba(239,68,68,0.40)", glow: "rgba(239,68,68,0.20)" },
};

// ─── Halos sur carte Leaflet ─────────────────────────────────────────────────
export function useZonesChaudesHalos(mapInstance, mapLoaded, zones = []) {
  const circlesRef = useRef([]);

  useEffect(() => {
    if (!mapInstance || !mapLoaded || !window.L) return;

    // Supprimer les anciens cercles
    circlesRef.current.forEach(c => { try { c.remove(); } catch (_) {} });
    circlesRef.current = [];

    // Zones à afficher : au moins 1 course ou score notable
    const zonesAffichees = zones.filter(z => z.nb_courses >= 1);

    zonesAffichees.forEach(zone => {
      const style = NIVEAU_STYLE[zone.niveau] || NIVEAU_STYLE.faible;
      const rayon = zone.rayon_km * 1000; // metres

      // Cercle extérieur (halo translucide)
      const haloExterne = window.L.circle([zone.lat, zone.lng], {
        radius: rayon * 1.4,
        color: style.color,
        fillColor: style.color,
        fillOpacity: 0.06,
        weight: 0,
        interactive: false,
      }).addTo(mapInstance);

      // Cercle principal
      const cercle = window.L.circle([zone.lat, zone.lng], {
        radius: rayon,
        color: style.color,
        fillColor: style.color,
        fillOpacity: 0.12,
        weight: 2,
        dashArray: zone.niveau === "faible" ? "6,4" : "0",
        opacity: 0.7,
      }).addTo(mapInstance);

      // Label flottant
      const label = window.L.divIcon({
        html: `
          <div style="
            background: rgba(255,255,255,0.95);
            border: 2px solid ${style.color};
            border-radius: 10px;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 800;
            color: #1a1a1a;
            white-space: nowrap;
            box-shadow: 0 2px 8px ${style.ring};
            line-height: 1.4;
            text-align: center;
          ">
            <div>${style.emoji} ${zone.nom}</div>
            <div style="color:${style.color};font-size:10px;font-weight:700">${zone.nb_courses} course${zone.nb_courses > 1 ? "s" : ""} · ${zone.nb_livreurs} livreur${zone.nb_livreurs !== 1 ? "s" : ""}</div>
          </div>
        `,
        className: "",
        iconAnchor: [60, 15],
        iconSize: [120, 30],
      });

      const labelMarker = window.L.marker([zone.lat, zone.lng], {
        icon: label,
        interactive: false,
        zIndexOffset: 2000,
      }).addTo(mapInstance);

      circlesRef.current.push(haloExterne, cercle, labelMarker);
    });

    return () => {
      circlesRef.current.forEach(c => { try { c.remove(); } catch (_) {} });
      circlesRef.current = [];
    };
  }, [mapInstance, mapLoaded, JSON.stringify(zones?.map(z => `${z.nom}:${z.nb_courses}:${z.niveau}`))]);
}

// ─── Widget admin ─────────────────────────────────────────────────────────────
export default function ZonesChaudesWidget({ compact = false, onDataLoaded, countryCode = "" }) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const { data: alertesZones = [], refetch: refetchAlertes } = useQuery({
    queryKey: ["alertes-zones-chaudes", countryCode],
    queryFn: () => base44.entities.AlerteLivreur.filter(
      { actif: true }, "-created_date", 50
    ).then(arr => {
      const filtered = arr.filter(a => a.cree_par === "moteur_zones_chaudes");
      // Filtrer par pays si un pays est sélectionné
      if (!countryCode) return filtered;
      const paysNom = countryCode; // On filtre par le titre (la zone contiendra le nom de la ville du pays)
      return filtered;
    }),
    refetchInterval: 60000,
  });

  const handleRefresh = async (cc) => {
    const code = cc !== undefined ? cc : countryCode;
    setRefreshing(true);
    setLastResult(null);
    try {
      const res = await base44.functions.invoke("detecterZonesChaudes", {
        country_code: code || undefined,
      });
      setLastResult(res.data);
      refetchAlertes();
      if (onDataLoaded) onDataLoaded(res.data);
    } catch (err) {
      console.error("Erreur zones chaudes:", err);
    } finally {
      setRefreshing(false);
    }
  };

  // Relancer l'analyse quand le pays change — passer la valeur directement pour éviter la stale closure
  useEffect(() => {
    handleRefresh(countryCode);
  }, [countryCode]);

  const zones = lastResult?.zones_chaudes_detail || [];
  const toutesZones = lastResult?.toutes_zones_actives || [];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-bold text-gray-700">
          {zones.length > 0 ? `${zones.length} zone${zones.length > 1 ? "s" : ""} chaude${zones.length > 1 ? "s" : ""}` : "Aucune zone chaude"}
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="ml-1 text-gray-400 hover:text-gray-600"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          <h3 className="font-black text-gray-900">Zones chaudes</h3>
          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-bold">
            {zones.length} actives
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-xl transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Analyser
        </button>
      </div>

      {/* Stats globales */}
      {lastResult && (
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center bg-red-50 rounded-xl py-2.5">
            <p className="text-xl font-black text-red-600">{lastResult.stats?.courses_en_attente || 0}</p>
            <p className="text-[10px] text-red-500 font-semibold">Courses en attente</p>
          </div>
          <div className="text-center bg-green-50 rounded-xl py-2.5">
            <p className="text-xl font-black text-green-600">{lastResult.stats?.livreurs_disponibles || 0}</p>
            <p className="text-[10px] text-green-500 font-semibold">Livreurs dispos</p>
          </div>
          <div className="text-center bg-orange-50 rounded-xl py-2.5">
            <p className="text-xl font-black text-orange-600">{zones.length}</p>
            <p className="text-[10px] text-orange-500 font-semibold">Zones chaudes</p>
          </div>
        </div>
      )}

      {/* Légende scores */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(NIVEAU_STYLE).map(([niveau, cfg]) => (
          <span key={niveau} className="flex items-center gap-1 font-semibold text-gray-500">
            {cfg.emoji} {cfg.label}
          </span>
        ))}
      </div>

      {/* Zones chaudes */}
      {toutesZones.length === 0 && !refreshing ? (
        <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <Flame className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400 font-semibold">Aucune activité détectée</p>
          <p className="text-xs text-gray-300 mt-1">Lancez une analyse pour voir les zones</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {toutesZones.slice(0, 12).map((zone, i) => {
            const style = NIVEAU_STYLE[zone.niveau] || NIVEAU_STYLE.faible;
            return (
              <div
                key={zone.nom}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-colors"
                style={{ borderLeft: `3px solid ${style.color}` }}
              >
                <div className="flex-shrink-0 text-lg">{style.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-gray-900 truncate">{zone.nom}</p>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: style.ring, color: style.color }}
                    >
                      Score {zone.score}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                    <span> {zone.nb_courses} course{zone.nb_courses !== 1 ? "s" : ""}</span>
                    <span> {zone.nb_livreurs} livreur{zone.nb_livreurs !== 1 ? "s" : ""}</span>
                    {zone.temps_attente_min > 0 && (
                      <span>⏱ {zone.temps_attente_min} min attente moy.</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastResult?.timestamp && (
        <p className="text-[10px] text-gray-300 text-right">
          Dernière analyse : {new Date(lastResult.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
