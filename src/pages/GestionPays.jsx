import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Globe, Plus, Save, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
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

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Gestion des pays SILGAPP
          </h1>
          <p className="text-xs text-muted-foreground">Activer un pays suffit pour le rendre opérationnel</p>
        </div>
        {pays.length === 0 && (
          <Button
            size="sm"
            onClick={handleInitialiser}
            disabled={initializing}
            className="gap-1.5"
          >
            {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Initialiser les pays
          </Button>
        )}
      </div>

      {pays.length === 0 && !isLoading && (
        <Card className="p-8 text-center text-muted-foreground">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Aucun pays configuré</p>
          <p className="text-xs mt-1">Cliquez sur "Initialiser les pays" pour ajouter BF, CI, TG, BJ, SN...</p>
        </Card>
      )}

      <div className="space-y-3">
        {pays.map(p => (
          <Card key={p.id} className={`p-4 transition-all ${p.actif ? "border-green-200 bg-green-50/30" : "border-gray-200"}`}>
            {editingId === p.id ? (
              // Formulaire d'édition
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{p.emoji_flag}</span>
                  <span className="font-bold text-foreground">{p.code} — {p.nom}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Devise", key: "devise" },
                    { label: "Prix/km", key: "prix_par_km", type: "number" },
                    { label: "Prix minimum", key: "prix_minimum", type: "number" },
                    { label: "Commission %", key: "commission_pct", type: "number" },
                    { label: "Ville principale", key: "ville_principale" },
                    { label: "Rayon km", key: "rayon_km", type: "number" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
                      <input
                        type={f.type || "text"}
                        value={editForm[f.key] || ""}
                        onChange={e => setEditForm(prev => ({
                          ...prev,
                          [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value
                        }))}
                        className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Annuler</Button>
                  <Button size="sm" onClick={() => handleSave(p.id)} disabled={updateMutation.isPending} className="gap-1.5">
                    <Save className="w-3.5 h-3.5" />
                    Sauvegarder
                  </Button>
                </div>
              </div>
            ) : (
              // Vue normale
              <div className="flex items-center gap-3">
                <span className="text-2xl">{p.emoji_flag || "🌍"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground">{p.nom}</span>
                    <span className="text-xs text-muted-foreground">{p.indicatif}</span>
                    {p.actif ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium border border-green-200">✅ Actif</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium border border-gray-200">Inactif</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    <span>💰 {p.prix_par_km || 100} {p.devise || "FCFA"}/km</span>
                    <span>Min: {(p.prix_minimum || 500).toLocaleString()} {p.devise || "FCFA"}</span>
                    <span>Commission: {p.commission_pct || 30}%</span>
                    {p.ville_principale && <span>📍 {p.ville_principale}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    onClick={() => handleEdit(p)}
                  >
                    Modifier
                  </Button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: p.id, actif: !p.actif })}
                    disabled={toggleMutation.isPending}
                    className="flex-shrink-0"
                    title={p.actif ? "Désactiver" : "Activer"}
                  >
                    {p.actif
                      ? <ToggleRight className="w-8 h-8 text-green-500" />
                      : <ToggleLeft className="w-8 h-8 text-gray-400" />
                    }
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Légende */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-xs text-blue-800 font-semibold mb-2">💡 Comment ça marche :</p>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• <strong>Activer un pays</strong> → il apparaît dans les sélecteurs livreurs/clients</li>
          <li>• <strong>Prix/km</strong> → utilisé automatiquement au calcul de la course</li>
          <li>• <strong>Commission %</strong> → part de Silga sur chaque course</li>
          <li>• Les livreurs/clients s'enregistrent avec leur pays → les stats se filtrent automatiquement</li>
        </ul>
      </Card>
    </div>
  );
}