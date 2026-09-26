import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2, Truck, Package, TrendingUp, Wallet, RefreshCw,
  Search, AlertTriangle, Eye, ArrowLeft, Users, Ban, CheckCircle,
} from "lucide-react";

/**
 * SuiviEnterprise — Vue consolidée Super Admin de TOUTES les Enterprises.
 *
 * Accessible depuis: /admin/suivi-enterprise
 *
 * Réservé au Super Admin SILGAPP (user.role === 'admin').
 * Un admin_entreprise ne peut PAS accéder à cette page (backend renvoie 403).
 *
 * Sources financières :
 *   - Cache Enterprise (affichage rapide)
 *   - EnterpriseLedger (source de vérité, recomputed pour détection divergence)
 *   - Les divergences sont SIGNALÉES, jamais corrigées silencieusement.
 */
export default function SuiviEnterprise() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getEnterpriseGlobalSuivi", {
        country_code: countryFilter !== "all" ? countryFilter : null,
      });
      const d = res?.data || res;
      setData(d);
    } catch (err) {
      setError(err?.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [countryFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="p-6 text-center">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Chargement du suivi global...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500 mb-2">{error}</p>
        <Button size="sm" onClick={load}>Réessayer</Button>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, enterprises, divergence_count, divergence_enterprise_ids } = data;

  // ── Filtres ──
  const countries = [...new Set((enterprises || []).map((e) => e.country_code).filter(Boolean))].sort();
  const filtered = (enterprises || []).filter((e) => {
    if (statusFilter !== "all" && e.statut !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (e.nom || "").toLowerCase().includes(q) || (e.nom_commercial || "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* ── En-tête ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Suivi Enterprise
          </h1>
          <p className="text-sm text-gray-500">Vision consolidée de toutes les sociétés Enterprise</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* ── Alerte divergence ── */}
      {divergence_count > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">
                {divergence_count} entreprise(s) avec divergence cache/ledger
              </p>
              <p className="text-xs text-amber-700">
                Les montants du cache Enterprise ne correspondent pas au EnterpriseLedger.
                Vérifiez le détail de chaque entreprise. Aucune correction automatique effectuée.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPI Globaux ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Building2} label="Entreprises" value={kpis.enterprises.total} sub={`${kpis.enterprises.actives} actives · ${kpis.enterprises.suspendues} suspendues`} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard icon={Truck} label="Livreurs Enterprise" value={kpis.livreurs.total} sub={`${kpis.livreurs.actifs} actifs · ${kpis.livreurs.disponibles} dispo`} color="text-indigo-600" bg="bg-indigo-50" />
        <KpiCard icon={Package} label="Courses Enterprise" value={kpis.courses.total} sub={`${kpis.courses.today} aujourd'hui · ${kpis.courses.livrees} livrées`} color="text-cyan-600" bg="bg-cyan-50" />
        <KpiCard icon={TrendingUp} label="Volume total" value={`${kpis.finance.volume_total.toLocaleString("fr-FR")} F`} sub={`Comm: ${kpis.finance.commissions_silgapp.toLocaleString("fr-FR")} F`} color="text-purple-600" bg="bg-purple-50" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label="Commissions SILGAPP" value={`${kpis.finance.commissions_silgapp.toLocaleString("fr-FR")} F`} sub={`Ledger: ${kpis.finance.ledger_commissions.toLocaleString("fr-FR")} F`} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard icon={Wallet} label="Paiements reçus" value={`${kpis.finance.paiements_recus.toLocaleString("fr-FR")} F`} sub={`Ledger: ${kpis.finance.ledger_paiements.toLocaleString("fr-FR")} F`} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiCard icon={Wallet} label="Montant dû à SILGAPP" value={`${kpis.finance.montant_du.toLocaleString("fr-FR")} F`} sub={`Ledger: ${kpis.finance.ledger_du.toLocaleString("fr-FR")} F`} color="text-red-600" bg="bg-red-50" />
        <KpiCard icon={Users} label="Livreurs en course" value={kpis.livreurs.en_course} sub={`${kpis.livreurs.hors_ligne} hors ligne`} color="text-orange-600" bg="bg-orange-50" />
      </div>

      {/* ── Filtres ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une entreprise..."
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
        >
          <option value="all">Tous statuts</option>
          <option value="actif">Actives</option>
          <option value="suspendu">Suspendues</option>
        </select>
        {countries.length > 0 && (
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
          >
            <option value="all">Tous pays</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Tableau par entreprise ── */}
      <Card className="overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-600 whitespace-nowrap">Entreprise</th>
                <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Pays</th>
                <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Livreurs</th>
                <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Actifs</th>
                <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Courses</th>
                <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Aujourd'hui</th>
                <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Livrées</th>
                <th className="text-right px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Volume</th>
                <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Taux</th>
                <th className="text-right px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Commissions</th>
                <th className="text-right px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Payé</th>
                <th className="text-right px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Reste dû</th>
                <th className="text-center px-2 py-2 font-semibold text-gray-600 whitespace-nowrap">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ent) => (
                <tr
                  key={ent.id}
                  className="border-b hover:bg-blue-50/50 cursor-pointer transition-colors"
                  onClick={() => {
                    // Redirige vers la page de gestion existante avec cette entreprise
                    window.location.href = `/admin/entreprises?ent=${ent.enterprise_financier_id}`;
                  }}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: ent.couleur_primaire || "#007AFF" }}>
                        {ent.logo_url ? <img src={ent.logo_url} alt="" className="w-full h-full object-cover rounded-lg" /> : <Building2 className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate max-w-[140px]">{ent.nom_commercial || ent.nom}</p>
                        {divergence_enterprise_ids?.includes(ent.enterprise_financier_id) && (
                          <span className="text-[9px] text-amber-600 font-bold flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> divergence
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="text-center px-2 py-2 text-gray-600">{ent.country_code}</td>
                  <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.nb_livreurs}</td>
                  <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.nb_livreurs_actifs}</td>
                  <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.nb_courses}</td>
                  <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.nb_courses_today}</td>
                  <td className="text-center px-2 py-2 text-emerald-600 tabular-nums">{ent.nb_courses_livrees}</td>
                  <td className="text-right px-2 py-2 text-gray-600 tabular-nums whitespace-nowrap">{ent.volume_courses_total.toLocaleString("fr-FR")} F</td>
                  <td className="text-center px-2 py-2 text-gray-600 tabular-nums">{ent.commission_silgapp_pct}%</td>
                  <td className="text-right px-2 py-2 text-amber-600 tabular-nums whitespace-nowrap">{ent.total_commissions_silgapp.toLocaleString("fr-FR")} F</td>
                  <td className="text-right px-2 py-2 text-emerald-600 tabular-nums whitespace-nowrap">{ent.total_paiements.toLocaleString("fr-FR")} F</td>
                  <td className="text-right px-2 py-2 text-red-600 font-bold tabular-nums whitespace-nowrap">{ent.montant_du_silgapp.toLocaleString("fr-FR")} F</td>
                  <td className="text-center px-2 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ent.statut === "actif" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {ent.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y">
          {filtered.map((ent) => (
            <div
              key={ent.id}
              className="p-3 cursor-pointer hover:bg-blue-50/50"
              onClick={() => { window.location.href = `/admin/entreprises?ent=${ent.enterprise_financier_id}`; }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: ent.couleur_primaire || "#007AFF" }}>
                  {ent.logo_url ? <img src={ent.logo_url} alt="" className="w-full h-full object-cover rounded-lg" /> : <Building2 className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{ent.nom_commercial || ent.nom}</p>
                  <p className="text-[10px] text-gray-500">{ent.country_code} · {ent.statut}</p>
                </div>
                {divergence_enterprise_ids?.includes(ent.enterprise_financier_id) && (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-600">
                <div><span className="font-bold text-gray-900">{ent.nb_livreurs}</span> livreurs</div>
                <div><span className="font-bold text-gray-900">{ent.nb_courses}</span> courses</div>
                <div><span className="font-bold text-gray-900">{ent.nb_courses_today}</span> aujourd'hui</div>
                <div><span className="font-bold text-gray-900">{ent.commission_silgapp_pct}%</span> taux</div>
                <div><span className="font-bold text-emerald-600">{ent.total_paiements.toLocaleString("fr-FR")}</span> payé</div>
                <div><span className="font-bold text-red-600">{ent.montant_du_silgapp.toLocaleString("fr-FR")}</span> dû</div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="p-8 text-center">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Aucune entreprise trouvée</p>
          </div>
        )}
      </Card>

      <p className="text-[10px] text-gray-400 text-center">
        Données agrégées depuis Enterprise, Livreur, CourseExterne et EnterpriseLedger.
        Le Super Admin conserve enterprise_id = null. Aucun accès cross-tenant pour les admins entreprise.
      </p>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, bg }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
        {sub && <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}