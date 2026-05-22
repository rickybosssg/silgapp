import { base44 } from "@/api/base44Client";

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

  return notification;
}

async function showNativeNotification(titre, message, options = {}) {
  const LocalNotifications = await getCapacitorPlugin("LocalNotifications", "@capacitor/local-notifications");
  if (!LocalNotifications) {
    console.log("Notifications locales non disponibles");
    return;
  }

  try {
    await LocalNotifications.schedule({
      notifications: [{
        title: titre,
        body: message,
        id: Date.now(),
        icon: options.icon || "ic_launcher",
        sound: options.sound || "beep.wav",
        data: options.data || {},
      }],
    });
  } catch (err) {
    console.warn("Erreur LocalNotifications:", err.message);
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
              await base44.functions.invoke("enregistrerTokenPush", {
                token,
                platform: "android",
                livreur_id: livreurId,
              });
              console.log("[registerPushToken] Token enregistre en DB");
              finish(token);
            } catch (err) {
              console.error("[registerPushToken] Erreur backend:", err);
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

    const user = currentUser;
    if (!user?.email) {
      console.warn("[registerPushToken] Aucun utilisateur fourni pour le token web");
      return null;
    }
    const token = `web_${user.email}_${Date.now()}`;

    await base44.functions.invoke("enregistrerTokenPush", {
      token,
      platform: "web",
      livreur_id: livreurId,
    });

    return token;
  } catch (error) {
    console.error("[registerPushToken] Erreur generale:", error);
    return null;
  }
}

export async function getCurrentFCMToken() {
  const env = detectEnvironment();

  if (env.isNative && env.os === "android") {
    const PushNotifications = await getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
    if (PushNotifications) {
      try {
        const result = await PushNotifications.checkPermissions();
        if (result.receive === "granted" || result.display === "granted") return null;
      } catch (error) {
        console.error("Erreur check token:", error);
      }
    }
  }

  return null;
}

export function subscribeToNotifications(onNotification, userEmail) {
  const unsubscribe = base44.entities.Notification.subscribe((event) => {
    if (event.type === "create" && event.data.destinataire_email === userEmail) {
      const notification = event.data;

      showLocalNotification(notification.titre, notification.message, {
        tag: `notification-${notification.id}`,
        data: {
          type: notification.type,
          course_id: notification.course_id,
        },
      });

      if (onNotification) onNotification(notification);
    }
  });

  return unsubscribe;
}
