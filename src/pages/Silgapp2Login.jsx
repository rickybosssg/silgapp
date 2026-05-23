import { useState, useEffect } from 'react';
import { KeyRound, LogIn, ShieldCheck, Truck, Activity, CheckCircle2, XCircle, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSilgappAuth } from '@/lib/silgappAuth';
import { isCapacitorAvailable } from '@/lib/capacitorStorage';
import { getSessionNative } from '@/lib/capacitorStorage';
import { getLivreursLocaux } from '@/lib/livreursLocaux';

export default function Silgapp2Login() {
  const { signInAsAdmin, signInWithIdentificationCode, isLoadingAuth } = useSilgappAuth();
  const [mode, setMode] = useState('livreur');
  const [adminIdentifier, setAdminIdentifier] = useState('admin');
  const [adminPin, setAdminPin] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  
  // Debug state for APK
  const [debugLogs, setDebugLogs] = useState([]);
  const [isCapacitor, setIsCapacitor] = useState(false);
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [livreursCacheStatus, setLivreursCacheStatus] = useState({ loaded: false, count: 0, empty: false });
  
  useEffect(() => {
    const capacitorStatus = isCapacitorAvailable();
    setIsCapacitor(capacitorStatus);
    addLog('INIT', `APK Mode: ${capacitorStatus ? 'NATIVE' : 'WEB'}`);
    
    // Vérifier le cache des livreurs au démarrage
    checkLivreursCache();
  }, []);
  
  const checkLivreursCache = async () => {
    try {
      const livreurs = await getLivreursLocaux();
      const count = livreurs?.length || 0;
      const isEmpty = count === 0;
      
      setLivreursCacheStatus({
        loaded: true,
        count,
        empty: isEmpty
      });
      
      addLog('CACHE_LIVREURS', `${count} livreurs en cache ${isEmpty ? '(VIDE!)' : ''}`);
      
      if (isEmpty && isCapacitor) {
        addLog('WARNING', '⚠️ Cache livreurs VIDE - synchronisation requise');
      }
    } catch (error) {
      console.error('[Login] Failed to check livreurs cache:', error);
      setLivreursCacheStatus({ loaded: true, count: 0, empty: true });
    }
  };
  
  // Update button disabled state
  useEffect(() => {
    const isDisabled = isLoadingAuth || (mode === 'livreur' ? !code.trim() : !adminIdentifier.trim() || !adminPin.trim());
    setButtonDisabled(isDisabled);
    if (mode === 'livreur') {
      addLog('BTN_STATE', `Bouton ${isDisabled ? 'DÉSACTIVÉ' : 'ACTIF'} - code: "${code}", trim: "${code.trim()}", empty: ${!code.trim()}`);
    }
  }, [code, adminIdentifier, adminPin, isLoadingAuth, mode]);
  
  const addLog = (step, message, data = null) => {
    const timestamp = new Date().toLocaleTimeString('fr-FR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    console.log(`[DEBUG] ${step}: ${message}`, data || '');
    setDebugLogs(prev => [...prev, { timestamp, step, message, data }]);
  };

  const handleCodeChange = (event) => {
    const newValue = event.target.value.toUpperCase();
    console.log('[DEBUG] CODE_CHANGE_EVENT:', newValue);
    addLog('CODE_CHANGE', `Code changé: "${newValue}"`);
    setCode(newValue);
  };

  const handleButtonClick = async (event) => {
    console.log('[DEBUG] BUTTON_CLICKED - mode:', mode, 'code:', code, 'isLoadingAuth:', isLoadingAuth);
    addLog('CLICK_LOGIN', `🖱️ BOUTON CLIQUÉ! mode=${mode}, code="${code}", isLoadingAuth=${isLoadingAuth}`);
    
    if (isLoadingAuth) {
      addLog('BLOCKED', '❌ Bloqué: isLoadingAuth=true');
      return;
    }
    
    if (mode === 'livreur' && !code.trim()) {
      addLog('BLOCKED', '❌ Bloqué: code vide');
      addLog('CODE_VIDE', '⚠️ Code vide détecté!');
      event.preventDefault();
      return;
    }
  };

  const handleSubmit = async (event) => {
    console.log('========== FORM_SUBMIT_START ==========');
    addLog('SUBMIT_START', '📝 FORMULAIRE SOUMIS!');
    
    event.preventDefault();
    addLog('PREVENT_DEFAULT', '✅ event.preventDefault() appelé');
    
    console.log('[DEBUG] Checking isLoadingAuth:', isLoadingAuth);
    if (isLoadingAuth) {
      addLog('BLOCKED', '❌ Bloqué: isLoadingAuth=true');
      console.log('[DEBUG] BLOCKED - isLoadingAuth');
      return;
    }
    
    console.log('[DEBUG] Starting connection for mode:', mode);
    addLog('START', `✅ Connexion ${mode} demandée`);
    setDebugLogs([]);
    setError('');
    
    if (mode === 'livreur') {
      addLog('CODE', `Code saisi: "${code}" (length: ${code.length})`);
      addLog('CAPACITOR', `Disponible: ${isCapacitor}`);
    }

    try {
      if (mode === 'admin') {
        addLog('ADMIN', `Tentative avec identifier: "${adminIdentifier}"`);
        console.log('[DEBUG] Calling signInAsAdmin...');
        await signInAsAdmin({ identifier: adminIdentifier, pin: adminPin });
        addLog('SUCCESS', 'Connexion admin réussie');
        console.log('[DEBUG] Admin login success');
        toast.success('Connexion admin reussie');
        return;
      }

      addLog('LIVREUR', '📡 Appel à signInWithIdentificationCode...');
      console.log('[DEBUG] Calling signInWithIdentificationCode with code:', code);
      
      try {
        const user = await signInWithIdentificationCode(code);
        
        console.log('[DEBUG] User returned:', user);
        addLog('USER_FOUND', `✅ Livreur trouvé: ${user.full_name}`);
        addLog('USER_DATA', null, {
          id: user.id,
          role: user.role,
          livreur_id: user.livreur_id,
          code_identification: user.code_identification
        });
        
        // Re-read session immediately
        if (isCapacitor) {
          console.log('[DEBUG] Reading native session...');
          const session = await getSessionNative();
          addLog('SESSION_REREAD', session ? '✅ Session lue après sauvegarde' : '❌ Session NON trouvée', session);
        } else {
          const sessionRaw = localStorage.getItem('silgapp_code_identification_session');
          addLog('SESSION_REREAD', sessionRaw ? '✅ Session lue après sauvegarde' : '❌ Session NON trouvée');
        }
        
        addLog('REDIRECT', '➡️ Redirection vers dashboard livreur...');
        console.log('[DEBUG] Login complete, navigation should happen');
        toast.success('Connexion livreur reussie');
      } catch (innerError) {
        console.error('[DEBUG] Inner error in signInWithIdentificationCode:', innerError);
        throw innerError;
      }
    } catch (authError) {
      console.error('[DEBUG] Outer catch - AUTH_ERROR:', authError);
      const message = authError?.message || 'Connexion impossible.';
      addLog('ERROR', `❌ Échec: ${message}`, { 
        code: authError?.code, 
        stack: authError?.stack,
        fullError: JSON.stringify(authError, Object.getOwnPropertyNames(authError))
      });
      console.error('[DEBUG] AUTH_ERROR details:', authError);
      setError(message);
      toast.error(message);
    }
  };

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

        <form className="space-y-4" onSubmit={handleSubmit} onClick={(e) => console.log('[DEBUG] FORM_CLICK', e.target)}>
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
                  onChange={handleCodeChange}
                  className="h-14 pl-12 bg-white/10 border-white/15 text-white placeholder:text-slate-500 rounded-xl uppercase"
                />
              </div>
              <div className="text-xs text-slate-400">
                Code actuel: <span className="text-white font-mono">{code || '(vide)'}</span> (length: {code.length})
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
                    onChange={(event) => setAdminIdentifier(event.target.value)}
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
                    onChange={(event) => setAdminPin(event.target.value)}
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
          
          {/* Alert if livreurs cache is empty */}
          {mode === 'livreur' && livreursCacheStatus.loaded && livreursCacheStatus.empty && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-100">
              <div className="flex items-start gap-2">
                <Database className="w-4 h-4 mt-0.5" />
                <div>
                  <p className="font-bold mb-1">Synchronisation requise</p>
                  <p className="text-xs opacity-90">
                    Aucun code livreur enregistré. Un administrateur doit synchroniser les codes dans Paramètres.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button
            type="submit"
            onClick={handleButtonClick}
            className="w-full h-14 bg-red-600 hover:bg-red-700 rounded-xl text-base font-bold"
            disabled={buttonDisabled}
          >
            {isLoadingAuth ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
            {isLoadingAuth ? 'Connexion...' : 'Se connecter'}
          </Button>
          
          {buttonDisabled && mode === 'livreur' && (
            <div className="text-xs text-center text-red-400">
              ⚠️ Bouton désactivé: {isLoadingAuth ? 'Chargement...' : !code ? 'Code vide' : `Code: "${code}" (trim: "${code.trim()}")`}
            </div>
          )}
          
          {/* Cache status indicator */}
          {mode === 'livreur' && livreursCacheStatus.loaded && (
            <div className="text-xs text-center text-slate-400">
              {livreursCacheStatus.count > 0 ? (
                <span className="text-green-400">✅ {livreursCacheStatus.count} codes livreurs synchronisés</span>
              ) : (
                <span className="text-amber-400">⚠️ Cache vide</span>
              )}
            </div>
          )}
        </form>

        {/* DEBUG PANEL - APK ONLY */}
        {mode === 'livreur' && debugLogs.length > 0 && (
          <div className="rounded-xl bg-slate-900/50 border border-slate-700 p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-blue-400">DEBUG APK - Flux de connexion</h3>
            </div>
            
            <div className="max-h-96 overflow-y-auto space-y-1.5 text-xs font-mono">
              {debugLogs.map((log, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                  <span className={`shrink-0 font-bold ${
                    log.step === 'ERROR' ? 'text-red-400' :
                    log.step === 'SUCCESS' ? 'text-green-400' :
                    log.step === 'CODE' || log.step === 'LIVREUR' ? 'text-yellow-400' :
                    'text-blue-400'
                  }`}>
                    {log.step}:
                  </span>
                  <span className="text-slate-300 break-all">{log.message}</span>
                </div>
              ))}
              
              {debugLogs.some(log => log.step === 'USER_DATA') && (
                <div className="pt-2 mt-2 border-t border-slate-700">
                  <div className="text-green-400 font-bold mb-1">📊 Données session:</div>
                  {(() => {
                    const userDataLog = debugLogs.find(log => log.step === 'USER_DATA');
                    return userDataLog?.data ? (
                      <div className="space-y-1 text-slate-400">
                        <div>ID: <span className="text-white">{userDataLog.data.id}</span></div>
                        <div>Role: <span className="text-white">{userDataLog.data.role}</span></div>
                        <div>Livreur ID: <span className="text-white">{userDataLog.data.livreur_id}</span></div>
                        <div>Code: <span className="text-white">{userDataLog.data.code_identification}</span></div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              
              {debugLogs.some(log => log.step === 'SESSION_REREAD') && (
                <div className="pt-2 mt-2 border-t border-slate-700">
                  {(() => {
                    const sessionLog = debugLogs.find(log => log.step === 'SESSION_REREAD');
                    const isSuccess = sessionLog?.message?.includes('✅');
                    return (
                      <div className={`font-bold ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
                        {isSuccess ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <XCircle className="w-3 h-3 inline mr-1" />}
                        {sessionLog?.message}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}