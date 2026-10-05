import React, { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Settings, Shield } from "lucide-react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { requestNotificationPermission, getNativePushDebugState } from "@/lib/notifications";
import {
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  openAutoStartSettings,
} from "@/lib/batteryOptimization";

const SilgappPush = registerPlugin("SilgappPush");

/**
 * Bannière de statut des notifications push.
 * Affiche l'état des permissions Android (POST_NOTIFICATIONS + batterie)
 * et guide le livreur vers les réglages si nécessaire.
 */
export default function NotificationStatusBanner({ livreurId }) {
  const [notifStatus, setNotifStatus] = useState(null); // 'granted' | 'denied' | 'checking'
  const [batteryStatus, setBatteryStatus] = useState(null); // true | false | null
  const [dismissed, setDismissed] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    setNotifStatus("checking");
    try {
      const debug = await getNativePushDebugState();
      const receive = debug?.permissions?.receive;
      setNotifStatus(receive === "granted" ? "granted" : "denied");
    } catch {
      setNotifStatus("denied");
    }

    try {
      const ignoring = await isIgnoringBatteryOptimizations();
      setBatteryStatus(ignoring);
    } catch {
      setBatteryStatus(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [livreurId, checkStatus]);

  // Skip on web
  if (!Capacitor.isNativePlatform()) return null;

  // Dismissed by user
  if (dismissed) return null;

  const notifOk = notifStatus === "granted";
  const batteryOk = batteryStatus === true;
  const allOk = notifOk && batteryOk;

  // Don't show banner if everything is fine
  if (allOk || notifStatus === "checking") return null;

  const handleRequestPermission = async () => {
    try {
      const result = await requestNotificationPermission();
      if (result?.granted) {
        setNotifStatus("granted");
      } else {
        // Permission denied — open settings
        try {
          await SilgappPush.openNotificationSettings();
        } catch {}
      }
    } catch {}
  };

  const handleRequestBattery = async () => {
    try {
      const result = await requestIgnoreBatteryOptimizations();
      if (result?.granted) {
        setBatteryStatus(true);
      }
    } catch {}
  };

  const handleOpenAutoStart = async () => {
    try {
      await openAutoStartSettings();
    } catch {}
  };

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          {notifOk ? <Shield className="w-5 h-5 text-amber-500" /> : <BellOff className="w-5 h-5 text-amber-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-800">Notifications à activer</p>
          <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
            Sans ces autorisations, vous ne recevrez pas les courses quand l'app est fermée.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400 hover:text-amber-600 text-xs font-bold flex-shrink-0"
        >
          Plus tard
        </button>
      </div>

      <div className="space-y-2">
        {!notifOk && (
          <button
            onClick={handleRequestPermission}
            className="w-full h-10 rounded-xl bg-amber-500 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Bell className="w-4 h-4" />
            Autoriser les notifications
          </button>
        )}
        {!batteryOk && (
          <button
            onClick={handleRequestBattery}
            className="w-full h-10 rounded-xl bg-white border border-amber-300 text-amber-700 text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Shield className="w-4 h-4" />
            Autoriser l'arrière-plan (batterie)
          </button>
        )}
        {!batteryOk && (
          <button
            onClick={handleOpenAutoStart}
            className="w-full h-9 rounded-xl bg-transparent text-amber-600 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            Démarrage automatique (Samsung, Tecno, Xiaomi…)
          </button>
        )}
      </div>
    </div>
  );
}