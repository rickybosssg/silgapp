import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Globe, Plus, Save, ToggleLeft, ToggleRight, Loader2, MapPin, Percent, DollarSign, Edit3, Store, Utensils, Pill } from "lucide-react";
import { toast } from "sonner";
import { invalidateCountryCache } from "@/lib/countryService";

export default function GestionPays() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCountry, setNewCountry] = useState({
    code: "", nom: "", indicatif: "", devise: "FCFA", devise_symbole: "FCFA",
    prix_par_km: 100, prix_minimum: 500, commission_pct: 30,
    seuil_encours_max: 5000, ville_principale: "", rayon_km: 30, emoji_flag: "",
  });
  const [editingCommissionId, setEditingCommissionId] = useState(null);
  const [commissionForm, setCommissionForm] = useState({});

  const { data: pays = [], isLoading } = useQuery({
    queryKey: ["countries-all"],
    queryFn: () => base44.entities.Country.list("ordre"),
    initialData: [],
  });

  const { data: commissionConfigs = [] } = useQuery({
    queryKey: ["commission-configs-all"],
    queryFn: () => base44.entities.CommissionConfig.list(),
    initialData: [],
  });

  const getCommissionConfig = (countryCode) =>
    commissionConfigs.find(c => c.pays_code === countryCode);

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
      invalidateCountryCache();
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      queryClient.invalidateQueries({ queryKey: ["countries-actifs"] });
      setEditingId(null);
      toast.success("Pays mis à jour ");
    },
    onError: () => toast.error("Erreur de mise à jour"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, actif }) => base44.entities.Country.update(id, { actif }),
    onSuccess: (_, vars) => {
      invalidateCountryCache();
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      queryClient.invalidateQueries({ queryKey: ["countries-actifs"] });
      toast.success(vars.actif ? "Pays activé " : "Pays désactivé");
    },
  });

  const createCountryMutation = useMutation({
    mutationFn: async (data) => {
      const code = String(data.code || "").toUpperCase().trim();
      if (!code || code.length !== 2) throw new Error("Code pays invalide (2 lettres)");
      if (!data.nom?.trim()) throw new Error("Nom du pays obligatoire");
      if (!data.indicatif?.trim()) throw new Error("Indicatif obligatoire");

      const existing = await base44.entities.Country.filter({ code });
      if (existing?.length > 0) throw new Error(`Le pays ${code} existe déjà`);

      const maxOrdre = Math.max(0, ...(pays || []).map(p => p.ordre || 0));
      const created = await base44.entities.Country.create({
        ...data,
        code,
        actif: true,
        ordre: maxOrdre + 1,
      });

      // Création automatique de la CommissionConfig
      await base44.entities.CommissionConfig.create({
        pays_code: code,
        commission_boutique_defaut: 10,
        commission_restaurant_defaut: 10,
        commission_pharmacie_defaut: 10,
      });

      return created;
    },
    onSuccess: () => {
      invalidateCountryCache();
      queryClient.invalidateQueries({ queryKey: ["countries-all"] });
      queryClient.invalidateQueries({ queryKey: ["countries-actifs"] });
      queryClient.invalidateQueries({ queryKey: ["commission-configs-all"] });
      setShowAddForm(false);
      setNewCountry({
        code: "", nom: "", indicatif: "", devise: "FCFA", devise_symbole: "FCFA",
        prix_par_km: 100, prix_minimum: 500, commission_pct: 30,
        seuil_encours_max: 5000, ville_principale: "", rayon_km: 30, emoji_flag: "",
      });
      toast.success("Pays créé avec sa configuration de commissions ");
    },
    onError: (err) => toast.error(err?.message || "Erreur lors de la création"),
  });

  const updateCommissionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CommissionConfig.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-configs-all"] });
      setEditingCommissionId(null);
      toast.success("Commissions mises à jour ");
    },
    onError: () => toast.error("Erreur de mise à jour des commissions"),
  });

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

  const handleEditCommission = (config) => {
    setEditingCommissionId(config.id);
    setCommissionForm({
      commission_boutique_defaut: config.commission_boutique_defaut ?? 10,
      commission_restaurant_defaut: config.commission_restaurant_defaut ?? 10,
      commission_pharmacie_defaut: config.commission_pharmacie_defaut ?? 10,
    });
  };

  const handleSaveCommission = (config) =>
    updateCommissionMutation.mutate({ id: config.id, data: { ...commissionForm } });

  const handleAddCountry = () => {
    createCountryMutation.mutate({ ...newCountry });
  };

  const actifCount = pays.filter(p => p.actif).length;

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300";

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
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl"></div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Gestion des pays SILGAPP</h1>
              <p className="text-white/60 text-xs mt-0.5">
                {actifCount} pays actif{actifCount > 1 ? "s" : ""} · Ajoutez un pays sans modifier le code
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-1.5 bg-white text-blue-700 hover:bg-white/90 font-bold"
          >
            <Plus className="w-4 h-4" />
            Ajouter un pays
          </Button>
        </div>
      </div>

      {/* ── FORMULAIRE AJOUT PAYS ────────────────────── */}
      {showAddForm && (
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/30 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            <h2 className="font-black text-blue-900">Nouveau pays</h2>
          </div>
          <p className="text-xs text-blue-700">
            Le pays sera immédiatement opérationnel. Une configuration de commissions (boutique/restaurant/pharmacie) sera créée automatiquement à 10%.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Code (2 lettres)</label>
              <input className={inputClass} maxLength={2} placeholder="NG" value={newCountry.code}
                onChange={e => setNewCountry(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Nom</label>
              <input className={inputClass} placeholder="Nigeria" value={newCountry.nom}
                onChange={e => setNewCountry(prev => ({ ...prev, nom: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Indicatif</label>
              <input className={inputClass} placeholder="+234" value={newCountry.indicatif}
                onChange={e => setNewCountry(prev => ({ ...prev, indicatif: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Devise</label>
              <input className={inputClass} placeholder="NGN" value={newCountry.devise}
                onChange={e => setNewCountry(prev => ({ ...prev, devise: e.target.value, devise_symbole: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Prix / km</label>
              <input type="number" className={inputClass} value={newCountry.prix_par_km}
                onChange={e => setNewCountry(prev => ({ ...prev, prix_par_km: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Prix minimum</label>
              <input type="number" className={inputClass} value={newCountry.prix_minimum}
                onChange={e => setNewCountry(prev => ({ ...prev, prix_minimum: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Commission livreur %</label>
              <input type="number" className={inputClass} value={newCountry.commission_pct}
                onChange={e => setNewCountry(prev => ({ ...prev, commission_pct: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Seuil encours</label>
              <input type="number" className={inputClass} value={newCountry.seuil_encours_max}
                onChange={e => setNewCountry(prev => ({ ...prev, seuil_encours_max: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Ville principale</label>
              <input className={inputClass} placeholder="Lagos" value={newCountry.ville_principale}
                onChange={e => setNewCountry(prev => ({ ...prev, ville_principale: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Rayon km</label>
              <input type="number" className={inputClass} value={newCountry.rayon_km}
                onChange={e => setNewCountry(prev => ({ ...prev, rayon_km: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">Drapeau (emoji)</label>
              <input className={inputClass} placeholder="" value={newCountry.emoji_flag}
                onChange={e => setNewCountry(prev => ({ ...prev, emoji_flag: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowAddForm(false)}>Annuler</Button>
            <Button size="sm" onClick={handleAddCountry} disabled={createCountryMutation.isPending}
              className="gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600">
              {createCountryMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Créer le pays
            </Button>
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ──────────────────────────────── */}
      {pays.length === 0 && !isLoading && !showAddForm && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Globe className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-semibold text-foreground">Aucun pays configuré</p>
          <p className="text-xs text-muted-foreground mt-1">Cliquez sur "Ajouter un pays" pour commencer</p>
        </div>
      )}

      {/* ── LISTE PAYS ───────────────────────────────── */}
      <div className="space-y-3">
        {pays.map(p => {
          const commissionConfig = getCommissionConfig(p.code);
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-4 transition-all ${p.actif ? "border-green-100 bg-green-50/30" : "border-gray-100 bg-white"}`}
            >
              {editingId === p.id ? (
                /* ── FORMULAIRE ÉDITION PAYS ── */
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
                      { label: "Devise", key: "devise" },
                      { label: "Prix / km", key: "prix_par_km", type: "number" },
                      { label: "Prix minimum", key: "prix_minimum", type: "number" },
                      { label: "Commission %", key: "commission_pct", type: "number" },
                      { label: "Seuil encours (F)", key: "seuil_encours_max", type: "number" },
                      { label: "Ville principale", key: "ville_principale" },
                      { label: "Rayon km", key: "rayon_km", type: "number" },
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
                          className={inputClass}
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
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${p.actif ? "bg-green-100" : "bg-gray-100"}`}>
                      {p.emoji_flag || ""}
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
                           Seuil encours : {(p.seuil_encours_max || 5000).toLocaleString()} {p.devise || "FCFA"}
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

                  {/* ── COMMISSIONS PARTENAIRES ── */}
                  <div className="border-t border-gray-100 pt-3">
                    {editingCommissionId === commissionConfig?.id ? (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Commissions partenaires (%)</p>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-1 flex items-center gap-1"><Store className="w-3 h-3" />Boutique</label>
                            <input type="number" className={inputClass} value={commissionForm.commission_boutique_defaut}
                              onChange={e => setCommissionForm(prev => ({ ...prev, commission_boutique_defaut: Number(e.target.value) }))} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-1 flex items-center gap-1"><Utensils className="w-3 h-3" />Restaurant</label>
                            <input type="number" className={inputClass} value={commissionForm.commission_restaurant_defaut}
                              onChange={e => setCommissionForm(prev => ({ ...prev, commission_restaurant_defaut: Number(e.target.value) }))} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-1 flex items-center gap-1"><Pill className="w-3 h-3" />Pharmacie</label>
                            <input type="number" className={inputClass} value={commissionForm.commission_pharmacie_defaut}
                              onChange={e => setCommissionForm(prev => ({ ...prev, commission_pharmacie_defaut: Number(e.target.value) }))} />
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditingCommissionId(null)}>Annuler</Button>
                          <Button size="sm" onClick={() => handleSaveCommission(commissionConfig)} disabled={updateCommissionMutation.isPending}
                            className="gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600">
                            <Save className="w-3.5 h-3.5" />
                            Sauvegarder
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Commissions partenaires :</span>
                        <span className="text-[10px] bg-pink-50 text-pink-700 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                          <Store className="w-2.5 h-2.5" />Boutique : {commissionConfig?.commission_boutique_defaut ?? 10}%
                        </span>
                        <span className="text-[10px] bg-orange-50 text-orange-700 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                          <Utensils className="w-2.5 h-2.5" />Restaurant : {commissionConfig?.commission_restaurant_defaut ?? 10}%
                        </span>
                        <span className="text-[10px] bg-green-50 text-green-700 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                          <Pill className="w-2.5 h-2.5" />Pharmacie : {commissionConfig?.commission_pharmacie_defaut ?? 10}%
                        </span>
                        {commissionConfig && (
                          <button
                            onClick={() => handleEditCommission(commissionConfig)}
                            className="text-[10px] font-bold text-blue-600 hover:underline ml-1"
                          >
                            Modifier
                          </button>
                        )}
                        {!commissionConfig && (
                          <span className="text-[10px] text-red-500 font-medium">⚠ Aucune config — fallback 10%</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── LÉGENDE ──────────────────────────────────── */}
      {pays.length > 0 && (
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
          <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5"> Comment ça marche</p>
          <ul className="text-xs text-blue-700 space-y-1.5">
            <li>• <strong>Ajouter un pays</strong> → il devient immédiatement opérationnel (sélecteurs, tarifs, dispatch)</li>
            <li>• <strong>CommissionConfig</strong> créée automatiquement à 10% (boutique/restaurant/pharmacie)</li>
            <li>• <strong>Prix/km & Commission livreur</strong> → utilisés automatiquement au calcul de la course</li>
            <li>• <strong>Seuil encours</strong> → plafond avant blocage automatique du livreur</li>
            <li>• Aucun pays codé en dur — tout est dynamique depuis cette table</li>
          </ul>
        </div>
      )}
    </div>
  );
}