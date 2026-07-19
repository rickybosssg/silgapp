import { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Truck, Wifi, WifiOff, X, Clock, Users, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DispatchMap from "@/components/carte/DispatchMap";
import MarkerInfoPanel from "@/components/carte/MarkerInfoPanel";
import NetworkHealthBanner from "@/components/carte/NetworkHealthBanner";
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
  hasValidGPS,
  isClientGPSRecent,
} from "@/lib/dispatchRules.js";
import { isLivreurNoir } from "@/lib/livreurCounters.js";
import { getLivreurCategorie } from "@/lib/dispatchRules.js";
import LivreurCategoryDialog from "@/components/carte/LivreurCategoryDialog.jsx";

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
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
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
    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
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
  const [showPartenaires, setShowPartenaires] = useState(true);
  const [correctionEnCours, setCorrectionEnCours] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(null); // { category, livreurs }

  const handleCorrectionEnCourse = async () => {
    if (!confirm('Corriger les livreurs "en course" sans course active ?')) return;
    setCorrectionEnCours(true);
    try {
      const res = await base44.functions.invoke('correctionEnCourse', {});
      if (res.data?.success) {
        alert(`✅ ${res.data.corriges} livreur(s) corrigé(s) !`);
        // Rafraîchir les données
        await refetchLivreurs();
      } else {
        alert('❌ Erreur: ' + (res.data?.error || 'Inconnue'));
      }
    } catch (err) {
      alert('❌ Erreur: ' + err.message);
    } finally {
      setCorrectionEnCours(false);
    }
  };

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
    refetchInterval: 10000,
    staleTime: 8000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-externes-carte", effectiveCountry],
    queryFn: () => base44.entities.ClientExterne.filter(clientFilter),
    initialData: [],
    refetchInterval: 15000,
  });

  // ── Partenaires : boutiques + restaurants (filtrés par pays) ────────
  const partenaireFilter = effectiveCountry ? { pays_code: effectiveCountry, actif: true } : { actif: true };
  const { data: boutiquesCarte = [] } = useQuery({
    queryKey: ["boutiques-carte", effectiveCountry],
    queryFn: () => base44.entities.Boutique.filter(partenaireFilter),
    initialData: [],
    refetchInterval: 30000,
  });
  const { data: restaurantsCarte = [] } = useQuery({
    queryKey: ["restaurants-carte", effectiveCountry],
    queryFn: () => base44.entities.Restaurant.filter(partenaireFilter),
    initialData: [],
    refetchInterval: 30000,
  });
  const { data: pharmaciesCarte = [] } = useQuery({
    queryKey: ["pharmacies-carte", effectiveCountry],
    queryFn: () => base44.entities.Pharmacie.filter(partenaireFilter),
    initialData: [],
    refetchInterval: 30000,
  });

  // Combiner boutiques + restaurants + pharmacies avec _type pour différenciation visuelle
  const partenaires = useMemo(() => [
    ...boutiquesCarte.map(b => ({ ...b, _type: "boutique" })),
    ...restaurantsCarte.map(r => ({ ...r, _type: "restaurant" })),
    ...pharmaciesCarte.map(p => ({ ...p, _type: "pharmacie" })),
  ], [boutiquesCarte, restaurantsCarte, pharmaciesCarte]);

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
    const cats = eligibles.map(l => getLivreurCategorie(l, livreurIdsEnCourseReelle));
    const libres = cats.filter(c => c === "libre").length;

    return {
      total: eligibles.length,
      libres,                                          // TOUS dispatchables (GPS ≤ 60 min)
      libres_recent: libres,                           // alias rétro-compatibilité
      libres_ancien: 0,                                // plus de distinction
      sans_gps_valide: 0,                              // alias rétro-compatibilité
      gps_expire: cats.filter(c => c === "gps_expire").length,
      enCourse: cats.filter(c => c === "en_course").length,
      hors_ligne: cats.filter(c => c === "hors_ligne").length,
      // Aliases for backward compatibility
      verts: libres,
      oranges: cats.filter(c => c === "en_course").length,
      noirs: cats.filter(c => c === "gps_expire").length + cats.filter(c => c === "hors_ligne").length,
      on: eligibles.filter(l => isON(l)).length,
      off: eligibles.filter(l => !isON(l)).length,
      appActive: eligibles.filter(l => isAppActive(l)).length,
      surCarte: eligibles.length,
      visibleCarte: libres + cats.filter(c => c === "en_course").length,
    };
  }, [livreurs, livreurIdsEnCourseReelle]);

  const compteursClients = useMemo(() => 
    calculateClientCounters(clients),
    [clients]
  );

  // 🔍 DIAGNOSTIC - Résumé de cohérence complet
  useEffect(() => {
    const eligibles = livreurs.filter(l => l.validation === "valide" && l.actif !== false);
    const libres = eligibles.filter(l => isLibre(l)); // 🎯 GPS < 10 min
    const enCourseDB = eligibles.filter(l => l.statut === "en_course");
    const enCourseReelle = eligibles.filter(l => livreurIdsEnCourseReelle.has(l.id));
    const enCourseFantomes = enCourseDB.filter(l => !livreurIdsEnCourseReelle.has(l.id));
    const noirs = eligibles.filter(l => isLivreurNoir(l, livreurIdsEnCourseReelle));

    console.log("🔍 DIAGNOSTIC CARTE COMPLET (RÈGLES UNIFIÉES) :", {
      total_livreurs: eligibles.length,
      libres_gps_recent: libres.length,
      libres_ids: libres.map(l => l.id.slice(-8)),
      en_course_statut_db: enCourseDB.length,
      en_course_reel_calcule: enCourseReelle.length,
      en_course_fantomes: enCourseFantomes.length,
      fantomes_detail: enCourseFantomes.map(l => ({
        id: l.id.slice(-8),
        nom: `${l.prenom} ${l.nom}`,
        statut: l.statut,
        last_seen: l.last_seen_at,
      })),
      noirs_non_dispatchables: noirs.length,
      courses_actives_en_db: coursesVraimentActives.length,
    });

    // 🚨 ALERTE si livreurs "en_course" sans course active
    if (enCourseFantomes.length > 0) {
      console.warn(`⚠️ ${enCourseFantomes.length} livreur(s) "en_course" SANS course active !`);
      console.warn("IDs:", enCourseFantomes.map(l => l.id.slice(-8)));
    }
  }, [livreurs, coursesVraimentActives, livreurIdsEnCourseReelle]);

  // ─── Listes filtrées — basé sur getLivreurCategorie ────────────────────
  const livreursAffiches = useMemo(() => {
    const eligibles = livreurs.filter(l => l.validation === "valide" && l.actif !== false);
    switch (filtreLivreur) {
      case "noirs":       return eligibles.filter(l => ["gps_expire", "hors_ligne"].includes(getLivreurCategorie(l, livreurIdsEnCourseReelle)));
      case "verts":       return eligibles.filter(l => getLivreurCategorie(l, livreurIdsEnCourseReelle) === "libre");
      case "oranges":     return eligibles.filter(l => getLivreurCategorie(l, livreurIdsEnCourseReelle) === "en_course");
      default:            return livreurs;
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

  // Centre de la carte : pays sélectionné > Ouagadougou (BF)
  // ⚠️ Ne PAS dépendre de livreursSurCarte[0] : le tableau est rafraîchi toutes les 5s
  // et son ordre change → centerPosition change → la carte re-zoome.
  // On dépend UNIQUEMENT de paysData (qui ne change qu'au changement de pays).
  const centerPosition = useMemo(() => {
    if (paysData?.latitude_centre) {
      return { latitude: paysData.latitude_centre, longitude: paysData.longitude_centre, zoom: rayonToZoom(paysData.rayon_km) };
    }
    return { latitude: 12.3569, longitude: -1.5353, zoom: 12 };
  }, [paysData]);

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
    { key: "tous",      label: "Tous",           count: compteursLivreurs.total,          dot: "bg-gray-400" },
    { key: "verts",     label: "Libres",         count: compteursLivreurs.libres,         dot: "bg-green-500" },
    { key: "oranges",   label: "En course",      count: compteursLivreurs.oranges,         dot: "bg-orange-500" },
    { key: "noirs",     label: "Hors ligne",     count: compteursLivreurs.noirs,           dot: "bg-gray-700" },
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
            <div className="flex items-center gap-2 flex-wrap">
              {isGlobal && paysActifs.length > 1 && (
                <div className="[&_button]:!bg-white [&_button]:!text-slate-800 [&_button]:!border-slate-300 [&_div]:!bg-white [&_div]:!text-slate-800">
                  <CountrySelector
                    value={effectiveCountry}
                    onChange={setSelectedCountry}
                    className="h-9 text-xs"
                  />
                </div>
              )}
              <button
                onClick={handleCorrectionEnCourse}
                disabled={correctionEnCours}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                <Wrench className="w-3.5 h-3.5" />
                {correctionEnCours ? 'Correction...' : 'Corriger en_course'}
              </button>
            </div>
          </div>

          {/* KPI tiles — 6 compteurs livreurs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
            {[
              { val: compteursLivreurs.libres,           label: "Libres",      sub: "GPS ≤ 60 min",    dot: "bg-green-500",  glow: "shadow-green-500/20",  cat: "libre" },
              { val: compteursLivreurs.gps_expire,        label: "GPS expiré",  sub: "> 60 min",        dot: "bg-gray-500",   glow: "shadow-gray-500/20",   cat: "gps_expire" },
              { val: compteursLivreurs.enCourse,          label: "En course",   sub: "mission active",  dot: "bg-orange-400", glow: "shadow-orange-500/20", cat: "en_course" },
              { val: compteursLivreurs.hors_ligne,        label: "Hors ligne",  sub: "inactifs",        dot: "bg-gray-600",   glow: "shadow-gray-600/20",   cat: "hors_ligne" },
            ].map((item, i) => (
              <button
                key={i}
                onClick={item.cat ? () => {
                  const eligibles = livreurs.filter(l => l.validation === "valide" && l.actif !== false);
                  setCategoryDialog({ category: item.cat, livreurs: eligibles.filter(l => getLivreurCategorie(l, livreurIdsEnCourseReelle) === item.cat) });
                } : undefined}
                className={`bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-3 text-center shadow-lg ${item.glow} ${item.cat ? "hover:bg-white/15 cursor-pointer transition-all" : "cursor-default"}`}
              >
                <div className={`w-2 h-2 rounded-full ${item.dot} mx-auto mb-2`} />
                <p className="text-2xl font-black text-white leading-none">{item.val}</p>
                <p className="text-[10px] font-bold text-white/80 mt-1 leading-tight">{item.label}</p>
                <p className="text-[9px] text-white/60 mt-0.5">{item.sub}</p>
              </button>
            ))}
          </div>
          {/* Operational counters */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { val: compteursClients.bleus,            label: "Clients GPS",  sub: "< 30 min",                    dot: "bg-blue-400" },
              { val: coursesEnAttente.length,            label: "En attente",   sub: `${coursesEnAttenteAvecGPS.length} avec GPS`, dot: "bg-red-400" },
              { val: coursesVraimentActives.length,      label: "En cours",     sub: "livreur assigné",             dot: "bg-orange-400" },
            ].map((item, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/5 rounded-xl p-2.5 text-center">
                <div className={`w-1.5 h-1.5 rounded-full ${item.dot} mx-auto mb-1.5`} />
                <p className="text-lg font-black text-white leading-none">{item.val}</p>
                <p className="text-[9px] font-bold text-white/75 mt-1">{item.label}</p>
                <p className="text-[8px] text-white/55">{item.sub}</p>
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
            <div className="bg-yellow-400 transition-all" style={{ flex: coursesVraimentActives.length + 0.01 }} />
          </div>
        </button>

        {/* ── Légende compacte ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2.5">Légende couleurs</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { dot: "bg-gray-800",   label: "Hors ligne" },
              { dot: "bg-green-500",  label: "Libre (GPS actif)" },
              { dot: "bg-orange-500", label: "En course" },
              { dot: "bg-blue-500",   label: "Client actif" },
              { dot: "bg-red-600",    label: "Course attente" },
              { dot: "bg-yellow-500", label: "Course en cours" },
              { dot: "bg-violet-500", label: "🏪 Boutique" },
              { dot: "bg-pink-500",   label: "🍽️ Restaurant" },
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
                <p className="text-[10px] text-gray-600">{livreursAffiches.length} affiché{livreursAffiches.length > 1 ? "s" : ""} / {compteursLivreurs.total} total</p>
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
              <Truck className="w-10 h-10 mx-auto mb-2 text-gray-500" />
              <p className="text-sm text-gray-600">Aucun livreur dans cette catégorie</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {livreursAffiches.map(livreur => {
                const estNoir   = isLivreurNoir(livreur, livreurIdsEnCourseReelle);
                const estVert   = isLibre(livreur); // 🎯 GPS < 10 min
                // "En mission" = livreur avec course ACTIVE (peu importe le statut DB)
                const estOrange = livreurIdsEnCourseReelle.has(livreur.id);
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
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-600">
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
              <p className="text-[10px] text-gray-600">{compteursClients.bleus} avec GPS récent · {compteursClients.total} total</p>
            </div>
          </div>

          {clientsSurCarte.length === 0 ? (
            <div className="py-12 text-center">
              <MapPin className="w-10 h-10 mx-auto mb-2 text-gray-500" />
              <p className="text-sm text-gray-600">Aucun client enregistré</p>
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
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-600">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{getZone(client)}</span>
                        {getLastGPS(client) && (
                          <span className={`flex items-center gap-1 ${gpsRecent ? "text-teal-500" : "text-gray-600"}`}>
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

      {/* ── Dialog catégorie livreurs ────────────────────────────────────── */}
      {categoryDialog && (
        <LivreurCategoryDialog
          category={categoryDialog.category}
          livreurs={categoryDialog.livreurs}
          onClose={() => setCategoryDialog(null)}
        />
      )}

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
                <button
                  onClick={() => setShowPartenaires(v => !v)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    showPartenaires
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white/10 text-white/70 border-white/20 hover:bg-white/20"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                  🏪 Partenaires
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
                partenaires={partenaires}
                onMarkerClick={(entity) => setSelectedMarker(entity)}
                onCategoryClick={(category) => {
                  const eligibles = livreurs.filter(l => l.validation === "valide" && l.actif !== false);
                  const filtered = category === "hors_ligne" || category === "gps_expire"
                    ? eligibles.filter(l => ["gps_expire", "hors_ligne"].includes(getLivreurCategorie(l, livreurIdsEnCourseReelle)))
                    : eligibles.filter(l => getLivreurCategorie(l, livreurIdsEnCourseReelle) === category);
                  setCategoryDialog({ category, livreurs: filtered });
                }}
                heatmapMode={heatmapMode}
                countryCode={effectiveCountry}
                onCountryChange={isGlobal ? setSelectedCountry : undefined}
                zonesChaudesData={zonesChaudesData}
                masquerInactifs={masquerInactifs}
                showClients={showClients}
                showLivreurs={showLivreurs}
                showPartenaires={showPartenaires}
                livreurIdsEnCourseReelle={livreurIdsEnCourseReelle}
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