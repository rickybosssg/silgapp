import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";

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
  const [retries, setRetries] = useState(0);

  const chargerCourse = async () => {
    try {
      const results = await base44.entities.CourseExterne.filter({ id: courseId });
      const c = Array.isArray(results) ? results[0] : results;
      if (!c) {
        setError("Course introuvable.");
        setLoading(false);
        return;
      }
      // Si les données financières ne sont pas encore prêtes, recharger dans 2s
      if (!c.prix_final || !c.distance_reelle_km) {
        setCourse(c);
        setLoading(false);
        if (retries < 8) {
          setTimeout(() => setRetries(r => r + 1), 2000);
        }
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
    setLoading(true);
    chargerCourse();
  }, [courseId, retries]);

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

  // ── Données manquantes GPS ──────────────────────────────────────────────
  const gpsManquant = !course.latitude_recuperation || !course.latitude_livraison;
  if (gpsManquant) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center space-y-4 max-w-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <p className="text-base font-bold text-gray-900">Données GPS manquantes</p>
          <p className="text-sm text-gray-500">
            Les coordonnées GPS de récupération ou de livraison sont absentes. Le prix ne peut pas être calculé.
          </p>
          <button
            className="h-12 px-6 rounded-2xl bg-primary text-white font-bold"
            onClick={handleTerminer}
          >
            Retourner au dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Calcul en cours (données financières pas encore dispo) ──────────────
  const donneesEnCours = !course.prix_final || !course.distance_reelle_km;

  const dist = Number(course.distance_reelle_km || 0);
  const prixFinal = Number(course.prix_final || Math.round(dist * 100));
  const gainLivreur = Number(course.montant_livreur || Math.round(prixFinal * 0.7));
  const commissionSilga = Number(course.commission_silga || Math.round(prixFinal * 0.3));
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

        {donneesEnCours && (
          <div className="bg-amber-900/40 border border-amber-500/40 rounded-2xl p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin flex-shrink-0" />
            <p className="text-amber-300 text-sm font-medium">Calcul du prix en cours… rechargement automatique.</p>
          </div>
        )}

        {/* PRIX DE LA COURSE */}
        <div className="bg-gray-900 rounded-3xl p-6 text-center space-y-3 border border-gray-800">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Prix de la course</p>

          <div className="space-y-1">
            <p className="text-gray-400 text-sm">Distance réelle</p>
            <p className="text-white text-2xl font-black">{dist.toFixed(2)} km</p>
          </div>

          <div className="text-gray-500 text-sm">
            Calcul : {dist.toFixed(2)} km × 100 F
          </div>

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