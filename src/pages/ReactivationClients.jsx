import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Users, Smartphone, Mail, UserX, TrendingUp, Filter, Send, Loader2, ChevronRight, FlaskConical, ShieldOff, Copy, Eye, DollarSign, Activity } from "lucide-react";
import { MESSAGE_TEMPLATES } from "@/lib/reactivationMessages";

const SEGMENT_LABELS = {
  push_active: "Push actif",
  push_recoverable: "Récupérables",
  all_push_eligible: "Tous éligibles push",
  external_no_account: "Réactivation externe",
};

const STATUS_LABELS = {
  draft: "Brouillon",
  scheduled: "Programmée",
  sending: "Envoi en cours",
  sent: "Envoyée",
  completed: "Terminée",
  cancelled: "Annulée",
};

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-blue-100 text-blue-700",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

function StatCard({ icon: Icon, label, value, sublabel, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
          <p className="text-[11px] font-bold text-slate-500 mt-1">{label}</p>
          {sublabel && <p className="text-[10px] text-slate-400 mt-0.5">{sublabel}</p>}
        </div>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, pct, isLast }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 text-center">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg py-2 px-2 shadow-sm">
          <p className="text-lg font-black leading-none">{value}</p>
          <p className="text-[9px] font-semibold opacity-90 mt-0.5">{label}</p>
          {pct != null && <p className="text-[9px] opacity-75 mt-0.5">{pct}%</p>}
        </div>
      </div>
      {!isLast && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
    </div>
  );
}

export default function ReactivationClients() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["reactivation-stats"],
    queryFn: async () => {
      const res = await base44.functions.invoke("calculerSegmentsReactivation");
      return res.data;
    },
    refetchInterval: 30000,
  });

  const { data: campaigns = [], refetch: refetchCampaigns } = useQuery({
    queryKey: ["reactivation-campaigns"],
    queryFn: async () => {
      const res = await base44.entities.ReactivationCampaign.list("-created_date", 50);
      return res;
    },
  });

  const launchMutation = useMutation({
    mutationFn: async (campaignId) => {
      const res = await base44.functions.invoke("lancerCampagneReactivation", {
        campaign_id: campaignId,
        launch_now: true,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Campagne lancée — ${data.sent || 0} push envoyés, ${data.control_count || 0} en contrôle`);
      refetchCampaigns();
      queryClient.invalidateQueries({ queryKey: ["reactivation-stats"] });
    },
    onError: (err) => toast.error("Erreur: " + (err.message || "échec lancement")),
  });

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-4 pb-20">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600" />
          Réactivation Clients
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Réactiver les clients inactifs via push FCM gratuit — mesure financière intégrée
        </p>
      </div>

      {/* Stats cards */}
      {statsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
          <StatCard icon={Users} label="Total clients" value={stats?.totalClients || 0} color="bg-slate-600" />
          <StatCard icon={Bell} label="Push actifs" value={stats?.pushActive || 0} sublabel={`${stats?.pushActiveAppActive || 0} actifs / ${stats?.pushActiveAppInactive || 0} inactifs`} color="bg-blue-500" />
          <StatCard icon={Mail} label="Récupérables" value={stats?.pushRecoverable || 0} sublabel="Email mais pas de token" color="bg-amber-500" />
          <StatCard icon={UserX} label="Externe" value={stats?.externalNoAccount || 0} sublabel="Sans compte User" color="bg-red-500" />
          <StatCard icon={Smartphone} label="0 course" value={stats?.zeroCourse || 0} color="bg-slate-400" />
          <StatCard icon={Smartphone} label="1 course" value={stats?.oneCourse || 0} color="bg-purple-500" />
          <StatCard icon={TrendingUp} label="Récurrents (2+)" value={(stats?.twoToFourCourses || 0) + (stats?.fiveToNineCourses || 0) + (stats?.tenPlusCourses || 0)} color="bg-green-500" />
          <StatCard icon={Activity} label="Inactifs 30j+" value={stats?.inactive30d || 0} color="bg-orange-500" />
        </div>
      )}

      {/* Financial summary */}
      {stats && (stats.totalCommission > 0 || stats.totalRevenue > 0) && (
        <div className="mb-5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-green-600" />
          <div>
            <p className="text-sm font-black text-green-900">
              CA total généré: {(stats.totalRevenue || 0).toLocaleString()} FCFA — Commission SILGAPP: {(stats.totalCommission || 0).toLocaleString()} FCFA
            </p>
            <p className="text-[11px] text-green-700">
              Coût promotionnel: 0 FCFA — Résultat net: +{(stats.totalCommission || 0).toLocaleString()} FCFA
            </p>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-black text-slate-800">Campagnes</h2>
        <button
          onClick={() => setShowForm(true)}
          className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
        >
          <Send className="w-3.5 h-3.5" /> Nouvelle campagne
        </button>
      </div>

      {/* Campaign list */}
      <div className="space-y-2">
        {campaigns.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-500">Aucune campagne créée</p>
            <p className="text-xs text-slate-400 mt-1">Commencez par créer une campagne push gratuite</p>
          </div>
        )}
        {campaigns.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900 truncate">{c.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] || "bg-slate-100"}`}>
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                  {c.is_ab_test && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                      <FlaskConical className="w-2.5 h-2.5" /> A/B
                    </span>
                  )}
                  {c.control_group_pct > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                      <ShieldOff className="w-2.5 h-2.5" /> Ctrl {c.control_group_pct}%
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 truncate">{c.title} — {c.message}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                  <span>Segment: {SEGMENT_LABELS[c.segment_type] || c.segment_type}</span>
                  {c.country_code && <span>• {c.country_code}</span>}
                  <span>• Ciblés: {c.target_count || 0}</span>
                  {c.sent_count > 0 && <span>• Envoyés: {c.sent_count}</span>}
                </div>
              </div>
              {c.status === "draft" && (
                <button
                  onClick={() => {
                    if (confirm(`Lancer la campagne "${c.name}" ? ${c.target_count || "?"} clients ciblés. Coût: 0 FCFA.`)) {
                      launchMutation.mutate(c.id);
                    }
                  }}
                  disabled={launchMutation.isPending}
                  className="h-8 px-3 rounded-lg bg-green-600 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                >
                  {launchMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Lancer
                </button>
              )}
              {c.status === "sent" && (
                <button
                  onClick={() => setSelectedCampaign(c)}
                  className="h-8 px-3 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold flex items-center gap-1 shrink-0"
                >
                  <Eye className="w-3 h-3" /> Résultats
                </button>
              )}
            </div>

            {/* Mini funnel for sent campaigns */}
            {c.status === "sent" && c.target_count > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1">
                  <FunnelStep label="Ciblés" value={c.target_count || 0} pct={100} />
                  <FunnelStep label="Envoyés" value={c.sent_count || 0} pct={Math.round((c.sent_count / c.target_count) * 100)} />
                  <FunnelStep label="Courses" value={c.course_created_count || 0} pct={c.target_count ? Math.round((c.course_created_count / c.target_count) * 100) : 0} />
                  <FunnelStep label="CA" value={`${(c.revenue_generated || 0).toLocaleString()}`} isLast />
                </div>
                <div className="mt-1.5 text-[10px] text-green-600 font-bold">
                  Commission: {(c.commission_generated || 0).toLocaleString()} FCFA — Coût: 0 FCFA — Net: +{(c.commission_generated || 0).toLocaleString()} FCFA
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Campaign form modal */}
      {showForm && (
        <CampaignForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            refetchCampaigns();
            queryClient.invalidateQueries({ queryKey: ["reactivation-stats"] });
          }}
        />
      )}

      {/* Results modal */}
      {selectedCampaign && (
        <CampaignResults campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />
      )}
    </div>
  );
}

// ── Campaign creation form ────────────────────────────────────────────────────

function CampaignForm({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [segmentType, setSegmentType] = useState("push_active");
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [courseMin, setCourseMin] = useState(0);
  const [courseMax, setCourseMax] = useState("");
  const [maxTargets, setMaxTargets] = useState(0);
  const [inactiveDays, setInactiveDays] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [controlPct, setControlPct] = useState(15);
  const [isAbTest, setIsAbTest] = useState(false);
  const [abVariants, setAbVariants] = useState([{ variant: "A", title: "", message: "" }, { variant: "B", title: "", message: "" }]);
  const [loading, setLoading] = useState(false);

  const applyTemplate = (template) => {
    if (isAbTest) {
      setAbVariants((prev) => prev.map((v, i) => i === 0 ? { ...v, title: template.title, message: template.message } : v));
    } else {
      setTitle(template.title);
      setMessage(template.message);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !title.trim() || !message.trim()) {
      toast.error("Nom, titre et message sont obligatoires");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        status: "draft",
        segment_type: segmentType,
        country_code: countryCode || "",
        city: city.trim(),
        course_min: Number(courseMin) || 0,
        course_max: courseMax ? Number(courseMax) : null,
        max_targets: Number(maxTargets) || 0,
        inactive_days_min: inactiveDays ? Number(inactiveDays) : null,
        title: title.trim(),
        message: message.trim(),
        control_group_pct: Number(controlPct) || 0,
        is_ab_test: isAbTest,
        ab_variants: isAbTest ? JSON.stringify(abVariants) : "",
        promo_cost: 0,
        attribution_window_hours: 72,
        created_by: "",
      };
      await base44.entities.ReactivationCampaign.create(payload);
      toast.success("Campagne créée en brouillon");
      onCreated();
    } catch (err) {
      toast.error("Erreur: " + (err.message || "échec création"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-blue-600 text-white px-4 py-3 flex items-center justify-between z-10">
          <h3 className="font-black text-sm">Nouvelle campagne de réactivation</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Nom de la campagne *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Réactivation 0 course — Août"
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
          </div>

          {/* Segment */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Segment ciblé</label>
            <select value={segmentType} onChange={(e) => setSegmentType(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold bg-white">
              <option value="push_active">Push actif (token FCM)</option>
              <option value="push_recoverable">Récupérables (email, pas de token)</option>
              <option value="all_push_eligible">Tous éligibles push (avec email)</option>
              <option value="external_no_account">Externe (sans compte — pas de push auto)</option>
            </select>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Pays</label>
              <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="ex: BF"
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Ville</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="ex: Ouagadougou"
                className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Courses min</label>
              <input type="number" value={courseMin} onChange={(e) => setCourseMin(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 px-2 text-sm font-semibold" />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Courses max</label>
              <input type="number" value={courseMax} onChange={(e) => setCourseMax(e.target.value)} placeholder="∞"
                className="w-full h-10 rounded-xl border border-slate-200 px-2 text-sm font-semibold" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Inactif ≥ (j)</label>
              <input type="number" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} placeholder="ex: 30"
                className="w-full h-10 rounded-xl border border-slate-200 px-2 text-sm font-semibold" />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Max cibles (pilote)</label>
              <input type="number" value={maxTargets} onChange={(e) => setMaxTargets(e.target.value)} placeholder="0 = illimité"
                className="w-full h-10 rounded-xl border border-slate-200 px-2 text-sm font-semibold" />
            </div>
          </div>

          {/* Templates */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">Modèles de messages</label>
            <div className="flex gap-1.5 flex-wrap">
              {MESSAGE_TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => applyTemplate(t)}
                  className="h-8 px-2.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold flex items-center gap-1 hover:bg-blue-50 hover:text-blue-700">
                  <span>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* A/B test toggle */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isAbTest} onChange={(e) => setIsAbTest(e.target.checked)}
                className="w-4 h-4 accent-purple-600" />
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <FlaskConical className="w-3.5 h-3.5 text-purple-600" /> Test A/B
              </span>
            </label>
            {isAbTest ? (
              <div className="space-y-2">
                {abVariants.map((v, i) => (
                  <div key={i} className="rounded-lg bg-purple-50 p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-black flex items-center justify-center">{v.variant}</span>
                      <input value={v.title} onChange={(e) => setAbVariants(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                        placeholder="Titre variante" className="flex-1 h-8 rounded-lg border border-purple-200 px-2 text-xs font-semibold" />
                    </div>
                    <input value={v.message} onChange={(e) => setAbVariants(prev => prev.map((x, j) => j === i ? { ...x, message: e.target.value } : x))}
                      placeholder="Message variante" className="w-full h-8 rounded-lg border border-purple-200 px-2 text-xs" />
                  </div>
                ))}
                <button onClick={() => setAbVariants(prev => [...prev, { variant: String.fromCharCode(65 + prev.length), title: "", message: "" }])}
                  className="text-[11px] font-bold text-purple-600">+ Ajouter variante</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la notification *"
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold" />
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message *" rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
            )}
          </div>

          {/* Control group */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 block mb-1">
              Groupe contrôle: {controlPct}% (ne reçoit pas de notification)
            </label>
            <input type="range" min="0" max="30" value={controlPct} onChange={(e) => setControlPct(Number(e.target.value))}
              className="w-full accent-blue-600" />
          </div>

          {/* Cost notice */}
          <div className="rounded-xl bg-green-50 border border-green-200 p-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <p className="text-[11px] font-bold text-green-700">
              Coût: 0 FCFA — Canal push FCM gratuit uniquement. Aucune réduction automatique.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-3 flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">Annuler</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 h-10 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Créer en brouillon
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Campaign results modal ───────────────────────────────────────────────────

function CampaignResults({ campaign, onClose }) {
  const { data: recipients = [] } = useQuery({
    queryKey: ["campaign-recipients", campaign.id],
    queryFn: async () => {
      const res = await base44.entities.ReactivationCampaignRecipient.filter({ campaign_id: campaign.id });
      return res;
    },
  });

  const funnel = useMemo(() => {
    const total = recipients.length;
    const control = recipients.filter(r => r.is_control_group).length;
    const sent = recipients.filter(r => r.status !== "control" && r.status !== "pending").length;
    const delivered = recipients.filter(r => ["delivered", "opened", "converted"].includes(r.status)).length;
    const opened = recipients.filter(r => ["opened", "converted"].includes(r.status)).length;
    const courseCreated = recipients.filter(r => r.course_created_at).length;
    const courseCompleted = recipients.filter(r => r.course_completed_at).length;
    const revenue = recipients.reduce((sum, r) => sum + (r.revenue || 0), 0);
    const commission = recipients.reduce((sum, r) => sum + (r.commission || 0), 0);
    const controlConverted = recipients.filter(r => r.is_control_group && r.course_created_at).length;
    const campaignConverted = courseCreated;
    const controlRate = control > 0 ? (controlConverted / control * 100) : 0;
    const campaignRate = sent > 0 ? (campaignConverted / sent * 100) : 0;
    const uplift = campaignRate - controlRate;

    return { total, control, sent, delivered, opened, courseCreated, courseCompleted, revenue, commission, controlRate, campaignRate, uplift };
  }, [recipients]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-2 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-blue-600 text-white px-4 py-3 flex items-center justify-between z-10">
          <h3 className="font-black text-sm truncate">{campaign.name}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {/* Funnel */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Funnel de conversion</p>
            <div className="flex items-center gap-1 mb-2">
              <FunnelStep label="Ciblés" value={funnel.total} pct={100} />
              <FunnelStep label="Envoyés" value={funnel.sent} pct={funnel.total ? Math.round(funnel.sent / funnel.total * 100) : 0} />
              <FunnelStep label="Courses" value={funnel.courseCreated} pct={funnel.sent ? Math.round(funnel.courseCreated / funnel.sent * 100) : 0} />
              <FunnelStep label="Livrées" value={funnel.courseCompleted} isLast />
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-slate-500">Ouvertures:</span><span className="font-bold text-slate-700">{funnel.opened}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Courses créées:</span><span className="font-bold text-slate-700">{funnel.courseCreated}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Courses livrées:</span><span className="font-bold text-slate-700">{funnel.courseCompleted}</span></div>
            </div>
          </div>

          {/* Financial results */}
          <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-green-600 mb-1">Résultats financiers</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-green-700">CA généré:</span><span className="font-black text-green-900">{funnel.revenue.toLocaleString()} FCFA</span></div>
              <div className="flex justify-between"><span className="text-green-700">Commission SILGAPP:</span><span className="font-black text-green-900">{funnel.commission.toLocaleString()} FCFA</span></div>
              <div className="flex justify-between"><span className="text-green-700">Coût promotionnel:</span><span className="font-black text-green-900">0 FCFA</span></div>
              <div className="flex justify-between border-t border-green-200 pt-1 mt-1"><span className="text-green-700 font-bold">Résultat net:</span><span className="font-black text-green-900">+{funnel.commission.toLocaleString()} FCFA</span></div>
            </div>
          </div>

          {/* Control group comparison */}
          {funnel.control > 0 && (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Groupe contrôle vs campagne</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Taux campagne:</span><span className="font-bold text-blue-700">{funnel.campaignRate.toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Taux contrôle:</span><span className="font-bold text-slate-700">{funnel.controlRate.toFixed(1)}%</span></div>
                <div className="flex justify-between border-t border-slate-100 pt-1 mt-1"><span className="text-slate-500 font-bold">Uplift réel:</span><span className={`font-black ${funnel.uplift > 0 ? "text-green-600" : "text-red-500"}`}>{funnel.uplift > 0 ? "+" : ""}{funnel.uplift.toFixed(1)} pts</span></div>
              </div>
            </div>
          )}

          {/* A/B results */}
          {campaign.is_ab_test && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-purple-600 mb-2 flex items-center gap-1">
                <FlaskConical className="w-3 h-3" /> Résultats A/B
              </p>
              {Array.from(new Set(recipients.filter(r => r.ab_variant).map(r => r.ab_variant))).map(variant => {
                const vr = recipients.filter(r => r.ab_variant === variant);
                const vConverted = vr.filter(r => r.course_created_at).length;
                const vRevenue = vr.reduce((sum, r) => sum + (r.revenue || 0), 0);
                return (
                  <div key={variant} className="flex justify-between text-xs mb-1">
                    <span className="text-purple-700 font-bold">Variante {variant}:</span>
                    <span className="font-bold text-purple-900">{vConverted}/{vr.length} convertis — {vRevenue.toLocaleString()} FCFA</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}