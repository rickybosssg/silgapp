import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, RefreshCw, Copy, MessageCircle, Zap } from "lucide-react";

const SANDBOX_NUMERO = "14155238886";
const SANDBOX_CODE = "join rise-bit";
// whatsapp:// ouvre directement l'app sans popup Capacitor
const WA_DEEP_LINK = `whatsapp://send?phone=${SANDBOX_NUMERO}&text=${encodeURIComponent(SANDBOX_CODE)}`;
const WA_FALLBACK = `https://wa.me/${SANDBOX_NUMERO}?text=${encodeURIComponent(SANDBOX_CODE)}`;

function ouvrirWhatsApp() {
  // Intent Android natif — bypass Capacitor, ouvre WhatsApp directement sans popup
  const intentUrl = `intent://send/${SANDBOX_NUMERO}#Intent;scheme=smsto;package=com.whatsapp;S.sms_body=${encodeURIComponent(SANDBOX_CODE)};end`;
  const isAndroid = /android/i.test(navigator.userAgent);
  if (isAndroid) {
    window.location.href = intentUrl;
  } else {
    window.location.href = WA_DEEP_LINK;
  }
}

export default function WhatsAppNotifCard({ livreurProfil, onOptInUpdated }) {
  const [verifying, setVerifying] = useState(false);

  const optIn = livreurProfil?.whatsapp_opt_in === true;
  const expireAt = livreurProfil?.whatsapp_opt_in_expire_at;

  const formatExpiration = () => {
    if (!expireAt) return null;
    const d = new Date(expireAt);
    const now = new Date();
    const diffH = Math.round((d - now) / 3600000);
    if (diffH < 0) return { label: "Expiré", urgent: true };
    if (diffH < 12) return { label: `Expire dans ${diffH}h`, urgent: true };
    if (diffH < 24) return { label: `Expire dans ${diffH}h`, urgent: false };
    const diffJ = Math.ceil(diffH / 24);
    return { label: `Expire dans ${diffJ}j`, urgent: false };
  };

  const expInfo = formatExpiration();

  const handleCopier = () => {
    navigator.clipboard.writeText(SANDBOX_CODE)
      .then(() => toast.success("Code copié !"))
      .catch(() => toast.error("Impossible de copier"));
  };

  const handleVerifier = async () => {
    setVerifying(true);
    try {
      const res = await base44.functions.invoke("verifierOptInWhatsApp", {
        telephone: livreurProfil?.telephone,
        livreur_id: livreurProfil?.id,
      });
      const data = res?.data;
      if (data?.opt_in_actif) {
        toast.success("✅ WhatsApp activé — vous allez recevoir les alertes !");
        onOptInUpdated?.(true);
      } else {
        // Afficher la raison précise
        const raison = data?.raison || "Non inscrit";
        toast.error(`❌ ${raison} — Cliquez "Activer WhatsApp" pour vous inscrire`);
        onOptInUpdated?.(false);
      }
    } catch (err) {
      toast.error("Erreur réseau — réessayez dans quelques secondes");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className={`rounded-2xl border-2 p-4 space-y-3 ${
      optIn
        ? "bg-green-50 border-green-200"
        : "bg-amber-50 border-amber-200"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            optIn ? "bg-green-100" : "bg-amber-100"
          }`}>
            <MessageCircle className={`w-5 h-5 ${optIn ? "text-green-600" : "text-amber-600"}`} />
          </div>
          <div>
            <p className="text-sm font-black text-foreground">Notifications WhatsApp</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {optIn ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-bold text-green-700">Activées</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700">Non activées</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Expiration */}
        {optIn && expInfo && (
          <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
            expInfo.urgent
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700"
          }`}>
            {expInfo.label}
          </div>
        )}
      </div>



      {/* Actions si non activé */}
      {!optIn && (
        <div className="space-y-2">
          <p className="text-xs text-amber-800 leading-relaxed">
            Activez WhatsApp pour recevoir des alertes de courses même quand l'app est fermée.
          </p>
          <div className="flex gap-2">
            <button
              onClick={ouvrirWhatsApp}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold active:scale-95 transition-transform"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Activer WhatsApp
            </button>
            <button
              onClick={handleCopier}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-amber-200 text-amber-700 text-xs font-bold active:scale-95 transition-transform"
            >
              <Copy className="w-3.5 h-3.5" />
              Copier code
            </button>
          </div>
          <p className="text-[11px] text-amber-600 text-center">
            Envoyez <span className="font-mono font-bold bg-amber-100 px-1 rounded">join rise-bit</span> au <span className="font-mono">+1 415 523 8886</span>
          </p>
        </div>
      )}

      {/* Actions si activé */}
      {optIn && expInfo?.urgent && (
        <div className="space-y-2">
          <p className="text-xs text-red-700 font-semibold leading-relaxed">
            ⚠️ Votre accès expire bientôt. Renvoyez le code pour renouveler.
          </p>
          <button
            onClick={ouvrirWhatsApp}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold active:scale-95 transition-transform"
          >
            <Zap className="w-3.5 h-3.5" />
            Renouveler l'accès
          </button>
        </div>
      )}

      {/* Bouton vérifier (toujours visible) */}
      <button
        onClick={handleVerifier}
        disabled={verifying}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/80 border border-gray-200 text-gray-600 text-xs font-semibold active:scale-95 transition-transform disabled:opacity-60"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${verifying ? "animate-spin" : ""}`} />
        {verifying ? "Vérification..." : "Vérifier mon inscription"}
      </button>
    </div>
  );
}