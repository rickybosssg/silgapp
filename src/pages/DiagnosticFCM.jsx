import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DiagnosticFCM() {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [tokenEnBase, setTokenEnBase] = useState(null);

  const log = (emoji, msg, data = null) => {
    const entry = { time: new Date().toLocaleTimeString(), emoji, msg, data: data ? JSON.stringify(data, null, 2) : null };
    setLogs(prev => [...prev, entry]);
    console.log(`[DiagFCM] ${emoji} ${msg}`, data || "");
  };

  const runDiag = async () => {
    setLogs([]);
    setRunning(true);
    setTokenEnBase(null);

    // ── 1. Environnement ───────────────────────────────────────────────────
    log("🔍", "Détection environnement...");

    const hasCapacitor = !!(typeof window !== "undefined" && window.Capacitor);
    log(hasCapacitor ? "✅" : "❌", `window.Capacitor : ${hasCapacitor ? "PRÉSENT" : "ABSENT"}`);

    if (hasCapacitor) {
      const platform = window.Capacitor.getPlatform?.() || "inconnu";
      const isNative = window.Capacitor.isNative ?? window.Capacitor.isNativePlatform?.() ?? false;
      log("📱", `Platform Capacitor : ${platform}`);
      log(isNative ? "✅" : "❌", `isNative : ${isNative}`);
    } else {
      log("⚠️", "window.Capacitor absent → APK non natif ou WebView mal configuré");
    }

    const userAgent = navigator.userAgent;
    log("🤖", `UserAgent : ${userAgent}`);

    // ── 2. Plugin PushNotifications ────────────────────────────────────────
    log("🔌", "Chargement plugin @capacitor/push-notifications...");
    let PushNotifications = null;
    try {
      const mod = await import("@capacitor/push-notifications");
      PushNotifications = mod.PushNotifications;
      log("✅", "Plugin PushNotifications chargé");
    } catch (err) {
      log("❌", `Plugin non disponible : ${err.message}`);
    }

    // ── 3. Permissions ─────────────────────────────────────────────────────
    if (PushNotifications) {
      try {
        const perm = await PushNotifications.checkPermissions();
        log("🔐", `Permissions actuelles :`, perm);

        if (perm.receive !== "granted") {
          const req = await PushNotifications.requestPermissions();
          log(req.receive === "granted" ? "✅" : "❌", `Permissions demandées :`, req);
        } else {
          log("✅", "Permissions notifications : ACCORDÉES");
        }
      } catch (err) {
        log("❌", `Erreur permissions : ${err.message}`);
      }
    }

    // ── 4. Enregistrement FCM & capture token ──────────────────────────────
    if (PushNotifications) {
      log("📡", "Enregistrement auprès de FCM...");
      try {
        await new Promise(async (resolve) => {
          let settled = false;

          const regHandle = await PushNotifications.addListener("registration", async (data) => {
            if (settled) return;
            settled = true;
            const token = data.value;
            const isAndroidToken = !token.startsWith("web_") && token.length > 50;
            log(isAndroidToken ? "✅" : "⚠️", `Token reçu (${token.length} chars) : ${token.substring(0, 30)}...`);
            log(isAndroidToken ? "✅" : "❌", `Type token : ${isAndroidToken ? "ANDROID FCM RÉEL ✅" : "WEB FALLBACK ❌"}`);

            // Sauvegarder en base
            try {
              await base44.functions.invoke("enregistrerTokenPush", {
                token,
                platform: "android",
                user_email: "diagnostic@silgapp2.local",
                user_type: "livreur",
                livreur_id: "diagnostic",
              });
              log("✅", "Token sauvegardé en base avec platform=android");
              setTokenEnBase({ token: token.substring(0, 40) + "...", platform: "android", longueur: token.length });
            } catch (err) {
              log("❌", `Erreur sauvegarde : ${err.message}`);
            }

            try { await regHandle.remove(); } catch (_) {}
            resolve();
          });

          const errHandle = await PushNotifications.addListener("registrationError", async (err) => {
            if (settled) return;
            settled = true;
            log("❌", `Erreur FCM registration : ${JSON.stringify(err)}`);
            try { await errHandle.remove(); } catch (_) {}
            resolve();
          });

          await PushNotifications.register();
          log("⏳", "register() appelé — attente du token FCM...");

          setTimeout(() => {
            if (!settled) {
              settled = true;
              log("⏰", "TIMEOUT 15s — aucun token reçu. FCM non fonctionnel sur cet APK.");
              resolve();
            }
          }, 15000);
        });
      } catch (err) {
        log("❌", `Erreur générale FCM : ${err.message}`);
      }
    } else {
      // Fallback web
      log("🌐", "PushNotifications absent → génération token web fallback");
      const webToken = `web_diagnostic@silgapp2.local_${Date.now()}`;
      log("❌", `Token web (inutilisable pour push natif) : ${webToken}`);
      log("🔴", "CONCLUSION : L'APK ne charge pas Capacitor correctement → aucune push native possible");
    }

    // ── 5. Vérification token en base ──────────────────────────────────────
    log("🗄️", "Vérification tokens en base...");
    try {
      const result = await base44.functions.invoke("getNotificationStats", {});
      log("📊", "Stats tokens :", result?.data || result);
    } catch (err) {
      log("⚠️", `Stats non disponibles : ${err.message}`);
    }

    log("🏁", "Diagnostic terminé.");
    setRunning(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center pt-4">
          <h1 className="text-xl font-bold">🔬 Diagnostic FCM</h1>
          <p className="text-sm text-muted-foreground mt-1">Vérification token push Android</p>
        </div>

        <Button
          onClick={runDiag}
          disabled={running}
          className="w-full"
          size="lg"
        >
          {running ? "⏳ Diagnostic en cours..." : "▶️ Lancer le diagnostic FCM"}
        </Button>

        {tokenEnBase && (
          <Card className="p-4 border-green-200 bg-green-50">
            <p className="text-sm font-semibold text-green-800 mb-2">✅ Token Android enregistré</p>
            <p className="text-xs font-mono break-all text-green-700">{tokenEnBase.token}</p>
            <div className="flex gap-2 mt-2">
              <Badge className="bg-green-100 text-green-800 text-xs">platform: {tokenEnBase.platform}</Badge>
              <Badge className="bg-green-100 text-green-800 text-xs">{tokenEnBase.longueur} chars</Badge>
            </div>
          </Card>
        )}

        <Card className="p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Logs</p>
          {logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Lance le diagnostic pour voir les résultats
            </p>
          )}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {logs.map((entry, i) => (
              <div key={i} className="text-xs border-b border-gray-100 pb-2">
                <div className="flex items-start gap-2">
                  <span className="text-gray-400 flex-shrink-0">{entry.time}</span>
                  <span>{entry.emoji}</span>
                  <span className="font-medium">{entry.msg}</span>
                </div>
                {entry.data && (
                  <pre className="mt-1 ml-8 text-gray-500 bg-gray-50 rounded p-1 overflow-x-auto text-[10px]">
                    {entry.data}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 bg-blue-50 border-blue-200">
          <p className="text-xs font-semibold text-blue-800 mb-2">📋 Résultat attendu si APK correct</p>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>✅ window.Capacitor : PRÉSENT</li>
            <li>✅ Platform : android</li>
            <li>✅ Plugin PushNotifications : chargé</li>
            <li>✅ Token FCM : fXXXX... (163 chars)</li>
            <li>✅ platform = android en base</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}