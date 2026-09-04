import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Check, X, Clock, ChevronRight, Loader2, Ban, RotateCw, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { normalizePhoneForWhatsapp } from "@/lib/courseContact";

const PIPELINE_STATUSES = [
  { key: "a_contacter", label: "À contacter", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "contacte", label: "Contacté", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { key: "interesse", label: "Intéressé", color: "bg-green-50 text-green-700 border-green-200" },
  { key: "a_relancer", label: "À relancer", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "app_installee", label: "App installée", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { key: "converti", label: "Converti", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "pas_interesse", label: "Pas intéressé", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { key: "ne_plus_contacter", label: "Ne plus contacter", color: "bg-red-50 text-red-700 border-red-200" },
];

const MESSAGE_PARTICULIER = "Bonjour 👋\nVous avez déjà utilisé le service de livraison SILGAPP.\nVous pouvez maintenant faire directement vos demandes de livraison depuis l'application SILGAPP, sans passer par notre équipe.\nC'est simple, rapide et vous permet de suivre votre livraison.";

const MESSAGE_PRO = "Bonjour 👋\nVous avez déjà utilisé SILGAPP pour vos livraisons.\nAvec l'application SILGAPP, vous pouvez demander directement un livreur pour livrer vos clients.\nVous continuez à vendre, SILGAPP s'occupe de la livraison.";

export default function CrmProspectionPanel({ prospections, clients, onRefresh }) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showQueue, setShowQueue] = useState(false);

  // File de prospection = prospects sélectionnés avec pipeline_status = a_contacter
  const queue = useMemo(() => {
    return prospections.filter(p => selectedIds.has(p.client_id));
  }, [prospections, selectedIds]);

  const currentProspect = queue[currentIndex];

  const clientMap = useMemo(() => {
    const m = new Map();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const toggleSelect = (clientId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const startCampaign = () => {
    if (selectedIds.size === 0) {
      toast.error("Sélectionnez au moins 1 prospect");
      return;
    }
    setCurrentIndex(0);
    setShowQueue(true);
  };

  const buildWhatsAppLink = (client, prospect) => {
    const phone = normalizePhoneForWhatsapp(client?.telephone, client?.country_code);
    if (!phone) return null;
    const msg = prospect?.crm_type === "commerce" || prospect?.crm_type === "restaurant" || prospect?.crm_type === "entreprise"
      ? MESSAGE_PRO : MESSAGE_PARTICULIER;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const updatePipeline = async (clientId, status, canal = "whatsapp") => {
    setUpdating(true);
    try {
      const existing = prospections.find(p => p.client_id === clientId);
      const now = new Date().toISOString();
      const relanceDate = status === "a_relancer" ? new Date(Date.now() + 7 * 86400000).toISOString() : null;

      if (existing) {
        await base44.entities.CrmProspection.update(existing.id, {
          pipeline_status: status,
          dernier_contact_at: now,
          nb_contacts: (existing.nb_contacts || 0) + 1,
          canal_utilise: canal,
          prochaine_relance_at: relanceDate,
        });
      } else {
        const client = clientMap.get(clientId);
        await base44.entities.CrmProspection.create({
          client_id: clientId,
          client_nom: client ? `${client.prenom || ""} ${client.nom || ""}`.trim() : "",
          client_telephone: client?.telephone || "",
          client_phone_normalized: client?.telephone_normalized || "",
          country_code: client?.country_code || "",
          pipeline_status: status,
          dernier_contact_at: now,
          nb_contacts: 1,
          canal_utilise: canal,
          prochaine_relance_at: relanceDate,
          origine: "crm",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["crm-prospections"] });
      if (onRefresh) onRefresh();

      if (status === "ne_plus_contacter") {
        toast.success("Exclu des futures campagnes");
      } else {
        toast.success(`Statut: ${PIPELINE_STATUSES.find(s => s.key === status)?.label}`);
      }

      // Avancer au prospect suivant
      if (showQueue && currentIndex < queue.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    } catch (err) {
      toast.error("Erreur mise à jour");
    } finally {
      setUpdating(false);
    }
  };

  // ── Mode file de prospection ──
  if (showQueue && queue.length > 0) {
    const client = currentProspect ? clientMap.get(currentProspect.client_id) : null;
    const waLink = client ? buildWhatsAppLink(client, currentProspect) : null;
    const progress = `${currentIndex + 1}/${queue.length}`;

    return (
      <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-4 flex items-center justify-between text-white">
            <div>
              <p className="text-sm font-black">File de prospection</p>
              <p className="text-[10px] opacity-80">{progress} — {queue[currentIndex]?.client_nom || "Prospect"}</p>
            </div>
            <button onClick={() => setShowQueue(false)} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Contenu */}
          {client ? (
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="font-bold text-slate-800">{client.prenom} {client.nom}</p>
                <p className="text-sm text-slate-500">{client.telephone}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {client.nb_courses_total || 0} course(s) · {client.quartier || client.ville || "—"}
                </p>
              </div>

              {/* Bouton WhatsApp — ouvre WhatsApp, n'envoie PAS automatiquement */}
              {waLink ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-14 rounded-2xl bg-[#25D366] text-white font-black text-base shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <MessageCircle className="w-6 h-6" />
                  Ouvrir WhatsApp
                </a>
              ) : (
                <div className="w-full h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-sm">
                  Pas de téléphone valide
                </div>
              )}

              <p className="text-[10px] text-slate-400 text-center">
                Appuyez sur "Envoyer" dans WhatsApp après que la conversation s'ouvre.
              </p>

              {/* Actions après retour */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updatePipeline(currentProspect.client_id, "contacte")}
                  disabled={updating}
                  className="h-11 rounded-xl bg-green-50 border border-green-200 text-green-700 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Envoyé
                </button>
                <button
                  onClick={() => updatePipeline(currentProspect.client_id, "a_relancer")}
                  disabled={updating}
                  className="h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <RotateCw className="w-4 h-4" /> À relancer
                </button>
                <button
                  onClick={() => updatePipeline(currentProspect.client_id, "interesse")}
                  disabled={updating}
                  className="h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <Smartphone className="w-4 h-4" /> Intéressé
                </button>
                <button
                  onClick={() => updatePipeline(currentProspect.client_id, "pas_interesse")}
                  disabled={updating}
                  className="h-11 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <X className="w-4 h-4" /> Pas intéressé
                </button>
              </div>

              <button
                onClick={() => updatePipeline(currentProspect.client_id, "ne_plus_contacter")}
                disabled={updating}
                className="w-full h-10 rounded-xl bg-red-50 border border-red-200 text-red-600 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <Ban className="w-4 h-4" /> Ne plus contacter
              </button>

              {/* Navigation file */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="text-xs font-bold text-slate-500 disabled:opacity-30"
                >
                  ← Précédent
                </button>
                <span className="text-xs text-slate-400">{progress}</span>
                <button
                  onClick={() => setCurrentIndex(Math.min(queue.length - 1, currentIndex + 1))}
                  disabled={currentIndex >= queue.length - 1}
                  className="text-xs font-bold text-slate-500 disabled:opacity-30"
                >
                  Suivant →
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">Prospect introuvable</div>
          )}
        </div>
      </div>
    );
  }

  // ── Mode sélection ──
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-700">
          File de prospection WhatsApp
        </p>
        {selectedIds.size > 0 && (
          <button
            onClick={startCampaign}
            className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold flex items-center gap-1 active:scale-95"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Démarrer ({selectedIds.size})
          </button>
        )}
      </div>

      <p className="text-[10px] text-slate-400">
        Sélectionnez les prospects à contacter. Aucun message ne sera envoyé automatiquement —
        l'admin appuie sur "Envoyer" dans WhatsApp pour chaque prospect.
      </p>

      {/* Liste des prospects sélectionnables */}
      <div className="max-h-60 overflow-y-auto space-y-1">
        {prospections.filter(p => p.pipeline_status === "a_contacter" || !p.pipeline_status).slice(0, 50).map(p => {
          const client = clientMap.get(p.client_id);
          if (!client) return null;
          const isSelected = selectedIds.has(p.client_id);
          return (
            <button
              key={p.client_id}
              onClick={() => toggleSelect(p.client_id)}
              className={cn(
                "w-full flex items-center gap-3 p-2 rounded-xl border transition-all text-left",
                isSelected ? "border-green-300 bg-green-50" : "border-slate-100 hover:bg-slate-50"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0",
                isSelected ? "bg-green-500 border-green-500" : "border-slate-300"
              )}>
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{client.prenom} {client.nom}</p>
                <p className="text-[10px] text-slate-400">{client.telephone} · {client.nb_courses_total || 0} course(s)</p>
              </div>
              {p.priorite === 1 && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">🔥 P1</span>}
              {p.priorite === 2 && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">🟠 P2</span>}
            </button>
          );
        })}
      </div>

      {prospections.length === 0 && (
        <p className="text-center text-slate-400 text-xs py-4">Aucun prospect à contacter</p>
      )}
    </div>
  );
}