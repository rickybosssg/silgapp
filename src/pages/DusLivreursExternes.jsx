import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import {
  ArrowLeft, X, Phone, Search, CheckCircle2, Ban, Unlock, Wallet, AlertCircle, Store, UtensilsCrossed
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
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header premium */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center font-black text-gray-700">
              {(entry.prenom?.[0] || "") + (entry.nom?.[0] || "")}
            </div>
            <div>
              <p className="font-bold text-foreground">{entry.prenom} {entry.nom}</p>
              {entry.telephone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{entry.telephone}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Solde principal — carte premium */}
          <div className={`relative overflow-hidden rounded-2xl p-5 text-center ${entry.montantDu > 0 ? "bg-gradient-to-br from-red-50 to-orange-50" : "bg-gradient-to-br from-green-50 to-emerald-50"}`}>
            <p className="text-xs text-gray-500 mb-1 font-medium">Reste dû à SILGAPP</p>
            <p className={`text-4xl font-black tracking-tight ${entry.montantDu > 0 ? "text-red-600" : "text-green-600"}`}>
              {entry.montantDu.toLocaleString()}<span className="text-lg font-normal ml-1 opacity-70">F</span>
            </p>
            <span className={`inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold ${sf.color}`}>{sf.label}</span>
            {montantSaisiNum > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                Après paiement : <span className="font-semibold text-gray-600">{resteApres.toLocaleString()} F</span>
              </p>
            )}
          </div>

          {/* Résumé simple — livreur uniquement */}
          {(!entry.entityType || entry.entityType === 'livreur') && (
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
          )}

          {/* Infos établissement — boutique/restaurant */}
          {entry.entityType && entry.entityType !== 'livreur' && livreurInfo && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              {livreurInfo.quartier && <p className="text-xs text-gray-600">📍 {livreurInfo.quartier}{livreurInfo.ville ? `, ${livreurInfo.ville}` : ""}</p>}
              {livreurInfo.adresse && <p className="text-xs text-gray-500">{livreurInfo.adresse}</p>}
              {livreurInfo.commission_pct != null && <p className="text-xs text-gray-500">Commission : {livreurInfo.commission_pct}%</p>}
            </div>
          )}

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

        {/* Action bloquer/débloquer — livreur uniquement */}
        {(!entry.entityType || entry.entityType === 'livreur') && (
          <div className="p-4 border-t">
            {isBloque
              ? <Button className="w-full bg-green-600 hover:bg-green-700" onClick={onDebloquer}><Unlock className="w-4 h-4 mr-2" />Débloquer</Button>
              : <Button variant="destructive" className="w-full" onClick={onBloquer}><Ban className="w-4 h-4 mr-2" />Bloquer</Button>}
          </div>
        )}
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
  const [confirmEncaisser, setConfirmEncaisser] = useState(null);
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

  const boutiquesFilter = effectiveCountry ? { pays_code: effectiveCountry } : {};
  const restaurantsFilter = effectiveCountry ? { pays_code: effectiveCountry } : {};

  const { data: boutiques = [] } = useQuery({
    queryKey: ["boutiques-dettes", effectiveCountry],
    queryFn: () => base44.entities.Boutique.filter(boutiquesFilter, "-created_date", 200),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["restaurants-dettes", effectiveCountry],
    queryFn: () => base44.entities.Restaurant.filter(restaurantsFilter, "-created_date", 200),
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
      const du = l.montant_du_silga ?? l.encours ?? 0;
      if (du > 0) {
        map[l.id] = { id: l.id, nom: l.nom || "Inconnu", prenom: l.prenom || "", telephone: l.telephone || "", livreurInfo: l, courses: [], montantTotal: 0, commissionTotal: 0, montantPaye: 0, montantDu: du };
      }
    });
    Object.values(map).forEach(entry => {
      const info = entry.livreurInfo;
      if (info) {
        // montant_du_silga est la source de vérité (mis à jour à chaque livraison)
        // encours est conservé pour rétrocompatibilité mais n'est plus fiable
        entry.montantDu = info.montant_du_silga ?? info.encours ?? 0;
        entry.montantPaye = Math.max(0, entry.commissionTotal - entry.montantDu);
      } else {
        // Pas d'info livreur — calcul de secours basé sur les courses impayées
        entry.montantDu = Math.max(0, entry.commissionTotal - entry.montantPaye);
      }
    });
    let result = Object.values(map);
    const totalDuGlobal = result.reduce((s, r) => s + r.montantDu, 0);
    if (filtre === "arecouvrer") result = result.filter(r => r.montantDu > 0);
    if (filtre === "ajour") result = result.filter(r => r.montantDu <= 0);
    return { list: result.sort((a, b) => b.montantDu - a.montantDu), totalDuGlobal };
  }, [courses, livreurs, filtre]);

  // ── Recap Boutiques ──
  const recapBoutiques = useMemo(() => {
    const list = boutiques.map(b => ({
      id: b.id, nom: b.nom || "Inconnu", prenom: "", telephone: b.telephone || "",
      livreurInfo: b, entityType: 'boutique', courses: [],
      montantTotal: 0, commissionTotal: 0, montantPaye: 0, montantDu: b.montant_du_silga || 0,
    }));
    const totalDuGlobal = list.reduce((s, r) => s + r.montantDu, 0);
    let result = list;
    if (filtre === "arecouvrer") result = list.filter(r => r.montantDu > 0);
    if (filtre === "ajour") result = list.filter(r => r.montantDu <= 0);
    return { list: result.sort((a, b) => b.montantDu - a.montantDu), totalDuGlobal };
  }, [boutiques, filtre]);

  // ── Recap Restaurants ──
  const recapRestaurants = useMemo(() => {
    const list = restaurants.map(r => ({
      id: r.id, nom: r.nom || "Inconnu", prenom: "", telephone: r.telephone || "",
      livreurInfo: r, entityType: 'restaurant', courses: [],
      montantTotal: 0, commissionTotal: 0, montantPaye: 0, montantDu: r.montant_du_silga || 0,
    }));
    const totalDuGlobal = list.reduce((s, r) => s + r.montantDu, 0);
    let result = list;
    if (filtre === "arecouvrer") result = list.filter(r => r.montantDu > 0);
    if (filtre === "ajour") result = list.filter(r => r.montantDu <= 0);
    return { list: result.sort((a, b) => b.montantDu - a.montantDu), totalDuGlobal };
  }, [restaurants, filtre]);

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
      const res = await base44.functions.invoke("updateLivreur", { id: entry.id, data: { encours: nouveauSolde, montant_du_silga: nouveauSolde }, mark_courses_paid: impayees });
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
        (old || []).map(l => l.id === entry.id ? { ...l, encours: nouveauSolde, montant_du_silga: nouveauSolde } : l));
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

  // ── Paiement boutique/restaurant (mise à jour directe) ──
  const etablissementPaiementMutation = useMutation({
    mutationFn: async ({ entry, montant }) => {
      const nouveauSolde = Math.max(0, (entry.montantDu ?? 0) - montant);
      const entityName = entry.entityType === 'boutique' ? 'Boutique' : 'Restaurant';
      await base44.entities[entityName].update(entry.id, { montant_du_silga: nouveauSolde });
      return { nouveauSolde, montant, entry };
    },
    onMutate: async ({ entry, montant }) => {
      const nouveauSolde = Math.max(0, (entry.montantDu ?? 0) - montant);
      const qKey = entry.entityType === 'boutique' ? ["boutiques-dettes", effectiveCountry] : ["restaurants-dettes", effectiveCountry];
      await queryClient.cancelQueries({ queryKey: qKey });
      const prev = queryClient.getQueryData(qKey);
      queryClient.setQueryData(qKey, (old) =>
        (old || []).map(e => e.id === entry.id ? { ...e, montant_du_silga: nouveauSolde } : e));
      return { prev, qKey };
    },
    onSuccess: ({ nouveauSolde, montant, entry }) => {
      queryClient.invalidateQueries({ queryKey: entry.entityType === 'boutique' ? ["boutiques-dettes"] : ["restaurants-dettes"] });
      if (detailEntry?.id === entry.id) {
        setDetailEntry({ ...detailEntry, montantDu: nouveauSolde });
      }
      toast.success(`Paiement de ${montant.toLocaleString()} F enregistré`);
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ctx.qKey, ctx.prev);
      toast.error("Erreur : " + (err.message || "Échec"));
    },
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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/50 px-4 py-5 max-w-2xl mx-auto space-y-5">
      {/* Header premium */}
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-1.5 rounded-full h-9 w-9 p-0"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-lg shadow-primary/20">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">Dû Utilisateur</h1>
            <p className="text-xs text-gray-500">Gestion des commissions & dettes</p>
          </div>
        </div>
      </div>

      {/* Onglets premium */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100">
        <button onClick={() => setActiveTab("livreurs")}
          className={`flex-1 min-w-[70px] py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "livreurs" ? "bg-gradient-to-br from-primary to-red-600 text-white shadow-md shadow-primary/20" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
          💼 Livreurs
        </button>
        <button onClick={() => setActiveTab("boutiques")}
          className={`flex-1 min-w-[70px] py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "boutiques" ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
          🏪 Boutiques
        </button>
        <button onClick={() => setActiveTab("restaurants")}
          className={`flex-1 min-w-[70px] py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "restaurants" ? "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-md shadow-red-500/20" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
          🍽️ Restaurants
        </button>
        <button onClick={() => setActiveTab("frais")}
          className={`flex-1 min-w-[70px] py-2.5 rounded-xl text-xs font-bold transition-all relative whitespace-nowrap ${activeTab === "frais" ? "bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
          🚫 Frais
          {nbImpayeFrais > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">{nbImpayeFrais}</span>}
        </button>
      </div>

      {/* ── Onglet Livreurs ── */}
      {activeTab === "livreurs" && (
        <>
          {/* Total dû — carte premium */}
          <div className="relative overflow-hidden bg-gradient-to-br from-red-500 via-red-600 to-orange-500 rounded-3xl p-5 text-white shadow-xl shadow-red-500/20">
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/5" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80 font-medium">Total dû par les livreurs</p>
                <p className="text-3xl font-black tracking-tight mt-0.5">{totalDu.toLocaleString()} <span className="text-sm font-normal opacity-80">FCFA</span></p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filtres premium */}
          <div className="flex gap-1.5 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
            {FILTRES.map(f => (
              <button key={f.id} onClick={() => setFiltre(f.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filtre === f.id ? "bg-gradient-to-br from-primary to-red-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Liste — cartes premium */}
          {recapList.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-7 h-7 opacity-40" />
              </div>
              <p className="text-sm font-medium">Aucun livreur dans ce filtre</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recapList.map(entry => {
                const sf = statutFinancier(entry.montantDu, entry.montantPaye);
                const isBloque = entry.livreurInfo?.actif === false;
                return (
                  <div key={entry.id} className={`bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all ${isBloque ? "border-red-200 bg-red-50/30" : "border-gray-100"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${isBloque ? "bg-red-100 text-red-600" : "bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700"}`}>
                          {(entry.prenom?.[0] || "") + (entry.nom?.[0] || "")}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-foreground text-sm truncate">{entry.prenom} {entry.nom}</p>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${sf.dot}`} />
                          </div>
                          {entry.telephone && <p className="text-xs text-gray-400 truncate">{entry.telephone}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-foreground tracking-tight">{entry.montantDu.toLocaleString()}<span className="text-[10px] font-normal text-gray-400 ml-0.5">F</span></p>
                        <p className={`text-[10px] font-semibold ${entry.montantDu > 0 ? "text-red-500" : "text-green-500"}`}>{sf.label}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1 h-9 text-xs rounded-xl font-semibold" onClick={() => setDetailEntry(entry)}>
                        Détails
                      </Button>
                      {entry.montantDu > 0 && (
                        <Button size="sm" className="flex-1 h-9 text-xs bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl font-semibold border-0"
                          disabled={paiementMutation.isPending}
                          onClick={() => setConfirmEncaisser({ entry, montant: entry.montantDu })}>
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

      {/* ── Onglet Boutiques ── */}
      {activeTab === "boutiques" && (
        <>
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 rounded-3xl p-5 text-white shadow-xl shadow-amber-500/20">
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/5" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80 font-medium">Total dû par les boutiques</p>
                <p className="text-3xl font-black tracking-tight mt-0.5">{recapBoutiques.totalDuGlobal.toLocaleString()} <span className="text-sm font-normal opacity-80">FCFA</span></p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Store className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="flex gap-1.5 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
            {FILTRES.map(f => (
              <button key={f.id} onClick={() => setFiltre(f.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filtre === f.id ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {recapBoutiques.list.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                <Store className="w-7 h-7 text-amber-300" />
              </div>
              <p className="text-sm font-medium">Aucune boutique dans ce filtre</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recapBoutiques.list.map(entry => {
                const sf = statutFinancier(entry.montantDu, entry.montantPaye);
                return (
                  <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-foreground text-sm truncate">{entry.nom}</p>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${sf.dot}`} />
                          </div>
                          {entry.telephone && <p className="text-xs text-gray-400 truncate">{entry.telephone}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-foreground tracking-tight">{entry.montantDu.toLocaleString()}<span className="text-[10px] font-normal text-gray-400 ml-0.5">F</span></p>
                        <p className={`text-[10px] font-semibold ${entry.montantDu > 0 ? "text-red-500" : "text-green-500"}`}>{sf.label}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1 h-9 text-xs rounded-xl font-semibold" onClick={() => setDetailEntry(entry)}>
                        Détails
                      </Button>
                      {entry.montantDu > 0 && (
                        <Button size="sm" className="flex-1 h-9 text-xs bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl font-semibold border-0"
                          disabled={etablissementPaiementMutation.isPending}
                          onClick={() => setConfirmEncaisser({ entry, montant: entry.montantDu })}>
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

      {/* ── Onglet Restaurants ── */}
      {activeTab === "restaurants" && (
        <>
          <div className="relative overflow-hidden bg-gradient-to-br from-red-500 via-rose-500 to-rose-600 rounded-3xl p-5 text-white shadow-xl shadow-rose-500/20">
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/5" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80 font-medium">Total dû par les restaurants</p>
                <p className="text-3xl font-black tracking-tight mt-0.5">{recapRestaurants.totalDuGlobal.toLocaleString()} <span className="text-sm font-normal opacity-80">FCFA</span></p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="flex gap-1.5 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
            {FILTRES.map(f => (
              <button key={f.id} onClick={() => setFiltre(f.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${filtre === f.id ? "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {recapRestaurants.list.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <UtensilsCrossed className="w-7 h-7 text-red-300" />
              </div>
              <p className="text-sm font-medium">Aucun restaurant dans ce filtre</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recapRestaurants.list.map(entry => {
                const sf = statutFinancier(entry.montantDu, entry.montantPaye);
                return (
                  <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center shrink-0">
                          <UtensilsCrossed className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-foreground text-sm truncate">{entry.nom}</p>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${sf.dot}`} />
                          </div>
                          {entry.telephone && <p className="text-xs text-gray-400 truncate">{entry.telephone}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-foreground tracking-tight">{entry.montantDu.toLocaleString()}<span className="text-[10px] font-normal text-gray-400 ml-0.5">F</span></p>
                        <p className={`text-[10px] font-semibold ${entry.montantDu > 0 ? "text-red-500" : "text-green-500"}`}>{sf.label}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" className="flex-1 h-9 text-xs rounded-xl font-semibold" onClick={() => setDetailEntry(entry)}>
                        Détails
                      </Button>
                      {entry.montantDu > 0 && (
                        <Button size="sm" className="flex-1 h-9 text-xs bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl font-semibold border-0"
                          disabled={etablissementPaiementMutation.isPending}
                          onClick={() => setConfirmEncaisser({ entry, montant: entry.montantDu })}>
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
          <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-amber-500 to-amber-600 rounded-3xl p-5 text-white shadow-xl shadow-orange-500/20">
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/5" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80 font-medium">Frais d'annulation impayés</p>
                <p className="text-3xl font-black tracking-tight mt-0.5">{totalImpayeFrais.toLocaleString()} <span className="text-sm font-normal opacity-80">FCFA</span></p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Rechercher un client ou livreur..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl h-10" />
          </div>

          {fraisLoading ? (
            <div className="text-center py-16 text-gray-400">
              <div className="w-12 h-12 rounded-full border-3 border-gray-200 border-t-primary animate-spin mx-auto mb-3" />
              <p className="text-sm">Chargement...</p>
            </div>
          ) : fraisFiltres.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-7 h-7 opacity-40" />
              </div>
              <p className="text-sm font-medium">Aucun frais</p>
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

      {/* ── Modal de confirmation Encaisser ── */}
      {confirmEncaisser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmEncaisser(null)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Confirmer l'encaissement</h3>
              <p className="text-sm text-gray-500 mt-1">
                Encaisser <span className="font-bold text-green-600">{confirmEncaisser.montant.toLocaleString()} F</span> de
              </p>
              <p className="font-bold text-gray-900 mt-0.5">{confirmEncaisser.entry.prenom} {confirmEncaisser.entry.nom}</p>
              <div className="flex gap-2 mt-5">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmEncaisser(null)}>Annuler</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700"
                  disabled={paiementMutation.isPending || etablissementPaiementMutation.isPending}
                  onClick={() => {
                    const { entry, montant } = confirmEncaisser;
                    if (entry.entityType === 'boutique' || entry.entityType === 'restaurant') {
                      etablissementPaiementMutation.mutate({ entry, montant });
                    } else {
                      paiementMutation.mutate({ entry, montant });
                    }
                    setConfirmEncaisser(null);
                  }}>
                  Confirmer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailEntry && (
        <DetailModal
          entry={detailEntry}
          livreurInfo={detailEntry.livreurInfo}
          onClose={() => setDetailEntry(null)}
          onPaiement={(entry, montant) => {
            if (entry.entityType === 'boutique' || entry.entityType === 'restaurant') {
              etablissementPaiementMutation.mutate({ entry, montant });
            } else {
              paiementMutation.mutate({ entry, montant });
            }
          }}
          onBloquer={() => blockMutation.mutate({ id: detailEntry.id, actif: false })}
          onDebloquer={() => blockMutation.mutate({ id: detailEntry.id, actif: true })}
          isPending={paiementMutation.isPending || etablissementPaiementMutation.isPending}
        />
      )}
    </div>
  );
}