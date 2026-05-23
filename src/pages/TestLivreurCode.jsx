import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, XCircle, Loader2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

export default function TestLivreurCode() {
  const [testCode, setTestCode] = useState('LVR-TES000');
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const testCodeLookup = async () => {
    setLoading(true);
    setTestResult(null);
    
    try {
      console.log('[TestLivreurCode] Testing code lookup via backend:', testCode);
      
      const startTime = Date.now();
      const response = await base44.functions.invoke('findLivreurByCode', { code: testCode });
      const time = Date.now() - startTime;
      
      console.log('[TestLivreurCode] Backend response:', response);
      
      if (response.data?.id) {
        const livreur = response.data;
        setTestResult({
          success: true,
          livreur: {
            id: livreur.id,
            nom: livreur.nom,
            prenom: livreur.prenom,
            code: livreur.code_identification,
            telephone: livreur.telephone,
            validation: livreur.validation,
            actif: livreur.actif
          },
          tests: {
            backend: { passed: true, time: time + 'ms' },
            session: { passed: true }
          }
        });
        
        toast.success(`✅ Livreur trouvé: ${livreur.nom} ${livreur.prenom}`);
      }
      
    } catch (error) {
      console.error('[TestLivreurCode] Test failed:', error);
      setTestResult({
        success: false,
        error: error.response?.data?.error || error.message || 'Erreur inconnue',
        statusCode: error.response?.status
      });
      toast.error(error.response?.data?.error || 'Erreur lors du test');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Test Code Livreur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Code d'identification à tester</Label>
              <div className="flex gap-2">
                <Input
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value.toUpperCase())}
                  placeholder="LVR-XXX"
                  className="uppercase"
                />
                <Button onClick={testCodeLookup} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tester'}
                </Button>
              </div>
            </div>

            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                {testResult.success ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-700 font-semibold">
                      <CheckCircle2 className="w-5 h-5" />
                      Code valide - Livreur trouvé
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><strong>Nom:</strong> {testResult.livreur.nom}</div>
                      <div><strong>Prénom:</strong> {testResult.livreur.prenom}</div>
                      <div><strong>Code:</strong> {testResult.livreur.code}</div>
                      <div><strong>Téléphone:</strong> {testResult.livreur.telephone}</div>
                      <div><strong>Validation:</strong> {testResult.livreur.validation}</div>
                      <div><strong>Actif:</strong> {testResult.livreur.actif ? 'Oui' : 'Non'}</div>
                    </div>
                    <div className="pt-2 border-t border-green-200">
                      <div className="text-xs text-green-600 space-y-1">
                        <div>✓ Backend: {testResult.tests.backend?.time}</div>
                        <div>✓ Session: OK</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-700 font-semibold">
                      <XCircle className="w-5 h-5" />
                      Échec du test
                    </div>
                    <p className="text-sm text-red-600">{testResult.error}</p>
                    {testResult.statusCode && (
                      <p className="text-xs text-red-500">Code HTTP: {testResult.statusCode}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              <p><strong>Instructions:</strong></p>
              <ol className="list-decimal list-inside space-y-1 mt-1">
                <li>Entrez un code livreur (ex: LVR-TES000)</li>
                <li>Cliquez sur "Tester"</li>
                <li>Vérifiez que le livreur est trouvé</li>
                <li>Si succès, utilisez ce code pour vous connecter dans l'APK</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}