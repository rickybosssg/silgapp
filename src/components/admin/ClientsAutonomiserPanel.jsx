import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Users, TrendingUp, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * ClientsAutonomiserPanel — Phase 5 Étape 2
 *
 * Vue admin : "Clients à autonomiser"
 * Affiche les clients dépendants de l'admin (≥70% courses admin, ≥5 courses 30j).
 *
 * Définition AUTONOME :
 * Client historiquement dépendant de l'admin (≥70% courses admin)
 * ayant ensuite créé au moins 2 courses réelles depuis l'application client.
 * Une course source=admin n'est JAMAIS comptée comme preuve d'autonomie.
 *
 * Statuts :
 * - À accompagner : ≥70% admin, <2 courses app
 * - Accompagné : accompagnement manuel en cours
 * - Utilise l'app : ≥2 courses app mais encore ≥50% admin
 * - Autonome : ≥2 courses app ET <50% admin récent
 *
 * NE MODIFIE PAS : Dispatch V2, finance, commissions, CRM, réactivation.
 */
export default function ClientsAutonomiserPanel() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, aAccompagner: 0, utiliseApp: 0, autonome: 0 });

  const computeAutonomyStatus = useCallback((client) => {
    const total = client.total_courses || 0;
    const adminCount = client.admin_count || 0;
    const appCount = client.app_count || 0;

    if (total < 5) return "faible_potentiel";

    const pctAdmin = total > 0 ? adminCount / total : 0;

    // AUTONOME : ≥2 courses app ET <50% admin
    if (appCount >= 2 && pctAdmin < 0.5) return "autonome";

    // Utilise l'app : ≥2 courses app mais encore ≥50% admin
    if (appCount >= 2) return "utilise_app";

    // À accompagner : ≥70% admin, <2 courses app
    if (pctAdmin >= 0.7) return "a_accompagner";

    return "potentiel_moyen";
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const now = Date.now();
      const days30 = now - 30 * 86400000;

      // Charger toutes les courses 90j
      let allCourses = [];
      let skip = 0;
      while (true) {
        const batch = await base44.asServiceRole.entities.CourseExterne.filter(
          {}, "-created_date", 500, skip
        );
        if (!batch || batch.length === 0) break;
        allCourses.push(...batch);
        if (batch.length < 500) break;
        skip += 500;
        if (skip > 3000) break;
      }

      // Grouper par client (phone_normalized en priorité, email en fallback)
      const clientMap = new Map();
      for (const c of allCourses) {
        const phone = (c.client_phone_normalized || "").trim();
        const email = (c.client_user_email || "").trim().toLowerCase();
        const key = phone || (email ? `email:${email}` : null) || `raw:${c.client_telephone || c.client_nom || "unknown"}`;

        if (!clientMap.has(key)) {
          clientMap.set(key, {
            phone_normalized: phone || null,
            email: email || null,
            client_nom: c.client_nom || "",
            client_telephone: c.client_telephone || "",
            courses: [],
          });
        }
        clientMap.get(key).courses.push(c);
      }

      // Calculer stats par client
      const clientStats = [];
      for (const [key, data] of clientMap) {
        const courses = data.courses;
        const courses30 = courses.filter(c => c.created_date && new Date(c.created_date).getTime() >= days30);

        // Minimum 5 courses sur 90j
        if (courses.length < 5) continue;

        const adminCount = courses.filter(c => c.source === "admin").length;
        const appCount = courses.filter(c => c.source === "client").length;
        const venusCount = courses.filter(c => c.created_by_venus === true).length;
        const livrees = courses.filter(c => c.statut === "livree").length;

        // Départ récurrent
        const departs = courses.map(c => (c.quartier_depart || c.adresse_depart || "").trim()).filter(Boolean);
        const departCounts = {};
        for (const d of departs) departCounts[d] = (departCounts[d] || 0) + 1;
        const topDepart = Object.entries(departCounts).sort((a, b) => b[1] - a[1])[0];
        const pctSameDepart = topDepart && courses.length > 0 ? Math.round((topDepart[1] / courses.length) * 100) : 0;

        const lastCourse = courses.length > 0 ? courses[0].created_date : null;

        const status = computeAutonomyStatus({
          total_courses: courses.length,
          admin_count: adminCount,
          app_count: appCount,
        });

        clientStats.push({
          key,
          phone_normalized: data.phone_normalized,
          email: data.email,
          client_nom: data.client_nom,
          client_telephone: data.client_telephone,
          total_courses: courses.length,
          courses_30j: courses30.length,
          admin_count: adminCount,
          app_count: appCount,
          venus_count: venusCount,
          livrees: livrees,
          pct_admin: courses.length > 0 ? Math.round((adminCount / courses.length) * 100) : 0,
          top_depart: topDepart ? topDepart[0] : "—",
          pct_same_depart: pctSameDepart,
          last_course: lastCourse,
          status,
        });
      }

      // Trier par courses 30j desc
      clientStats.sort((a, b) => b.courses_30j - a.courses_30j);

      setClients(clientStats);

      setStats({
        total: clientStats.length,
        aAccompagner: clientStats.filter(c => c.status === "a_accompagner").length,
        utiliseApp: clientStats.filter(c => c.status === "utilise_app").length,
        autonome: clientStats.filter(c => c.status === "autonome").length,
      });
    } catch (err) {
      console.error("[ClientsAutonomiser] Erreur:", err);
    } finally {
      setLoading(false);
    }
  }, [computeAutonomyStatus]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const statusBadge = (status) => {
    switch (status) {
      case "a_accompagner":
        return <Badge className="bg-red-100 text-red-700 border-red-200">À accompagner</Badge>;
      case "utilise_app":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Utilise l'app</Badge>;
      case "autonome":
        return <Badge className="bg-green-100 text-green-700 border-green-200">Autonome</Badge>;
      default:
        return <Badge variant="secondary">Potentiel moyen</Badge>;
    }
  };

  const maskPhone = (phone) => {
    if (!phone || phone.length < 4) return "—";
    return phone.slice(0, 6) + "****" + phone.slice(-2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase">Total clients ≥5 courses</p>
          <p className="text-2xl font-black text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-3">
          <p className="text-[10px] font-bold text-red-600 uppercase">À accompagner</p>
          <p className="text-2xl font-black text-red-700">{stats.aAccompagner}</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-3">
          <p className="text-[10px] font-bold text-amber-600 uppercase">Utilise l'app</p>
          <p className="text-2xl font-black text-amber-700">{stats.utiliseApp}</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-3">
          <p className="text-[10px] font-bold text-green-600 uppercase">Autonomes</p>
          <p className="text-2xl font-black text-green-700">{stats.autonome}</p>
        </div>
      </div>

      {/* Définition AUTONOME */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs font-bold text-blue-900">Définition « Autonome »</p>
        <p className="text-[11px] text-blue-800 mt-1">
          Client historiquement dépendant de l'admin (≥70% courses admin) ayant ensuite créé
          au moins <strong>2 courses réelles depuis l'application client</strong>.
          Une course source=admin n'est jamais comptée comme preuve d'autonomie.
        </p>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 font-bold text-gray-600">Client</th>
                <th className="text-left p-2 font-bold text-gray-600">Tél</th>
                <th className="text-center p-2 font-bold text-gray-600">C30j</th>
                <th className="text-center p-2 font-bold text-gray-600">Admin</th>
                <th className="text-center p-2 font-bold text-gray-600">App</th>
                <th className="text-center p-2 font-bold text-gray-600">% Adm</th>
                <th className="text-center p-2 font-bold text-gray-600">Départ récurrent</th>
                <th className="text-center p-2 font-bold text-gray-600">Statut</th>
                <th className="text-center p-2 font-bold text-gray-600">Dernière</th>
              </tr>
            </thead>
            <tbody>
              {clients.slice(0, 50).map((c, i) => (
                <tr key={c.key} className="border-b hover:bg-gray-50">
                  <td className="p-2 font-semibold text-gray-900">{c.client_nom || "—"}</td>
                  <td className="p-2 text-gray-600">{maskPhone(c.phone_normalized)}</td>
                  <td className="p-2 text-center font-bold text-gray-900">{c.courses_30j}</td>
                  <td className="p-2 text-center text-red-600">{c.admin_count}</td>
                  <td className="p-2 text-center text-green-600">{c.app_count}</td>
                  <td className="p-2 text-center">
                    <span className={c.pct_admin >= 70 ? "text-red-600 font-bold" : "text-gray-600"}>
                      {c.pct_admin}%
                    </span>
                  </td>
                  <td className="p-2 text-center text-gray-600">
                    {c.pct_same_depart >= 70 ? (
                      <span className="text-blue-600 font-semibold">{c.pct_same_depart}%</span>
                    ) : (
                      <span className="text-gray-400">{c.pct_same_depart}%</span>
                    )}
                  </td>
                  <td className="p-2 text-center">{statusBadge(c.status)}</td>
                  <td className="p-2 text-center text-gray-500">
                    {c.last_course ? c.last_course.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {clients.length > 50 && (
          <p className="text-center text-xs text-gray-400 py-2">
            Affichage des 50 premiers sur {clients.length}
          </p>
        )}
      </div>
    </div>
  );
}