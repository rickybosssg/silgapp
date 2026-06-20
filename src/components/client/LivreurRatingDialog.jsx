import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const LABELS = {
  1: " Très insatisfait",
  2: " Insatisfait",
  3: " Satisfait",
  4: " Très satisfait",
  5: " Excellent !",
};

export default function LivreurRatingDialog({ course, onClose, onRated }) {
  const [note, setNote] = useState(0);
  const [hover, setHover] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const prenom = course.livreur_nom
    ? course.livreur_nom.split(" ")[0]
    : "le livreur";

  const handleSubmit = async () => {
    if (note === 0) {
      toast.error("Sélectionnez une note");
      return;
    }
    setLoading(true);
    try {
      // 1. Sauvegarder la note sur la course
      await base44.entities.CourseExterne.update(course.id, {
        note_livreur: note,
        commentaire_livreur: commentaire || null,
        note_date: new Date().toISOString(),
      });

      // 2. Recalculer la moyenne du livreur
      if (course.livreur_id) {
        const toutesLesCourses = await base44.entities.CourseExterne.filter(
          { livreur_id: course.livreur_id, statut: "livree" },
          "-created_date",
          200
        );
        const notees = toutesLesCourses.filter(c => c.note_livreur > 0);
        // Inclure la note actuelle si pas encore enregistrée
        const notesValues = notees.map(c => c.id === course.id ? note : c.note_livreur);
        if (!notees.find(c => c.id === course.id)) notesValues.push(note);

        const moyenne = notesValues.length > 0
          ? notesValues.reduce((a, b) => a + b, 0) / notesValues.length
          : note;

        await base44.entities.Livreur.update(course.livreur_id, {
          note_moyenne: Math.round(moyenne * 10) / 10,
          nombre_avis: notesValues.length,
        });
      }

      setDone(true);
      toast.success("Merci pour votre évaluation !");
      setTimeout(() => onRated?.(), 800);
    } catch (err) {
      toast.error("Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">

        {done ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-xl font-black text-gray-900">Merci !</p>
            <p className="text-sm text-gray-500">Votre avis aide à améliorer le service.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-yellow-400 to-orange-400 p-5 relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              <p className="text-white text-xs font-semibold opacity-90 mb-1">Évaluation</p>
              <p className="text-white font-black text-lg leading-tight">
                Comment s'est passée votre livraison avec {prenom} ?
              </p>
            </div>

            <div className="p-5 space-y-5">
              {/* Photo livreur */}
              <div className="flex items-center gap-3">
                {course.livreur_photo_url ? (
                  <img
                    src={course.livreur_photo_url}
                    alt={prenom}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-yellow-200 shadow-md"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-100 to-orange-100 flex items-center justify-center">
                    <span className="text-2xl font-black text-orange-600">
                      {prenom.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-bold text-gray-900">{prenom}</p>
                  <p className="text-xs text-gray-400">
                    Course du {new Date(course.heure_livraison || course.created_date).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>

              {/* Étoiles */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHover(star)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setNote(star)}
                      className="transition-transform active:scale-90"
                    >
                      <Star
                        className={`w-11 h-11 transition-all duration-150 ${
                          star <= (hover || note)
                            ? "fill-yellow-400 text-yellow-400 scale-110"
                            : "fill-gray-100 text-gray-200"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {note > 0 && (
                  <p className="text-sm font-semibold text-orange-600">{LABELS[note]}</p>
                )}
              </div>

              {/* Commentaire */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block">
                  Commentaire (optionnel)
                </label>
                <Textarea
                  placeholder="Partagez votre expérience..."
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  rows={3}
                  className="resize-none rounded-xl text-sm"
                />
              </div>

              {/* Boutons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={onClose}
                  disabled={loading}
                >
                  Plus tard
                </Button>
                <Button
                  className="flex-1 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 font-bold"
                  onClick={handleSubmit}
                  disabled={loading || note === 0}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Star className="w-4 h-4 mr-1.5 fill-white" />
                      Envoyer l'avis
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}