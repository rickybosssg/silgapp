import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  TrendingUp,
  Users,
  Smartphone,
  Calendar,
  Globe,
  Share2,
  ArrowLeft,
  Facebook,
  MessageCircle,
  Video,
  QrCode,
  Link as LinkIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function StatsTelechargementsAdmin() {
  const navigate = useNavigate();
  const { data: allStats = [], isLoading } = useQuery({
    queryKey: ["download-stats-admin"],
    queryFn: () => base44.entities.DownloadStats.list("-created_date", 10000),
    initialData: [],
    refetchInterval: 30000,
  });

  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalVisits = 0, totalClicks = 0, totalDownloads = 0;
    let todayVisits = 0, todayClicks = 0, todayDownloads = 0;
    let weekVisits = 0, weekClicks = 0, weekDownloads = 0;
    let monthVisits = 0, monthClicks = 0, monthDownloads = 0;

    const countryStats = {};
    const sourceStats = {
      facebook: { visits: 0, clicks: 0, downloads: 0 },
      whatsapp: { visits: 0, clicks: 0, downloads: 0 },
      tiktok: { visits: 0, clicks: 0, downloads: 0 },
      qr_code: { visits: 0, clicks: 0, downloads: 0 },
      direct: { visits: 0, clicks: 0, downloads: 0 },
    };

    allStats.forEach(record => {
      const visits = record.page_visits || 0;
      const clicks = record.clicks || 0;
      const downloads = record.downloads || 0;
      const recordDate = new Date(record.created_date);
      const country = record.country_code || "BF";

      // Totaux
      totalVisits += visits;
      totalClicks += clicks;
      totalDownloads += downloads;

      // Aujourd'hui
      if (recordDate >= today) {
        todayVisits += visits;
        todayClicks += clicks;
        todayDownloads += downloads;
      }

      // Cette semaine
      if (recordDate >= weekAgo) {
        weekVisits += visits;
        weekClicks += clicks;
        weekDownloads += downloads;
      }

      // Ce mois
      if (recordDate >= monthStart) {
        monthVisits += visits;
        monthClicks += clicks;
        monthDownloads += downloads;
      }

      // Par pays
      if (!countryStats[country]) {
        countryStats[country] = { visits: 0, clicks: 0, downloads: 0 };
      }
      countryStats[country].visits += visits;
      countryStats[country].clicks += clicks;
      countryStats[country].downloads += downloads;

      // Par source
      const source = record.referrer || "direct";
      if (sourceStats[source]) {
        sourceStats[source].visits += visits;
        sourceStats[source].clicks += clicks;
        sourceStats[source].downloads += downloads;
      }
    });

    const conversionRate = totalVisits > 0
      ? ((totalDownloads / totalVisits) * 100).toFixed(2)
      : 0;

    const todayConversion = todayVisits > 0
      ? ((todayDownloads / todayVisits) * 100).toFixed(2)
      : 0;

    return {
      total: { visits: totalVisits, clicks: totalClicks, downloads: totalDownloads, conversionRate },
      today: { visits: todayVisits, clicks: todayClicks, downloads: todayDownloads, conversionRate: todayConversion },
      week: { visits: weekVisits, clicks: weekClicks, downloads: weekDownloads },
      month: { visits: monthVisits, clicks: monthClicks, downloads: monthDownloads },
      countries: countryStats,
      sources: sourceStats,
    };
  }, [allStats]);

  const countryNames = {
    BF: "Burkina Faso ",
    CI: "Côte d'Ivoire ",
    TG: "Togo ",
    BJ: "Bénin ",
    SN: "Sénégal ",
    ML: "Mali ",
    GN: "Guinée ",
    NE: "Niger ",
  };

  const sourceConfig = {
    facebook: { label: "Facebook", icon: Facebook, color: "bg-blue-500" },
    whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "bg-green-500" },
    tiktok: { label: "TikTok", icon: Video, color: "bg-pink-500" },
    qr_code: { label: "QR Code", icon: QrCode, color: "bg-purple-500" },
    direct: { label: "Lien direct", icon: LinkIcon, color: "bg-gray-500" },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Chargement des statistiques...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="bg-white/20 hover:bg-white/30 text-white border border-white/30">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Download className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black"> Téléchargements SILGAPP</h1>
                <p className="text-white/80 text-sm mt-0.5">Statistiques détaillées en temps réel</p>
              </div>
            </div>
          </div>

          {/* KPI principaux */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <Users className="w-5 h-5 text-white/80 mb-2" />
              <p className="text-2xl font-black">{stats.total.visits.toLocaleString()}</p>
              <p className="text-xs text-white/70 font-medium">Visites totales</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <TrendingUp className="w-5 h-5 text-white/80 mb-2" />
              <p className="text-2xl font-black">{stats.total.clicks.toLocaleString()}</p>
              <p className="text-xs text-white/70 font-medium">Clics totaux</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <Smartphone className="w-5 h-5 text-white/80 mb-2" />
              <p className="text-2xl font-black">{stats.total.downloads.toLocaleString()}</p>
              <p className="text-xs text-white/70 font-medium">APK téléchargés</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <Calendar className="w-5 h-5 text-white/80 mb-2" />
              <p className="text-2xl font-black">{stats.today.downloads}</p>
              <p className="text-xs text-white/70 font-medium">Aujourd'hui</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Périodes */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Aujourd'hui</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold">{stats.today.visits}</p>
                  <p className="text-[10px] text-muted-foreground">Visites</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{stats.today.clicks}</p>
                  <p className="text-[10px] text-muted-foreground">Clics</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-green-600">{stats.today.downloads}</p>
                  <p className="text-[10px] text-muted-foreground">APK</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cette semaine</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold">{stats.week.visits}</p>
                  <p className="text-[10px] text-muted-foreground">Visites</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{stats.week.clicks}</p>
                  <p className="text-[10px] text-muted-foreground">Clics</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-600">{stats.week.downloads}</p>
                  <p className="text-[10px] text-muted-foreground">APK</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ce mois</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold">{stats.month.visits}</p>
                  <p className="text-[10px] text-muted-foreground">Visites</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{stats.month.clicks}</p>
                  <p className="text-[10px] text-muted-foreground">Clics</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-purple-600">{stats.month.downloads}</p>
                  <p className="text-[10px] text-muted-foreground">APK</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Répartition par pays */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Répartition par pays</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.countries)
                .sort(([, a], [, b]) => b.downloads - a.downloads)
                .map(([code, data]) => (
                  <div key={code} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{countryNames[code] || code}</span>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">{data.visits} visites</span>
                      <Badge variant="secondary">{data.clicks} clics</Badge>
                      <Badge className="bg-green-100 text-green-700">{data.downloads} APK</Badge>
                    </div>
                  </div>
                ))}
              {Object.keys(stats.countries).length === 0 && (
                <p className="text-center text-muted-foreground py-4">Aucune donnée disponible</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Répartition par source */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Répartition par source</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-5 gap-3">
              {Object.entries(stats.sources).map(([source, data]) => {
                const config = sourceConfig[source] || { label: source, icon: LinkIcon, color: "bg-gray-500" };
                const Icon = config.icon;
                return (
                  <div key={source} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className={`w-10 h-10 ${config.color} rounded-xl flex items-center justify-center mb-3`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="font-semibold text-sm mb-2">{config.label}</p>
                    <div className="space-y-1 text-xs">
                      <p className="flex justify-between">
                        <span className="text-muted-foreground">Visites:</span>
                        <span className="font-bold">{data.visits}</span>
                      </p>
                      <p className="flex justify-between">
                        <span className="text-muted-foreground">Clics:</span>
                        <span className="font-bold">{data.clicks}</span>
                      </p>
                      <p className="flex justify-between text-green-600">
                        <span className="font-medium">APK:</span>
                        <span className="font-black">{data.downloads}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
