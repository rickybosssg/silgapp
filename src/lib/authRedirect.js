import { appParams, APP_PUBLIC_URL } from "@/lib/app-params";

export const isCapacitor = () => appParams.isCapacitor;

export const APP_DEEP_LINK_URL = "com.silgapp.app://auth";

export const buildNativeAuthCallbackUrl = (token) => {
  const url = new URL(APP_DEEP_LINK_URL);
  url.searchParams.set("domain", "dispatch");
  if (token) url.searchParams.set("access_token", token);
  return url.toString();
};

export const getWebNativeReturnUrl = () => {
  const loginBaseUrl = (appParams.appBaseUrl || APP_PUBLIC_URL).replace(/\/$/, "");
  const url = new URL(`${loginBaseUrl}/`);
  url.searchParams.set("native_return", "1");
  url.searchParams.set("domain", "dispatch");
  return url.toString();
};

export const getLoginReturnUrl = () => {
  if (appParams.isCapacitor) return getWebNativeReturnUrl();
  if (typeof window === "undefined") return APP_PUBLIC_URL;

  const url = new URL(window.location.href);
  url.searchParams.delete("clear_access_token");
  return url.toString();
};

export const getLoginUrl = (returnUrl = getLoginReturnUrl()) => {
  const loginBaseUrl = appParams.appBaseUrl || APP_PUBLIC_URL;
  return `${loginBaseUrl.replace(/\/$/, "")}/login?from_url=${encodeURIComponent(returnUrl)}`;
};

export const redirectToLogin = (returnUrl = getLoginReturnUrl()) => {
  window.location.href = getLoginUrl(returnUrl);
};
