import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin, Navigation, User, Package, ChevronDown, ChevronUp,
  CheckCircle, Loader2, Search
} from "lucide-react";
import ContactPickerButton from "@/components/client/ContactPickerButton";
import CarnetAdresses from "@/components/client/CarnetAdresses";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { phoneVariants } from "@/lib/phoneUtils";

const TYPE_COLIS_OPTIONS = [
  { value: "petit_colis", label: "Petit", icon: "", desc: "< 2 kg" },
  { value: "moyen_colis", label: "Moyen", icon: "", desc: "2-10 kg" },
  { value: "gros_colis", label: "Gros", icon: "", desc: "> 10 kg" },
  { value: "document", label: "Document", icon: "", desc: "Papiers" },
  { value: "nourriture", label: "Repas", icon: "", desc: "Alimentaire" },
  { value: "autre", label: "Autre", icon: "", desc: "Autre" },
];

const LETTER_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

export default function ColisDestinataireForm({
  index, // 0-based
  colisData, // objet du colis
  onChange, // (index, field, value) => void
  clientId,
  countryCode,
  savedLat,
  savedLng,
}) {
  const [expanded, setExpanded] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [destinataireFound, setDestinataireFound] = useState(undefined);
  const [gpsLoading, setGpsLoading] = useState(false);

  const uid = LETTER_IDS[index] || String(index + 1);
  const label = `Colis ${uid}`;

  const update = (field, value) => onChange(index, field, value);

  // Vérification SILGAPP
  const verifyDestinataire = async () => {
    const phone = (colisData.destinataire_telephone || "").replace(/\D/g, "");
    if (phone.length < 8) { toast.error("Numéro invalide"); return; }
    setVerifying(true);
    try {
      const variants = phoneVariants(phone);
      let clients = [];
      for (const v of variants) {
        const found = await base44.entities.ClientExterne.filter({ telephone: v, actif: true }).catch(() => []);
        if (found?.length > 0) { clients = found; break; }
      }
      if (clients.length > 0) {
        const client = clients[0];
        setDestinataireFound(client);
        const hasGps = !!(client.latitude && client.longitude);
        update("destinataire_nom", colisData.destinataire_nom || client.nom || client.prenom || "");
        update("destinataire_client_id", client.id);
        update("recipient_has_app", true);
        if (hasGps) {
          update("gps_livraison_lat", client.latitude);
          update("gps_livraison_lng", client.longitude);
          update("adresse_livraison", colisData.adresse_livraison || "Position GPS du destinataire");
        }
        toast.success(` ${client.nom || client.prenom} trouvé dans SILGAPP !`);
      } else {
        setDestinataireFound(null);
        update("destinataire_client_id", null);
        update("recipient_has_app", false);
        toast.info("ℹ Destinataire non trouvé dans SILGAPP");
      }
    } catch (_) {
      toast.error("Erreur lors de la vérification");
    } finally {
      setVerifying(false);
    }
  };

  // GPS pour ce colis
  const handleGetGPS = () => {
    setGpsLoading(true);
    const apply = async (lat, lng) => {
      update("gps_livraison_lat", lat);
      update("gps_livraison_lng", lng);
      if (!colisData.adresse_livraison) {
        try {
          const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`);
          const geo = await resp.json();
          const q = geo?.address?.suburb || geo?.address?.neighbourhood || geo?.address?.quarter || geo?.address?.village || "";
          if (q) update("adresse_livraison", q);
        } catch (_) {}
      }
      setGpsLoading(false);
      toast.success(" Position GPS récupérée !");
    };

    if (!navigator.geolocation) {
      if (savedLat && savedLng) { apply(savedLat, savedLng); return; }
      toast.error("GPS non disponible");
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => apply(pos.coords.latitude, pos.coords.longitude),
      () => {
        if (savedLat && savedLng) { apply(savedLat, savedLng); return; }
        toast.error("Position GPS indisponible");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const isComplete = !!(colisData.destinataire_telephone);
  const hasGPS = !!(colisData.gps_livraison_lat && colisData.gps_livraison_lng);

  return (
    <div className={`rounded-2xl border-2 transition-all ${isComplete ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-white"}`}>
      {/* Header accordéon */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${
          isComplete ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"
        }`}>
          {isComplete ? <CheckCircle className="w-4 h-4" /> : uid}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">{label}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {colisData.destinataire_nom
              ? `${colisData.destinataire_nom} · ${colisData.destinataire_telephone || "—"}`
              : colisData.destinataire_telephone
              ? colisData.destinataire_telephone
              : "À renseigner"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasGPS && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold"> GPS</span>}
          {colisData.recipient_has_app && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">SILGAPP</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
        </div>
      </button>

      {/* Corps du formulaire */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">

          {/* Nom destinataire */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
              <User className="w-3 h-3" /> Nom du destinataire
            </Label>
            <Input
              value={colisData.destinataire_nom || ""}
              onChange={(e) => update("destinataire_nom", e.target.value)}
              placeholder="Nom complet"
              className="h-12 rounded-xl border-2 border-gray-200 bg-gray-50 focus:bg-white text-sm"
            />
          </div>

          {/* Téléphone */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-gray-600">
              Téléphone <span className="text-red-500">*</span>
            </Label>
            <Input
              type="tel"
              value={colisData.destinataire_telephone || ""}
              onChange={(e) => {
                update("destinataire_telephone", e.target.value);
                setDestinataireFound(undefined);
              }}
              placeholder="+226 XX XX XX XX"
              className="h-12 rounded-xl border-2 border-gray-200 bg-gray-50 focus:bg-white text-sm"
            />
            {/* Actions contacts */}
            <div className="flex gap-2 flex-wrap">
              <CarnetAdresses
                clientId={clientId}
                type="destinataire"
                onSelect={(contact) => {
                  update("destinataire_nom", contact.nom || colisData.destinataire_nom || "");
                  update("destinataire_telephone", contact.telephone);
                  setDestinataireFound(undefined);
                }}
              />
              <ContactPickerButton
                countryCode={countryCode}
                onSelect={(contact) => {
                  update("destinataire_nom", contact.nom || colisData.destinataire_nom || "");
                  update("destinataire_telephone", contact.telephone);
                  setDestinataireFound(undefined);
                }}
              />
            </div>
            {/* Vérification SILGAPP */}
            <button
              type="button"
              onClick={verifyDestinataire}
              disabled={!colisData.destinataire_telephone || verifying}
              className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-xs shadow active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {verifying
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Recherche...</>
                : <><Search className="w-3.5 h-3.5" />Vérifier dans SILGAPP</>}
            </button>
            {destinataireFound && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-800 font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                {destinataireFound.nom || destinataireFound.prenom} est inscrit dans SILGAPP
              </div>
            )}
            {destinataireFound === null && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 font-semibold">
                ℹ Non inscrit — la course fonctionnera quand même
              </div>
            )}
          </div>

          {/* Adresse de livraison */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Adresse de livraison
            </Label>
            {hasGPS ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 border border-green-200">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-green-800 truncate">{colisData.adresse_livraison || "Position GPS"}</p>
                  <p className="text-[10px] text-green-600">
                    {Number(colisData.gps_livraison_lat).toFixed(4)}, {Number(colisData.gps_livraison_lng).toFixed(4)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { update("gps_livraison_lat", null); update("gps_livraison_lng", null); }}
                  className="text-[10px] text-green-700 bg-green-100 px-2 py-1 rounded-lg font-bold flex-shrink-0"
                >
                  Changer
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleGetGPS}
                  disabled={gpsLoading}
                  className="w-full h-10 rounded-xl border-2 border-dashed border-gray-300 text-gray-600 font-semibold text-xs flex items-center justify-center gap-1.5 hover:border-primary/40 hover:text-primary active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {gpsLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />GPS...</>
                    : <><Navigation className="w-3.5 h-3.5" />Utiliser ma position GPS</>}
                </button>
                <Input
                  value={colisData.adresse_livraison || ""}
                  onChange={(e) => update("adresse_livraison", e.target.value)}
                  placeholder="Quartier, rue, point de repère..."
                  className="h-12 rounded-xl border-2 border-gray-200 bg-gray-50 focus:bg-white text-sm"
                />
              </>
            )}
          </div>

          {/* Type de colis */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
              <Package className="w-3 h-3" /> Type de colis
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_COLIS_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update("type_colis", t.value)}
                  className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                    colisData.type_colis === t.value
                      ? "border-purple-400 bg-purple-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-xl">{t.icon}</div>
                  <div className="text-[10px] font-bold text-gray-800 mt-0.5">{t.label}</div>
                  <div className="text-[9px] text-gray-600">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">
              Description du colis <span className="text-gray-600 font-normal">(optionnel)</span>
            </Label>
            <Input
              value={colisData.description_colis || ""}
              onChange={(e) => update("description_colis", e.target.value)}
              placeholder="Ex: chemises, médicaments, documents..."
              className="h-12 rounded-xl border-2 border-gray-200 bg-gray-50 focus:bg-white text-sm"
            />
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-600">
              Instructions particulières <span className="text-gray-600 font-normal">(optionnel)</span>
            </Label>
            <Textarea
              value={colisData.instructions || ""}
              onChange={(e) => update("instructions", e.target.value)}
              placeholder="Code porte, étage, sonnette, précautions..."
              rows={2}
              className="rounded-xl border-2 border-gray-200 bg-gray-50 focus:bg-white text-sm resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
