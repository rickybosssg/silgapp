import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, X } from "lucide-react";
import { toast } from "sonner";

export default function LivreurRatingDialog({ course, onClose, onRated }) {
  const [note, setNote] = useState(0);
  const [hoverNote, setHoverNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (note === 0) {
      toast.error("Veuillez sélectionner une note");
      return;
    }

    setLoading(true);

    try {
      await base44.entities.CourseExterne.update(course.id, {
        note_livreur: note,
        commentaire_livreur: commentaire,
        note_date: new Date().toISOString(),
      });

      toast.success("Merci pour votre évaluation !");
      onRated?.();
    } catch (err) {
      console.error("Erreur notation:", err);
      toast.error("Erreur lors de l'envoi de votre évaluation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">Évaluez votre livreur</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Info livreur */}
        <div className="flex items-center gap-3 mb-6 p-3 bg-gray-50 rounded-xl">
          {course.livreur_photo_url ? (
            <img
              src={course.livreur_photo_url}
              alt={course.livreur_nom}
              className="w-12 h-12 rounded-full object-cover border-2 border-primary"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Star className="w-6 h-6 text-primary" />
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground">{course.livreur_nom}</p>
            <p className="text-xs text-muted-foreground">
              Course du {new Date(course.heure_livraison || course.created_date).toLocaleDateString("fr-FR")}
            </p>
          </div>
        </div>

        {/* Étoiles */}
        <div className="mb-4">
          <Label className="text-sm font-semibold mb-2 block">Votre note</Label>
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="transition-transform hover:scale-110 active:scale-95"
                onMouseEnter={() => setHoverNote(star)}
                onMouseLeave={() => setHoverNote(0)}
                onClick={() => setNote(star)}
              >
                <Star
                  className={`w-10 h-10 transition-all ${
                    star <= (hoverNote || note)
                      ? "fill-yellow-400 text-yellow-400"
                      : "fill-gray-200 text-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>
          {note > 0 && (
            <p className="text-center text-sm font-medium text-primary mt-2">
              {note === 1 && "😞 Très insatisfait"}
              {note === 2 && "😕 Insatisfait"}
              {note === 3 && "😐 Satisfait"}
              {note === 4 && "😊 Très satisfait"}
              {note === 5 && "🌟 Excellent !"}
            </p>
          )}
        </div>

        {/* Commentaire */}
        <div className="mb-6">
          <Label htmlFor="commentaire" className="text-sm font-semibold mb-2 block">
            Commentaire (optionnel)
          </Label>
          <Textarea
            id="commentaire"
            placeholder="Partagez votre expérience avec ce livreur..."
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Plus tard
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={loading || note === 0}
          >
            {loading ? "Envoi..." : "Envoyer"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-3">
          Votre évaluation aide à améliorer la qualité du service
        </p>
      </Card>
    </div>
  );
}