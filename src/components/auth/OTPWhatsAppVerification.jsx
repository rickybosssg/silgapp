import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircle, ShieldCheck, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * OTPWhatsAppVerification — Étape de vérification OTP via WhatsApp (Twilio Verify)
 *
 * Totalement indépendant de VENUS. Utilise les fonctions backend:
 *   - envoyerOTPWhatsApp (démarre la vérification Twilio Verify)
 *   - verifierOTPWhatsApp (vérifie le code saisi)
 *
 * Props:
 *   - telephone: string (format international digits, ex: "22655483838")
 *   - onVerified: () => void  (appelé après vérification réussie)
 *   - onCancel: () => void   (retour en arrière)
 */
export default function OTPWhatsAppVerification({ telephone, onVerified, onCancel }) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [sentAt, setSentAt] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verified, setVerified] = useState(false);
  const inputsRef = useRef([]);

  // ── Envoi automatique du code au montage ──
  useEffect(() => {
    sendOTP(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Compte à rebours pour le renvoi ──
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendOTP = async (isInitial = false) => {
    setSending(true);
    setError("");
    setInfo(isInitial ? "Envoi du code WhatsApp en cours…" : "Renvoi du code…");
    try {
      const res = await base44.functions.invoke("envoyerOTPWhatsApp", { telephone });
      if (res?.success) {
        setSentAt(new Date());
        setResendCooldown(45);
        setInfo(isInitial
          ? "Un code à 6 chiffres a été envoyé par WhatsApp. Saisissez-le ci-dessous."
          : "Un nouveau code a été envoyé par WhatsApp.");
        // Focus sur le premier input
        setTimeout(() => inputsRef.current[0]?.focus(), 100);
      } else {
        setError(res?.error || "Échec de l'envoi du code WhatsApp.");
      }
    } catch (err) {
      setError(err?.message || "Erreur lors de l'envoi du code.");
    } finally {
      setSending(false);
    }
  };

  const handleCodeChange = (idx, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    setError("");
    if (digit && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
    // Auto-submit quand les 6 chiffres sont saisis
    if (digit && idx === 5 && next.every((c) => c !== "")) {
      verifyCode(next.join(""));
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    if (pasted.length === 0) return;
    const next = ["", "", "", "", "", ""];
    pasted.forEach((d, i) => { next[i] = d; });
    setCode(next);
    const lastFilled = Math.min(pasted.length, 6) - 1;
    inputsRef.current[Math.min(lastFilled + 1, 5)]?.focus();
    if (next.every((c) => c !== "")) verifyCode(next.join(""));
  };

  const verifyCode = async (codeStr) => {
    setVerifying(true);
    setError("");
    try {
      const res = await base44.functions.invoke("verifierOTPWhatsApp", {
        telephone,
        code: codeStr,
      });
      if (res?.success) {
        setVerified(true);
        setInfo("Numéro vérifié avec succès !");
        setTimeout(() => onVerified?.(), 700);
      } else {
        setError(res?.error || "Code incorrect. Réessayez.");
        // Effacer les inputs pour faciliter la nouvelle saisie
        setCode(["", "", "", "", "", ""]);
        inputsRef.current[0]?.focus();
      }
    } catch (err) {
      setError(err?.message || "Erreur lors de la vérification.");
      setCode(["", "", "", "", "", ""]);
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const fullCode = code.join("");

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
          {verified ? (
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          ) : (
            <MessageCircle className="h-8 w-8 text-green-600" />
          )}
        </div>
        <h2 className="text-xl font-black text-foreground">Vérification WhatsApp</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Code envoyé au <span className="font-bold">+{telephone}</span>
        </p>
      </div>

      {info && !error && !verified && (
        <div className="flex items-start gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <MessageCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{info}</span>
        </div>
      )}

      {verified && (
        <div className="flex items-start gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{info}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 font-medium">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Saisie du code (6 cases) ── */}
      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {code.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => (inputsRef.current[idx] = el)}
            type="tel"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={verifying || verified}
            onChange={(e) => handleCodeChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className="h-14 w-12 rounded-xl border-2 border-input bg-background text-center text-2xl font-black text-foreground outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30 disabled:opacity-50"
          />
        ))}
      </div>

      {/* ── Bouton vérifier ── */}
      <Button
        onClick={() => fullCode.length === 6 && verifyCode(fullCode)}
        disabled={verifying || verified || fullCode.length !== 6}
        className="h-14 w-full rounded-2xl bg-gradient-to-r from-green-500 to-green-600 text-base font-bold text-white shadow-lg shadow-green-500/20"
      >
        {verifying ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Vérification…
          </>
        ) : verified ? (
          <>
            <CheckCircle2 className="h-5 w-5 mr-2" /> Vérifié
          </>
        ) : (
          <>
            <ShieldCheck className="h-5 w-5 mr-2" /> Vérifier le code
          </>
        )}
      </Button>

      {/* ── Renvoi / Retour ── */}
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground font-medium"
        >
          ← Modifier le numéro
        </button>
        <button
          type="button"
          onClick={() => sendOTP(false)}
          disabled={sending || resendCooldown > 0 || verifying}
          className="flex items-center gap-1.5 font-semibold text-green-600 hover:text-green-700 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : "Renvoyer le code"}
        </button>
      </div>
    </div>
  );
}