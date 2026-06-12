import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Download, Users, TrendingUp, Globe, Calendar, Clock, 
  BarChart3, Smartphone, Monitor, ArrowLeft, Phone as PhoneIcon
} from "lucide-react";
import { useAdminContext } from "@/hooks/useAdminContext.js";

const PAYS = {
  BF: { nom: "Burkina Faso", emoji: "🇧🇫" },
  CI: { nom: "Côte d'Ivoire", emoji: "🇨🇮" },
  TG: { nom: "Togo", emoji: "🇹🇬" },
  BJ: { nom: "Bénin", emoji: "🇧🇯" },
  SN: { nom: "Sénégal", emoji: "🇸🇳" },
  ML: { nom: "Mali", emoji: "🇲🇱" },
  GN: { nom: "Guinée", emoji: "🇬🇳" },
  NE: { nom: "Niger", emoji: "🇳🇪" },
};

const SOURCES = {
  facebook: { label: "Facebook", icon: Users, color: "text-blue-600" },
  whatsapp: { label: "WhatsApp", icon: PhoneIcon, color: "text-green-600" },
  tiktok: { label: "TikTok", icon: TrendingUp, color: "text-pink-600" },
  twitter: { label: "Twitter/X", icon: Users, color: "text-sky-600" },
  instagram: { label: "Instagram", icon: Users, color: "text-purple-600" },
  direct: { label: "Direct", icon: Globe, color: "text-gray-600" },
};

export default function StatsTelechargements() {
  const { isGlobal, isPays } = useAdminContext();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const { data: allStats = [] } = useQuery({
    queryKey: ["download-stats"],
    queryFn: () => base44.entities.DownloadStats.list("-created_date", 10000),
    initialData: [],
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (allStats.length > 0 || !loading) {
      calculateStats();
    }
  }, [allStats]);

  const calculateStats = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const result = {
      total: { visits: 0, clicks: 0, downloads: 0 },
      today: { visits: 0, clicks: 0, downloads: 0 },
      yesterday: { visits: 0, clicks: 0, downloads: 0 },
      week: { visits: 0, clicks: 0, downloads: 0 },
      month: { visits: 0, clicks: 0, downloads: 0 },
      byCountry: {},
      byPlatform: { android: 0, ios: 0, web: 0 },
      bySource: { facebook: 0, whatsapp: 0, tiktok: 0, twitter: 0, instagram: 0, direct: 0 },
      lastDownload: null,
    };

    // Initialize country counters
    Object.keys(PAYS).forEach(code => {
      result.byCountry[code] = { visits: 0, clicks: 0, downloads: 0 };
    });

    allStats.forEach(record => {
      const recordDate = new Date(record.created_date);
      const visits = record.page_visits || 0;
      const clicks = record.clicks || 0;
      const downloads = record.downloads || 0;

      const isToday = recordDate >= today;
      const isYesterday = recordDate >= yesterday && recordDate < today;
      const isWeek = recordDate >= weekAgo;
      const isMonth = recordDate >= monthAgo;

      // Total
      result.total.visits += visits;
      result.total.clicks += clicks;
      result.total.downloads += downloads;

      // Today
      if (isToday) {
        result.today.visits += visits;
        result.today.clicks += clicks;
        result.today.downloads += downloads;
      }

      // Yesterday
      if (isYesterday) {
        result.yesterday.visits += visits;
        result.yesterday.clicks += clicks;
        result.yesterday.downloads += downloads;
      }

      // Week
      if (isWeek) {
        result.week.visits += visits;
        result.week.clicks += clicks;
        result.week.downloads += downloads;
      }

      // Month
      if (isMonth) {
        result.month.visits += visits;
        result.month.clicks += clicks;
        result.month.downloads += downloads;
      }

      // By country
      const cc = record.country_code || "BF";
      if (result.byCountry[cc]) {
        result.byCountry[cc].visits += visits;
        result.byCountry[cc].clicks += clicks;
        result.byCountry[cc].downloads += downloads;
      }

      // By platform
      const plat = record.platform || "web";
      if (result.byPlatform[plat] !== undefined) {
        result.byPlatform[plat] += downloads;
      }

      // By source
      const source = record.referrer || "direct";
      if (result.bySource[source] !== undefined) {
        result.bySource[source] += downloads;
      }

      // Last download
      if (downloads > 0 && (!result.lastDownload || recordDate > new Date(result.lastDownload))) {
        result.lastDownload = recordDate;
      }
    });

    setStats(result);
    setLoading(false);
  };

  // Sort countries by downloads
  const sortedCountries = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.byCountry)
      .filter(([_, data]) => data.downloads > 0)
      .sort((a, b) => b[1].downloads - a[1].downloads);
  }, [stats?.byCountry]);

  // Sort sources by downloads
  const sortedSources = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.bySource)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [stats?.bySource]);

  // Conversion rates
  const todayConversionRate = stats?.today.visits > 0
    ? ((stats.today.downloads / stats.today.visits) * 100).toFixed(2)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Download className="w-12 h-12 mx-auto mb-4 text-gray-300 animate-bounce" />
          <p className="text-gray-500 font-medium">Chargement des statistiques...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 pt-5 pb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <Link to={isGlobal ? "/admin/global" : "/admin/externe"}>
              <button className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white/60 text-xs font-medium">Temps réel</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-2xl shadow-red-500/40">
              <Download className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white leading-tight">Téléchargements SILGAPP</h1>
              <p className="text-white/50 text-sm mt-0.5">Statistiques et analytics en temps réel</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <Badge className="bg-blue-100 text-blue-700 border-0">Aujourd'hui</Badge>
            </div>
            <p className="text-3xl font-black text-gray-900">{stats?.today.visits || 0}</p>
            <p className="text-xs text-gray-500 font-medium mt-1">Visites</p>
          </Card>

          <Card className="bg-white border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Download className="w-5 h-5 text-red-500" />
              </div>
              <Badge className="bg-red-100 text-red-700 border-0">Aujourd'hui</Badge>
            </div>
            <p className="text-3xl font-black text-gray-900">{stats?.today.downloads || 0}</p>
            <p className="text-xs text-gray-500 font-medium mt-1">Téléchargements</p>
          </Card>

          <Card className="bg-white border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <Badge className="bg-green-100 text-green-700 border-0">Total</Badge>
            </div>
            <p className="text-3xl font-black text-gray-900">{stats?.total.downloads || 0}</p>
            <p className="text-xs text-gray-500 font-medium mt-1">Téléchargements</p>
          </Card>

          <Card className="bg-white border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-purple-500" />
              </div>
              <Badge className="bg-purple-100 text-purple-700 border-0">Conversion</Badge>
            </div>
            <p className="text-3xl font-black text-gray-900">{todayConversionRate}%</p>
            <p className="text-xs text-gray-500 font-medium mt-1">Taux aujourd'hui</p>
          </Card>
        </div>

        {/* Stats par période */}
        <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Évolution par période</h2>
            <p className="text-xs text-gray-500 mt-0.5">Comparaison des performances</p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {[
                { period: "today", label: "Aujourd'hui", icon: Calendar },
                { period: "yesterday", label: "Hier", icon: Clock },
                { period: "week", label: "7 derniers jours", icon: Calendar },
                { period: "month", label: "Ce mois", icon: TrendingUp },
              ].map(({ period, label, icon: Icon }) => (
                <div key={period} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">Visites: {stats?.[period]?.visits || 0}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-red-600">{stats?.[period]?.downloads || 0}</p>
                    <p className="text-xs text-gray-500">téléchargements</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Répartition par pays */}
        <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Répartition par pays</h2>
              <p className="text-xs text-gray-500 mt-0.5">Téléchargements par région</p>
            </div>
            <Globe className="w-5 h-5 text-gray-400" />
          </div>
          <div className="divide-y divide-gray-50">
            {sortedCountries.length === 0 ? (
              <div className="p-8 text-center">
                <Globe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-400">Aucune donnée disponible</p>
              </div>
            ) : (
              sortedCountries.map(([code, data]) => (
                <div key={code} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{PAYS[code]?.emoji || "🌍"}</span>
                    <div>
                      <p className="font-semibold text-gray-900">{PAYS[code]?.nom || code}</p>
                      <p className="text-xs text-gray-500">{data.visits} visites</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-red-600">{data.downloads}</p>
                    <p className="text-xs text-gray-500">téléchargements</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Sources de trafic */}
        <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Sources de trafic</h2>
              <p className="text-xs text-gray-500 mt-0.5">Provenance des téléchargements</p>
            </div>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="divide-y divide-gray-50">
            {sortedSources.length === 0 ? (
              <div className="p-8 text-center">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-400">Aucune donnée disponible</p>
              </div>
            ) : (
              sortedSources.map(([source, count]) => {
                const SourceIcon = SOURCES[source]?.icon || Users;
                const color = SOURCES[source]?.color || "text-gray-500";
                const percentage = stats?.total.downloads > 0 
                  ? ((count / stats.total.downloads) * 100).toFixed(1)
                  : 0;
                
                return (
                  <div key={source} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center`}>
                        <SourceIcon className={`w-5 h-5 ${color}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{SOURCES[source]?.label || source}</p>
                        <p className="text-xs text-gray-500">{percentage}% du total</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-gray-900">{count}</p>
                      <p className="text-xs text-gray-500">téléchargements</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Plateformes */}
        <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Plateformes</h2>
            <p className="text-xs text-gray-500 mt-0.5">Répartition par système</p>
          </div>
          <div className="p-6 grid grid-cols-3 gap-4">
            {[
              { key: "android", label: "Android", icon: Smartphone, color: "text-green-500", bg: "bg-green-50" },
              { key: "ios", label: "iOS", icon: PhoneIcon, color: "text-blue-500", bg: "bg-blue-50" },
              { key: "web", label: "Web", icon: Monitor, color: "text-purple-500", bg: "bg-purple-50" },
            ].map(({ key, label, icon: Icon, color, bg }) => (
              <div key={key} className={`${bg} rounded-xl p-4 text-center`}>
                <Icon className={`w-6 h-6 ${color} mx-auto mb-2`} />
                <p className="text-2xl font-black text-gray-900">{stats?.byPlatform[key] || 0}</p>
                <p className="text-xs text-gray-500 font-medium mt-1">{label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Dernier téléchargement */}
        {stats?.lastDownload && (
          <Card className="bg-white border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Dernier téléchargement</p>
                <p className="text-sm text-gray-500">
                  {new Date(stats.lastDownload).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}