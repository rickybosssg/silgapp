import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isNativeLivreurRuntime, verifyNativeLivreurCode } from '@/lib/nativeLivreurApi';
import { findLivreurByIdentificationCode, signInWithIdentificationCode, getStoredIdentificationSession } from '@/lib/codeIdentificationAuth';
import { isCapacitorAvailable, saveSessionNative, getSessionNative } from '@/lib/capacitorStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Smartphone, Globe, Bug, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

export default function DiagnosticCompletAPK() {
  const [code, setCode] = useState('');
  const [logs, setLogs] = useState([]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [sessionTest, setSessionTest] = useState(null);

  const addLog = (message, type = 'info') => {
    console.log(`[DIAGNOSTIC] ${message}`);
    setLogs(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleClearLogs = () => {
    setLogs([]);
    setResult(null);
    setSessionTest(null);
  };

  const handleTestCode = async () => {
    setTesting(true);
    setLogs([]);
    setResult(null);
    setSessionTest(null);

    try {
      addLog('========== DÉBUT TEST CODE ==========', 'info');
      addLog(`📝 Code saisi: "${code}"`, 'info');

      // 1. Check runtime
      const isNative = isNativeLivreurRuntime();
      const isCapacitor = isCapacitorAvailable();
      addLog(`📱 Runtime: ${isNative ? 'NATIVE (Capacitor)' : 'WEB (Preview)'}`, isNative ? 'success' : 'info');
      addLog(`📱 isNativeLivreurRuntime() = ${isNative}`, 'info');
      addLog(`📱 isCapacitorAvailable() = ${isCapacitor}`, 'info');

      // 2. Test function call
      addLog('🔍 Appel à findLivreurByIdentificationCode...', 'info');
      
      const livreur = await findLivreurByIdentificationCode(code);
      
      if (livreur) {
        addLog('✅ SUCCÈS - Livreur trouvé!', 'success');
        addLog(`👤 Nom: ${livreur.nom} ${livreur.prenom}`, 'success');
        addLog(`🆔 ID: ${livreur.id}`, 'success');
        addLog(`✅ Validation: ${livreur.validation}`, 'success');
        addLog(`✅ Actif: ${livreur.actif}`, 'success');
        addLog(`🔑 Code identification: ${livreur.code_identification}`, 'success');
        
        setResult({ success: true, livreur });
        toast.success('Test réussi!');
      } else {
        addLog('❌ ÉCHEC - Aucun livreur trouvé', 'error');
        setResult({ success: false, error: 'Aucun livreur trouvé' });
        toast.error('Aucun livreur trouvé');
      }
    } catch (error) {
      addLog(`❌ ERREUR: ${error.message}`, 'error');
      addLog(`📋 Stack: ${error.stack}`, 'error');
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
    setResult(null);

    try {
      addLog('========== DÉBUT TEST SIGN IN ==========', 'info');
      addLog(`📝 Code: "${code}"`, 'info');

      const isNative = isNativeLivreurRuntime();
      addLog(`📱 Runtime: ${isNative ? 'NATIVE' : 'WEB'}`, 'info');

      const user = await signInWithIdentificationCode(code);
      
      addLog('✅ SIGN IN RÉUSSI!', 'success');
      addLog(`👤 User ID: ${user.id}`, 'success');
      addLog(`🎭 Role: ${user.role}`, 'success');
      addLog(`👤 Nom: ${user.full_name}`, 'success');
      addLog(`🔑 Livreur ID: ${user.livreur_id}`, 'success');
      addLog(`🔑 Code: ${user.code_identification}`, 'success');
      
      setResult({ success: true, user });
      toast.success('Connexion réussie!');
    } catch (error) {
      addLog(`❌ SIGN IN ÉCHEC: ${error.message}`, 'error');
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } finally {
      addLog('========== FIN TEST SIGN IN ==========', 'info');
      setTesting(false);
    }
  };

  const handleTestSession = async () => {
    setTesting(true);
    setLogs([]);
    setSessionTest(null);

    try {
      addLog('========== TEST SESSION CAPACITOR ==========', 'info');
      
      const isCapacitor = isCapacitorAvailable();
      addLog(`📱 Capacitor disponible: ${isCapacitor}`, isCapacitor ? 'success' : 'error');

      if (!isCapacitor) {
        addLog('⚠️ Test non disponible en mode WEB', 'warning');
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

      addLog('💾 Sauvegarde session test...', 'info');
      const saved = await saveSessionNative(testSession);
      addLog(`Sauvegarde: ${saved ? '✅ SUCCÈS' : '❌ ÉCHEC'}`, saved ? 'success' : 'error');

      // Test read
      addLog('📖 Lecture session...', 'info');
      const restored = await getSessionNative();
      
      if (restored) {
        addLog('✅ Session lue avec succès!', 'success');
        addLog(`🆔 Livreur ID: ${restored.livreur_id}`, 'success');
        addLog(`🎭 Role: ${restored.role}`, 'success');
        addLog(`🔑 Code: ${restored.code_identification}`, 'success');
        
        setSessionTest({ 
          available: true, 
          saved: true, 
          restored: true, 
          session: restored 
        });
        toast.success('Session Capacitor OK!');
      } else {
        addLog('❌ Session non trouvée après sauvegarde', 'error');
        setSessionTest({ available: true, saved: true, restored: false });
        toast.error('Session non persistée');
      }
    } catch (error) {
      addLog(`❌ ERREUR SESSION: ${error.message}`, 'error');
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

    try {
      addLog('========== TEST RESTAURATION SESSION ==========', 'info');
      
      const session = await getStoredIdentificationSession();
      
      if (session) {
        addLog('✅ Session trouvée et restaurée!', 'success');
        addLog(`👤 Nom: ${session.full_name}`, 'success');
        addLog(`🎭 Role: ${session.role}`, 'success');
        addLog(`🔑 Livreur ID: ${session.livreur_id}`, 'success');
        
        setResult({ success: true, session });
        toast.success('Session restaurée!');
      } else {
        addLog('❌ Aucune session stockée', 'warning');
        setResult({ success: false, error: 'Aucune session' });
        toast.info('Aucune session stockée');
      }
    } catch (error) {
      addLog(`❌ ERREUR: ${error.message}`, 'error');
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } finally {
      addLog('========== FIN TEST ==========', 'info');
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="w-5 h-5" />
              🧪 Diagnostic Complet APK Android
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

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleTestCode} disabled={testing || !code} variant="default">
                {testing ? <Loader2 className="animate-spin" /> : <KeyRound className="mr-2" />}
                Test Code
              </Button>
              <Button onClick={handleTestSignIn} disabled={testing || !code} variant="secondary">
                {testing ? <Loader2 className="animate-spin" /> : <KeyRound className="mr-2" />}
                Test Sign In
              </Button>
              <Button onClick={handleTestSession} disabled={testing} variant="outline">
                {testing ? <Loader2 className="animate-spin" /> : '💾'}
                Test Session Capacitor
              </Button>
              <Button onClick={handleTestStoredSession} disabled={testing} variant="outline">
                {testing ? <Loader2 className="animate-spin" /> : '📖'}
                Test Session Stockée
              </Button>
              <Button variant="outline" onClick={handleClearLogs} className="col-span-2">
                Effacer Logs
              </Button>
            </div>

            {result && (
              <div className={`p-3 rounded-lg border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {result.success ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-red-600" />}
                  <span className="font-semibold">{result.success ? 'SUCCÈS' : 'ÉCHEC'}</span>
                </div>
                {result.success && result.livreur && (
                  <div className="mt-2 text-sm space-y-1">
                    <p><strong>Nom:</strong> {result.livreur.nom} {result.livreur.prenom}</p>
                    <p><strong>Statut:</strong> {result.livreur.validation} | {result.livreur.actif ? 'Actif' : 'Inactif'}</p>
                    <p><strong>Code:</strong> {result.livreur.code_identification}</p>
                  </div>
                )}
                {result.success && result.user && (
                  <div className="mt-2 text-sm space-y-1">
                    <p><strong>User ID:</strong> {result.user.id}</p>
                    <p><strong>Role:</strong> {result.user.role}</p>
                    <p><strong>Nom:</strong> {result.user.full_name}</p>
                    <p><strong>Livreur ID:</strong> {result.user.livreur_id}</p>
                  </div>
                )}
                {!result.success && <p className="mt-2 text-sm text-red-600">{result.error}</p>}
              </div>
            )}

            {sessionTest && (
              <div className={`p-3 rounded-lg border ${sessionTest.restored ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="flex items-center gap-2">
                  {sessionTest.available ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-red-600" />}
                  <span className="font-semibold">
                    Capacitor: {sessionTest.available ? 'Disponible' : 'Non disponible'}
                  </span>
                </div>
                {sessionTest.saved && (
                  <div className="mt-2 text-sm">
                    <p>Sauvegarde: {sessionTest.saved ? '✅' : '❌'}</p>
                    <p>Lecture: {sessionTest.restored ? '✅' : '❌'}</p>
                    {sessionTest.session && (
                      <div className="mt-2">
                        <p><strong>Role:</strong> {sessionTest.session.role}</p>
                        <p><strong>Livreur ID:</strong> {sessionTest.session.livreur_id}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Logs détaillés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-400 p-3 rounded-lg font-mono text-xs max-h-96 overflow-y-auto space-y-1">
              {logs.length === 0 ? (
                <p className="text-gray-500">Aucun log - lancez un test</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`${
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'success' ? 'text-green-400' : 
                    'text-gray-300'
                  }`}>
                    <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
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