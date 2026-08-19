import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Send, Loader2, Sparkles, Navigation, Check, Zap } from "lucide-react";
import { useAdminContext } from "@/hooks/useAdminContext";
import { useAdminCourseWindows } from "@/context/AdminCourseWindowsContext";
import MapPickerModal from "@/components/admin/MapPickerModal";
import CourseWindowStack from "@/components/admin/CourseWindowStack";
import ClientPhoneDetector from "@/components/crm/ClientPhoneDetector";
import SmartAddressPicker from "@/components/crm/SmartAddressPicker";
import { upsertCourseAddresses } from "@/lib/addressBook";
import { upsertClientsFromCourseContacts, normalizePhone } from "@/lib/crmUtils";
import { calculerPrixApproximatif } from "@/lib/priceEstimate";

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
  const { countryCode: adminCountryCode } = useAdminContext();
  const { addWindow } = useAdminCourseWindows();

  const [submitting, setSubmitting] = useState(false);

  const [typeCourse, setTypeCourse] = useState("expedier");
  const [adresseDepart, setAdresseDepart] = useState("");
  const [adresseArrivee, setAdresseArrivee] = useState("");
  const [countryCode, setCountryCode] = useState(adminCountryCode || "BF");

  const [clientNom, setClientNom] = useState("");
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
  const [detectedClient, setDetectedClient] = useState(null);
  const [quickMode, setQuickMode] = useState(false);
  const [prixApproximatif, setPrixApproximatif] = useState(null);
  const [prixProposeAdmin, setPrixProposeAdmin] = useState("");
  const prixProposeManuelModifie = useRef(false);

  const selectedPays = PAYS.find(p => p.code === countryCode);

  // ── Calcul automatique du prix approximatif dès que le GPS est connu ──
  useEffect(() => {
    if (gpsDepart?.lat && gpsDepart?.lng && gpsArrivee?.lat && gpsArrivee?.lng && countryCode) {
      const result = calculerPrixApproximatif(
        gpsDepart.lat, gpsDepart.lng,
        gpsArrivee.lat, gpsArrivee.lng,
        countryCode
      );
      setPrixApproximatif(result);
      if (!prixProposeManuelModifie.current) {
        setPrixProposeAdmin(result ? String(result.prix) : "");
      }
    } else {
      setPrixApproximatif(null);
      if (!prixProposeManuelModifie.current) setPrixProposeAdmin("");
    }
  }, [gpsDepart, gpsArrivee, countryCode]);

  const fillFromTemplate = (template) => {
    setTypeCourse(template.type_course);
    setTypeColis(template.type_colis);
    if (template.notes) setNotes(template.notes);
    toast.info(`Modèle « ${template.label} » appliqué`);
  };

  const resetForm = () => {
    setAdresseDepart("");
    setAdresseArrivee("");
    setQuartierDepart("");
    setQuartierArrivee("");
    setGpsDepart(null);
    setGpsArrivee(null);
    setClientNom("");
    setClientTelephone("");
    setExpediteurNom("");
    setExpediteurTelephone("");
    setDestinataireNom("");
    setDestinataireTelephone("");
    setNotes("");
    setTypeColis("petit_colis");
    setPrixApproximatif(null);
    setPrixProposeAdmin("");
    prixProposeManuelModifie.current = false;
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

      // ── Mapping automatique des téléphones selon le type de course ──
      // Pour que le livreur ait toujours un numéro de contact valide :
      // - "expedier" : le client EST l'expéditeur
      // - "recevoir" : le client EST le destinataire
      // - "deplacement" : le client EST le passager
      const clientTel = clientTelephone.trim();
      const expedTel = expediteurTelephone.trim();
      const destinTel = destinataireTelephone.trim();

      let finalExpediteurTel = expedTel;
      let finalDestinataireTel = destinTel;
      let finalExpediteurNom = expediteurNom.trim();
      let finalDestinataireNom = destinataireNom.trim();

      if (typeCourse === "expedier") {
        if (!finalExpediteurTel) finalExpediteurTel = clientTel;
        if (!finalExpediteurNom) finalExpediteurNom = clientNom.trim();
      } else if (typeCourse === "recevoir") {
        if (!finalDestinataireTel) finalDestinataireTel = clientTel;
        if (!finalDestinataireNom) finalDestinataireNom = clientNom.trim();
      }

      // contact_createur_course = contact principal pour le livreur (téléphone du client)
      // Fallback : si le client n'a pas de téléphone, utiliser l'expéditeur ou le destinataire
      const contactCreateurCourse = clientTel || finalExpediteurTel || finalDestinataireTel || "";

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
        client_telephone: clientTel,
        contact_createur_course: contactCreateurCourse,
        expediteur_nom: finalExpediteurNom || null,
        expediteur_telephone: finalExpediteurTel || null,
        destinataire_nom: finalDestinataireNom || null,
        destinataire_telephone: finalDestinataireTel || null,
        type_colis: typeCourse === "deplacement" ? "autre" : typeColis,
        notes: notes.trim() || null,
        statut: "recherche_livreur",
        dispatch_status: "en_attente",
        pricing_mode: "admin_manuel",
        prix_estimate: prixApproximatif?.prix || 0,
        prix_propose_admin: prixProposeAdmin ? Number(prixProposeAdmin) : (prixApproximatif?.prix || 0),
        tracking_token: trackingToken,
        tracking_link: trackingLink,
        pickup_qr_token: pickupQrToken,
        pickup_code_4_digits: pickupCode4,
        delivery_qr_token: deliveryQrToken,
        delivery_code_4_digits: deliveryCode4,
        passager_nom: typeCourse === "deplacement" ? (clientNom.trim() || "Passager") : null,
        passager_telephone: typeCourse === "deplacement" ? (clientTelephone.trim() || null) : null,
        nb_passagers: typeCourse === "deplacement" ? 1 : null,
        client_phone_normalized: normalizePhone(clientTel, countryCode),
        expediteur_phone_normalized: finalExpediteurTel ? normalizePhone(finalExpediteurTel, countryCode) : null,
        destinataire_phone_normalized: finalDestinataireTel ? normalizePhone(finalDestinataireTel, countryCode) : null,
      };

      const course = await base44.entities.CourseExterne.create(courseData);

      // CRM - Créer ou mettre à jour les fiches pour les 3 contacts (sans stats)
      try {
        await upsertClientsFromCourseContacts(courseData, countryCode);
      } catch (crmErr) {
        console.warn("[CRM] Erreur enrichissement fiches client:", crmErr?.message);
      }

      // Carnet d'adresses intelligent — upsert les adresses de départ et d'arrivée
      try {
        await upsertCourseAddresses(courseData, countryCode);
      } catch (addrErr) {
        console.warn("[AddressBook] Erreur upsert adresses:", addrErr?.message);
      }

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-rose-50/50 to-amber-50/30">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">

        {/* Header Premium — glassmorphism + glow */}
        <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-rose-600 via-red-600 to-orange-500 p-5 shadow-2xl shadow-red-300/40">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-amber-300/25 rounded-full blur-2xl" />
          <div className="absolute -bottom-12 -left-6 w-32 h-32 bg-rose-400/20 rounded-full blur-2xl" />
          <div className="relative flex items-center gap-4">
            <Link to="/admin/externe">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white/15 hover:bg-white/30 border border-white/25 backdrop-blur-md transition-all">
                <ArrowLeft className="w-4 h-4 text-white" />
              </Button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-200" />
                <h1 className="text-xl font-black text-white tracking-tight">Nouvelle course</h1>
              </div>
              <p className="text-xs text-white/60 mt-0.5">Création manuelle administrateur</p>
            </div>
            <button
              type="button"
              onClick={() => setQuickMode(!quickMode)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                quickMode
                  ? "bg-emerald-400 text-white shadow-lg shadow-emerald-300/30"
                  : "bg-white/15 text-white hover:bg-white/30 border border-white/25"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Mode rapide
            </button>
          </div>
        </div>

        {quickMode && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <Zap className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-emerald-700">
              Mode rapide — tapez le numéro du client, sélectionnez une course dans l'historique, puis cliquez sur Créer
            </span>
          </div>
        )}

        {/* Type de course — cartes raffinées */}
        <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-lg shadow-gray-100/50 overflow-hidden">
          <div className="px-5 pt-4 pb-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-4 bg-gradient-to-b from-rose-500 to-orange-500 rounded-full" />
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Type de course</p>
            </div>
          </div>
          <div className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-3 gap-2">
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
                const ringColors = {
                  expedier: "ring-rose-200",
                  recevoir: "ring-amber-200",
                  deplacement: "ring-violet-200",
                };
                const isActive = typeCourse === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTypeCourse(t.key)}
                    className={`relative flex flex-col items-center gap-1 p-3.5 rounded-2xl border-2 transition-all duration-300 ${
                      isActive
                        ? `border-transparent bg-gradient-to-br ${bgs[t.key]} shadow-lg ${ringColors[t.key]} ring-1 scale-[1.04]`
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50/50"
                    }`}
                  >
                    <span className={`text-2xl transition-transform duration-300 ${isActive ? "scale-110" : "opacity-70"}`}>{t.icon}</span>
                    <span className={`text-[11px] font-bold transition-colors ${isActive ? "text-gray-900" : "text-gray-600"}`}>
                      {t.label}
                    </span>
                    <span className={`text-[9px] leading-tight text-center transition-colors ${isActive ? "text-gray-500" : "text-gray-400"}`}>
                      {t.desc}
                    </span>
                    {isActive && (
                      <div className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-gradient-to-r ${gradients[t.key]}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Contacts */}
        <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-lg shadow-gray-100/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-sky-500 to-blue-500 rounded-full" />
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Contacts</p>
            <span className="text-[10px] bg-sky-50 text-sky-600 px-2 py-0.5 rounded-full font-semibold border border-sky-100">Optionnel</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wide">Nom du client</p>
              <Input
                value={clientNom}
                onChange={e => setClientNom(e.target.value)}
                placeholder="Nom"
                className="rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm focus:ring-blue-300/50 focus:border-blue-400"
              />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wide">Téléphone</p>
              <Input
                value={clientTelephone}
                onChange={e => setClientTelephone(e.target.value)}
                placeholder="+226 XX XX XX XX"
                className="rounded-xl h-11 bg-blue-50 border-blue-200/60 text-sm focus:ring-blue-300/50 focus:border-blue-400"
              />
            </div>
          </div>

          <ClientPhoneDetector
            phone={clientTelephone}
            countryCode={countryCode}
            onClientFound={setDetectedClient}
            onClientName={(nom, prenom) => {
              if (!clientNom) setClientNom(prenom ? `${prenom} ${nom}`.trim() : nom);
            }}
          />

          {!quickMode && (typeCourse === "recevoir" ? (
            <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wide">Expéditeur</p>
                <Input
                  value={expediteurNom}
                  onChange={e => setExpediteurNom(e.target.value)}
                  placeholder="Nom expéditeur"
                  className="rounded-xl h-11 bg-amber-50/30 border-amber-100/50 text-sm focus:ring-amber-300/50 focus:border-amber-300"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wide">Tél. expéditeur</p>
                <Input
                  value={expediteurTelephone}
                  onChange={e => setExpediteurTelephone(e.target.value)}
                  placeholder="+226 XX XX XX XX"
                  className="rounded-xl h-11 bg-amber-50/30 border-amber-100/50 text-sm focus:ring-amber-300/50 focus:border-amber-300"
                />
              </div>
            </div>
            <ClientPhoneDetector phone={expediteurTelephone} countryCode={countryCode} />
            </>
          ) : typeCourse === "expedier" ? (
            <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wide">Destinataire</p>
                <Input
                  value={destinataireNom}
                  onChange={e => setDestinataireNom(e.target.value)}
                  placeholder="Nom destinataire"
                  className="rounded-xl h-11 bg-rose-50 border-rose-200/60 text-sm focus:ring-rose-300/50 focus:border-rose-400"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wide">Tél. destinataire</p>
                <Input
                  value={destinataireTelephone}
                  onChange={e => setDestinataireTelephone(e.target.value)}
                  placeholder="+226 XX XX XX XX"
                  className="rounded-xl h-11 bg-rose-50 border-rose-200/60 text-sm focus:ring-rose-300/50 focus:border-rose-400"
                />
              </div>
            </div>
            <ClientPhoneDetector phone={destinataireTelephone} countryCode={countryCode} />
            </>
          ) : null)}

          {!quickMode && (
          <div>
            <p className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wide">Notes</p>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Instructions particulières..."
              className="rounded-xl h-11 bg-gray-50/50 border-gray-200/50 text-sm focus:ring-gray-300/50"
            />
          </div>
          )}
        </div>

        {/* Détails — trajet visuel */}
        <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-lg shadow-gray-100/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-orange-500 to-amber-500 rounded-full" />
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Itinéraire</p>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Pays de destination</p>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="rounded-xl h-12 bg-blue-50/40 border-blue-100/50 text-sm font-medium text-gray-900 focus:ring-blue-300/50">
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

          {/* Bloc trajet départ → arrivée avec connecteur visuel */}
          <div className="relative space-y-3">
            {/* Ligne connectrice */}
            <div className="absolute left-[18px] top-10 bottom-10 w-0.5 bg-gradient-to-b from-emerald-400 via-gray-300 to-rose-400" />

            {/* Départ */}
            <div className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 z-10" />
                  Point de départ
                </p>
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
                onChange={setAdresseDepart}
                onSelect={(r) => {
                  if (r?.latitude && r?.longitude) {
                    setGpsDepart({ lat: r.latitude, lng: r.longitude });
                    if (r.quartier) setQuartierDepart(r.quartier);
                  }
                }}
                countryCode={countryCode}
                placeholder="Ex: Ouaga 2000, face à la mairie"
                iconColor="text-emerald-500"
                inputClassName="rounded-xl h-12 pl-10 pr-28 bg-blue-50 border-blue-200/60 text-sm focus:ring-blue-300/50 focus:border-blue-400"
              >
                <button
                  type="button"
                  onClick={() => setMapModal('depart')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-semibold hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-200 active:scale-95"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Localiser
                </button>
              </SmartAddressPicker>
            </div>

            {/* Arrivée */}
            <div className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100 z-10" />
                  Point d'arrivée
                </p>
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
                onChange={setAdresseArrivee}
                onSelect={(r) => {
                  if (r?.latitude && r?.longitude) {
                    setGpsArrivee({ lat: r.latitude, lng: r.longitude });
                    if (r.quartier) setQuartierArrivee(r.quartier);
                  }
                }}
                countryCode={countryCode}
                placeholder="Ex: Gounghin, derrière le marché"
                iconColor="text-rose-500"
                inputClassName="rounded-xl h-12 pl-10 pr-28 bg-rose-50 border-rose-200/60 text-sm focus:ring-rose-300/50 focus:border-rose-400"
              >
                <button
                  type="button"
                  onClick={() => setMapModal('arrivee')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-semibold hover:bg-rose-600 transition-all shadow-sm shadow-rose-200 active:scale-95"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Localiser
                </button>
              </SmartAddressPicker>
            </div>
          </div>

          {typeCourse !== "deplacement" && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Type de colis</p>
              <Input
                value={typeColis}
                onChange={e => setTypeColis(e.target.value)}
                placeholder="Ex: Petit colis, document, nourriture..."
                className="rounded-xl h-12 bg-violet-50/30 border-violet-100/50 text-sm font-medium text-gray-900 focus:ring-violet-300/50 focus:border-violet-400"
              />
            </div>
          )}
        </div>

        {/* ── Prix de la course ── */}
        <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-lg shadow-gray-100/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-amber-500 to-yellow-500 rounded-full" />
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Prix de la course</p>
          </div>

          {/* Prix approximatif (auto) */}
          <div className="flex items-center justify-between rounded-xl bg-amber-50/50 border border-amber-100 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Prix approximatif</p>
              <p className="text-[10px] text-amber-400 mt-0.5">Calculé automatiquement selon la distance</p>
            </div>
            {prixApproximatif ? (
              <div className="text-right">
                <p className="text-xl font-black text-amber-700">
                  {prixApproximatif.prix.toLocaleString()} <span className="text-xs font-bold">{prixApproximatif.devise}</span>
                </p>
                <p className="text-[10px] text-amber-400 mt-0.5">{prixApproximatif.distance} km</p>
              </div>
            ) : (
              <p className="text-[10px] text-gray-400 italic max-w-[140px] text-right">
                Prix approximatif indisponible — localisation nécessaire
              </p>
            )}
          </div>

          {/* Prix proposé (éditable) */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Prix proposé</p>
            <div className="relative">
              <Input
                type="text"
                inputMode="numeric"
                value={prixProposeAdmin ? Number(prixProposeAdmin.replace(/\D/g, "")).toLocaleString("fr-FR") : ""}
                onChange={e => {
                  prixProposeManuelModifie.current = true;
                  const digits = e.target.value.replace(/\D/g, "");
                  setPrixProposeAdmin(digits);
                }}
                placeholder={prixApproximatif ? prixApproximatif.prix.toLocaleString("fr-FR") : "—"}
                className="rounded-xl h-12 pr-20 bg-amber-50/30 border-amber-100/50 text-lg font-bold text-gray-900 focus:ring-amber-300/50 focus:border-amber-400"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                {prixApproximatif?.devise || "FCFA"}
              </span>
            </div>
            {prixApproximatif && (
              <p className="text-[10px] text-gray-400 mt-1">
                Prérempli avec le prix approximatif. Modifiable avant création.
              </p>
            )}
          </div>
        </div>

        {/* Bouton Créer — premium avec glow */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-600 to-orange-500 rounded-2xl blur-md opacity-30" />
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="relative w-full h-14 rounded-2xl gap-2.5 font-bold text-base bg-gradient-to-r from-rose-600 via-red-600 to-orange-500 hover:from-rose-700 hover:via-red-700 hover:to-orange-600 shadow-xl shadow-red-200/50 transition-all active:scale-[0.98] border border-white/10"
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
        </div>

        <p className="text-center text-[11px] text-gray-400 pb-6 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3 h-3 text-amber-400" />
          La course sera automatiquement proposée aux livreurs disponibles
        </p>
      </div>

      {/* Panneau des courses actives — affiche le statut en temps réel après validation */}
      <CourseWindowStack />

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
