import React, { useState, useEffect } from "react";
import { X, Download } from "lucide-react";
import { base44 } from "@/api/base44Client";

const DISMISSAL_KEY = "silgapp_ios_banner_dismissed";
const DISMISSAL_DAYS = 7;

export default function IOSAppStoreBanner() {
  const [visible, setVisible] = useState(false);
  const [appStoreUrl, setAppStoreUrl] = useState("");

  useEffect(() => {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;
    if (window.location.pathname === "/telecharger") return;

    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    if (!isIOS) return;

    const dismissed = localStorage.getItem(DISMISSAL_KEY);
    if (dismissed) {
      const daysSince = (Date.now() - new Date(dismissed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISSAL_DAYS) return;
    }

    base44.entities.AppConfig.filter({ cle: "APPSTORE_URL" })
      .then(configs => {
        if (configs && configs.length > 0 && configs[0].valeur) {
          setAppStoreUrl(configs[0].valeur);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSAL_KEY, new Date().toISOString());
    setVisible(false);
  };

  if (!visible || !appStoreUrl) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] safe-area-bottom">
      <div className="bg-gray-900 text-white px-4 py-3 shadow-2xl">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img
              src="https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/d7ba7bd0e_IMG-20260523-WA00033.jpg"
              alt="SILGAPP"
              className="w-7 h-7 rounded-lg object-cover"
              onError={(e) => {
                e.target.style.display = "none";
                e.target.parentElement.innerHTML = '<span class="text-lg font-black">S</span>';
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight">SILGAPP sur l'App Store</p>
            <p className="text-xs text-white/70 leading-tight mt-0.5">
              Notifications en temps réel — téléchargez l'app
            </p>
          </div>
          <a
            href={appStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-white text-gray-900 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger
          </a>
          <button
            onClick={handleDismiss}
            className="text-white/50 hover:text-white p-1 flex-shrink-0"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}