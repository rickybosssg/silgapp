import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function TestConnexion() {
  const [logs, setLogs] = useState([]);
  const [testEnCours, setTestEnCours] = useState(false);

  const addLog = (message, type = "info") => {
    setLogs(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const runTests = async () => {
    setTestEnCours(true);
    setLogs([]);

    addLog("=== DÉBUT DES TESTS ===", "info");

    // Test 1 : localStorage
    try {
      addLog("Test 1: localStorage...", "info");
      localStorage.setItem("test_key", "test_value");
      const val = localStorage.getItem("test_key");
      if (val === "test_value") {
        addLog("✅ localStorage fonctionne", "success");
      } else {
        addLog("❌ localStorage échec", "error");
      }
    } catch (e) {
      addLog(`❌ localStorage erreur: ${e.message}`, "error");
    }

    // Test 2 : Capacitor
    try {
      addLog("Test 2: Capacitor...", "info");
      const isCap = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      addLog(`Capacitor détecté: ${isCap}`, "info");
      if (!isCap) {
        addLog("ℹ️ Normal sur ordinateur - Capacitor seulement sur mobile", "info");
      }
    } catch (e) {
      addLog(`❌ Capacitor erreur: ${e.message}`, "error");
    }

    // Test 3 : base44 SDK
    try {
      addLog("Test 3: base44 SDK...", "info");
      const { base44 } = await import("@/api/base44Client");
      if (base44) {
        addLog("✅ base44 SDK initialisé", "success");
        addLog(`Token présent: ${!!base44.token}`, "info");
      } else {
        addLog("❌ base44 SDK non initialisé", "error");
      }
    } catch (e) {
      addLog(`❌ base44 SDK erreur: ${e.message}`, "error");
      addLog(`Stack: ${e.stack}`, "error");
    }

    // Test 4 : Auth
    try {
      addLog("Test 4: Authentification...", "info");
      const { base44 } = await import("@/api/base44Client");
      const isAuthenticated = await base44.auth.isAuthenticated();
      addLog(`Connecté: ${isAuthenticated}`, "info");
      
      if (isAuthenticated) {
        const user = await base44.auth.me();
        addLog(`User: ${user?.email} (${user?.full_name})`, "success");
      } else {
        addLog("ℹ️ Pas connecté - clique sur 'Simuler Connexion'", "info");
      }
    } catch (e) {
      addLog(`❌ Auth erreur: ${e.message}`, "error");
    }

    // Test 5 : Entités
    try {
      addLog("Test 5: Accès entités...", "info");
      const { base44 } = await import("@/api/base44Client");
      const livreurs = await base44.entities.Livreur.filter({ type_livreur: "externe" }, "nom", 5);
      addLog(`✅ ${livreurs?.length || 0} livreurs externes trouvés`, "success");
    } catch (e) {
      addLog(`❌ Entités erreur: ${e.message}`, "error");
    }

    addLog("=== FIN DES TESTS ===", "info");
    setTestEnCours(false);
  };

  const simulateLogin = async () => {
    addLog("🔑 Tentative de connexion...", "info");
    try {
      const { base44 } = await import("@/api/base44Client");
      await base44.auth.redirectToLogin();
    } catch (e) {
      addLog(`❌ Login erreur: ${e.message}`, "error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">🔍 Test de Connexion APK</h1>
          
          <div className="flex gap-3 mb-6">
            <Button 
              onClick={runTests} 
              disabled={testEnCours}
              className="flex-1"
            >
              {testEnCours && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {testEnCours ? "Tests en cours..." : "Lancer les tests"}
            </Button>
            <Button 
              onClick={simulateLogin}
              variant="secondary"
              className="flex-1"
            >
              Simuler Connexion
            </Button>
          </div>

          <div className="bg-black rounded-lg p-4 font-mono text-xs text-green-400 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500">Clique sur "Lancer les tests" pour commencer...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1">
                  <span className="text-gray-500">[{log.timestamp}]</span>{" "}
                  {log.type === "success" && "✅ "}
                  {log.type === "error" && "❌ "}
                  {log.type === "info" && "ℹ️ "}
                  {log.message}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-4 bg-blue-50 border-blue-200">
          <h2 className="font-bold text-blue-900 mb-2">📋 Instructions pour Eric :</h2>
          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
            <li>Ouvre cette page sur ton ordinateur</li>
            <li>Clique sur "Lancer les tests"</li>
            <li>Prends une capture d'écran des résultats</li>
            <li>Envoie-moi la capture</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}