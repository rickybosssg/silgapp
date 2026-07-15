import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Calendar, TrendingUp, Users, ArrowRight, Globe } from "lucide-react";
import { Link } from "react-router-dom";

export default function DownloadStatsPanel() {
  const { data: allStats = [] } = useQuery({
    queryKey: ["download-stats-panel"],
    queryFn: () => base44.entities.DownloadStats.list("-created_date", 10000),
    initialData: [],
    refetchInterval: 30000,
  });

  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalDownloads = 0;
    let todayDownloads = 0;
    let weekDownloads = 0;
    let monthDownloads = 0;
    let totalVisits = 0;

    const countryStats = {};

    allStats.forEach(record => {
      const visits = record.page_visits || 0;
      const downloads = record.downloads || 0;
      const recordDate = new Date(record.created_date);
      const country = record.country_code || "BF";

      totalVisits += visits;
      totalDownloads += downloads;

      if (recordDate >= today) {
        todayDownloads += downloads;
      }

      if (recordDate >= weekAgo) {
        weekDownloads += downloads;
      }

      if (recordDate >= monthStart) {
        monthDownloads += downloads;
      }

      if (!countryStats[country]) {
        countryStats[country] = { visits: 0, downloads: 0 };
      }
      countryStats[country].visits += visits;
      countryStats[country].downloads += downloads;
    });

    const conversionRate = totalVisits > 0 
      ? ((totalDownloads / totalVisits) * 100).toFixed(1)
      : 0;

    const topCountries = Object.entries(countryStats)
      .sort(([, a], [, b]) => b.downloads - a.downloads)
      .slice(0, 3);

    return {
      total: totalDownloads,
      today: todayDownloads,
      week: weekDownloads,
      month: monthDownloads,
      conversionRate,
      topCountries,
    };
  }, [allStats]);

  const countryEmoji = {
    BF: "🇧🇫",
    CI: "🇨🇮",
    TG: "🇹🇬",
    BJ: "🇧🇯",
    SN: "🇸🇳",
    ML: "🇲🇱",
    GN: "🇬🇳",
    NE: "🇳🇪",
  };

  return (
    <Card className="bg-white border-gray-100 shadow-sm">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-md shadow-red-100">
              <Download className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">📥 Téléchargements SILGAPP</p>
              <p className="text-xs text-muted-foreground">Statistiques en temps réel</p>
            </div>
          </div>
          <Badge className="bg-green-100 text-green-700 border-green-200 font-bold px-2.5">
            {stats.today} aujourd'hui
          </Badge>
        </div>

        {/* Stats principales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[10px] text-blue-700 font-semibold">Total</span>
            </div>
            <p className="text-xl font-black text-blue-900">{stats.total}</p>
          </div>

          <div className="bg-green-50 border border-green-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-3.5 h-3.5 text-green-600" />
              <span className="text-[10px] text-green-700 font-semibold">Aujourd'hui</span>
            </div>
            <p className="text-xl font-black text-green-900">{stats.today}</p>
          </div>

          <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[10px] text-purple-700 font-semibold">Cette semaine</span>
            </div>
            <p className="text-xl font-black text-purple-900">{stats.week}</p>
          </div>

          <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Download className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-[10px] text-orange-700 font-semibold">Ce mois</span>
            </div>
            <p className="text-xl font-black text-orange-900">{stats.month}</p>
          </div>
        </div>

        {/* Taux de conversion */}
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-red-600" />
              <span className="text-sm font-semibold text-red-900">Taux de conversion</span>
            </div>
            <span className="text-lg font-black text-red-600">{stats.conversionRate}%</span>
          </div>
        </div>

        {/* Top pays */}
        {stats.topCountries.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Top pays</span>
            </div>
            <div className="flex items-center gap-2">
              {stats.topCountries.map(([code, data]) => (
                <div key={code} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5">
                  <span className="text-lg">{countryEmoji[code] || "🌍"}</span>
                  <div>
                    <p className="text-[10px] font-bold text-gray-700">{data.downloads}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bouton Voir détails */}
        <Link to="/admin/externe/stats-telechargements">
          <Button className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-semibold">
            Voir détails complets
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}