import React from "react";
import { Card } from "@/components/ui/card";
import { Target, TrendingUp, Users, Package, DollarSign } from "lucide-react";

export default function GrowthAttributionTable({ data }) {
  if (!data) {
    return (
      <Card className="p-4">
        <p className="text-xs text-slate-400 text-center">Chargement des attributions...</p>
      </Card>
    );
  }

  const { global, campaigns, meta_synced_at } = data;

  const formatNumber = (v) => {
    const n = Number(v || 0);
    return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
  };

  const formatMoney = (v) => {
    const n = Number(v || 0);
    return n > 0 ? `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} F` : "—";
  };

  return (
    <div className="space-y-3">
      {/* ── KPIs globaux d'attribution ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Installations attribuées</span>
          </div>
          <p className="text-lg font-bold text-slate-800">{formatNumber(global?.attributed_installs)}</p>
          <p className="text-[10px] text-slate-400">sur {formatNumber(global?.total_installs)} total ({global?.attribution_rate}%)</p>
        </Card>
        <Card className="p-3 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-3.5 w-3.5 text-green-600" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Inscriptions attribuées</span>
          </div>
          <p className="text-lg font-bold text-slate-800">{formatNumber(global?.attributed_signups)}</p>
        </Card>
        <Card className="p-3 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Clients attribués</span>
          </div>
          <p className="text-lg font-bold text-slate-800">{formatNumber(global?.attributed_clients)}</p>
        </Card>
        <Card className="p-3 bg-white">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-3.5 w-3.5 text-purple-600" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Dépense Meta totale</span>
          </div>
          <p className="text-lg font-bold text-slate-800">{formatMoney(global?.total_meta_spend)}</p>
        </Card>
      </div>

      {/* ── Tableau par campagne ── */}
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            Attribution par campagne Meta
          </h3>
          {meta_synced_at && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              Dernière sync Meta : {new Date(meta_synced_at).toLocaleString("fr-FR")}
            </p>
          )}
        </div>

        {campaigns.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-xs text-slate-400">Aucune campagne Meta à afficher.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-500 uppercase">
                  <th className="px-2 py-2 font-semibold">Campagne</th>
                  <th className="px-2 py-2 font-semibold text-center">Dépense</th>
                  <th className="px-2 py-2 font-semibold text-center">Install.</th>
                  <th className="px-2 py-2 font-semibold text-center">Inscrip.</th>
                  <th className="px-2 py-2 font-semibold text-center">1ère course</th>
                  <th className="px-2 py-2 font-semibold text-center">2ème course</th>
                  <th className="px-2 py-2 font-semibold text-center">CPI</th>
                  <th className="px-2 py-2 font-semibold text-center">Coût/1ère course</th>
                  <th className="px-2 py-2 font-semibold text-center">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {campaigns.map((c) => (
                  <tr key={c.campaign_id} className="hover:bg-slate-50">
                    <td className="px-2 py-2">
                      <p className="font-medium text-slate-700 truncate max-w-[160px]">{c.campaign_name}</p>
                      <p className="text-[9px] text-slate-400">{c.objective}</p>
                    </td>
                    <td className="px-2 py-2 text-center font-medium text-slate-700">{formatMoney(c.meta_spend)}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{c.installs}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{c.signups}</td>
                    <td className="px-2 py-2 text-center text-green-600 font-medium">{c.first_courses}</td>
                    <td className="px-2 py-2 text-center text-blue-600 font-medium">{c.second_courses}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{c.cpi > 0 ? formatMoney(c.cpi) : "—"}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{c.cost_per_first_course > 0 ? formatMoney(c.cost_per_first_course) : "—"}</td>
                    <td className="px-2 py-2 text-center text-slate-600">{formatMoney(c.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-3 bg-amber-50 border-amber-100">
        <p className="text-[10px] text-amber-700 leading-relaxed">
          <strong>Attribution web (PWA) :</strong> les UTM sont capturés depuis l'URL de la page de téléchargement
          et stockés dans le navigateur. Lorsqu'un utilisateur ouvre SILGAPP dans le navigateur, l'attribution est
          automatiquement enregistrée dans AppInstall et préservée lors de l'inscription.
          <br />
          <strong>Attribution native (APK) :</strong> nécessite un rebuild APK avec deferred deep linking pour
          transférer les UTM du navigateur vers l'app native. Non implémenté pour le moment.
        </p>
      </Card>
    </div>
  );
}