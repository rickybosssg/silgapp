import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { isNativeLivreurRuntime } from "@/lib/nativeLivreurApi";
import { findLivreurByIdentificationCode } from "@/lib/codeIdentificationAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, Smartphone, Globe } from "lucide-react";
import { toast } from "sonner";

export default function DiagnosticAPK() {
  const [code, setCode] = useState("");
  const [logs, setLogs] = useState([]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const addLog = (message, type = "info") => {
    setLogs(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleTest = async () => {
    setTesting(true);
    setLogs([]);
    setResult(null);

    try {
      addLog("========== DÉBUT TEST ==========", "info");
      addLog(`Code saisi: "${code}"`, "info");

      // Check runtime
      const isNative = isNativeLivreurRuntime();
      addLog(`Runtime: ${isNative ? "NATIVE (Capacitor)" : "WEB (Preview)"}`, isNative ? "success" : "info");
      addLog(`isNativeLivreurRuntime() = ${isNative}`, "info");

      // Test function call
      addLog("Appel à findLivreurByIdentificationCode...", "info");
      
      const livreur = await findLivreurByIdentificationCode(code);
      
      if (livreur) {
        addLog("✅ SUCCÈS - Livreur trouvé!", "success");
        addLog(`Nom: ${livreur.nom} ${livreur.prenom}`, "success");
        addLog(`ID: ${livreur.id}`, "success");
        addLog(`Validation: ${livreur.validation}`, "success");
        addLog(`Actif: ${livreur.actif}`, "success");
        addLog(`Code identification: ${livreur.code_identification}`, "success");
        
        setResult({ success: true, livreur });
        toast.success("Test réussi!");
      } else {
        addLog("❌ ÉCHEC - Aucun livreur trouvé", "error");
        setResult({ success: false, error: "Aucun livreur trouvé" });
        toast.error("Aucun livreur trouvé");
      }
    } catch (error) {
      addLog(`❌ ERREUR: ${error.message}`, "error");
      addLog(`Stack: ${error.stack}`, "error");
      setResult({ success: false, error: error.message });
      toast.error(error.message);
    } finally {
      addLog("========== FIN TEST ==========", "info");
      setTesting(false);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🧪 Diagnostic APK Android
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
              <Button onClick={handleTest} disabled={testing || !code}>
                {testing ? <Loader2 className="animate-spin" /> : "Tester"}
              </Button>
              <Button variant="outline" onClick={handleClearLogs}>
                Effacer
              </Button>
            </div>

            {result && (
              <div className={`p-3 rounded-lg border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {result.success ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-red-600" />}
                  <span className="font-semibold">{result.success ? "SUCCÈS" : "ÉCHEC"}</span>
                </div>
                {result.success && result.livreur && (
                  <div className="mt-2 text-sm">
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
            <CardTitle className="text-sm">Logs détaillés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-400 p-3 rounded-lg font-mono text-xs max-h-96 overflow-y-auto space-y-1">
              {logs.length === 0 ? (
                <p className="text-gray-500">Aucun log - lancez un test pour voir les détails</p>
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
            <p className="text-xs text-gray-500">
              User Agent: {navigator.userAgent.substring(0, 100)}...
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}