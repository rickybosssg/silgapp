import { useEffect } from "react";
import { getLoginUrl } from "@/lib/authRedirect";
import { appParams } from "@/lib/app-params";

export default function ConnexionInterne() {
  useEffect(() => {
    let cancelled = false;

    const openLogin = async () => {
      const loginUrl = getLoginUrl();

      try {
        if (appParams.isCapacitor && window.Capacitor?.isNativePlatform?.()) {
          const { Browser } = await import("@capacitor/browser");
          if (!cancelled) await Browser.open({ url: loginUrl, windowName: "_self" });
          return;
        }

        window.location.replace(loginUrl);
      } catch (error) {
        console.error("[ConnexionInterne] Failed to open SILGAPP login:", error);
        window.location.replace(loginUrl);
      }
    };

    openLogin();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
