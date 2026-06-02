import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Plus, ArrowLeft, Eye, MousePointerClick, Video, Image, Type,
  ToggleLeft, ToggleRight, Pencil, Trash2, TrendingUp, Calendar,
  Users, Target, Loader2, X, Check, ExternalLink, Megaphone
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const CIBLES = [
  { value: "tous",              label: "Tous les utilisateurs", color: "bg-purple-100 text-purple-700" },
  { value: "clients",           label: "Clients uniquement",   color: "bg-blue-100 text-blue-700" },
  { value: "livreurs_externes", label: "Livreurs externes",    color: "bg-green-100 text-green-700" },
];

const FORMATS = [
  { value: "carrousel",   label: "Carrousel",    icon: "🎠", desc: "Défilement dans le dashboard" },
  { value: "plein_ecran", label: "Plein écran",  icon: "📢", desc: "Annonce importante à l'ouverture" },
];

const defaultForm = {
  titre: "", description: "", type_media: "image", media_url: "",
  lien_whatsapp: "", lien_telephone: "", lien_url: "",
  cible: "tous", format: "carrousel", actif: true,
  date_debut: "", date_fin: "", ordre: 0,
  couleur_fond: "#1a1a2e", couleur_texte: "#ffffff",
  annonceur_nom: "", annonceur_contact: "",
};

export default function GestionPublicites() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [uploading, setUploading] = useState(false);
  const [filterCible, setFilterCible] = useState("tous_filtres");

  const { data: pubs = [], isLoading } = useQuery({
    queryKey: ["publicites"],
    queryFn: () => base44.entities.Publicite.list("-created_date", 100),
    initialData: [],
    refetchInterval: 15000,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editingId
      ? base44.entities.Publicite.update(editingId, data)
      : base44.entities.Publicite.create(data),
    onSuccess: () => {
      toast.success(editingId ? "Publicité mise à jour ✓" : "Publicité créée ✓");
      queryClient.invalidateQueries({ queryKey: ["publicites"] });
      resetForm();
    },
    onError: (err) => toast.error("Erreur : " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Publicite.delete(id),
    onSuccess: () => {
      toast.success("Publicité supprimée");
      queryClient.invalidateQueries({ queryKey: ["publicites"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, actif }) => base44.entities.Publicite.update(id, { actif: !actif }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["publicites"] }),
  });

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (pub) => {
    setForm({
      titre: pub.titre || "",
      description: pub.description || "",
      type_media: pub.type_media || "image",
      media_url: pub.media_url || "",
      lien_whatsapp: pub.lien_whatsapp || "",
      lien_telephone: pub.lien_telephone || "",
      lien_url: pub.lien_url || "",
      cible: pub.cible || "tous",
      format: pub.format || "carrousel",
      actif: pub.actif !== false,
      date_debut: pub.date_debut ? pub.date_debut.slice(0, 16) : "",
      date_fin: pub.date_fin ? pub.date_fin.slice(0, 16) : "",
      ordre: pub.ordre || 0,
      couleur_fond: pub.couleur_fond || "#1a1a2e",
      couleur_texte: pub.couleur_texte || "#ffffff",
      annonceur_nom: pub.annonceur_nom || "",
      annonceur_contact: pub.annonceur_contact || "",
    });
    setEditingId(pub.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, media_url: file_url }));
      toast.success("Média uploadé ✓");
    } catch (err) {
      toast.error("Erreur upload : " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.titre.trim()) { toast.error("Titre requis"); return; }
    saveMutation.mutate({
      ...form,
      date_debut: form.date_debut ? new Date(form.date_debut).toISOString() : null,
      date_fin: form.date_fin ? new Date(form.date_fin).toISOString() : null,
      ordre: Number(form.ordre) || 0,
    });
  };

  const pubsFiltered = filterCible === "tous_filtres"
    ? pubs
    : pubs.filter(p => p.cible === filterCible);

  const now = new Date().toISOString();
  const pubsActives = pubs.filter(p => p.actif && (!p.date_fin || p.date_fin > now));
  const totalAffichages = pubs.reduce((s, p) => s + (p.nb_affichages || 0), 0);
  const totalClics = pubs.reduce((s, p) => s + (p.nb_clics || 0), 0);
  const tauxClic = totalAffichages > 0 ? ((totalClics / totalAffichages) * 100).toFixed(1) : "0";

  return (
    <div className="px-4 py-4 lg:p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700 p-5 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-1.5 text-white hover:bg-white/20 border border-white/30">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Retour</span>
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-yellow-300" />
                <h1 className="text-xl font-black text-white">Gestion des Publicités</h1>
              </div>
              <p className="text-white/70 text-xs mt-0.5">{pubsActives.length} pub(s) active(s) · Réseau publicitaire SILGAPP</p>
            </div>
          </div>
          <Button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(defaultForm); }}
            className="bg-white text-purple-700 hover:bg-white/90 font-bold gap-1.5 rounded-xl shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nouvelle pub</span>
          </Button>
        </div>
      </div>

      {/* ── STATS GLOBALES ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pubs actives",  value: pubsActives.length,   grad: "from-violet-500 to-purple-600", icon: Megaphone },
          { label: "Affichages",    value: totalAffichages.toLocaleString(), grad: "from-blue-500 to-indigo-600", icon: Eye },
          { label: "Clics",         value: totalClics.toLocaleString(),      grad: "from-green-500 to-emerald-600", icon: MousePointerClick },
          { label: "Taux de clic",  value: `${tauxClic}%`,                   grad: "from-orange-500 to-amber-600", icon: TrendingUp },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`bg-gradient-to-br ${s.grad} rounded-2xl p-4 text-white shadow-md`}>
              <Icon className="w-5 h-5 opacity-80 mb-2" />
              <p className="text-2xl font-black leading-none">{s.value}</p>
              <p className="text-[11px] opacity-70 mt-1 uppercase tracking-wide font-semibold">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* ── FORMULAIRE ── */}
      {showForm && (
        <Card className="p-5 border-violet-200 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black text-gray-900">
              {editingId ? "✏️ Modifier la publicité" : "➕ Nouvelle publicité"}
            </h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Format + Cible */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-bold text-sm">Format *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, format: f.value }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${form.format === f.value ? "border-violet-500 bg-violet-50" : "border-gray-200 bg-white hover:border-violet-200"}`}
                    >
                      <div className="text-xl mb-1">{f.icon}</div>
                      <p className="text-xs font-bold text-gray-900">{f.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{f.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-sm">Cible *</Label>
                <div className="space-y-1.5">
                  {CIBLES.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, cible: c.value }))}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all text-left ${form.cible === c.value ? "border-violet-500 bg-violet-50" : "border-gray-100 bg-gray-50 hover:border-violet-200"}`}
                    >
                      <Target className={`w-3.5 h-3.5 ${form.cible === c.value ? "text-violet-600" : "text-gray-400"}`} />
                      <span className={`text-xs font-semibold ${form.cible === c.value ? "text-violet-700" : "text-gray-700"}`}>{c.label}</span>
                      {form.cible === c.value && <Check className="w-3.5 h-3.5 text-violet-600 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Titre + Description */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-bold text-sm">Titre *</Label>
                <Input value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder="Ex: Livraison express -20%" className="rounded-xl" required />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-sm">Annonceur</Label>
                <Input value={form.annonceur_nom} onChange={e => setForm(p => ({ ...p, annonceur_nom: e.target.value }))} placeholder="Nom de l'entreprise" className="rounded-xl" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-sm">Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Texte court et accrocheur..." className="rounded-xl" />
            </div>

            {/* Type média + Upload */}
            <div className="space-y-3">
              <Label className="font-bold text-sm">Média</Label>
              <div className="flex gap-2">
                {[
                  { v: "image", l: "Image", Icon: Image },
                  { v: "video", l: "Vidéo", Icon: Video },
                  { v: "texte", l: "Texte seul", Icon: Type },
                ].map(({ v, l, Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, type_media: v }))}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all ${form.type_media === v ? "border-violet-500 bg-violet-50" : "border-gray-200 bg-white"}`}
                  >
                    <Icon className={`w-4 h-4 ${form.type_media === v ? "text-violet-600" : "text-gray-400"}`} />
                    <span className="text-[11px] font-bold text-gray-700">{l}</span>
                  </button>
                ))}
              </div>

              {form.type_media !== "texte" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="upload-media" className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed cursor-pointer transition-all ${uploading ? "border-violet-400 bg-violet-50" : "border-gray-300 hover:border-violet-400 hover:bg-violet-50"}`}>
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin text-violet-600" /> : <Plus className="w-4 h-4 text-gray-400" />}
                      <span className="text-xs font-semibold text-gray-500">{uploading ? "Upload en cours..." : "Uploader un fichier"}</span>
                    </Label>
                    <input id="upload-media" type="file" className="hidden" accept={form.type_media === "video" ? "video/*" : "image/*"} onChange={handleUpload} />
                  </div>
                  {form.media_url && (
                    <div className="relative rounded-xl overflow-hidden bg-gray-100">
                      {form.type_media === "image"
                        ? <img src={form.media_url} alt="preview" className="w-full h-28 object-cover" />
                        : <video src={form.media_url} className="w-full h-28 object-cover" controls />}
                      <button type="button" onClick={() => setForm(p => ({ ...p, media_url: "" }))} className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  )}
                  <Input value={form.media_url} onChange={e => setForm(p => ({ ...p, media_url: e.target.value }))} placeholder="Ou coller une URL directe..." className="rounded-xl text-xs" />
                </div>
              )}
            </div>

            {/* Liens CTA */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-xs text-green-700">WhatsApp</Label>
                <Input value={form.lien_whatsapp} onChange={e => setForm(p => ({ ...p, lien_whatsapp: e.target.value }))} placeholder="+22670000000" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs text-blue-700">Téléphone</Label>
                <Input value={form.lien_telephone} onChange={e => setForm(p => ({ ...p, lien_telephone: e.target.value }))} placeholder="+226 70 00 00 00" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs text-violet-700">URL externe</Label>
                <Input value={form.lien_url} onChange={e => setForm(p => ({ ...p, lien_url: e.target.value }))} placeholder="https://..." className="rounded-xl" />
              </div>
            </div>

            {/* Dates */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">Date début</Label>
                <Input type="datetime-local" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} className="rounded-xl text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">Date fin</Label>
                <Input type="datetime-local" value={form.date_fin} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))} className="rounded-xl text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">Ordre affichage</Label>
                <Input type="number" value={form.ordre} onChange={e => setForm(p => ({ ...p, ordre: e.target.value }))} placeholder="0" className="rounded-xl" />
              </div>
            </div>

            {/* Couleurs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">Couleur de fond</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.couleur_fond} onChange={e => setForm(p => ({ ...p, couleur_fond: e.target.value }))} className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5" />
                  <Input value={form.couleur_fond} onChange={e => setForm(p => ({ ...p, couleur_fond: e.target.value }))} className="flex-1 rounded-xl font-mono text-xs" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">Couleur texte</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.couleur_texte} onChange={e => setForm(p => ({ ...p, couleur_texte: e.target.value }))} className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5" />
                  <Input value={form.couleur_texte} onChange={e => setForm(p => ({ ...p, couleur_texte: e.target.value }))} className="flex-1 rounded-xl font-mono text-xs" />
                </div>
              </div>
            </div>

            {/* Actif toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div>
                <p className="font-bold text-sm text-gray-900">Publicité active</p>
                <p className="text-xs text-gray-500">Visible immédiatement dans l'application</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, actif: !p.actif }))}
                className={`w-12 h-6 rounded-full transition-all ${form.actif ? "bg-green-500" : "bg-gray-300"}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${form.actif ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={resetForm} className="flex-1 rounded-xl">
                Annuler
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 gap-2">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingId ? "Enregistrer" : "Créer la publicité"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── FILTRES ── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterCible("tous_filtres")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterCible === "tous_filtres" ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          Toutes ({pubs.length})
        </button>
        {CIBLES.map(c => (
          <button
            key={c.value}
            onClick={() => setFilterCible(c.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterCible === c.value ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* ── LISTE DES PUBS ── */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
        </div>
      ) : pubsFiltered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">Aucune publicité</p>
          <p className="text-xs mt-1">Créez votre première publicité</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pubsFiltered.map(pub => {
            const isExpired = pub.date_fin && pub.date_fin < now;
            const isNotStarted = pub.date_debut && pub.date_debut > now;
            const taux = pub.nb_affichages > 0 ? ((pub.nb_clics / pub.nb_affichages) * 100).toFixed(1) : "0";
            const cibleInfo = CIBLES.find(c => c.value === pub.cible);

            return (
              <div key={pub.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isExpired ? "opacity-60 border-red-100" : pub.actif ? "border-gray-100 hover:shadow-md" : "border-gray-100 opacity-75"}`}>
                <div className="flex gap-3 p-4">
                  {/* Vignette */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: pub.couleur_fond || "#1a1a2e" }}>
                    {pub.media_url && pub.type_media === "image"
                      ? <img src={pub.media_url} alt={pub.titre} className="w-full h-full object-cover" />
                      : pub.media_url && pub.type_media === "video"
                      ? <Video className="w-6 h-6 text-white/70" />
                      : <Type className="w-6 h-6 text-white/70" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-gray-900 text-sm truncate">{pub.titre}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${cibleInfo?.color}`}>
                            {cibleInfo?.label || pub.cible}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${pub.format === "plein_ecran" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                            {pub.format === "plein_ecran" ? "📢 Plein écran" : "🎠 Carrousel"}
                          </span>
                        </div>
                        {pub.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{pub.description}</p>}
                        {pub.annonceur_nom && <p className="text-[10px] text-gray-400 mt-0.5">📍 {pub.annonceur_nom}</p>}
                      </div>

                      {/* Statut toggle */}
                      <button
                        onClick={() => toggleMutation.mutate({ id: pub.id, actif: pub.actif })}
                        className="flex-shrink-0"
                        title={pub.actif ? "Désactiver" : "Activer"}
                      >
                        {pub.actif
                          ? <ToggleRight className="w-7 h-7 text-green-500" />
                          : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                      </button>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-3 mt-2.5 flex-wrap">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Eye className="w-3.5 h-3.5 text-blue-400" />
                        <span className="font-bold text-gray-700">{(pub.nb_affichages || 0).toLocaleString()}</span> vues
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <MousePointerClick className="w-3.5 h-3.5 text-green-400" />
                        <span className="font-bold text-gray-700">{(pub.nb_clics || 0).toLocaleString()}</span> clics
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                        <span className="font-bold text-orange-600">{taux}%</span> CTR
                      </div>
                      {pub.type_media === "video" && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Video className="w-3.5 h-3.5 text-purple-400" />
                          <span className="font-bold text-gray-700">{(pub.nb_vues_video || 0)}</span> vidéos
                        </div>
                      )}
                    </div>

                    {/* Dates + statut */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {isExpired && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">⏰ Expirée</span>}
                      {isNotStarted && <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">🕐 Pas encore démarrée</span>}
                      {!pub.actif && !isExpired && <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">⏸ Désactivée</span>}
                      {pub.date_fin && !isExpired && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Expire le {format(new Date(pub.date_fin), "dd/MM/yyyy", { locale: fr })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex border-t border-gray-50">
                  <button onClick={() => handleEdit(pub)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Modifier
                  </button>
                  <div className="w-px bg-gray-100" />
                  <button
                    onClick={() => { if (window.confirm("Supprimer cette publicité ?")) deleteMutation.mutate(pub.id); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Architecture ciblage futur */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-4">
        <p className="text-xs font-black text-indigo-700 uppercase tracking-widest mb-2">🔮 Intelligence Publicitaire (Architecture préparée)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            "📍 Ciblage par quartier",
            "🕐 Ciblage horaire",
            "👤 Ciblage comportemental",
            "🤖 Recommandations IA SILGAPP",
          ].map(f => (
            <div key={f} className="bg-white/60 rounded-xl p-2.5 text-xs text-indigo-700 font-semibold text-center border border-indigo-100/50">{f}</div>
          ))}
        </div>
        <p className="text-[10px] text-indigo-500 mt-2 text-center">Les champs <code>ciblage_quartiers</code> et <code>ciblage_heures</code> sont déjà en base de données</p>
      </div>
    </div>
  );
}