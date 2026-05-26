import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
  ArrowLeft, DollarSign, CheckCircle2, XCircle, Eye, Filter, Phone, Users
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// ─── Filtres disponibles ──────────────────────────────────────────────────────
const FILTRES = [
  { id: "aujourd_hui", label: "Aujourd'hui" },
  { id: "hier", label: "Hier" },
  { id: "semaine", label: "Cette semaine" },
  { id: "impayes", label: "Impayés" },
  { id: "payes", label: "Payés" },
];

function getDateRange(filtreId) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filtreId === "aujourd_hui") {
    return { from: today, to: new Date(today.getTime() + 86400000) };
  }
  if (filtreId === "hier") {
    const hier = new Date(today.getTime() - 86400000);
    return { from: hier, to: today };
  }
  if (filtreId === "semaine") {
    const debut = new Date(today);
    debut.setDate(today.getDate() - today.getDay());
    return { from: debut, to: new Date(debut.getTime() + 7 * 86400000) };
  }
  return null;
}

// ─── Modal détails courses d'un livreur ──────────────────────────────────────
function DetailCoursesModal({ livreurNom, courses, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-bold text-foreground">{livreurNom}</p>
            <p className="text-xs text-muted-foreground">{courses.length} course(s) livrée(s)</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XCircle className="w-5 h-5" />
          </Button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {courses.map(c => (
            <div key={c.id} className="border rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  {c.heure_livraison ? format(new Date(c.heure_livraison), "dd/MM HH:mm", { locale: fr }) : "–"}
                </span>
                <Badge className="bg-green-100 text-green-700 text-xs">Livrée</Badge>
              </div>
              <p className="text-sm font-medium text-foreground">
                {c.adresse_depart || "?"} → {c.adresse_arrivee || "?"}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>📏 {(c.distance_reelle_km ?? 0).toFixed(1)} km</span>
                <span>💰 {(c.prix_final ?? 0).toLocaleString()} F</span>
                <span className="text-orange-600 font-semibold">
                  Dû: {(c.commission_silga ?? 0).toLocaleString()} F
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function DusLivreursExternes() {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState("aujourd_hui");
  const [detailLivreur, setDetailLivreur] = useState(null);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes-livrees"],
    queryFn: () => base44.entities.CourseExterne.filter({ statut: "livree" }, "-heure_livraison", 500),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes-all"],
    queryFn: () => base44.entities.Livreur.filter({ type_livreur: "externe" }, "-created_date", 200),
    initialData: [],
  });

  // ─── Filtrer les courses ─────────────────────────────────────────────────
  const coursesFiltrees = useMemo(() => {
    const dateRange = getDateRange(filtre);
    let result = courses.filter(c => c.statut === "livree" && (c.commission_silga ?? 0) > 0);

    if (dateRange) {
      result = result.filter(c => {
        const d = new Date(c.heure_livraison || c.updated_date);
        return d >= dateRange.from && d < dateRange.to;
      });
    }
    return result;
  }, [courses, filtre]);

  // ─── Agréger par livreur ──────────────────────────────────────────────────
  const recapLivreurs = useMemo(() => {
    const map = {};
    coursesFiltrees.forEach(c => {
      if (!c.livreur_id) return;
      if (!map[c.livreur_id]) {
        const livreurInfo = livreurs.find(l => l.id === c.livreur_id);
        map[c.livreur_id] = {
          id: c.livreur_id,
          nom: c.livreur_nom || livreurInfo?.nom || "Inconnu",
          telephone: c.livreur_telephone || livreurInfo?.telephone || "",
          courses: [],
          montantTotal: 0,
          montantDu: 0,
          paye: false, // on regarde statut_paiement_livreur de la dernière
        };
      }
      map[c.livreur_id].courses.push(c);
      map[c.livreur_id].montantTotal += (c.prix_final ?? 0);
      map[c.livreur_id].montantDu += (c.commission_silga ?? 0);
    });

    // Vérifier si toutes les courses sont payées
    Object.values(map).forEach(entry => {
      entry.paye = entry.courses.every(c => c.statut_paiement_livreur === "paye");
    });

    // Appliquer filtre payé/impayé
    let result = Object.values(map);
    if (filtre === "impayes") result = result.filter(r => !r.paye);
    if (filtre === "payes") result = result.filter(r => r.paye);

    return result.sort((a, b) => b.montantDu - a.montantDu);
  }, [coursesFiltrees, livreurs, filtre]);

  // ─── Mutation marquer payé ─────────────────────────────────────────────────
  const marquerPayeMutation = useMutation({
    mutationFn: async (entry) => {
      const promises = entry.courses
        .filter(c => c.statut_paiement_livreur !== "paye")
        .map(c => base44.entities.CourseExterne.update(c.id, {
          statut_paiement_livreur: "paye"
        }));
      await Promise.all(promises);
      // Réinitialiser le solde du dans le livreur
      const livreurInfo = livreurs.find(l => l.id === entry.id);
      if (livreurInfo) {
        const soldeActuel = livreurInfo.montant_du_silga || 0;
        const nouveauSolde = Math.max(0, soldeActuel - entry.montantDu);
        await base44.functions.invoke("updateLivreur", {
          id: entry.id,
          data: { montant_du_silga: nouveauSolde }
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses-externes-livrees"] });
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes-all"] });
      toast.success("Paiement enregistré !");
    },
    onError: () => toast.error("Erreur lors de l'enregistrement"),
  });

  const totalDu = recapLivreurs.filter(r => !r.paye).reduce((sum, r) => sum + r.montantDu, 0);

  return (
    <div className="px-4 py-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Retour</span>
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Dus livreurs externes</h1>
          <p className="text-xs text-muted-foreground">Commissions 30% dues à SILGAPP</p>
        </div>
      </div>

      {/* Résumé global */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-orange-500 text-white">
          <p className="text-xs opacity-90">Total dû (impayé)</p>
          <p className="text-2xl font-bold mt-1">{totalDu.toLocaleString()} <span className="text-sm font-normal">F</span></p>
        </Card>
        <Card className="p-4 bg-primary text-white">
          <p className="text-xs opacity-90">Livreurs concernés</p>
          <p className="text-2xl font-bold mt-1">{recapLivreurs.length}</p>
        </Card>
        <Card className="p-4 bg-green-600 text-white col-span-2 sm:col-span-1">
          <p className="text-xs opacity-90">Courses livrées</p>
          <p className="text-2xl font-bold mt-1">{coursesFiltrees.length}</p>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {FILTRES.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltre(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filtre === f.id
                ? "bg-primary text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste livreurs */}
      {recapLivreurs.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Aucun résultat</p>
          <p className="text-xs mt-1">Modifiez le filtre ou revenez plus tard.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {recapLivreurs.map(entry => (
            <Card key={entry.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-foreground">{entry.nom}</span>
                    <Badge className={entry.paye ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
                      {entry.paye ? "✅ Payé" : "⏳ Impayé"}
                    </Badge>
                  </div>
                  {entry.telephone && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <Phone className="w-3 h-3" />
                      {entry.telephone}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Courses</p>
                      <p className="font-bold text-foreground">{entry.courses.length}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">CA généré</p>
                      <p className="font-bold text-blue-700 text-sm">{entry.montantTotal.toLocaleString()} F</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Dû Silga</p>
                      <p className="font-bold text-orange-700 text-sm">{entry.montantDu.toLocaleString()} F</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => setDetailLivreur(entry)}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Voir détails
                </Button>
                {!entry.paye && (
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 text-xs bg-green-600 hover:bg-green-700"
                    disabled={marquerPayeMutation.isPending}
                    onClick={() => marquerPayeMutation.mutate(entry)}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Marquer payé
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal détails */}
      {detailLivreur && (
        <DetailCoursesModal
          livreurNom={detailLivreur.nom}
          courses={detailLivreur.courses}
          onClose={() => setDetailLivreur(null)}
        />
      )}
    </div>
  );
}