import { appParams, APP_PUBLIC_URL } from "@/lib/app-params";

export const isCapacitor = () => appParams.isCapacitor;

export const getLoginReturnUrl = () => {
  if (appParams.isCapacitor) return "com.silgapp.app://auth?domain=dispatch";
  if (typeof window === "undefined") return APP_PUBLIC_URL;

  const url = new URL(window.location.href);
  url.searchParams.delete("clear_access_token");
  return url.toString();
};

export const redirectToLogin = (returnUrl = getLoginReturnUrl()) => {
  if (appParams.isCapacitor) {
    window.location.replace(APP_PUBLIC_URL);
    return;
  }

  const loginBaseUrl = appParams.appBaseUrl || APP_PUBLIC_URL;
  window.location.href = `${loginBaseUrl.replace(/\/$/, "")}/login?from_url=${encodeURIComponent(returnUrl)}`;
};
