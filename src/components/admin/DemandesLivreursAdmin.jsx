import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2, CheckCircle, XCircle, Phone, User, MapPin, FileText, IdCard,
  Camera, Car, Eye, ZoomIn, Download, AlertTriangle, Clock, ChevronLeft, ChevronRight, X
} from "lucide-react";

/* ─── Mini zoom modal pour les images ─── */
function ImageZoomModal({ src, alt, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center hover:bg-white/20 z-10"
        onClick={onClose}><X className="w-5 h-5" /></button>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <img src={src} alt={alt || "Document"} className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
        <div className="absolute bottom-3 right-3 flex gap-2">
          <a href={src} download target="_blank" rel="noreferrer"
            className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center hover:bg-white/30">
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── Document status badge ─── */
function DocBadge({ url, label, icon: Icon, color }) {
  const present = !!url;
  return (
    <button
      disabled={!present}
      onClick={() => present && window.open(url, '_blank')}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${present
        ? `${color.bg} ${color.border} ${color.text} hover:opacity-80 cursor-pointer`
        : "bg-gray-50 border-gray-200 text-gray-400 cursor-default"
      }`}
    >
      {present ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-gray-400" />}
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      <span className="ml-auto text-xs">{present ? "✅ Reçu" : "❌ Manquant"}</span>
    </button>
  );
}

/* ─── Modal détaillé d'un livreur ─── */
function LivreurDetailModal({ livreur, onClose, onValider, onRefuser, processing }) {
  const [zoomSrc, setZoomSrc] = useState(null);
  const [showRefusForm, setShowRefusForm] = useState(false);
  const [motifRefus, setMotifRefus] = useState("");

  const docsOk = !!livreur.photo_url && !!livreur.photo_cnib_recto_url && !!livreur.photo_cnib_verso_url;
  const docsManquants = [];
  if (!livreur.photo_url) docsManquants.push("Photo du livreur");
  if (!livreur.photo_cnib_recto_url) docsManquants.push("CNIB Recto");
  if (!livreur.photo_cnib_verso_url) docsManquants.push("CNIB Verso");

  return (
    <>
      {zoomSrc && <ImageZoomModal src={zoomSrc} alt="Document" onClose={() => setZoomSrc(null)} />}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
        <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="p-5 border-b flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              {livreur.photo_url ? (
                <img src={livreur.photo_url} alt="" className="w-12 h-12 rounded-xl object-cover ring-2 ring-white/20" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-white/60" />
                </div>
              )}
              <div>
                <p className="text-white font-black text-lg">{livreur.prenom || ""} {livreur.nom}</p>
                <p className="text-white/50 text-xs">{livreur.country_code || "N/A"} · {livreur.ville || "N/A"}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="text-white/60 hover:text-white" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Body scrollable */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Infos principales */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <InfoTile icon={Phone} label="Téléphone" value={livreur.telephone || "N/A"} />
              <InfoTile icon={MapPin} label="Ville" value={livreur.ville || "N/A"} />
              <InfoTile icon={MapPin} label="Quartier" value={livreur.quartier || "N/A"} />
              <InfoTile icon={Car} label="Véhicule" value={livreur.type_vehicule || livreur.vehicule || "N/A"} />
              <InfoTile icon={IdCard} label="N° Plaque" value={livreur.numero_plaque || "N/A"} />
              <InfoTile icon={Clock} label="Demande" value={new Date(livreur.created_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} />
            </div>

            {/* Statut documents */}
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Vérification des documents</p>
              <div className={`rounded-xl p-3 mb-2 text-sm font-semibold ${docsOk ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                {docsOk ? "✅ Tous les documents requis sont présents" : `⚠️ ${docsManquants.length} document(s) manquant(s) : ${docsManquants.join(", ")}`}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DocBadge url={livreur.photo_url} label="Photo livreur" icon={Camera}
                  color={{ bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" }} />
                <DocBadge url={livreur.photo_cnib_recto_url} label="CNIB Recto" icon={FileText}
                  color={{ bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700" }} />
                <DocBadge url={livreur.photo_cnib_verso_url} label="CNIB Verso" icon={FileText}
                  color={{ bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" }} />
                <DocBadge url={livreur.photo_moto_url} label="Photo Moto" icon={Car}
                  color={{ bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" }} />
              </div>
            </div>

            {/* Prévisualisation rapide */}
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Prévisualisation</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { url: livreur.photo_url, label: "Photo", icon: Camera },
                  { url: livreur.photo_cnib_recto_url, label: "CNIB Recto", icon: FileText },
                  { url: livreur.photo_cnib_verso_url, label: "CNIB Verso", icon: FileText },
                  { url: livreur.photo_moto_url, label: "Moto", icon: Car },
                ].filter(d => d.url).map((doc, i) => (
                  <button key={i}
                    onClick={() => setZoomSrc(doc.url)}
                    className="relative group rounded-xl overflow-hidden bg-gray-100 aspect-square">
                    <img src={doc.url} alt={doc.label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="absolute bottom-1 left-1 text-[10px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded-md">{doc.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Historique */}
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">Historique</p>
              {livreur.valide_at ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl p-2.5">
                  <CheckCircle className="w-4 h-4" />
                  <span>Validé le {new Date(livreur.valide_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}{livreur.valide_par ? ` par ${livreur.valide_par}` : ""}</span>
                </div>
              ) : livreur.refuse_at ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-xl p-2.5">
                    <XCircle className="w-4 h-4" />
                    <span>Refusé le {new Date(livreur.refuse_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}{livreur.refuse_par ? ` par ${livreur.refuse_par}` : ""}</span>
                  </div>
                  {livreur.motif_refus && (
                    <p className="text-xs text-red-600 ml-7">Motif : {livreur.motif_refus}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">En attente de traitement</p>
              )}
            </div>

            {/* Formulaire refus */}
            {showRefusForm && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-bold text-red-700">Motif du refus <span className="text-red-400 font-normal">(optionnel)</span></p>
                <Textarea
                  placeholder="Ex: Documents illisibles, informations incomplètes..."
                  value={motifRefus}
                  onChange={(e) => setMotifRefus(e.target.value)}
                  className="rounded-xl border-red-200 min-h-[70px] text-sm"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setShowRefusForm(false); setMotifRefus(""); }}>
                    Annuler
                  </Button>
                  <Button size="sm" className="rounded-xl bg-red-500 hover:bg-red-600 text-white" onClick={() => {
                    onRefuser(livreur, motifRefus);
                    setShowRefusForm(false);
                    setMotifRefus("");
                  }}>
                    Confirmer le refus
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          {livreur.validation === "en_attente" && !showRefusForm && (
            <div className="p-4 border-t bg-gray-50 shrink-0 grid grid-cols-2 gap-3">
              <Button
                onClick={() => onValider(livreur)}
                disabled={processing === livreur.id}
                className="h-12 rounded-xl bg-gradient-to-r from-green-500 to-green-700 text-white font-bold shadow-md">
                {processing === livreur.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4" /> VALIDER LE LIVREUR</>}
              </Button>
              <Button
                onClick={() => setShowRefusForm(true)}
                disabled={processing === livreur.id}
                variant="outline"
                className="h-12 rounded-xl border-red-300 text-red-600 font-bold hover:bg-red-50">
                <XCircle className="w-4 h-4" /> REFUSER
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function InfoTile({ icon: IconComp, label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="flex items-center gap-1.5 mb-1">
        <IconComp className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[10px] text-gray-500 uppercase font-semibold">{label}</span>
      </div>
      <p className="text-sm font-bold text-gray-800 truncate">{value}</p>
    </div>
  );
}

/* ─── Composant principal ─── */
export default function DemandesLivreursAdmin() {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(null);
  const [selected, setSelected] = useState(null); // livreur sélectionné dans le modal

  const { data: demandes, isLoading } = useQuery({
    queryKey: ["demandes_livreurs"],
    queryFn: () => base44.entities.Livreur.filter({ validation: "en_attente", type_livreur: "externe" }, "-created_date"),
    refetchInterval: 30000,
  });

  const handleValider = async (livreur) => {
    setProcessing(livreur.id);
    try {
      const user = await base44.auth.me();
      await base44.entities.Livreur.update(livreur.id, {
        validation: "valide",
        valide_par: user?.email || "admin",
        valide_at: new Date().toISOString(),
        actif: true,
        statut: "hors_ligne",
      });
      toast.success(`${livreur.prenom || ""} ${livreur.nom} validé avec succès`);
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["demandes_livreurs"] });
      queryClient.invalidateQueries({ queryKey: ["demandes_livreurs_count"] });
    } catch (err) {
      toast.error(err?.message || "Erreur de validation");
    } finally {
      setProcessing(null);
    }
  };

  const handleRefuser = async (livreur, motif) => {
    setProcessing(livreur.id);
    try {
      const user = await base44.auth.me();
      await base44.entities.Livreur.update(livreur.id, {
        validation: "refuse",
        refuse_par: user?.email || "admin",
        refuse_at: new Date().toISOString(),
        motif_refus: motif || null,
        actif: false,
      });
      toast.success(`${livreur.prenom || ""} ${livreur.nom} refusé`);
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["demandes_livreurs"] });
      queryClient.invalidateQueries({ queryKey: ["demandes_livreurs_count"] });
    } catch (err) {
      toast.error(err?.message || "Erreur de refus");
    } finally {
      setProcessing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {selected && (
        <LivreurDetailModal
          livreur={selected}
          onClose={() => setSelected(null)}
          onValider={handleValider}
          onRefuser={handleRefuser}
          processing={processing}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-foreground">Demandes livreurs</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {demandes?.length || 0} demande{(demandes?.length || 0) !== 1 ? "s" : ""} en attente
            </p>
          </div>
          <Badge className="bg-secondary text-secondary-foreground px-3 py-1.5 text-sm font-bold">
            {demandes?.length || 0} en attente
          </Badge>
        </div>

        {!demandes || demandes.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-accent" />
            </div>
            <p className="text-lg font-bold text-foreground">Aucune demande en attente</p>
            <p className="text-sm text-muted-foreground mt-1">Toutes les demandes ont été traitées.</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {demandes.map((livreur) => (
              <Card key={livreur.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  <div className="p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        {livreur.photo_url ? (
                          <img src={livreur.photo_url} alt="" className="w-14 h-14 rounded-2xl object-cover cursor-pointer hover:opacity-80"
                            onClick={() => setSelected(livreur)} />
                        ) : (
                          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center cursor-pointer"
                            onClick={() => setSelected(livreur)}>
                            <User className="w-7 h-7 text-primary" />
                          </div>
                        )}
                        <div>
                          <p className="font-black text-lg text-foreground">
                            {livreur.prenom || ""} {livreur.nom}
                          </p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                            <Phone className="w-3.5 h-3.5" /> {livreur.telephone || "N/A"}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                            <MapPin className="w-3.5 h-3.5" /> {livreur.ville || ""} - {livreur.quartier || "N/A"}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-secondary/10 text-secondary border-secondary/20">
                        {livreur.country_code || "BF"}
                      </Badge>
                    </div>

                    {/* Récap docs rapide */}
                    <div className="flex items-center gap-3 text-xs">
                      <DocMiniStatus url={livreur.photo_url} label="Photo" />
                      <DocMiniStatus url={livreur.photo_cnib_recto_url} label="CNIB R°" />
                      <DocMiniStatus url={livreur.photo_cnib_verso_url} label="CNIB V°" />
                      <DocMiniStatus url={livreur.photo_moto_url} label="Moto" />
                    </div>

                    {/* Date + boutons */}
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-muted-foreground">
                        {new Date(livreur.created_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl text-sm"
                          onClick={() => setSelected(livreur)}>
                          <Eye className="w-3.5 h-3.5 mr-1" /> Voir le dossier
                        </Button>
                        <Button size="sm" className="rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm"
                          onClick={() => handleValider(livreur)}
                          disabled={processing === livreur.id}>
                          {processing === livreur.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                          Valider
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl border-red-300 text-red-600 text-sm"
                          onClick={() => setSelected(livreur)}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Refuser
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DocMiniStatus({ url, label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${url ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
      {url ? "✅" : "❌"} {label}
    </span>
  );
}