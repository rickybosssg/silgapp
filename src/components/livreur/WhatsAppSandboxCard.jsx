import React, { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Copy, ExternalLink, CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SANDBOX_NUMERO = "+14155238886";
const SANDBOX_CODE = "join rise-bit";

export default function WhatsAppSandboxCard({ livreurProfil, onOptInUpdated }) {
  const [expanded, setExpanded] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [statut, setStatut] = useState(livreurProfil?.whatsapp_opt_in ?? null);

  const handleCopierCode = () => {
    navigator.clipboard.writeText(SANDBOX_CODE);
    toast.success("Code copié !");
  };

  const handleOuvrirWhatsApp = () => {
    const message = encodeURIComponent(SANDBOX_CODE);
    const numero = SANDBOX_NUMERO.replace("+", "");
    window.open(`https://wa.me/${numero}?text=${message}`, "_blank");
  };

  const handleVerifier = async () => {
    if (verifying || !livreurProfil?.id) return;
    setVerifying(true);
    try {
      const res = await base44.functions.invoke('verifierOptInWhatsApp', { livreur_id: livreurProfil.id });
      const optIn = res.data?.opt_in_actif;
      setStatut(optIn);
      onOptInUpdated?.(optIn);
      if (optIn) {
        toast.success("✅ Notifications WhatsApp activées !");
      } else {
        toast.error("❌ Opt-in non détecté. Envoyez le code et réessayez.");
      }
    } catch {
      toast.error("Erreur lors de la vérification");
    } finally {
      setVerifying(false);
    }
  };

  const estActif = statut === true;
  const estInconnu = statut === null;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
      estActif ? "border-green-300 bg-green-50" :
      estInconnu ? "border-gray-200 bg-gray-50" :
      "border-red-200 bg-red-50"
    }`}>
      {/* En-tête cliquable */}
      <button
        className="w-full flex items-center justify-between p-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            estActif ? "bg-green-200" : estInconnu ? "bg-gray-200" : "bg-red-200"
          }`}>
            <MessageCircle className={`w-5 h-5 ${
              estActif ? "text-green-700" : estInconnu ? "text-gray-500" : "text-red-600"
            }`} />
          </div>
          <div className="text-left">
            <p className="font-bold text-sm text-gray-900">Notifications WhatsApp</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {estActif ? (
                <><CheckCircle2 className="w-3.5 h-3.5 text-green-600" /><span className="text-xs text-green-700 font-semibold">Activées</span></>
              ) : estInconnu ? (
                <><AlertCircle className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-500">Non vérifiées</span></>
              ) : (
                <><AlertCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-xs text-red-600 font-semibold">Non activées</span></>
              )}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Contenu expandable */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Alerte opt-in expiré */}
          {statut === false && (
            <div className="bg-red-100 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700 font-medium">
                Votre opt-in WhatsApp a expiré. Renvoyez le code ci-dessous pour réactiver les notifications.
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Pour activer :</p>
            <p className="text-xs text-gray-500">
              1. Ouvrez WhatsApp et envoyez ce message au numéro Twilio :
            </p>
            <div className="bg-gray-50 rounded-lg p-2 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Numéro</p>
                <p className="font-mono font-bold text-sm text-gray-800">{SANDBOX_NUMERO}</p>
              </div>
            </div>
            <div className="bg-primary/5 rounded-lg p-2 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Code à envoyer</p>
                <p className="font-mono font-bold text-sm text-primary">{SANDBOX_CODE}</p>
              </div>
              <button
                onClick={handleCopierCode}
                className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Copier
              </button>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-2">
            <button
              onClick={handleOuvrirWhatsApp}
              className="flex-1 h-11 rounded-xl bg-green-600 text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Ouvrir WhatsApp
            </button>
            <button
              onClick={handleVerifier}
              disabled={verifying}
              className="flex-1 h-11 rounded-xl border-2 border-primary text-primary font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {verifying ? (
                <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Vérification...</>
              ) : (
                <><RefreshCw className="w-4 h-4" /> Vérifier</>
              )}
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center">
            L'opt-in expire après 72h sans activité. Renvoyez le code si besoin.
          </p>
        </div>
      )}
    </div>
  );
}