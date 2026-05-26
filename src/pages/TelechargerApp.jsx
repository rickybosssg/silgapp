import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download, Truck, Package, Shield, Zap } from "lucide-react";

const DEFAULT_APK_URL = "https://drive.google.com/uc?export=download&id=1zCeyzyAMP1CkTimaPMk-mJW560ZQWhmd";

export default function TelechargerApp() {
  const [apkUrl, setApkUrl] = useState(DEFAULT_APK_URL);

  useEffect(() => {
    base44.entities.AppConfig.filter({ cle: "GOOGLE_DRIVE_APK_URL" })
      .then((configs) => {
        if (configs?.[0]?.valeur) setApkUrl(configs[0].valeur);
      })
      .catch(() => null);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo & Header */}
        <div className="text-center space-y-4">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-red-700 flex items-center justify-center mx-auto shadow-2xl shadow-red-200">
            <Truck className="w-12 h-12 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900">SILGAPP</h1>
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mt-1">Externe</p>
          </div>
        </div>

        {/* Message principal */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-gray-800">
            Suivez vos colis en direct
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Installez l'application SILGAPP pour suivre vos livraisons en temps réel, recevoir des notifications et contacter votre livreur.
          </p>
        </div>

        {/* Fonctionnalités */}
        <div className="space-y-3">
          {[
            { icon: Package, label: "Suivez vos colis en temps réel" },
            { icon: Zap, label: "Notifications instantanées" },
            { icon: Shield, label: "Livraison sécurisée avec QR code" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-gray-700">{label}</p>
            </div>
          ))}
        </div>

        {/* Bouton téléchargement */}
        <a href={apkUrl} target="_blank" rel="noopener noreferrer" className="block">
          <Button
            className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 hover:shadow-xl transition-all active:scale-95"
          >
            <Download className="w-5 h-5 mr-2" />
            Télécharger l'APK
          </Button>
        </a>

        {/* Note sécurité */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
          <p className="text-xs text-amber-700 font-medium leading-relaxed">
            ⚠️ Lors de l'installation, autorisez les "sources inconnues" dans les paramètres de votre téléphone Android.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          SILGAPP Externe · Livraison express à Ouagadougou
        </p>
      </div>
    </div>
  );
}