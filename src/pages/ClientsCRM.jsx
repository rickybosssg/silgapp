import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Users, ArrowLeft, Phone, MessageCircle, Flame, Zap, Ban, Loader2 } from "lucide-react";
import ClientFicheDialog from "@/components/crm/ClientFicheDialog";
import CrmConversionDashboard from "@/components/crm/CrmConversionDashboard";
import CrmProspectionPanel from "@/components/crm/CrmProspectionPanel";
import { normalizePhoneForWhatsapp } from "@/lib/courseContact";
import { cn } from "@/lib/utils";

const MESSAGE_PARTICULIER = "Bonjour 👋\nVous avez déjà utilisé le service de livraison SILGAPP.\nVous pouvez maintenant faire directement vos demandes de livraison depuis l'application SILGAPP, sans passer par notre équipe.\nC'est simple, rapide et vous permet de suivre votre livraison.";

const MESSAGE_PRO = "Bonjour 👋\nVous avez déjà utilisé SILGAPP pour vos livraisons.\nAvec l'application SILGAPP, vous pouvez demander directement un livreur pour livrer vos clients.\nVous continuez à vendre, SILGAPP s'occupe de la livraison.";

const PIPELINE_LABELS = {
  a_contacter: "À contacter",
  contacte: "Contacté",
  interesse: "Intéressé",
  a_relancer: "À relancer",
  app_installee: "App installée",
  converti: "Converti",
  pas_interesse: "Pas intéressé",
  ne_plus_contacter: "Ne plus contacter",
};

const PIPELINE_COLORS = {
  a_contacter: "bg-blue-100 text-blue-700",
  contacte: "bg-cyan-100 text-cyan-700",
  interesse: "bg-green-100 text-green-700",
  a_relancer: "bg-amber-100 text-amber-700",
  app_installee: "bg-purple-100 text-purple-700",
  converti: "bg-emerald-100 text-emerald-700",
  pas_interesse: "bg-gray-100 text-gray-600",
  ne_plus_contacter: "bg-red-100 text-red-700",
};

export default function ClientsCRM() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("all");
  const [filterPipeline, setFilterPipeline] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [selectedClient, setSelectedClient] = useState(null);
  const [ficheOpen, setFicheOpen] = useState(false);

  // ── Chargement bulk : clients + prospections ──
  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["crm-clients-all"],
    queryFn: async () => {
      const data = await base44.entities.ClientExterne.list("-created_date", 500);
      return data || [];
    },
  });

  const { data: prospections = [] } = useQuery({
    queryKey: ["crm-prospections"],
    queryFn: async () => {
      const data = await base44.entities.CrmProspection.list("-created_date", 500);
      return data || [];
    },
    refetchInterval: 30000,
  });

  // ── Stats conversion (backend bulk) ──
  const { data: conversionStats, refetch: refetchStats } = useQuery({
    queryKey: ["crm-conversion-stats"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getCrmConversionStats", {});
      return res?.data || res;
    },
    refetchInterval: 60000,
  });

  // ── Map prospection par client_id ──
  const prospectionMap = useMemo(() => {
    const m = new Map();
    for (const p of prospections) {
      if (p.client_id) m.set(p.client_id, p);
    }
    return m;
  }, [prospections]);

  // ── Stats rapides (depuis les données locales) ──
  const localStats = useMemo(() => {
    const total = clients.length;
    const withApp = clients.filter(c => c.user_email).length;
    const withoutApp = total - withApp;
    const withPhone = clients.filter(c => (c.telephone_normalized || "").length >= 8).length;
    return { total, withApp, withoutApp, withPhone };
  }, [clients]);

  // ── Filtrage ──
  const filtered = useMemo(() => {
    let result = clients;

    // Filtre statut CRM
    if (filterStatut !== "all") {
      if (filterStatut === "with_app") {
        result = result.filter(c => c.user_email);
      } else if (filterStatut === "without_app") {
        result = result.filter(c => !c.user_email);
      } else if (filterStatut === "with_phone") {
        result = result.filter(c => (c.telephone_normalized || "").length >= 8);
      } else if (filterStatut === "priority_1") {
        result = result.filter(c => {
          const p = prospectionMap.get(c.id);
          return p?.priorite === 1 || (!p && (c.nb_courses_total || 0) >= 2);
        });
      } else {
        result = result.filter(c => c.statut_crm === filterStatut);
      }
    }

    // Filtre pipeline
    if (filterPipeline !== "all") {
      result = result.filter(c => {
        const p = prospectionMap.get(c.id);
        if (filterPipeline === "no_prospection") return !p;
        return p?.pipeline_status === filterPipeline;
      });
    }

    // Filtre type
    if (filterType !== "all") {
      result = result.filter(c => {
        const p = prospectionMap.get(c.id);
        return (p?.crm_type || "particulier") === filterType;
      });
    }

    // Recherche
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
  }, [clients, search, filterStatut, filterPipeline, filterType, prospectionMap]);

  const openFiche = (client) => {
    setSelectedClient(client);
    setFicheOpen(true);
  };

  // ── Lien WhatsApp pour un client ──
  const buildWhatsAppLink = useCallback((client) => {
    const phone = normalizePhoneForWhatsapp(client?.telephone, client?.country_code);
    if (!phone) return null;
    const prospect = prospectionMap.get(client.id);
    const isPro = prospect?.crm_type === "commerce" || prospect?.crm_type === "restaurant" || prospect?.crm_type === "entreprise";
    const msg = isPro ? MESSAGE_PRO : MESSAGE_PARTICULIER;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }, [prospectionMap]);

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
            <p className="text-xs text-gray-500">Conversion CRM → App · {localStats.total} fiches · {localStats.withApp} avec App</p>
          </div>
        </div>

        {/* Tableau de bord conversion */}
        <CrmConversionDashboard stats={conversionStats} />

        {/* File de prospection WhatsApp */}
        <CrmProspectionPanel
          prospections={prospections}
          clients={clients}
          onRefresh={() => {
            queryClient.invalidateQueries({ queryKey: ["crm-prospections"] });
            refetchStats();
          }}
        />

        {/* Search + filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom, téléphone, quartier..."
              className="pl-10 h-11 rounded-xl bg-white border-gray-200"
            />
          </div>

          {/* Filtres statut CRM */}
          <div className="flex gap-1.5 overflow-x-auto">
            {[
              { key: "all", label: "Tous" },
              { key: "with_app", label: "Avec App" },
              { key: "without_app", label: "Sans App" },
              { key: "priority_1", label: "🔥 Priorité 1" },
              { key: "with_phone", label: "Avec tél" },
              { key: "actif", label: "Actifs" },
              { key: "vip", label: "VIP" },
              { key: "nouveau", label: "Nouveaux" },
              { key: "inactif", label: "Inactifs" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatut(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                  filterStatut === f.key
                    ? "bg-blue-500 text-white shadow-md"
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Filtres pipeline + type */}
          <div className="flex gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide py-1.5">Pipeline:</span>
            {[
              { key: "all", label: "Tous" },
              { key: "no_prospection", label: "Nouveau" },
              { key: "a_contacter", label: "À contacter" },
              { key: "contacte", label: "Contacté" },
              { key: "interesse", label: "Intéressé" },
              { key: "a_relancer", label: "À relancer" },
              { key: "app_installee", label: "App installée" },
              { key: "converti", label: "Converti" },
              { key: "pas_interesse", label: "Pas intéressé" },
              { key: "ne_plus_contacter", label: "Ne plus contacter" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterPipeline(f.key)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all",
                  filterPipeline === f.key
                    ? "bg-green-500 text-white shadow-md"
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide py-1.5">Type:</span>
            {[
              { key: "all", label: "Tous" },
              { key: "particulier", label: "Particulier" },
              { key: "commerce", label: "Commerce" },
              { key: "restaurant", label: "Restaurant" },
              { key: "entreprise", label: "Entreprise" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterType(f.key)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all",
                  filterType === f.key
                    ? "bg-purple-500 text-white shadow-md"
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Client list */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
            {filtered.length} client{filtered.length > 1 ? "s" : ""} trouvé{filtered.length > 1 ? "s" : ""}
          </p>
          {loadingClients ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 text-gray-300 animate-spin mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Aucun client trouvé</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {filtered.map(c => {
                const prospect = prospectionMap.get(c.id);
                const hasApp = !!c.user_email;
                const priority = prospect?.priorite || ((c.nb_courses_total || 0) >= 2 ? 1 : (c.nb_courses_total || 0) >= 1 ? 2 : 3);
                const isDoNotContact = prospect?.pipeline_status === "ne_plus_contacter";
                const waLink = buildWhatsAppLink(c);

                return (
                  <div
                    key={c.id}
                    className={cn(
                      "bg-white rounded-xl border p-3 transition-all",
                      isDoNotContact ? "border-red-200 opacity-60" : "border-gray-100 hover:shadow-md hover:border-blue-200"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <button onClick={() => openFiche(c)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {(c.nom || c.prenom || "C").charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-bold text-gray-700 truncate">
                          {c.prenom} {c.nom}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {priority === 1 && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded">🔥</span>}
                        {priority === 2 && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded">🟠</span>}
                        {hasApp ? (
                          <Badge className="text-[9px] bg-purple-100 text-purple-700">App</Badge>
                        ) : (
                          <Badge className="text-[9px] bg-slate-100 text-slate-500">CRM</Badge>
                        )}
                        {prospect?.pipeline_status && (
                          <Badge className={cn("text-[9px]", PIPELINE_COLORS[prospect.pipeline_status])}>
                            {PIPELINE_LABELS[prospect.pipeline_status]}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <Phone className="w-3 h-3" />
                      <span className="truncate">{c.telephone}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-gray-400">{c.nb_courses_total || 0} course{(c.nb_courses_total || 0) > 1 ? "s" : ""}</span>
                      <div className="flex items-center gap-1">
                        {(c.montant_total_depense || 0) > 0 && (
                          <span className="text-[10px] font-bold text-green-600">{(c.montant_total_depense || 0).toLocaleString()} F</span>
                        )}
                        {/* Bouton WhatsApp — ouvre WhatsApp, n'envoie PAS automatiquement */}
                        {waLink && !isDoNotContact && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-7 h-7 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center hover:bg-green-100 transition-colors"
                            title="Contacter sur WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                          </a>
                        )}
                        {isDoNotContact && (
                          <span className="text-[9px] font-bold text-red-500 flex items-center gap-0.5">
                            <Ban className="w-3 h-3" /> Exclu
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedClient && (
        <ClientFicheDialog
          open={ficheOpen}
          onClose={() => setFicheOpen(false)}
          client={selectedClient}
          prospection={prospectionMap.get(selectedClient.id)}
        />
      )}
    </div>
  );
}