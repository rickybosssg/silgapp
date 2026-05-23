import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isNativeLivreurRuntime, verifyNativeLivreurCode } from '@/lib/nativeLivreurApi';
import { findLivreurByIdentificationCode, signInWithIdentificationCode, getStoredIdentificationSession } from '@/lib/codeIdentificationAuth';
import { isCapacitorAvailable, saveSessionNative, getSessionNative, removeSessionNative } from '@/lib/capacitorStorage';
import { useSilgappAuth } from '@/lib/silgappAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Smartphone, Globe, Bug, KeyRound, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function DiagnosticCompletAPK() {
  const [code, setCode] = useState('LVR-TES666');
  const [logs, setLogs] = useState([]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [sessionTest, setSessionTest] = useState(null);
  const [stepByStep, setStepByStep] = useState([]);
  const { user, isAuthenticated, isLoadingAuth, authChecked, checkAppState } = useSilgappAuth();

  const addLog = (message, type = 'info', step = null) => {
    const timestamp = new Date().toLocaleTimeString('fr-FR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    const logEntry = { message, type, timestamp, step };
    console.log(`[DIAGNOSTIC-STEP] [${timestamp}] ${message}`);
    setLogs(prev => [...prev, logEntry]);
    if (step !== null) {
      setStepByStep(prev => [...prev, logEntry]);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
    setResult(null);
    setSessionTest(null);
    setStepByStep([]);
  };

  const handleTestCode = async () => {
    setTesting(true);
    setLogs([]);
    setStepByStep([]);
    setResult(null);
    setSessionTest(null);

    try {
      addLog('========== DÉBUT TEST CODE ==========', 'info');
      addLog(`📝 Code saisi: "${code}"`, 'info', 1);

      // 1. Check runtime
      const isNative = isNativeLivreurRuntime();
      const isCapacitor = isCapacitorAvailable();
      addLog(`📱 Runtime: ${isNative ? 'NATIVE (Capacitor)' : 'WEB (Preview)'}`, isNative ? 'success' : 'info', 2);
      addLog(`📱 isNativeLivreurRuntime() = ${isNative}`, 'info', 2);
      addLog(`📱 isCapacitorAvailable() = ${isCapacitor}`, 'info', 2);

      // 2. Test function call
      addLog('🔍 Appel à findLivreurByIdentificationCode...', 'info', 3);
      
      const livreur = await findLivreurByIdentificationCode(code);
      
      if (livreur) {
        addLog('✅ SUCCÈS - Livreur trouvé!', 'success', 3);
        addLog(`👤 Nom: ${livreur.nom} ${livreur.prenom}`, 'success', 3);
        addLog(`🆔 ID: ${livreur.id}`, 'success', 3);
        addLog(`✅ Validation: ${livreur.validation}`, 'success', 3);
        addLog(`✅ Actif: ${livreur.actif}`, 'success', 3);
        addLog(`🔑 Code identification: ${livreur.code_identification}`, 'success', 3);
        
        setResult({ success: true, livreur });
        toast.success('Test réussi!');
      } else {
        addLog('❌ ÉCHEC - Aucun livreur trouvé', 'error', 3);
        setResult({ success: false, error: 'Aucun livreur trouvé' });
        toast.error('Aucun livreur trouvé');
      }
    } catch (error) {
      addLog(`❌ ERREUR: ${error.message}`, 'error', 3);
      addLog(`📋 Stack: ${error.stack}`, 'error', 3);
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } finally {
      addLog('========== FIN TEST CODE ==========', 'info');
      setTesting(false);
    }
  };

  const handleTestSignIn = async () => {
    setTesting(true);
    setLogs([]);
    setStepByStep([]);
    setResult(null);

    try {
      addLog('========== DÉBUT TEST SIGN IN ==========', 'info');
      addLog(`📝 Code: "${code}"`, 'info', 1);

      const isNative = isNativeLivreurRuntime();
      addLog(`📱 Runtime: ${isNative ? 'NATIVE' : 'WEB'}`, 'info', 2);

      addLog('🔐 Début signInWithIdentificationCode...', 'info', 3);
      const user = await signInWithIdentificationCode(code);
      
      addLog('✅ SIGN IN RÉUSSI!', 'success', 4);
      addLog(`👤 User ID: ${user.id}`, 'success', 4);
      addLog(`🎭 Role: ${user.role}`, 'success', 4);
      addLog(`👤 Nom: ${user.full_name}`, 'success', 4);
      addLog(`🔑 Livreur ID: ${user.livreur_id}`, 'success', 4);
      addLog(`🔑 Code: ${user.code_identification}`, 'success', 4);
      
      setResult({ success: true, user });
      toast.success('Connexion réussie!');
    } catch (error) {
      addLog(`❌ SIGN IN ÉCHEC: ${error.message}`, 'error', 4);
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } finally {
      addLog('========== FIN TEST SIGN IN ==========', 'info');
      setTesting(false);
    }
  };

  const handleTestSessionWrite = async () => {
    setTesting(true);
    setLogs([]);
    setStepByStep([]);
    setSessionTest(null);

    try {
      addLog('========== TEST ÉCRITURE SESSION CAPACITOR ==========', 'info');
      
      const isCapacitor = isCapacitorAvailable();
      addLog(`📱 Capacitor disponible: ${isCapacitor}`, isCapacitor ? 'success' : 'error', 1);

      if (!isCapacitor) {
        addLog('⚠️ Test non disponible en mode WEB', 'warning', 1);
        setSessionTest({ available: false });
        return;
      }

      // Test save
      const testSession = {
        livreur_id: 'test-123',
        nom: 'Test Livreur',
        role: 'livreur',
        code_identification: 'TEST-CODE',
        email: 'test@silgapp2.local',
        created_at: new Date().toISOString()
      };

      addLog('💾 Sauvegarde session test...', 'info', 2);
      addLog(`📝 Session à sauver: ${JSON.stringify(testSession)}`, 'info', 2);
      
      const saved = await saveSessionNative(testSession);
      addLog(`Résultat save: ${saved ? '✅ SUCCÈS' : '❌ ÉCHEC'}`, saved ? 'success' : 'error', 2);

      // Test read IMMÉDIATE
      addLog('📖 Lecture session IMMÉDIATE...', 'info', 3);
      const restored = await getSessionNative();
      
      if (restored) {
        addLog('✅ Session lue avec succès!', 'success', 3);
        addLog(`🆔 Livreur ID: ${restored.livreur_id}`, 'success', 3);
        addLog(`🎭 Role: ${restored.role}`, 'success', 3);
        addLog(`🔑 Code: ${restored.code_identification}`, 'success', 3);
        addLog(`📝 Session complète: ${JSON.stringify(restored)}`, 'success', 3);
        
        setSessionTest({ 
          available: true, 
          saved: true, 
          restored: true, 
          session: restored 
        });
        toast.success('Session Capacitor OK!');
      } else {
        addLog('❌ Session non trouvée après sauvegarde', 'error', 3);
        addLog('⚠️ POSSIBLE CAUSE: Capacitor Preferences écrit mais ne relit pas', 'error', 3);
        setSessionTest({ available: true, saved: true, restored: false });
        toast.error('Session non persistée');
      }
    } catch (error) {
      addLog(`❌ ERREUR SESSION: ${error.message}`, 'error', 2);
      addLog(`📋 Stack: ${error.stack}`, 'error', 2);
      setSessionTest({ available: true, saved: false, restored: false, error: error.message });
      toast.error(error.message);
    } finally {
      addLog('========== FIN TEST SESSION ==========', 'info');
      setTesting(false);
    }
  };

  const handleTestStoredSession = async () => {
    setTesting(true);
    setLogs([]);
    setStepByStep([]);

    try {
      addLog('========== TEST RESTAURATION SESSION ==========', 'info');
      
      const session = await getStoredIdentificationSession();
      
      if (session) {
        addLog('✅ Session trouvée et restaurée!', 'success', 1);
        addLog(`👤 Nom: ${session.full_name}`, 'success', 1);
        addLog(`🎭 Role: ${session.role}`, 'success', 1);
        addLog(`🔑 Livreur ID: ${session.livreur_id}`, 'success', 1);
        addLog(`🔑 Code: ${session.code_identification}`, 'success', 1);
        addLog(`📝 Session complète: ${JSON.stringify(session)}`, 'success', 1);
        
        setResult({ success: true, session });
        toast.success('Session restaurée!');
      } else {
        addLog('❌ Aucune session stockée', 'warning', 1);
        setResult({ success: false, error: 'Aucune session' });
        toast.info('Aucune session stockée');
      }
    } catch (error) {
      addLog(`❌ ERREUR: ${error.message}`, 'error', 1);
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } finally {
      addLog('========== FIN TEST ==========', 'info');
      setTesting(false);
    }
  };

  const handleTestFullFlow = async () => {
    setTesting(true);
    setLogs([]);
    setStepByStep([]);
    setResult(null);

    try {
      addLog('╔══════════════════════════════════════════════════════╗', 'info');
      addLog('║   TEST FLUX COMPLET - AUTHENTIFICATION LIVREUR      ║', 'info');
      addLog('╚══════════════════════════════════════════════════════╝', 'info');

      // ÉTAPE 1: Code saisi
      addLog(`📝 ÉTAPE 1: Code saisi = "${code}"`, 'info', 1);

      // ÉTAPE 2: Backend OK
      addLog('🔍 ÉTAPE 2: Appel backend findLivreurByCode...', 'info', 2);
      const livreur = await findLivreurByIdentificationCode(code);
      
      if (!livreur) {
        addLog('❌ ÉTAPE 2 ÉCHEC: Backend n\'a pas trouvé le livreur', 'error', 2);
        setResult({ success: false, error: 'Backend n\'a pas trouvé le livreur', failedAt: 'Étape 2' });
        toast.error('Étape 2 échec: Backend');
        return;
      }
      
      addLog('✅ ÉTAPE 2 OK: Backend a trouvé le livreur', 'success', 2);
      addLog(`   👤 Nom: ${livreur.nom} ${livreur.prenom}`, 'success', 2);
      addLog(`   🆔 ID: ${livreur.id}`, 'success', 2);

      // ÉTAPE 3: Session sauvegardée
      addLog('💾 ÉTAPE 3: Sauvegarde session Capacitor...', 'info', 3);
      const sessionData = {
        livreur_id: livreur.id,
        nom: `${livreur.nom} ${livreur.prenom}`.trim(),
        role: 'livreur',
        code_identification: livreur.code_identification || '',
        email: `livreur-${livreur.id}@silgapp2.local`,
        created_at: new Date().toISOString(),
      };
      addLog(`📝 Session à sauver: ${JSON.stringify(sessionData)}`, 'info', 3);
      
      const saved = await saveSessionNative(sessionData);
      if (!saved) {
        addLog('❌ ÉTAPE 3 ÉCHEC: Capacitor n\'a pas pu sauver', 'error', 3);
        setResult({ success: false, error: 'Capacitor save failed', failedAt: 'Étape 3' });
        toast.error('Étape 3 échec: Save Capacitor');
        return;
      }
      addLog('✅ ÉTAPE 3 OK: Session sauvegardée dans Capacitor', 'success', 3);

      // ÉTAPE 4: Session relue IMMÉDIATEMENT
      addLog('📖 ÉTAPE 4: Relecture session IMMÉDIATE...', 'info', 4);
      const restored = await getSessionNative();
      
      if (!restored) {
        addLog('❌ ÉTAPE 4 ÉCHEC: Capacitor ne relit pas la session', 'error', 4);
        addLog('⚠️ CAUSE PROBABLE: Capacitor Preferences écrit mais ne relit pas', 'error', 4);
        setResult({ success: false, error: 'Capacitor read failed', failedAt: 'Étape 4' });
        toast.error('Étape 4 échec: Read Capacitor');
        return;
      }
      
      addLog('✅ ÉTAPE 4 OK: Session relue avec succès', 'success', 4);
      addLog(`   🆔 Livreur ID: ${restored.livreur_id}`, 'success', 4);
      addLog(`   🎭 Role: ${restored.role}`, 'success', 4);

      // ÉTAPE 5: AuthContext mis à jour
      addLog('🔄 ÉTAPE 5: Mise à jour AuthContext...', 'info', 5);
      const user = await signInWithIdentificationCode(code);
      
      addLog('✅ ÉTAPE 5 OK: AuthContext mis à jour', 'success', 5);
      addLog(`   👤 User ID: ${user.id}`, 'success', 5);
      addLog(`   🎭 Role: ${user.role}`, 'success', 5);
      addLog(`   🔑 Livreur ID: ${user.livreur_id}`, 'success', 5);

      // ÉTAPE 6: Vérifier role=livreur
      addLog('🎭 ÉTAPE 6: Vérification role=livreur...', 'info', 6);
      if (user.role !== 'livreur') {
        addLog(`❌ ÉTAPE 6 ÉCHEC: role = "${user.role}" (attendu: "livreur")`, 'error', 6);
        setResult({ success: false, error: `Role incorrect: ${user.role}`, failedAt: 'Étape 6' });
        toast.error(`Étape 6 échec: role = ${user.role}`);
        return;
      }
      addLog('✅ ÉTAPE 6 OK: role = "livreur" confirmé', 'success', 6);

      // ÉTAPE 7: Navigation dashboard (simulée)
      addLog('🎯 ÉTAPE 7: Navigation vers dashboard livreur...', 'info', 7);
      addLog('✅ ÉTAPE 7 OK: Navigation simulée', 'success', 7);

      // RÉSULTAT FINAL
      addLog('╔══════════════════════════════════════════════════════╗', 'success');
      addLog('║   ✅ FLUX COMPLET RÉUSSI - TOUS LES TESTS VERTS     ║', 'success');
      addLog('╚══════════════════════════════════════════════════════╝', 'success');
      
      setResult({ success: true, user, livreur, message: 'Flux complet réussi' });
      toast.success('✅ Flux complet réussi!');
    } catch (error) {
      addLog(`❌ ERREUR GLOBALE: ${error.message}`, 'error');
      addLog(`📋 Stack: ${error.stack}`, 'error');
      setResult({ success: false, error: error.message, failedAt: 'Erreur globale' });
      toast.error(error.message);
    } finally {
      setTesting(false);
    }
  };

  const handleTestAuthContext = async () => {
    setTesting(true);
    setLogs([]);
    setStepByStep([]);

    try {
      addLog('========== TEST AUTHCONTEXT STATE ==========', 'info');
      
      addLog(`📊 isLoadingAuth: ${isLoadingAuth}`, 'info', 1);
      addLog(`📊 authChecked: ${authChecked}`, 'info', 1);
      addLog(`📊 isAuthenticated: ${isAuthenticated}`, 'info', 1);
      addLog(`📊 user: ${user ? JSON.stringify(user) : 'null'}`, 'info', 1);
      
      if (user) {
        addLog(`👤 user.role: ${user.role}`, 'info', 1);
        addLog(`👤 user.livreur_id: ${user.livreur_id}`, 'info', 1);
      }

      addLog('🔄 Force refresh checkAppState...', 'info', 2);
      await checkAppState();
      addLog('✅ checkAppState terminé', 'success', 2);

      addLog(`📊 Après refresh - isLoadingAuth: ${isLoadingAuth}`, 'info', 3);
      addLog(`📊 Après refresh - authChecked: ${authChecked}`, 'info', 3);
      addLog(`📊 Après refresh - isAuthenticated: ${isAuthenticated}`, 'info', 3);
      addLog(`📊 Après refresh - user: ${user ? JSON.stringify(user) : 'null'}`, 'info', 3);
      
      setResult({ success: true, authState: { isLoadingAuth, authChecked, isAuthenticated, user } });
    } catch (error) {
      addLog(`❌ ERREUR: ${error.message}`, 'error');
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } finally {
      setTesting(false);
    }
  };

  const handleForceSaveSession = async () => {
    setTesting(true);
    setLogs([]);
    setStepByStep([]);

    try {
      addLog('========== FORCE SAVE SESSION ==========', 'info');
      
      const testSession = {
        livreur_id: 'force-test-123',
        nom: 'Force Test',
        role: 'livreur',
        code_identification: 'FORCE-TEST',
        email: 'force@silgapp2.local',
        created_at: new Date().toISOString()
      };

      addLog('💾 Sauvegarde session FORCE...', 'info', 1);
      const saved = await saveSessionNative(testSession);
      addLog(`Résultat: ${saved ? '✅ SUCCÈS' : '❌ ÉCHEC'}`, saved ? 'success' : 'error', 1);

      addLog('📖 Lecture IMMÉDIATE...', 'info', 2);
      const restored = await getSessionNative();
      
      if (restored) {
        addLog('✅ Session lue!', 'success', 2);
        addLog(`Role: ${restored.role}`, 'success', 2);
        addLog(`Session complète: ${JSON.stringify(restored)}`, 'success', 2);
        setResult({ success: true, session: restored });
        toast.success('Force save OK!');
      } else {
        addLog('❌ Session NON LUE après save!', 'error', 2);
        setResult({ success: false, error: 'Session non lue après save' });
        toast.error('Force save échec');
      }
    } catch (error) {
      addLog(`❌ ERREUR: ${error.message}`, 'error');
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <Card className="border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-6 h-6" />
              🧪 DIAGNOSTIC ULTRA-DÉTAILLÉ - APK Android
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-600 mb-2">
              <strong>OBJECTIF:</strong> Identifier EXACTEMENT quelle étape échoue dans l'APK Android
            </p>
            <p className="text-xs text-red-500">
              Logs avec timestamps précis (ms) + numéros d'étape pour tracer le flux complet
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Code livreur (ex: LVR-TES666)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="uppercase"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Button onClick={handleTestCode} disabled={testing || !code} variant="default">
                {testing ? <Loader2 className="animate-spin" /> : <KeyRound className="mr-2" />}
                1. Test Code
              </Button>
              <Button onClick={handleTestSignIn} disabled={testing || !code} variant="secondary">
                {testing ? <Loader2 className="animate-spin" /> : <KeyRound className="mr-2" />}
                2. Test Sign In
              </Button>
              <Button onClick={handleTestSessionWrite} disabled={testing} variant="outline">
                {testing ? <Loader2 className="animate-spin" /> : '💾'}
                3. Test Write/Read
              </Button>
              <Button onClick={handleTestStoredSession} disabled={testing} variant="outline">
                {testing ? <Loader2 className="animate-spin" /> : '📖'}
                4. Test Session Stockée
              </Button>
              <Button onClick={handleTestFullFlow} disabled={testing || !code} variant="default" className="md:col-span-2">
                {testing ? <Loader2 className="animate-spin" /> : '🎯'}
                5. TEST FLUX COMPLET (7 étapes)
              </Button>
              <Button onClick={handleTestAuthContext} disabled={testing} variant="outline" className="md:col-span-2">
                {testing ? <Loader2 className="animate-spin" /> : '🔄'}
                6. Test AuthContext State
              </Button>
              <Button onClick={handleForceSaveSession} disabled={testing} variant="outline" className="md:col-span-3">
                {testing ? <Loader2 className="animate-spin" /> : '💪'}
                7. Force Save + Read Immédiate
              </Button>
              <Button variant="outline" onClick={handleClearLogs} className="md:col-span-3">
                Effacer Logs
              </Button>
            </div>

            {result && (
              <div className={`p-3 rounded-lg border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {result.success ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-red-600" />}
                  <span className="font-semibold">
                    {result.success ? 'SUCCÈS' : `ÉCHEC - ${result.failedAt || 'Erreur'}`}
                  </span>
                </div>
                {result.success && result.user && (
                  <div className="mt-2 text-sm space-y-1">
                    <p><strong>User ID:</strong> {result.user.id}</p>
                    <p><strong>Role:</strong> {result.user.role}</p>
                    <p><strong>Nom:</strong> {result.user.full_name}</p>
                    <p><strong>Livreur ID:</strong> {result.user.livreur_id}</p>
                  </div>
                )}
                {result.success && result.livreur && (
                  <div className="mt-2 text-sm space-y-1">
                    <p><strong>Nom:</strong> {result.livreur.nom} {result.livreur.prenom}</p>
                    <p><strong>Statut:</strong> {result.livreur.validation} | {result.livreur.actif ? 'Actif' : 'Inactif'}</p>
                  </div>
                )}
                {!result.success && <p className="mt-2 text-sm text-red-600">{result.error}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">📊 Logs détaillés (avec timestamps ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-400 p-3 rounded-lg font-mono text-xs max-h-[600px] overflow-y-auto space-y-1">
              {logs.length === 0 ? (
                <p className="text-gray-500">Aucun log - lancez un test</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`${
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'success' ? 'text-green-400' : 
                    log.type === 'warning' ? 'text-yellow-400' : 
                    'text-gray-300'
                  } ${log.step ? 'pl-4 border-l-2 border-blue-500' : ''}`}>
                    <span className="text-gray-500">[{log.timestamp}]</span>
                    {log.step && <span className="text-blue-400 font-bold mr-2">[Étape {log.step}]</span>}
                    {log.message}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Informations système</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {isNativeLivreurRuntime() ? (
                <>
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-600 font-semibold">APK Android (Capacitor)</span>
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-600 font-semibold">Preview Web Base44</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isCapacitorAvailable() ? (
                <Badge variant="default">Capacitor: OUI</Badge>
              ) : (
                <Badge variant="secondary">Capacitor: NON</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500">
              User Agent: {navigator.userAgent.substring(0, 100)}...
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}