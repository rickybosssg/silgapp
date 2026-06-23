import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Truck, Package, MapPin, Phone, CheckCircle, Clock, Pill, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PharmacieLivraisons({ pharmacieId, pharmacieNom, onNavigate }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(null);

  // ── Récupérer les conversations de la pharmacie ──
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations-pharmacie", pharmacieId],
    queryFn: async () => {
      const all = await base44.entities.Conversation.list("-last_message_date", 100);
      return (all || []).filter(c => {
        try {
          const parts = JSON.parse(c.participants || "[]");
          return parts.some(p => p.type === "partenaire" && p.id === pharmacieId);
        } catch { return false; }
      });
    },
    refetchInterval: 15000,
  });

  // ── Récupérer les courses liées à cette pharmacie ──
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-pharmacie", pharmacieId],
    queryFn: async () => {
      const all = await base44.entities.CourseExterne.filter({ country_code: (await base44.entities.Pharmacie.get(pharmacieId)).pays_code }, "-created_date", 50);
      // Filtrer les courses dont le départ correspond à la pharmacie
      return (all || []).filter(c => c.expediteur_nom === pharmacieNom);
    },
    enabled: !!pharmacieId,
    refetchInterval: 10000,
  });

  // ── Pour chaque conversation, récupérer le client ──
  const [clientsMap, setClientsMap] = useState({});
  useEffect(() => {
    conversations.forEach(conv => {
      try {
        const parts = JSON.parse(conv.participants || "[]");
        const clientPart = parts.find(p => p.type === "client");
        if (clientPart?.id && !clientsMap[clientPart.id]) {
          base44.entities.ClientExterne.get(clientPart.id).then(c => {
            setClientsMap(prev => ({ ...prev, [clientPart.id]: c }));
          }).catch(() => {});
        }
      } catch {}
    });
  }, [conversations]);

  const handleCreerLivraison = async (conv) => {
    let clientPart;
    try {
      const parts = JSON.parse(conv.participants || "[]");
      clientPart = parts.find(p => p.type === "client");
    } catch {}
    if (!clientPart?.id) return;

    const client = clientsMap[clientPart.id];
    if (!client?.latitude || !client?.longitude) {
      alert("Le client n'a pas de position GPS. Demandez-lui d'ouvrir l'application SILGAPP.");
      return;
    }

    if (!confirm(`Créer une livraison vers ${clientPart.name || 'ce client'} ?`)) return;

    setCreating(conv.id);
    try {
      const res = await base44.functions.invoke("creerLivraisonPharmacie", {
        pharmacie_id: pharmacieId,
        client_id: clientPart.id,
        conversation_id: conv.id,
      });
      if (res?.data?.success) {
        alert("✅ Livraison créée ! Recherche d'un livreur en cours...");
        queryClient.invalidateQueries({ queryKey: ["courses-pharmacie", pharmacieId] });
      } else {
        alert("Erreur: " + (res?.data?.error || "échec"));
      }
    } catch (err) {
      alert("Erreur: " + (err?.message || "échec"));
    }
    setCreating(null);
  };

  const activeCourses = courses.filter(c => !["livree", "annulee"].includes(c.statut));

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-gray-900 text-base px-1">Livraisons pharmacie</h2>

      {/* ── Courses actives ── */}
      {activeCourses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase px-1">Courses en cours</p>
          {activeCourses.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400">#{(c.id || "").slice(-6)}</span>
                <span className={"text-[10px] font-bold px-2 py-1 rounded-full " +
                  (c.statut === "nouvelle" || c.statut === "recherche_livreur" ? "bg-amber-50 text-amber-600" :
                   c.statut === "livreur_en_route" ? "bg-blue-50 text-blue-600" :
                   c.statut === "colis_recupere" || c.statut === "en_livraison" ? "bg-indigo-50 text-indigo-600" :
                   "bg-gray-50 text-gray-600")}>
                  {c.statut === "nouvelle" ? "Nouvelle" :
                   c.statut === "recherche_livreur" ? "Recherche livreur" :
                   c.statut === "livreur_en_route" ? "Livreur en route" :
                   c.statut === "arrive_prise_en_charge" ? "Livreur arrivé" :
                   c.statut === "colis_recupere" ? "Colis récupéré" :
                   c.statut === "en_livraison" ? "En livraison" : c.statut}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Package className="w-3 h-3" /> {c.destinataire_nom || "Client"}
                <Phone className="w-3 h-3 ml-2" /> {c.destinataire_telephone || "—"}
              </div>
              {c.livreur_nom && (
                <div className="flex items-center gap-2 text-xs text-indigo-600">
                  <Truck className="w-3 h-3" /> Livreur: {c.livreur_nom}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Conversations → boutons livraison ── */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-500 uppercase px-1">Créer une livraison depuis une conversation</p>
        {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}
        {!isLoading && conversations.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucune conversation client</p>
            <p className="text-xs text-gray-400 mt-1">Les clients peuvent démarrer une conversation depuis leur application.</p>
          </div>
        )}
        {conversations.map(conv => {
          let clientPart;
          try { clientPart = JSON.parse(conv.participants || "[]").find(p => p.type === "client"); } catch {}
          const client = clientPart?.id ? clientsMap[clientPart.id] : null;
          const hasGps = !!(client?.latitude && client?.longitude);
          return (
            <div key={conv.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Pill className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{clientPart?.name || "Client"}</p>
                    {conv.last_message && <p className="text-[10px] text-gray-400 truncate max-w-[180px]">{conv.last_message}</p>}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleCreerLivraison(conv)}
                  disabled={creating === conv.id || !hasGps}
                  className="bg-gray-800 hover:bg-gray-900 text-xs h-9"
                >
                  {creating === conv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                  Livraison
                </Button>
              </div>
              {!hasGps && client && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1"><MapPin className="w-3 h-3" /> Client sans GPS — demandez-lui d'ouvrir l'app</p>
              )}
              {!client && clientPart?.id && (
                <p className="text-[10px] text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Chargement client...</p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Lien vers messages ── */}
      <button
        onClick={() => onNavigate?.("messages")}
        className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <MessageCircle className="w-4 h-4" /> Voir toutes les conversations
      </button>
    </div>
  );
}