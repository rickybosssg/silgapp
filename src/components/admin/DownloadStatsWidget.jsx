import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  TrendingUp, 
  Users, 
  Globe, 
  Smartphone, 
  Monitor, 
  Phone,
  Facebook,
  MessageCircle,
  Video,
  ArrowRight,
  Calendar,
  Clock
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

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
  facebook: { label: "Facebook", icon: Facebook, color: "text-blue-600" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "text-green-600" },
  tiktok: { label: "TikTok", icon: Video, color: "text-pink-600" },
  twitter: { label: "Twitter/X", icon: TrendingUp, color: "text-sky-600" },
  instagram: { label: "Instagram", icon: Video, color: "text-purple-600" },
  direct: { label: "Direct", icon: Users, color: "text-gray-600" },
};

export default function DownloadStatsWidget() {
  const [showDetails, setShowDetails] = useState(false);

  const { data: allStats = [] } = useQuery({
    queryKey: ["download-stats-widget"],
    queryFn: () => base44.entities.DownloadStats.list("-created_date", 10000),
    initialData: [],
    refetchInterval: 30000,
  });

  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const result = {
      total: { visits: 0, clicks: 0, downloads: 0 },
      today: { visits: 0, clicks: 0, downloads: 0 },
      byCountry: {},
      byPlatform: { android: 0, ios: 0, web: 0 },
      bySource: { facebook: 0, whatsapp: 0, tiktok: 0, twitter: 0, instagram: 0, direct: 0 },
    };

    Object.keys(PAYS).forEach(code => {
      result.byCountry[code] = { visits: 0, clicks: 0, downloads: 0 };
    });

    allStats.forEach(record => {
      const recordDate = new Date(record.created_date);
      const visits = record.page_visits || 0;
      const clicks = record.clicks || 0;
      const downloads = record.downloads || 0;

      result.total.visits += visits;
      result.total.clicks += clicks;
      result.total.downloads += downloads;

      if (recordDate >= today) {
        result.today.visits += visits;
        result.today.clicks += clicks;
        result.today.downloads += downloads;
      }

      const cc = record.country_code || "BF";
      if (result.byCountry[cc]) {
        result.byCountry[cc].visits += visits;
        result.byCountry[cc].clicks += clicks;
        result.byCountry[cc].downloads += downloads;
      }

      const plat = record.platform || "web";
      if (result.byPlatform[plat] !== undefined) {
        result.byPlatform[plat] += downloads;
      }

      const source = record.referrer || "direct";
      if (result.bySource[source] !== undefined) {
        result.bySource[source] += downloads;
      }
    });

    return result;
  }, [allStats]);

  const conversionRate = stats.total.visits > 0 
    ? ((stats.total.downloads / stats.total.visits) * 100).toFixed(2)
    : 0;

  const todayConversionRate = stats.today.visits > 0
    ? ((stats.today.downloads / stats.today.visits) * 100).toFixed(2)
    : 0;

  const sortedCountries = useMemo(() => {
    return Object.entries(stats.byCountry)
      .filter(([_, data]) => data.downloads > 0)
      .sort((a, b) => b[1].downloads - a[1].downloads)
      .slice(0, 5);
  }, [stats.byCountry]);

  const sortedSources = useMemo(() => {
    return Object.entries(stats.bySource)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [stats.bySource]);

  if (showDetails) {
    return (
      <Card className="bg-white border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-orange-500 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Download className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Statistiques Complètes</h3>
                <p className="text-white/80 text-xs">Téléchargements SILGAPP</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDetails(false)}
              className="text-white hover:bg-white/20"
            >
              ✕
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-blue-700 font-semibold">Visites (total)</span>
              </div>
              <p className="text-2xl font-black text-blue-900">{stats.total.visits}</p>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Download className="w-4 h-4 text-red-600" />
                <span className="text-xs text-red-700 font-semibold">Téléchargements</span>
              </div>
              <p className="text-2xl font-black text-red-900">{stats.total.downloads}</p>
            </div>

            <div className="bg-green-50 border border-green-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-700 font-semibold">Conversion (total)</span>
              </div>
              <p className="text-2xl font-black text-green-900">{conversionRate}%</p>
            </div>

            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span className="text-xs text-purple-700 font-semibold">Aujourd'hui</span>
              </div>
              <p className="text-2xl font-black text-purple-900">{stats.today.downloads}</p>
              <p className="text-[10px] text-purple-600">{todayConversionRate}% conversion</p>
            </div>
          </div>

          {/* Par pays */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-500" />
              Par pays (top 5)
            </h4>
            <div className="space-y-1.5">
              {sortedCountries.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Aucune donnée</p>
              ) : (
                sortedCountries.map(([code, data]) => (
                  <div key={code} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{PAYS[code]?.emoji || "🌍"}</span>
                      <span className="font-medium text-gray-700">{PAYS[code]?.nom || code}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-red-600">{data.downloads}</span>
                      <span className="text-gray-400 text-[10px] ml-1">téléch.</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Par plateforme */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-gray-500" />
              Par plateforme
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "android", label: "Android", icon: Smartphone, color: "text-green-600", bg: "bg-green-50" },
                { key: "ios", label: "iOS", icon: Phone, color: "text-blue-600", bg: "bg-blue-50" },
                { key: "web", label: "Web", icon: Monitor, color: "text-purple-600", bg: "bg-purple-50" },
              ].map(({ key, label, icon: Icon, color, bg }) => (
                <div key={key} className={`${bg} rounded-lg p-2 text-center`}>
                  <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                  <p className="text-lg font-black text-gray-900">{stats.byPlatform[key] || 0}</p>
                  <p className="text-[10px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Par source */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              Sources de trafic (top 5)
            </h4>
            <div className="space-y-1.5">
              {sortedSources.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Aucune donnée</p>
              ) : (
                sortedSources.map(([source, count]) => {
                  const SourceIcon = SOURCES[source]?.icon || Users;
                  const color = SOURCES[source]?.color || "text-gray-600";
                  const percentage = stats.total.downloads > 0 
                    ? ((count / stats.total.downloads) * 100).toFixed(1)
                    : 0;
                  
                  return (
                    <div key={source} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <SourceIcon className={`w-4 h-4 ${color}`} />
                        <span className="font-medium text-gray-700">{SOURCES[source]?.label || source}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-gray-900">{count}</span>
                        <span className="text-gray-400 text-[10px] ml-1">{percentage}%</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bouton vers page complète */}
          <Link to="/admin/externe/stats-telechargements">
            <Button className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white">
              Voir toutes les statistiques
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  // Widget compact
  return (
    <Card className="bg-gradient-to-br from-red-500 to-orange-500 border-0 shadow-lg shadow-red-200 overflow-hidden">
      <div className="p-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Download className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Téléchargements SILGAPP</h3>
              <p className="text-[10px] text-white/80">Statistiques en temps réel</p>
            </div>
          </div>
          <Badge className="bg-white/20 text-white border-0 text-[10px] font-semibold">
            {stats.today.downloads} aujourd'hui
          </Badge>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-lg font-black">{stats.total.visits}</p>
            <p className="text-[9px] text-white/80">Visites</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-lg font-black">{stats.total.clicks}</p>
            <p className="text-[9px] text-white/80">Clics</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-lg font-black">{stats.total.downloads}</p>
            <p className="text-[9px] text-white/80">Téléch.</p>
          </div>
        </div>

        {/* Conversion rate */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/80">Taux de conversion</span>
            <span className="font-bold text-white">{conversionRate}%</span>
          </div>
        </div>

        {/* Top pays */}
        {sortedCountries.length > 0 && (
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 mb-3">
            <p className="text-[10px] text-white/80 mb-1.5 font-semibold">Top pays</p>
            <div className="flex items-center gap-2">
              {sortedCountries.slice(0, 3).map(([code, data]) => (
                <div key={code} className="flex items-center gap-1">
                  <span className="text-lg">{PAYS[code]?.emoji || "🌍"}</span>
                  <span className="text-xs font-bold">{data.downloads}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bouton détails */}
        <Button
          onClick={() => setShowDetails(true)}
          className="w-full bg-white text-red-600 hover:bg-white/90 text-xs font-semibold"
          size="sm"
        >
          Voir détails
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </Card>
  );
}