import React from "react";
import { Star, MessageSquare, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function StarRow({ note, max = 5 }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i < Math.round(note)
              ? "fill-yellow-400 text-yellow-400"
              : "fill-gray-200 text-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

export default function NotationLivreurPanel({ livreur, courses }) {
  const coursesNotees = courses.filter(
    (c) => c.statut === "livree" && c.note_livreur > 0
  );

  const noteMoyenne = livreur.note_moyenne || 0;
  const nombreAvis = livreur.nombre_avis || coursesNotees.length;

  // Répartition par étoile
  const repartition = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: coursesNotees.filter((c) => c.note_livreur === star).length,
  }));

  // Derniers commentaires
  const commentaires = coursesNotees
    .filter((c) => c.commentaire_livreur)
    .sort((a, b) => new Date(b.note_date || b.updated_date) - new Date(a.note_date || a.updated_date))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Score global */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-4">
        <div className="flex items-start gap-4">
          <div className="text-center">
            <p className="text-4xl font-black text-gray-900">
              {noteMoyenne > 0 ? noteMoyenne.toFixed(1) : "—"}
            </p>
            <StarRow note={noteMoyenne} />
            <p className="text-xs text-gray-500 mt-1">{nombreAvis} avis</p>
          </div>

          <div className="flex-1 space-y-1.5">
            {repartition.map(({ star, count }) => {
              const pct = nombreAvis > 0 ? Math.round((count / nombreAvis) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-4">{star}</span>
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Derniers commentaires */}
      {commentaires.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            Derniers commentaires
          </p>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {commentaires.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <StarRow note={c.note_livreur} />
                  <span className="text-[10px] text-gray-400">
                    {c.note_date
                      ? format(new Date(c.note_date), "dd MMM yyyy", { locale: fr })
                      : ""}
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">
                  "{c.commentaire_livreur}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {nombreAvis === 0 && (
        <div className="text-center py-6 text-gray-400">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Aucune évaluation pour l'instant</p>
        </div>
      )}
    </div>
  );
}