import { base44 } from "@/api/base44Client";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  isLivreurNewCourseNotification,
  saveLivreurAlertConfig,
  startUrgentCourseAlert,
  stopUrgentCourseAlert,
} from "@/lib/livreurUrgentAlert";

const ANDROID_CHANNEL_ID = "silgapp_default";
const ANDROID_URGENT_CHANNEL_ID = "silgapp_courses_official_v2";
const SilgappPush = registerPlugin("SilgappPush");
let nativeListenersReady = false;
let nativeRegistrationListenersReady = false;
let pendingNativeRegistration = null;
let nativePersistenceQueue = Promise.resolve();
let lastNativeToken = null;
let lastNativeTokenPlatform = null;
let lastNativeRegistrationError = null;
const recentNativeNotifications = new Map();
const recentOpenedNotifications = new Map();

function getNotificationDedupeKey(data = {}) {
  return String(
    data.notification_id ||
    (data.course_id && data.type ? `${data.type}:${data.course_id}` : "") ||
    data.course_id ||
    ""
  );
}

function shouldSkipDuplicateNotification(data = {}, ttlMs = 120000) {
  const key = getNotificationDedupeKey(data);
  if (!key) return false;
  const now = Date.now();
  const previous = recentNativeNotifications.get(key) || 0;
  recentNativeNotifications.set(key, now);
  for (const [entryKey, at] of recentNativeNotifications) {
    if (now - at > ttlMs) recentNativeNotifications.delete(entryKey);
  }
  return now - previous < ttlMs;
}

function shouldSkipDuplicateOpened(data = {}, ttlMs = 10000) {
  const key = getNotificationDedupeKey(data);
  if (!key) return false;
  const now = Date.now();
  const previous = recentOpenedNotifications.get(key) || 0;
  recentOpenedNotifications.set(key, now);
  for (const [entryKey, at] of recentOpenedNotifications) {
    if (now - at > ttlMs) recentOpenedNotifications.delete(entryKey);
  }
  return now - previous < ttlMs;
}

function withNativeTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout apres ${ms / 1000}s`)), ms);
    }),
  ]);
}

function savePushDebug(event, details = {}) {
  const entry = {
    event,
    details,
    at: new Date().toISOString(),
  };
  try {
    const previous = JSON.parse(localStorage.getItem("silgapp_push_debug") || "[]");
    localStorage.setItem("silgapp_push_debug", JSON.stringify([...previous.slice(-24), entry]));
  } catch (_) {}
  console.log(`[SILGAPP Push] ${event}`, details);
}

function dispatchNotificationOpened(data = {}, source = "push") {
  if (shouldSkipDuplicateOpened(data)) {
    savePushDebug("duplicate-open-skipped", { source, data });
    return;
  }
  stopUrgentCourseAlert("notification-opened");
  const detail = { ...(data || {}), source };
  try {
    localStorage.setItem("silgapp_last_opened_notification", JSON.stringify({
      ...detail,
      opened_at: new Date().toISOString(),
    }));
  } catch (_) {}
  window.dispatchEvent(new CustomEvent("silgapp:notification-opened", { detail }));
}

function maybeStartLivreurCourseAlert(data = {}, source = "push") {
  if (!isLivreurNewCourseNotification(data)) return;
  const config = saveLivreurAlertConfig(data);
  startUrgentCourseAlert({
    courseId: data.course_id || "",
    notificationId: data.notification_id || "",
    title: data.title || data.titre || "Nouvelle course SILGAPP",
    body: data.body || data.message || "Une course est disponible. Ouvrez l'app pour accepter.",
    source,
    ...config,
  });
}

export function detectEnvironment() {
  if (Capacitor.isNativePlatform()) {
    return {
      platform: "capacitor",
      isNative: true,
      os: Capacitor.getPlatform(),
    };
  }

  return {
    platform: "web",
    isNative: false,
    os: "web",
  };
}

function getCapacitorPlugin(pluginName, packageName) {
  if (!Capacitor.isNativePlatform()) return null;

  const plugins = {
    "@capacitor/local-notifications": { LocalNotifications },
    "@capacitor/push-notifications": { PushNotifications },
  };
  const plugin = plugins[packageName]?.[pluginName];

  if (!plugin) {
    console.warn(`Plugin ${packageName} non disponible`);
  }
  return plugin || null;
}

export async function getNativePushDebugState() {
  const env = detectEnvironment();
  const state = {
    env,
    isNative: env.isNative,
    platform: env.os,
    hasPushPlugin: false,
    permissions: null,
    lastNativeToken,
    lastNativeTokenPlatform,
    lastNativeRegistrationError,
  };

  if (!env.isNative) return state;

  try {
    const NativePush = getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
    state.hasPushPlugin = !!NativePush;
    state.hasSilgappPushPlugin = env.os === "android";
    try {
      state.permissions = await withNativeTimeout(
        env.os === "android" ? SilgappPush.checkNotificationPermission() : NativePush.checkPermissions(),
        2500,
        "SilgappPush.checkNotificationPermission"
      );
    } catch (permissionError) {
      state.permissionError = permissionError?.message || String(permissionError);
    }
  } catch (error) {
    state.error = error?.message || String(error);
  }

  return state;
}

function resolveNotificationIdentity(livreurId = null, currentUser = null) {
  const userType =
    currentUser?.user_type === "client" ? "client" :
    currentUser?.user_type === "admin" || currentUser?.role === "admin" ? "admin" :
    currentUser?.user_type === "partenaire" ? "partenaire" :
    "livreur";
  const resolvedLivreurId = livreurId || currentUser?.livreur_id || currentUser?.livreur?.id || null;
  const resolvedClientId = currentUser?.client_id || currentUser?.client?.id || null;
  const fallbackEmail = userType === "admin"
    ? "admin@silgapp2.local"
    : userType === "client"
      ? `client-${resolvedClientId || "unknown"}@silgapp2.local`
      : userType === "partenaire"
        ? `partenaire-${currentUser?.id || "unknown"}@silgapp2.local`
        : `livreur-${resolvedLivreurId || "unknown"}@silgapp2.local`;

  return {
    user_email: (currentUser?.email || currentUser?.user_email || currentUser?.livreur?.user_email || fallbackEmail).trim().toLowerCase(),
    user_type: userType,
    livreur_id: resolvedLivreurId,
    client_id: resolvedClientId,
  };
}

async function ensureNativePushListeners() {
  if (nativeListenersReady) return;

  const PushNotifications = getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
  if (!PushNotifications) return;

  nativeListenersReady = true;

  if (Capacitor.getPlatform() === "android") {
    try {
      await SilgappPush.addListener?.("nativeNotificationOpened", (event) => {
        const data = event?.data || event || {};
        savePushDebug("notification-click", {
          source: "native-intent",
          data,
        });
        window.focus?.();
        dispatchNotificationOpened(data, data?.source || "native-intent");
      });
    } catch (error) {
      console.warn("[Notifications] native intent listener failed:", error?.message);
    }

    try {
      const launchResult = await withNativeTimeout(
        SilgappPush.getLaunchNotificationData(),
        2500,
        "SilgappPush.getLaunchNotificationData"
      );
      const launchData = launchResult?.data || null;
      if (launchResult?.hasData && launchData) {
        savePushDebug("notification-launch-data", { data: launchData });
        dispatchNotificationOpened(launchData, launchData?.source || "native-launch");
      }
    } catch (error) {
      console.warn("[Notifications] launch notification data unavailable:", error?.message);
    }

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
      // ── Canal dédié "SILGAPP Courses" — IMPORTANCE_MAX pour courses urgentes ──
      await PushNotifications.createChannel?.({
        id: ANDROID_URGENT_CHANNEL_ID,
        name: "SILGAPP Courses",
        description: "Notifications de courses urgentes SILGAPP",
        importance: 5,
        visibility: 1,
        lights: true,
        vibration: true,
      });
    } catch (error) {
      console.warn("[Notifications] Channel creation skipped:", error?.message);
    }

    // ── Pont natif : notification tapée → ouvre le modal course ──
    try {
      await SilgappPush.addListener("silgapp:notification-tapped", (data) => {
        savePushDebug("native-notification-tapped", { data });
        if (data?.type) {
          dispatchNotificationOpened(data, "native-tapped");
        }
      });
    } catch (err) {
      console.warn("[Notifications] silgapp:notification-tapped listener failed:", err?.message);
    }
  }

  try {
    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      const title = notification.title || notification.notification?.title || "SILGAPP";
      const body = notification.body || notification.notification?.body || "";
      const data = notification.data || {};
      if (shouldSkipDuplicateNotification(data)) {
        savePushDebug("duplicate-push-skipped", { data });
        return;
      }
      maybeStartLivreurCourseAlert(data, "push-received");
      if (Capacitor.isNativePlatform() && isLivreurNewCourseNotification(data)) {
        return;
      }
      // iOS already presents foreground notifications through presentationOptions.
      if (Capacitor.getPlatform() === "ios") return;
      showLocalNotification(title, body, { data });
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      savePushDebug("notification-click", {
        source: "push",
        actionId: event?.actionId,
        data: event?.notification?.data || {},
      });
      window.focus?.();
      dispatchNotificationOpened(event?.notification?.data || {}, "push");
    });
  } catch (error) {
    console.warn("[Notifications] pushNotificationReceived listener failed:", error?.message);
  }

  try {
    const LocalNotifications = getCapacitorPlugin("LocalNotifications", "@capacitor/local-notifications");
    await LocalNotifications?.addListener?.("localNotificationActionPerformed", (event) => {
      savePushDebug("notification-click", {
        source: "local",
        actionId: event?.actionId,
        data: event?.notification?.extra || event?.notification?.data || {},
      });
      window.focus?.();
      dispatchNotificationOpened(
        event?.notification?.extra || event?.notification?.data || {},
        "local"
      );
    });
  } catch (error) {
    console.warn("[Notifications] notification click listener failed:", error?.message);
  }
}

export async function checkNotificationSupport() {
  const env = detectEnvironment();

  if (env.isNative && (env.os === "android" || env.os === "ios")) {
    const PushNotifications = getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
    if (!PushNotifications) {
      return {
        supported: false,
        type: "native",
        platform: env.os,
        error: "Plugin PushNotifications non disponible (APK build requis)",
      };
    }

    try {
      await PushNotifications.checkPermissions();
      await ensureNativePushListeners();
      return { supported: true, type: "native", platform: env.os, error: null };
    } catch (error) {
      return {
        supported: true,
        type: "native",
        platform: env.os,
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

  if (env.isNative && (env.os === "android" || env.os === "ios")) {
    const PushNotifications = getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
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
  const LocalNotifications = getCapacitorPlugin("LocalNotifications", "@capacitor/local-notifications");
  if (!LocalNotifications) return;

  // Vibration native Capacitor
  if (isImportant(options)) {
    const Haptics = getCapacitorPlugin("Haptics", "@capacitor/haptics");
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
    await LocalNotifications.createChannel?.({
      id: ANDROID_URGENT_CHANNEL_ID,
      name: "SILGAPP Courses",
      description: "Notifications de courses urgentes SILGAPP",
      importance: 5,
      visibility: 1,
      lights: true,
      vibration: true,
    });

    const isUrgentCourse = String(options?.data?.type || "") === "nouvelle_course";

    await LocalNotifications.schedule({
      notifications: [{
        title: titre,
        body: message,
        id: Math.floor(Date.now() % 2147483647),
        channelId: isUrgentCourse ? ANDROID_URGENT_CHANNEL_ID : ANDROID_CHANNEL_ID,
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

async function saveTokenDirectly({ token, platform, livreurId, currentUser, deviceId, canPersist = async () => true }) {
  const identity = resolveNotificationIdentity(livreurId, currentUser);
  const payload = {
    user_email: identity.user_email,
    token,
    platform,
    user_type: identity.user_type,
    livreur_id: identity.livreur_id || "",
    client_id: identity.client_id || "",
    device_id: deviceId || "",
    actif: true,
    derniere_utilisation: new Date().toISOString(),
  };

  const existing = await base44.entities.NotificationToken.filter({ token, platform });
  if (!(await canPersist())) return null;
  if (!payload.client_id && payload.user_type === "client" &&
      String(existing?.[0]?.user_email || "").trim().toLowerCase() === identity.user_email) {
    payload.client_id = existing[0].client_id || "";
  }
  if (existing?.[0]) {
    await base44.entities.NotificationToken.update(existing[0].id, payload);
    return { success: true, action: "updated-direct", ...payload };
  }

  await base44.entities.NotificationToken.create(payload);
  return { success: true, action: "created-direct", ...payload };
}

/**
 * Récupère l'identifiant d'installation SILGAPP depuis le natif.
 * UUID stable généré côté Java, conservé en SharedPreferences.
 * Survit aux redémarrages et mises à jour d'APK.
 * @returns {Promise<string|null>}
 */
async function getNativeDeviceId() {
  try {
    const env = detectEnvironment();
    if (!env.isNative || env.os !== "android") return null;
    const result = await withNativeTimeout(
      SilgappPush.getDeviceId(),
      3000,
      "SilgappPush.getDeviceId"
    );
    const deviceId = result?.device_id;
    if (deviceId && !String(deviceId).startsWith("web_")) {
      return deviceId;
    }
    return null;
  } catch (err) {
    savePushDebug("device-id-fetch-failed", { error: err?.message });
    return null;
  }
}

async function cleanupDuplicateNativeTokens({ token, userEmail, userType, deviceId }) {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  if (!normalizedEmail || !token || String(token).startsWith("web_")) return;

  try {
    const tokens = await base44.entities.NotificationToken.filter({
      user_email: normalizedEmail,
      user_type: userType || "livreur",
      actif: true,
    });

    // Find the current token's record to get its created_date
    const currentToken = (tokens || []).find((item) => item.token === token);
    const currentCreatedMs = currentToken
      ? new Date(currentToken.created_date || Date.now()).getTime()
      : Date.now();

    // ── MULTI-APPAREIL : ne désactiver que les tokens du MÊME appareil ──
    // Si device_id est disponible, on filtre par (user_email + device_id).
    // Les tokens d'autres appareils du même utilisateur sont PRÉSERVÉS.
    // Si device_id est absent (ancien token), on ne désactive PAS (compatibilité).
    await Promise.all((tokens || [])
      .filter((item) =>
        item.token !== token &&
        !String(item.token || "").startsWith("web_") &&
        new Date(item.created_date || 0).getTime() < currentCreatedMs &&
        // Ne désactiver que si même device_id (ou pas de device_id sur les deux)
        (deviceId
          ? String(item.device_id || "") === String(deviceId)
          : false)
      )
      .map((item) => base44.entities.NotificationToken.update(item.id, { actif: false })));
  } catch (error) {
    savePushDebug("token-cleanup-skipped", { error: error?.message || String(error) });
  }
}

async function nativeRegistrationIsCurrent(registration, identity) {
  if (!registration || pendingNativeRegistration !== registration ||
      resolveNotificationIdentity(registration.livreurId, registration.currentUser).user_email !== identity.user_email) return false;
  const authenticatedUser = await base44.auth.me().catch(() => null);
  return pendingNativeRegistration === registration &&
    String(authenticatedUser?.email || "").trim().toLowerCase() === identity.user_email;
}

function persistPushToken(args) {
  if (!detectEnvironment().isNative) return persistPushTokenForIdentity(args);
  const registration = pendingNativeRegistration;
  const identity = resolveNotificationIdentity(args.livreurId, args.currentUser);
  const canPersist = () => nativeRegistrationIsCurrent(registration, identity);
  // Finish an in-flight write before the next account writes this physical token.
  const persist = async () => (await canPersist()) ? persistPushTokenForIdentity({ ...args, canPersist }) : null;
  const result = nativePersistenceQueue.then(persist, persist);
  nativePersistenceQueue = result.catch(() => null);
  return result;
}

async function persistPushTokenForIdentity({ token, platform, livreurId, clientId, currentUser, canPersist = async () => true }) {
  const identity = resolveNotificationIdentity(livreurId, currentUser);
  // Supporter user_type='client' passé explicitement
  const resolvedUserType = currentUser?.user_type || identity.user_type;
  const resolvedClientId = clientId || identity.client_id || currentUser?.client_id || null;

  // ── Récupérer le device_id natif (UUID stable d'installation) ──
  let deviceId = null;
  try {
    deviceId = await getNativeDeviceId();
    if (deviceId) {
      savePushDebug("device-id-resolved", { deviceIdPrefix: deviceId.slice(0, 16) });
    }
  } catch (err) {
    savePushDebug("device-id-error", { error: err?.message });
  }

  const payload = {
    token,
    platform,
    livreur_id: identity.livreur_id,
    client_id: resolvedClientId || '',
    user_email: identity.user_email,
    user_type: resolvedUserType,
    device_id: deviceId || '',
  };

  try {
    if (!(await canPersist())) return null;
    const result = await base44.functions.invoke("enregistrerTokenPush", payload);
    if (result?.error || result?.data?.error) throw new Error(result.error || result.data.error);
    if (!(await canPersist())) return null;
    await cleanupDuplicateNativeTokens({
      token,
      userEmail: identity.user_email,
      userType: resolvedUserType,
      deviceId,
    });
    // ── Confirmer au natif que le token a été enregistré côté backend ──
    // Supprime PENDING_FCM_TOKEN uniquement si le backend a réussi.
    // Si cette ligne n'est pas atteinte (crash, réseau), le token reste en attente.
    await confirmNativePendingToken(token);
    return result;
  } catch (error) {
    if (!(await canPersist())) return null;
    console.warn("[registerPushToken] Backend function failed, using entity fallback:", error?.message);
    const directResult = await saveTokenDirectly({ token, platform, livreurId: identity.livreur_id, currentUser, deviceId, canPersist });
    if (!directResult || !(await canPersist())) return null;
    await cleanupDuplicateNativeTokens({
      token,
      userEmail: identity.user_email,
      userType: resolvedUserType,
      deviceId,
    });
    // ── Confirmer aussi via le fallback direct (entity create/update) ──
    await confirmNativePendingToken(token);
    return directResult;
  }
}

/**
 * Confirme au natif qu'un token FCM a été enregistré côté backend.
 * Supprime PENDING_FCM_TOKEN si le token correspond.
 * No-op si le plugin natif n'est pas disponible ou si le token ne correspond pas.
 */
async function confirmNativePendingToken(token) {
  if (!token || String(token).startsWith("web_")) return;
  try {
    const env = detectEnvironment();
    if (!env.isNative || env.os !== "android") return;
    await withNativeTimeout(
      SilgappPush.confirmPendingFcmToken({ token }),
      3000,
      "SilgappPush.confirmPendingFcmToken"
    );
    savePushDebug("pending-token-confirmed", { tokenLength: token.length });
  } catch (err) {
    // Non-fatal : le token reste en attente et sera retenté au prochain cycle
    savePushDebug("pending-token-confirm-failed", { error: err?.message });
  }
}

async function getDirectNativeFcmToken() {
  const env = detectEnvironment();
  if (!env.isNative || env.os !== "android") return null;

  savePushDebug("direct-native-start", { platform: env.os });

  const permission = await withNativeTimeout(
    SilgappPush.requestNotificationPermission(),
    12000,
    "SilgappPush.requestNotificationPermission"
  );
  savePushDebug("direct-native-permission", permission);

  if (permission?.receive !== "granted") {
    lastNativeRegistrationError = { error: "Permission notification refusee", permission };
    savePushDebug("direct-native-permission-refused", permission);
    return null;
  }

  const result = await withNativeTimeout(
    SilgappPush.getToken(),
    20000,
    "SilgappPush.getToken"
  );

  if (!result?.token) {
    throw new Error("SilgappPush.getToken a repondu sans token");
  }

  lastNativeToken = result.token;
  lastNativeTokenPlatform = result.platform || env.os;
  lastNativeRegistrationError = null;
  savePushDebug("direct-native-token", {
    tokenLength: result.token.length,
    platform: lastNativeTokenPlatform,
  });
  return result.token;
}

async function persistLastNativeToken(registration = pendingNativeRegistration) {
  if (!lastNativeToken || !registration || registration !== pendingNativeRegistration) return null;

  const { platform, livreurId, clientId, currentUser } = registration;
  const token = lastNativeToken;
  const result = await persistPushToken({
    token,
    platform: platform || lastNativeTokenPlatform || "android",
    livreurId,
    clientId,
    currentUser,
  });
  return result ? token : null;
}

async function ensureNativeRegistrationListeners() {
  if (nativeRegistrationListenersReady) return;

  const NativePush = getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
  if (!NativePush) return;

  nativeRegistrationListenersReady = true;

  await NativePush.addListener("registration", async (data) => {
    const token = data?.value;
    if (!token) return;

    lastNativeToken = token;
    lastNativeTokenPlatform = Capacitor.getPlatform();
    lastNativeRegistrationError = null;
    savePushDebug("registration", {
      platform: lastNativeTokenPlatform,
      tokenLength: token.length,
    });

    try {
      const persisted = await persistLastNativeToken();
      if (persisted) savePushDebug("token-persisted", { platform: lastNativeTokenPlatform });
    } catch (error) {
      savePushDebug("token-persist-failed", { error: error?.message || String(error) });
      console.error("[registerPushToken] Erreur sauvegarde token FCM:", error);
    }
  });

  await NativePush.addListener("registrationError", (error) => {
    lastNativeRegistrationError = error;
    savePushDebug("registration-error", error);
    console.error("[registerPushToken] Erreur registration FCM:", error);
  });

  // ── Événement natif : Firebase a généré/renouvelé un token (onNewToken) ──
  // Le token a déjà été stocké en SharedPreferences par le service natif.
  // Ici on tente de l'enregistrer immédiatement si un utilisateur est authentifié.
  if (Capacitor.getPlatform() === "android") {
    try {
      await SilgappPush.addListener?.("silgapp:fcm-token-refreshed", (event) => {
        const token = event?.token;
        if (!token) return;
        savePushDebug("fcm-token-refreshed", {
          tokenLength: token.length,
          platform: event?.platform,
        });
        // Le token est déjà en attente dans SharedPreferences.
        // registerPushToken le consommera au prochain cycle (foreground ou login).
        // On déclenche une tentative d'enregistrement si un user est déjà connu.
        if (lastNativeToken !== token) {
          lastNativeToken = token;
          lastNativeTokenPlatform = event?.platform || "android";
        }
      });
    } catch (err) {
      console.warn("[Notifications] silgapp:fcm-token-refreshed listener failed:", err?.message);
    }
  }
}

export async function registerPushToken(livreurId = null, currentUser = null) {
  const clientId = currentUser?.client_id || null;
  const registration = currentUser?.email || currentUser?.user_email
    ? { platform: Capacitor.getPlatform(), livreurId, clientId, currentUser } : null;
  if (Capacitor.isNativePlatform()) pendingNativeRegistration = registration;
  try {
    const env = detectEnvironment();
    savePushDebug("register-start", { env, livreurId, user_type: currentUser?.user_type });

    // ── Consommer un token FCM en attente (généré par onNewToken avant auth) ──
    // Si Firebase a généré un token pendant que l'utilisateur n'était pas encore
    // authentifié, onNewToken() l'a conservé dans SharedPreferences.
    // On le récupère ici pour l'associer au BON utilisateur.
    if (env.isNative && env.os === "android") {
      try {
        const pendingResult = await withNativeTimeout(
          SilgappPush.consumePendingFcmToken(),
          3000,
          "SilgappPush.consumePendingFcmToken"
        );
        if (pendingResult?.hasPending && pendingResult?.token) {
          savePushDebug("pending-fcm-token-consumed", {
            tokenLength: pendingResult.token.length,
            platform: pendingResult.platform,
          });

          // Si on a un utilisateur authentifié, enregistrer le token immédiatement
          if (currentUser?.email) {
            try {
              await persistPushToken({
                token: pendingResult.token,
                platform: pendingResult.platform || "android",
                livreurId,
                clientId,
                currentUser,
              });
              savePushDebug("pending-fcm-token-persisted", { user_email: currentUser.email });
            } catch (persistError) {
              savePushDebug("pending-fcm-token-persist-failed", { error: persistError?.message });
            }
          } else {
            // Pas encore authentifié → le token reste en mémoire JS pour ce cycle
            // Il sera ré-enregistré au prochain registerPushToken après login
            lastNativeToken = pendingResult.token;
            lastNativeTokenPlatform = pendingResult.platform || "android";
            savePushDebug("pending-fcm-token-deferred", { reason: "no_authenticated_user" });
          }
        }
      } catch (pendingError) {
        savePushDebug("pending-fcm-token-check-error", { error: pendingError?.message });
      }
    }

    if (env.isNative && (env.os === "android" || env.os === "ios")) {
      if (!registration || pendingNativeRegistration !== registration) return null;
      const PushNotifications = getCapacitorPlugin("PushNotifications", "@capacitor/push-notifications");
      if (!PushNotifications) {
        console.warn("[registerPushToken] PushNotifications non disponible");
        return null;
      }

      try {
        if (env.os === "android") {
          try {
            const directToken = await getDirectNativeFcmToken();
            if (directToken) {
              const persisted = await persistLastNativeToken(registration);
              if (persisted) savePushDebug("direct-native-token-persisted", { platform: lastNativeTokenPlatform });
              return persisted;
            }
          } catch (directError) {
            lastNativeRegistrationError = { error: directError?.message || String(directError) };
            savePushDebug("direct-native-error", lastNativeRegistrationError);
          }
        }

        await ensureNativePushListeners();
        await ensureNativeRegistrationListeners();

        const permResult = await PushNotifications.requestPermissions();
        savePushDebug("permission-result", permResult);

        if (permResult.receive !== "granted" && permResult.display !== "granted") {
          console.warn("[registerPushToken] Permission refusee");
          return null;
        }

        if (lastNativeToken) {
          return await persistLastNativeToken(registration);
        }

        await PushNotifications.register();
        savePushDebug("fcm-register-called", { platform: env.os });

        return new Promise((resolve) => {
          const startedAt = Date.now();
          const interval = setInterval(async () => {
            if (lastNativeToken) {
              clearInterval(interval);
              try {
                const persisted = await persistLastNativeToken(registration);
                resolve(persisted);
                return;
              } catch (error) {
                console.error("[registerPushToken] Erreur sauvegarde token apres attente:", error);
              }
              resolve(null);
              return;
            }

            if (Date.now() - startedAt > 30000) {
              clearInterval(interval);
              const state = await getNativePushDebugState();
              savePushDebug("registration-timeout", { ...state, lastNativeToken: undefined });
              resolve(null);
            }
          }, 500);
        });
      } catch (error) {
        savePushDebug("register-exception", { error: error?.message || String(error) });
        console.error("[registerPushToken] Erreur FCM (non bloquante):", error);
        return null;
      }
    }

    savePushDebug("web-mode", { env });
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

export async function openNativeNotificationSettings() {
  const env = detectEnvironment();
  if (!env.isNative || env.os !== "android") return false;
  await SilgappPush.openNotificationSettings();
  return true;
}

// ── Récupérer les données de notification en attente (cold start) ──
// Appelé au démarrage de l'app livreur pour vérifier si l'app a été
// ouverte depuis une notification tapée.
export async function consumePendingNotificationData() {
  const env = detectEnvironment();
  if (!env.isNative || env.os !== "android") return null;

  try {
    const result = await withNativeTimeout(
      SilgappPush.checkPendingNotification(),
      3000,
      "SilgappPush.checkPendingNotification"
    );
    savePushDebug("pending-notification-check", { hasPending: result?.hasPending });
    if (result?.hasPending && result.type) {
      dispatchNotificationOpened(result, "native-pending");
      return result;
    }
  } catch (err) {
    savePushDebug("pending-notification-check-error", { error: err?.message || String(err) });
  }
  return null;
}

export function subscribeToNotifications(onNotification, userEmail, options = {}) {
  const processedIds = new Set();
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();

  const unsubscribe = base44.entities.Notification.subscribe((event) => {
    const notification = event.data;
    const targetEmail = String(notification?.destinataire_email || "").trim().toLowerCase();
    if (event.type !== "create" || !notification || targetEmail !== normalizedEmail) return;

    if (processedIds.has(notification.id)) return;
    processedIds.add(notification.id);

    const data = {
      type: notification.type,
      course_id: notification.course_id,
      notification_id: notification.id,
      user_type: options.userType || "",
      livreur_id: options.livreurId || "",
    };

    if (!Capacitor.isNativePlatform()) {
      showLocalNotification(notification.titre, notification.message, {
        tag: `silgapp-${notification.id}`,
        data,
      });
    } else {
      shouldSkipDuplicateNotification(data);
    }

    if (options.userType === "livreur") {
      maybeStartLivreurCourseAlert(data, "realtime");
    }

    // ── Rattrapage messagerie interne : dispatcher un événement pour ChatWindow ──
    // Quand un push de type nouveau_message arrive, ChatWindow ou peut refetcher
    // immédiatement les messages (filet de sécurité en plus du polling 5s).
    if (notification.type === "nouveau_message" || notification.type === "message_client") {
      try {
        window.dispatchEvent(new CustomEvent("silgapp:chat_refetch", {
          detail: { type: notification.type, course_id: notification.course_id || "", conversation_id: notification.conversation_id || "" }
        }));
      } catch (_) {}
    }

    if (onNotification) onNotification(notification);
  });

  return unsubscribe;
}
