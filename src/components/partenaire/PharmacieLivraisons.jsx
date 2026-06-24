import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Truck, Package, MapPin, Phone, Pill, MessageCircle, QrCode, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const activeStatuses = ["nouvelle", "recherche_livreur", "livreur_en_route", "arrive_prise_en_charge", "colis_recupere", "en_livraison"];

export default function PharmacieLivraisons({ pharmacieId, pharmacieNom, onNavigate }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(null);
  const [clientsMap, setClientsMap] = useState({});

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations-pharmacie", pharmacieId],
    queryFn: async () => {
      const all = await base44.entities.Conversation.list("-last_message_date", 100);
      return (all || []).filter((conv) => {
        try {
          const parts = JSON.parse(conv.participants || "[]");
          return parts.some((p) => p.type === "partenaire" && p.id === pharmacieId);
        } catch {
          return false;
        }
      });
    },
    enabled: !!pharmacieId,
    refetchInterval: 5000,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-pharmacie", pharmacieId],
    queryFn: async () => {
      const pharmacie = await base44.entities.Pharmacie.get(pharmacieId);
      const all = await base44.entities.CourseExterne.filter({ country_code: pharmacie.pays_code }, "-created_date", 80);
      return (all || []).filter((course) => course.pharmacie_id === pharmacieId || course.expediteur_nom === pharmacieNom);
    },
    enabled: !!pharmacieId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    conversations.forEach((conv) => {
      try {
        const parts = JSON.parse(conv.participants || "[]");
        const clientPart = parts.find((p) => p.type === "client");
        if (clientPart?.id && !clientsMap[clientPart.id]) {
          base44.entities.ClientExterne.get(clientPart.id)
            .then((client) => setClientsMap((prev) => ({ ...prev, [clientPart.id]: client })))
            .catch(() => {});
        }
      } catch {}
    });
  }, [conversations, clientsMap]);

  const handleCreerLivraison = async (conv) => {
    let clientPart;
    try {
      const parts = JSON.parse(conv.participants || "[]");
      clientPart = parts.find((p) => p.type === "client");
    } catch {}
    if (!clientPart?.id) return;

    const client = clientsMap[clientPart.id];
    if (!client?.latitude || !client?.longitude) {
      alert("Le client n'a pas de position GPS. Demandez-lui d'ouvrir l'application SILGAPP.");
      return;
    }

    if (!confirm(`Creer une livraison vers ${clientPart.name || "ce client"} ?`)) return;

    setCreating(conv.id);
    try {
      const response = await base44.functions.invoke("creerLivraisonPharmacie", {
        pharmacie_id: pharmacieId,
        client_id: clientPart.id,
        conversation_id: conv.id,
      });
      if (response?.data?.success) {
        alert("Livraison creee. QR/PIN de recuperation disponibles. Recherche d'un livreur en cours.");
        queryClient.invalidateQueries({ queryKey: ["courses-pharmacie", pharmacieId] });
      } else {
        alert("Erreur: " + (response?.data?.error || "echec"));
      }
    } catch (error) {
      alert("Erreur: " + (error?.message || "echec"));
    } finally {
      setCreating(null);
    }
  };

  const activeCourses = courses.filter((course) => activeStatuses.includes(course.statut));

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-gray-900 text-base px-1">Livraisons pharmacie</h2>

      {activeCourses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase px-1">Courses en cours</p>
          {activeCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-500 uppercase px-1">Creer une livraison depuis une conversation</p>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!isLoading && conversations.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucune conversation client</p>
            <p className="text-xs text-gray-400 mt-1">Les clients peuvent demarrer une conversation depuis leur application.</p>
          </div>
        )}

        {conversations.map((conv) => {
          let clientPart;
          try {
            clientPart = JSON.parse(conv.participants || "[]").find((p) => p.type === "client");
          } catch {}
          const client = clientPart?.id ? clientsMap[clientPart.id] : null;
          const hasGps = !!(client?.latitude && client?.longitude);

          return (
            <div key={conv.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Pill className="w-4 h-4 text-blue-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{clientPart?.name || "Client"}</p>
                    {conv.last_message && <p className="text-[10px] text-gray-400 truncate max-w-[180px]">{conv.last_message}</p>}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleCreerLivraison(conv)}
                  disabled={creating === conv.id || !hasGps}
                  className="bg-blue-900 hover:bg-blue-950 text-xs h-9 flex-shrink-0"
                >
                  {creating === conv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                  Livraison
                </Button>
              </div>

              {!hasGps && client && (
                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Client sans GPS. Demandez-lui d'ouvrir l'application.
                </p>
              )}
              {!client && clientPart?.id && (
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Chargement client...
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onNavigate?.("messages")}
        className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <MessageCircle className="w-4 h-4" /> Voir toutes les conversations
      </button>
    </div>
  );
}

function CourseCard({ course }) {
  const statusLabel = {
    nouvelle: "Nouvelle",
    recherche_livreur: "Recherche livreur",
    livreur_en_route: "Livreur en route",
    arrive_prise_en_charge: "Livreur arrive",
    colis_recupere: "Colis recupere",
    en_livraison: "En livraison",
  }[course.statut] || course.statut;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400">#{(course.id || "").slice(-6)}</span>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-700">
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1">
          <Package className="w-3 h-3" /> {course.destinataire_nom || "Client"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Phone className="w-3 h-3" /> {course.destinataire_telephone || "-"}
        </span>
      </div>

      {course.livreur_nom && (
        <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 rounded-xl px-3 py-2">
          <Truck className="w-3 h-3" /> Livreur: {course.livreur_nom}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <CodeBlock
          title="Recuperation pharmacie"
          qr={course.pickup_qr_token}
          pin={course.pickup_code_4_digits}
        />
        <CodeBlock
          title="Livraison client"
          qr={course.delivery_qr_token}
          pin={course.delivery_code_4_digits}
        />
      </div>
    </div>
  );
}

function CodeBlock({ title, qr, pin }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-2.5 space-y-1">
      <p className="text-[10px] font-black uppercase text-gray-500">{title}</p>
      <p className="flex items-center gap-1.5 text-[11px] text-gray-600">
        <QrCode className="w-3 h-3" /> QR: <span className="font-mono font-bold truncate">{qr ? String(qr).slice(0, 10) + "..." : "-"}</span>
      </p>
      <p className="flex items-center gap-1.5 text-[11px] text-gray-600">
        <KeyRound className="w-3 h-3" /> PIN: <span className="font-mono font-black text-blue-900">{pin || "-"}</span>
      </p>
    </div>
  );
}
