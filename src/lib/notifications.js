import { base44 } from "@/api/base44Client";

const ANDROID_CHANNEL_ID = "silgapp_default";
let nativeListenersReady = false;

export function detectEnvironment() {
  if (typeof window !== "undefined" && window.Capacitor) {
    return {
      platform: "capacitor",
      isNative: true,
      os: window.Capacitor.getPlatform(),
    };
  }

  return {
    platform: "web",
    isNative: false,
    os: "web",
  };
}

async function getCapacitorPlugin(pluginName, packageName) {
  if (typeof window === "undefined" || !window.Capacitor) return null;

  try {
    const module = await import(/* @vite-ignore */ packageName);
    return module[pluginName];
  } catch (error) {
    console.warn(`Plugin ${packageName} non disponible:`, error.message);
    return null;
  }
}

function resolveNotificationIdentity(livreurId = null, currentUser = null) {
  const userType = currentUser?.role === "admin" ? "admin" : "livreur";
  const resolvedLivreurId = livreurId || currentUser?.livreur_id || currentUser?.livreur?.id || null;
  const fallbackEmail = userType === "admin"
    ? "admin@silgapp2.local"
    : `livreur-${resolvedLivreurId || "unknown"}@silgapp2.local`;

  return {
    user_email: (currentUser?.email || currentUser?.user_email || currentUser?.livreur?.user_email || fallbackEmail).trim().toLowerCase(),
    user_type: userType,
    livreur_id: resolvedLivreurId,
  };
}

async function ensureNativePushListeners() {
  if (nativeListenersReady) return;

  const PushNotifications = await getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
  if (!PushNotifications) return;

  nativeListenersReady = true;

  try {
    await PushNotifications.createChannel?.({
      id: ANDROID_CHANNEL_ID,
      name: "SILGAPP",
      description: "Notifications SILGAPP",
      importance: 5,
      visibility: 1,
      lights: true,
      vibration: true,
    });
  } catch (error) {
    console.warn("[Notifications] Channel creation skipped:", error?.message);
  }

  try {
    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      const title = notification.title || notification.notification?.title || "SILGAPP";
      const body = notification.body || notification.notification?.body || "";
      showLocalNotification(title, body, { data: notification.data || {} });
    });
  } catch (error) {
    console.warn("[Notifications] pushNotificationReceived listener failed:", error?.message);
  }
}

export async function checkNotificationSupport() {
  const env = detectEnvironment();

  if (env.isNative && env.os === "android") {
    const PushNotifications = await getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
    if (!PushNotifications) {
      return {
        supported: false,
        type: "native",
        platform: "android",
        error: "Plugin PushNotifications non disponible (APK build requis)",
      };
    }

    try {
      await PushNotifications.checkPermissions();
      await ensureNativePushListeners();
      return { supported: true, type: "native", platform: "android", error: null };
    } catch (error) {
      return {
        supported: true,
        type: "native",
        platform: "android",
        error: `Permission check failed: ${error.message}`,
      };
    }
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    return { supported: true, type: "web", platform: "web", error: null };
  }

  return {
    supported: false,
    type: "unknown",
    platform: env.os,
    error: "Notifications non supportees",
  };
}

export async function requestNotificationPermission() {
  const env = detectEnvironment();

  if (env.isNative && env.os === "android") {
    const PushNotifications = await getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
    if (!PushNotifications) {
      return { granted: false, type: "native", error: "Plugin non disponible" };
    }

    try {
      await ensureNativePushListeners();
      const result = await PushNotifications.requestPermissions();
      const granted = result.receive === "granted" || result.display === "granted";
      return { granted, type: "native", error: granted ? null : "Permission refusee" };
    } catch (error) {
      return { granted: false, type: "native", error: `Erreur: ${error.message}` };
    }
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return { granted: false, error: "Notifications non supportees" };
  }

  if (Notification.permission === "granted") return { granted: true };
  if (Notification.permission === "denied") return { granted: false, error: "Notifications bloquees" };

  const permission = await Notification.requestPermission();
  return { granted: permission === "granted" };
}

// Types de notifications importants → déclenchent son + vibration
const IMPORTANT_TYPES = [
  "nouvelle_course", "course_assignee", "course_acceptee",
  "colis_recupere", "en_livraison", "course_livree",
  "course_bloquee", "course_annulee", "rappel_reponse",
  "course_proximite",
];

function isImportant(options) {
  const t = options?.data?.type;
  return !t || IMPORTANT_TYPES.includes(t);
}

// Vibration + son Web Audio API (fonctionne dans WebView/APK)
function triggerSoundAndVibration(important = true) {
  // Vibration (fonctionne sur Android WebView et APK)
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(important ? [200, 100, 200, 100, 400] : [100]);
  }
  // Son via Web Audio API — un bip simple audible même dans l'APK
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    // Reprendre le contexte si suspendu (politique autoplay Chrome/Android)
    const play = () => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0.7, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.7);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch (_) {}
}

export function showLocalNotification(titre, message, options = {}) {
  const env = detectEnvironment();

  if (env.isNative) {
    showNativeNotification(titre, message, options);
    return;
  }

  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const notification = new Notification(titre, {
    body: message,
    icon: options.icon || "/favicon.ico",
    badge: options.badge || "/favicon.ico",
    tag: options.tag || "silga-notification",
    requireInteraction: options.requireInteraction || false,
    data: options.data || {},
  });

  notification.onclick = () => {
    window.focus();
    if (options.onClick) options.onClick();
    notification.close();
  };

  // Son + vibration pour toutes les notifications importantes
  if (isImportant(options)) {
    triggerSoundAndVibration(true);
  }

  return notification;
}

async function showNativeNotification(titre, message, options = {}) {
  const LocalNotifications = await getCapacitorPlugin("LocalNotifications", "@capacitor/local-notifications");
  if (!LocalNotifications) return;

  // Vibration native Capacitor
  if (isImportant(options)) {
    const Haptics = await getCapacitorPlugin("Haptics", "@capacitor/haptics");
    if (Haptics) {
      Haptics.vibrate?.({ duration: 500 }).catch(() => null);
    } else if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
  }

  try {
    await LocalNotifications.createChannel?.({
      id: ANDROID_CHANNEL_ID,
      name: "SILGAPP",
      description: "Notifications SILGAPP",
      importance: 5,
      visibility: 1,
      lights: true,
      vibration: true,
    });

    await LocalNotifications.schedule({
      notifications: [{
        title: titre,
        body: message,
        id: Math.floor(Date.now() % 2147483647),
        channelId: ANDROID_CHANNEL_ID,
        iconColor: "#dc2626",
        sound: options.sound || "default",
        vibrate: isImportant(options) ? [200, 100, 200, 100, 400] : [100],
        data: options.data || {},
      }],
    });
  } catch (err) {
    console.warn("Erreur LocalNotifications:", err.message);
  }
}

async function saveTokenDirectly({ token, platform, livreurId, currentUser }) {
  const identity = resolveNotificationIdentity(livreurId, currentUser);
  const payload = {
    user_email: identity.user_email,
    token,
    platform,
    user_type: identity.user_type,
    livreur_id: identity.livreur_id || "",
    actif: true,
    derniere_utilisation: new Date().toISOString(),
  };

  const existing = await base44.entities.NotificationToken.filter({ token });
  if (existing?.[0]) {
    await base44.entities.NotificationToken.update(existing[0].id, payload);
    return { success: true, action: "updated-direct", ...payload };
  }

  await base44.entities.NotificationToken.create(payload);
  return { success: true, action: "created-direct", ...payload };
}

async function persistPushToken({ token, platform, livreurId, currentUser }) {
  const identity = resolveNotificationIdentity(livreurId, currentUser);
  const payload = {
    token,
    platform,
    livreur_id: identity.livreur_id,
    user_email: identity.user_email,
    user_type: identity.user_type,
  };

  try {
    const result = await base44.functions.invoke("enregistrerTokenPush", payload);
    if (result?.error) throw new Error(result.error);
    return result;
  } catch (error) {
    console.warn("[registerPushToken] Backend function failed, using entity fallback:", error?.message);
    return saveTokenDirectly({ token, platform, livreurId: identity.livreur_id, currentUser });
  }
}

export async function registerPushToken(livreurId = null, currentUser = null) {
  try {
    const env = detectEnvironment();
    console.log("[registerPushToken] Environment:", env);

    if (env.isNative && env.os === "android") {
      const PushNotifications = await getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
      if (!PushNotifications) {
        console.warn("[registerPushToken] PushNotifications non disponible");
        return null;
      }

      try {
        await ensureNativePushListeners();
        const permResult = await PushNotifications.requestPermissions();
        console.log("[registerPushToken] Permission:", permResult);

        if (permResult.receive !== "granted" && permResult.display !== "granted") {
          console.warn("[registerPushToken] Permission refusee");
          return null;
        }

        return new Promise(async (resolve, reject) => {
          let settled = false;
          let registrationHandle = null;
          let errorHandle = null;

          const finish = async (value, isError = false) => {
            if (settled) return;
            settled = true;
            try { await registrationHandle?.remove?.(); } catch (_) {}
            try { await errorHandle?.remove?.(); } catch (_) {}
            isError ? reject(value) : resolve(value);
          };

          registrationHandle = await PushNotifications.addListener("registration", async (data) => {
            const token = data.value;
            console.log("[registerPushToken] Token FCM recu:", token);

            try {
              await persistPushToken({ token, platform: "android", livreurId, currentUser });
              console.log("[registerPushToken] Token enregistre en DB");
              finish(token);
            } catch (err) {
              console.error("[registerPushToken] Erreur sauvegarde token:", err);
              finish(err, true);
            }
          });

          errorHandle = await PushNotifications.addListener("registrationError", (error) => {
            console.error("[registerPushToken] Erreur registration:", error);
            finish(error, true);
          });

          await PushNotifications.register();
          console.log("[registerPushToken] Enregistre aupres de FCM");

          setTimeout(() => {
            console.warn("[registerPushToken] Timeout - aucun token recu");
            finish(null);
          }, 30000);
        });
      } catch (error) {
        console.error("[registerPushToken] Erreur FCM (non bloquante):", error);
        return null;
      }
    }

    console.log("[registerPushToken] Mode web");
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.warn("[registerPushToken] Notifications web non supportees");
      return null;
    }

    const permission = await requestNotificationPermission();
    if (!permission.granted) {
      console.warn("[registerPushToken] Permission web refusee");
      return null;
    }

    const identity = resolveNotificationIdentity(livreurId, currentUser);
    const token = `web_${identity.user_email}_${Date.now()}`;
    await persistPushToken({ token, platform: "web", livreurId: identity.livreur_id, currentUser });

    return token;
  } catch (error) {
    console.error("[registerPushToken] Erreur generale:", error);
    return null;
  }
}

export async function getCurrentFCMToken() {
  return null;
}

export function subscribeToNotifications(onNotification, userEmail) {
  // Garde-fou anti-doublon : IDs déjà traités dans cette session
  const processedIds = new Set();

  const unsubscribe = base44.entities.Notification.subscribe((event) => {
    if (event.type === "create" && event.data?.destinataire_email === userEmail) {
      const notification = event.data;

      // Anti-doublon : ignorer si déjà traité
      if (processedIds.has(notification.id)) return;
      processedIds.add(notification.id);

      // Notification système locale (barre de statut)
      showLocalNotification(notification.titre, notification.message, {
        tag: `silgapp-${notification.id}`, // tag unique → évite doublon système
        data: {
          type: notification.type,
          course_id: notification.course_id,
        },
      });

      // Callback (pour afficher toast ou mettre à jour l'UI)
      if (onNotification) onNotification(notification);
    }
  });

  return unsubscribe;
}