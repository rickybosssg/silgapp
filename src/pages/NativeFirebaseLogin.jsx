import { useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';

export default function NativeFirebaseLogin() {
  const { signInWithIdentificationCode, isLoadingAuth } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const submitLogin = async (event) => {
    event.preventDefault();
    if (!code.trim() || isLoadingAuth) return;

    try {
      setError('');
      await signInWithIdentificationCode(code.trim());
    } catch (authError) {
      console.error('[NativeFirebaseLogin] Identification code login failed:', authError);
      setError(authError?.message || "Code d'identification incorrect.");
    }
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
            <p className="text-slate-400 mt-2">Connexion livreur</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submitLogin}>
          <div className="relative">
            <KeyRound className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              placeholder="Code d'identification"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="h-14 pl-12 bg-white/10 border-white/15 text-white placeholder:text-slate-500 rounded-xl uppercase"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-14 bg-red-600 hover:bg-red-700 rounded-xl text-base font-bold"
            disabled={isLoadingAuth || !code.trim()}
          >
            <LogIn className="w-5 h-5 mr-2" />
            {isLoadingAuth ? 'Connexion...' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  );
}
