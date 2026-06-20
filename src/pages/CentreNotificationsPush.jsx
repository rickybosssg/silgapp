import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Megaphone, Send, CheckCircle2, XCircle,
  Clock, Loader2, Users, Truck, Globe, MapPin, History, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CountrySelector from "@/components/international/CountrySelector";

const CIBLES = [
  { id: "tous_clients", label: "Tous les clients", icon: Users, desc: "Clients SILGAPP uniquement" },
  { id: "tous_livreurs", label: "Tous les livreurs", icon: Truck, desc: "Livreurs externes uniquement" },
  { id: "tous_utilisateurs", label: "Tous les utilisateurs", icon: Globe, desc: "Clients + Livreurs" },
];

export default function CentreNotificationsPush() {
  const queryClient = useQueryClient();
  const [titre, setTitre] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [pays, setPays] = useState("");
  const [cible, setCible] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Historique des campagnes
  const { data: campagnes = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["push-campagnes"],
    queryFn: () => base44.entities.PushCampagne.list("-created_date", 50),
    initialData: [],
    refetchInterval: 5000,
  });

  // Mutation d'envoi
  const handleSend = async () => {
    if (!titre.trim() || !message.trim() || !cible) {
      toast.error("Remplissez tous les champs obligatoires");
      return;
    }

    setIsSending(true);
    try {
      const res = await base44.functions.invoke("sendPushCampagne", {
        titre: titre.trim(),
        message: message.trim(),
        image_url: imageUrl.trim() || undefined,
        pays: pays || "ALL",
        cible,
      });

      const data = res?.data;

      if (data?.success) {
        toast.success(`${data.succes} notifications envoyées avec succès !`, {
          description: `${data.echecs} échecs sur ${data.total_tokens} tokens`,
        });
        setTitre("");
        setMessage("");
        setImageUrl("");
        queryClient.invalidateQueries({ queryKey: ["push-campagnes"] });
      } else {
        toast.error(data?.error || "Erreur lors de l'envoi");
      }
    } catch (err) {
      toast.error("Erreur: " + (err.message || "inconnue"));
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette campagne de l'historique ?")) return;
    try {
      await base44.entities.PushCampagne.delete(id);
      queryClient.invalidateQueries({ queryKey: ["push-campagnes"] });
      toast.success("Campagne supprimée");
    } catch (err) {
      toast.error("Erreur suppression: " + err.message);
    }
  };

  // Stats rapides
  const today = new Date().toDateString();
  const campagnesToday = campagnes.filter(c =>
    c.date_envoi && new Date(c.date_envoi).toDateString() === today
  );
  const totalEnvoyesAujourdhui = campagnesToday.reduce((s, c) => s + (c.nb_succes || 0), 0);

  return (
    <div className="px-4 py-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-700 p-5 sm:p-6 shadow-xl shadow-purple-200">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
              <Megaphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Centre de Notifications
              </h1>
              <p className="text-white/70 text-xs mt-0.5">
                Envoyez des notifications push ciblées à vos utilisateurs
              </p>
            </div>
          </div>
          {totalEnvoyesAujourdhui > 0 && (
            <Badge className="bg-white/20 text-white border-white/30 font-bold px-3 py-1.5 text-sm">
              {totalEnvoyesAujourdhui.toLocaleString()} envois aujourd'hui
            </Badge>
          )}
        </div>
      </div>

      {/* ── FORMULAIRE D'ENVOI ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
            <Send className="w-4 h-4 text-purple-600" />
          </div>
          <p className="font-bold text-sm text-gray-900">Nouvelle campagne push</p>
        </div>

        {/* Titre */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
            Titre de la notification
          </label>
          <Input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Ex: Nouvelle fonctionnalité disponible !"
            maxLength={100}
            className="bg-gray-50 rounded-xl text-sm border-gray-200"
          />
          <p className="text-[10px] text-gray-400 mt-1">{titre.length}/100</p>
        </div>

        {/* Message */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
            Message
          </label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex: Découvrez les nouvelles options de livraison express..."
            maxLength={250}
            rows={3}
            className="bg-gray-50 rounded-xl text-sm border-gray-200 resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-1">{message.length}/250</p>
        </div>

        {/* Image optionnelle */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
            Image (URL, facultatif)
          </label>
          <div className="flex gap-2">
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="flex-1 bg-gray-50 rounded-xl text-sm border-gray-200"
            />
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Preview"
                className="w-10 h-10 rounded-xl object-cover border border-gray-200 flex-shrink-0"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
          </div>
        </div>

        {/* Filtres : Pays + Cible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Pays */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
              <MapPin className="w-3 h-3 inline mr-1" />
              Pays ciblé
            </label>
            <CountrySelector value={pays} onChange={setPays} />
          </div>

          {/* Cible */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
              Destinataires
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {CIBLES.map((item) => {
                const Icon = item.icon;
                const isActive = cible === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCible(item.id)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all text-center",
                      isActive
                        ? "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", isActive ? "text-purple-600" : "text-gray-400")} />
                    <span className="text-[10px] font-bold leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Résumé du ciblage */}
        {cible && (
          <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2">
            <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <p className="text-xs text-purple-700 font-medium">
              Envoi à <strong>{CIBLES.find(c => c.id === cible)?.label}</strong>
              {pays ? <> au <strong>{pays}</strong></> : " dans tous les pays"}
            </p>
          </div>
        )}

        {/* Bouton Envoyer */}
        <Button
          onClick={handleSend}
          disabled={isSending || !titre.trim() || !message.trim() || !cible}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-black text-base shadow-lg shadow-purple-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
        >
          {isSending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Envoyer la campagne push
            </>
          )}
        </Button>

        {isSending && (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            <span>L'envoi est en cours en arrière-plan. Vous pouvez naviguer dans l'admin sans attendre.</span>
          </div>
        )}
      </div>

      {/* ── HISTORIQUE DES CAMPAGNES ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
            <History className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900">Historique des campagnes</p>
            <p className="text-xs text-gray-500">{campagnes.length} campagne(s) au total</p>
          </div>
        </div>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : campagnes.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Aucune campagne pour le moment</p>
            <p className="text-xs mt-1">Lancez votre première notification ci-dessus</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {campagnes.map((camp) => {
              const statusConfig = {
                en_cours: { icon: Loader2, cls: "bg-blue-100 text-blue-700", label: "En cours" },
                termine: { icon: CheckCircle2, cls: "bg-green-100 text-green-700", label: "Terminé" },
                echoue: { icon: XCircle, cls: "bg-red-100 text-red-700", label: "Échoué" },
              }[camp.statut] || { icon: Clock, cls: "bg-gray-100 text-gray-600", label: camp.statut };

              const StatusIcon = statusConfig.icon;

              return (
                <div key={camp.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3.5 hover:border-gray-200 transition-colors">
                  {/* Ligne principale */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-sm text-gray-900 truncate">{camp.titre}</p>
                        <Badge className={cn("text-[10px] font-semibold px-2 flex-shrink-0", statusConfig.cls)}>
                          <StatusIcon className={cn("w-3 h-3 mr-1", camp.statut === "en_cours" && "animate-spin")} />
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{camp.message}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(camp.id)}
                      className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Métadonnées */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t border-gray-200">
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {camp.pays_cible === "ALL" ? "Tous les pays" : camp.pays_cible}
                    </span>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      {camp.type_destinataires === "tous_clients" && <><Users className="w-3 h-3" /> Clients</>}
                      {camp.type_destinataires === "tous_livreurs" && <><Truck className="w-3 h-3" /> Livreurs</>}
                      {camp.type_destinataires === "tous_utilisateurs" && <><Globe className="w-3 h-3" /> Tous</>}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {camp.admin_nom && ` ${camp.admin_nom}`}
                    </span>
                    {camp.date_envoi && (
                      <span className="text-[10px] text-gray-400">
                        {format(new Date(camp.date_envoi), "dd/MM/yyyy HH:mm", { locale: fr })}
                      </span>
                    )}
                  </div>

                  {/* Stats envoi */}
                  {(camp.nb_succes > 0 || camp.nb_echecs > 0) && (
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1 text-green-700 text-[10px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        {camp.nb_succes} succès
                      </div>
                      {camp.nb_echecs > 0 && (
                        <div className="flex items-center gap-1 text-red-600 text-[10px] font-semibold">
                          <XCircle className="w-3 h-3" />
                          {camp.nb_echecs} échecs
                        </div>
                      )}
                      <div className="flex-1" />
                      <span className="text-[10px] text-gray-400">
                        {camp.nb_envoyes} tokens
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
