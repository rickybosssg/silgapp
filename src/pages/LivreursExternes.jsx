import React, { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, UserCheck, UserX, Phone, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function LivreursExternes() {
  const queryClient = useQueryClient();
  
  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes"],
    queryFn: () => base44.entities.Livreur.filter({ reseau: "externe" }, "-created_date"),
    initialData: [],
    refetchInterval: 15000,
  });

  const stats = useMemo(() => {
    return {
      total: livreurs.length,
      disponible: livreurs.filter(l => l.statut === "disponible").length,
      enCourse: livreurs.filter(l => l.statut === "en_course").length,
      horsLigne: livreurs.filter(l => l.statut === "hors_ligne").length,
      valide: livreurs.filter(l => l.validation === "valide").length,
      enAttente: livreurs.filter(l => l.validation === "en_attente").length,
    };
  }, [livreurs]);

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Livreurs Externes</h1>
          <p className="text-sm text-muted-foreground">{stats.total} livreurs externes inscrits</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total" value={stats.total} color="bg-primary" />
        <StatCard label="Validés" value={stats.valide} color="bg-green-500" />
        <StatCard label="En attente" value={stats.enAttente} color="bg-orange-500" />
        <StatCard label="Disponibles" value={stats.disponible} color="bg-blue-500" />
        <StatCard label="En course" value={stats.enCourse} color="bg-purple-500" />
        <StatCard label="Hors ligne" value={stats.horsLigne} color="bg-gray-500" />
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Liste des livreurs externes</h2>
        </div>

        {livreurs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aucun livreur externe inscrit</p>
          </div>
        ) : (
          <div className="space-y-2">
            {livreurs.map(livreur => (
              <LivreurCard key={livreur.id} livreur={livreur} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function LivreurCard({ livreur }) {
  const queryClient = useQueryClient();
  
  const validationMutation = useMutation({
    mutationFn: ({ id, validation }) => base44.entities.Livreur.update(id, { validation }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes"] });
      toast.success("Statut mis à jour");
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const nomComplet = `${livreur.prenom || ""} ${livreur.nom}`.trim();

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-accent">
            {nomComplet.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold truncate">{nomComplet}</span>
            <Badge variant={livreur.validation === "valide" ? "default" : "secondary"} className="text-xs">
              {livreur.validation === "valide" ? "Validé" : "En attente"}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {livreur.statut}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />{livreur.telephone}
            </span>
            {livreur.user_email && (
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />{livreur.user_email}
              </span>
            )}
            <span>• {livreur.quartier}</span>
            <span>• {livreur.vehicule}</span>
          </div>
        </div>
      </div>
      
      {livreur.validation === "en_attente" && (
        <div className="flex gap-2 ml-4">
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => validationMutation.mutate({ id: livreur.id, validation: "valide" })}
            disabled={validationMutation.isPending}
          >
            <UserCheck className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => validationMutation.mutate({ id: livreur.id, validation: "refuse" })}
            disabled={validationMutation.isPending}
          >
            <UserX className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <Card className={`p-4 ${color} text-white`}>
      <p className="text-xs opacity-90">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}