import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Send, Loader2, Sparkles, Navigation, Check } from "lucide-react";
import { useAdminContext } from "@/hooks/useAdminContext";
import { useAdminCourseWindows } from "@/context/AdminCourseWindowsContext";
import QuartierSelect from "@/components/client/QuartierSelect";
import MapPickerModal from "@/components/admin/MapPickerModal";

function generarQRData() {
  const pickupQrToken = crypto.randomUUID().replace(/-/g, "");
  const deliveryQrToken = crypto.randomUUID().replace(/-/g, "");
  const pickupCode4 = String(Math.floor(1000 + Math.random() * 9000));
  const deliveryCode4 = String(Math.floor(1000 + Math.random() * 9000));
  return { pickupQrToken, deliveryQrToken, pickupCode4, deliveryCode4 };
}

const COUNTRY_DIAL_CODE = {
  BF: "226", CI: "225", TG: "228", BJ: "229", SN: "221",
  ML: "223", GN: "224", NE: "227", GH: "233",
};

function cleanPhone(phone, countryCode) {
  let digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";

  const dial = COUNTRY_DIAL_CODE[countryCode] || "226";

  // Déjà au format international (commence par l'indicatif)
  if (digits.startsWith(dial) && digits.length >= dial.length + 6) return digits;

  // Format local avec 0 initial → retirer le 0
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Ajouter l'indicatif pays si le numéro est court (format local)
  if (digits.length <= 9) return dial + digits;

  return digits;
}

function waLink(phone, message, countryCode) {
  const normalized = cleanPhone(phone, countryCode);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function buildTrackingUrl(token) {
  return `https://silga-dispatch-go.base44.app/suivi-public/${token}`;
}

function buildQrUrl(token) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(token)}`;
}

const SILGAPP_PLAYSTORE = "https://play.google.com/store/apps/details?id=com.base6a0ec08f3af5e1d1284254c1.app";
const SILGAPP_APPLE = "https://apps.apple.com/bf/app/silgapp/id6782046749?l=fr-FR";

const PAYS = [
  { code: "BF", nom: "Burkina Faso", drapeau: "🇧🇫" },
  { code: "CI", nom: "Côte d'Ivoire", drapeau: "🇨🇮" },
  { code: "TG", nom: "Togo", drapeau: "🇹🇬" },
  { code: "BJ", nom: "Bénin", drapeau: "🇧🇯" },
  { code: "SN", nom: "Sénégal", drapeau: "🇸🇳" },
  { code: "ML", nom: "Mali", drapeau: "🇲🇱" },
  { code: "GN", nom: "Guinée", drapeau: "🇬🇳" },
  { code: "NE", nom: "Niger", drapeau: "🇳🇪" },
  { code: "GH", nom: "Ghana", drapeau: "🇬🇭" },
];

const TYPE_OPTIONS = [
  { key: "expedier", label: "Expédition", icon: "📦", desc: "Envoyer un colis" },
  { key: "recevoir", label: "Réception", icon: "📥", desc: "Récupérer un colis" },
  { key: "deplacement", label: "Déplacement", icon: "👤", desc: "Transport personne" },
];

// ── Main form component ──
export default function AdminCourseForm() {
  const navigate = useNavigate();
  const { countryCode: adminCountryCode } = useAdminContext();
  const { addWindow } = useAdminCourseWindows();

  const [submitting, setSubmitting] = useState(false);

  const [typeCourse, setTypeCourse] = useState("expedier");
  const [adresseDepart, setAdresseDepart] = useState("");
  const [adresseArrivee, setAdresseArrivee] = useState("");
  const [countryCode, setCountryCode] = useState(adminCountryCode || "BF");

  const [clientNom, setClientNom] = useState("");
  const [clientPrenom, setClientPrenom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [expediteurNom, setExpediteurNom] = useState("");
  const [expediteurTelephone, setExpediteurTelephone] = useState("");
  const [destinataireNom, setDestinataireNom] = useState("");
  const [destinataireTelephone, setDestinataireTelephone] = useState("");
  const [typeColis, setTypeColis] = useState("petit_colis");
  const [notes, setNotes] = useState("");
  const [quartierDepart, setQuartierDepart] = useState("");
  const [quartierArrivee, setQuartierArrivee] = useState("");
  const [gpsDepart, setGpsDepart] = useState(null);
  const [gpsArrivee, setGpsArrivee] = useState(null);
  const [mapModal, setMapModal] = useState(null); // null | 'depart' | 'arrivee'

  const selectedPays = PAYS.find(p => p.code === countryCode);

  const resetForm = () => {
    setAdresseDepart("");
    setAdresseArrivee("");
    setQuartierDepart("");
    setQuartierArrivee("");
    setGpsDepart(null);
    setGpsArrivee(null);
    setClientNom("");
    setClientPrenom("");
    setClientTelephone("");
    setExpediteurNom("");
    setExpediteurTelephone("");
    setDestinataireNom("");
    setDestinataireTelephone("");
    setNotes("");
    setTypeColis("petit_colis");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { pickupQrToken, deliveryQrToken, pickupCode4, deliveryCode4 } = generarQRData();
      const trackingToken = crypto.randomUUID().replace(/-/g, "");
      const trackingLink = `https://silga-dispatch-go.base44.app/suivi-public/${trackingToken}`;

      const formData = {
        expediteurTelephone: expediteurTelephone.trim(),
        destinataireTelephone: destinataireTelephone.trim(),
        clientTelephone: clientTelephone.trim(),
        expediteurNom: expediteurNom.trim(),
        destinataireNom: destinataireNom.trim(),
        clientNom: clientNom.trim(),
      };

      const courseData = {
        country_code: countryCode,
        source: "admin",
        type_course: typeCourse,
        adresse_depart: adresseDepart.trim() || "—",
        adresse_arrivee: adresseArrivee.trim() || "—",
        quartier_depart: quartierDepart || null,
        quartier_arrivee: quartierArrivee || null,
        gps_depart_lat: gpsDepart?.lat || null,
        gps_depart_lng: gpsDepart?.lng || null,
        gps_arrivee_lat: gpsArrivee?.lat || null,
        gps_arrivee_lng: gpsArrivee?.lng || null,
        client_nom: clientNom.trim() || "Client",
        client_telephone: clientTelephone.trim() || "",
        expediteur_nom: expediteurNom.trim() || null,
        expediteur_telephone: expediteurTelephone.trim() || null,
        destinataire_nom: destinataireNom.trim() || null,
        destinataire_telephone: destinataireTelephone.trim() || null,
        type_colis: typeCourse === "deplacement" ? "autre" : typeColis,
        notes: notes.trim() || null,
        statut: "recherche_livreur",
        dispatch_status: "en_attente",
        pricing_mode: "admin_manuel",
        prix_estimate: 0,
        tracking_token: trackingToken,
        tracking_link: trackingLink,
        pickup_qr_token: pickupQrToken,
        pickup_code_4_digits: pickupCode4,
        delivery_qr_token: deliveryQrToken,
        delivery_code_4_digits: deliveryCode4,
        passager_nom: typeCourse === "deplacement" ? (clientNom.trim() || "Passager") : null,
        passager_telephone: typeCourse === "deplacement" ? (clientTelephone.trim() || null) : null,
        nb_passagers: typeCourse === "deplacement" ? 1 : null,
      };

      const course = await base44.entities.CourseExterne.create(courseData);

      // 📦 Pousser la course dans la pile de fenêtres persistantes
      addWindow(course, formData);
      toast.success("Course créée ! Fenêtre ajoutée à droite →");

      // Réinitialiser le formulaire pour permettre la création d'une autre course
      resetForm();
    } catch (err) {
      toast.error("Erreur création: " + (err?.message || "inconnue"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-orange-50/40 to-amber-50/30">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

        {/* Header Premium */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 via-red-600 to-orange-600 p-5 shadow-xl shadow-red-200/60">
          <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-bl from-amber-300/30 to-transparent rounded-bl-full" />
          <div className="absolute bottom-0 left-1/2 w-44 h-24 bg-gradient-to-t from-yellow-400/15 to-transparent rounded-t-full" />
          <div className="relative flex items-center gap-4">
            <Link to="/admin/externe">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 backdrop-blur-sm">
                <ArrowLeft className="w-4 h-4 text-white" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-300" />
                <h1 className="text-xl font-black text-white">Nouvelle course</h1>
              </div>
              <p className="text-xs text-white/70">Création manuelle administrateur</p>
            </div>
          </div>
        </div>

        {/* Type de course */}
        <div className="bg-white rounded-3xl border border-rose-100 shadow-md shadow-rose-50 overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-gradient-to-b from-rose-500 to-orange-500 rounded-full" />
              <p className="text-xs font-bold text-rose-400 uppercase tracking-widest">Type de course</p>
            </div>
          </div>
          <div className="px-5 pb-5">
            <div className="grid grid-cols-3 gap-2.5">
              {TYPE_OPTIONS.map(t => {
                const gradients = {
                  expedier: "from-rose-500 to-red-500",
                  recevoir: "from-amber-500 to-orange-500",
                  deplacement: "from-violet-500 to-purple-500",
                };
                const bgs = {
                  expedier: "from-rose-50 to-red-50",
                  recevoir: "from-amber-50 to-orange-50",
                  deplacement: "from-violet-50 to-purple-50",
                };
                const isActive = typeCourse === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTypeCourse(t.key)}
                    className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all duration-200 ${
                      isActive
                        ? `border-transparent bg-gradient-to-br ${bgs[t.key]} shadow-lg shadow-rose-100 scale-[1.03]`
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className={`text-2xl transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>{t.icon}</span>
                    <span className={`text-xs font-bold ${isActive ? "text-gray-900" : "text-gray-700"}`}>
                      {t.label}
                    </span>
                    <span className={`text-[10px] ${isActive ? "text-gray-500" : "text-gray-400"}`}>
                      {t.desc}
                    </span>
                    {isActive && (
                      <div className={`mt-0.5 w-6 h-1 rounded-full bg-gradient-to-r ${gradients[t.key]}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Détails */}
        <div className="bg-white rounded-3xl border border-orange-100 shadow-md shadow-orange-50/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-orange-500 to-amber-500 rounded-full" />
            <p className="text-xs font-bold text-orange-500 uppercase tracking-widest">Détails</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Pays</p>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="rounded-xl h-12 bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200/50 text-sm focus:ring-blue-300">
                <SelectValue>
                  {selectedPays ? `${selectedPays.drapeau}  ${selectedPays.nom}` : "Choisir un pays"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYS.map(p => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.drapeau}  {p.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Point de départ
              </p>
              {gpsDepart && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" /> GPS défini
                </span>
              )}
            </div>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
              <Input
                value={adresseDepart}
                onChange={e => setAdresseDepart(e.target.value)}
                placeholder="Ex: Ouaga 2000, face à la mairie"
                className="rounded-xl h-12 pl-10 pr-28 bg-emerald-50/40 border-emerald-100 text-sm focus:ring-emerald-300 focus:border-emerald-300"
              />
              <button
                type="button"
                onClick={() => setMapModal('depart')}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-semibold hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-200"
              >
                <Navigation className="w-3.5 h-3.5" />
                Localiser
              </button>
            </div>
          </div>

          <QuartierSelect
            countryCode={countryCode}
            value={quartierDepart}
            onChange={setQuartierDepart}
            placeholder="Quartier de récupération..."
            label="Quartier de récupération"
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Point d'arrivée
              </p>
              {gpsArrivee && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" /> GPS défini
                </span>
              )}
            </div>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500" />
              <Input
                value={adresseArrivee}
                onChange={e => setAdresseArrivee(e.target.value)}
                placeholder="Ex: Gounghin, derrière le marché"
                className="rounded-xl h-12 pl-10 pr-28 bg-rose-50/40 border-rose-100 text-sm focus:ring-rose-300 focus:border-rose-300"
              />
              <button
                type="button"
                onClick={() => setMapModal('arrivee')}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-semibold hover:bg-rose-600 transition-colors shadow-sm shadow-rose-200"
              >
                <Navigation className="w-3.5 h-3.5" />
                Localiser
              </button>
            </div>
          </div>

          <QuartierSelect
            countryCode={countryCode}
            value={quartierArrivee}
            onChange={setQuartierArrivee}
            placeholder="Quartier de livraison..."
            label="Quartier de livraison"
          />

          {typeCourse !== "deplacement" && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Type de colis</p>
              <Select value={typeColis} onValueChange={setTypeColis}>
                <SelectTrigger className="rounded-xl h-12 bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200/50 text-sm focus:ring-violet-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="petit_colis">📦  Petit colis</SelectItem>
                  <SelectItem value="moyen_colis">📦  Moyen colis</SelectItem>
                  <SelectItem value="gros_colis">📦  Gros colis</SelectItem>
                  <SelectItem value="document">📄  Document</SelectItem>
                  <SelectItem value="nourriture">🍽️  Nourriture</SelectItem>
                  <SelectItem value="autre">📋  Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Contacts */}
        <div className="bg-white rounded-3xl border border-sky-100 shadow-md shadow-sky-50/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-sky-500 to-blue-500 rounded-full" />
            <p className="text-xs font-bold text-sky-500 uppercase tracking-widest">Contacts</p>
            <span className="text-[10px] bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full font-medium">Optionnel</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-500 mb-1 font-medium">Nom du client</p>
              <Input
                value={clientNom}
                onChange={e => setClientNom(e.target.value)}
                placeholder="Nom"
                className="rounded-xl h-11 bg-sky-50/40 border-sky-100 text-sm focus:ring-sky-300 focus:border-sky-300"
              />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1 font-medium">Téléphone client</p>
              <Input
                value={clientTelephone}
                onChange={e => setClientTelephone(e.target.value)}
                placeholder="+226 XXXXXXXX"
                className="rounded-xl h-11 bg-sky-50/40 border-sky-100 text-sm focus:ring-sky-300 focus:border-sky-300"
              />
            </div>
          </div>

          {typeCourse === "recevoir" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-500 mb-1 font-medium">Expéditeur</p>
                <Input
                  value={expediteurNom}
                  onChange={e => setExpediteurNom(e.target.value)}
                  placeholder="Nom expéditeur"
                  className="rounded-xl h-11 bg-amber-50/40 border-amber-100 text-sm focus:ring-amber-300 focus:border-amber-300"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1 font-medium">Tél. expéditeur</p>
                <Input
                  value={expediteurTelephone}
                  onChange={e => setExpediteurTelephone(e.target.value)}
                  placeholder="+226 XXXXXXXX"
                  className="rounded-xl h-11 bg-amber-50/40 border-amber-100 text-sm focus:ring-amber-300 focus:border-amber-300"
                />
              </div>
            </div>
          ) : typeCourse === "expedier" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-500 mb-1 font-medium">Destinataire</p>
                <Input
                  value={destinataireNom}
                  onChange={e => setDestinataireNom(e.target.value)}
                  placeholder="Nom destinataire"
                  className="rounded-xl h-11 bg-teal-50/40 border-teal-100 text-sm focus:ring-teal-300 focus:border-teal-300"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1 font-medium">Tél. destinataire</p>
                <Input
                  value={destinataireTelephone}
                  onChange={e => setDestinataireTelephone(e.target.value)}
                  placeholder="+226 XXXXXXXX"
                  className="rounded-xl h-11 bg-teal-50/40 border-teal-100 text-sm focus:ring-teal-300 focus:border-teal-300"
                />
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] text-gray-500 mb-1 font-medium">Notes</p>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Instructions particulières..."
              className="rounded-xl h-11 bg-gray-50/60 border-gray-200 text-sm"
            />
          </div>
        </div>

        {/* Bouton Créer */}
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 rounded-2xl gap-2.5 font-bold text-base bg-gradient-to-r from-rose-600 via-red-600 to-orange-500 hover:from-rose-600/90 hover:to-orange-500/90 shadow-xl shadow-red-200/60 transition-all active:scale-[0.98] border border-white/10"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Création en cours...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Créer la course
            </>
          )}
        </Button>

        <p className="text-center text-[11px] text-gray-400 pb-6 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3 h-3 text-amber-400" />
          La course sera automatiquement proposée aux livreurs disponibles
        </p>
      </div>

      {/* Modals de sélection GPS */}
      <MapPickerModal
        open={mapModal === 'depart'}
        onClose={() => setMapModal(null)}
        countryCode={countryCode}
        initialLat={gpsDepart?.lat}
        initialLng={gpsDepart?.lng}
        label="Localiser le point de départ"
        onSelect={(lat, lng) => setGpsDepart({ lat, lng })}
      />
      <MapPickerModal
        open={mapModal === 'arrivee'}
        onClose={() => setMapModal(null)}
        countryCode={countryCode}
        initialLat={gpsArrivee?.lat}
        initialLng={gpsArrivee?.lng}
        label="Localiser le point d'arrivée"
        onSelect={(lat, lng) => setGpsArrivee({ lat, lng })}
      />
    </div>
  );
}