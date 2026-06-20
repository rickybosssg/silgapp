import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, Package, Bike, Globe, TrendingUp, CheckCircle2, XCircle, Clock,
  Calendar, Flag, Database
} from "lucide-react";

export default function DemoDashboard({ token: propToken }) {
  const { token: paramToken } = useParams();
  const token = propToken || paramToken;
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const res = await fetch('/api/functions/getDemoStats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (!data.valid) {
          setInvalid(true);
          setLoading(false);
          return;
        }

        // Formater la date de dernière connexion
        const lastConn = data.stats.derniereConnexion;
        const formattedConn = lastConn
          ? new Date(lastConn).toLocaleDateString('fr-FR', {
              day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
            })
          : 'N/A';

        setStats({ ...data.stats, derniereConnexion: formattedConn });
        setLoading(false);
      } catch (err) {
        console.error(err);
        setInvalid(true);
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement du dashboard...</p>
        </div>
      </div>
    );
  }

  if (invalid || !stats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide ou expiré</h1>
          <p className="text-gray-500 text-sm">
            Ce lien d'accès démo n'est plus valide. Il a peut-être expiré ou a été révoqué.
          </p>
          <p className="text-gray-400 text-xs mt-4">
            Si vous êtes un administrateur, générez un nouveau lien depuis le panel admin.
          </p>
        </div>
      </div>
    );
  }

  const kpiCards = [
    { label: "Clients", value: stats.clients, sub: `${stats.clientsActifs} actifs`, icon: Users, color: "from-violet-500 to-purple-600" },
    { label: "Livreurs", value: stats.livreurs, sub: `${stats.livreursValides} validés`, icon: Bike, color: "from-blue-500 to-indigo-600" },
    { label: "Courses totales", value: stats.courses, sub: `${stats.coursesLivrees} livrées`, icon: Package, color: "from-orange-500 to-amber-600" },
    { label: "Pays", value: stats.paysUniques, sub: "couverts", icon: Globe, color: "from-emerald-500 to-teal-600" },
    { label: "En cours", value: stats.coursesEnCours, sub: "actives", icon: Clock, color: "from-cyan-500 to-sky-600" },
    { label: "30j récents", value: stats.coursesRecentes, sub: "courses", icon: TrendingUp, color: "from-rose-500 to-pink-600" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">📦</div>
              <div>
                <h1 className="text-xl font-black tracking-tight">SILGAPP</h1>
                <p className="text-white/60 text-xs">Dashboard de démonstration — Closed Testing Google Play</p>
              </div>
            </div>
            <Badge className="bg-green-500/20 text-green-300 border-green-500/30 px-3 py-1.5 text-xs gap-1.5">
              <Database className="w-3 h-3" />
              Données réelles en direct
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiCards.map(kpi => (
            <Card key={kpi.label} className="border-0 shadow-md overflow-hidden">
              <div className={`h-1.5 bg-gradient-to-r ${kpi.color}`} />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <kpi.icon className="w-4 h-4 text-gray-400" />
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">{kpi.label}</span>
                </div>
                <p className="text-2xl font-black text-gray-900">{kpi.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Répartition par type */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              Répartition par type de course
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Expéditions", value: stats.coursesExpedier, icon: "📤", color: "bg-blue-50 text-blue-700" },
                { label: "Réceptions", value: stats.coursesRecevoir, icon: "📥", color: "bg-green-50 text-green-700" },
                { label: "Déplacements", value: stats.coursesDeplacement, icon: "🚗", color: "bg-purple-50 text-purple-700" },
              ].map(t => (
                <div key={t.label} className={`${t.color} rounded-xl p-4 text-center`}>
                  <span className="text-2xl">{t.icon}</span>
                  <p className="text-2xl font-black mt-1">{t.value}</p>
                  <p className="text-xs opacity-70">{t.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Par pays */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Flag className="w-4 h-4 text-gray-400" />
              Performance par pays
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.statsByPays.map(p => (
                <div key={p.code} className="bg-gray-50 rounded-xl p-4 flex items-center gap-3 hover:bg-gray-100 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-xl">
                    {p.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900">{p.nom}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{p.courses} courses</span>
                      <span>•</span>
                      <span>{p.livrees} livrées</span>
                      <span>•</span>
                      <span>{p.livreurs} livreurs</span>
                      <span>•</span>
                      <span>{p.clients} clients</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Dernières courses */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              Dernières courses livrées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-gray-500 font-medium text-xs">Date</th>
                    <th className="text-left py-2 text-gray-500 font-medium text-xs">Type</th>
                    <th className="text-left py-2 text-gray-500 font-medium text-xs">Pays</th>
                    <th className="text-left py-2 text-gray-500 font-medium text-xs">Client</th>
                    <th className="text-left py-2 text-gray-500 font-medium text-xs">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.dernieresLivrees.map((c, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 text-gray-700 text-xs">
                        {new Date(c.created_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-[10px]">
                          {c.type_course === 'expedier' ? '📤 Expédition' : c.type_course === 'recevoir' ? '📥 Réception' : '🚗 Déplacement'}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-gray-700 text-xs">{c.country_code || '-'}</td>
                      <td className="py-2.5 text-gray-700 text-xs">{c.client_nom || '-'}</td>
                      <td className="py-2.5">
                        <Badge className="bg-green-100 text-green-700 text-[10px] border-green-200">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                          Livrée
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-8">
          <p className="text-xs text-gray-400">
            SILGAPP — Dashboard démo généré le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' • '}Dernière activité : {stats.derniereConnexion}
          </p>
          <p className="text-[10px] text-gray-300 mt-1">
            Plateforme logistique de livraison dernier kilomètre — Afrique de l'Ouest
          </p>
        </div>
      </div>
    </div>
  );
}