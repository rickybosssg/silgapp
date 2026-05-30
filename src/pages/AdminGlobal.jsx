import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Globe, ArrowRight, ToggleLeft, ToggleRight, Users, Package,
  Truck, TrendingUp, Plus, Settings, LayoutDashboard, Edit, ShieldCheck
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
      toast.success(vars.actif ? "Pays activé ✓" : "Pays désactivé");
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
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Admin Global SILGAPP</h1>
            <p className="text-xs text-muted-foreground">Supervision de toutes les opérations multi-pays</p>
          </div>
        </div>
        <Link to="/admin/gestion-pays">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Settings className="w-4 h-4" />
            Configurer les pays
          </Button>
        </Link>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Pays actifs", value: globalStats.paysActifs, color: "bg-emerald-500", icon: Globe },
          { label: "Clients", value: globalStats.totalClients, color: "bg-purple-500", icon: Users },
          { label: "Livreurs", value: globalStats.totalLivreurs, color: "bg-blue-500", icon: Truck },
          { label: "Livreurs actifs", value: globalStats.livreursActifs, color: "bg-accent", icon: Truck },
          { label: "Courses auj.", value: globalStats.coursesToday, color: "bg-indigo-500", icon: Package },
          { label: "Livrées auj.", value: globalStats.livreesToday, color: "bg-emerald-600", icon: Package },
          { label: "CA du jour", value: `${globalStats.caToday.toLocaleString()} FCFA`, color: "bg-yellow-500", icon: TrendingUp },
        ].map(s => (
          <Card key={s.label} className="p-3 flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center flex-shrink-0`}>
              <s.icon className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{s.label}</p>
              <p className="font-bold text-foreground text-sm truncate">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Tableau des pays */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Tableau de bord par pays
        </h2>
        <div className="space-y-3">
          {statsByPays.map(({ code, paysInfo, total, livrees, enCours, ca, livreurs: lv, clients: cl, adminsCount, actif, paysId, devise }) => (
            <Card
              key={code}
              className={`p-4 transition-all border-2 ${actif ? "border-green-200 bg-green-50/20" : "border-border opacity-70"}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Info pays */}
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-2xl">{paysInfo?.emoji_flag || "🌍"}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{paysInfo?.nom || code}</span>
                      <span className="text-xs text-muted-foreground">{code}</span>
                      {actif ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">✅ Actif</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactif</Badge>
                      )}
                      {adminsCount > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">
                          <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                          {adminsCount} admin{adminsCount > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    {/* Mini stats */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span>📦 {total} courses</span>
                      <span>✅ {livrees} livrées</span>
                      <span>🔄 {enCours} en cours</span>
                      <span>🛵 {lv} livreurs</span>
                      <span>👤 {cl} clients</span>
                      <span className="font-medium text-foreground">💰 {ca.toLocaleString()} {devise}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {/* Créer admin pays */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => setShowCreateAdmin({ code, nom: paysInfo?.nom || code, emoji: paysInfo?.emoji_flag || "🌍" })}
                  >
                    <Plus className="w-3 h-3" />
                    Admin pays
                  </Button>

                  {/* Ouvrir dashboard pays */}
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs h-8 bg-primary"
                    onClick={() => navigate(`/admin/pays/${code}`)}
                    disabled={!actif}
                  >
                    <LayoutDashboard className="w-3 h-3" />
                    Dashboard
                    <ArrowRight className="w-3 h-3" />
                  </Button>

                  {/* Toggle actif/inactif */}
                  {paysId && (
                    <button
                      onClick={() => toggleMutation.mutate({ id: paysId, actif: !actif })}
                      disabled={toggleMutation.isPending}
                      title={actif ? "Désactiver ce pays" : "Activer ce pays"}
                    >
                      {actif
                        ? <ToggleRight className="w-8 h-8 text-green-500" />
                        : <ToggleLeft className="w-8 h-8 text-gray-400" />
                      }
                    </button>
                  )}
                </div>
              </div>
            </Card>
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
            toast.success("Admin pays configuré ✓");
          }}
        />
      )}
    </div>
  );
}