import { Capacitor, registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Contacts } from "@capacitor-community/contacts";
import { APP_PUBLIC_URL, BASE44_APP_ID } from "@/lib/app-params";

export const SilgappNative = registerPlugin("SilgappNative");
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isNativeMobile() {
  return Capacitor.isNativePlatform() && ["android", "ios"].includes(Capacitor.getPlatform());
}

function nativeSource() {
  if (!Capacitor.isNativePlatform()) return "web";
  return `${Capacitor.getPlatform()}-native`;
}

function normalizePosition(position) {
  if (!position) return null;
  const coords = position.coords || position;
  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    accuracy: Number(coords.accuracy || 0),
    speed: Number(coords.speed || 0),
    heading: Number(coords.heading || 0),
    timestamp: position.timestamp || Date.now(),
    source: nativeSource(),
  };
}

export async function getNativeCurrentPosition(options = {}) {
  const opts = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 2000,
    ...options,
  };

  if (isNativeMobile()) {
    const permission = await Geolocation.requestPermissions({
      permissions: ["location"],
    });
    const granted = permission?.location === "granted" || permission?.coarseLocation === "granted";
    if (!granted) throw new Error("Permission GPS refusee");
    const position = await Geolocation.getCurrentPosition(opts);
    return normalizePosition(position);
  }

  if (!navigator.geolocation) throw new Error("GPS non disponible");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(normalizePosition(position)),
      reject,
      opts
    );
  });
}

export async function startNativeLocationSync({
  enabled = true,
  onPosition,
  intervalMs = 5000,
  distanceFilter = 3,
  backgroundTitle = "SILGAPP GPS actif",
  backgroundMessage = "Synchronisation de votre position en cours",
} = {}) {
  if (!enabled || typeof onPosition !== "function") {
    return () => {};
  }

  let stopped = false;
  let timerId = null;
  let watcherId = null;

  const publish = async (position) => {
    const normalized = normalizePosition(position);
    if (!normalized || stopped) return;
    await onPosition(normalized);
  };

  const pollForeground = async () => {
    try {
      await publish(await getNativeCurrentPosition({ timeout: 8000, maximumAge: 1000 }));
    } catch (_) {}
  };

  await pollForeground();
  timerId = window.setInterval(pollForeground, intervalMs);

  if (isNativeMobile()) {
    try {
      watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle,
          backgroundMessage,
          requestPermissions: true,
          stale: false,
          distanceFilter,
        },
        (location, error) => {
          if (error) {
            console.warn("[SILGAPP GPS] Background error:", error?.message || error);
            return;
          }
          publish(location).catch(() => null);
        }
      );
    } catch (error) {
      console.warn("[SILGAPP GPS] Background watcher unavailable:", error?.message || error);
    }
  }

  return () => {
    stopped = true;
    if (timerId) window.clearInterval(timerId);
    if (watcherId) {
      BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => null);
    }
  };
}

function getStoredAccessToken() {
  const keys = ["base44_access_token", "access_token", "base44_token", "token"];
  for (const key of keys) {
    try {
      const value = localStorage.getItem(key);
      if (value && value !== "null" && value !== "undefined" && value.length > 10) return value;
    } catch (_) {}
  }
  return "";
}

export async function startNativeBackgroundHeartbeat({
  userType = "livreur",
  intervalMs = 5000,
  distanceFilter = 0,
} = {}) {
  if (!isNativeAndroid()) return () => {};

  const token = getStoredAccessToken();
  const result = await SilgappNative.startBackgroundHeartbeat({
    token,
    userType,
    intervalMs,
    distanceFilter,
    serverUrl: APP_PUBLIC_URL,
    appId: BASE44_APP_ID,
    functionsVersion: "prod",
  });
  console.info(`[SilgappGPS] native background heartbeat started userType=${userType}`, result);

  return () => {
    SilgappNative.stopBackgroundHeartbeat().catch(() => null);
  };
}

export function installNativeGeolocationShim() {
  if (!isNativeMobile() || typeof navigator === "undefined") return false;
  if (navigator.geolocation?.__silgappNativeShim) return true;

  const watchers = new Map();
  let nextWatchId = 1;

  const toWebPosition = (position) => ({
    coords: {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy || 0,
      altitude: null,
      altitudeAccuracy: null,
      heading: position.heading || null,
      speed: position.speed || null,
    },
    timestamp: position.timestamp || Date.now(),
  });

  const shim = {
    __silgappNativeShim: true,
    getCurrentPosition(success, error, options = {}) {
      getNativeCurrentPosition(options)
        .then((position) => success?.(toWebPosition(position)))
        .catch((err) => error?.(err));
    },
    watchPosition(success, error, options = {}) {
      const id = nextWatchId++;
      startNativeLocationSync({
        intervalMs: Math.max(Number(options?.timeout || 5000), 3000),
        distanceFilter: 3,
        onPosition: (position) => success?.(toWebPosition(position)),
      })
        .then((cleanup) => watchers.set(id, cleanup))
        .catch((err) => error?.(err));
      return id;
    },
    clearWatch(id) {
      const cleanup = watchers.get(id);
      if (cleanup) cleanup();
      watchers.delete(id);
    },
  };

  try {
    Object.defineProperty(navigator, "geolocation", {
      value: shim,
      configurable: true,
    });
    return true;
  } catch (_) {
    navigator.geolocation = shim;
    return true;
  }
}

export async function pickNativeContact() {
  if (!isNativeAndroid() && Capacitor.getPlatform() === "ios") {
    const permission = await Contacts.requestPermissions();
    if (permission?.contacts !== "granted") throw new Error("Permission Contacts refusee");
    const result = await Contacts.pickContact({
      projection: {
        name: true,
        phones: true,
      },
    });
    const contact = result?.contact || {};
    const name = contact.name?.display ||
      [contact.name?.given, contact.name?.family].filter(Boolean).join(" ") ||
      "Contact";
    return {
      nom: name,
      telephone: contact.phones?.[0]?.number || "",
    };
  }

  const contact = await SilgappNative.pickContact();
  return {
    nom: contact?.name || "Contact",
    telephone: contact?.phone || "",
  };
}

export async function scanNativeQrCode() {
  if (!isNativeAndroid()) {
    throw new Error("Scanner QR natif indisponible sur iOS dans ce build");
  }
  const result = await SilgappNative.scanQrCode();
  if (!result?.value) throw new Error("QR code vide");
  return result.value;
}

export async function openNativeAppSettings() {
  if (!isNativeAndroid()) return false;
  return SilgappNative.openAppSettings();
}
