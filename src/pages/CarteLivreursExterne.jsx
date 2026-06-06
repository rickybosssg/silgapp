import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Truck, Wifi, WifiOff, X, Clock, Users, Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DispatchMap from "@/components/carte/DispatchMap";
import MarkerInfoPanel from "@/components/carte/MarkerInfoPanel";
import NetworkHealthBanner from "@/components/carte/NetworkHealthBanner";
import GPSHealthBadge from "@/components/carte/GPSHealthBadge";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import CountrySelector, { usePaysActifs } from "@/components/international/CountrySelector.jsx";
import { calculateLivreurCounters, calculateClientCounters } from "@/lib/livreurCounters.js";
import ZonesChaudesWidget from "@/components/carte/ZonesChaudes";

// ─── Helpers — importés depuis dispatchRules.js (source unique de vérité) ────
// AUCUNE redéfinition locale — tout vient de dispatchRules.js

import {
  isLibre,
  isEnCourse,
  isON,
  isAppActive,
  isGPSRecent,
  hasValidGPS,
  isClientGPSRecent,
  isClientNoir,
} from "@/lib/dispatchRules.js";

/**
 * Livreur "noir" sur la carte = non dispatchable
 * Règle unifiée : pas de GPS, statut hors_ligne, non validé ou inactif.
 * ⚠️ last_seen_at / app_active N'EST PAS un critère de couleur.
 * Un livreur avec app fermée mais GPS présent reste VERT (dispatchable via WhatsApp).
 */
function isLivreurNoir(livreur) {
  if (!livreur.latitude || !livreur.longitude) return true;
  if (livreur.statut === "hors_ligne") return true;
  if (livreur.actif === false) return true;
  if (livreur.validation !== "valide") return true;
  return false;
}

const INDICATIFS = {
  BF: "+226", CI: "+225", TG: "+228", BJ: "+229",
  SN: "+221", ML: "+223", GN: "+224", NE: "+227",
};

function formatTel(tel, countryCode) {
  if (!tel) return "";
  let cleaned = tel.replace(/\s/g, "");
  if (!cleaned.startsWith("+")) {
    const indicatif = INDICATIFS[countryCode];
    if (indicatif) cleaned = `${indicatif}${cleaned}`;
  }
  // Formatage avec espaces : +226 XX XX XX XX
  return cleaned.replace(/(\+\d{3})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
}

function getZone(entity) {
  return entity.quartier || entity.ville || (entity.latitude ? "Ouagadougou" : "Zone inconnue");
}

function getLastGPS(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at || entity.updated_date;
  if (!dt) return null;
  try {
    return formatDistanceToNow(new Date(dt), { addSuffix: true, locale: fr });
  } catch { return null; }
}

// ─── Badges ─────────────────────────────────────────────────────────────────

function ONBadge({ livreur }) {
  return isON(livreur) ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />ON
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />OFF
    </span>
  );
}

function StatutBadge({ livreur }) {
  if (isLibre(livreur)) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Libre
    </span>
  );
  if (isEnCourse(livreur)) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">
      <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />En course
    </span>
  );
  return null;
}

function AppBadge({ entity }) {
  return isAppActive(entity) ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
      <Wifi className="w-3 h-3" />App ouverte
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <WifiOff className="w-3 h-3" />App fermée
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CarteLivreursExterne() {
  const [showMap, setShowMap] = useState(false);
  const [filtreLivreur, setFiltreLivreur] = useState("tous");
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [heatmapMode, setHeatmapMode] = useState("off"); // "off" | "demande" | "couverture" | "opportunite"
  const [showHeatmapHint, setShowHeatmapHint] = useState(true);
  const [zonesChaudesData, setZonesChaudesData] = useState([]);
  const [masquerInactifs, setMasquerInactifs] = useState(false);
  const [showClients, setShowClients] = useState(true);
  const [showLivreurs, setShowLivreurs] = useState(true);
  const { isGlobal, isPays, countryCode: adminCountryCode, selectedCountry, setSelectedCountry } = useAdminContext();
  const paysActifs = usePaysActifs();
  const defaultCountry = paysActifs.length === 1 ? paysActifs[0].code : null;
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || defaultCountry || "");

  // Coordonnées du pays sélectionné pour centrer la carte
  const { data: allPays = [] } = useQuery({
    queryKey: ["all-pays"],
    queryFn: () => base44.entities.Country.list(),
    initialData: [],
    staleTime: 300000,
  });
  const paysData = useMemo(() => allPays.find(p => p.code === effectiveCountry), [allPays, effectiveCountry]);

  const livreurFilter = effectiveCountry
    ? { type_livreur: "externe", actif: true, validation: "valide", country_code: effectiveCountry }
    : { type_livreur: "externe", actif: true, validation: "valide" };

  const clientFilter = effectiveCountry
    ? { country_code: effectiveCountry }
    : {};

  const { data: livreurs = [], refetch: refetchLivreurs } = useQuery({
    queryKey: ["livreurs-externes-carte", effectiveCountry],
    queryFn: () => base44.entities.Livreur.filter(livreurFilter),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes-carte", effectiveCountry],
    queryFn: () => base44.entities.ClientExterne.filter(clientFilter),
    initialData: [],
    refetchInterval: 15000,
  });

  // Courses en attente : créées, sans livreur assigné, non terminées/annulées
  const coursesAttenteFilter = effectiveCountry
    ? { country_code: effectiveCountry }
    : {};
  const { data: toutesCoursesExternes = [], refetch } = useQuery({
    queryKey: ["courses-attente-carte", effectiveCountry],
    queryFn: () => base44.entities.CourseExterne.filter(coursesAttenteFilter, "-created_date", 100),
    initialData: [],
    refetchInterval: 15000,
  });

  // Abonnement temps réel IMMÉDIAT : courses ET livreurs
  useEffect(() => {
    const unsubCourses = base44.entities.CourseExterne.subscribe(() => { refetch(); });
    // Quand un livreur change de statut (ex: annulation → disponible), rafraîchir immédiatement
    const unsubLivreurs = base44.entities.Livreur.subscribe(() => { refetchLivreurs(); });
    return () => { unsubCourses(); unsubLivreurs(); };
  }, [refetch, refetchLivreurs]);
  
  // Filtrage strict : courses VRAIMENT en attente (statuts initiaux uniquement)
  const coursesEnAttente = useMemo(() => {
    const statutsFin = ["livree", "terminee", "completed", "annulee", "livreur_en_route", "colis_recupere", "en_livraison"];
    
    return toutesCoursesExternes.filter(c =>
      (c.statut === "nouvelle" || c.statut === "recherche_livreur") &&
      (!c.livreur_id || c.dispatch_status === "propose") &&
      !statutsFin.includes(c.statut)
    );
  }, [toutesCoursesExternes]);

  // Courses en attente AVEC GPS (affichables sur la carte)
  const coursesEnAttenteAvecGPS = useMemo(() => 
    coursesEnAttente.filter(c => c.gps_depart_lat && c.gps_depart_lng),
    [coursesEnAttente]
  );

  // Courses en attente SANS GPS (comptabilisées mais non affichables sur la carte)
  const coursesEnAttenteSansGPS = useMemo(() => 
    coursesEnAttente.filter(c => !c.gps_depart_lat || !c.gps_depart_lng),
    [coursesEnAttente]
  );

  // Courses récentes (< 2h) pour la heatmap — utilise le MÊME filtre que coursesEnAttenteAvecGPS
  const coursesRecents = useMemo(() => {
    const now = Date.now();
    return coursesEnAttenteAvecGPS.filter(c => {
      if (!c.created_date) return false;
      return (now - new Date(c.created_date).getTime()) < 2 * 60 * 60 * 1000;
    });
  }, [coursesEnAttenteAvecGPS]);

  // ─── CONTRÔLE DE COHÉRENCE : compteurs = marqueurs sur la carte ─────────
  useEffect(() => {
    const marqueursCourses = document.querySelectorAll('.dmap-course-container').length;
    const livreursEnCourse = livreurs.filter(l => l.statut === "en_course").length;
    const marqueursLivreursEnCourse = livreurs.filter(l => 
      l.statut === "en_course" && l.latitude && l.longitude && !isLivreurNoir(l)
    ).length;
    
    if (marqueursCourses !== coursesEnAttenteAvecGPS.length) {
      console.warn(`⚠️ Incohérence courses: ${marqueursCourses} marqueurs vs ${coursesEnAttenteAvecGPS.length} compteur`);
    }
    if (marqueursLivreursEnCourse !== livreursEnCourse) {
      console.warn(`⚠️ Incohérence livreurs en course: ${marqueursLivreursEnCourse} marqueurs vs ${livreursEnCourse} compteur`);
    }
  }, [coursesEnAttenteAvecGPS, livreurs]);

  // ─── Courses VRAIMENT actives (croisement strict avec livreurs) ─────────
  // Règle : statut actif de livraison EN COURS + livreur_id présent
  // EXCLU : annulee, livree (qui peuvent conserver livreur_id pour l'historique)
  const coursesVraimentActives = useMemo(() => {
    // Seuls ces statuts signifient qu'un livreur est réellement occupé
    const STATUTS_LIVREUR_OCCUPE = ["livreur_en_route", "colis_recupere", "en_livraison"];
    const STATUTS_TERMINAUX = ["annulee", "livree", "terminee", "completed"];

    const actives = toutesCoursesExternes.filter(c =>
      STATUTS_LIVREUR_OCCUPE.includes(c.statut) &&
      !STATUTS_TERMINAUX.includes(c.statut) &&
      c.livreur_id
    );

    console.log("🔴 DIAGNOSTIC courses actives (livreur occupé):", {
      total_chargees: toutesCoursesExternes.length,
      statuts_repartition: toutesCoursesExternes.reduce((acc, c) => {
        acc[c.statut] = (acc[c.statut] || 0) + 1;
        return acc;
      }, {}),
      vraiment_actives: actives.length,
      detail: actives.map(c => ({ statut: c.statut, livreur: c.livreur_nom, id: c.id.slice(-8) })),
    });
    return actives;
  }, [toutesCoursesExternes]);

  // IDs des livreurs ayant une course réellement active en DB
  const livreurIdsEnCourseReelle = useMemo(() =>
    new Set(coursesVraimentActives.map(c => c.livreur_id)),
    [coursesVraimentActives]
  );

  // ─── 🎯 COMPTEURS UNIFIÉS - Source unique de vérité ───────────────────
  // Utilise les mêmes fonctions que DashboardExterne pour garantir l'uniformité
  const compteursLivreurs = useMemo(() => {
    const eligibles = livreurs.filter(l => l.validation === "valide" && l.actif !== false);
    const base = calculateLivreurCounters(eligibles);

    // Recalcul strict de "en course" : statut DB en_course ET course active existante
    const vraisEnCourse = eligibles.filter(l =>
      l.statut === "en_course" && livreurIdsEnCourseReelle.has(l.id)
    );
    console.log("🟠 DIAGNOSTIC livreurs en course:", {
      par_statut_db: eligibles.filter(l => l.statut === "en_course").length,
      avec_course_active: vraisEnCourse.length,
      ids: vraisEnCourse.map(l => l.id.slice(-8)),
      noms: vraisEnCourse.map(l => `${l.prenom} ${l.nom}`),
      livreurs_statut_en_course_sans_course: eligibles
        .filter(l => l.statut === "en_course" && !livreurIdsEnCourseReelle.has(l.id))
        .map(l => ({ id: l.id.slice(-8), nom: `${l.prenom} ${l.nom}` })),
    });

    return {
      ...base,
      enCourse: vraisEnCourse.length,
      oranges: vraisEnCourse.length,
    };
  }, [livreurs, livreurIdsEnCourseReelle]);

  const compteursClients = useMemo(() => 
    calculateClientCounters(clients),
    [clients]
  );

  // 🔍 DIAGNOSTIC - Résumé de cohérence complet
  useEffect(() => {
    const eligibles = livreurs.filter(l => l.validation === "valide" && l.actif !== false);
    const libres = eligibles.filter(l => isLibre(l));
    const enCourseDB = eligibles.filter(l => l.statut === "en_course");
    const enCourseReelle = enCourseDB.filter(l => livreurIdsEnCourseReelle.has(l.id));
    const enCourseFantomes = enCourseDB.filter(l => !livreurIdsEnCourseReelle.has(l.id));

    console.log("🔍 DIAGNOSTIC CARTE COMPLET:", {
      total_livreurs: eligibles.length,
      libres: libres.length,
      libres_ids: libres.map(l => l.id.slice(-8)),
      en_course_statut_db: enCourseDB.length,
      en_course_avec_course_active: enCourseReelle.length,
      en_course_fantomes: enCourseFantomes.length,
      fantomes_detail: enCourseFantomes.map(l => ({
        id: l.id.slice(-8),
        nom: `${l.prenom} ${l.nom}`,
        statut: l.statut,
        last_seen: l.last_seen_at,
      })),
      courses_actives_en_db: coursesVraimentActives.length,
    });
  }, [livreurs, coursesVraimentActives, livreurIdsEnCourseReelle]);

  // ─── Listes filtrées ────────────────────────────────────────────────────
  const livreursAffiches = useMemo(() => {
    switch (filtreLivreur) {
      case "noirs":     return livreurs.filter(l => isLivreurNoir(l));
      case "verts":     return livreurs.filter(l => isLibre(l));
      // En course = statut en_course ET course active confirmée en DB
      case "oranges":   return livreurs.filter(l => l.statut === "en_course" && livreurIdsEnCourseReelle.has(l.id));
      default:          return livreurs;
    }
  }, [livreurs, filtreLivreur, livreurIdsEnCourseReelle]);

  // ─── Marqueurs carte — TOUS les utilisateurs enregistrés ────────────
  // Livreurs sur carte : TOUS les livreurs (couleur selon état)
  const livreursSurCarte = useMemo(() => livreurs, [livreurs]);

  // Clients sur carte : TOUS les clients (couleur selon état)
  const clientsSurCarte = useMemo(() => clients, [clients]);



  // Zoom adapté au rayon du pays (rayon_km → zoom Leaflet approx)
  function rayonToZoom(rayon) {
    if (!rayon) return 12;
    if (rayon <= 10) return 14;
    if (rayon <= 20) return 13;
    if (rayon <= 40) return 12;
    if (rayon <= 80) return 11;
    return 10;
  }

  // Centre de la carte : pays sélectionné > premier livreur éligible > Ouagadougou (BF)
  const centerPosition = useMemo(() => {
    if (paysData?.latitude_centre) {
      return { latitude: paysData.latitude_centre, longitude: paysData.longitude_centre, zoom: rayonToZoom(paysData.rayon_km) };
    }
    if (livreursSurCarte[0]?.latitude && livreursSurCarte[0]?.longitude) {
      return { latitude: livreursSurCarte[0].latitude, longitude: livreursSurCarte[0].longitude, zoom: 13 };
    }
    return { latitude: 12.3569, longitude: -1.5353, zoom: 12 };
  }, [paysData, livreursSurCarte]);

  const filtresBtns = [
    { key: "tous",      label: `Tous (${compteursLivreurs.total})` },
    { key: "on",        label: `ON (${compteursLivreurs.on})` },
    { key: "off",       label: `OFF (${compteursLivreurs.off})` },
    { key: "libres",    label: `Libres (${compteursLivreurs.libres})` },
    { key: "en_course", label: `En course (${compteursLivreurs.enCourse})` },
    { key: "app_active",label: `App active (${compteursLivreurs.appActive})` },
    { key: "carte",     label: `Sur carte (${compteursLivreurs.surCarte})` },
  ];

  // ─── Filtres livreurs (pour la liste) ─────────────────────────────────────
  const FILTRES = [
    { key: "tous",    label: "Tous",       count: compteursLivreurs.total,    dot: "bg-gray-400" },
    { key: "verts",   label: "Libres",     count: compteursLivreurs.verts,    dot: "bg-green-500" },
    { key: "oranges", label: "En course",  count: compteursLivreurs.oranges,  dot: "bg-orange-500" },
    { key: "noirs",   label: "Hors ligne", count: compteursLivreurs.noirs,    dot: "bg-gray-700" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 pt-5 pb-6">
        {/* Top row */}
        <div className="max-w-5xl mx-auto flex items-center justify-between mb-5">
          <Link to={isGlobal ? "/admin/global" : "/"}>
            <button className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium transition-colors">
              <ArrowLeft className="w-4 h-4" />
              {isGlobal ? "Admin Global" : "Retour"}
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/60 text-xs font-medium">Temps réel</span>
          </div>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-white leading-tight">Carte Dispatch</h1>
              <p className="text-white/50 text-sm mt-0.5">Terrain réel · Réseau SILGAPP externe</p>
            </div>
            {isGlobal && paysActifs.length > 1 && (
              <div className="[&_button]:!bg-white [&_button]:!text-slate-800 [&_button]:!border-slate-300 [&_div]:!bg-white [&_div]:!text-slate-800">
                <CountrySelector
                  value={effectiveCountry}
                  onChange={setSelectedCountry}
                  className="h-9 text-xs"
                />
              </div>
            )}
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            {[
              { val: compteursLivreurs.verts,   label: "Libres",      sub: "livreurs",  dot: "bg-green-400",  glow: "shadow-green-500/20" },
              { val: compteursLivreurs.oranges, label: "En mission",  sub: "livreurs",  dot: "bg-orange-400", glow: "shadow-orange-500/20" },
              { val: compteursClients.bleus,    label: "Clients GPS", sub: "< 30 min",  dot: "bg-blue-400",   glow: "shadow-blue-500/20" },
              { val: coursesEnAttente.length,   label: "En attente",  sub: `${coursesEnAttenteAvecGPS.length} avec GPS`, dot: "bg-red-400", glow: "shadow-red-500/20" },
            ].map((item, i) => (
              <div key={i} className={`bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-3 text-center shadow-lg ${item.glow}`}>
                <div className={`w-2 h-2 rounded-full ${item.dot} mx-auto mb-2`} />
                <p className="text-2xl font-black text-white leading-none">{item.val}</p>
                <p className="text-[10px] font-bold text-white/70 mt-1 leading-tight">{item.label}</p>
                <p className="text-[9px] text-white/35 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* ── Bouton carte ──────────────────────────────────────────────── */}
        <button
          onClick={() => setShowMap(true)}
          className="w-full rounded-3xl overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-[0.99] transition-all shadow-xl shadow-purple-500/25 text-left"
        >
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 shadow-inner">
              <MapPin className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-base">Ouvrir la carte interactive</p>
              <p className="text-white/65 text-xs mt-0.5">
                {compteursLivreurs.libres} libres · {compteursLivreurs.enCourse} en mission · {coursesEnAttenteAvecGPS.length} courses GPS
              </p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <ArrowLeft className="w-4 h-4 text-white rotate-180" />
            </div>
          </div>
          {/* Bar de couleurs statuts */}
          <div className="flex h-1">
            <div className="bg-green-400 transition-all" style={{ flex: compteursLivreurs.verts + 0.01 }} />
            <div className="bg-orange-400 transition-all" style={{ flex: compteursLivreurs.oranges + 0.01 }} />
            <div className="bg-blue-400 transition-all" style={{ flex: compteursClients.bleus + 0.01 }} />
            <div className="bg-red-400 transition-all" style={{ flex: coursesEnAttente.length + 0.01 }} />
          </div>
        </button>

        {/* ── Légende compacte ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5">Légende couleurs</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { dot: "bg-gray-800",   label: "Hors ligne" },
              { dot: "bg-green-500",  label: "Libre (GPS actif)" },
              { dot: "bg-orange-500", label: "En course" },
              { dot: "bg-blue-500",   label: "Client actif" },
              { dot: "bg-red-600",    label: "Course attente" },
            ].map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${l.dot}`} />
                <span className="text-xs text-gray-600">{l.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
              Avec GPS : <strong className="text-gray-800 ml-0.5">{coursesEnAttenteAvecGPS.length}</strong>
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
              Sans GPS : <strong className="text-gray-800 ml-0.5">{coursesEnAttenteSansGPS.length}</strong>
            </span>
          </div>
        </div>

        {/* ── Zones chaudes ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <ZonesChaudesWidget
            countryCode={effectiveCountry}
            onDataLoaded={(data) => setZonesChaudesData(data?.toutes_zones_actives || [])}
          />
        </div>

        {/* ── Liste livreurs ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header liste */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center">
                <Truck className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-gray-900">Livreurs</p>
                <p className="text-[10px] text-gray-400">{livreursAffiches.length} affiché{livreursAffiches.length > 1 ? "s" : ""} / {compteursLivreurs.total} total</p>
              </div>
            </div>
          </div>

          {/* Filtres pills */}
          <div className="px-4 py-2.5 flex gap-1.5 flex-wrap border-b border-gray-100">
            {FILTRES.map(f => (
              <button
                key={f.key}
                onClick={() => setFiltreLivreur(f.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  filtreLivreur === f.key
                    ? "bg-slate-800 text-white shadow-sm"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />
                {f.label} <span className="opacity-70">({f.count})</span>
              </button>
            ))}
          </div>

          {/* Items */}
          {livreursAffiches.length === 0 ? (
            <div className="py-12 text-center">
              <Truck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">Aucun livreur dans cette catégorie</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {livreursAffiches.map(livreur => {
                const estNoir   = isLivreurNoir(livreur);
                const estVert   = isLibre(livreur);
                // "En mission" seulement si statut en_course ET course active confirmée
                const estOrange = livreur.statut === "en_course" && livreurIdsEnCourseReelle.has(livreur.id);
                return (
                  <div key={livreur.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    {/* Dot statut */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${estVert ? "bg-green-500" : estOrange ? "bg-orange-500" : "bg-gray-400"}`} />

                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black ${
                      estVert ? "bg-green-100 text-green-700" : estOrange ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {(livreur.prenom || livreur.nom || "?").charAt(0).toUpperCase()}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-gray-900 truncate">{livreur.prenom} {livreur.nom}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          estVert   ? "bg-green-100 text-green-700" :
                          estOrange ? "bg-orange-100 text-orange-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {estVert ? "Libre" : estOrange ? "En mission" : "Hors ligne"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{getZone(livreur)}</span>
                        {getLastGPS(livreur) && (
                          <span className={`flex items-center gap-1 ${hasValidGPS(livreur) ? "text-teal-500" : "text-red-400"}`}>
                            <Clock className="w-3 h-3" />{getLastGPS(livreur)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Téléphone */}
                    <a href={`tel:${livreur.telephone}`} className="text-xs text-primary font-medium hover:underline flex-shrink-0">
                      {formatTel(livreur.telephone, livreur.country_code)}
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Liste clients ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-gray-900">Clients</p>
              <p className="text-[10px] text-gray-400">{compteursClients.bleus} avec GPS récent · {compteursClients.total} total</p>
            </div>
          </div>

          {clientsSurCarte.length === 0 ? (
            <div className="py-12 text-center">
              <MapPin className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">Aucun client enregistré</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {clientsSurCarte.map(client => {
                const gpsRecent = isClientGPSRecent(client);
                return (
                  <div key={client.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${gpsRecent ? "bg-blue-500" : "bg-gray-400"}`} />
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black ${
                      gpsRecent ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {(client.prenom || client.nom || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-gray-900 truncate">{client.prenom} {client.nom}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          gpsRecent ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {gpsRecent ? "GPS récent" : "GPS ancien"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{getZone(client)}</span>
                        {getLastGPS(client) && (
                          <span className={`flex items-center gap-1 ${gpsRecent ? "text-teal-500" : "text-gray-400"}`}>
                            <Clock className="w-3 h-3" />{getLastGPS(client)}
                          </span>
                        )}
                      </div>
                    </div>
                    <a href={`tel:${client.telephone}`} className="text-xs text-primary font-medium hover:underline flex-shrink-0">
                      {formatTel(client.telephone, client.country_code)}
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modale carte interactive ─────────────────────────────────────── */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex-shrink-0 border-b bg-slate-900">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <h2 className="text-base font-black text-white">Carte Dispatch — Temps réel</h2>
              </div>
              <button
                onClick={() => { setShowMap(false); setSelectedMarker(null); }}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="px-4 pb-3 flex items-center gap-3">
              <div className="flex-1">
                <NetworkHealthBanner
                  libres={compteursLivreurs.verts}
                  enCourse={compteursLivreurs.oranges}
                  clientsGPS={compteursClients.gpsRecents}
                  clientsTotal={compteursClients.surCarte}
                  enAttente={coursesEnAttente.length}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMasquerInactifs(v => !v)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    masquerInactifs
                      ? "bg-white text-slate-900 border-white"
                      : "bg-white/10 text-white/70 border-white/20 hover:bg-white/20"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                  {masquerInactifs ? "⚫ Masqués" : "Voir inactifs"}
                </button>
                <button
                  onClick={() => setShowLivreurs(v => !v)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    showLivreurs
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white/10 text-white/70 border-white/20 hover:bg-white/20"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  🟢 Livreurs
                </button>
                <button
                  onClick={() => setShowClients(v => !v)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    showClients
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white/10 text-white/70 border-white/20 hover:bg-white/20"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  🔵 Clients
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0">
              <DispatchMap
                position={centerPosition}
                livreurs={livreursSurCarte}
                clients={clientsSurCarte}
                courses={coursesRecents}
                onMarkerClick={(entity) => setSelectedMarker(entity)}
                heatmapMode={heatmapMode}
                countryCode={effectiveCountry}
                onCountryChange={isGlobal ? setSelectedCountry : undefined}
                zonesChaudesData={zonesChaudesData}
                masquerInactifs={masquerInactifs}
                showClients={showClients}
                showLivreurs={showLivreurs}
              />
            </div>
            {selectedMarker && (
              <MarkerInfoPanel
                entity={selectedMarker}
                onClose={() => setSelectedMarker(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}