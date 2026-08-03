import React, { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Truck, Phone, UserPlus, Loader2, MapPin, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUT_LABELS = {
  disponible: "Disponible",
  en_course: "En course",
  hors_ligne: "Hors ligne",
};

const STATUT_COLORS = {
  disponible: "bg-green-100 text-green-700 border-green-200",
  en_course: "bg-blue-100 text-blue-700 border-blue-200",
  hors_ligne: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function ManualAssignLivreurDialog({ course, open, onClose, reseau = "externe" }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: livreurs = [], isLoading } = useQuery({
    queryKey: ["manual-assign-livreurs", course?.country_code],
    queryFn: () => base44.entities.Livreur.filter({
      validation: "valide",
      actif: true,
      ...(course?.country_code ? { country_code: course.country_code } : {}),
    }, "-created_date", 200),
    enabled: open && !!course,
    initialData: [],
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return livreurs;
    const q = search.toLowerCase().trim();
    return livreurs.filter(l => {
      const fullName = `${l.prenom || ""} ${l.nom || ""}`.toLowerCase();
      const phone = (l.telephone || "").toLowerCase();
      return fullName.includes(q) || phone.includes(q);
    });
  }, [livreurs, search]);

  const assignMutation = useMutation({
    mutationFn: async (livreur) => {
      const fresh = await base44.entities.Livreur.get(livreur.id);
      if (fresh?.bloque_encours) {
        throw new Error("Ce livreur est bloqué (encours SILGAPP atteint).");
      }

      const updateData = {
        statut: "livreur_en_route",
        dispatch_status: "accepte",
        livreur_id: fresh.id,
        livreur_nom: `${fresh.prenom || ""} ${fresh.nom || ""}`.trim(),
        livreur_telephone: fresh.telephone || "",
        livreur_vehicule: fresh.vehicule || fresh.type_vehicule || "",
        livreur_photo_url: fresh.photo_url || "",
        livreur_note_moyenne: fresh.note_moyenne || 0,
        livreur_nombre_avis: fresh.nombre_avis || 0,
        heure_acceptation: new Date().toISOString(),
        notes: (course.notes || "") + `\n[Assigné manuellement par admin → ${fresh.prenom || ""} ${fresh.nom || ""}]`,
      };

      if (reseau === "externe") {
        await base44.entities.CourseExterne.update(course.id, updateData);
      } else {
        await base44.entities.Course.update(course.id, {
          ...updateData,
          statut: "en_attente_livreur",
          dispatch_mode: "manuel",
          dispatch_status: "assigne_manuel",
        });
      }

      await base44.entities.Livreur.update(fresh.id, { statut: "en_course" });

      // Notification push au livreur
      if (fresh.user_email) {
        await base44.entities.Notification.create({
          titre: "🚨 Course assignée par admin",
          message: `Course ${course.adresse_depart || ""} → ${course.adresse_arrivee || ""} vous a été assignée manuellement.`,
          type: "course_assignee",
          course_id: course.id,
          destinataire_email: fresh.user_email,
        }).catch(() => null);
      }
    },
    onSuccess: (_data, livreur) => {
      queryClient.invalidateQueries();
      toast.success(`Course assignée à ${livreur.prenom || ""} ${livreur.nom || ""}`);
      onClose();
    },
    onError: (error) => {
      toast.error(error?.message || "Impossible d'assigner ce livreur");
    },
  });

  const sorted = useMemo(() => {
    const order = { disponible: 0, en_course: 1, hors_ligne: 2 };
    return [...filtered].sort((a, b) => {
      const sa = order[a.statut] ?? 3;
      const sb = order[b.statut] ?? 3;
      if (sa !== sb) return sa - sb;
      return (a.nom || "").localeCompare(b.nom || "");
    });
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Assigner manuellement
          </DialogTitle>
        </DialogHeader>

        {course && (
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{course.adresse_depart} → {course.adresse_arrivee}</span>
          </div>
        )}

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou téléphone..."
            className="pl-9 pr-9"
            autoFocus
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Compteur */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} livreur{filtered.length > 1 ? "s" : ""} trouvé{filtered.length > 1 ? "s" : ""}</span>
          {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        </div>

        {/* Liste des livreurs */}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {sorted.length === 0 && !isLoading && (
            <p className="text-center text-muted-foreground text-sm py-8">
              {search ? "Aucun livreur ne correspond à votre recherche" : "Aucun livreur disponible"}
            </p>
          )}
          {sorted.map((livreur) => {
            const statutLabel = STATUT_LABELS[livreur.statut] || livreur.statut;
            const statutColor = STATUT_COLORS[livreur.statut] || STATUT_COLORS.hors_ligne;
            const isBusy = livreur.statut === "en_course";
            const isOffline = livreur.statut === "hors_ligne";

            return (
              <div
                key={livreur.id}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-xl border transition-colors",
                  isBusy ? "bg-blue-50/50 border-blue-100" :
                  isOffline ? "bg-gray-50 border-gray-100" :
                  "bg-white border-gray-100 hover:border-primary/30 hover:bg-primary/5"
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black shrink-0",
                  isBusy ? "bg-blue-200 text-blue-700" :
                  isOffline ? "bg-gray-200 text-gray-500" :
                  "bg-green-200 text-green-700"
                )}>
                  {(livreur.prenom?.[0] || "") + (livreur.nom?.[0] || "")}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {livreur.prenom || ""} {livreur.nom || ""}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    {livreur.telephone && (
                      <span className="flex items-center gap-0.5">
                        <Phone className="w-2.5 h-2.5" />
                        {livreur.telephone}
                      </span>
                    )}
                    {livreur.vehicule && (
                      <span className="flex items-center gap-0.5">
                        <Truck className="w-2.5 h-2.5" />
                        {livreur.vehicule}
                      </span>
                    )}
                  </div>
                </div>

                {/* Badge statut */}
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap",
                  statutColor
                )}>
                  {statutLabel}
                </span>

                {/* Bouton assigner */}
                <Button
                  size="sm"
                  className={cn(
                    "h-8 px-3 text-xs font-bold shrink-0",
                    isBusy || isOffline
                      ? "bg-gray-300 text-gray-500 hover:bg-gray-300"
                      : "bg-primary text-white hover:bg-primary/90"
                  )}
                  disabled={assignMutation.isPending || isBusy}
                  onClick={() => assignMutation.mutate(livreur)}
                >
                  {assignMutation.isPending && assignMutation.variables?.id === livreur.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5 mr-1" />
                      Assigner
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}