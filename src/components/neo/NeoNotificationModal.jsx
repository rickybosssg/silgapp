import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NeoNotificationModal() {
  const [newRecs, setNewRecs] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (dismissed) return;
    const fetchNew = async () => {
      try {
        const recs = await base44.entities.NeoRecommendation.filter({ statut: "nouvelle" }, "-created_date", 10);
        setNewRecs(recs || []);
      } catch (_) {}
    };
    // Vérifier si déjà dismissed dans cette session
    try {
      if (sessionStorage.getItem("neo_modal_dismissed") === "true") {
        setDismissed(true);
        return;
      }
    } catch (_) {}
    fetchNew();
  }, [dismissed]);

  const handleDismiss = () => {
    try { sessionStorage.setItem("neo_modal_dismissed", "true"); } catch (_) {}
    setDismissed(true);
  };

  const handleGoToNeo = () => {
    handleDismiss();
    navigate("/admin/neo");
  };

  if (dismissed || newRecs.length === 0) return null;

  const hasCritique = newRecs.some(r => r.priorite === "critique");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleDismiss} />
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`p-5 ${hasCritique ? "bg-gradient-to-br from-red-600 to-rose-700" : "bg-gradient-to-br from-slate-900 to-slate-800"}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-black text-lg">NEO</h3>
                <p className="text-white/60 text-xs">Moteur d'amélioration SILGAPP</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-white/90 text-sm mt-3">
            {hasCritique ? "🔴 NEO a détecté des recommandations critiques" : `${newRecs.length} nouvelle(s) recommandation(s)`}
          </p>
        </div>

        {/* Liste courte */}
        <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
          {newRecs.slice(0, 5).map(rec => (
            <div key={rec.id} className="flex items-start gap-2 p-2 rounded-xl bg-gray-50">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                rec.priorite === "critique" ? "bg-red-500" :
                rec.priorite === "elevee" ? "bg-orange-500" :
                rec.priorite === "moyenne" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900 truncate">{rec.titre}</p>
                <p className="text-[10px] text-gray-500 truncate">{rec.categorie}</p>
              </div>
            </div>
          ))}
          {newRecs.length > 5 && (
            <p className="text-center text-xs text-gray-400 pt-1">+{newRecs.length - 5} autre(s)</p>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleGoToNeo}
            className="w-full h-11 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
          >
            Consulter NEO <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}