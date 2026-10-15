import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { base44 } from '@/api/base44Client';
import { availableSocialProviders, beginSocialLogin, SOCIAL_AUTH_READINESS } from '@/lib/socialAuth';
import { getNativeSocialLoginBridge } from '@/lib/nativeSocialAuthRuntime';

export default function SocialLoginButtons({ onError, onAuthenticated, onPendingChange, disabled = false, readiness = SOCIAL_AUTH_READINESS,
  nativeBridge = getNativeSocialLoginBridge() }) {
  const [pending, setPending] = useState(null);
  const mounted = useRef(true), submitting = useRef(false), callbacks = useRef({ onError, onAuthenticated, onPendingChange });
  callbacks.current = { onError, onAuthenticated, onPendingChange };
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  const providers = availableSocialProviders(platform, readiness, typeof base44.auth.loginWithProvider === 'function', nativeBridge);
  const providersKey = providers.join(",");
  useEffect(() => {
    mounted.current = true;
    if (!nativeBridge || platform === 'web' || !providers.length) return () => { mounted.current = false; };
    const error = value => {
      if (!mounted.current) return;
      submitting.current = false;
      callbacks.current.onPendingChange?.(false);
      setPending(null);
      if (value?.code !== 'NATIVE_AUTH_CANCELLED') callbacks.current.onError?.(value?.message);
    };
    const unsubscribe = nativeBridge.subscribe({ error, authenticated: () => {
      if (!mounted.current) return;
      submitting.current = false;
      callbacks.current.onPendingChange?.(false);
      setPending(null);
      callbacks.current.onAuthenticated?.();
    } });
    nativeBridge.restore().catch(error);
    return () => { mounted.current = false; submitting.current = false; callbacks.current.onPendingChange?.(false); unsubscribe(); nativeBridge.dispose().catch(() => {}); };
  }, [nativeBridge, platform, providersKey]);
  if (!providers.length) return null;
  const login = async provider => {
    if (disabled || submitting.current) return;
    if (callbacks.current.onPendingChange?.(true) === false) return;
    submitting.current = true;
    setPending(provider);
    try {
      if (platform === 'web') beginSocialLogin({ provider, platform, auth: base44.auth, location: window.location, readiness });
      else await nativeBridge.login(provider);
    } catch (error) {
      if (mounted.current) {
        submitting.current = false;
        callbacks.current.onPendingChange?.(false);
        if (error?.code !== 'NATIVE_AUTH_CANCELLED') callbacks.current.onError?.(error.message);
        setPending(null);
      }
    }
  };
  return <div className="space-y-3">
    {providers.map(provider => <button key={provider} type="button" disabled={disabled || pending !== null}
      onClick={() => login(provider)}
      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-60">
      Continuer avec {provider === 'google' ? 'Google' : 'Apple'}
    </button>)}
    {pending && platform !== 'web' && <button type="button" onClick={() => nativeBridge.cancel()}
      className="w-full text-sm text-slate-500">Annuler la connexion</button>}
    <p className="text-center text-xs text-slate-500">Ou avec votre e-mail</p>
  </div>;
}
