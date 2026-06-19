import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Globe, Plus, Save, ToggleLeft, ToggleRight, Loader2, MapPin, Percent, DollarSign, Edit3 } from "lucide-react";
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
    mutationFn: async ({ id, data, oldCountry }) => {
      await base44.entities.Country.update(id, data);

      const oldSeuil = Number(oldCountry?.seuil_encours_max || 0);
      const newSeuil = Number(data?.seuil_encours_max || 0);
      if (oldCountry?.code && newSeuil > 0 && oldSeuil !== newSeuil) {
        const user = await base44.auth.me().catch(() => null);
        await base44.entities.HistoriqueEncours.create({
          type_action: "modification_seuil",
          livreur_id: `country:${oldCountry.code}`,
          livreur_nom: `Seuil pays ${oldCountry.nom || oldCountry.code}`,
          livreur_telephone: "",
          pays_code: oldCountry.code,
          encours_avant: oldSeuil,
          encours_apres: newSeuil,
          seuil_applicable: newSeuil,
          pourcentage_atteint: 0,
          action_par: user?.email || "admin",
          commentaire: `Modification du seuil encours ${oldSeuil || "non configure"} -> ${newSeuil}`,
          date_action: new Date().toISOString(),
        });
      }
    },
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

  const handleInitialiser = async () => {
    setInitializing(true);
    try {
      for (const p of PAYS_SILGAPP) {
        const existe = pays.find(db => db.code === p.code);
        if (!existe) {
          await base44.entities.Country.create({
            ...p,
            actif: p.code === "BF",
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
      commission_pct: p.commission_pct ?? "",
      seuil_encours_max: p.seuil_encours_max ?? 5000,
      ville_principale: p.ville_principale || "",
      rayon_km: p.rayon_km || 30,
    });
  };

  const handleSave = (p) => updateMutation.mutate({ id: p.id, data: { ...editForm }, oldCountry: p });

  const actifCount = pays.filter(p => p.actif).length;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">

      {/* ── HERO HEADER ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 p-5 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 border border-white/30">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl">🌍</div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Gestion des pays SILGAPP</h1>
              <p className="text-white/60 text-xs mt-0.5">
                {actifCount} pays actif{actifCount > 1 ? "s" : ""} · Activer un pays suffit pour le rendre opérationnel
              </p>
            </div>
          </div>
          {pays.length === 0 && (
            <Button
              size="sm"
              onClick={handleInitialiser}
              disabled={initializing}
              className="gap-1.5 bg-white text-blue-700 hover:bg-white/90 font-bold"
            >
              {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Initialiser
            </Button>
          )}
        </div>
      </div>

      {/* ── EMPTY STATE ──────────────────────────────── */}
      {pays.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Globe className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-semibold text-foreground">Aucun pays configuré</p>
          <p className="text-xs text-muted-foreground mt-1">Cliquez sur "Initialiser" pour ajouter BF, CI, TG, BJ, SN…</p>
        </div>
      )}

      {/* ── LISTE PAYS ───────────────────────────────── */}
      <div className="space-y-3">
        {pays.map(p => (
          <div
            key={p.id}
            className={`rounded-2xl border p-4 transition-all ${p.actif ? "border-green-100 bg-green-50/30" : "border-gray-100 bg-white"}`}
          >
            {editingId === p.id ? (
              /* ── FORMULAIRE ÉDITION ── */
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-2xl">{p.emoji_flag}</span>
                  <div>
                    <p className="font-black text-foreground">{p.nom}</p>
                    <p className="text-xs text-muted-foreground">{p.code} · {p.indicatif}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Devise",          key: "devise" },
                    { label: "Prix / km",       key: "prix_par_km",    type: "number" },
                    { label: "Prix minimum",    key: "prix_minimum",   type: "number" },
                    { label: "Commission %",       key: "commission_pct",    type: "number" },
                    { label: "Seuil encours (F)", key: "seuil_encours_max", type: "number" },
                    { label: "Ville principale",  key: "ville_principale" },
                    { label: "Rayon km",        key: "rayon_km",       type: "number" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">{f.label}</label>
                      <input
                        type={f.type || "text"}
                        value={editForm[f.key] || ""}
                        onChange={e => setEditForm(prev => ({
                          ...prev,
                          [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value
                        }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditingId(null)}>Annuler</Button>
                  <Button size="sm" onClick={() => handleSave(p)} disabled={updateMutation.isPending} className="gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600">
                    <Save className="w-3.5 h-3.5" />
                    Sauvegarder
                  </Button>
                </div>
              </div>
            ) : (
              /* ── VUE NORMALE ── */
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${p.actif ? "bg-green-100" : "bg-gray-100"}`}>
                  {p.emoji_flag || "🌍"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-foreground">{p.nom}</span>
                    <span className="text-[10px] font-bold text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">{p.indicatif}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.actif ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.actif ? "● Actif" : "○ Inactif"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 rounded-full px-2 py-0.5 font-medium">
                      <DollarSign className="w-2.5 h-2.5" />{p.prix_par_km || 100} {p.devise || "FCFA"}/km
                    </span>
                    <span className="flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-medium">
                      Min : {(p.prix_minimum || 500).toLocaleString()} {p.devise || "FCFA"}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] bg-violet-50 text-violet-700 rounded-full px-2 py-0.5 font-medium">
                      <Percent className="w-2.5 h-2.5" />{p.commission_pct != null ? `${p.commission_pct}% commission` : "Commission non configurée"}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] bg-red-50 text-red-600 rounded-full px-2 py-0.5 font-medium">
                      🔒 Seuil encours : {(p.seuil_encours_max || 5000).toLocaleString()} {p.devise || "FCFA"}
                    </span>
                    {p.ville_principale && (
                      <span className="flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">
                        <MapPin className="w-2.5 h-2.5" />{p.ville_principale}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 gap-1.5 rounded-xl border-gray-200"
                    onClick={() => handleEdit(p)}
                  >
                    <Edit3 className="w-3 h-3" />
                    Modifier
                  </Button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: p.id, actif: !p.actif })}
                    disabled={toggleMutation.isPending}
                    title={p.actif ? "Désactiver" : "Activer"}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all hover:opacity-80"
                  >
                    {p.actif
                      ? <><ToggleRight className="w-4 h-4 text-green-500" /><span className="text-green-600 hidden sm:inline">ON</span></>
                      : <><ToggleLeft className="w-4 h-4 text-gray-400" /><span className="text-gray-500 hidden sm:inline">OFF</span></>
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
          <ul className="text-xs text-blue-700 space-y-1.5">
            <li>• <strong>Activer un pays</strong> → il apparaît dans les sélecteurs livreurs/clients</li>
            <li>• <strong>Prix/km</strong> → utilisé automatiquement au calcul de la course</li>
            <li>• <strong>Commission %</strong> → part de Silga sur chaque course</li>
            <li>• <strong>Seuil encours</strong> → plafond avant blocage automatique du livreur</li>
            <li>• Les livreurs/clients s'enregistrent avec leur pays → les stats se filtrent automatiquement</li>
          </ul>
        </div>
      )}
    </div>
  );
}
