import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, Users, Phone, Package, Calendar } from "lucide-react";

/**
 * ClientsEnterpriseTab — Liste des clients liés à cette Enterprise
 *
 * PRINCIPES :
 *   1. Les clients sont dérivés des CourseExterne (pas de ClientExterne.enterprise_id)
 *   2. Un client partagé entre CDL et Enterprise B est visible chez les deux
 *   3. Les stats (nb courses, dernière course) sont scoped à cette enterprise
 *   4. NE PAS faire ClientExterne.filter({ enterprise_id })
 */
export default function ClientsEnterpriseTab() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getEnterpriseClients", {});
      const data = res?.data || res;
      setClients(data?.clients || []);
    } catch (err) {
      setError(err?.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.nom || "").toLowerCase().includes(q) ||
      (c.telephone || "").toLowerCase().includes(q) ||
      (c.telephone_normalized || "").includes(q)
    );
  });

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={loadClients} className="text-xs text-blue-500">Réessayer</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Recherche ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou téléphone..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-300/50 focus:border-blue-400"
        />
      </div>

      {/* ── Compteur ── */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Users className="w-3.5 h-3.5" />
        <span>{filtered.length} client{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {/* ── Liste ── */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((client, idx) => (
            <div
              key={client.id || `temp-${idx}`}
              className="bg-white rounded-xl border p-3 shadow-sm"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-blue-600">
                    {(client.nom || "C").charAt(0).toUpperCase()}
                  </span>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {client.nom || "Client"}
                    {client.prenom ? ` ${client.prenom}` : ""}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Phone className="w-3 h-3" />
                    <span className="truncate">{client.telephone || "—"}</span>
                  </div>
                  {/* Stats enterprise */}
                  <div className="flex items-center gap-3 text-[10px] text-gray-400 pt-1">
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      {client._enterprise_course_count || 0} course{(client._enterprise_course_count || 0) > 1 ? "s" : ""}
                    </span>
                    {client._enterprise_last_course_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(client._enterprise_last_course_date).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    {(client._enterprise_total_spent || 0) > 0 && (
                      <span className="font-semibold text-gray-600">
                        {(client._enterprise_total_spent || 0).toLocaleString("fr-FR")} F
                      </span>
                    )}
                  </div>
                </div>
                {/* Statut CRM */}
                {client.statut_crm && (
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap ${
                    client.statut_crm === "vip" ? "bg-purple-100 text-purple-700" :
                    client.statut_crm === "actif" ? "bg-emerald-100 text-emerald-700" :
                    client.statut_crm === "inactif" ? "bg-gray-100 text-gray-500" :
                    "bg-blue-100 text-blue-700"
                  }`}>
                    {client.statut_crm}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">
            {search ? "Aucun client trouvé" : "Aucun client. Créez une course pour voir vos clients."}
          </p>
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center pt-2">
        Les clients sont dérivés des courses de votre agence. Un client partagé avec une autre agence reste unique dans la base centrale SILGAPP.
      </p>
    </div>
  );
}