import { Capacitor } from "@capacitor/core";
import { Contacts } from "@capacitor-community/contacts";
import { registerPushToken, getNativePushDebugState } from "@/lib/notifications";

function saveNativePermissionDebug(result) {
  try {
    localStorage.setItem("silgapp_native_permissions_last", JSON.stringify({
      ...result,
      at: new Date().toISOString(),
    }));
  } catch (_) {}
  console.log("[SILGAPP Native Permissions]", result);
}

export async function requestNativeAppPermissions({
  email,
  userEmail,
  userType = "client",
  livreurId = "",
  clientId = "",
  requestContacts = true,
} = {}) {
  const normalizedEmail = (email || userEmail || "").trim().toLowerCase();
  const result = {
    isNative: Capacitor.isNativePlatform(),
    platform: Capacitor.getPlatform(),
    userType,
    userEmail: normalizedEmail,
    pushToken: null,
    pushStateBefore: null,
    pushStateAfter: null,
    contactsBefore: null,
    contactsAfter: null,
    errors: [],
  };

  if (!result.isNative) {
    result.skipped = "not-native";
    saveNativePermissionDebug(result);
    return result;
  }

  try {
    result.pushStateBefore = await getNativePushDebugState();
    result.pushToken = await registerPushToken(livreurId || null, {
      email: normalizedEmail,
      user_email: normalizedEmail,
      user_type: userType,
      livreur_id: livreurId || "",
      client_id: clientId || "",
    });
    result.pushStateAfter = await getNativePushDebugState();
  } catch (error) {
    result.errors.push({ step: "push", message: error?.message || String(error) });
  }

  if (requestContacts) {
    try {
      result.contactsBefore = await Contacts.checkPermissions();
      result.contactsAfter = await Contacts.requestPermissions();
      if (result.contactsAfter?.contacts === "granted") {
        localStorage.setItem("silgapp_contacts_permission", "true");
      }
    } catch (error) {
      result.errors.push({ step: "contacts", message: error?.message || String(error) });
    }
  }

  saveNativePermissionDebug(result);
  return result;
}
