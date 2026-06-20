import React from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { User, Truck, CheckCircle } from "lucide-react";

const features = {
  client: [
    "Commandez une livraison en 3 clics",
    "Suivez votre livreur en temps réel",
    "Gérez vos courses facilement",
    "Paiement 100% sécurisé",
  ],
  livreur: [
    "Recevez des courses automatiquement",
    "Activez votre GPS pour être visible",
    "Gagnez de l'argent avec SILGAPP",
    "Contactez le support pour activer votre compte",
  ],
};

export default function FeatureCards() {
  return (
    <motion.div
      className="grid sm:grid-cols-2 gap-6"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
    >
      <motion.div
        whileHover={{ y: -8, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <Card className="group relative overflow-hidden border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-600/5 backdrop-blur-xl hover:border-blue-500/40 transition-all duration-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all duration-500" />

          <div className="p-8 space-y-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <User className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Je suis client</h3>
                <p className="text-sm text-white/60">Simplicité & rapidité</p>
              </div>
            </div>

            <ul className="space-y-4">
              {features.client.map((item, i) => (
                <motion.li
                  key={i}
                  className="flex items-start gap-3 text-white/80"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                >
                  <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <span className="font-light">{item}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </Card>
      </motion.div>

      <motion.div
        whileHover={{ y: -8, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <Card className="group relative overflow-hidden border border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-orange-600/5 backdrop-blur-xl hover:border-orange-500/40 transition-all duration-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl group-hover:bg-orange-500/20 transition-all duration-500" />

          <div className="p-8 space-y-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <Truck className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Je suis livreur</h3>
                <p className="text-sm text-white/60">Gagnez plus</p>
              </div>
            </div>

            <ul className="space-y-4">
              {features.livreur.map((item, i) => (
                <motion.li
                  key={i}
                  className="flex items-start gap-3 text-white/80"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                >
                  <CheckCircle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <span className="font-light">{item}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}