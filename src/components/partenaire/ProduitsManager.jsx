import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Pencil, Trash2, X, Package, UtensilsCrossed, Camera, Film } from "lucide-react";
import MediaUploader from "@/components/media/MediaUploader";
import { parsePhotos } from "@/components/media/MediaGallery";
import { readPartnerProductPreview } from "@/lib/commerceScreenPreview";

import { createOwnerCommerce, browserCommerceIntents, ownerCreationScope } from "@/lib/commerceOwnerMigration";

const CATEGORIES_PLAT = [
  { value: "entree", label: "Entrée" },
  { value: "plat", label: "Plat" },
  { value: "dessert", label: "Dessert" },
  { value: "boisson", label: "Boisson" },
  { value: "accompagnement", label: "Accompagnement" },
];

// Optional qualification reader. No current caller enables it. Never mix with legacy writes.
export default function ProduitsManager({ type, etablissementId, commercePreview = null, ownerCommerce = null }) {
  const readOnlyPreview = commercePreview !== null;
  const serverOwner = !readOnlyPreview && ownerCommerce?.enabled === true && !!ownerCommerce.userId;
  const ownerApi = () => createOwnerCommerce({sdk:base44,actorId:ownerCommerce.userId});
  const mutationPending = useRef(false);
  const [mutationError,setMutationError] = useState(null);
  const [mutationBlocked,setMutationBlocked] = useState(false);
  const [pageState, setPageState] = useState({ scope: "", offset: 0 });
  const previewScope = JSON.stringify([type, etablissementId, commercePreview?.userId, serverOwner ? ownerCommerce.userId : null]);
  const offset = pageState.scope === previewScope ? pageState.offset : 0;
  const isRestaurant = type === "restaurant";
  const theme = isRestaurant
    ? {
        primary: "bg-orange-600 hover:bg-orange-700",
        soft: "bg-orange-50 hover:bg-orange-100",
        text: "text-orange-700",
        spinner: "text-orange-500",
        ring: "focus:ring-orange-200 focus:border-orange-400",
      }
    : {
        primary: "bg-blue-700 hover:bg-blue-800",
        soft: "bg-blue-50 hover:bg-blue-100",
        text: "text-blue-700",
        spinner: "text-blue-500",
        ring: "focus:ring-blue-200 focus:border-blue-400",
      };
  const entityName = isRestaurant ? "PlatRestaurant" : "ProduitBoutique";
  const idField = isRestaurant ? "restaurant_id" : "boutique_id";
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: productPage, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ["produits", type, etablissementId, readOnlyPreview ? "server-preview" : serverOwner ? "server-owner" : "legacy", commercePreview?.userId || ownerCommerce?.userId, offset],
    enabled: !!etablissementId,
    queryFn: async () => {
      if (readOnlyPreview) return readPartnerProductPreview(commercePreview, { type, parentId: etablissementId, offset });
      if (serverOwner) return ownerApi().products(type,etablissementId,offset);
      const rows = await base44.entities[entityName].filter({ [idField]: etablissementId }, "-created_date", 200);
      if (!Array.isArray(rows) || rows.some(row => row[idField] !== etablissementId)) throw new Error("Catalogue reçu invalide. Actualisez.");
      return { rows, hasMore: false, nextOffset: null };
    },
    retry: (readOnlyPreview || serverOwner) ? false : undefined,
  });
  const items = productPage?.rows || [];

  const mutate = async (operation) => {
    if(mutationPending.current || mutationBlocked)return;
    mutationPending.current=true;setMutationError(null);
    try { await operation(); await queryClient.invalidateQueries({queryKey:["produits",type,etablissementId]}); }
    catch(error) { setMutationError(error?.message || "Modification non confirmee. Actualisez avant de continuer.");setMutationBlocked(error?.uncertain!==false); }
    finally {mutationPending.current=false;}
  };
  const handleDelete = async (id) => {
    if (readOnlyPreview || !confirm("Supprimer cet article ?")) return;
    await mutate(()=>serverOwner?ownerApi().removeProduct({type,parentId:etablissementId,id}):base44.entities[entityName].delete(id));
  };
  const handleToggleDispo = async (item) => {
    if (readOnlyPreview) return;
    await mutate(()=>serverOwner?ownerApi().setAvailable({type,parentId:etablissementId,id:item.id,available:!item.disponible}):base44.entities[entityName].update(item.id,{disponible:!item.disponible}));
  };
  const addProduct = async () => {
    try {
      if(serverOwner) {
        const intents=browserCommerceIntents(),scope=ownerCreationScope(ownerCommerce.userId,type,etablissementId);
        const pending=intents.read(scope);
        if(pending && ["completed","rejected"].includes(pending.status))await intents.startNew(scope);
      }
      setEditing(null);setShowForm(true);
    } catch(error) {setMutationError(error.message);}
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-bold text-gray-900 text-base">{isRestaurant ? "Plats" : "Produits"}</h2>
        <Button disabled={readOnlyPreview || mutationBlocked} size="sm" onClick={addProduct} className={`${theme.primary} gap-1 rounded-xl`}>
          <Plus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      {readOnlyPreview && <p role="status" className="text-xs text-slate-600">Qualification serveur : consultation seule. Les compteurs concernent cette page.</p>}
      {mutationError && <p role="alert" className="text-sm text-red-600">{mutationError}</p>}
      {serverOwner && <p className="text-xs text-slate-600">Catalogue serveur : les compteurs concernent cette page.</p>}
      {/* Stats rapides */}
      {!isLoading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-2 px-1">
          <div className="bg-white rounded-xl p-2.5 text-center border border-gray-50 shadow-sm">
            <p className="text-lg font-black text-gray-900">{items.length}</p>
            <p className="text-[9px] text-gray-400 font-medium">Total</p>
          </div>
          <div className="bg-white rounded-xl p-2.5 text-center border border-gray-50 shadow-sm">
            <p className="text-lg font-black text-green-600">{items.filter(i => i.disponible).length}</p>
            <p className="text-[9px] text-gray-400 font-medium">Disponibles</p>
          </div>
          <div className="bg-white rounded-xl p-2.5 text-center border border-gray-50 shadow-sm">
            <p className="text-lg font-black text-gray-400">{items.filter(i => !i.disponible).length}</p>
            <p className="text-[9px] text-gray-400 font-medium">Rupture</p>
          </div>
        </div>
      )}

      {isLoading && <div className="flex justify-center py-12"><Loader2 className={`w-6 h-6 animate-spin ${theme.spinner}`} /></div>}

      {loadError && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">Impossible de charger le catalogue. <button onClick={() => refetch()} className="font-bold underline">Réessayer</button></div>}
      <button onClick={async () => { const result=await refetch();if(!result.error){setMutationBlocked(false);setMutationError(null);} }} className="text-xs font-semibold text-slate-600 underline">Actualiser le catalogue</button>
      {!isLoading && !loadError && items.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
            {isRestaurant ? <UtensilsCrossed className="w-8 h-8 text-gray-300" /> : <Package className="w-8 h-8 text-gray-300" />}
          </div>
          <p className="text-sm text-gray-400 font-medium">Aucun {isRestaurant ? "plat" : "produit"} pour le moment</p>
          <p className="text-xs text-gray-400 mt-1">Cliquez sur « Ajouter » pour commencer</p>
        </div>
      )}

      {/* Grille de produits — style marketplace */}
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
            {/* Photo principale + badge multi-médias */}
            <div className="relative w-full aspect-square bg-gray-50 overflow-hidden">
              {item.photo_url ? (
                <img src={item.photo_url} alt={item.nom} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {isRestaurant ? <UtensilsCrossed className="w-8 h-8 text-gray-200" /> : <Package className="w-8 h-8 text-gray-200" />}
                </div>
              )}
              {/* Badge galerie si plusieurs médias */}
              {(parsePhotos(item).length > 1 || item.video_url) && (
                <span className="absolute bottom-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-sm flex items-center gap-0.5">
                  <Camera className="w-2.5 h-2.5" /> {parsePhotos(item).length}
                  {item.video_url && <Film className="w-2.5 h-2.5" />}
                </span>
              )}
              {/* Badge dispo */}
              <button
                disabled={readOnlyPreview || mutationBlocked}
                onClick={() => handleToggleDispo(item)}
                className={"absolute top-2 right-2 text-[9px] font-bold px-2 py-1 rounded-full backdrop-blur-sm " + (item.disponible ? "bg-green-500/90 text-white" : "bg-gray-500/90 text-white")}
              >
                {item.disponible ? "Dispo" : "Rupture"}
              </button>
              {/* Catégorie */}
              {item.categorie && (
                <span className="absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/90 text-gray-600 backdrop-blur-sm">
                  {isRestaurant ? (CATEGORIES_PLAT.find(c => c.value === item.categorie)?.label || item.categorie) : item.categorie}
                </span>
              )}
            </div>
            {/* Info */}
            <div className="p-2.5">
              <p className="font-bold text-gray-900 text-sm truncate">{item.nom}</p>
              {item.description && <p className="text-[10px] text-gray-400 truncate">{item.description}</p>}
              <p className="font-black text-primary text-sm mt-1">{(item.prix || 0).toLocaleString()} FCFA</p>
              {/* Actions */}
              <div className="flex gap-1.5 mt-2">
                <button disabled={readOnlyPreview || mutationBlocked} onClick={() => { setEditing(item); setShowForm(true); }} className={`flex-1 h-8 rounded-lg ${theme.soft} flex items-center justify-center gap-1 text-[10px] font-bold ${theme.text} transition-colors`}>
                  <Pencil className="w-3 h-3" /> Modifier
                </button>
                <button disabled={readOnlyPreview || mutationBlocked} onClick={() => handleDelete(item.id)} className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(readOnlyPreview || serverOwner) && <div className="flex gap-3">
        <button disabled={isLoading || offset === 0} onClick={() => setPageState({ scope: previewScope, offset: Math.max(0, offset - 50) })}>Page precedente</button>
        <button disabled={isLoading || !!loadError || !productPage?.hasMore} onClick={() => setPageState({ scope: previewScope, offset: productPage.nextOffset })}>Page suivante</button>
      </div>}
      {showForm && !readOnlyPreview && (
        <ProduitForm type={type} etablissementId={etablissementId} existing={editing} ownerCommerce={serverOwner ? ownerCommerce : null}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["produits", type, etablissementId] }); }} />
      )}
    </div>
  );
}

function ProduitForm({ type, etablissementId, existing, onClose, onSaved, ownerCommerce }) {
  const serverOwner = ownerCommerce?.enabled === true && !!ownerCommerce.userId;
  const isRestaurant = type === "restaurant";
  const entityName = isRestaurant ? "PlatRestaurant" : "ProduitBoutique";
  const idField = isRestaurant ? "restaurant_id" : "boutique_id";
  const initialPhotos = existing ? parsePhotos(existing) : [];
  const [form, setForm] = useState(existing || { nom: "", description: "", photo_url: "", photos_urls: "", video_url: "", prix: 0, categorie: isRestaurant ? "plat" : "", disponible: true, actif: true });
  const [photos, setPhotos] = useState(initialPhotos);
  const [videoUrl, setVideoUrl] = useState(existing?.video_url || "");
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const savePending = useRef(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleMediaChange = ({ photos: newPhotos, video_url }) => {
    setPhotos(newPhotos);
    setVideoUrl(video_url);
  };

  useEffect(() => {
    if(!serverOwner || existing?.id)return;
    try {
      const entry=browserCommerceIntents().read(ownerCreationScope(ownerCommerce.userId,type,etablissementId));
      if(entry){setForm(entry.data);setPhotos(parsePhotos(entry.data));setVideoUrl(entry.data.video_url || "");setUncertain(entry.status!=="rejected");setSaveError("Une intention precedente est conservee. Verifiez son resultat avant toute nouvelle creation.");}
    } catch(error){setUncertain(true);setSaveError(error.message);}
  },[serverOwner,ownerCommerce?.userId,type,etablissementId,existing?.id]);

  const handleSave = async (reconcile=false) => {
    if(reconcile && (!serverOwner || existing?.id))return;
    if(reconcile && !confirm("Cette reprise peut finaliser la creation initiale avec la meme proposition et le meme identifiant enregistres. Continuer ?"))return;
    if (savePending.current || mediaBusy || (uncertain && !reconcile)) return;
    if (!form.nom?.trim() || !Number.isFinite(Number(form.prix)) || Number(form.prix) <= 0) { setSaveError("Indiquez un nom et un prix positif."); return; }
    savePending.current = true;
    setSaveError("");
    setSaving(true);
    let writeStarted = false;
    try {
      if(serverOwner) {
        const api=createOwnerCommerce({sdk:base44,actorId:ownerCommerce.userId,intents:existing?.id ? undefined : browserCommerceIntents()});
        await api.saveProduct({type,parentId:etablissementId,existing,reconcile,data:{...form,nom:form.nom.trim(),prix:Number(form.prix),photo_url:photos[0]||"",photos_urls:photos.length?JSON.stringify(photos):"",video_url:videoUrl||""}});
        setUncertain(false);onSaved?.();return;
      }
      const me = await base44.auth.me();
      const owner = await base44.entities[isRestaurant ? "Restaurant" : "Boutique"].get(etablissementId);
      if (!me?.id || owner?.partenaire_id !== me.id || ["refuse", "suspendu"].includes(owner.validation)) throw new Error("Vous ne pouvez pas modifier ce catalogue.");
      if (existing?.id) {
        const current = await base44.entities[entityName].get(existing.id);
        if (current?.[idField] !== etablissementId) throw new Error("Article rattaché à un autre établissement.");
      }
      const data = {
        nom: form.nom.trim(), description: form.description || "", categorie: form.categorie || "", disponible: !!form.disponible,
        [idField]: etablissementId,
        prix: Number(form.prix),
        photo_url: photos[0] || "", // première photo = photo principale (rétrocompatibilité panier/liste)
        photos_urls: photos.length > 0 ? JSON.stringify(photos) : "",
        video_url: videoUrl || "",
      };
      writeStarted = true;
      const raw = existing?.id
        ? await base44.entities[entityName].update(existing.id, data)
        : await base44.entities[entityName].create({ ...data, actif: true });
      const saved = raw?.data ?? raw;
      if (!saved?.id || saved[idField] !== etablissementId || (existing?.id && saved.id !== existing.id)) throw new Error("Enregistrement non confirmé");
      onSaved?.();
    } catch (err) {
      setUncertain(serverOwner ? err?.uncertain!==false : writeStarted);
      setSaveError(writeStarted ? "Enregistrement non confirmé. Fermez puis actualisez le catalogue avant de réessayer, pour éviter un doublon." : (err.message || "Impossible d'enregistrer cet article."));
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{existing ? "Modifier" : "Ajouter"} {isRestaurant ? "un plat" : "un produit"}</h2>
          <button onClick={onClose} className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          {/* Galerie médias — multi-photos + vidéo */}
          <div>
            <Label className="text-xs">Photos & Vidéo</Label>
            <div className="mt-1">
              <MediaUploader photos={photos} videoUrl={videoUrl} onChange={handleMediaChange} onBusyChange={setMediaBusy} disabled={saving || uncertain} />
            </div>
          </div>
          <div><Label className="text-xs">Nom *</Label><Input disabled={serverOwner && uncertain} value={form.nom} onChange={e => set("nom", e.target.value)} placeholder="Nom" className="mt-1" /></div>
          <div><Label className="text-xs">Description</Label><Textarea disabled={serverOwner && uncertain} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Description" rows={2} className="mt-1" /></div>
          <div><Label className="text-xs">Prix (FCFA) *</Label><Input disabled={serverOwner && uncertain} type="number" value={form.prix} onChange={e => set("prix", e.target.value)} placeholder="0" className="mt-1" /></div>
          {isRestaurant ? (
            <div><Label className="text-xs">Catégorie</Label>
              <select disabled={serverOwner && uncertain} value={form.categorie} onChange={e => set("categorie", e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm mt-1">
                {CATEGORIES_PLAT.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          ) : (
            <div><Label className="text-xs">Catégorie</Label><Input disabled={serverOwner && uncertain} value={form.categorie || ""} onChange={e => set("categorie", e.target.value)} placeholder="Ex: Boissons, Alimentation" className="mt-1" /></div>
          )}
          <label className="flex items-center gap-2 text-xs"><input disabled={serverOwner && uncertain} type="checkbox" checked={form.disponible} onChange={e => set("disponible", e.target.checked)} className="w-4 h-4" /> Disponible</label>
          {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
          {serverOwner && uncertain && !existing?.id && <p className="text-xs text-amber-700">Cette reprise peut finaliser la création initiale avec la proposition et le même identifiant enregistrés. Aucune nouvelle intention ne sera créée.</p>}
          {serverOwner && uncertain && !existing?.id && <Button disabled={saving || mediaBusy} onClick={() => handleSave(true)}>Reprendre la même création enregistrée</Button>}
          {mediaBusy && <p className="text-xs text-slate-600">Envoi des médias en cours…</p>}
          <Button onClick={() => handleSave(false)} disabled={saving || mediaBusy || uncertain || !form.nom?.trim() || !Number.isFinite(Number(form.prix)) || Number(form.prix) <= 0} className={`w-full ${isRestaurant ? "bg-orange-600 hover:bg-orange-700" : "bg-blue-700 hover:bg-blue-800"}`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
