import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import {
  ArrowLeft, X, Phone, Search, CheckCircle2, Ban, Unlock, Wallet, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAdminContext } from "@/hooks/useAdminContext.js";

// ── Statut financier simplifié ──
function statutFinancier(montantDu, montantPaye) {
  if (montantDu <= 0) return { label: "À jour", color: "bg-green-100 text-green-700", dot: "bg-green-500" };
  if (montantPaye > 0) return { label: "Partiel", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" };
  return { label: "Non payé", color: "bg-red-100 text-red-700", dot: "bg-red-500" };
}

// ── 3 filtres simples au lieu de 7 ──
const FILTRES = [
  { id: "arecouvrer", label: "À recouvrer" },
  { id: "ajour", label: "À jour" },
  { id: "tous", label: "Tous" },
];

// ── Modal détails simplifié ──
function DetailModal({ entry, livreurInfo, onClose, onPaiement, onBloquer, onDebloquer, isPending }) {
  const [montantSaisi, setMontantSaisi] = useState("");
  const sf = statutFinancier(entry.montantDu, entry.montantPaye);
  const isBloque = livreurInfo?.actif === false;
  const montantSaisiNum = Number(montantSaisi) || 0;
  const resteApres = Math.max(0, entry.montantDu - montantSaisiNum);

  const handleValider = () => {
    const montant = Number(montantSaisi) || entry.montantDu;
    if (!montant || montant <= 0) { toast.error("Montant invalide"); return; }
    if (montant > entry.montantDu) { toast.error(`Max : ${entry.montantDu.toLocaleString()} F`); return; }
    onPaiement(entry, montant);
    setMontantSaisi("");
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600">
              {(entry.prenom?.[0] || "") + (entry.nom?.[0] || "")}
            </div>
            <div>
              <p className="font-bold text-foreground">{entry.prenom} {entry.nom}</p>
              {entry.telephone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{entry.telephone}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Solde principal — la seule info qui compte */}
          <div className="text-center py-4">
            <p className="text-xs text-gray-500 mb-1">Reste dû à SILGAPP</p>
            <p className={`text-4xl font-black ${entry.montantDu > 0 ? "text-red-600" : "text-green-600"}`}>
              {entry.montantDu.toLocaleString()}<span className="text-lg font-normal ml-1">F</span>
            </p>
            <span className={`inline-block mt-2 text-xs px-3 py-0.5 rounded-full font-medium ${sf.color}`}>{sf.label}</span>
            {montantSaisiNum > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                Après paiement : <span className="font-semibold text-gray-600">{resteApres.toLocaleString()} F</span>
              </p>
            )}
          </div>

          {/* Résumé simple */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Commission total</p>
              <p className="font-bold text-gray-800">{entry.commissionTotal.toLocaleString()} F</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Déjà payé</p>
              <p className="font-bold text-green-600">{entry.montantPaye.toLocaleString()} F</p>
            </div>
          </div>

          {/* Dernier paiement */}
          {livreurInfo?.dernier_paiement_date && (
            <div className="text-center text-xs text-gray-400">
              Dernier règlement : {format(new Date(livreurInfo.dernier_paiement_date), "dd MMM yyyy 'à' HH:mm", { locale: fr })}
            </div>
          )}

          {/* Paiement */}
          {entry.montantDu > 0 && (
            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-foreground mb-2">Enregistrer un paiement</p>
              <div className="flex gap-2">
                <Input type="number" placeholder="Montant" value={montantSaisi}
                  onChange={e => setMontantSaisi(e.target.value)}
                  className="flex-1" />
                <Button className="bg-green-600 hover:bg-green-700 shrink-0" onClick={handleValider} disabled={isPending}>
                  Valider
                </Button>
              </div>
              <button className="text-xs text-blue-600 underline mt-2" onClick={() => setMontantSaisi(String(entry.montantDu))}>
                Tout payer ({entry.montantDu.toLocaleString()} F)
              </button>
            </div>
          )}

          {/* Courses — liste simple */}
          {entry.courses.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-sm font-semibold text-foreground mb-2">Courses ({entry.courses.length})</p>
              <div className="space-y-1.5">
                {entry.courses.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs py-1.5 px-2 bg-gray-50 rounded-lg">
                    <span className="text-gray-600 truncate flex-1">{c.adresse_depart} → {c.adresse_arrivee || "?"}</span>
                    <span className="font-semibold text-gray-800 ml-2">{(c.commission_silga ?? 0).toLocaleString()} F</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action bloquer/débloquer */}
        <div className="p-4 border-t">
          {isBloque
            ? <Button className="w-full bg-green-600 hover:bg-green-700" onClick={onDebloquer}><Unlock className="w-4 h-4 mr-2" />Débloquer</Button>
            : <Button variant="destructive" className="w-full" onClick={onBloquer}><Ban className="w-4 h-4 mr-2" />Bloquer</Button>}
        </div>
      </div>
    </div>
  );
}

// ── Carte frais annulation simplifiée ──
function FraisCard({ frais, onPayer, onBloquer, payerLoading, bloquerLoading }) {
  const [clientBloque, setClientBloque] = useState(false);
  useEffect(() => {
    if (!frais.client_id) return;
    base44.entities.ClientExterne.filter({ id: frais.client_id })
      .then(r => setClientBloque(r?.[0]?.bloque_frais_annulation || false))
      .catch(() => {});
  }, [frais.client_id]);

  const estPaye = frais.statut_paiement === "paye";
  return (
    <div className={`bg-white rounded-2xl border p-4 ${estPaye ? "border-green-200" : "border-orange-200"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${estPaye ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
            {estPaye ? "Payé" : "Impayé"}
          </span>
          <span className="font-bold text-gray-900">{frais.montant || 0} F</span>
        </div>
        {frais.date_annulation && <span className="text-xs text-gray-400">{format(new Date(frais.date_annulation), "dd/MM/yyyy", { locale: fr })}</span>}
      </div>
      <div className="flex gap-2 text-xs mb-3">
        <div className="flex-1 bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400">Client</p>
          <p className="font-semibold text-gray-700 truncate">{frais.client_nom || "—"}</p>
          <p className="text-gray-500">{frais.client_telephone}</p>
        </div>
        <div className="flex-1 bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400">Livreur</p>
          <p className="font-semibold text-gray-700 truncate">{frais.livreur_nom || "—"}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {!estPaye && (
          <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8 text-xs flex-1" onClick={onPayer} disabled={payerLoading}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Marquer payé
          </Button>
        )}
        {frais.client_id && (
          <Button size="sm" variant="outline" className="h-8 text-xs flex-1"
            onClick={() => { onBloquer(!clientBloque); setClientBloque(!clientBloque); }} disabled={bloquerLoading}>
            {clientBloque ? "Débloquer client" : "Bloquer client"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page principale ──
export default function DusLivreursExternes() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("livreurs");
  const [filtre, setFiltre] = useState("arecouvrer");
  const [detailEntry, setDetailEntry] = useState(null);
  const [search, setSearch] = useState("");
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || "");

  const coursesFilter = effectiveCountry ? { statut: "livree", country_code: effectiveCountry } : { statut: "livree" };
  const livreursFilter = effectiveCountry ? { type_livreur: "externe", country_code: effectiveCountry } : { type_livreur: "externe" };
  const fraisFilter = effectiveCountry ? { country_code: effectiveCountry } : null;

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes-livrees", effectiveCountry],
    queryFn: () => base44.entities.CourseExterne.filter(coursesFilter, "-heure_livraison", 500),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes-all", effectiveCountry],
    queryFn: () => base44.entities.Livreur.filter(livreursFilter, "-created_date", 200),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: frais = [], isLoading: fraisLoading } = useQuery({
    queryKey: ["frais-annulation", effectiveCountry],
    queryFn: () => fraisFilter
      ? base44.entities.FraisAnnulation.filter(fraisFilter, "-created_date", 200)
      : base44.entities.FraisAnnulation.list("-created_date", 200),
    refetchInterval: 30000,
  });

  // ── Agréger par livreur ──
  const recapLivreurs = useMemo(() => {
    const map = {};
    courses.forEach(c => {
      if (!c.livreur_id) return;
      if (!map[c.livreur_id]) {
        const info = livreurs.find(l => l.id === c.livreur_id);
        map[c.livreur_id] = { id: c.livreur_id, nom: c.livreur_nom || info?.nom || "Inconnu", prenom: info?.prenom || "", telephone: c.livreur_telephone || info?.telephone || "", livreurInfo: info || null, courses: [], montantTotal: 0, commissionTotal: 0, montantPaye: 0, montantDu: 0 };
      }
      map[c.livreur_id].courses.push(c);
      map[c.livreur_id].montantTotal += (c.prix_final ?? 0);
      map[c.livreur_id].commissionTotal += (c.commission_silga ?? 0);
      if (c.statut_paiement_livreur === "paye") map[c.livreur_id].montantPaye += (c.commission_silga ?? 0);
    });
    // Livreurs avec solde dû > 0 même sans course dans la période
    livreurs.forEach(l => {
      if (map[l.id]) return;
      const du = l.montant_du_silga ?? 0;
      if (du > 0) {
        map[l.id] = { id: l.id, nom: l.nom || "Inconnu", prenom: l.prenom || "", telephone: l.telephone || "", livreurInfo: l, courses: [], montantTotal: 0, commissionTotal: 0, montantPaye: 0, montantDu: du };
      }
    });
    Object.values(map).forEach(entry => {
      const info = entry.livreurInfo;
      if (info) {
        // montant_du_silga est la source de vérité — 0 signifie 0
        entry.montantDu = info.montant_du_silga ?? 0;
        entry.montantPaye = Math.max(0, entry.commissionTotal - entry.montantDu);
      } else {
        // Pas d'info livreur — calcul de secours basé sur les courses
        entry.montantDu = Math.max(0, entry.commissionTotal - entry.montantPaye);
      }
    });
    let result = Object.values(map);
    const totalDuGlobal = result.reduce((s, r) => s + r.montantDu, 0);
    if (filtre === "arecouvrer") result = result.filter(r => r.montantDu > 0);
    if (filtre === "ajour") result = result.filter(r => r.montantDu <= 0);
    return { list: result.sort((a, b) => b.montantDu - a.montantDu), totalDuGlobal };
  }, [courses, livreurs, filtre]);

  const recapList = recapLivreurs.list;
  const totalDu = recapLivreurs.totalDuGlobal;

  // ── Frais ──
  const fraisFiltres = frais.filter(f => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (f.client_nom || "").toLowerCase().includes(s) || (f.client_telephone || "").includes(s) || (f.livreur_nom || "").toLowerCase().includes(s);
  });
  const nbImpayeFrais = frais.filter(f => f.statut_paiement !== "paye").length;
  const totalImpayeFrais = frais.filter(f => f.statut_paiement !== "paye").reduce((s, f) => s + (f.montant || 0), 0);

  // ── Mutations (inchangées) ──
  const paiementMutation = useMutation({
    mutationFn: async ({ entry, montant }) => {
      const nouveauSolde = Math.max(0, (entry.montantDu ?? 0) - montant);
      const impayees = nouveauSolde === 0 ? entry.courses.filter(c => c.statut_paiement_livreur !== "paye").map(c => c.id) : [];
      const res = await base44.functions.invoke("updateLivreur", { id: entry.id, data: { montant_du_silga: nouveauSolde }, mark_courses_paid: impayees });
      if (res?.data && res.data.success === false) throw new Error(res.data.error || "Échec");
      return { nouveauSolde, montant, entry };
    },
    onMutate: async ({ entry, montant }) => {
      const nouveauSolde = Math.max(0, (entry.montantDu ?? 0) - montant);
      await queryClient.cancelQueries({ queryKey: ["courses-externes-livrees"] });
      await queryClient.cancelQueries({ queryKey: ["livreurs-externes-all"] });
      const prevCourses = queryClient.getQueryData(["courses-externes-livrees", effectiveCountry]);
      const prevLivreurs = queryClient.getQueryData(["livreurs-externes-all", effectiveCountry]);
      queryClient.setQueryData(["livreurs-externes-all", effectiveCountry], (old) =>
        (old || []).map(l => l.id === entry.id ? { ...l, montant_du_silga: nouveauSolde } : l));
      if (nouveauSolde === 0) {
        queryClient.setQueryData(["courses-externes-livrees", effectiveCountry], (old) =>
          (old || []).map(c => entry.courses.some(ec => ec.id === c.id) ? { ...c, statut_paiement_livreur: "paye" } : c));
      }
      return { prevCourses, prevLivreurs };
    },
    onSuccess: ({ nouveauSolde, montant, entry }) => {
      queryClient.invalidateQueries({ queryKey: ["courses-externes-livrees"] });
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes-all"] });
      if (detailEntry?.id === entry.id) {
        setDetailEntry({ ...detailEntry, montantDu: nouveauSolde, montantPaye: detailEntry.commissionTotal - nouveauSolde,
          courses: nouveauSolde === 0 ? detailEntry.courses.map(c => ({ ...c, statut_paiement_livreur: "paye" })) : detailEntry.courses });
      }
      toast.success(`Paiement de ${montant.toLocaleString()} F enregistré`);
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prevCourses) queryClient.setQueryData(["courses-externes-livrees", effectiveCountry], ctx.prevCourses);
      if (ctx?.prevLivreurs) queryClient.setQueryData(["livreurs-externes-all", effectiveCountry], ctx.prevLivreurs);
      toast.error("Erreur : " + (err.message || "Échec"));
    },
  });

  const blockMutation = useMutation({
    mutationFn: ({ id, actif }) => base44.functions.invoke("updateLivreur", { id, data: { actif } }),
    onSuccess: (_, { actif }) => { queryClient.invalidateQueries({ queryKey: ["livreurs-externes-all"] }); toast.success(actif ? "Débloqué" : "Bloqué"); setDetailEntry(null); },
    onError: () => toast.error("Erreur"),
  });

  const marquerPayeMutation = useMutation({
    mutationFn: (id) => base44.entities.FraisAnnulation.update(id, { statut_paiement: "paye", paye_at: new Date().toISOString() }),
    onSuccess: () => { queryClient.invalidateQueries(["frais-annulation"]); toast.success("Marqué payé"); },
  });

  const bloquerClientMutation = useMutation({
    mutationFn: ({ clientId, bloquer }) => base44.entities.ClientExterne.update(clientId, { bloque_frais_annulation: bloquer, actif: !bloquer }),
    onSuccess: (_, { bloquer }) => { queryClient.invalidateQueries(["frais-annulation"]); toast.success(bloquer ? "Client bloqué" : "Débloqué"); },
  });

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
      {/* Header simple */}
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">Dû Utilisateur</h1>
          <p className="text-xs text-gray-500">Livreurs, clients, boutiques & restaurants</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab("livreurs")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${activeTab === "livreurs" ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
          💼 Livreurs
        </button>
        <button onClick={() => setActiveTab("frais")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition relative ${activeTab === "frais" ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
          🚫 Frais annulation
          {nbImpayeFrais > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{nbImpayeFrais}</span>}
        </button>
      </div>

      {/* ── Onglet Livreurs ── */}
      {activeTab === "livreurs" && (
        <>
          {/* Total dû — une seule carte */}
          <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-4 text-white flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Total dû par les livreurs</p>
              <p className="text-3xl font-black">{totalDu.toLocaleString()} <span className="text-sm font-normal">F</span></p>
            </div>
            <Wallet className="w-10 h-10 opacity-50" />
          </div>

          {/* 3 filtres simples */}
          <div className="flex gap-2">
            {FILTRES.map(f => (
              <button key={f.id} onClick={() => setFiltre(f.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${filtre === f.id ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Liste — cartes épurées */}
          {recapList.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun livreur dans ce filtre</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recapList.map(entry => {
                const sf = statutFinancier(entry.montantDu, entry.montantPaye);
                const isBloque = entry.livreurInfo?.actif === false;
                return (
                  <div key={entry.id} className={`bg-white rounded-2xl border p-3.5 ${isBloque ? "border-red-200" : "border-gray-100"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                          {(entry.prenom?.[0] || "") + (entry.nom?.[0] || "")}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground text-sm truncate">{entry.prenom} {entry.nom}</p>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${sf.dot}`} />
                          </div>
                          {entry.telephone && <p className="text-xs text-gray-400">{entry.telephone}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-foreground">{entry.montantDu.toLocaleString()}<span className="text-xs font-normal text-gray-400 ml-0.5">F</span></p>
                        <p className="text-[10px] text-gray-400">{sf.label}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1 h-8 text-xs rounded-lg" onClick={() => setDetailEntry(entry)}>
                        Détails
                      </Button>
                      {entry.montantDu > 0 && (
                        <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 rounded-lg"
                          disabled={paiementMutation.isPending}
                          onClick={() => paiementMutation.mutate({ entry, montant: entry.montantDu })}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Encaisser
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Onglet Frais ── */}
      {activeTab === "frais" && (
        <>
          <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-4 text-white flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Frais d'annulation impayés</p>
              <p className="text-3xl font-black">{totalImpayeFrais.toLocaleString()} <span className="text-sm font-normal">F</span></p>
            </div>
            <AlertCircle className="w-10 h-10 opacity-50" />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
          </div>

          {fraisLoading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Chargement...</div>
          ) : fraisFiltres.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun frais</p>
            </div>
          ) : (
            <div className="space-y-2">
              {fraisFiltres.map(f => (
                <FraisCard key={f.id} frais={f}
                  onPayer={() => marquerPayeMutation.mutate(f.id)}
                  onBloquer={(bloquer) => bloquerClientMutation.mutate({ clientId: f.client_id, bloquer })}
                  payerLoading={marquerPayeMutation.isPending}
                  bloquerLoading={bloquerClientMutation.isPending}
                />
              ))}
            </div>
          )}
        </>
      )}

      {detailEntry && (
        <DetailModal
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