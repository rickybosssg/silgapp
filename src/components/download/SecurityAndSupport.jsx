import React from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Shield, Lock, RefreshCcw, MessageCircle, Phone, ArrowRight, Clock, MapPin } from "lucide-react";

const securityItems = [
  { icon: Lock, title: "Application officielle", desc: "Développée par SILGAPP" },
  { icon: Shield, title: "Lien sécurisé", desc: "Téléchargement vérifié" },
  { icon: RefreshCcw, title: "Mises à jour auto", desc: "Notifications incluses" },
];

export default function SecurityAndSupport({ pageUrl }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className="space-y-8"
    >
      {/* Security */}
      <Card className="overflow-hidden border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl">
        <div className="p-8 sm:p-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white">Sécurité & Confiance</h3>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {securityItems.map((item, i) => (
              <motion.div
                key={i}
                className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/5 hover:bg-white/10 transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.6 + i * 0.1 }}
                whileHover={{ scale: 1.05, y: -4 }}
              >
                <item.icon className="w-8 h-8 text-green-400 mb-4" />
                <h4 className="font-bold text-white mb-2">{item.title}</h4>
                <p className="text-sm text-white/60">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Card>

      {/* Support */}
      <Card className="relative overflow-hidden border border-green-500/20 bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-xl shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl" />
        <div className="p-8 sm:p-12 space-y-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg shadow-green-500/30">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Support Premium</h3>
              <p className="text-sm text-white/60">Assistance dédiée 7j/7</p>
            </div>
          </div>

          <p className="text-white/80 text-lg font-light">
            Une question sur l'installation ou l'activation de votre compte ? Notre équipe est là pour vous accompagner.
          </p>

          <motion.a
            href="https://wa.me/22666925190"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-center gap-4 w-full p-6 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-2xl font-bold text-lg shadow-2xl shadow-green-500/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Phone className="w-6 h-6" />
            <span>+226 66 92 51 90</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </motion.a>

          <div className="flex items-center justify-center gap-6 pt-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-white/60">Disponible sur WhatsApp</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-white/60" />
              <span className="text-xs text-white/60">Réponse en moins de 5 min</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Footer */}
      <motion.footer 
        className="text-center space-y-6 pt-8 border-t border-white/5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="flex items-center justify-center gap-3 text-white/50">
          <MapPin className="w-5 h-5" />
          <span className="text-sm font-medium">Fait avec passion au Burkina Faso</span>
        </div>

        <div className="flex items-center justify-center gap-6">
          {[
            { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}` },
            { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent("Découvrez SILGAPP - La révolution de la livraison ! " + pageUrl)}` },
            { name: "Twitter", href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent("Découvrez SILGAPP - La révolution de la livraison !")}` },
          ].map((social) => (
            <motion.a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/50 hover:text-white transition-all duration-300 text-sm font-medium"
              whileHover={{ scale: 1.1, y: -2 }}
            >
              {social.name}
            </motion.a>
          ))}
        </div>

        <p className="text-xs text-white/30">
          © 2026 SILGAPP. Tous droits réservés.
        </p>
      </motion.footer>
    </motion.div>
  );
}