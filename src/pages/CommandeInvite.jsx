import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Loader2, Package, MapPin, User, CheckCircle2, ArrowRight } from "lucide-react";

const STEPS = {
  PHONE: "phone",
  OTP: "otp",
  COURSE: "course",
  SUCCESS: "success",
};

export default function CommandeInvite() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.PHONE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("BF");
  const [otpCode, setOtpCode] = useState("");
  const [phoneNormalized, setPhoneNormalized] = useState("");
  const [courseData, setCourseData] = useState({
    type_course: "expedier",
    adresse_depart: "",
    adresse_arrivee: "",
    client_nom: "",
    type_colis: "petit_colis",
  });
  const [trackingToken, setTrackingToken] = useState("");
  const [trackingLink, setTrackingLink] = useState("");

  const handleSendOtp = async () => {
    setError("");
    if (!phone.trim() || phone.replace(/\D/g, "").length < 8) {
      setError("Entrez un numéro de téléphone valide.");
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("guestOrders", {
        action: "send_otp",
        phone,
        country_code: countryCode,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setPhoneNormalized(data.phone_normalized || phone);
      setStep(STEPS.OTP);
    } catch (err) {
      setError(err?.message || "Impossible d'envoyer le code OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndCreate = async () => {
    setError("");
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      setError("Entrez le code reçu par SMS.");
      return;
    }
    if (!courseData.adresse_depart.trim() || !courseData.adresse_arrivee.trim() || !courseData.client_nom.trim()) {
      setError("Remplissez tous les champs de la course.");
      return;
    }
    setLoading(true);
    try {
      const requestId = crypto.randomUUID();
      const res = await base44.functions.invoke("guestOrders", {
        action: "verify_and_create",
        phone,
        country_code: countryCode,
        otp_code: otpCode,
        request_id: requestId,
        course_data: courseData,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      if (data?.limit_reached) {
        setError(data.error);
        return;
      }
      setTrackingToken(data.tracking_token || data.course?.tracking_token || "");
      setTrackingLink(data.tracking_link || data.course?.tracking_link || "");
      setStep(STEPS.SUCCESS);
    } catch (err) {
      setError(err?.message || "Impossible de créer la course.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="h-9 w-9 p-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-base font-bold text-gray-900">Commander sans compte</h1>
          <p className="text-xs text-gray-500">Livraison SILGAPP — invité</p>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-md mx-auto w-full space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === STEPS.PHONE && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto">
                <Phone className="w-7 h-7 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Votre numéro de téléphone</h2>
              <p className="text-sm text-gray-500">Nous vous enverrons un code par SMS pour vérifier votre numéro.</p>
            </div>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
              >
                <option value="BF">+226 BF</option>
                <option value="CI">+225 CI</option>
                <option value="TG">+228 TG</option>
                <option value="SN">+221 SN</option>
                <option value="ML">+223 ML</option>
              </select>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="70 12 34 56"
                className="flex-1 rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-base font-medium text-gray-900 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
            <Button
              onClick={handleSendOtp}
              disabled={loading}
              className="w-full h-12 text-base font-bold"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Recevoir le code SMS"}
            </Button>
          </div>
        )}

        {step === STEPS.OTP && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Code de vérification</h2>
              <p className="text-sm text-gray-500">Entrez le code reçu par SMS au {phone}.</p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-4 text-center text-2xl font-bold tracking-widest text-gray-900 outline-none focus:border-blue-500 focus:bg-white"
            />
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-gray-700">Détails de votre course</p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={courseData.client_nom}
                  onChange={(e) => setCourseData({ ...courseData, client_nom: e.target.value })}
                  placeholder="Votre nom"
                  className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-500 focus:bg-white"
                />
                <select
                  value={courseData.type_course}
                  onChange={(e) => setCourseData({ ...courseData, type_course: e.target.value })}
                  className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900"
                >
                  <option value="expedier">Expédier un colis</option>
                  <option value="recevoir">Recevoir un colis</option>
                  <option value="deplacement">Déplacement</option>
                </select>
                <input
                  type="text"
                  value={courseData.adresse_depart}
                  onChange={(e) => setCourseData({ ...courseData, adresse_depart: e.target.value })}
                  placeholder="Adresse de départ"
                  className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-500 focus:bg-white"
                />
                <input
                  type="text"
                  value={courseData.adresse_arrivee}
                  onChange={(e) => setCourseData({ ...courseData, adresse_arrivee: e.target.value })}
                  placeholder="Adresse d'arrivée"
                  className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
            </div>
            <Button
              onClick={handleVerifyAndCreate}
              disabled={loading}
              className="w-full h-12 text-base font-bold"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Commander"}
            </Button>
          </div>
        )}

        {step === STEPS.SUCCESS && (
          <div className="space-y-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Course créée !</h2>
            <p className="text-sm text-gray-500">
              Votre demande a été enregistrée. Un livreur SILGAPP prendra contact avec vous prochainement.
            </p>
            {trackingLink && (
              <a
                href={trackingLink}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white"
              >
                Suivre ma course <ArrowRight className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => navigate("/")}
              className="block w-full text-sm font-semibold text-blue-600"
            >
              Retour à l'accueil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}