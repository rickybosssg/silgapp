import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Check, Loader2, MapPin, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { normalizeLocationText } from "@/lib/locationSearchCore";
import { haversineKm } from "@/lib/priceEstimate";
import MapPickerModal from "@/components/admin/MapPickerModal";

const CATEGORIES = [
  { value: "commerce", label: "Commerce / Boutique" },
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

export default function AddLieuDialog({ open, onClose, countryCode, initialName, onCreated }) {
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState("commerce");
  const [quartier, setQuartier] = useState("");
  const [ville, setVille] = useState("");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [aliases, setAliases] = useState("");
  const [precisionGps, setPrecisionGps] = useState("exacte");
  const [duplicates, setDuplicates] = useState([]);
  const [creating, setCreating] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  useEffect(() => {
    if (open && initialName) setNom(initialName.trim());
  }, [open, initialName]);

  // Anti-doublon : recherche par nom normalisé + aliases + proximité GPS
  useEffect(() => {
    if (!open || !nom || nom.trim().length < 2 || !countryCode) {
      setDuplicates([]);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingDuplicates(true);
      try {
        const existing = await base44.entities.LieuSilgapp.filter(
          { country_code: countryCode, statut: "actif" }, "nom", 200
        );
        const normalizedNom = normalizeLocationText(nom);
        const dupeList = (existing || []).filter((l) => {
          const existingName = normalizeLocationText(l.nom);
          if (existingName === normalizedNom) return true;
          let aliasList = [];
          try { aliasList = JSON.parse(l.aliases || "[]"); } catch { aliasList = []; }
          if (aliasList.some((a) => normalizeLocationText(a) === normalizedNom)) return true;
          if (latitude && longitude && l.latitude && l.longitude) {
            const dist = haversineKm(latitude, longitude, l.latitude, l.longitude);
            if (dist < 0.05) return true;
          }
          return false;
        });
        setDuplicates(dupeList);
      } catch (err) {
        console.error("[AddLieuDialog] Anti-doublon error:", err);
      } finally {
        setCheckingDuplicates(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [open, nom, latitude, longitude, countryCode]);

  const handleMapSelect = (lat, lng) => {
    setLatitude(lat);
    setLongitude(lng);
    setPrecisionGps("exacte");
  };

  const handleUseQuartierGps = async () => {
    if (!quartier) { toast.error("Saisissez d'abord un quartier"); return; }
    try {
      const qu = await base44.entities.Quartier.filter(
        { country_code: countryCode, actif: true, nom: quartier }, undefined, 1
      );
      if (qu?.[0]?.latitude && qu?.[0]?.longitude) {
        setLatitude(qu[0].latitude);
        setLongitude(qu[0].longitude);
        setPrecisionGps("approximative");
        toast.info("GPS du quartier utilisé (approximatif)");
      } else {
        toast.error("Quartier introuvable dans la base");
      }
    } catch {
      toast.error("Erreur lors de la récupération du quartier");
    }
  };

  const handleCreate = async () => {
    if (!nom.trim()) { toast.error("Le nom est obligatoire"); return; }
    if (!latitude || !longitude) { toast.error("Positionnez le lieu sur la carte"); return; }
    setCreating(true);
    try {
      const aliasArray = aliases.split(",").map((a) => a.trim()).filter(Boolean);
      const lieu = await base44.entities.LieuSilgapp.create({
        nom: nom.trim(),
        aliases: JSON.stringify(aliasArray),
        categorie,
        adresse: [quartier, ville].filter(Boolean).join(", "),
        quartier: quartier.trim(),
        ville: ville.trim(),
        country_code: countryCode,
        latitude,
        longitude,
        precision_gps: precisionGps,
        source: "admin",
        statut: "actif",
        nombre_utilisations: 0,
        valide_par: null,
        valide_at: new Date().toISOString(),
      });
      toast.success(`Lieu « ${nom.trim()} » créé avec succès`);
      onCreated?.(lieu);
      setNom(""); setQuartier(""); setVille(""); setLatitude(null); setLongitude(null);
      setAliases(""); setDuplicates([]);
    } catch (err) {
      console.error("[AddLieuDialog] Create error:", err);
      toast.error("Erreur lors de la création: " + (err?.message || "inconnue"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              Ajouter un lieu
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-gray-600">Nom de l'établissement *</Label>
              <Input value={nom} onChange={(e) => setNom(e.target.value)}
                placeholder="Ex: Plastica Home Textiles et Deco" className="mt-1" />
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-600">Catégorie</Label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-600">Aliases (variantes de nom, séparés par virgules)</Label>
              <Input value={aliases} onChange={(e) => setAliases(e.target.value)}
                placeholder="Ex: plastica, plastica home, plastic home" className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-gray-600">Quartier</Label>
                <Input value={quartier} onChange={(e) => setQuartier(e.target.value)}
                  placeholder="Ex: Gounghin" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-600">Ville</Label>
                <Input value={ville} onChange={(e) => setVille(e.target.value)}
                  placeholder="Ex: Ouagadougou" className="mt-1" />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-600">Position GPS</p>
                  {latitude && longitude ? (
                    <p className="text-[11px] text-gray-500">
                      📍 {latitude.toFixed(5)}, {longitude.toFixed(5)}
                      {precisionGps === "approximative" && (
                        <span className="ml-2 text-amber-600 font-semibold">(approximatif)</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400">Non positionné</p>
                  )}
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setMapOpen(true)}>
                  <MapPin className="w-3.5 h-3.5 mr-1" /> Carte
                </Button>
              </div>
              <button type="button" onClick={handleUseQuartierGps}
                className="text-[11px] text-gray-500 underline hover:text-gray-700">
                Utiliser le GPS du quartier (approximatif)
              </button>
            </div>

            {checkingDuplicates && (
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Recherche de doublons...
              </p>
            )}

            {duplicates.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-700">
                      Doublon probable détecté ({duplicates.length})
                    </p>
                    {duplicates.map((d) => (
                      <div key={d.id} className="mt-1 text-[11px] text-amber-600">
                        <span className="font-semibold">{d.nom}</span>
                        {d.quartier ? ` — ${d.quartier}` : ""}
                        {d.precision_gps === "exacte" ? " (GPS exact)" : " (GPS approximatif)"}
                      </div>
                    ))}
                    <p className="mt-1 text-[10px] text-amber-500">
                      Vous pouvez continuer ou annuler.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={handleCreate}
              disabled={creating || !nom.trim() || !latitude || !longitude}
              className="gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Créer le lieu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MapPickerModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        countryCode={countryCode}
        initialLat={latitude}
        initialLng={longitude}
        label="Positionner le lieu"
        onSelect={handleMapSelect}
      />
    </>
  );
}