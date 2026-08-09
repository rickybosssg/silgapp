import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Users, UserPlus, Star, UserX, TrendingUp, MapPin, ArrowLeft, Phone } from "lucide-react";
import ClientFicheDialog from "@/components/crm/ClientFicheDialog";

export default function ClientsCRM() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("all");
  const [selectedClient, setSelectedClient] = useState(null);
  const [ficheOpen, setFicheOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await base44.entities.ClientExterne.list("-created_date", 500);
        setClients(data || []);
      } catch {
        setClients([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const stats = useMemo(() => {
    const total = clients.length;
    const thisMonth = clients.filter(c => {
      if (!c.created_date) return false;
      const d = new Date(c.created_date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const actifs = clients.filter(c => c.statut_crm === "actif").length;
    const inactifs = clients.filter(c => c.statut_crm === "inactif").length;
    const vips = clients.filter(c => c.statut_crm === "vip").length;
    const nouveaux = clients.filter(c => c.statut_crm === "nouveau").length;
    const topClients = [...clients].sort((a, b) => (b.montant_total_depense || 0) - (a.montant_total_depense || 0)).slice(0, 5);

    // Stats par quartier
    const quartierCount = {};
    clients.forEach(c => {
      if (c.dernier_quartier_depart) {
        quartierCount[c.dernier_quartier_depart] = (quartierCount[c.dernier_quartier_depart] || 0) + 1;
      }
    });
    const topQuartiers = Object.entries(quartierCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { total, thisMonth, actifs, inactifs, vips, nouveaux, topClients, topQuartiers };
  }, [clients]);

  const filtered = useMemo(() => {
    let result = clients;
    if (filterStatut !== "all") {
      result = result.filter(c => c.statut_crm === filterStatut);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, "");
      result = result.filter(c =>
        (c.nom || "").toLowerCase().includes(q) ||
        (c.prenom || "").toLowerCase().includes(q) ||
        (c.telephone || "").includes(qDigits) ||
        (c.telephone_normalized || "").includes(qDigits) ||
        (c.quartier || "").toLowerCase().includes(q) ||
        (c.dernier_quartier_depart || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [clients, search, filterStatut]);

  const openFiche = (client) => {
    setSelectedClient(client);
    setFicheOpen(true);
  };

  const STATUT_BADGE = {
    actif: "bg-green-100 text-green-700 border-green-300",
    inactif: "bg-red-100 text-red-700 border-red-300",
    vip: "bg-amber-100 text-amber-700 border-amber-300",
    nouveau: "bg-yellow-100 text-yellow-700 border-yellow-300",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/">
            <button className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-all">
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" /> CRM Clients
            </h1>
            <p className="text-xs text-gray-500">Gestion de la relation client SILGAPP</p>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <Card className="p-3 text-center">
            <Users className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-800">{stats.total}</p>
            <p className="text-[9px] text-gray-500 uppercase font-semibold">Total</p>
          </Card>
          <Card className="p-3 text-center">
            <UserPlus className="w-4 h-4 text-cyan-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-800">{stats.thisMonth}</p>
            <p className="text-[9px] text-gray-500 uppercase font-semibold">Ce mois</p>
          </Card>
          <Card className="p-3 text-center">
            <TrendingUp className="w-4 h-4 text-green-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-800">{stats.actifs}</p>
            <p className="text-[9px] text-gray-500 uppercase font-semibold">Actifs</p>
          </Card>
          <Card className="p-3 text-center">
            <UserX className="w-4 h-4 text-red-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-800">{stats.inactifs}</p>
            <p className="text-[9px] text-gray-500 uppercase font-semibold">Inactifs</p>
          </Card>
          <Card className="p-3 text-center">
            <Star className="w-4 h-4 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-800">{stats.vips}</p>
            <p className="text-[9px] text-gray-500 uppercase font-semibold">VIP</p>
          </Card>
          <Card className="p-3 text-center">
            <UserPlus className="w-4 h-4 text-yellow-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-800">{stats.nouveaux}</p>
            <p className="text-[9px] text-gray-500 uppercase font-semibold">Nouveaux</p>
          </Card>
          <Card className="p-3 text-center">
            <MapPin className="w-4 h-4 text-purple-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-800">{stats.topQuartiers.length}</p>
            <p className="text-[9px] text-gray-500 uppercase font-semibold">Quartiers</p>
          </Card>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom, téléphone, quartier..."
              className="pl-10 h-11 rounded-xl bg-white border-gray-200"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {[
              { key: "all", label: "Tous" },
              { key: "actif", label: "Actifs" },
              { key: "vip", label: "VIP" },
              { key: "nouveau", label: "Nouveaux" },
              { key: "inactif", label: "Inactifs" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatut(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  filterStatut === f.key
                    ? "bg-blue-500 text-white shadow-md"
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Top clients + Top quartiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400" /> Meilleurs clients
            </p>
            {stats.topClients.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun client</p>
            ) : (
              <div className="space-y-1.5">
                {stats.topClients.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => openFiche(c)}
                    className="w-full flex items-center justify-between hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                      <span className="text-sm font-semibold text-gray-700 truncate">
                        {c.prenom} {c.nom}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-green-600 flex-shrink-0">
                      {(c.montant_total_depense || 0).toLocaleString()} F
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-purple-400" /> Quartiers les plus actifs
            </p>
            {stats.topQuartiers.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun quartier</p>
            ) : (
              <div className="space-y-1.5">
                {stats.topQuartiers.map(([quartier, count], i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{quartier}</span>
                    <Badge variant="outline" className="text-[10px]">{count} clients</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Client list */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
            {filtered.length} client{filtered.length > 1 ? "s" : ""} trouvé{filtered.length > 1 ? "s" : ""}
          </p>
          {loading ? (
            <p className="text-center text-gray-400 py-8">Chargement...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Aucun client trouvé</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => openFiche(c)}
                  className="text-left bg-white rounded-xl border border-gray-100 p-3 hover:shadow-md hover:border-blue-200 transition-all"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {(c.nom || c.prenom || "C").charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-bold text-gray-700 truncate">
                        {c.prenom} {c.nom}
                      </span>
                    </div>
                    <Badge className={`text-[9px] ${STATUT_BADGE[c.statut_crm] || STATUT_BADGE.nouveau}`}>
                      {c.statut_crm === "vip" && <Star className="w-2.5 h-2.5 mr-0.5" />}
                      {c.statut_crm || "nouveau"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <Phone className="w-3 h-3" />
                    <span>{c.telephone}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-gray-400">{c.nb_courses_total || 0} course{(c.nb_courses_total || 0) > 1 ? "s" : ""}</span>
                    {(c.montant_total_depense || 0) > 0 && (
                      <span className="text-[10px] font-bold text-green-600">{(c.montant_total_depense || 0).toLocaleString()} F</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedClient && (
        <ClientFicheDialog
          open={ficheOpen}
          onClose={() => setFicheOpen(false)}
          client={selectedClient}
        />
      )}
    </div>
  );
}
