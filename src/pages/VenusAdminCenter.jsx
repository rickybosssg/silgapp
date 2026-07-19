import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, MessageCircle, Bot, UserCheck, Package, Zap,
  TrendingUp, FileText, RefreshCw, Globe, Sparkles, ExternalLink, Mic,
} from "lucide-react";
import { useAdminContext } from "@/hooks/useAdminContext";
import VenusAudioSettings from "@/components/admin/VenusAudioSettings";
import TranscriptionJournal from "@/components/admin/TranscriptionJournal";

const PAYS_FLAGS = { BF: "🇧🇫", CI: "🇨🇮", TG: "🇹🇬", BJ: "🇧🇯", SN: "🇸🇳", ML: "🇲🇱", GN: "🇬🇳", NE: "🇳🇪" };

function KpiCard({ icon: Icon, label, value, sub, gradient }) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-4 text-white shadow-md`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-80" />
        <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-black leading-none">{value}</p>
      {sub && <p className="text-[10px] opacity-70 mt-1">{sub}</p>}
    </div>
  );
}

function QuickLink({ to, icon: Icon, title, desc, gradient }) {
  return (
    <Link to={to}>
      <div className={`bg-gradient-to-br ${gradient} rounded-2xl p-4 text-white shadow-md hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer h-full`}>
        <div className="flex items-start justify-between mb-2">
          <Icon className="w-6 h-6 opacity-90" />
          <ExternalLink className="w-3.5 h-3.5 opacity-50" />
        </div>
        <p className="font-bold text-sm">{title}</p>
        <p className="text-[11px] opacity-70 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}

export default function VenusAdminCenter() {
  const { selectedCountry, isPays, countryCode } = useAdminContext();
  const effectiveCountry = isPays ? countryCode : selectedCountry;

  const { data: convs = [], isLoading: loadingConvs } = useQuery({
    queryKey: ["venus-conversations", effectiveCountry],
    queryFn: () => base44.entities.Conversation.filter(
      { source: "whatsapp", archived: false },
      "-last_message_date", 100
    ),
    refetchInterval: 15000,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ["venus-interactions-recent", effectiveCountry],
    queryFn: () => base44.entities.VenusInteraction.list("-created_date", 50),
    refetchInterval: 30000,
  });

  const { data: coursesWhatsapp = [] } = useQuery({
    queryKey: ["venus-courses-wa", effectiveCountry],
    queryFn: () => base44.entities.CourseExterne.filter(
      { source: "client" },
      "-created_date", 50
    ),
    refetchInterval: 30000,
  });

  // KPIs calculés
  const totalConvs = convs.length;
  const venusActive = convs.filter(c => c.venus_active !== false).length;
  const adminTakeover = convs.filter(c => c.venus_active === false).length;
  const venusRate = totalConvs > 0 ? Math.round((venusActive / totalConvs) * 100) : 0;

  const todayStr = new Date().toISOString().split("T")[0];
  const interactionsToday = interactions.filter(i => i.date_conversation === todayStr);
  const coursesToday = coursesWhatsapp.filter(c => c.created_date?.startsWith(todayStr));

  const byCountry = {};
  convs.forEach(c => {
    const cc = c.country_code || "??";
    byCountry[cc] = (byCountry[cc] || 0) + 1;
  });
  const topCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="p-4 space-y-5 max-w-6xl mx-auto">
      {/* HERO HEADER */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-5 shadow-xl shadow-purple-200">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-white hover:bg-white/20 border border-white/30">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-xl flex-shrink-0">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Centre VENUS
                <Badge className="bg-white/20 text-white border-white/30 text-[10px]">IA</Badge>
              </h1>
              <p className="text-white/65 text-xs mt-0.5">
                Pilotage de l'assistante IA WhatsApp {effectiveCountry ? `· ${PAYS_FLAGS[effectiveCountry] || ""} ${effectiveCountry}` : "· tous pays"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs temps réel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          icon={MessageCircle}
          label="Conversations actives"
          value={totalConvs}
          sub={`${coursesToday.length} course(s) aujourd'hui`}
          gradient="from-violet-500 to-purple-600"
        />
        <KpiCard
          icon={Bot}
          label="Venus active"
          value={`${venusRate}%`}
          sub={`${venusActive} auto / ${adminTakeover} manuel`}
          gradient="from-green-500 to-emerald-500"
        />
        <KpiCard
          icon={Zap}
          label="Interactions aujourd'hui"
          value={interactionsToday.length}
          sub={`${interactions.length} total`}
          gradient="from-blue-500 to-indigo-500"
        />
        <KpiCard
          icon={Package}
          label="Courses via WhatsApp"
          value={coursesToday.length}
          sub="créées par Venus"
          gradient="from-orange-500 to-amber-500"
        />
      </div>

      {/* État Venus — barre de proportion */}
      {totalConvs > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Répartition automation</p>
            <span className="text-xs text-muted-foreground">{totalConvs} conversations</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500" style={{ width: `${venusRate}%` }} />
            <div className="bg-gradient-to-r from-orange-400 to-red-500" style={{ width: `${100 - venusRate}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-semibold text-green-700">{venusActive} Venus auto</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="font-semibold text-orange-700">{adminTakeover} admin manuel</span>
            </span>
          </div>
        </div>
      )}

      {/* Configuration notes vocales */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Mic className="w-4 h-4 text-purple-600" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Notes vocales WhatsApp</p>
        </div>
        <VenusAudioSettings />
      </div>

      {/* Journal de transcription */}
      <TranscriptionJournal />

      {/* Accès rapides */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Accès rapide</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickLink
            to="/admin/whatsapp"
            icon={MessageCircle}
            title="Messagerie WhatsApp"
            desc="Gérer les conversations en temps réel"
            gradient="from-green-500 to-emerald-600"
          />
          <QuickLink
            to="/admin/venus-rapports"
            icon={FileText}
            title="Rapports & Analytics"
            desc="Statistiques et rapports IA"
            gradient="from-violet-500 to-purple-600"
          />
          <QuickLink
            to="/admin/neo"
            icon={Sparkles}
            title="NEO — Amélioration"
            desc="Recommandations automatiques"
            gradient="from-blue-500 to-indigo-600"
          />
        </div>
      </div>

      {/* Répartition par pays + Interactions récentes */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Par pays */}
        {topCountries.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Conversations par pays</p>
            </div>
            <div className="space-y-2">
              {topCountries.map(([code, count]) => (
                <div key={code} className="flex items-center gap-2">
                  <span className="text-base flex-shrink-0">{PAYS_FLAGS[code] || "🌍"}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-semibold">{code}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600"
                        style={{ width: `${(count / topCountries[0][1]) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactions récentes */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Interactions récentes</p>
          </div>
          {interactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Aucune interaction enregistrée</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {interactions.slice(0, 8).map((i, idx) => (
                <div key={i.id || idx} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3 h-3 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-foreground line-clamp-2">{i.question || "—"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {i.country_code && <span className="text-[9px] text-muted-foreground">{PAYS_FLAGS[i.country_code] || ""} {i.country_code}</span>}
                      {i.statut === "resolu" && <span className="text-[9px] text-green-600 font-semibold">✓ résolu</span>}
                      {i.statut === "non_resolu" && <span className="text-[9px] text-orange-600 font-semibold">⚠ non résolu</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}