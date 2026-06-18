import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Flame, Settings, BarChart3, Clock, Zap,
  Save, Loader2, Bell, BellOff, Sliders, TrendingUp, History,
  Users, Package, ChevronDown, ChevronUp
} from "lucide-react";
import { usePaysActifs } from "@/components/international/CountrySelector.jsx";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const NIVEAU_COLORS = {
  faible: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", border: "border-green-200" },
  moyenne: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500", border: "border-yellow-200" },
  forte: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", border: "border-orange-200" },
  tres_forte: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", border: "border-red-200" },
};

const NIVEAU_EMOJI = { faible: "🟢", moyenne: "🟡", forte: "🟠", tres_forte: "🔴" };

const CONFIG_FIELDS = [
  { key: "ZC_ACTIF", label: "Zones chaudes actives", type: "switch", desc: "Activer/Désactiver la détection" },
  { key: "ZC_PUSH_ACTIF", label: "Notifications push", type: "switch", desc: "Envoyer des push FCM aux livreurs" },
  { key: "ZC_INTERVALLE_MIN", label: "Intervalle d'analyse (min)", type: "number", desc: "Fréquence d'exécution", min: 5, max: 120 },
  { key: "ZC_RAYON_KM", label: "Rayon de détection (km)", type: "number", desc: "Rayon des zones", min: 1, max: 20, step: 0.5 },
  { key: "ZC_MIN_COURSES", label: "Courses minimum", type: "number", desc: "Nb min de courses pour zone chaude", min: 1, max: 50 },
  { key: "ZC_MIN_LIVREURS", label: "Livreurs minimum", type: "number", desc: "Nb min de livreurs dans zone", min: 0, max: 50 },
  { key: "ZC_SCORE_FAIBLE", label: "Seuil score faible", type: "number", desc: "En dessous = faible", min: 0, max: 50, step: 0.5 },
  { key: "ZC_SCORE_MOYEN", label: "Seuil score moyen", type: "number", desc: "Entre faible et moyen", min: 0, max: 50, step: 0.5 },
  { key: "ZC_SCORE_ELEVE", label: "Seuil score élevé", type: "number", desc: "Entre moyen et élevé", min: 0, max: 50, step: 0.5 },
  { key: "ZC_SCORE_TRES_ELEVE", label: "Seuil score très élevé", type: "number", desc: "Au dessus = très élevé", min: 0, max: 50, step: 0.5 },
  { key: "ZC_DELAI_MIN_ALERTES_MIN", label: "Délai min entre alertes (min)", type: "number", desc: "Par livreur", min: 5, max: 240 },
  { key: "ZC_MAX_NOTIFS_HEURE", label: "Max notifications/heure", type: "number", desc: "Par livreur", min: 1, max: 20 },
  { key: "ZC_DISTANCE_MAX_KM", label: "Distance max livreur-zone (km)", type: "number", desc: "Rayon max pour notifier", min: 1, max: 50 },
];

function ConfigCard({ config, valeur, onSave, saving }) {
  const [val, setVal] = useState(valeur || "");

  useEffect(() => { setVal(valeur || ""); }, [valeur]);

  if (config.type === "switch") {
    const isActive = val === "true";
    return (
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <p className="font-bold text-sm text-gray-900">{config.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{config.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? <Bell className="w-4 h-4 text-green-500" /> : <BellOff className="w-4 h-4 text-gray-400" />}
          <Switch
            checked={isActive}
            onCheckedChange={(checked) => {
              const newVal = checked ? "true" : "false";
              setVal(newVal);
              onSave(config.key, newVal);
            }}
            disabled={saving}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-gray-900">{config.label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{config.desc}</p>
      </div>
      <Input
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        min={config.min}
        max={config.max}
        step={config.step || 1}
        className="w-24 h-10 rounded-xl text-center font-bold"
      />
      <Button
        size="sm"
        variant={val !== valeur ? "default" : "ghost"}
        onClick={() => onSave(config.key, val)}
        disabled={saving || val === valeur}
        className="rounded-xl"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

function ZoneRow({ zone }) {
  const [expanded, setExpanded] = useState(false);
  const style = NIVEAU_COLORS[zone.niveau] || NIVEAU_COLORS.faible;

  return (
    <div className={`rounded-2xl border ${style.border} overflow-hidden mb-2`}>
      <div className={`p-4 ${style.bg} cursor-pointer`} onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${style.dot}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm">{NIVEAU_EMOJI[zone.niveau]} {zone.quartier}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                  Score {zone.score}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {zone.ville}, {zone.country_code}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-sm font-black">{zone.nb_courses}</p>
              <p className="text-[10px] text-gray-500">courses</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-black">{zone.nb_livreurs}</p>
              <p className="text-[10px] text-gray-500">livreurs</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-bold">{zone.notifications_envoyees || 0}</p>
              <p className="text-[10px] text-gray-500">push</p>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Score</span>
              <p className="font-bold">{zone.score}</p>
            </div>
            <div>
              <span className="text-gray-500">Niveau</span>
              <p className="font-bold">{NIVEAU_EMOJI[zone.niveau]} {zone.niveau}</p>
            </div>
            <div>
              <span className="text-gray-500">Rayon</span>
              <p className="font-bold">{zone.rayon_km} km</p>
            </div>
            <div>
              <span className="text-gray-500">Temps attente</span>
              <p className="font-bold">{zone.temps_attente_min} min</p>
            </div>
            <div>
              <span className="text-gray-500">Push envoyées</span>
              <p className="font-bold text-green-600">{zone.notifications_envoyees || 0}</p>
            </div>
            <div>
              <span className="text-gray-500">Échecs FCM</span>
              <p className="font-bold text-red-600">{zone.notifications_echouees || 0}</p>
            </div>
          </div>
          {zone.date_analyse && (
            <p className="text-[10px] text-gray-400">
              Analyse : {format(new Date(zone.date_analyse), "dd/MM/yyyy HH:mm", { locale: fr })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ZonesChaudesAdmin() {
  const queryClient = useQueryClient();
  const [onglet, setOnglet] = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const paysActifs = usePaysActifs();
  const [selectedPays, setSelectedPays] = useState("");
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || selectedPays || "");

  // ── Config ──────────────────────────────────────────────────────────────────
  const { data: configs = [], isLoading: configLoading } = useQuery({
    queryKey: ["zc-config"],
    queryFn: () => base44.entities.AppConfig.filter({}),
    refetchInterval: 30000,
  });

  const configMap = {};
  configs.forEach(c => { configMap[c.cle] = c; });

  const saveConfig = async (key, valeur) => {
    setSaving(true);
    try {
      const existing = configMap[key];
      if (existing) {
        await base44.entities.AppConfig.update(existing.id, { valeur });
      } else {
        await base44.entities.AppConfig.create({ cle: key, valeur, description: `Zone chaude — ${key}` });
      }
      queryClient.invalidateQueries({ queryKey: ["zc-config"] });
      toast.success(`${key} mis à jour`);
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Dashboard temps réel ────────────────────────────────────────────────────
  const { data: historique = [], isLoading: histLoading } = useQuery({
    queryKey: ["zc-historique", effectiveCountry],
    queryFn: () => base44.entities.ZoneChaudeHistorique.filter({}, "-date_analyse", 100),
    refetchInterval: 30000,
  });

  const historiqueFiltre = effectiveCountry
    ? historique.filter(h => h.country_code === effectiveCountry)
    : historique;

  // ── Stats live ──────────────────────────────────────────────────────────────
  const { data: coursesEnAttente = [] } = useQuery({
    queryKey: ["zc-courses-attente", effectiveCountry],
    queryFn: () => {
      const filter = effectiveCountry ? { country_code: effectiveCountry } : {};
      return base44.entities.CourseExterne.filter(filter, "-created_date", 200);
    },
    refetchInterval: 15000,
  });

  const { data: livreursDispo = [] } = useQuery({
    queryKey: ["zc-livreurs-dispo", effectiveCountry],
    queryFn: () => {
      const filter = { type_livreur: "externe", statut: "disponible", actif: true };
      if (effectiveCountry) filter.country_code = effectiveCountry;
      return base44.entities.Livreur.filter(filter, "-updated_date", 500);
    },
    refetchInterval: 15000,
  });

  const coursesActives = coursesEnAttente.filter(c =>
    ["nouvelle", "recherche_livreur"].includes(c.statut)
  ).length;

  const dernieresZones = historiqueFiltre.slice(0, 20);
  const zonesChaudesNow = dernieresZones.filter(z =>
    z.niveau === "forte" || z.niveau === "tres_forte"
  ).length;

  const handleRunNow = async () => {
    toast.info("Analyse en cours...");
    try {
      const res = await base44.functions.invoke("detecterZonesChaudes", {
        country_code: effectiveCountry || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["zc-historique"] });
      if (res.data?.zones_chaudes > 0) {
        toast.success(`${res.data.zones_chaudes} zone(s) chaude(s) détectée(s)`);
      } else {
        toast.success("Aucune zone chaude détectée");
      }
    } catch (err) {
      toast.error("Erreur : " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="px-4 py-4 lg:px-6 lg:py-6 space-y-5 max-w-7xl mx-auto">

        {/* ── HEADER ─────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-red-500 to-red-700 p-5 sm:p-6 shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <Flame className="w-6 h-6 text-white" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Zones Chaudes
                {effectiveCountry && <span className="ml-2 text-base font-normal text-white/50">· {effectiveCountry}</span>}
              </h1>
            </div>
            <p className="text-white/60 text-sm">Détection et rééquilibrage automatique des livreurs</p>
          </div>
        </div>

        {/* ── ONGLETS ────────────────────────────────── */}
        <div className="flex bg-white rounded-2xl p-1 gap-1 shadow-sm border border-gray-100">
          {[
            { key: "dashboard", icon: BarChart3, label: "Tableau de bord" },
            { key: "history", icon: History, label: "Historique" },
            { key: "settings", icon: Settings, label: "Paramètres" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setOnglet(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                onglet === tab.key ? "bg-red-600 text-white shadow" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── SÉLECTEUR PAYS ──────────────────────────── */}
        {!isPays && (
          <Select value={selectedPays} onValueChange={setSelectedPays}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Tous les pays" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Tous les pays</SelectItem>
              {paysActifs.map(p => (
                <SelectItem key={p.code} value={p.code}>{p.emoji_flag} {p.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* ══════════════════════════════════════════════
            ONGLET : TABLEAU DE BORD
           ══════════════════════════════════════════════ */}
        {onglet === "dashboard" && (
          <>
            {/* Stats KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Zones chaudes", value: zonesChaudesNow, icon: Flame, color: "from-red-500 to-orange-500" },
                { label: "Courses en attente", value: coursesActives, icon: Package, color: "from-blue-500 to-indigo-500" },
                { label: "Livreurs dispo", value: livreursDispo.length, icon: Users, color: "from-green-500 to-teal-500" },
                { label: "Ratio", value: livreursDispo.length > 0 ? (coursesActives / livreursDispo.length).toFixed(1) : "—", icon: TrendingUp, color: "from-purple-500 to-pink-500" },
              ].map(kpi => (
                <div key={kpi.label} className={`bg-gradient-to-br ${kpi.color} rounded-2xl p-4 text-white shadow-lg`}>
                  <kpi.icon className="w-5 h-5 mb-2 opacity-70" />
                  <p className="text-2xl font-black">{kpi.value}</p>
                  <p className="text-[10px] font-medium opacity-80">{kpi.label}</p>
                </div>
              ))}
            </div>

            {/* Bouton analyse manuelle */}
            <Button
              onClick={handleRunNow}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 text-white font-bold shadow-lg shadow-red-200"
            >
              <Zap className="w-4 h-4 mr-2" />
              Lancer une analyse maintenant
            </Button>

            {/* Zones actuelles */}
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Zones détectées</p>
              {histLoading ? (
                <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-600 mx-auto" /></div>
              ) : historiqueFiltre.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                  <Flame className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 font-semibold">Aucune analyse récente</p>
                  <p className="text-xs text-gray-400 mt-1">Lancez une analyse manuelle</p>
                </div>
              ) : (
                <div>
                  {dernieresZones.map((zone, i) => (
                    <ZoneRow key={zone.id || i} zone={zone} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════
            ONGLET : HISTORIQUE
           ══════════════════════════════════════════════ */}
        {onglet === "history" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <p className="font-black text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                Historique des analyses
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold ml-1">
                  {historiqueFiltre.length}
                </span>
              </p>
            </div>
            {histLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-600 mx-auto" /></div>
            ) : historiqueFiltre.length === 0 ? (
              <div className="text-center py-10">
                <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 font-semibold">Aucun historique</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-3 text-left font-bold text-gray-600">Date</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-600">Pays</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-600">Ville</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-600">Quartier</th>
                      <th className="px-3 py-3 text-center font-bold text-gray-600">Score</th>
                      <th className="px-3 py-3 text-center font-bold text-gray-600">Niveau</th>
                      <th className="px-3 py-3 text-center font-bold text-gray-600">Courses</th>
                      <th className="px-3 py-3 text-center font-bold text-gray-600">Livr.</th>
                      <th className="px-3 py-3 text-center font-bold text-gray-600">Push OK</th>
                      <th className="px-3 py-3 text-center font-bold text-gray-600">Échecs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historiqueFiltre.map((h, i) => {
                      const style = NIVEAU_COLORS[h.niveau] || NIVEAU_COLORS.faible;
                      return (
                        <tr key={h.id || i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 font-medium">
                            {h.date_analyse ? format(new Date(h.date_analyse), "dd/MM HH:mm", { locale: fr }) : "—"}
                          </td>
                          <td className="px-3 py-2.5 font-semibold">{h.country_code}</td>
                          <td className="px-3 py-2.5">{h.ville}</td>
                          <td className="px-3 py-2.5 font-bold">{h.quartier}</td>
                          <td className="px-3 py-2.5 text-center font-bold">{h.score}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${style.bg} ${style.text}`}>
                              {NIVEAU_EMOJI[h.niveau]} {h.niveau}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold">{h.nb_courses}</td>
                          <td className="px-3 py-2.5 text-center font-bold">{h.nb_livreurs}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-green-600">{h.notifications_envoyees || 0}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-red-600">{h.notifications_echouees || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ONGLET : PARAMÈTRES
           ══════════════════════════════════════════════ */}
        {onglet === "settings" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Sliders className="w-4 h-4 text-gray-500" />
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Configuration</p>
            </div>
            {configLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-600 mx-auto" /></div>
            ) : (
              CONFIG_FIELDS.map(field => (
                <ConfigCard
                  key={field.key}
                  config={field}
                  valeur={configMap[field.key]?.valeur || ""}
                  onSave={saveConfig}
                  saving={saving}
                />
              ))
            )}

            {/* Bouton test */}
            <Button
              onClick={handleRunNow}
              variant="outline"
              className="w-full h-12 rounded-2xl font-bold mt-4"
            >
              <Zap className="w-4 h-4 mr-2" />
              Tester la configuration (analyse immédiate)
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
