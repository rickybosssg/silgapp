import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, MapPin, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import SmartAddressPicker from "@/components/crm/SmartAddressPicker";
import MapPickerModal from "@/components/admin/MapPickerModal";
import ClientPhoneDetector from "@/components/crm/ClientPhoneDetector";
import { resolveGpsFromSelection } from "@/lib/resolveGpsFromSelection";
import { validateLocalPhone } from "@/lib/phoneUtils";
import { calculerPrixApproximatif } from "@/lib/priceEstimate";

const TYPE_OPTIONS = [
  { key: "expedier", label: "Expédition", icon: "📦", desc: "Envoyer un colis" },
  { key: "recevoir", label: "Réception", icon: "📥", desc: "Récupérer un colis" },
  { key: "deplacement", label: "Déplacement", icon: "👤", desc: "Transport personne" },
];

function generarQRData() {
  const pickupQrToken = crypto.randomUUID().replace(/-/g, "");
  const deliveryQrToken = crypto.randomUUID().replace(/-/g, "");
  const pickupCode4 = String(Math.floor(1000 + Math.random() * 9000));
  const deliveryCode4 = String(Math.floor(1000 + Math.random() * 9000));
  return { pickupQrToken, deliveryQrToken, pickupCode4, deliveryCode4 };
}

export default function CourseCreateTab({ enterprise, onCreated }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [typeCourse, setTypeCourse] = useState("expedier");
  const [clientNom, setClientNom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [detectedClient, setDetectedClient] = useState(null);

  const [expediteurNom, setExpediteurNom] = useState("");
  const [expediteurTelephone, setExpediteurTelephone] = useState("");
  const [destinataireNom, setDestinataireNom] = useState("");
  const [destinataireTelephone, setDestinataireTelephone] = useState("");

  const [adresseDepart, setAdresseDepart] = useState("");
  const [adresseArrivee, setAdresseArrivee] = useState("");
  const [quartierDepart, setQuartierDepart] = useState("");
  const [quartierArrivee, setQuartierArrivee] = useState("");
  const [gpsDepart, setGpsDepart] = useState(null);
  const [gpsArrivee, setGpsArrivee] = useState(null);
  const [gpsDepartSource, setGpsDepartSource] = useState(null);
  const [gpsArriveeSource, setGpsArriveeSource] = useState(null);

  const [mapModal, setMapModal] = useState(null);
  const [typeColis, setTypeColis] = useState("petit_colis");
  const [notes, setNotes] = useState("");
  const [prixApproximatif, setPrixApproximatif] = useState(null);
  const [prixProposeAdmin, setPrixProposeAdmin] = useState("");

  const countryCode = enterprise?.country_code || "BF";

  // ── Calcul du prix approximatif quand les GPS sont disponibles ──
  useEffect(() => {
    if (gpsDepart && gpsArrivee) {
      calculerPrixApproximatif(gpsDepart.lat, gpsDepart.lng, gpsArrivee.lat, gpsArrivee.lng, countryCode)
        .then(setPrixApproximatif)
        .catch(() => setPrixApproximatif(null));
    } else {
      setPrixApproximatif(null);
    }
  }, [gpsDepart, gpsArrivee, countryCode]);

  const resetForm = useCallback(() => {
    setTypeCourse("expedier");
    setClientNom("");
    setClientTelephone("");
    setDetectedClient(null);
    setExpediteurNom("");
    setExpediteurTelephone("");
    setDestinataireNom("");
    setDestinataireTelephone("");
    setAdresseDepart("");
    setAdresseArrivee("");
    setQuartierDepart("");
    setQuartierArrivee("");
    setGpsDepart(null);
    setGpsArrivee(null);
    setGpsDepartSource(null);
    setGpsArriveeSource(null);
    setTypeColis("petit_colis");
    setNotes("");
    setPrixApproximatif(null);
    setPrixProposeAdmin("");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // ── Validation ──
    if (!clientNom.trim()) { setError("Le nom du client est obligatoire"); return; }
    if (!clientTelephone.trim()) { setError("Le téléphone du client est obligatoire"); return; }
    const phoneValidation = validateLocalPhone(clientTelephone, countryCode);
    if (!phoneValidation.valid) { setError(`Téléphone invalide: ${phoneValidation.error}`); return; }
    if (!adresseDepart.trim()) { setError("L'adresse de départ est obligatoire"); return; }
    if (!adresseArrivee.trim()) { setError("L'adresse d'arrivée est obligatoire"); return; }

    setSubmitting(true);
    try {
      const qr = generarQRData();
      const requestId = crypto.randomUUID();

      const payload = {
        request_id: requestId,
        source: "admin",
        country_code: countryCode,
        type_course: typeCourse,
        client_nom: clientNom.trim(),
        client_telephone: clientTelephone.trim(),
        expediteur_nom: expediteurNom || undefined,
        expediteur_telephone: expediteurTelephone || undefined,
        destinataire_nom: destinataireNom || undefined,
        destinataire_telephone: destinataireTelephone || undefined,
        adresse_depart: adresseDepart,
        adresse_arrivee: adresseArrivee,
        quartier_depart: quartierDepart || undefined,
        quartier_arrivee: quartierArrivee || undefined,
        gps_depart_lat: gpsDepart?.lat,
        gps_depart_lng: gpsDepart?.lng,
        gps_arrivee_lat: gpsArrivee?.lat,
        gps_arrivee_lng: gpsArrivee?.lng,
        gps_depart_source: gpsDepartSource || undefined,
        gps_arrivee_source: gpsArriveeSource || undefined,
        type_colis: typeColis,
        notes: notes || undefined,
        prix_propose_admin: prixProposeAdmin ? Number(prixProposeAdmin) : undefined,
        pickup_qr_token: qr.pickupQrToken,
        delivery_qr_token: qr.deliveryQrToken,
        pickup_code_4_digits: qr.pickupCode4,
        delivery_code_4_digits: qr.deliveryCode4,
      };

      await base44.functions.invoke("creerCourseEnterprise", payload);
      toast.success("Course créée avec succès");
      resetForm();
      onCreated?.();
    } catch (err) {
      setError(err?.message || "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ── Type de course ── */}
      <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Type de course</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTypeCourse(opt.key)}
              className={`p-3 rounded-xl border-2 transition-all text-center ${
                typeCourse === opt.key
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <span className="block text-xl mb-1">{opt.icon}</span>
              <span className="block text-xs font-bold">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Client ── */}
      <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-gradient-to-b from-emerald-500 to-emerald-600 rounded-full" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Client</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Nom du client *</Label>
            <Input
              value={clientNom}
              onChange={(e) => setClientNom(e.target.value)}
              placeholder="Nom"
              className="mt-1 rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm"
              required
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Téléphone *</Label>
            <Input
              type="tel"
              value={clientTelephone}
              onChange={(e) => setClientTelephone(e.target.value)}
              placeholder="+226 XX XX XX XX"
              className="mt-1 rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm"
              required
            />
          </div>
        </div>
        <ClientPhoneDetector
          phone={clientTelephone}
          countryCode={countryCode}
          onClientFound={setDetectedClient}
          onClientName={(nom, prenom) => {
            if (!clientNom || clientNom.trim() === "") {
              const nomComplet = prenom ? `${prenom} ${nom}`.trim() : nom;
              if (nomComplet) setClientNom(nomComplet);
            }
          }}
        />
      </div>

      {/* ── Itinéraire ── */}
      <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-gradient-to-b from-orange-500 to-amber-500 rounded-full" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Itinéraire</p>
        </div>

        {/* Départ */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-gray-600 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
              Point de départ
            </span>
            {gpsDepart && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Check className="w-3 h-3" /> GPS
              </span>
            )}
          </div>
          <SmartAddressPicker
            client={detectedClient}
            role="depart"
            value={adresseDepart}
            onChange={(text) => { setAdresseDepart(text); setGpsDepart(null); setGpsDepartSource(null); }}
            onSelect={async (r) => {
              if (r?.latitude && r?.longitude) {
                const resolved = await resolveGpsFromSelection(r, countryCode);
                if (resolved) {
                  setGpsDepart({ lat: resolved.lat, lng: resolved.lng });
                  setGpsDepartSource(resolved.source);
                  if (resolved.quartier) setQuartierDepart(resolved.quartier);
                }
              }
            }}
            countryCode={countryCode}
            placeholder="Ex: Ouaga 2000, face à la mairie"
            iconColor="text-emerald-500"
            inputClassName="rounded-xl h-11 pl-10 pr-24 bg-blue-50 border-blue-200/60 text-sm"
          >
            <button
              type="button"
              onClick={() => setMapModal("depart")}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold flex items-center gap-1"
            >
              <MapPin className="w-3 h-3" /> Carte
            </button>
          </SmartAddressPicker>
        </div>

        {/* Arrivée */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-gray-600 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100" />
              Destination
            </span>
            {gpsArrivee && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Check className="w-3 h-3" /> GPS
              </span>
            )}
          </div>
          <SmartAddressPicker
            client={detectedClient}
            role="arrivee"
            value={adresseArrivee}
            onChange={(text) => { setAdresseArrivee(text); setGpsArrivee(null); setGpsArriveeSource(null); }}
            onSelect={async (r) => {
              if (r?.latitude && r?.longitude) {
                const resolved = await resolveGpsFromSelection(r, countryCode);
                if (resolved) {
                  setGpsArrivee({ lat: resolved.lat, lng: resolved.lng });
                  setGpsArriveeSource(resolved.source);
                  if (resolved.quartier) setQuartierArrivee(resolved.quartier);
                }
              }
            }}
            countryCode={countryCode}
            placeholder="Ex: Gounghin, près du marché"
            iconColor="text-rose-500"
            inputClassName="rounded-xl h-11 pl-10 pr-24 bg-blue-50 border-blue-200/60 text-sm"
          >
            <button
              type="button"
              onClick={() => setMapModal("arrivee")}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold flex items-center gap-1"
            >
              <MapPin className="w-3 h-3" /> Carte
            </button>
          </SmartAddressPicker>
        </div>
      </div>

      {/* ── Détails ── */}
      <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-gradient-to-b from-purple-500 to-purple-600 rounded-full" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Détails</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Type de colis</Label>
            <Select value={typeColis} onValueChange={setTypeColis}>
              <SelectTrigger className="mt-1 h-11 rounded-xl bg-blue-50 border-blue-200/60 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="petit_colis">Petit colis</SelectItem>
                <SelectItem value="moyen_colis">Moyen colis</SelectItem>
                <SelectItem value="gros_colis">Gros colis</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="nourriture">Nourriture</SelectItem>
                <SelectItem value="autre">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Prix proposé (FCFA)</Label>
            <Input
              type="number"
              value={prixProposeAdmin}
              onChange={(e) => setPrixProposeAdmin(e.target.value)}
              placeholder={prixApproximatif ? `≈ ${prixApproximatif.toLocaleString("fr-FR")}` : "Auto"}
              className="mt-1 rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm"
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instructions particulières..."
            className="mt-1 rounded-xl h-11 bg-gray-50 border-gray-200/50 text-sm"
          />
        </div>
      </div>

      {/* ── Récapitulatif ── */}
      {gpsDepart && gpsArrivee && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 space-y-2">
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Récapitulatif</p>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="truncate flex-1">{adresseDepart || "—"}</span>
            <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="truncate flex-1 text-right">{adresseArrivee || "—"}</span>
          </div>
          {prixApproximatif && !prixProposeAdmin && (
            <p className="text-xs text-blue-600 font-semibold">Prix estimé: {prixApproximatif.toLocaleString("fr-FR")} FCFA</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <Button type="submit" disabled={submitting} className="w-full h-12 rounded-xl text-sm font-bold">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {submitting ? "Création..." : "Créer la course"}
      </Button>
      <p className="text-[10px] text-gray-400 text-center">
        L'agence sera automatiquement rattachée. Dispatch V2 prendra le relais.
      </p>

      {/* ── MapPickerModal ── */}
      <MapPickerModal
        open={mapModal !== null}
        onClose={() => setMapModal(null)}
        onSelect={(lat, lng) => {
          if (mapModal === "depart") {
            setGpsDepart({ lat, lng });
            setGpsDepartSource("exact");
          } else if (mapModal === "arrivee") {
            setGpsArrivee({ lat, lng });
            setGpsArriveeSource("exact");
          }
          setMapModal(null);
        }}
        countryCode={countryCode}
        initialLat={mapModal === "depart" ? gpsDepart?.lat : gpsArrivee?.lat}
        initialLng={mapModal === "depart" ? gpsDepart?.lng : gpsArrivee?.lng}
        label={mapModal === "depart" ? "Point de départ" : "Destination"}
      />
    </form>
  );
}