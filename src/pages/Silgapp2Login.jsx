import { useState, useEffect } from 'react';
import { KeyRound, LogIn, ShieldCheck, Truck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSilgappAuth } from '@/lib/silgappAuth';
import { getLivreursLocaux } from '@/lib/livreursLocaux';

export default function Silgapp2Login() {
  const { signInAsAdmin, signInWithIdentificationCode, isLoadingAuth } = useSilgappAuth();
  const [mode, setMode] = useState('livreur');
  const [adminIdentifier, setAdminIdentifier] = useState('admin');
  const [adminPin, setAdminPin] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getLivreursLocaux().then((livreurs) => {
      if ((livreurs?.length || 0) === 0) {
        toast('Codes indisponibles', { duration: 2000 });
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isLoadingAuth) return;

    setError('');

    try {
      if (mode === 'admin') {
        await signInAsAdmin({ identifier: adminIdentifier, pin: adminPin });
        toast.success('Connexion admin reussie');
        return;
      }

      await signInWithIdentificationCode(code);
      toast.success('Connexion livreur reussie');
    } catch (authError) {
      const message = authError?.message || 'Connexion impossible.';
      setError(message);
      toast.error(message);
    }
  };

  const isButtonDisabled = isLoadingAuth || (mode === 'livreur' ? !code.trim() : !adminIdentifier.trim() || !adminPin.trim());

  return (
    <div className="min-h-screen bg-[#050914] text-white flex items-center justify-center p-6" data-dynamic-content="silgapp2-login">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 rounded-3xl bg-red-600 mx-auto flex items-center justify-center shadow-2xl shadow-red-600/25">
            <span className="text-5xl font-black">S</span>
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-normal">SILGAPP 2</h1>
            <p className="text-slate-400 mt-2">Silga Livraison</p>
          </div>
        </div>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid grid-cols-2 bg-white/10 border border-white/10">
            <TabsTrigger value="livreur" className="gap-2 data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Truck className="w-4 h-4" />
              Livreur
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-2 data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <ShieldCheck className="w-4 h-4" />
              Admin
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === 'livreur' ? (
            <div className="space-y-2">
              <Label className="text-slate-300">Code d'identification</Label>
              <div className="relative">
                <KeyRound className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  placeholder="Ex: LIV-001"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="h-14 pl-12 bg-white/10 border-white/15 text-white placeholder:text-slate-500 rounded-xl uppercase"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Identifiant admin</Label>
                <div className="relative">
                  <ShieldCheck className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="text"
                    autoComplete="username"
                    value={adminIdentifier}
                    onChange={(e) => setAdminIdentifier(e.target.value)}
                    className="h-14 pl-12 bg-white/10 border-white/15 text-white placeholder:text-slate-500 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">PIN admin</Label>
                <div className="relative">
                  <KeyRound className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    className="h-14 pl-12 bg-white/10 border-white/15 text-white placeholder:text-slate-500 rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-14 bg-red-600 hover:bg-red-700 rounded-xl text-base font-bold"
            disabled={isButtonDisabled}
          >
            {isLoadingAuth ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
            {isLoadingAuth ? 'Connexion...' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  );
}