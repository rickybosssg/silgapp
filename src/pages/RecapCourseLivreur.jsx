import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatHeure(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function dureeMinutes(debut, fin) {
  if (!debut || !fin) return null;
  const diff = Math.round((new Date(fin) - new Date(debut)) / 60000);
  if (diff <= 0) return null;
  if (diff >= 60) return `${Math.floor(diff / 60)}h${diff % 60 > 0 ? String(diff % 60).padStart(2, "0") : ""}`;
  return `${diff} min`;
}

const TYPE_COLIS_LABELS = {
  petit_colis: "Petit colis",
  moyen_colis: "Moyen colis",
  gros_colis: "Gros colis",
  document: "Document",
  nourriture: "Nourriture",
  autre: "Autre",
};

export default function RecapCourseLivreur() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const chargerCourse = async () => {
    try {
      const results = await base44.entities.CourseExterne.filter({ id: courseId });
      const c = Array.isArray(results) ? results[0] : results;
      if (!c) {
        setError("Course introuvable.");
        setLoading(false);
        return;
      }
      setCourse(c);
      setLoading(false);
    } catch (err) {
      setError("Erreur de chargement : " + err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    chargerCourse();
  }, [courseId]);

  const handleTerminer = async () => {
    try {
      await base44.entities.CourseExterne.update(courseId, { recap_livreur_vu: true });
    } catch (_) {}
    // Retourner au dashboard livreur (reload propre)
    navigate("/", { replace: true });
    setTimeout(() => window.location.reload(), 100);
  };

  // ── Affichage chargement ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Chargement du récapitulatif...</p>
        </div>
      </div>
    );
  }

  // ── Erreur fatale ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center space-y-4 max-w-sm">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="text-base font-bold text-gray-900">{error}</p>
          <button
            className="h-12 px-6 rounded-2xl bg-primary text-white font-bold"
            onClick={() => navigate("/", { replace: true })}
          >
            Retourner au dashboard
          </button>
        </div>
      </div>
    );
  }



  // ── Calcul avec fallbacks (données parfois manquantes) ──────────────────
  const dist = Number(course.distance_reelle_km) > 0 
    ? Number(course.distance_reelle_km)
    : (course.gps_depart_lat && course.gps_arrivee_lat 
        ? haversine(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng) 
        : 0);

  // Prix manuel accepté → priorité absolue
  const isPrixManuel = course.pricing_mode === "manual" && course.manual_price_status === "accepted" && Number(course.manual_price) > 0;

  const prixBrut = isPrixManuel
    ? Number(course.manual_price)
    : (Number(course.prix_final) > 0 ? Number(course.prix_final) : (dist > 0 ? Math.round(dist * 100) : 0));
  const prixFinal = Math.max(1000, prixBrut);
  const gainLivreur = Number(course.montant_livreur) > 0 ? Number(course.montant_livreur) : Math.round(prixFinal * 0.7);
  const commissionSilga = Number(course.commission_silga) > 0 ? Number(course.commission_silga) : Math.round(prixFinal * 0.3);
  const duree = dureeMinutes(course.heure_recuperation, course.heure_livraison);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* ── HEADER ── */}
      <div className="bg-gray-900 px-5 pt-10 pb-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/40">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">COURSE TERMINÉE</h1>
        <p className="text-green-400 font-semibold mt-1 text-sm">Livraison confirmée avec succès</p>
      </div>

      {/* ── CONTENU ── */}
      <div className="flex-1 px-4 py-6 space-y-4 max-w-lg mx-auto w-full">

        {(!course.prix_final && !course.manual_price) && (
          <div className="bg-amber-900/40 border border-amber-500/40 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-amber-300 text-sm font-medium">Données de prix non disponibles</p>
              <p className="text-amber-400/70 text-xs mt-0.5">Cela peut arriver si la course n'a pas été finalisée correctement.</p>
            </div>
            <button
              onClick={chargerCourse}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer
            </button>
          </div>
        )}

        {/* PRIX DE LA COURSE */}
        <div className="bg-gray-900 rounded-3xl p-6 text-center space-y-3 border border-gray-800">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Prix de la course</p>

          {isPrixManuel ? (
            <div className="space-y-1">
              <p className="text-green-400 text-xs font-semibold uppercase tracking-wide">Prix convenu avec le client</p>
              <p className="text-gray-400 text-sm">Proposition acceptée par le client</p>
            </div>
          ) : (
            <>
              {dist > 0 ? (
                <>
                  <div className="space-y-1">
                    <p className="text-gray-400 text-sm">Distance réelle</p>
                    <p className="text-white text-2xl font-black">{dist.toFixed(2)} km</p>
                  </div>
                  <div className="text-gray-500 text-sm">
                    {prixBrut < 1000
                      ? <span className="text-amber-400 font-semibold">Prix minimum SILGAPP appliqué</span>
                      : `Calcul : ${dist.toFixed(2)} km × 100 F`
                    }
                  </div>
                </>
              ) : (
                <p className="text-gray-500 text-sm">Distance non disponible</p>
              )}
            </>
          )}

          <div className="border-t border-gray-700 pt-3">
            <p className="text-gray-400 text-xs mb-1">Montant final</p>
            <p className="text-5xl font-black text-white">{prixFinal.toLocaleString()}</p>
            <p className="text-gray-400 text-lg font-semibold">FCFA</p>
          </div>
        </div>

        {/* RÉPARTITION */}
        <div className="bg-gray-900 rounded-3xl p-5 border border-gray-800 space-y-3">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Répartition</p>
          <div className="flex items-center justify-between py-2 border-b border-gray-800">
            <div>
              <p className="text-green-400 font-bold text-sm">Ton gain (70%)</p>
              <p className="text-gray-500 text-xs">À encaisser auprès du client</p>
            </div>
            <p className="text-green-400 text-2xl font-black">+{gainLivreur.toLocaleString()} F</p>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-red-400 font-bold text-sm">Commission Silga (30%)</p>
              <p className="text-gray-500 text-xs">À reverser à Silga</p>
            </div>
            <p className="text-red-400 text-xl font-black">{commissionSilga.toLocaleString()} F</p>
          </div>
        </div>

        {/* DÉTAILS DE LA COURSE */}
        <div className="bg-gray-900 rounded-3xl p-5 border border-gray-800 space-y-3">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Détails</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-2xl p-3 text-center">
              <p className="text-gray-500 text-[10px] uppercase mb-1">Récupération</p>
              <p className="text-white font-bold">{formatHeure(course.heure_recuperation)}</p>
            </div>
            <div className="bg-gray-800 rounded-2xl p-3 text-center">
              <p className="text-gray-500 text-[10px] uppercase mb-1">Livraison</p>
              <p className="text-white font-bold">{formatHeure(course.heure_livraison)}</p>
            </div>
          </div>

          {duree && (
            <div className="bg-gray-800 rounded-2xl p-3 text-center">
              <p className="text-gray-500 text-[10px] uppercase mb-1">Durée totale</p>
              <p className="text-white font-bold">{duree}</p>
            </div>
          )}

          {course.type_colis && (
            <div className="flex items-center justify-between px-1">
              <p className="text-gray-500 text-sm">Type de colis</p>
              <p className="text-white font-semibold text-sm">{TYPE_COLIS_LABELS[course.type_colis] || course.type_colis}</p>
            </div>
          )}

          {course.adresse_depart && (
            <div className="flex items-start justify-between px-1 gap-3">
              <p className="text-gray-500 text-sm flex-shrink-0">Départ</p>
              <p className="text-white font-semibold text-sm text-right">{course.adresse_depart}</p>
            </div>
          )}

          {course.adresse_arrivee && (
            <div className="flex items-start justify-between px-1 gap-3">
              <p className="text-gray-500 text-sm flex-shrink-0">Arrivée</p>
              <p className="text-white font-semibold text-sm text-right">{course.adresse_arrivee}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── BOUTON TERMINER ── */}
      <div className="px-4 pb-10 pt-2 max-w-lg mx-auto w-full">
        <button
          onClick={handleTerminer}
          className="w-full h-16 rounded-3xl bg-gradient-to-b from-green-500 to-green-700 text-white font-black text-lg shadow-xl shadow-green-900/40 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        >
          <CheckCircle2 className="w-6 h-6" />
          Terminer et retourner au dashboard
        </button>
      </div>
    </div>
  );
}