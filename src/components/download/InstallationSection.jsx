import React from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Smartphone, AlertCircle, Play, CheckCircle } from "lucide-react";

const steps = [
  "Cliquez sur « Télécharger l'APK SILGAPP »",
  "Téléchargez le fichier APK",
  "Ouvrez le fichier téléchargé",
  "Autorisez l'installation de sources inconnues si demandé",
  "Installez SILGAPP",
  "Ouvrez l'application",
  "Activez votre GPS",
  "Complétez vos informations et commencez",
];

export default function InstallationSection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="space-y-8"
    >
      {/* Instructions */}
      <Card className="overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="p-8 sm:p-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white">Guide d'installation</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.05 }}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <span className="text-sm font-bold text-white">{i + 1}</span>
                </div>
                <p className="text-sm text-white/80 font-light pt-1">{step}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.8 }}
          >
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-bold text-amber-400 mb-2">Important</h4>
                <p className="text-sm text-amber-200/80 font-light leading-relaxed">
                  Si Android bloque l'installation, cliquez sur <strong>« Autoriser cette source »</strong> dans les paramètres.
                  C'est une mesure de sécurité normale pour les applications hors Play Store.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </Card>

      {/* Compatibility */}
      <Card className="overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="p-8 sm:p-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white">Compatibilité</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <motion.div
              className="flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg shadow-green-500/30">
                <Play className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-white text-lg">Android</p>
                <p className="text-sm text-white/60">Application native (APK)</p>
              </div>
              <CheckCircle className="w-6 h-6 text-green-400" />
            </motion.div>

            <motion.div
              className="flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.7 }}
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Smartphone className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-white text-lg">iPhone (iOS)</p>
                <p className="text-sm text-white/60">Version navigateur web</p>
              </div>
              <CheckCircle className="w-6 h-6 text-blue-400" />
            </motion.div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
