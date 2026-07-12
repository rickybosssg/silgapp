import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, ExternalLink, MessageCircle, Package, Loader2, ChevronDown, ChevronUp, Check } from "lucide-react";
import { toast } from "sonner";

const COUNTRY_DIAL_CODE = {
  BF: "226", CI: "225", TG: "228", BJ: "229", SN: "221",
  ML: "223", GN: "224", NE: "227", GH: "233",
};
const COUNTRY_LOCAL_LEN = {
  BF: 8, CI: 10, TG: 8, BJ: 8, SN: 9,
  ML: 8, GN: 9, NE: 8, GH: 9,
};

function cleanPhone(phone, countryCode) {
  let digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const dial = COUNTRY_DIAL_CODE[countryCode] || "226";
  const localLen = COUNTRY_LOCAL_LEN[countryCode] || 8;

  // Déjà au format international
  if (digits.startsWith(dial) && digits.length === dial.length + localLen) return digits;

  // Numéro avec préfixe trunk "0" : longueur = localLen + 1 (ex: "075653330" BF → 9 chiffres)
  if (digits.startsWith("0") && digits.length === localLen + 1) {
    return dial + digits.slice(1);
  }

  // Numéro local : longueur == localLen (le 0 fait partie du numéro, ex: "07670733" BF → 8 chiffres)
  if (digits.length === localLen) {
    return dial + digits;
  }

  // Fallback : retirer le 0 initial si présent et préfixer l'indicatif
  if (digits.startsWith("0")) digits = digits.slice(1);
  return dial + digits;
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

const TYPE_LABELS = {
  expedier: "Expédition",
  recevoir: "Réception",
  deplacement: "Déplacement",
};

const STATUT_LABELS = {
  nouvelle: { label: "Nouvelle", color: "text-gray-600 bg-gray-100" },
  recherche_livreur: { label: "Recherche livreur", color: "text-orange-600 bg-orange-100" },
  livreur_en_route: { label: "Livreur en route", color: "text-blue-600 bg-blue-100" },
  arrive_prise_en_charge: { label: "Arrivé", color: "text-blue-600 bg-blue-100" },
  colis_recupere: { label: "Colis récupéré", color: "text-blue-600 bg-blue-100" },
  pris_en_charge: { label: "Pris en charge", color: "text-blue-600 bg-blue-100" },
  en_livraison: { label: "En livraison", color: "text-blue-600 bg-blue-100" },
  arrivee: { label: "Arrivé", color: "text-green-600 bg-green-100" },
  livree: { label: "Livrée", color: "text-green-600 bg-green-100" },
  annulee: { label: "Annulée", color: "text-red-600 bg-red-100" },
};

export default function CourseWindowCard({ courseId, formData, onClose }) {
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const c = await base44.entities.CourseExterne.get(courseId);
        if (c) setCourse(c);
      } catch (_) {} finally { setLoading(false); }
    };
    fetchCourse();
    const iv = setInterval(fetchCourse, 15000);
    return () => clearInterval(iv);
  }, [courseId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">Chargement course...</span>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-400 mb-2">Course introuvable</p>
        <Button size="sm" variant="outline" onClick={onClose} className="w-full h-8 text-xs">Fermer</Button>
      </div>
    );
  }

  const trackingUrl = buildTrackingUrl(course.tracking_token || course.id);
  const expediteurPhone = course.expediteur_telephone || course.client_telephone || formData?.expediteurTelephone || formData?.clientTelephone || "";
  const destinatairePhone = course.destinataire_telephone || formData?.destinataireTelephone || "";
  const expediteurName = course.expediteur_nom || course.client_nom || formData?.expediteurNom || formData?.clientNom || "Client";
  const destinataireName = course.destinataire_nom || formData?.destinataireNom || "Destinataire";
  const statutInfo = STATUT_LABELS[course.statut] || { label: course.statut, color: "text-gray-600 bg-gray-100" };
  const isTerminal = course.statut === "livree" || course.statut === "annulee";

  const msgExpediteur = [
    `✅ *Course SILGAPP confirmée !*`,
    ``,
    `📦 *Destinataire :* ${destinataireName || "—"}`,
    `📍 *Adresse de livraison :* ${course.adresse_arrivee || "—"}`,
    `#️⃣ *N° de course :* ${course.id?.slice(-8) || course.id}`,
    ``,
    `🔐 *PIN de récupération :* *${course.pickup_code_4_digits}*`,
    `📱 *QR Code récupération :* ${buildQrUrl(course.pickup_qr_token)}`,
    ``,
    `🔗 *Suivez votre course :*`,
    trackingUrl,
    ``,
    `📲 *Téléchargez SILGAPP :*`,
    `🤖 *Play Store :* ${SILGAPP_PLAYSTORE}`,
    `🍎 *App Store :* ${SILGAPP_APPLE}`,
    ``,
    `Merci ! 🏍️`,
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
    `🔗 *Suivez votre colis :*`,
    trackingUrl,
    ``,
    `📲 *Téléchargez SILGAPP :*`,
    `🤖 *Play Store :* ${SILGAPP_PLAYSTORE}`,
    `🍎 *App Store :* ${SILGAPP_APPLE}`,
    ``,
    `Merci ! 🏍️`,
  ].filter(Boolean).join("\n");

  const copyTracking = () => {
    navigator.clipboard.writeText(trackingUrl);
    toast.success("Lien copié !");
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={`relative overflow-hidden p-3 ${isTerminal ? "bg-gradient-to-br from-green-700 to-green-900" : "bg-gradient-to-br from-emerald-700 to-emerald-900"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Course créée</p>
              <p className="text-[10px] text-white/60">#{course.id?.slice(-8) || course.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statutInfo.color}`}>{statutInfo.label}</span>
            <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded hover:bg-white/10">
              {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-white/70" /> : <ChevronUp className="w-3.5 h-3.5 text-white/70" />}
            </button>
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-2.5">
          {/* Type + trajet */}
          <div className="flex items-center gap-2 text-xs">
            <Package className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-700">{TYPE_LABELS[course.type_course] || course.type_course}</span>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 space-y-1">
            <p className="text-[10px] text-gray-400">Départ</p>
            <p className="text-xs font-medium text-gray-700 truncate">{course.adresse_depart || "—"}</p>
            <p className="text-[10px] text-gray-400 mt-1">Arrivée</p>
            <p className="text-xs font-medium text-gray-700 truncate">{course.adresse_arrivee || "—"}</p>
          </div>

          {/* PINs */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-center">
              <p className="text-[9px] text-amber-500 uppercase font-semibold">PIN récup.</p>
              <p className="text-lg font-black text-primary tracking-widest">{course.pickup_code_4_digits}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-center">
              <p className="text-[9px] text-amber-500 uppercase font-semibold">PIN livr.</p>
              <p className="text-lg font-black text-primary tracking-widest">{course.delivery_code_4_digits}</p>
            </div>
          </div>

          {/* Lien de suivi */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 flex items-center gap-2">
            <p className="text-[10px] text-blue-600 truncate flex-1">{trackingUrl}</p>
            <button onClick={copyTracking} className="p-1 rounded hover:bg-blue-100 shrink-0">
              <Copy className="w-3 h-3 text-blue-600" />
            </button>
          </div>

          {/* WhatsApp buttons */}
          <div className="space-y-1.5">
            {expediteurPhone ? (
              <a href={waLink(expediteurPhone, msgExpediteur, course.country_code)} target="_blank" rel="noopener noreferrer">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-200 hover:shadow-sm transition-all">
                  <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-800">Expéditeur</p>
                    <p className="text-[10px] text-gray-500 truncate">{expediteurName} — {expediteurPhone}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-green-500 shrink-0" />
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200 opacity-50">
                <div className="w-7 h-7 rounded-lg bg-gray-300 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <p className="text-[11px] font-bold text-gray-400">Expéditeur — aucun numéro</p>
              </div>
            )}

            {destinatairePhone ? (
              <a href={waLink(destinatairePhone, msgDestinataire, course.country_code)} target="_blank" rel="noopener noreferrer">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200 hover:shadow-sm transition-all">
                  <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-800">Destinataire</p>
                    <p className="text-[10px] text-gray-500 truncate">{destinataireName} — {destinatairePhone}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-blue-500 shrink-0" />
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200 opacity-50">
                <div className="w-7 h-7 rounded-lg bg-gray-300 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <p className="text-[11px] font-bold text-gray-400">Destinataire — aucun numéro</p>
              </div>
            )}
          </div>

          {/* Course Traité button */}
          <Button
            onClick={onClose}
            className="w-full h-10 rounded-xl gap-2 font-bold text-sm bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-500 hover:to-emerald-600 shadow-md"
          >
            <Check className="w-4 h-4" />
            Course Traité
          </Button>
        </div>
      )}
    </div>
  );
}