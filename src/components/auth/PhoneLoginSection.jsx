import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Phone, RefreshCw, AlertCircle, CheckCircle2, ShieldCheck, ArrowLeft } from "lucide-react";
import { SILGAPP_COUNTRIES, getCountryConfig, extractLocalPhone, phonePlaceholder } from "@/lib/phoneUtils";

/**
 * PhoneLoginSection — Connexion par numéro de téléphone + OTP SMS
 *
 * Flux:
 *   1. Utilisateur saisit son numéro (+ pays)
 *   2. loginOTPSMS : valide le compte, envoie un code SMS via Twilio Verify
 *   3. Utilisateur saisit le code
 *   4. verifierOTPSMSLogin : vérifie le code, génère un token de session
 *   5. On success : onLoginSuccess(access_token) → sauvegarde session + retry auth
 *
 * Indépendant de VENUS. Canal SMS exclusivement.
 */
export default function PhoneLoginSection({ onLoginSuccess }) {
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [countryCode, setCountryCode] = useState("BF");
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [fullPhone, setFullPhone] = useState(""); // format international digits
  const inputsRef = useRef([]);

  // ── Compte à rebours 60s pour le renvoi ──
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const country = getCountryConfig(countryCode);

  const handlePhoneChange = (e) => {
    const local = extractLocalPhone(e.target.value, countryCode);
    setPhoneInput(local);
    setError("");
  };

  const sendOTP = async (isInitial = true) => {
    setError("");
    setInfo("");
    const local = extractLocalPhone(phoneInput, countryCode);
    if (local.length !== country.len) {
      setError(`Le numéro doit contenir ${country.len} chiffres.`);
      return;
    }
    setLoading(true);
    setInfo(isInitial ? "Envoi du code SMS en cours…" : "Renvoi du code…");
    try {
      const res = await base44.functions.invoke("loginOTPSMS", {
        telephone: local,
        country_code: countryCode,
      });
      if (res?.success) {
        const normalized = res.telephone || `${country.dial}${local}`;
        setFullPhone(normalized);
        setStep("otp");
        setResendCooldown(60);
        setInfo(isInitial
          ? `Un code à 6 chiffres a été envoyé par SMS au +${normalized}. Saisissez-le ci-dessous.`
          : "Un nouveau code a été envoyé par SMS.");
        setCode(["", "", "", "", "", ""]);
        setTimeout(() => inputsRef.current[0]?.focus(), 100);
      } else {
        setError(res?.error || "Échec de l'envoi du code SMS.");
      }
    } catch (err) {
      setError(err?.message || "Erreur lors de l'envoi du code.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (idx, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    setError("");
    if (digit && idx < 5) inputsRef.current[idx + 1]?.focus();
    if (digit && idx === 5 && next.every((c) => c !== "")) verifyCode(next.join(""));
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
    if (!pasted.length) return;
    const next = ["", "", "", "", "", ""];
    pasted.forEach((d, i) => { next[i] = d; });
    setCode(next);
    inputsRef.current[Math.min(pasted.length, 5)]?.focus();
    if (next.every((c) => c !== "")) verifyCode(next.join(""));
  };

  const verifyCode = async (codeStr) => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("verifierOTPSMSLogin", {
        telephone: fullPhone,
        code: codeStr,
      });
      if (res?.success && res?.access_token) {
        setInfo("Connexion réussie !");
        onLoginSuccess?.(res.access_token);
      } else {
        setError(res?.error || "Code incorrect. Réessayez.");
        setCode(["", "", "", "", "", ""]);
        inputsRef.current[0]?.focus();
      }
    } catch (err) {
      setError(err?.message || "Erreur lors de la vérification.");
      setCode(["", "", "", "", "", ""]);
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const fullCode = code.join("");

  // ── Étape 1 : Saisie du numéro ──
  if (step === "phone") {
    return (
      <div className="space-y-4">
        {info && !error && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
            <Loader2 className="h-4 w-4 mt-0.5 animate-spin shrink-0" />
            <span>{info}</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-200">Numéro de téléphone</span>
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => { setCountryCode(e.target.value); setPhoneInput(""); setError(""); }}
              disabled={loading}
              className="rounded-xl border border-slate-700 bg-[#0b1220] px-3 py-3.5 text-sm text-white font-semibold outline-none focus:border-cyan-400"
            >
              {SILGAPP_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>+{c.dial}</option>
              ))}
            </select>
            <div className="relative flex-1">
              <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-300" />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phoneInput}
                onChange={handlePhoneChange}
                disabled={loading}
                className="w-full rounded-xl border border-slate-700 bg-[#0b1220] py-3.5 pl-11 pr-4 text-sm text-white caret-white outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-blue-500/15"
                placeholder={phonePlaceholder(countryCode)}
              />
            </div>
          </div>
        </label>

        <button
          type="button"
          onClick={() => sendOTP(true)}
          disabled={loading || phoneInput.length !== country.len}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b62b5] px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#084f94] active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          Envoyer le code SMS
        </button>
      </div>
    );
  }

  // ── Étape 2 : Saisie du code OTP ──
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15">
          {info === "Connexion réussie !" ? (
            <CheckCircle2 className="h-6 w-6 text-green-400" />
          ) : (
            <ShieldCheck className="h-6 w-6 text-blue-300" />
          )}
        </div>
        <p className="text-sm text-slate-300">
          Code envoyé au <span className="font-bold text-white">+{fullPhone}</span>
        </p>
      </div>

      {info && !error && info !== "Connexion réussie !" && (
        <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{info}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {code.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => (inputsRef.current[idx] = el)}
            type="tel"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={loading}
            onChange={(e) => handleCodeChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className="h-14 w-12 rounded-xl border-2 border-slate-700 bg-[#0b1220] text-center text-2xl font-black text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => fullCode.length === 6 && verifyCode(fullCode)}
        disabled={loading || fullCode.length !== 6}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0b62b5] px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#084f94] active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
        Vérifier et me connecter
      </button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => { setStep("phone"); setError(""); setInfo(""); setCode(["", "", "", "", "", ""]); }}
          disabled={loading}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Modifier le numéro
        </button>
        <button
          type="button"
          onClick={() => sendOTP(false)}
          disabled={loading || resendCooldown > 0}
          className="flex items-center gap-1.5 font-semibold text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : "Renvoyer le code"}
        </button>
      </div>
    </div>
  );
}