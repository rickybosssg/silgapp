import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { 
  Bell, Plus, Trash2, Loader2, X, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAdminContext } from "@/hooks/useAdminContext.js";

const NIVEAU_CONFIG = {
  information: { emoji: "🟢", label: "Information", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500" },
  important:   { emoji: "🟠", label: "Important",   color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  urgent:      { emoji: "🔴", label: "Urgent",      color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
};

function NouvelleAlerteForm({ onClose, onCreated, countryCode }) {
  const [form, setForm] = useState({
    titre: "",
    message: "",
    niveau: "information",
    reseau: "tous",
    delai_rappel_minutes: 30,
    date_expiration: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titre.trim() || !form.message.trim()) {
      toast.error("Titre et message sont obligatoires");
      return;
    }
    setLoading(true);
    try {
      const user = await base44.auth.me();
      const data = {
        ...form,
        country_code: countryCode || "",
        actif: true,
        nb_lectures: 0,
        cree_par: user?.full_name || user?.email || "Admin",
        delai_rappel_minutes: Number(form.delai_rappel_minutes) || 30,
        date_expiration: form.date_expiration ? new Date(form.date_expiration).toISOString() : null,
      };
      await base44.entities.AlerteLivreur.create(data);
      toast.success("Alerte créée et envoyée aux livreurs ✓");
      onCreated?.();
      onClose?.();
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-white" />
            <p className="font-black text-white text-base">Nouvelle alerte</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Niveau */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 block">Niveau d'alerte</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(NIVEAU_CONFIG).map(([val, cfg]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setForm({ ...form, niveau: val })}
                  className={`py-3 rounded-2xl border-2 text-center transition-all ${
                    form.niveau === val
                      ? `border-current ${cfg.color} shadow-md`
                      : "border-gray-200 bg-white text-gray-500"
                  }`}
                >
                  <div className="text-xl mb-0.5">{cfg.emoji}</div>
                  <div className="text-[10px] font-bold uppercase">{cfg.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Réseau ciblé */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 block">Livreurs ciblés</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: "tous", label: "Tous", emoji: "👥" },
                { val: "interne", label: "Interne", emoji: "🏠" },
                { val: "externe", label: "Externe", emoji: "🌍" },
              ].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setForm({ ...form, reseau: opt.val })}
                  className={`py-2.5 rounded-xl border-2 text-center transition-all text-xs font-bold ${
                    form.reseau === opt.val
                      ? "border-slate-700 bg-slate-50 text-slate-800"
                      : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  <div>{opt.emoji}</div>
                  <div>{opt.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Titre */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 block">Titre <span className="text-red-500">*</span></label>
            <Input
              value={form.titre}
              onChange={e => setForm({ ...form, titre: e.target.value })}
              placeholder="Ex: Panne secteur Gounghin"
              className="rounded-xl border-2 h-11"
              maxLength={80}
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 block">Message <span className="text-red-500">*</span></label>
            <Textarea
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              placeholder="Détails de l'alerte pour les livreurs..."
              rows={4}
              className="rounded-xl border-2 resize-none"
            />
          </div>

          {/* Délai rappel */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 block">
              Rappel si non lu (minutes) — {form.niveau === "urgent" ? "inutile pour les urgentes" : ""}
            </label>
            <Input
              type="number"
              min={5}
              max={1440}
              value={form.delai_rappel_minutes}
              onChange={e => setForm({ ...form, delai_rappel_minutes: e.target.value })}
              className="rounded-xl border-2 h-11"
              disabled={form.niveau === "urgent"}
            />
          </div>

          {/* Date expiration */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 block">Date d'expiration (optionnel)</label>
            <Input
              type="datetime-local"
              value={form.date_expiration}
              onChange={e => setForm({ ...form, date_expiration: e.target.value })}
              className="rounded-xl border-2 h-11"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 font-bold"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
            Envoyer l'alerte
          </Button>
        </form>
      </div>
    </div>
  );
}

function AlerteStatsRow({ alerte, totalLivreurs, onArchiver }) {
  const [expanded, setExpanded] = useState(false);

  const { data: lectures = [] } = useQuery({
    queryKey: ["lectures-alerte", alerte.id],
    queryFn: () => base44.entities.AlerteLecture.filter({ alerte_id: alerte.id }, "-lue_at", 500),
    refetchInterval: 30000,
  });

  const cfg = NIVEAU_CONFIG[alerte.niveau] || NIVEAU_CONFIG.information;
  const nbLus = lectures.length;
  const nbTotal = totalLivreurs || 0;
  const nbNonLus = Math.max(0, nbTotal - nbLus);
  const tauxLecture = nbTotal > 0 ? Math.round((nbLus / nbTotal) * 100) : 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} mt-1.5 flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>
                {cfg.emoji} {cfg.label}
              </span>
              {!alerte.actif && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                  Archivée
                </span>
              )}
              {alerte.reseau !== "tous" && (
                <span className="text-[10px] font-semibold text-gray-400">{alerte.reseau === "interne" ? "🏠 Interne" : "🌍 Externe"}</span>
              )}
            </div>
            <p className="font-bold text-gray-900 mt-1 text-sm leading-snug">{alerte.titre}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alerte.message}</p>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 flex-shrink-0 mt-1">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Stats rapides */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="text-center bg-green-50 rounded-xl py-2">
            <p className="text-lg font-black text-green-700">{nbLus}</p>
            <p className="text-[10px] text-green-600 font-semibold">Ont vu</p>
          </div>
          <div className="text-center bg-amber-50 rounded-xl py-2">
            <p className="text-lg font-black text-amber-700">{nbNonLus}</p>
            <p className="text-[10px] text-amber-600 font-semibold">N'ont pas vu</p>
          </div>
          <div className="text-center bg-blue-50 rounded-xl py-2">
            <p className="text-lg font-black text-blue-700">{tauxLecture}%</p>
            <p className="text-[10px] text-blue-600 font-semibold">Taux lecture</p>
          </div>
        </div>

        {/* Barre de progression */}
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-500"
            style={{ width: `${tauxLecture}%` }}
          />
        </div>
      </div>

      {/* Détail expandable */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
          <p className="text-xs font-bold text-gray-600">Livreurs ayant confirmé :</p>
          {lectures.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Aucune lecture enregistrée</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {lectures.map(l => (
                <div key={l.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                  <span className="font-semibold text-gray-700">{l.livreur_nom || l.livreur_id?.slice(-6)}</span>
                  <span className="text-gray-400">{new Date(l.lue_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
          {alerte.actif && (
            <button
              onClick={() => onArchiver(alerte)}
              className="mt-2 text-xs text-red-600 font-semibold flex items-center gap-1 hover:text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Archiver cette alerte
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AlertesLivreursPanel() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filtreActif, setFiltreActif] = useState(true);
  const { isPays, countryCode: adminCountryCode, selectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : (selectedCountry || "");
  const alertesFilter = {
    ...(filtreActif ? { actif: true } : {}),
    ...(effectiveCountry ? { country_code: effectiveCountry } : {}),
  };
  const livreursFilter = {
    actif: true,
    ...(effectiveCountry ? { country_code: effectiveCountry } : {}),
  };

  const { data: alertes = [], isLoading } = useQuery({
    queryKey: ["alertes-livreurs-admin", filtreActif, effectiveCountry],
    queryFn: () => base44.entities.AlerteLivreur.filter(
      alertesFilter,
      "-created_date",
      100
    ),
    refetchInterval: 30000,
  });

  const { data: livreurs = [] } = useQuery({
    queryKey: ["livreurs-actifs-alertes", effectiveCountry],
    queryFn: () => base44.entities.Livreur.filter(livreursFilter, "-created_date", 500),
  });

  const archiverMutation = useMutation({
    mutationFn: (alerte) => base44.entities.AlerteLivreur.update(alerte.id, { actif: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertes-livreurs-admin"] });
      toast.success("Alerte archivée");
    },
  });

  const totalLivreurs = livreurs.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h3 className="font-black text-gray-900">Alertes livreurs</h3>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
            {alertes.filter(a => a.actif).length} actives
          </span>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          size="sm"
          className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl h-9 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Nouvelle alerte
        </Button>
      </div>

      {/* Filtre */}
      <div className="flex gap-2">
        <button
          onClick={() => setFiltreActif(true)}
          className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${filtreActif ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500"}`}
        >
          Actives
        </button>
        <button
          onClick={() => setFiltreActif(false)}
          className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${!filtreActif ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500"}`}
        >
          Toutes
        </button>
      </div>

      {/* Liste alertes */}
      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        </div>
      ) : alertes.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400 font-semibold">Aucune alerte active</p>
          <p className="text-xs text-gray-300 mt-1">Créez une alerte pour contacter vos livreurs</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alertes.map(alerte => (
            <AlerteStatsRow
              key={alerte.id}
              alerte={alerte}
              totalLivreurs={totalLivreurs}
              onArchiver={() => archiverMutation.mutate(alerte)}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <NouvelleAlerteForm
          onClose={() => setShowForm(false)}
          countryCode={effectiveCountry}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["alertes-livreurs-admin"] });
          }}
        />
      )}
    </div>
  );
}
