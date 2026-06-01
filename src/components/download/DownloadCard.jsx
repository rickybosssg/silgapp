import React from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function DownloadCard({ downloadCount, onDownload }) {
  const apkUrl = "https://drive.google.com/file/d/1CpTlE9E2EE3bnydQPsA0CarV9-taWkVO/view?usp=sharing";
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <Card className="relative overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
        
        <div className="p-8 sm:p-12 space-y-10">
          <div className="text-center space-y-6">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={onDownload}
                className="w-full h-20 bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:to-red-400 text-white text-xl font-bold shadow-2xl shadow-red-500/40 transition-all duration-300"
              >
                <Download className="w-8 h-8 mr-3" />
                Télécharger l'APK SILGAPP
                <ExternalLink className="w-6 h-6 ml-2" />
              </Button>
            </motion.div>
            
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <span className="flex items-center gap-2 text-white/70">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-medium">Gratuit</span>
              </span>
              <span className="flex items-center gap-2 text-white/70">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-medium">Version officielle</span>
              </span>
              <span className="flex items-center gap-2 text-white/70">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-medium">28.5 MB</span>
              </span>
              <span className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 font-bold">
                <Download className="w-4 h-4" />
                {downloadCount.toLocaleString()} téléchargements ce mois
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-emerald-500/20 blur-2xl" />
            <div className="relative flex flex-col sm:flex-row items-center gap-8 p-8 rounded-3xl bg-white/5 border border-white/10">
              <motion.div 
                className="bg-white p-4 rounded-2xl shadow-2xl"
                whileHover={{ scale: 1.05, rotate: 2 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <QRCodeSVG 
                  value={apkUrl}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              </motion.div>
              <div className="text-center sm:text-left space-y-3">
                <h3 className="text-2xl font-bold text-white">📱 Scan & Go</h3>
                <p className="text-white/60 font-light leading-relaxed">
                  Scannez ce QR code avec votre appareil photo pour télécharger instantanément l'application
                </p>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>Lien sécurisé Google Drive</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}