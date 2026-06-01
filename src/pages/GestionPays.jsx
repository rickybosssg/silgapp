import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Globe, Plus, Save, ToggleLeft, ToggleRight, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PAYS_SILGAPP } from "@/components/international/CountrySelector";

export default function GestionPays() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [initializing, setInitializing] = useState(false);

  const { data: pays = [], isLoading } = useQuery({
    queryKey: ["countries-all"],
    queryFn: () => base44.entities.Country.list("ordre"),
    initialData: [],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Country.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      queryClient.invalidateQueries({ queryKey: ["countries-actifs"] });
      setEditingId(null);
      toast.success("Pays mis à jour ✓");
    },
    onError: () => toast.error("Erreur de mise à jour"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, actif }) => base44.entities.Country.update(id, { actif }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      queryClient.invalidateQueries({ queryKey: ["countries-actifs"] });
      toast.success(vars.actif ? "Pays activé ✓" : "Pays désactivé");
    },
  });

  // Initialiser la liste depuis le fallback statique
  const handleInitialiser = async () => {
    setInitializing(true);
    try {
      for (const p of PAYS_SILGAPP) {
        const existe = pays.find(db => db.code === p.code);
        if (!existe) {
          await base44.entities.Country.create({
            ...p,
            actif: p.code === "BF", // Seul BF actif par défaut
            ordre: PAYS_SILGAPP.indexOf(p) + 1,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      toast.success("Pays initialisés ✓");
    } catch (e) {
      toast.error("Erreur : " + e.message);
    } finally {
      setInitializing(false);
    }
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      nom: p.nom,
      indicatif: p.indicatif,
      devise: p.devise || "FCFA",
      prix_par_km: p.prix_par_km || 100,
      prix_minimum: p.prix_minimum || 500,
      commission_pct: p.commission_pct || 30,
      ville_principale: p.ville_principale || "",
      rayon_km: p.rayon_km || 30,
    });
  };

  const handleSave = (id) => {
    updateMutation.mutate({ id, data: { ...editForm } });
  };

  const paysActifs = pays.filter(p => p.actif).length;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">

      {/* ── HERO HEADER ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-slate-900 p-5 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <button className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors">
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
            </Link>
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">🌍</div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Gestion des pays</h1>
              <p className="text-white/60 text-xs mt-0.5">{paysActifs} pays actifs · Activer suffit pour être opérationnel</p>
            </div>
          </div>
          {pays.length === 0 && (
            <Button
              size="sm"
              onClick={handleInitialiser}
              disabled={initializing}
              className="gap-1.5 bg-white text-slate-800 hover:bg-white/90"
            >
              {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Initialiser
            </Button>
          )}
        </div>
      </div>

      {/* ── ÉTAT VIDE ────────────────────────────────── */}
      {pays.length === 0 && !isLoading && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-3xl">🌍</div>
          <p className="font-bold text-foreground">Aucun pays configuré</p>
          <p className="text-xs text-muted-foreground mt-1">Cliquez sur "Initialiser" pour ajouter BF, CI, TG, BJ, SN...</p>
        </div>
      )}

      {/* ── LISTE DES PAYS ───────────────────────────── */}
      <div className="space-y-3">
        {pays.map(p => (
          <div
            key={p.id}
            className={`rounded-2xl border p-4 transition-all ${p.actif ? "border-green-100 bg-green-50/30" : "border-gray-100 bg-gray-50/40"}`}
          >
            {editingId === p.id ? (
              /* ── Formulaire d'édition ── */
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                  <span className="text-2xl">{p.emoji_flag}</span>
                  <div>
                    <p className="font-black text-foreground">{p.nom}</p>
                    <p className="text-xs text-muted-foreground">{p.code} · {p.indicatif}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Devise",          key: "devise",           icon: "💱" },
                    { label: "Prix / km",        key: "prix_par_km",      icon: "📏", type: "number" },
                    { label: "Prix minimum",     key: "prix_minimum",     icon: "💰", type: "number" },
                    { label: "Commission %",     key: "commission_pct",   icon: "📊", type: "number" },
                    { label: "Ville principale", key: "ville_principale", icon: "🏙️" },
                    { label: "Rayon (km)",       key: "rayon_km",         icon: "⭕", type: "number" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">{f.icon} {f.label}</label>
                      <input
                        type={f.type || "text"}
                        value={editForm[f.key] || ""}
                        onChange={e => setEditForm(prev => ({
                          ...prev,
                          [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value
                        }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditingId(null)}>Annuler</Button>
                  <Button size="sm" onClick={() => handleSave(p.id)} disabled={updateMutation.isPending} className="gap-1.5 rounded-xl">
                    {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Sauvegarder
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Vue normale ── */
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm ${p.actif ? "bg-green-100" : "bg-gray-100"}`}>
                  {p.emoji_flag || "🌍"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="font-black text-foreground">{p.nom}</span>
                    <span className="text-[10px] font-bold text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">{p.code}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{p.indicatif}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.actif ? "● Actif" : "○ Inactif"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { label: "Prix/km",     value: `${p.prix_par_km || 100} ${p.devise || "FCFA"}`,          bg: "bg-amber-50",   text: "text-amber-700" },
                      { label: "Minimum",     value: `${(p.prix_minimum || 500).toLocaleString()} ${p.devise || "FCFA"}`, bg: "bg-blue-50", text: "text-blue-700" },
                      { label: "Commission",  value: `${p.commission_pct || 30}%`,                              bg: "bg-purple-50",  text: "text-purple-700" },
                      { label: "Ville",       value: p.ville_principale || "—",                                 bg: "bg-gray-50",    text: "text-gray-600" },
                    ].map(m => (
                      <div key={m.label} className={`${m.bg} rounded-xl px-2 py-1.5`}>
                        <p className={`text-xs font-bold truncate ${m.text}`}>{m.value}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs rounded-xl border-gray-200 h-8"
                    onClick={() => handleEdit(p)}
                  >
                    <Pencil className="w-3 h-3" />
                    Modifier
                  </Button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: p.id, actif: !p.actif })}
                    disabled={toggleMutation.isPending}
                    title={p.actif ? "Désactiver" : "Activer"}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:opacity-80"
                  >
                    {p.actif
                      ? <><ToggleRight className="w-4 h-4 text-green-500" /><span className="text-green-600">Désactiver</span></>
                      : <><ToggleLeft className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Activer</span></>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── LÉGENDE ──────────────────────────────────── */}
      {pays.length > 0 && (
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
          <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5">💡 Comment ça marche</p>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• <strong>Activer un pays</strong> → il apparaît dans les sélecteurs livreurs/clients</li>
            <li>• <strong>Prix/km</strong> → utilisé automatiquement au calcul de la course</li>
            <li>• <strong>Commission %</strong> → part de Silga sur chaque course</li>
            <li>• Les livreurs/clients s'enregistrent avec leur pays → les stats se filtrent automatiquement</li>
          </ul>
        </div>
      )}
    </div>
  );
}