import { useState } from 'react';
import { LogIn, Mail, Lock, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';

export default function NativeFirebaseLogin() {
  const { signInWithEmailAndPassword, createUserWithEmailAndPassword, isLoadingAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const friendlyError = (message) => {
    const value = message || '';
    if (value.includes('EMAIL_NOT_FOUND') || value.includes('INVALID_LOGIN_CREDENTIALS')) {
      return 'Email ou mot de passe incorrect.';
    }
    if (value.includes('INVALID_PASSWORD')) return 'Mot de passe incorrect.';
    if (value.includes('EMAIL_EXISTS')) return 'Ce compte existe deja. Utilisez Se connecter.';
    if (value.includes('WEAK_PASSWORD')) return 'Le mot de passe doit contenir au moins 6 caracteres.';
    if (value.includes('OPERATION_NOT_ALLOWED')) return 'Email/mot de passe n est pas active dans Firebase.';
    return value || 'Connexion impossible.';
  };

  const runAuthAction = async (action) => {
    try {
      setError('');
      await action();
    } catch (authError) {
      console.error('[NativeFirebaseLogin] Auth failed:', authError);
      setError(friendlyError(authError?.message));
    }
  };

  const submitLogin = (event) => {
    event.preventDefault();
    if (!email || !password || isLoadingAuth) return;
    runAuthAction(() => signInWithEmailAndPassword(email.trim(), password));
  };

  const submitCreateAccount = () => {
    if (!email || !password || isLoadingAuth) return;
    runAuthAction(() => createUserWithEmailAndPassword(email.trim(), password));
  };

  return (
    <div className="min-h-screen bg-[#050914] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 rounded-3xl bg-red-600 mx-auto flex items-center justify-center shadow-2xl shadow-red-600/25">
            <span className="text-5xl font-black">S</span>
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-normal">SILGAPP</h1>
            <p className="text-slate-400 mt-2">Connexion securisee Firebase</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submitLogin}>
          <div className="space-y-3">
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-14 pl-12 bg-white/10 border-white/15 text-white placeholder:text-slate-500 rounded-xl"
              />
            </div>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Mot de passe"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-14 pl-12 bg-white/10 border-white/15 text-white placeholder:text-slate-500 rounded-xl"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-14 bg-red-600 hover:bg-red-700 rounded-xl text-base font-bold"
            disabled={isLoadingAuth || !email || !password}
          >
            <LogIn className="w-5 h-5 mr-2" />
            {isLoadingAuth ? 'Connexion...' : 'Se connecter'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white rounded-xl"
            disabled={isLoadingAuth || !email || !password}
            onClick={submitCreateAccount}
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Creer un compte
          </Button>
        </form>
      </div>
    </div>
  );
}
