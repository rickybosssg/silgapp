import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
  ArrowLeft, DollarSign, CheckCircle2, XCircle, Eye, Phone,
  Banknote, Ban, RefreshCw, TrendingUp, AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// ── Statut financier ─────────────────────────────────────────────────────────
function statutFinancier(montantDu, montantPaye) {
  if (montantDu <= 0) return { label: "Payé", color: "bg-green-100 text-green-700" };
  if (montantPaye > 0) return { label: "Partiellement payé", color: "bg-amber-100 text-amber-700" };
  return { label: "Impayé", color: "bg-red-100 text-red-700" };
}

// ── Filtres disponibles ───────────────────────────────────────────────────────
const FILTRES = [
  { id: "aujourd_hui", label: "Aujourd'hui" },
  { id: "hier", label: "Hier" },
  { id: "semaine", label: "Cette semaine" },
  { id: "mois", label: "Ce mois" },
  { id: "impayes", label: "Impayés" },
  { id: "partiels", label: "Partiels" },
  { id: "payes", label: "Payés" },
];

function getDateRange(filtreId) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Clôture à 20h00
  const cutoff = new Date(today); cutoff.setHours(20, 0, 0, 0);

  if (filtreId === "aujourd_hui") {
    const startYesterday = new Date(today.getTime() - 86400000); startYesterday.setHours(20, 0, 0, 0);
    return { from: now < cutoff ? startYesterday : cutoff, to: now < cutoff ? cutoff : new Date(cutoff.getTime() + 86400000) };
  }
  if (filtreId === "hier") {
    const hierDebut = new Date(today.getTime() - 2 * 86400000); hierDebut.setHours(20, 0, 0, 0);
    const hierFin = new Date(today.getTime() - 86400000); hierFin.setHours(20, 0, 0, 0);
    return { from: hierDebut, to: hierFin };
  }
  if (filtreId === "semaine") {
    const debut = new Date(today); debut.setDate(today.getDate() - 7);
    return { from: debut, to: now };
  }
  if (filtreId === "mois") {
    const debut = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: debut, to: now };
  }
  return null;
}

// ── Modal détails + paiement ──────────────────────────────────────────────────
function DetailPaiementModal({ entry, livreurInfo, onClose, onPaiement, onBloquer, onDebloquer, isPending }) {
  const [montantSaisi, setMontantSaisi] = useState("");
  const sf = statutFinancier(entry.montantDu, entry.montantPaye);
  const isBloque = livreurInfo?.actif === false;

  const handleValiderPaiement = () => {
    const montant = Number(montantSaisi);
    if (!montant || montant <= 0) { toast.error("Entrez un montant valide"); return; }
    if (montant > entry.montantDu) { toast.error(`Le montant dépasse le dû (${entry.montantDu.toLocaleString()} F)`); return; }
    onPaiement(entry, montant);
    setMontantSaisi("");
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-bold text-foreground text-lg">{entry.nom}</p>
            {entry.telephone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{entry.telephone}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Récapitulatif financier */}
          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-4 space-y-2 border border-orange-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-foreground">Situation financière</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sf.color}`}>{sf.label}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Courses ({entry.courses.length})</span>
              <span className="font-semibold">{entry.montantTotal.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Commission Silga 30%</span>
              <span className="font-semibold text-orange-600">{entry.commissionTotal.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Déjà payé</span>
              <span className="font-semibold text-green-600">{entry.montantPaye.toLocaleString()} FCFA</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span>Reste dû à Silga</span>
              <span className={entry.montantDu > 0 ? "text-red-600 text-base" : "text-green-600"}>
                {entry.montantDu.toLocaleString()} FCFA
              </span>
            </div>
          </div>

          {/* Enregistrer paiement */}
          {entry.montantDu > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold text-foreground">Enregistrer un paiement</p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="number"
                    placeholder={`Max : ${entry.montantDu.toLocaleString()} F`}
                    value={montantSaisi}
                    onChange={e => setMontantSaisi(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <Button
                  className="gap-1.5 bg-green-600 hover:bg-green-700 shrink-0"
                  onClick={handleValiderPaiement}
                  disabled={isPending || !montantSaisi}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Valider
                </Button>
              </div>
              <div className="flex gap-2">
                <button
                  className="text-xs text-primary underline"
                  onClick={() => setMontantSaisi(String(entry.montantDu))}
                >
                  Tout payer ({entry.montantDu.toLocaleString()} F)
                </button>
              </div>
            </div>
          )}

          {/* Liste des courses */}
          <div>
            <p className="text-sm font-bold text-foreground mb-2">Courses concernées</p>
            <div className="space-y-2">
              {entry.courses.map(c => (
                <div key={c.id} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">
                      {c.heure_livraison ? format(new Date(c.heure_livraison), "dd/MM HH:mm", { locale: fr }) : "–"}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      c.statut_paiement_livreur === "paye" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                    }`}>
                      {c.statut_paiement_livreur === "paye" ? "Payée" : "Impayée"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">
                    {c.adresse_depart} → {c.adresse_arrivee || "?"}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                    {c.distance_reelle_km != null && <span>📏 {Number(c.distance_reelle_km).toFixed(1)} km</span>}
                    {c.prix_final != null && <span>💰 {c.prix_final.toLocaleString()} F</span>}
                    {c.montant_livreur != null && <span className="text-green-600">Livreur: {c.montant_livreur.toLocaleString()} F (70%)</span>}
                    {c.commission_silga != null && <span className="text-orange-600 font-semibold">Silga: {c.commission_silga.toLocaleString()} F (30%)</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bloquer / Débloquer */}
        <div className="p-4 border-t">
          {isBloque ? (
            <Button className="w-full bg-green-600 hover:bg-green-700 gap-2" onClick={onDebloquer}>
              <CheckCircle2 className="w-4 h-4" /> Débloquer le livreur
            </Button>
          ) : (
            <Button variant="destructive" className="w-full gap-2" onClick={onBloquer}>
              <Ban className="w-4 h-4" /> Bloquer le livreur
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function DusLivreursExternes() {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState("aujourd_hui");
  const [detailEntry, setDetailEntry] = useState(null);

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
    refetchInterval: 15000,
  });

  // ── Filtrer les courses ─────────────────────────────────────────────────────
  const coursesFiltrees = useMemo(() => {
    const dateRange = getDateRange(filtre);
    let result = courses.filter(c => (c.commission_silga ?? 0) > 0);
    if (dateRange) {
      result = result.filter(c => {
        const d = new Date(c.heure_livraison || c.updated_date);
        return d >= dateRange.from && d < dateRange.to;
      });
    }
    return result;
  }, [courses, filtre]);

  // ── Agréger par livreur ────────────────────────────────────────────────────
  const recapLivreurs = useMemo(() => {
    const map = {};
    coursesFiltrees.forEach(c => {
      if (!c.livreur_id) return;
      if (!map[c.livreur_id]) {
        const info = livreurs.find(l => l.id === c.livreur_id);
        map[c.livreur_id] = {
          id: c.livreur_id,
          nom: c.livreur_nom || info?.nom || "Inconnu",
          prenom: info?.prenom || "",
          telephone: c.livreur_telephone || info?.telephone || "",
          livreurInfo: info || null,
          courses: [],
          montantTotal: 0,       // CA total (prix final)
          commissionTotal: 0,    // commission Silga théorique (somme)
          montantPaye: 0,        // déjà encaissé par Silga
          montantDu: 0,          // reste à payer = montant_du_silga du profil (source unique de vérité)
        };
      }
      map[c.livreur_id].courses.push(c);
      map[c.livreur_id].montantTotal += (c.prix_final ?? 0);
      map[c.livreur_id].commissionTotal += (c.commission_silga ?? 0);
      if (c.statut_paiement_livreur === "paye") {
        map[c.livreur_id].montantPaye += (c.commission_silga ?? 0);
      }
    });

    // Récupérer le montant dû réel depuis le profil livreur
    Object.values(map).forEach(entry => {
      const info = entry.livreurInfo;
      entry.montantDu = info?.montant_du_silga ?? Math.max(0, entry.commissionTotal - entry.montantPaye);
    });

    let result = Object.values(map);

    // Filtres payé / impayé / partiel
    if (filtre === "impayes") result = result.filter(r => r.montantDu > 0 && r.montantPaye === 0);
    if (filtre === "partiels") result = result.filter(r => r.montantDu > 0 && r.montantPaye > 0);
    if (filtre === "payes") result = result.filter(r => r.montantDu <= 0);

    return result.sort((a, b) => b.montantDu - a.montantDu);
  }, [coursesFiltrees, livreurs, filtre]);

  // ── Totaux globaux ──────────────────────────────────────────────────────────
  const totalDu = recapLivreurs.reduce((s, r) => s + r.montantDu, 0);
  const totalCommission = recapLivreurs.reduce((s, r) => s + r.commissionTotal, 0);
  const totalPaye = recapLivreurs.reduce((s, r) => s + r.montantPaye, 0);

  // ── Mutation paiement partiel ───────────────────────────────────────────────
  const paiementMutation = useMutation({
    mutationFn: async ({ entry, montant }) => {
      const info = entry.livreurInfo;
      if (!info) throw new Error("Livreur introuvable");

      const soldeCourant = info.montant_du_silga || 0;
      const nouveauSolde = Math.max(0, soldeCourant - montant);

      // Marquer les courses impayées comme payées si montant couvre tout
      if (nouveauSolde === 0) {
        const impayees = entry.courses.filter(c => c.statut_paiement_livreur !== "paye");
        await Promise.all(impayees.map(c =>
          base44.entities.CourseExterne.update(c.id, { statut_paiement_livreur: "paye" })
        ));
      }

      await base44.functions.invoke("updateLivreur", {
        id: entry.id,
        data: { montant_du_silga: nouveauSolde }
      });
      return { nouveauSolde, montant };
    },
    onSuccess: ({ nouveauSolde, montant }) => {
      queryClient.invalidateQueries({ queryKey: ["courses-externes-livrees"] });
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes-all"] });
      setDetailEntry(null);
      toast.success(`Paiement de ${montant.toLocaleString()} F enregistré ! Reste : ${nouveauSolde.toLocaleString()} F`);
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const blockMutation = useMutation({
    mutationFn: ({ id, actif }) => base44.functions.invoke("updateLivreur", { id, data: { actif } }),
    onSuccess: (_, { actif }) => {
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes-all"] });
      toast.success(actif ? "Livreur débloqué ✓" : "Livreur bloqué ✓");
      setDetailEntry(null);
    },
    onError: () => toast.error("Erreur"),
  });

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
          <h1 className="text-xl font-bold text-foreground">Comptabilité — Livreurs externes</h1>
          <p className="text-xs text-muted-foreground">Commissions 30% dues à SILGAPP · Clôture à 20h00</p>
        </div>
      </div>

      {/* Résumé global */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-orange-500 text-white">
          <p className="text-xs opacity-90">Total dû (impayé)</p>
          <p className="text-xl font-bold mt-1">{totalDu.toLocaleString()} <span className="text-sm font-normal">F</span></p>
        </Card>
        <Card className="p-4 bg-primary text-white">
          <p className="text-xs opacity-90">Livreurs concernés</p>
          <p className="text-xl font-bold mt-1">{recapLivreurs.length}</p>
        </Card>
        <Card className="p-4 bg-blue-600 text-white">
          <p className="text-xs opacity-90">Commission totale</p>
          <p className="text-xl font-bold mt-1">{totalCommission.toLocaleString()} <span className="text-sm font-normal">F</span></p>
        </Card>
        <Card className="p-4 bg-green-600 text-white">
          <p className="text-xs opacity-90">Déjà encaissé</p>
          <p className="text-xl font-bold mt-1">{totalPaye.toLocaleString()} <span className="text-sm font-normal">F</span></p>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {FILTRES.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltre(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filtre === f.id ? "bg-primary text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
          {recapLivreurs.map(entry => {
            const sf = statutFinancier(entry.montantDu, entry.montantPaye);
            const isBloque = entry.livreurInfo?.actif === false;

            return (
              <Card key={entry.id} className={`p-4 ${isBloque ? "border-red-300 bg-red-50/30" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-foreground">
                        {entry.prenom} {entry.nom}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sf.color}`}>
                        {sf.label}
                      </span>
                      {isBloque && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                          🔒 Bloqué
                        </span>
                      )}
                    </div>
                    {entry.telephone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                        <Phone className="w-3 h-3" />{entry.telephone}
                      </p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="bg-gray-50 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">Courses</p>
                        <p className="font-bold text-sm">{entry.courses.length}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">CA total</p>
                        <p className="font-bold text-blue-700 text-sm">{entry.montantTotal.toLocaleString()} F</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2">
                        <p className="text-xs text-muted-foreground">Commission</p>
                        <p className="font-bold text-orange-700 text-sm">{entry.commissionTotal.toLocaleString()} F</p>
                      </div>
                      <div className={`rounded-lg p-2 ${entry.montantDu > 0 ? "bg-red-50" : "bg-green-50"}`}>
                        <p className="text-xs text-muted-foreground">Reste dû</p>
                        <p className={`font-bold text-sm ${entry.montantDu > 0 ? "text-red-700" : "text-green-700"}`}>
                          {entry.montantDu.toLocaleString()} F
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs"
                    onClick={() => setDetailEntry(entry)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Détails / Payer
                  </Button>
                  {entry.montantDu > 0 && (
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5 text-xs bg-green-600 hover:bg-green-700"
                      disabled={paiementMutation.isPending}
                      onClick={() => paiementMutation.mutate({ entry, montant: entry.montantDu })}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Tout payer
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal détails + paiement */}
      {detailEntry && (
        <DetailPaiementModal
          entry={detailEntry}
          livreurInfo={detailEntry.livreurInfo}
          onClose={() => setDetailEntry(null)}
          onPaiement={(entry, montant) => paiementMutation.mutate({ entry, montant })}
          onBloquer={() => blockMutation.mutate({ id: detailEntry.id, actif: false })}
          onDebloquer={() => blockMutation.mutate({ id: detailEntry.id, actif: true })}
          isPending={paiementMutation.isPending}
        />
      )}
    </div>
  );
}