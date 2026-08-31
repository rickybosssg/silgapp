import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Edit3, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AddLieuDialog from "@/components/location/AddLieuDialog";

const CATEGORIES = [
  { value: "commerce", label: "Commerce" },
  { value: "entreprise", label: "Entreprise" },
  { value: "pharmacie", label: "Pharmacie" },
  { value: "hotel", label: "Hôtel" },
  { value: "restaurant", label: "Restaurant" },
  { value: "ecole", label: "École" },
  { value: "administration", label: "Administration" },
  { value: "marche", label: "Marché" },
  { value: "banque", label: "Banque" },
  { value: "clinique", label: "Clinique" },
  { value: "station_service", label: "Station-service" },
  { value: "autre", label: "Autre" },
];

function parseAliases(aliasesStr) {
  try { return JSON.parse(aliasesStr || "[]"); } catch { return []; }
}

export default function LieuxSilgappPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: lieux = [], isLoading } = useQuery({
    queryKey: ["lieux-silgapp", countryFilter],
    queryFn: async () => {
      const filter = { statut: "actif" };
      if (countryFilter) filter.country_code = countryFilter;
      const data = await base44.entities.LieuSilgapp.filter(filter, "-nombre_utilisations", 500);
      return data || [];
    },
  });

  const filtered = (lieux || []).filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.nom?.toLowerCase().includes(q) || l.quartier?.toLowerCase().includes(q) || l.ville?.toLowerCase().includes(q);
  });

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce lieu définitivement ?")) return;
    try {
      await base44.entities.LieuSilgapp.delete(id);
      toast.success("Lieu supprimé");
      queryClient.invalidateQueries(["lieux-silgapp"]);
    } catch (err) {
      toast.error("Erreur: " + (err?.message || "inconnue"));
    }
  };

  const handleSaveEdit = async () => {
    if (!editing?.nom) { toast.error("Le nom est obligatoire"); return; }
    try {
      const aliasArray = (editing.aliases || "").split(",").map((a) => a.trim()).filter(Boolean);
      await base44.entities.LieuSilgapp.update(editing.id, {
        nom: editing.nom,
        aliases: JSON.stringify(aliasArray),
        categorie: editing.categorie,
        quartier: editing.quartier,
        ville: editing.ville,
      });
      toast.success("Lieu modifié");
      setEditing(null);
      queryClient.invalidateQueries(["lieux-silgapp"]);
    } catch (err) {
      toast.error("Erreur: " + (err?.message || "inconnue"));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lieux SILGAPP</h1>
          <p className="text-sm text-gray-500">{filtered.length} lieu(x) enregistré(s)</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      <div className="flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, quartier, ville..." className="flex-1" />
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Tous pays" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Tous pays</SelectItem>
            <SelectItem value="BF">🇧🇫 BF</SelectItem>
            <SelectItem value="CI">🇨🇮 CI</SelectItem>
            <SelectItem value="TG">🇹🇬 TG</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucun lieu enregistré</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((lieu) => (
            <div key={lieu.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                <Building2 className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{lieu.nom}</p>
                <p className="text-xs text-gray-500 truncate">
                  {[lieu.quartier, lieu.ville, lieu.country_code].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {CATEGORIES.find((c) => c.value === lieu.categorie)?.label || lieu.categorie}
                </span>
                {lieu.precision_gps === "approximative" && (
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    GPS approx.
                  </span>
                )}
                <span className="text-[10px] text-gray-400">{lieu.nombre_utilisations || 0}×</span>
                <button onClick={() => setEditing({ ...lieu, aliases: parseAliases(lieu.aliases).join(", ") })}
                  className="p-1.5 rounded-lg hover:bg-gray-100">
                  <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                </button>
                <button onClick={() => handleDelete(lieu.id)} className="p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddLieuDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        countryCode={countryFilter || "BF"}
        initialName={search}
        onCreated={() => {
          setShowAddDialog(false);
          queryClient.invalidateQueries(["lieux-silgapp"]);
        }}
      />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Modifier le lieu</h2>
            <div>
              <Label className="text-xs">Nom</Label>
              <Input value={editing.nom} onChange={(e) => setEditing({ ...editing, nom: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Catégorie</Label>
              <Select value={editing.categorie} onValueChange={(v) => setEditing({ ...editing, categorie: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Aliases (séparés par virgules)</Label>
              <Input value={editing.aliases} onChange={(e) => setEditing({ ...editing, aliases: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Quartier</Label>
                <Input value={editing.quartier || ""} onChange={(e) => setEditing({ ...editing, quartier: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Ville</Label>
                <Input value={editing.ville || ""} onChange={(e) => setEditing({ ...editing, ville: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
              <Button onClick={handleSaveEdit}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}