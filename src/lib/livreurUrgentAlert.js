import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect } from "react";

const SilgappPush = registerPlugin("SilgappPush");

export const DEFAULT_LIVREUR_ALERT_DURATION_SECONDS = 120;
export const DEFAULT_LIVREUR_ALERT_INTERVAL_SECONDS = 5;

const STORAGE_DURATION_KEY = "silgapp_livreur_alert_duration_seconds";
const STORAGE_INTERVAL_KEY = "silgapp_livreur_alert_interval_seconds";

let activeAlert = null;
let sharedAudioCtx = null;

function toPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStoredNumber(key, fallback) {
  try {
    return toPositiveNumber(localStorage.getItem(key), fallback);
  } catch (_) {
    return fallback;
  }
}

export function normalizeLivreurAlertConfig(config = {}) {
  const duration = toPositiveNumber(
    config.alert_duration_seconds ?? config.duree_alerte_livreur_secondes ?? config.durationSeconds ?? config.timeout_secondes,
    readStoredNumber(STORAGE_DURATION_KEY, DEFAULT_LIVREUR_ALERT_DURATION_SECONDS)
  );
  const interval = toPositiveNumber(
    config.alert_interval_seconds ?? config.intervalle_vibration_secondes ?? config.intervalSeconds,
    readStoredNumber(STORAGE_INTERVAL_KEY, DEFAULT_LIVREUR_ALERT_INTERVAL_SECONDS)
  );

  return {
    durationSeconds: clamp(Math.round(duration), 10, 180),
    intervalSeconds: clamp(Math.round(interval), 3, 30),
  };
}

export function saveLivreurAlertConfig(config = {}) {
  const normalized = normalizeLivreurAlertConfig(config);
  try {
    localStorage.setItem(STORAGE_DURATION_KEY, String(normalized.durationSeconds));
    localStorage.setItem(STORAGE_INTERVAL_KEY, String(normalized.intervalSeconds));
  } catch (_) {}
  return normalized;
}

export function isLivreurNewCourseNotification(data = {}) {
  const type = String(data.type || "").trim();
  if (!["nouvelle_course", "course_assignee"].includes(type)) return false;

  const userType = String(data.user_type || data.role || "").trim();
  return userType === "livreur" || !!data.livreur_id;
}

function getAudioCtx() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioContext();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => null);
  }
  return sharedAudioCtx;
}

export function playUrgentCourseSound() {
  try {
    if (typeof window === "undefined") return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const notes = [880, 1100, 880, 1100];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.12);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.13);
    });
  } catch (_) {}
}

function vibrateUrgentPattern() {
  try {
    navigator.vibrate?.([500, 150, 500, 150, 500]);
  } catch (_) {}
}

function stopNativeUrgentAlert() {
  if (!Capacitor.isNativePlatform()) return;
  SilgappPush.stopUrgentCourseAlert?.().catch(() => null);
}

export function stopUrgentCourseAlert(reason = "stopped") {
  if (activeAlert?.intervalId) clearInterval(activeAlert.intervalId);
  if (activeAlert?.timeoutId) clearTimeout(activeAlert.timeoutId);
  activeAlert = null;
  try {
    navigator.vibrate?.(0);
  } catch (_) {}
  stopNativeUrgentAlert();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("silgapp:livreur-urgent-alert-stopped", {
      detail: { reason },
    }));
  }
}

export function startUrgentCourseAlert(options = {}) {
  if (typeof window === "undefined") return null;

  const {
    courseId = "",
    notificationId = "",
    source = "app",
  } = options;
  const config = normalizeLivreurAlertConfig(options);
  const key = courseId ? `course:${courseId}` : `notification:${notificationId || "unknown"}`;

  if (activeAlert?.key === key && Date.now() < activeAlert.endsAt) {
    return activeAlert;
  }

  stopUrgentCourseAlert("restart");

  const durationMs = config.durationSeconds * 1000;
  const intervalMs = config.intervalSeconds * 1000;
  const endsAt = Date.now() + durationMs;

  const tick = () => {
    if (Date.now() >= endsAt) {
      stopUrgentCourseAlert("timeout");
      return;
    }
    vibrateUrgentPattern();
    playUrgentCourseSound();
  };

  tick();
  activeAlert = {
    key,
    courseId,
    notificationId,
    source,
    endsAt,
    intervalId: setInterval(tick, intervalMs),
    timeoutId: setTimeout(() => stopUrgentCourseAlert("timeout"), durationMs + 250),
  };

  window.dispatchEvent(new CustomEvent("silgapp:livreur-urgent-alert-started", {
    detail: { courseId, notificationId, source, ...config },
  }));

  return activeAlert;
}

export function useUrgentCourseAlert(active, options = {}) {
  useEffect(() => {
    if (!active) {
      stopUrgentCourseAlert("inactive");
      return undefined;
    }
    startUrgentCourseAlert(options);
    return () => stopUrgentCourseAlert("unmount");
  }, [
    active,
    options.courseId,
    options.notificationId,
    options.durationSeconds,
    options.intervalSeconds,
  ]);
}