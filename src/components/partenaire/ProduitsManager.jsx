import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Plus, Pencil, Trash2, X, Package, UtensilsCrossed } from "lucide-react";

const CATEGORIES_PLAT = [
  { value: "entree", label: "Entrée" },
  { value: "plat", label: "Plat" },
  { value: "dessert", label: "Dessert" },
  { value: "boisson", label: "Boisson" },
  { value: "accompagnement", label: "Accompagnement" },
];

export default function ProduitsManager({ type, etablissementId }) {
  const isRestaurant = type === "restaurant";
  const entityName = isRestaurant ? "PlatRestaurant" : "ProduitBoutique";
  const idField = isRestaurant ? "restaurant_id" : "boutique_id";
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["produits", type, etablissementId],
    queryFn: () => base44.entities[entityName].filter({ [idField]: etablissementId }, "-created_date", 200),
  });

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cet article ?")) return;
    await base44.entities[entityName].delete(id);
    queryClient.invalidateQueries({ queryKey: ["produits", type, etablissementId] });
  };

  const handleToggleDispo = async (item) => {
    await base44.entities[entityName].update(item.id, { disponible: !item.disponible });
    queryClient.invalidateQueries({ queryKey: ["produits", type, etablissementId] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900 text-sm">{isRestaurant ? "Plats" : "Produits"}</h2>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="bg-purple-600 hover:bg-purple-700 gap-1">
          <Plus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-8">
          {isRestaurant ? <UtensilsCrossed className="w-10 h-10 text-gray-300 mx-auto mb-2" /> : <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />}
          <p className="text-sm text-gray-400">Aucun {isRestaurant ? "plat" : "produit"} pour le moment</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
              {item.photo_url ? <img src={item.photo_url} alt={item.nom} className="w-full h-full object-cover" /> : (isRestaurant ? <UtensilsCrossed className="w-5 h-5 text-gray-300" /> : <Package className="w-5 h-5 text-gray-300" />)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm truncate">{item.nom}</p>
              <p className="text-xs text-gray-500 truncate">{item.categorie || ""}</p>
              <p className="font-bold text-primary text-sm">{(item.prix || 0).toLocaleString()} FCFA</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => handleToggleDispo(item)} className={"px-2 py-1 rounded-lg text-[10px] font-bold " + (item.disponible ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400")}>
                {item.disponible ? "Dispo" : "Rupture"}
              </button>
              <button onClick={() => { setEditing(item); setShowForm(true); }} className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center"><Pencil className="w-4 h-4 text-gray-500" /></button>
              <button onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4 text-red-500" /></button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <ProduitForm type={type} etablissementId={etablissementId} existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["produits", type, etablissementId] }); }} />
      )}
    </div>
  );
}

function ProduitForm({ type, etablissementId, existing, onClose, onSaved }) {
  const isRestaurant = type === "restaurant";
  const entityName = isRestaurant ? "PlatRestaurant" : "ProduitBoutique";
  const idField = isRestaurant ? "restaurant_id" : "boutique_id";
  const [form, setForm] = useState(existing || { nom: "", description: "", photo_url: "", prix: 0, categorie: isRestaurant ? "plat" : "", disponible: true, actif: true });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set("photo_url", file_url);
    } catch (err) {}
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.nom || !form.prix) return;
    setSaving(true);
    try {
      const data = { ...form, [idField]: etablissementId, prix: Number(form.prix) };
      if (existing?.id) {
        await base44.entities[entityName].update(existing.id, data);
      } else {
        await base44.entities[entityName].create(data);
      }
      onSaved?.();
    } catch (err) {}
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{existing ? "Modifier" : "Ajouter"} {isRestaurant ? "un plat" : "un produit"}</h2>
          <button onClick={onClose} className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <Label className="text-xs">Photo</Label>
            <div className="flex items-center gap-3 mt-1">
              {form.photo_url && <img src={form.photo_url} alt="photo" className="w-16 h-16 rounded-xl object-cover" />}
              <label className="cursor-pointer">
                <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" disabled={uploading} />
                <div className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {form.photo_url ? "Changer" : "Télécharger"}
                </div>
              </label>
            </div>
          </div>
          <div><Label className="text-xs">Nom *</Label><Input value={form.nom} onChange={e => set("nom", e.target.value)} placeholder="Nom" className="mt-1" /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="Description" rows={2} className="mt-1" /></div>
          <div><Label className="text-xs">Prix (FCFA) *</Label><Input type="number" value={form.prix} onChange={e => set("prix", e.target.value)} placeholder="0" className="mt-1" /></div>
          {isRestaurant ? (
            <div><Label className="text-xs">Catégorie</Label>
              <select value={form.categorie} onChange={e => set("categorie", e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm mt-1">
                {CATEGORIES_PLAT.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          ) : (
            <div><Label className="text-xs">Catégorie</Label><Input value={form.categorie || ""} onChange={e => set("categorie", e.target.value)} placeholder="Ex: Boissons, Alimentation" className="mt-1" /></div>
          )}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.disponible} onChange={e => set("disponible", e.target.checked)} className="w-4 h-4" /> Disponible</label>
          <Button onClick={handleSave} disabled={saving || !form.nom || !form.prix} className="w-full bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
