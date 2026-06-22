import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, Shield, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { base44 } from "@/api/base44Client";

const FALLBACK_APK_URL = "https://drive.google.com/file/d/1uuL4Ace9Hk9flL2leRv6CFK1FEsU-F0z/view?usp=sharing";

export default function TelechargerSILGAPP() {
  const [mounted, setMounted] = useState(false);
  const [apkUrl, setApkUrl] = useState(FALLBACK_APK_URL);

  useEffect(() => {
    setMounted(true);

    // Charger le lien APK depuis AppConfig
    base44.entities.AppConfig.filter({ cle: "GOOGLE_DRIVE_APK_URL" })
      .then(configs => {
        if (configs && configs.length > 0 && configs[0].valeur) {
          setApkUrl(configs[0].valeur);
        }
      })
      .catch(() => {});

    // Tracking visite
    const country = (() => {
      const lang = navigator.language || "fr-FR";
      const map = { "fr-BF": "BF", "fr-CI": "CI", "fr-TG": "TG", "fr-BJ": "BJ", "fr-SN": "SN", "fr-ML": "ML", "fr-GN": "GN", "fr-NE": "NE" };
      return map[lang] || "BF";
    })();
    const platform = /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad/i.test(navigator.userAgent) ? "ios" : "web";

    base44.functions.invoke("trackDownloadPublic", { event_type: "page_visit", country_code: country, platform, referrer: "direct" }).catch(() => {});
  }, []);

  const trackDownload = () => {
    const country = navigator.language?.includes("BF") ? "BF" : navigator.language?.includes("CI") ? "CI" : "BF";
    const platform = /Android/i.test(navigator.userAgent) ? "android" : "web";
    base44.functions.invoke("trackDownloadPublic", { event_type: "apk_download", country_code: country, platform, referrer: "direct" }).catch(() => {});
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md text-center space-y-8"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mx-auto w-20 h-20 rounded-[1.75rem] bg-white shadow-lg shadow-black/5 border border-gray-100 flex items-center justify-center overflow-hidden"
        >
          <img
            src="https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/d7ba7bd0e_IMG-20260523-WA00033.jpg"
            alt="SILGAPP"
            className="w-14 h-14 object-contain"
            onError={(e) => {
              e.target.style.display = "none";
              e.target.parentElement.innerHTML = '<span class="text-2xl font-black text-gray-900">S</span>';
            }}
          />
        </motion.div>

        {/* Titre + sous-titre */}
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Télécharger SILGAPP
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            Installez la dernière version de l'application SILGAPP sur Android.
          </p>
        </div>

        {/* Bouton principal */}
        <motion.a
          href={apkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={trackDownload}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="block w-full h-16 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-bold text-lg shadow-xl shadow-gray-900/20 transition-all duration-200 flex items-center justify-center gap-3"
        >
          <Download className="w-5 h-5" />
          Télécharger l'APK
        </motion.a>

        {/* Lien alternatif discret */}
        <a
          href={apkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={trackDownload}
          className="block text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
        >
          Si le téléchargement ne démarre pas, cliquez ici
        </a>

        {/* QR Code */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-500">Scannez pour télécharger</p>
          <div className="bg-white p-3 rounded-xl inline-block shadow-md">
            <QRCodeSVG value={apkUrl} size={140} level="H" includeMargin />
          </div>
        </div>

        {/* Confiance */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <Shield className="w-3.5 h-3.5" />
          <span>Version officielle SILGAPP — Android uniquement</span>
        </div>

        {/* Avertissement Android */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-left space-y-1.5">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-amber-800">À propos de l'installation</p>
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            Si Android affiche <strong>"fichier potentiellement dangereux"</strong>, confirmez l'installation.
            Ce message apparaît car l'application est téléchargée hors Play Store.
          </p>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-gray-300">
          © {new Date().getFullYear()} SILGAPP. Tous droits réservés.
        </p>
      </motion.div>
    </div>
  );
}
