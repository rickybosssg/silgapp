import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Globe, ArrowRight, ToggleLeft, ToggleRight, Plus, Settings, LayoutDashboard, ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { isToday } from "date-fns";
import { PAYS_SILGAPP } from "@/components/international/CountrySelector.jsx";
import AdminPaysDialog from "@/components/admin/AdminPaysDialog.jsx";

export default function AdminGlobal() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCreateAdmin, setShowCreateAdmin] = useState(null); // pays object

  const { data: pays = [], isLoading: loadingPays } = useQuery({
    queryKey: ["countries-all"],
    queryFn: () => base44.entities.Country.list("ordre"),
    initialData: [],
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["all-courses-externes"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 500),
    initialData: [],
    refetchInterval: 15000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["all-livreurs-externes"],
    queryFn: () => base44.entities.Livreur.filter({ type_livreur: "externe" }),
    initialData: [],
    refetchInterval: 30000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients-externes"],
    queryFn: () => base44.entities.ClientExterne.list(),
    initialData: [],
    refetchInterval: 30000,
  });

  const { data: admins = [] } = useQuery({
    queryKey: ["all-admins"],
    queryFn: () => base44.entities.User.filter({ role: "admin" }),
    initialData: [],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, actif }) => base44.entities.Country.update(id, { actif }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      queryClient.invalidateQueries({ queryKey: ["pays-actifs"] });
      toast.success(vars.actif ? "Pays activé " : "Pays désactivé");
    },
  });

  // Stats globales
  const globalStats = useMemo(() => {
    const todayCourses = courses.filter(c => isToday(new Date(c.created_date)));
    const livrees = courses.filter(c => c.statut === "livree" && isToday(new Date(c.heure_livraison || c.updated_date)));
    const ca = livrees.reduce((s, c) => s + (c.prix_final || 0), 0);
    const livreursActifs = livreurs.filter(l => l.statut !== "hors_ligne" && l.validation === "valide" && l.actif !== false);
    return {
      paysActifs: pays.filter(p => p.actif).length,
      totalClients: clients.length,
      totalLivreurs: livreurs.length,
      livreursActifs: livreursActifs.length,
      coursesToday: todayCourses.length,
      livreesToday: livrees.length,
      caToday: ca,
    };
  }, [pays, courses, livreurs, clients]);

  // Stats par pays
  const statsByPays = useMemo(() => {
    const allCodes = [...new Set([
      ...pays.map(p => p.code),
      ...PAYS_SILGAPP.map(p => p.code),
    ])];

    return allCodes.map(code => {
      const paysInfo = pays.find(p => p.code === code) || PAYS_SILGAPP.find(p => p.code === code);
      const c = courses.filter(x => (x.country_code || "BF") === code);
      const livrees = c.filter(x => x.statut === "livree");
      const enCours = c.filter(x => !["livree", "annulee"].includes(x.statut));
      const ca = livrees.reduce((s, x) => s + (x.prix_final || 0), 0);
      const lvrs = livreurs.filter(x => (x.country_code || "BF") === code);
      const cls = clients.filter(x => (x.country_code || "BF") === code);
      const adminsPaysList = admins.filter(a => a.country_code === code && a.admin_type === "pays");

      return {
        code,
        paysInfo,
        total: c.length,
        livrees: livrees.length,
        enCours: enCours.length,
        ca,
        livreurs: lvrs.length,
        clients: cls.length,
        adminsCount: adminsPaysList.length,
        actif: paysInfo?.actif || false,
        paysId: paysInfo?.id,
        devise: paysInfo?.devise || "FCFA",
      };
    }).sort((a, b) => b.total - a.total);
  }, [pays, courses, livreurs, clients, admins]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">

      {/* ── HERO HEADER ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 p-5 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl"></div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Admin Global SILGAPP</h1>
              <p className="text-white/60 text-xs mt-0.5">Supervision de toutes les opérations multi-pays</p>
            </div>
          </div>
          <Link to="/admin/gestion-pays">
            <Button variant="ghost" size="sm" className="gap-1.5 text-white hover:bg-white/20 border border-white/30">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Configurer</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* ── KPI GLOBAUX ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {[
          { label: "Pays actifs", value: globalStats.paysActifs, grad: "from-emerald-500 to-teal-500", icon: "" },
          { label: "Clients", value: globalStats.totalClients, grad: "from-violet-500 to-purple-600", icon: "" },
          { label: "Livreurs", value: globalStats.totalLivreurs, grad: "from-blue-500 to-indigo-600", icon: "" },
          { label: "Actifs", value: globalStats.livreursActifs, grad: "from-cyan-500 to-sky-500", icon: "" },
          { label: "Courses auj.", value: globalStats.coursesToday, grad: "from-orange-500 to-amber-500", icon: "" },
          { label: "Livrées auj.", value: globalStats.livreesToday, grad: "from-green-500 to-emerald-500", icon: "" },
          { label: "CA du jour", value: `${globalStats.caToday.toLocaleString()}`, grad: "from-primary to-red-600", icon: "" },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-2xl p-3 text-white shadow-md`}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] font-semibold opacity-80 uppercase tracking-wide leading-tight">{s.label}</p>
              <span className="text-sm">{s.icon}</span>
            </div>
            <p className="text-xl font-black leading-none truncate">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── TABLEAU PAR PAYS ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
            <Globe className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground">Tableau de bord par pays</p>
            <p className="text-xs text-muted-foreground">{statsByPays.length} pays configurés</p>
          </div>
        </div>

        <div className="space-y-3">
          {statsByPays.map(({ code, paysInfo, total, livrees, enCours, ca, livreurs: lv, clients: cl, adminsCount, actif, paysId, devise }) => (
            <div
              key={code}
              className={`rounded-2xl border p-4 transition-all ${actif ? "border-green-100 bg-green-50/30" : "border-gray-100 bg-gray-50/50 opacity-70"}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Info pays */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm ${actif ? "bg-green-100" : "bg-gray-100"}`}>
                    {paysInfo?.emoji_flag || ""}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black text-foreground">{paysInfo?.nom || code}</span>
                      <span className="text-[10px] font-bold text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">{code}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {actif ? "● Actif" : "○ Inactif"}
                      </span>
                      {adminsCount > 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5" />{adminsCount} admin{adminsCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-2">
                      {[
                        { label: "Courses", value: total, bg: "bg-gray-100", text: "text-gray-700" },
                        { label: "Livrées", value: livrees, bg: "bg-green-100", text: "text-green-700" },
                        { label: "En cours",value: enCours, bg: "bg-blue-100", text: "text-blue-700" },
                        { label: "Livreurs",value: lv, bg: "bg-orange-100", text: "text-orange-700" },
                        { label: "Clients", value: cl, bg: "bg-violet-100", text: "text-violet-700" },
                        { label: `CA (${devise})`, value: ca.toLocaleString(), bg: "bg-amber-100", text: "text-amber-700" },
                      ].map(m => (
                        <div key={m.label} className={`${m.bg} rounded-xl p-1.5 text-center`}>
                          <p className={`font-black text-sm ${m.text}`}>{m.value}</p>
                          <p className="text-[9px] text-gray-500 mt-0.5">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-col sm:items-end">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs rounded-xl border-gray-200"
                      onClick={() => setShowCreateAdmin({ code, nom: paysInfo?.nom || code, emoji: paysInfo?.emoji_flag || "" })}
                    >
                      <Plus className="w-3 h-3" />
                      Admin
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs rounded-xl bg-gradient-to-r from-slate-700 to-slate-900"
                      onClick={() => navigate(`/admin/pays/${code}`)}
                      disabled={!actif}
                    >
                      <LayoutDashboard className="w-3 h-3" />
                      Dashboard
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                  {paysId && (
                    <button
                      onClick={() => toggleMutation.mutate({ id: paysId, actif: !actif })}
                      disabled={toggleMutation.isPending}
                      title={actif ? "Désactiver ce pays" : "Activer ce pays"}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:opacity-80"
                    >
                      {actif
                        ? <><ToggleRight className="w-4 h-4 text-green-500" /><span className="text-green-600">Désactiver</span></>
                        : <><ToggleLeft className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Activer</span></>
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dialog créer admin pays */}
      {showCreateAdmin && (
        <AdminPaysDialog
          pays={showCreateAdmin}
          admins={admins}
          onClose={() => setShowCreateAdmin(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["all-admins"] });
            setShowCreateAdmin(null);
            toast.success("Admin pays configuré ");
          }}
        />
      )}
    </div>
  );
}