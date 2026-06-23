import { Capacitor, registerPlugin } from "@capacitor/core";

const SilgappPush = registerPlugin("SilgappPush");

/**
 * Demande l'exclusion de l'optimisation batterie Android.
 * Critique pour Samsung, Xiaomi, Huawei, Tecno, Infinix, Oppo, Vivo.
 * Sans cette exclusion, Android peut tuer l'app en arrière-plan et
 * empêcher la réception des notifications de course.
 */
export async function requestIgnoreBatteryOptimizations() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return { granted: false, reason: "not_android" };
  }

  try {
    const result = await SilgappPush.requestIgnoreBatteryOptimizations();
    return result || { granted: false, reason: "no_response" };
  } catch (error) {
    console.warn("[BatteryOpt] Erreur demande exclusion:", error?.message);
    return { granted: false, reason: "error", error: error?.message };
  }
}

/**
 * Vérifie si l'app est déjà exclue de l'optimisation batterie.
 */
export async function isIgnoringBatteryOptimizations() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return true;
  }

  try {
    const result = await SilgappPush.isIgnoringBatteryOptimizations();
    return result?.ignoring === true;
  } catch (error) {
    console.warn("[BatteryOpt] Erreur vérification:", error?.message);
    return false;
  }
}

/**
 * Ouvre les paramètres Autostart (Xiaomi, Oppo, Vivo, Tecno, Infinix, Huawei, Samsung).
 * Ces fabricants ont des gestionnaires de démarrage automatique propriétaires
 * qui empêchent les apps de recevoir des notifications en arrière-plan.
 */
export async function openAutoStartSettings() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return false;
  }

  try {
    await SilgappPush.openAutoStartSettings();
    return true;
  } catch (error) {
    console.warn("[BatteryOpt] Erreur ouverture Autostart:", error?.message);
    return false;
  }
}

/**
 * Vérifie et demande si nécessaire toutes les optimisations batterie.
 * À appeler quand le livreur passe en ligne.
 */
export async function ensureBatteryOptimizationExemption() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return { skipped: true, reason: "not_android" };
  }

  const alreadyIgnoring = await isIgnoringBatteryOptimizations();
  if (alreadyIgnoring) {
    return { granted: true, reason: "already_ignored" };
  }

  const result = await requestIgnoreBatteryOptimizations();
  return result;
}