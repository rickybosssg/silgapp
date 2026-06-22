import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Truck, Phone, X, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function CoursePersonnelleButton({ livreur }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [telephone, setTelephone] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!telephone.trim()) throw new Error("Le numéro client est obligatoire");

      // Créer la course assignée directement au livreur
      const course = await base44.entities.Course.create({
        reseau: "interne",
        client_telephone: telephone.trim(),
        livreur_id: livreur.id,
        livreur_nom: `${livreur.prenom || ""} ${livreur.nom}`.trim(),
        statut: "acceptee",
        dispatch_mode: "manuel",
        dispatch_status: "assigne_manuel",
        heure_acceptation: new Date().toISOString(),
        notes: "Course personnelle déclarée par le livreur",
      });

      // Passer le livreur en course
      await base44.entities.Livreur.update(livreur.id, { statut: "en_course" });

      // Notifier l'admin via notification
      await base44.entities.Notification.create({
        titre: " Nouvelle course personnelle déclarée",
        message: `Livreur : ${livreur.prenom || ""} ${livreur.nom} | Client : ${telephone.trim()} | Heure : ${new Date().toLocaleTimeString("fr-FR")}`,
        type: "course_assignee",
        course_id: course.id,
      });

      return course;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mes-courses"] });
      queryClient.invalidateQueries({ queryKey: ["livreur-profil"] });
      toast.success(" Course personnelle créée ! Vous êtes maintenant en course.");
      setOpen(false);
      setTelephone("");
    },
    onError: (err) => {
      toast.error(err.message || "Erreur lors de la création");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold border-0"
      >
        <Truck className="w-4 h-4" />
        Course personnelle
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-2xl flex items-center justify-center">
                  <Truck className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <h2 className="font-black text-gray-900 text-base">Course personnelle</h2>
                  <p className="text-xs text-gray-400">Déclarée par vous</p>
                </div>
              </div>
              <button
                onClick={() => { setOpen(false); setTelephone(""); }}
                className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-1 text-gray-400" />
                  Numéro du client <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="Ex: 70 00 00 00"
                  autoFocus
                  className="w-full border-2 border-gray-200 focus:border-yellow-400 rounded-2xl px-4 py-3 text-lg font-semibold outline-none transition-colors"
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3">
                <p className="text-xs text-yellow-700 font-medium">
                   La course sera immédiatement assignée à vous et vous passerez en statut <strong>En course</strong>.
                </p>
              </div>

              <Button
                type="submit"
                disabled={createMutation.isPending || !telephone.trim()}
                className="w-full h-12 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-black text-base gap-2 border-0"
              >
                {createMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                {createMutation.isPending ? "Création..." : "Créer la course"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
