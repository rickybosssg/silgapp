import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CreditCard, CheckCircle2, XCircle, Eye, Phone, Ban,
  Unlock, CheckCircle, Clock, User, Truck, Search, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAdminContext } from "@/hooks/useAdminContext.js";

// ── Onglets ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "livreurs", label: "💼 Dus Livreurs" },
  { id: "frais", label: "🚫 Frais Annulation Clients" },
];

// ── Statut financier livreur ───────────────────────────────────────────────────
function statutFinancier(montantDu, montantPaye) {
  if (montantDu <= 0) return { label: "Payé", color: "bg-green-100 text-green-700" };
  if (montantPaye > 0) return { label: "Partiellement payé", color: "bg-amber-100 text-amber-700" };
  return { label: "Impayé", color: "bg-red-100 text-red-700" };
}

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
  if (filtreId === "semaine") return { from: new Date(today.getTime() - 7 * 86400000), to: now };
  if (filtreId === "mois") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  return null;
}

// ── Modal paiement livreur ─────────────────────────────────────────────────────
function DetailPaiementModal({ entry, onClose, onPaiement, onBloquer, onDebloquer, isPending }) {
  const [montantSaisi, setMontantSaisi] = useState("");
  const sf = statutFinancier(entry.montantDu, entry.montantPaye);
  const isBloque = entry.livreurInfo?.actif === false;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-bold text-lg">{entry.prenom} {entry.nom}</p>
            {entry.telephone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{entry.telephone}</p>}
          </div>
          <button onClick={onClose}><XCircle className="w-6 h-6 text-gray-600 hover:text-gray-600" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-4 border border-orange-200 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold">Situation financière</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sf.color}`}>{sf.label}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Courses ({entry.courses.length})</span><span className="font-semibold">{entry.montantTotal.toLocaleString()} F</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Commission Silga 30%</span><span className="font-semibold text-orange-600">{entry.commissionTotal.toLocaleString()} F</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Déjà payé</span><span className="font-semibold text-green-600">{entry.montantPaye.toLocaleString()} F</span></div>
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span>Reste dû à Silga</span>
              <span className={entry.montantDu > 0 ? "text-red-600 text-base" : "text-green-600"}>{entry.montantDu.toLocaleString()} F</span>
            </div>
          </div>
          {entry.montantDu > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold">Enregistrer un paiement</p>
              <div className="flex gap-2">
                <input type="number" placeholder={`Max : ${entry.montantDu.toLocaleString()} F`} value={montantSaisi}
                  onChange={e => setMontantSaisi(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <Button className="gap-1.5 bg-green-600 hover:bg-green-700 shrink-0" onClick={() => { const m = Number(montantSaisi); if (!m || m <= 0) { toast.error("Montant invalide"); return; } onPaiement(entry, m); setMontantSaisi(""); }} disabled={isPending || !montantSaisi}>
                  <CheckCircle2 className="w-4 h-4" />Valider
                </Button>
              </div>
              <button className="text-xs text-primary underline" onClick={() => setMontantSaisi(String(entry.montantDu))}>Tout payer ({entry.montantDu.toLocaleString()} F)</button>
            </div>
          )}
          <div>
            <p className="text-sm font-bold mb-2">Courses concernées</p>
            <div className="space-y-2">
              {entry.courses.map(c => (
                <div key={c.id} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{c.heure_livraison ? format(new Date(c.heure_livraison), "dd/MM HH:mm", { locale: fr }) : "–"}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.statut_paiement_livreur === "paye" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>{c.statut_paiement_livreur === "paye" ? "Payée" : "Impayée"}</span>
                  </div>
                  <p className="text-sm font-medium truncate">{c.adresse_depart} → {c.adresse_arrivee || "?"}</p>
                  <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
                    {c.prix_final != null && <span>💰 {c.prix_final.toLocaleString()} F</span>}
                    {c.commission_silga != null && <span className="text-orange-600 font-semibold">Silga: {c.commission_silga.toLocaleString()} F</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t">
          {isBloque
            ? <Button className="w-full bg-green-600 hover:bg-green-700 gap-2" onClick={onDebloquer}><CheckCircle2 className="w-4 h-4" />Débloquer le livreur</Button>
            : <Button variant="destructive" className="w-full gap-2" onClick={onBloquer}><Ban className="w-4 h-4" />Bloquer le livreur</Button>}
        </div>
      </div>
    </div>
  );
}

// ── Onglet : Dus livreurs ──────────────────────────────────────────────────────
function DusLivreursTab() {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState("aujourd_hui");
  const [detailEntry, setDetailEntry] = useState(null);
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || "");
  const coursesLivreesFilter = effectiveCountry
    ? { statut: "livree", country_code: effectiveCountry }
    : { statut: "livree" };
  const livreursFilter = effectiveCountry
    ? { type_livreur: "externe", country_code: effectiveCountry }
    : { type_livreur: "externe" };

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes-livrees", effectiveCountry],
    queryFn: () => base44.entities.CourseExterne.filter(coursesLivreesFilter, "-heure_livraison", 500),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-externes-all", effectiveCountry],
    queryFn: () => base44.entities.Livreur.filter(livreursFilter, "-created_date", 200),
    initialData: [],
    refetchInterval: 15000,
  });

  const coursesFiltrees = useMemo(() => {
    const dateRange = getDateRange(filtre);
    let result = courses.filter(c => (c.commission_silga ?? 0) > 0);
    if (dateRange) result = result.filter(c => { const d = new Date(c.heure_livraison || c.updated_date); return d >= dateRange.from && d < dateRange.to; });
    return result;
  }, [courses, filtre]);

  const recapLivreurs = useMemo(() => {
    const map = {};
    coursesFiltrees.forEach(c => {
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
    Object.values(map).forEach(entry => {
      const info = entry.livreurInfo;
      entry.montantDu = info?.montant_du_silga ?? Math.max(0, entry.commissionTotal - entry.montantPaye);
    });
    let result = Object.values(map);
    if (filtre === "impayes") result = result.filter(r => r.montantDu > 0 && r.montantPaye === 0);
    if (filtre === "partiels") result = result.filter(r => r.montantDu > 0 && r.montantPaye > 0);
    if (filtre === "payes") result = result.filter(r => r.montantDu <= 0);
    return result.sort((a, b) => b.montantDu - a.montantDu);
  }, [coursesFiltrees, livreurs, filtre]);

  const totalDu = recapLivreurs.reduce((s, r) => s + r.montantDu, 0);
  const totalCommission = recapLivreurs.reduce((s, r) => s + r.commissionTotal, 0);
  const totalPaye = recapLivreurs.reduce((s, r) => s + r.montantPaye, 0);

  const paiementMutation = useMutation({
    mutationFn: async ({ entry, montant }) => {
      const info = entry.livreurInfo;
      if (!info) throw new Error("Livreur introuvable");
      const nouveauSolde = Math.max(0, (info.montant_du_silga || 0) - montant);
      if (nouveauSolde === 0) {
        const impayees = entry.courses.filter(c => c.statut_paiement_livreur !== "paye");
        await Promise.all(impayees.map(c => base44.entities.CourseExterne.update(c.id, { statut_paiement_livreur: "paye" })));
      }
      await base44.functions.invoke("updateLivreur", { id: entry.id, data: { montant_du_silga: nouveauSolde } });
      return { nouveauSolde, montant };
    },
    onSuccess: ({ montant, nouveauSolde }) => {
      queryClient.invalidateQueries({ queryKey: ["courses-externes-livrees"] });
      queryClient.invalidateQueries({ queryKey: ["livreurs-externes-all"] });
      setDetailEntry(null);
      toast.success(`Paiement de ${montant.toLocaleString()} F enregistré ! Reste : ${nouveauSolde.toLocaleString()} F`);
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const blockMutation = useMutation({
    mutationFn: ({ id, actif }) => base44.functions.invoke("updateLivreur", { id, data: { actif } }),
    onSuccess: (_, { actif }) => { queryClient.invalidateQueries({ queryKey: ["livreurs-externes-all"] }); toast.success(actif ? "Livreur débloqué ✓" : "Livreur bloqué ✓"); setDetailEntry(null); },
    onError: () => toast.error("Erreur"),
  });

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: "Total dû", value: totalDu.toLocaleString(), suffix: "F", grad: "from-orange-500 to-amber-500" },
          { label: "Livreurs", value: recapLivreurs.length, grad: "from-primary to-red-600" },
          { label: "Commission", value: totalCommission.toLocaleString(), suffix: "F", grad: "from-blue-500 to-indigo-600" },
          { label: "Encaissé", value: totalPaye.toLocaleString(), suffix: "F", grad: "from-green-500 to-emerald-500" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-2xl p-3 text-white shadow-md`}>
            <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide mb-1">{s.label}</p>
            <p className="text-xl font-black">{s.value}{s.suffix && <span className="text-xs font-normal ml-1">{s.suffix}</span>}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {FILTRES.map(f => (
          <button key={f.id} onClick={() => setFiltre(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filtre === f.id ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-gray-200 hover:border-primary/40"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {recapLivreurs.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <div className="text-3xl mb-2">💼</div>
          <p className="font-semibold">Aucun résultat</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recapLivreurs.map(entry => {
            const sf = statutFinancier(entry.montantDu, entry.montantPaye);
            const isBloque = entry.livreurInfo?.actif === false;
            return (
              <div key={entry.id} className={`bg-white rounded-2xl border p-4 hover:shadow-md transition-all ${isBloque ? "border-red-200 bg-red-50/30" : "border-gray-100"}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-black">{entry.prenom} {entry.nom}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sf.color}`}>{sf.label}</span>
                      {isBloque && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">🔒 Bloqué</span>}
                    </div>
                    {entry.telephone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{entry.telephone}</p>}
                  </div>
                  {entry.montantDu > 0 && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-red-400 font-semibold uppercase">Reste dû</p>
                      <p className="text-xl font-black text-red-600">{entry.montantDu.toLocaleString()} <span className="text-xs font-normal">F</span></p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-xl p-2 text-center border border-gray-100">
                    <p className="text-[10px] text-muted-foreground uppercase">Courses</p>
                    <p className="font-black text-base">{entry.courses.length}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-2 text-center border border-blue-100">
                    <p className="text-[10px] text-blue-500 uppercase">CA</p>
                    <p className="font-black text-sm text-blue-700">{entry.montantTotal.toLocaleString()} F</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-2 text-center border border-orange-100">
                    <p className="text-[10px] text-orange-500 uppercase">Commission</p>
                    <p className="font-black text-sm text-orange-700">{entry.commissionTotal.toLocaleString()} F</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs rounded-xl" onClick={() => setDetailEntry(entry)}>
                    <Eye className="w-3.5 h-3.5" />Détails / Payer
                  </Button>
                  {entry.montantDu > 0 && (
                    <Button size="sm" className="flex-1 gap-1.5 text-xs bg-green-600 hover:bg-green-700 rounded-xl"
                      disabled={paiementMutation.isPending}
                      onClick={() => paiementMutation.mutate({ entry, montant: entry.montantDu })}>
                      <CheckCircle2 className="w-3.5 h-3.5" />Tout payer
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailEntry && (
        <DetailPaiementModal
          entry={detailEntry}
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

// ── Onglet : Frais annulation ──────────────────────────────────────────────────
function FraisAnnulationTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || "");
  const fraisFilter = effectiveCountry ? { country_code: effectiveCountry } : null;

  const { data: frais = [], isLoading, refetch } = useQuery({
    queryKey: ["frais-annulation", effectiveCountry],
    queryFn: () => fraisFilter
      ? base44.entities.FraisAnnulation.filter(fraisFilter, "-created_date", 200)
      : base44.entities.FraisAnnulation.list("-created_date", 200),
    refetchInterval: 30000,
  });

  const marquerPayeMutation = useMutation({
    mutationFn: (id) => base44.entities.FraisAnnulation.update(id, { statut_paiement: "paye", paye_at: new Date().toISOString() }),
    onSuccess: () => { qc.invalidateQueries(["frais-annulation"]); toast.success("Marqué comme payé"); },
  });

  const bloquerMutation = useMutation({
    mutationFn: ({ clientId, bloquer }) => base44.entities.ClientExterne.update(clientId, { bloque_frais_annulation: bloquer, actif: !bloquer }),
    onSuccess: (_, { bloquer }) => { qc.invalidateQueries(["frais-annulation"]); toast.success(bloquer ? "Client bloqué" : "Client débloqué"); },
  });

  const filtered = frais.filter(f => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (f.client_nom || "").toLowerCase().includes(s) || (f.client_telephone || "").includes(s) || (f.livreur_nom || "").toLowerCase().includes(s);
  });

  const nbImpaye = frais.filter(f => f.statut_paiement === "impaye").length;
  const totalImpaye = frais.filter(f => f.statut_paiement === "impaye").reduce((s, f) => s + (f.montant || 0), 0);
  const totalPaye = frais.filter(f => f.statut_paiement === "paye").reduce((s, f) => s + (f.montant || 0), 0);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200">
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Impayés</p>
          <p className="text-2xl font-black text-orange-700 mt-1">{totalImpaye.toLocaleString()} F</p>
          <p className="text-xs text-orange-500">{nbImpaye} dossier(s)</p>
        </div>
        <div className="p-4 rounded-2xl bg-green-50 border border-green-200">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Payés</p>
          <p className="text-2xl font-black text-green-700 mt-1">{totalPaye.toLocaleString()} F</p>
          <p className="text-xs text-green-500">{frais.filter(f => f.statut_paiement === "paye").length} dossier(s)</p>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
        <Input placeholder="Rechercher par client, livreur..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-gray-600 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Chargement...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-600">
          <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucun frais d'annulation</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(f => <FraisCard key={f.id} frais={f}
            onPayer={() => marquerPayeMutation.mutate(f.id)}
            onBloquer={(bloquer) => bloquerMutation.mutate({ clientId: f.client_id, bloquer })}
            payerLoading={marquerPayeMutation.isPending}
            bloquerLoading={bloquerMutation.isPending}
          />)}
        </div>
      )}
    </div>
  );
}

function FraisCard({ frais, onPayer, onBloquer, payerLoading, bloquerLoading }) {
  const [clientBloque, setClientBloque] = useState(false);
  useEffect(() => {
    if (!frais.client_id) return;
    base44.entities.ClientExterne.filter({ id: frais.client_id }).then(r => setClientBloque(r?.[0]?.bloque_frais_annulation || false)).catch(() => {});
  }, [frais.client_id]);

  const estPaye = frais.statut_paiement === "paye";
  return (
    <Card className={`border-2 ${estPaye ? "border-green-200" : "border-orange-200"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={estPaye ? "bg-green-100 text-green-800 border border-green-200" : "bg-orange-100 text-orange-800 border border-orange-200"}>
              {estPaye ? <><CheckCircle className="w-3 h-3 mr-1 inline" />Payé</> : <><Clock className="w-3 h-3 mr-1 inline" />Impayé</>}
            </Badge>
            <span className="text-lg font-black text-gray-900">{frais.montant || 0} {frais.devise || "F"}</span>
            {clientBloque && <Badge className="bg-red-100 text-red-800 border border-red-200"><Ban className="w-3 h-3 mr-1 inline" />Client bloqué</Badge>}
          </div>
          {frais.date_annulation && <span className="text-xs text-gray-600">{format(new Date(frais.date_annulation), "dd/MM/yyyy HH:mm", { locale: fr })}</span>}
        </div>
        <p className="text-xs text-gray-500">{frais.raison || "Annulation après acceptation livreur"}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
            <User className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{frais.client_nom || "—"}</p>
              <p className="text-xs text-gray-500">{frais.client_telephone}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
            <Truck className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{frais.livreur_nom || "—"}</p>
              <p className="text-xs text-gray-500">Livreur</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!estPaye && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white rounded-xl h-8 text-xs" onClick={onPayer} disabled={payerLoading}>
              <CheckCircle className="w-3.5 h-3.5 mr-1" />Marquer Payé
            </Button>
          )}
          {frais.client_id && (!clientBloque ? (
            <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 rounded-xl h-8 text-xs" onClick={() => { onBloquer(true); setClientBloque(true); }} disabled={bloquerLoading}>
              <Ban className="w-3.5 h-3.5 mr-1" />Bloquer le client
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 rounded-xl h-8 text-xs" onClick={() => { onBloquer(false); setClientBloque(false); }} disabled={bloquerLoading}>
              <Unlock className="w-3.5 h-3.5 mr-1" />Débloquer le client
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function ComptabilitePanel() {
  const [activeTab, setActiveTab] = useState("livreurs");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-100">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground">Comptabilité Livreurs & Clients</p>
            <p className="text-xs text-muted-foreground">Commissions dues · Frais d'annulation</p>
          </div>
        </div>
        {/* Onglets */}
        <div className="flex gap-2">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${activeTab === tab.id ? "bg-primary text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="p-5">
        {activeTab === "livreurs" ? <DusLivreursTab /> : <FraisAnnulationTab />}
      </div>
    </div>
  );
}
