import { base44 } from "@/api/base44Client";
import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, AlertTriangle, Smartphone, Wifi, Database } from "lucide-react";
import { toast } from "sonner";

const LOG_COLORS = {
  info: "text-blue-700 bg-blue-50 border-blue-200",
  success: "text-green-700 bg-green-50 border-green-200",
  error: "text-red-700 bg-red-50 border-red-200",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  debug: "text-gray-700 bg-gray-50 border-gray-200",
};

export default function DiagnosticPushComplet() {
  const [logs, setLogs] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [fcmToken, setFcmToken] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const logsEndRef = useRef(null);

  const addLog = (message, type = "info", data = null) => {
    const timestamp = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    setLogs(prev => [...prev, { timestamp, message, type, data }]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const checkExistingTokens = async () => {
    addLog("📋 Vérification des tokens existants en base de données...", "info");
    try {
      const result = await base44.functions.invoke("diagnosticPushTokens", {});
      setTokenData(result);
      
      if (result.tokens_count === 0) {
        addLog("❌ AUCUN TOKEN TROUVÉ en base de données", "error");
      } else {
        addLog(`✅ ${result.tokens_count} token(s) trouvé(s) en BDD`, "success", result);
        if (result.android_tokens?.length > 0) {
          addLog(`📱 ${result.android_tokens.length} token(s) Android`, "success");
          result.android_tokens.forEach((t, i) => {
            addLog(`   Token ${i+1}: ${t.token?.substring(0, 50)}... (actif: ${t.actif})`, "info");
          });
        } else {
          addLog("⚠️ AUCUN token Android en base de données", "warn");
        }
      }
    } catch (error) {
      addLog(`❌ Erreur vérification BDD: ${error.message}`, "error");
    }
  };

  const testFCMRegistration = async () => {
    setIsTesting(true);
    setLogs([]);
    setFcmToken(null);
    setPermissionGranted(null);
    setRegistrationComplete(false);

    addLog("🚀 DÉBUT DU DIAGNOSTIC PUSH FCM", "info");
    addLog("=".repeat(50), "debug");

    // ÉTAPE 1: Vérifier l'environnement
    addLog("\n📱 ÉTAPE 1: Vérification environnement", "info");
    const isNative = typeof window !== "undefined" && window.Capacitor;
    const platform = isNative ? window.Capacitor.getPlatform() : "web";
    addLog(`   Plateforme: ${platform}`, "info");
    addLog(`   Native: ${isNative ? "OUI (Capacitor)" : "NON (Web)"}`, "info");

    if (!isNative || platform !== "android") {
      addLog("⚠️ Ce test doit être exécuté SUR L'APK ANDROID, pas sur le web", "error");
      addLog("   Ouvrez cette page dans l'APK: https://silga-dispatch-go.base44.app/diagnostic-push-complet", "warn");
      setIsTesting(false);
      return;
    }

    // ÉTAPE 2: Importer le plugin PushNotifications
    addLog("\n🔌 ÉTAPE 2: Initialisation plugin PushNotifications", "info");
    let PushNotifications = null;
    try {
      const module = await import("@capacitor/push-notifications");
      PushNotifications = module.PushNotifications;
      addLog(`✅ Plugin importé avec succès`, "success");
      addLog(`   PushNotifications disponible: ${!!PushNotifications}`, "debug");
    } catch (error) {
      addLog(`❌ Échec import plugin: ${error.message}`, "error");
      addLog(`   Error stack: ${error.stack}`, "debug");
      setIsTesting(false);
      return;
    }

    // ÉTAPE 3: Vérifier permissions
    addLog("\n🔐 ÉTAPE 3: Vérification des permissions", "info");
    try {
      const permResult = await PushNotifications.checkPermissions();
      addLog(`   Permission RECEIVE: ${permResult.receive}`, "info");
      addLog(`   Permission DISPLAY: ${permResult.display}`, "info");
      
      if (permResult.receive === "granted" || permResult.display === "granted") {
        addLog(`✅ Permissions ACCORDÉES`, "success");
        setPermissionGranted(true);
      } else {
        addLog(`⚠️ Permissions NON accordées (mais ce n'est pas bloquant)`, "warn");
        setPermissionGranted(false);
      }
    } catch (error) {
      addLog(`❌ Erreur checkPermissions: ${error.message}`, "error");
      addLog(`   Stack: ${error.stack}`, "debug");
      setPermissionGranted(false);
    }

    // ÉTAPE 4: Demander permissions si nécessaire
    if (permissionGranted === false) {
      addLog("\n🙏 ÉTAPE 4: Demande de permissions", "info");
      try {
        const requestResult = await PushNotifications.requestPermissions();
        addLog(`   RECEIVE after request: ${requestResult.receive}`, "info");
        addLog(`   DISPLAY after request: ${requestResult.display}`, "info");
        
        if (requestResult.receive === "granted" || requestResult.display === "granted") {
          addLog(`✅ Permissions ACCORDÉES après demande`, "success");
          setPermissionGranted(true);
        } else {
          addLog(`❌ Permissions REFUSÉES par l'utilisateur`, "error");
        }
      } catch (error) {
        addLog(`❌ Erreur requestPermissions: ${error.message}`, "error");
      }
    }

    // ÉTAPE 5: Créer le canal de notification Android
    addLog("\n📢 ÉTAPE 5: Création canal de notification Android", "info");
    try {
      await PushNotifications.createChannel({
        id: "silgapp_default",
        name: "SILGAPP",
        description: "Notifications SILGAPP",
        importance: 5,
        visibility: 1,
        lights: true,
        vibration: true,
      });
      addLog(`✅ Canal créé avec succès`, "success");
    } catch (error) {
      addLog(`⚠️ Erreur createChannel (non bloquant): ${error.message}`, "warn");
    }

    // ÉTAPE 6: S'inscrire à FCM
    addLog("\n☁️ ÉTAPE 6: Inscription à Firebase Cloud Messaging", "info");
    addLog(`   Appel PushNotifications.register()...`, "debug");

    const registrationPromise = new Promise((resolve, reject) => {
      let settled = false;
      let registrationListener = null;
      let errorListener = null;

      const cleanup = async () => {
        try { await registrationListener?.remove?.(); } catch (_) {}
        try { await errorListener?.remove?.(); } catch (_) {}
      };

      const finish = (value, isError = false) => {
        if (settled) return;
        settled = true;
        cleanup();
        isError ? reject(value) : resolve(value);
      };

      // Listener: token reçu (sans await car dans Promise executor)
      PushNotifications.addListener(
        "registration",
        (data) => {
          const token = data.value;
          addLog(`\n✅ TOKEN FCM REÇU !`, "success");
          addLog(`   Token: ${token}`, "success");
          addLog(`   Longueur: ${token?.length} caractères`, "debug");
          setFcmToken(token);
          setRegistrationComplete(true);
          finish(token);
        }
      ).then((listener) => {
        registrationListener = listener;
        addLog(`   Listener 'registration' attaché`, "debug");
      });

      // Listener: erreur d'enregistrement
      PushNotifications.addListener(
        "registrationError",
        (error) => {
          addLog(`\n❌ ERREUR D'ENREGISTREMENT FCM`, "error");
          addLog(`   Error: ${JSON.stringify(error)}`, "error");
          addLog(`   Message: ${error.message}`, "debug");
          finish(error, true);
        }
      ).then((listener) => {
        errorListener = listener;
        addLog(`   Listener 'registrationError' attaché`, "debug");
      });

      // Appel à register()
      addLog(`   Appel effectif de PushNotifications.register()...`, "info");
      PushNotifications.register()
        .then(() => {
          addLog(`   register() appelé avec succès (en attente du token...)`, "success");
        })
        .catch((err) => {
          addLog(`   register() a échoué: ${err.message}`, "error");
          finish(err, true);
        });

      // Timeout 60 secondes
      setTimeout(() => {
        if (!settled) {
          addLog(`\n⏰ TIMEOUT (60s) - Aucun token reçu`, "error");
          addLog(`   Causes possibles:`, "warn");
          addLog(`     1. google-services.json manquant ou incorrect`, "warn");
          addLog(`     2. SHA-1/SHA-256 non configurés dans Firebase Console`, "warn");
          addLog(`     3. Package name Android ne correspond pas à Firebase`, "warn");
          addLog(`     4. Réseau/Firewall bloque FCM`, "warn");
          finish(new Error("Timeout - aucun token reçu"), true);
        }
      }, 60000);
    });

    try {
      const token = await registrationPromise;
      
      // ÉTAPE 7: Sauvegarder le token en BDD
      addLog("\n💾 ÉTAPE 7: Sauvegarde du token en base de données", "info");
      try {
        const saveResult = await base44.functions.invoke("enregistrerTokenPush", {
          token: token,
          platform: "android",
          user_email: user?.email || "test@silgapp.local",
          user_type: "livreur",
        });
        addLog(`✅ Token enregistré en BDD`, "success", saveResult);
        addLog(`   Action: ${saveResult.action}`, "debug");
        addLog(`   User email: ${saveResult.user_email}`, "debug");
      } catch (error) {
        addLog(`❌ Erreur sauvegarde BDD: ${error.message}`, "error");
        addLog(`   Stack: ${error.stack}`, "debug");
      }

    } catch (error) {
      addLog(`\n❌ Échec enregistrement FCM: ${error.message}`, "error");
    }

    // RÉSUMÉ FINAL
    addLog("\n" + "=".repeat(50), "debug");
    addLog("📊 RÉSUMÉ DU DIAGNOSTIC", "info");
    addLog("=".repeat(50), "debug");
    addLog(`   Plateforme: ${platform}`, "info");
    addLog(`   Permissions: ${permissionGranted ? "✅ Accordées" : "❌ Refusées"}`, permissionGranted ? "success" : "error");
    addLog(`   Token FCM: ${fcmToken ? `✅ ${fcmToken?.substring(0, 30)}...` : "❌ Non reçu"}`, fcmToken ? "success" : "error");
    addLog(`   Registration: ${registrationComplete ? "✅ Complète" : "❌ Incomplète"}`, registrationComplete ? "success" : "error");
    
    if (fcmToken) {
      addLog(`\n✅ DIAGNOSTIC TERMINÉ - Token généré avec succès`, "success");
      addLog(`   Prochaine étape: Vérifier que le token est bien en base de données`, "info");
    } else {
      addLog(`\n❌ DIAGNOSTIC TERMINÉ - Token NON généré`, "error");
      addLog(`   Vérifiez:`, "warn");
      addLog(`     1. google-services.json présent dans android/app/`, "warn");
      addLog(`     2. Package name: com.silgapp.app`, "warn");
      addLog(`     3. SHA-1 et SHA-256 configurés dans Firebase Console`, "warn");
      addLog(`     4. Firebase Cloud Messaging API activée dans Google Cloud`, "warn");
    }

    setIsTesting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">
            🔍 Diagnostic Push Notifications FCM
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Trace complète du processus d'enregistrement FCM
          </p>
        </div>

        {/* Bouton d'action */}
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-bold text-lg text-blue-900 mb-1">
                Lancer le diagnostic complet
              </h3>
              <p className="text-sm text-blue-700">
                Teste toutes les étapes : permissions → register → token → sauvegarde BDD
              </p>
            </div>
            <Button
              onClick={testFCMRegistration}
              disabled={isTesting}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 px-8 rounded-xl"
            >
              {isTesting ? (
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5 animate-spin" />
                  Test en cours...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Démarrer le diagnostic
                </span>
              )}
            </Button>
          </div>
        </Card>

        {/* Bouton vérification BDD */}
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Vérifier les tokens en BDD</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Voir les tokens déjà enregistrés pour votre compte
              </p>
            </div>
            <Button
              onClick={checkExistingTokens}
              variant="outline"
              className="border-gray-300 dark:border-gray-600"
            >
              <Database className="w-4 h-4 mr-2" />
              Vérifier
            </Button>
          </div>
          {tokenData && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Total tokens:</span>
                  <span className="ml-2 font-bold">{tokenData.tokens_count}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Android:</span>
                  <span className="ml-2 font-bold text-green-600">{tokenData.android_tokens?.length || 0}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Web:</span>
                  <span className="ml-2 font-bold text-blue-600">{tokenData.web_tokens?.length || 0}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">iOS:</span>
                  <span className="ml-2 font-bold text-purple-600">{tokenData.ios_tokens?.length || 0}</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Logs */}
        <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Logs du diagnostic
          </h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                Cliquez sur "Démarrer le diagnostic" pour voir les logs en temps réel
              </p>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${LOG_COLORS[log.type] || LOG_COLORS.info}`}
                >
                  <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                  {log.message}
                  {log.data && (
                    <pre className="mt-2 text-[10px] opacity-75 whitespace-pre-wrap">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </Card>
      </div>
    </div>
  );
}