import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Phone, User, MapPin, Camera, FileText } from "lucide-react";
import { toast } from "sonner";

export default function DemandesLivreursAdmin() {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(null); // id en cours de traitement

  const { data: demandes, isLoading } = useQuery({
    queryKey: ["demandes_livreurs"],
    queryFn: () => base44.entities.Livreur.filter({ validation: "en_attente", type_livreur: "externe" }, "-created_date"),
    refetchInterval: 30000,
  });

  const handleValider = async (livreur) => {
    setProcessing(livreur.id);
    try {
      await base44.entities.Livreur.update(livreur.id, {
        validation: "valide",
        actif: true,
        statut: "hors_ligne",
      });
      toast.success(`${livreur.prenom || ""} ${livreur.nom} validé avec succès`);
      queryClient.invalidateQueries({ queryKey: ["demandes_livreurs"] });
    } catch (err) {
      toast.error(err?.message || "Erreur de validation");
    } finally {
      setProcessing(null);
    }
  };

  const handleRefuser = async (livreur) => {
    if (!confirm(`Refuser ${livreur.prenom || ""} ${livreur.nom} ?`)) return;
    setProcessing(livreur.id);
    try {
      await base44.entities.Livreur.update(livreur.id, {
        validation: "refuse",
        actif: false,
      });
      toast.success(`${livreur.prenom || ""} ${livreur.nom} refusé`);
      queryClient.invalidateQueries({ queryKey: ["demandes_livreurs"] });
    } catch (err) {
      toast.error(err?.message || "Erreur de refus");
    } finally {
      setProcessing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-foreground">Demandes livreurs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {demandes?.length || 0} demande{(demandes?.length || 0) !== 1 ? "s" : ""} en attente
          </p>
        </div>
        <Badge className="bg-secondary text-secondary-foreground px-3 py-1.5 text-sm font-bold">
          {demandes?.length || 0} en attente
        </Badge>
      </div>

      {!demandes || demandes.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-accent" />
          </div>
          <p className="text-lg font-bold text-foreground">Aucune demande en attente</p>
          <p className="text-sm text-muted-foreground mt-1">Toutes les demandes ont été traitées.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {demandes.map((livreur) => (
            <Card key={livreur.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      {livreur.photo_url ? (
                        <img src={livreur.photo_url} alt="" className="w-14 h-14 rounded-2xl object-cover" />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <User className="w-7 h-7 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="font-black text-lg text-foreground">
                          {livreur.prenom || ""} {livreur.nom}
                        </p>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                          <Phone className="w-3.5 h-3.5" /> {livreur.telephone || "N/A"}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                          <MapPin className="w-3.5 h-3.5" /> {livreur.ville || ""} - {livreur.quartier || "N/A"}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-secondary/10 text-secondary border-secondary/20">
                      {livreur.country_code || "BF"}
                    </Badge>
                  </div>

                  {/* Documents */}
                  <div className="grid grid-cols-2 gap-3">
                    {livreur.photo_cnib_recto_url && (
                      <a href={livreur.photo_cnib_recto_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700">CNIB Recto</span>
                      </a>
                    )}
                    {livreur.photo_cnib_verso_url && (
                      <a href={livreur.photo_cnib_verso_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors">
                        <FileText className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-semibold text-purple-700">CNIB Verso</span>
                      </a>
                    )}
                  </div>

                  {/* Date */}
                  <p className="text-xs text-muted-foreground">
                    Demande du {new Date(livreur.created_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button
                      onClick={() => handleValider(livreur)}
                      disabled={processing === livreur.id}
                      className="h-12 rounded-xl bg-gradient-to-r from-accent to-green-600 text-white font-bold shadow-sm"
                    >
                      {processing === livreur.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <><CheckCircle className="w-4 h-4" /> Valider</>
                      )}
                    </Button>
                    <Button
                      onClick={() => handleRefuser(livreur)}
                      disabled={processing === livreur.id}
                      variant="outline"
                      className="h-12 rounded-xl border-destructive/20 text-destructive font-bold hover:bg-destructive/5"
                    >
                      {processing === livreur.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <><XCircle className="w-4 h-4" /> Refuser</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}