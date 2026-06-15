import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Send, Loader2, Sparkles, MessageCircle, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { useAdminContext } from "@/hooks/useAdminContext";

function generarQRData() {
  const pickupQrToken = crypto.randomUUID().replace(/-/g, "");
  const deliveryQrToken = crypto.randomUUID().replace(/-/g, "");
  const pickupCode4 = String(Math.floor(1000 + Math.random() * 9000));
  const deliveryCode4 = String(Math.floor(1000 + Math.random() * 9000));
  return { pickupQrToken, deliveryQrToken, pickupCode4, deliveryCode4 };
}

function cleanPhone(phone) {
  return (phone || "").replace(/[\s\-\+\(\)]/g, "");
}

function waLink(phone, message) {
  return `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(message)}`;
}

function buildTrackingUrl(courseId) {
  return `https://silga-dispatch-go.base44.app/suivi-public/${courseId}`;
}

function buildQrUrl(token) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(token)}`;
}

const SILGAPP_DL = "https://silga-dispatch-go.base44.app/telecharger";

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

// ── Success view after course creation ──
function CourseCreated({ course, onNewCourse, formData }) {
  const navigate = useNavigate();
  const trackingUrl = buildTrackingUrl(course.id);

  const expediteurPhone = formData.expediteurTelephone || formData.clientTelephone || "";
  const destinatairePhone = formData.destinataireTelephone || "";

  const expediteurName = formData.expediteurNom || formData.clientNom || "Client";
  const destinataireName = formData.destinataireNom || "Destinataire";

  const msgExpediteur = [
    `✅ *Course SILGAPP confirmée !*`,
    ``,
    `Votre course a été créée avec succès.`,
    ``,
    `📦 *Destinataire :* ${destinataireName || "—"}`,
    `📍 *Adresse de livraison :* ${course.adresse_arrivee || "—"}`,
    `#️⃣ *N° de course :* ${course.id?.slice(-8) || course.id}`,
    ``,
    `🔐 *PIN de récupération :* *${course.pickup_code_4_digits}*`,
    `📱 *QR Code récupération :* ${buildQrUrl(course.pickup_qr_token)}`,
    ``,
    `🔗 *Suivez votre course en temps réel :*`,
    trackingUrl,
    ``,
    `📲 *Téléchargez SILGAPP :*`,
    SILGAPP_DL,
    ``,
    `Merci de votre confiance ! 🏍️`,
  ].join("\n");

  const msgDestinataire = [
    `📦 *Un colis vous est destiné !*`,
    ``,
    `${expediteurName ? `👤 *Expéditeur :* ${expediteurName}` : ""}`,
    `#️⃣ *N° de course :* ${course.id?.slice(-8) || course.id}`,
    ``,
    `🔐 *PIN de livraison :* *${course.delivery_code_4_digits}*`,
    `📱 *QR Code livraison :* ${buildQrUrl(course.delivery_qr_token)}`,
    ``,
    `🔗 *Suivez votre colis en temps réel :*`,
    trackingUrl,
    ``,
    `📲 *Téléchargez SILGAPP :*`,
    SILGAPP_DL,
    ``,
    `Merci de votre confiance ! 🏍️`,
  ].filter(Boolean).join("\n");

  const copyTracking = () => {
    navigator.clipboard.writeText(trackingUrl);
    toast.success("Lien de suivi copié !");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/50">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">

        {/* Header succès */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950 p-5 shadow-xl shadow-emerald-200">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/10 to-transparent rounded-bl-full" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">Course créée !</h1>
              <p className="text-xs text-white/60">Envoyez les informations aux contacts</p>
            </div>
          </div>
        </div>

        {/* Récapitulatif course */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Récapitulatif</p>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-0.5">Type</p>
              <p className="font-bold text-gray-800">
                {TYPE_OPTIONS.find(t => t.key === course.type_course)?.icon} {TYPE_OPTIONS.find(t => t.key === course.type_course)?.label || course.type_course}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-0.5">Statut</p>
              <p className="font-bold text-orange-600">Recherche livreur</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-0.5">Départ</p>
              <p className="font-medium text-gray-700 text-xs">{course.adresse_depart || "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-0.5">Arrivée</p>
              <p className="font-medium text-gray-700 text-xs">{course.adresse_arrivee || "—"}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-0.5">Code PIN livraison</p>
              <p className="font-black text-lg text-primary tracking-widest">{course.delivery_code_4_digits}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-0.5">Code PIN récupération</p>
              <p className="font-black text-lg text-primary tracking-widest">{course.pickup_code_4_digits}</p>
            </div>
          </div>

          {/* Lien de suivi */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-blue-500 mb-0.5">Lien de suivi</p>
              <p className="text-xs text-blue-700 truncate">{trackingUrl}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={copyTracking}
              className="h-8 w-8 p-0 rounded-lg text-blue-600 hover:bg-blue-100 flex-shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Boutons WhatsApp */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Envoyer par WhatsApp</p>

          {/* Bouton Expéditeur */}
          {expediteurPhone ? (
            <a
              href={waLink(expediteurPhone, msgExpediteur)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 hover:shadow-md hover:border-emerald-300 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-green-200">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-800">Envoyer à l'expéditeur</p>
                  <p className="text-[11px] text-gray-500">{expediteurName} — {expediteurPhone}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-green-500 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-200 opacity-50">
              <div className="w-12 h-12 rounded-xl bg-gray-300 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-6 h-6 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-gray-400">Envoyer à l'expéditeur</p>
                <p className="text-[11px] text-gray-400">Aucun numéro renseigné</p>
              </div>
            </div>
          )}

          {/* Bouton Destinataire */}
          {destinatairePhone ? (
            <a
              href={waLink(destinatairePhone, msgDestinataire)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 hover:shadow-md hover:border-blue-300 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-800">Envoyer au destinataire</p>
                  <p className="text-[11px] text-gray-500">{destinataireName} — {destinatairePhone}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-blue-500 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-200 opacity-50">
              <div className="w-12 h-12 rounded-xl bg-gray-300 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-6 h-6 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-gray-400">Envoyer au destinataire</p>
                <p className="text-[11px] text-gray-400">Aucun numéro renseigné</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            onClick={onNewCourse}
            className="w-full h-14 rounded-2xl gap-2 font-bold text-base bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 shadow-lg shadow-slate-200"
          >
            <Sparkles className="w-5 h-5" />
            Créer une autre course
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/admin/externe")}
            className="w-full h-12 rounded-2xl font-medium text-sm border-gray-200 text-gray-600"
          >
            Retour au tableau de bord
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main form component ──
export default function AdminCourseForm() {
  const navigate = useNavigate();
  const { countryCode: adminCountryCode } = useAdminContext();
  const [submitting, setSubmitting] = useState(false);
  const [createdCourse, setCreatedCourse] = useState(null);
  const [createdFormData, setCreatedFormData] = useState(null);

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

  const selectedPays = PAYS.find(p => p.code === countryCode);

  // ── Success state ──
  if (createdCourse) {
    return (
      <CourseCreated
        course={createdCourse}
        formData={createdFormData}
        onNewCourse={() => {
          setCreatedCourse(null);
          setCreatedFormData(null);
        }}
      />
    );
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { pickupQrToken, deliveryQrToken, pickupCode4, deliveryCode4 } = generarQRData();

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
        pickup_qr_token: pickupQrToken,
        pickup_code_4_digits: pickupCode4,
        delivery_qr_token: deliveryQrToken,
        delivery_code_4_digits: deliveryCode4,
        passager_nom: typeCourse === "deplacement" ? (clientNom.trim() || "Passager") : null,
        passager_telephone: typeCourse === "deplacement" ? (clientTelephone.trim() || null) : null,
        nb_passagers: typeCourse === "deplacement" ? 1 : null,
      };

      const course = await base44.entities.CourseExterne.create(courseData);

      // Lancer dispatch auto
      try {
        await base44.functions.invoke("dispatchExterneAuto", {
          action: "lancer_recherche_auto",
          course_id: course.id,
        });
      } catch (e) { console.error("Erreur dispatch:", e); }

      toast.success("Course créée avec succès !");
      setCreatedCourse(course);
      setCreatedFormData(formData);
    } catch (err) {
      toast.error("Erreur création: " + (err?.message || "inconnue"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/50">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

        {/* Header Premium */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-5 shadow-xl shadow-slate-200">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-bl-full" />
          <div className="absolute bottom-0 left-1/2 w-40 h-20 bg-gradient-to-t from-emerald-500/10 to-transparent rounded-t-full" />
          <div className="relative flex items-center gap-4">
            <Link to="/admin/externe">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10">
                <ArrowLeft className="w-4 h-4 text-white" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h1 className="text-xl font-black text-white">Nouvelle course</h1>
              </div>
              <p className="text-xs text-white/50">Création manuelle administrateur</p>
            </div>
          </div>
        </div>

        {/* Type de course */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Type de course</p>
          </div>
          <div className="px-5 pb-5">
            <div className="grid grid-cols-3 gap-2.5">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTypeCourse(t.key)}
                  className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all duration-200 ${
                    typeCourse === t.key
                      ? "border-primary bg-primary/5 shadow-md shadow-primary/10 scale-[1.02]"
                      : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <span className={`text-xs font-bold ${typeCourse === t.key ? "text-primary" : "text-gray-700"}`}>
                    {t.label}
                  </span>
                  <span className={`text-[10px] ${typeCourse === t.key ? "text-primary/60" : "text-gray-400"}`}>
                    {t.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Détails */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Détails</p>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Pays</p>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="rounded-xl h-12 bg-gray-50 border-gray-200 text-sm">
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
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Point de départ</p>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <Input
                value={adresseDepart}
                onChange={e => setAdresseDepart(e.target.value)}
                placeholder="Ex: Ouaga 2000, face à la mairie"
                className="rounded-xl h-12 pl-10 bg-gray-50 border-gray-200 text-sm"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Point d'arrivée</p>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <Input
                value={adresseArrivee}
                onChange={e => setAdresseArrivee(e.target.value)}
                placeholder="Ex: Gounghin, derrière le marché"
                className="rounded-xl h-12 pl-10 bg-gray-50 border-gray-200 text-sm"
              />
            </div>
          </div>

          {typeCourse !== "deplacement" && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Type de colis</p>
              <Select value={typeColis} onValueChange={setTypeColis}>
                <SelectTrigger className="rounded-xl h-12 bg-gray-50 border-gray-200 text-sm">
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Contacts</p>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Optionnel</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-400 mb-1">Nom du client</p>
              <Input
                value={clientNom}
                onChange={e => setClientNom(e.target.value)}
                placeholder="Nom"
                className="rounded-xl h-11 bg-gray-50 border-gray-200 text-sm"
              />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-1">Téléphone client</p>
              <Input
                value={clientTelephone}
                onChange={e => setClientTelephone(e.target.value)}
                placeholder="+226 XXXXXXXX"
                className="rounded-xl h-11 bg-gray-50 border-gray-200 text-sm"
              />
            </div>
          </div>

          {typeCourse === "recevoir" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Expéditeur</p>
                <Input
                  value={expediteurNom}
                  onChange={e => setExpediteurNom(e.target.value)}
                  placeholder="Nom expéditeur"
                  className="rounded-xl h-11 bg-gray-50 border-gray-200 text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Tél. expéditeur</p>
                <Input
                  value={expediteurTelephone}
                  onChange={e => setExpediteurTelephone(e.target.value)}
                  placeholder="+226 XXXXXXXX"
                  className="rounded-xl h-11 bg-gray-50 border-gray-200 text-sm"
                />
              </div>
            </div>
          ) : typeCourse === "expedier" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Destinataire</p>
                <Input
                  value={destinataireNom}
                  onChange={e => setDestinataireNom(e.target.value)}
                  placeholder="Nom destinataire"
                  className="rounded-xl h-11 bg-gray-50 border-gray-200 text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Tél. destinataire</p>
                <Input
                  value={destinataireTelephone}
                  onChange={e => setDestinataireTelephone(e.target.value)}
                  placeholder="+226 XXXXXXXX"
                  className="rounded-xl h-11 bg-gray-50 border-gray-200 text-sm"
                />
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] text-gray-400 mb-1">Notes</p>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Instructions particulières..."
              className="rounded-xl h-11 bg-gray-50 border-gray-200 text-sm"
            />
          </div>
        </div>

        {/* Bouton Créer */}
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 rounded-2xl gap-2.5 font-bold text-base bg-gradient-to-r from-primary via-red-600 to-rose-600 hover:from-primary/90 hover:to-rose-600/90 shadow-lg shadow-red-200 transition-all active:scale-[0.98]"
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

        <p className="text-center text-[11px] text-gray-400 pb-6">
          La course sera automatiquement proposée aux livreurs disponibles
        </p>
      </div>
    </div>
  );
}