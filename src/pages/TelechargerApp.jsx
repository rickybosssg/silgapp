import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Download, CheckCircle, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

const DEFAULT_APK_URL = "https://drive.google.com/uc?export=download&id=1zCeyzyAMP1CkTimaPMk-mJW560ZQWhmd";
const LOGO_URL = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/52f8577cf_IMG-20260523-WA00031.jpg";

const STEPS = [
  { num: 1, label: "Télécharger l'APK", desc: "Appuyez sur le bouton rouge ci-dessus" },
  { num: 2, label: "Ouvrir le fichier téléchargé", desc: "Depuis la barre de notification ou vos Téléchargements" },
  { num: 3, label: 'Autoriser "Installer des applications inconnues"', desc: "Si Android le demande, autorisez l'installation" },
  { num: 4, label: "Installer SILGAPP", desc: "Suivez les étapes d'installation Android" },
];

export default function TelechargerApp() {
  const [apkUrl, setApkUrl] = useState(DEFAULT_APK_URL);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    base44.entities.AppConfig.filter({ cle: "GOOGLE_DRIVE_APK_URL" })
      .then((configs) => {
        if (configs?.[0]?.valeur) setApkUrl(configs[0].valeur);
      })
      .catch(() => null);
  }, []);

  const handleDownload = () => {
    setDownloading(true);
    window.location.href = apkUrl;
    setTimeout(() => {
      setDownloading(false);
      setDownloaded(true);
    }, 2000);
  };

  const handleOuvrir = () => {
    // Deep link vers l'app SILGAPP si installée
    window.location.href = "silgapp://open";
    setTimeout(() => {
      // Fallback : rien à faire, l'app n'est pas détectable depuis le web
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center">
      {/* Hero section */}
      <div className="w-full max-w-md px-6 pt-12 pb-6 flex flex-col items-center">

        {/* Logo animé */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-6"
        >
          <img
            src={LOGO_URL}
            alt="SILGAPP"
            className="w-28 h-28 rounded-3xl shadow-2xl shadow-red-900/60"
          />
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl font-black tracking-tight">SILGAPP Externe</h1>
          <p className="text-gray-400 text-sm mt-2">Livraison express à Ouagadougou</p>
        </motion.div>

        {/* Bouton téléchargement principal */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="w-full mb-4"
        >
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full h-16 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 transition-all font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-red-900/50 disabled:opacity-70"
          >
            {downloading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Téléchargement...
              </>
            ) : (
              <>
                <Download className="w-6 h-6" />
                Télécharger l'APK
              </>
            )}
          </button>
        </motion.div>

        {/* Avertissement sécurité Android */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-4 mb-6"
        >
          <p className="text-xs text-amber-400 font-semibold mb-1">⚠️ Avertissement Android</p>
          <p className="text-xs text-gray-300 leading-relaxed">
            Android peut afficher un avertissement de sécurité lors du téléchargement.
            Cliquez simplement sur{" "}
            <span className="text-white font-bold">"Télécharger quand même"</span>.
          </p>
        </motion.div>

        {/* Section installation */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="w-full"
        >
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
            Comment installer SILGAPP
          </p>

          <div className="space-y-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.65 + i * 0.08 }}
                className="flex items-start gap-4 bg-zinc-900 rounded-2xl px-4 py-4 border border-zinc-800"
              >
                <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 font-black text-sm">
                  {step.num}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white leading-tight">{step.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-1" />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bouton "J'ai installé l'application" */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1, duration: 0.4 }}
          className="w-full mt-6"
        >
          {downloaded ? (
            <div className="text-center mb-3">
              <span className="text-green-400 text-xs font-semibold flex items-center justify-center gap-1">
                <CheckCircle className="w-4 h-4" /> Téléchargement lancé
              </span>
            </div>
          ) : null}

          <button
            onClick={handleOuvrir}
            className="w-full h-14 rounded-2xl border-2 border-zinc-700 bg-zinc-900 text-white font-bold text-base flex items-center justify-center gap-3 active:bg-zinc-800 transition-all"
          >
            <CheckCircle className="w-5 h-5 text-green-400" />
            J'ai installé l'application
          </button>
          <p className="text-center text-xs text-gray-600 mt-2">
            Ouvre directement SILGAPP si déjà installé
          </p>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-700 mt-8 pb-8">
          SILGAPP · Livraison express · Ouagadougou
        </p>
      </div>
    </div>
  );
}