import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Package, Minus, DollarSign, BarChart3, CreditCard, Clock, CheckCircle, XCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import PaiementSilgappModal from "@/components/partenaire/PaiementSilgappModal";

function formatMontant(v) {
  return `${(v || 0).toLocaleString('fr-FR')}`;
}

function PctBadge({ value }) {
  if (value === null || value === undefined) return <Minus className="w-3 h-3 text-gray-300" />;
  const positif = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ml-1.5 ${positif ? 'text-emerald-600' : 'text-red-500'}`}>
      {positif ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positif ? '+' : ''}{value}%
    </span>
  );
}

const STATUTS_LABELS = {
  commande_envoyee: "Reçue",
  commande_recue: "Reçue",
  paiement_verification: "Paiement à vérifier",
  paiement_valide: "Paiement validé",
  en_preparation: "En préparation",
  prete_recuperation: "Prête",
  livreur_assigne: "Livreur assigné",
  en_livraison: "En livraison",
  livree: "Livrée",
  annulee: "Annulée",
};

const PAIEMENT_STATUT = {
  en_attente: { label: "En attente", color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
  confirme: { label: "Confirmé", color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
  refuse: { label: "Refusé", color: "text-red-500", bg: "bg-red-50", icon: XCircle },
};

export default function ComptabilitePartenaire({ type }) {
  const [periodPreset, setPeriodPreset] = useState("month");
  const [showPaiementModal, setShowPaiementModal] = useState(false);
  const queryClient = useQueryClient();

  const now = new Date();
  const periodDates = useMemo(() => {
    switch (periodPreset) {
      case "month": return { debut: format(startOfMonth(now), 'yyyy-MM-dd'), fin: format(endOfMonth(now), 'yyyy-MM-dd') };
      case "year": return { debut: format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'), fin: format(now, 'yyyy-MM-dd') };
      case "all": return { debut: '2024-01-01', fin: format(now, 'yyyy-MM-dd') };
      default: return { debut: format(startOfMonth(now), 'yyyy-MM-dd'), fin: format(endOfMonth(now), 'yyyy-MM-dd') };
    }
  }, [periodPreset]);

  const { data: compta, isLoading } = useQuery({
    queryKey: ["compta-partenaire", type, periodPreset],
    queryFn: () => base44.functions.invoke("getComptabilitePartenaire", {
      type,
      date_debut: periodDates.debut,
      date_fin: periodDates.fin,
    }).then(r => r.data),
    initialData: null,
    refetchInterval: 60000,
  });

  const kpis = compta?.kpis || {};
  const evolution = compta?.evolution || [];
  const topProduits = compta?.top_produits || [];
  const parStatut = compta?.par_statut || {};
  const paiements = compta?.paiements || [];

  if (isLoading && !compta) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900 text-sm">📊 Comptabilité</h2>
        <select value={periodPreset} onChange={e => setPeriodPreset(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-semibold">
          <option value="month">Ce mois</option>
          <option value="year">Cette année</option>
          <option value="all">Tout</option>
        </select>
      </div>

      <p className="text-xs text-gray-400 -mt-3">
        {format(new Date(periodDates.debut), 'dd MMM yyyy', { locale: fr })} → {format(new Date(periodDates.fin), 'dd MMM yyyy', { locale: fr })}
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Chiffre d'affaires</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-lg font-black text-emerald-600">{formatMontant(kpis.ca_total)}</p>
              <span className="text-xs text-gray-400">FCFA</span>
              <PctBadge value={kpis.pct_ca} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{kpis.nb_commandes || 0} commandes</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Net partenaire</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-lg font-black text-violet-600">{formatMontant(kpis.net_partenaire)}</p>
              <span className="text-xs text-gray-400">FCFA</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Après commission SILGAPP</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-red-50/50">
          <CardContent className="p-4">
            <p className="text-[10px] text-red-500 font-medium uppercase tracking-wider flex items-center gap-1">
              <Wallet className="w-3 h-3" /> Dû à SILGAPP
            </p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-lg font-black text-red-600">{formatMontant(kpis.du_silga_restant)}</p>
              <span className="text-xs text-gray-400">FCFA</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {kpis.total_paye_confirme > 0 && `Payé: ${formatMontant(kpis.total_paye_confirme)} F · `}
              {kpis.total_paye_en_attente > 0 && `En attente: ${formatMontant(kpis.total_paye_en_attente)} F`}
              {(!kpis.total_paye_confirme && !kpis.total_paye_en_attente) && `Commission ~${kpis.taux_commission_moyen || 0}%`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Commandes livrées</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-lg font-black text-blue-600">{kpis.nb_livrees || 0}</p>
              <span className="text-xs text-gray-400">/ {kpis.nb_commandes || 0}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{kpis.nb_annulees || 0} annulée(s)</p>
          </CardContent>
        </Card>
      </div>

      {/* Bouton Payer SILGAPP */}
      <button
        onClick={() => setShowPaiementModal(true)}
        disabled={!kpis.du_silga_restant || kpis.du_silga_restant <= 0}
        className="w-full bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-red-500/30 disabled:opacity-40 disabled:shadow-none transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        <CreditCard className="w-4 h-4" />
        Payer SILGAPP
        {kpis.du_silga_restant > 0 && (
          <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">{formatMontant(kpis.du_silga_restant)} F</span>
        )}
      </button>

      {/* Évolution CA */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold text-gray-700 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            Évolution du CA
          </CardTitle>
        </CardHeader>
        <CardContent>
          {evolution.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={evolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `${v.toLocaleString('fr-FR')} FCFA`} />
                <Line type="monotone" dataKey="ca" stroke="#10b981" strokeWidth={2} dot={false} name="CA" />
                <Line type="monotone" dataKey="commission" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Commission" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 text-sm py-6">Aucune donnée</p>
          )}
        </CardContent>
      </Card>

      {/* Historique paiements SILGAPP */}
      {paiements.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-red-500" />
              Mes paiements SILGAPP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paiements.map((p) => {
                const st = PAIEMENT_STATUT[p.statut] || PAIEMENT_STATUT.en_attente;
                const Icon = st.icon;
                return (
                  <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.preuve_url && <img src={p.preuve_url} alt="Preuve" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-xs">{formatMontant(p.montant)} FCFA</p>
                        <p className="text-[10px] text-gray-400">{format(new Date(p.created_date), 'dd MMM yyyy', { locale: fr })}</p>
                        {p.statut === 'refuse' && p.motif_refus && (
                          <p className="text-[10px] text-red-500 truncate">Refusé: {p.motif_refus}</p>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${st.bg} ${st.color} flex items-center gap-1 flex-shrink-0`}>
                      <Icon className="w-3 h-3" /> {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top produits */}
      {topProduits.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
              Top {type === "restaurant" ? "plats" : "produits"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topProduits.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">{i + 1}</span>
                    <span className="text-gray-700 truncate">{p.nom}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-gray-400">×{p.quantite}</span>
                    <span className="font-bold text-gray-900">{formatMontant(p.ca)} F</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Répartition par statut */}
      {Object.keys(parStatut).length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-violet-500" />
              Commandes par statut
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {Object.entries(parStatut).map(([statut, data]) => (
                <div key={statut} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{STATUTS_LABELS[statut] || statut}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">{data.nb} cmd</span>
                    <span className="font-bold text-gray-900">{formatMontant(data.ca)} F</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showPaiementModal && (
        <PaiementSilgappModal
          type={type}
          duRestant={kpis.du_silga_restant || 0}
          onClose={() => setShowPaiementModal(false)}
          onPaid={() => queryClient.invalidateQueries({ queryKey: ["compta-partenaire"] })}
        />
      )}
    </div>
  );
}