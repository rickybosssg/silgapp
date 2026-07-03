import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, X, CheckCircle2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "experience_globale", label: "Expérience globale" },
  { value: "qualite_livraison", label: "Qualité de livraison" },
  { value: "vitesse_service", label: "Vitesse du service" },
  { value: "application", label: "L'application" },
  { value: "support", label: "Support client" },
  { value: "autre", label: "Autre" },
];

const LABELS = {
  1: "😞 Très insatisfait",
  2: "😕 Insatisfait",
  3: "😐 Neutre",
  4: "😊 Satisfait",
  5: "🌟 Excellent !",
};

export default function FeedbackModal({ clientProfil, onClose }) {
  const [note, setNote] = useState(0);
  const [hover, setHover] = useState(0);
  const [categorie, setCategorie] = useState("experience_globale");
  const [commentaire, setCommentaire] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (note === 0) {
      toast.error("Sélectionnez une note");
      return;
    }
    setLoading(true);
    try {
      await base44.entities.Feedback.create({
        user_email: clientProfil?.user_email || null,
        user_type: "client",
        user_id: clientProfil?.id || null,
        user_nom: clientProfil?.nom || null,
        note,
        categorie,
        commentaire: commentaire || null,
        country_code: clientProfil?.country_code || "BF",
        statut: "nouveau",
      });
      setDone(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      toast.error("Erreur: " + (err?.message || ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg">Merci !</h3>
            <p className="text-sm text-gray-500 mt-2">Votre feedback nous aide à améliorer SILGAPP.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Votre avis</h3>
                  <p className="text-xs text-gray-500">Aidez-nous à améliorer SILGAPP</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Étoiles */}
            <div className="text-center py-2">
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setNote(n)}
                    className="transition-transform active:scale-90"
                  >
                    <Star
                      className={"w-9 h-9 " + ((hover || note) >= n ? "fill-amber-400 text-amber-400" : "text-gray-300")}
                    />
                  </button>
                ))}
              </div>
              {note > 0 && (
                <p className="text-sm font-medium text-gray-600 mt-2">{LABELS[note]}</p>
              )}
            </div>

            {/* Catégorie */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Sujet</label>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategorie(c.value)}
                    className={"text-xs font-medium px-3 py-2 rounded-lg border transition-all " +
                      (categorie === c.value
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300")}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Commentaire */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Commentaire (optionnel)</label>
              <Textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Dites-nous en plus..."
                rows={3}
                className="resize-none text-sm"
                maxLength={500}
              />
              <p className="text-[10px] text-gray-400 mt-1 text-right">{commentaire.length}/500</p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={loading || note === 0}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-sm disabled:opacity-50"
            >
              {loading ? "Envoi..." : "Envoyer mon avis"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}