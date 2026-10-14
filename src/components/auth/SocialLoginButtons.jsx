import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { base44 } from '@/api/base44Client';
import { availableSocialProviders, beginSocialLogin, SOCIAL_AUTH_READINESS } from '@/lib/socialAuth';

export default function SocialLoginButtons({ onError, readiness = SOCIAL_AUTH_READINESS }) {
  const [pending, setPending] = useState(null);
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  const providers = availableSocialProviders(platform, readiness, typeof base44.auth.loginWithProvider === 'function');
  if (!providers.length) return null;
  const login = provider => {
    setPending(provider);
    try {
      beginSocialLogin({ provider, platform, auth: base44.auth, location: window.location, readiness });
    } catch (error) {
      onError?.(error.message);
      setPending(null);
    }
  };
  return <div className="space-y-3">
    {providers.map(provider => <button key={provider} type="button" disabled={pending !== null}
      onClick={() => login(provider)}
      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-60">
      Continuer avec {provider === 'google' ? 'Google' : 'Apple'}
    </button>)}
    <p className="text-center text-xs text-slate-500">Ou avec votre e-mail</p>
  </div>;
}
