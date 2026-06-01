import React from "react";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Zap, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function PremiumHeader({ downloadCount }) {
  return (
    <header className="border-b border-white/5 backdrop-blur-xl bg-black/40">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <motion.div 
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ scale: 1.08, rotate: -5 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <img 
                src="https://cdn.silgapp.com/logo-silgapp-official.png"
                alt="SILGAPP Logo" 
                className="w-16 h-16 object-contain drop-shadow-2xl"
              />
            </motion.div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">SILGAPP</h1>
              <p className="text-xs text-white/50 font-medium tracking-wide uppercase">Premium Delivery</p>
            </div>
          </div>
          <Badge className="bg-gradient-to-r from-red-600 to-red-700 text-white border-0 px-4 py-2 text-sm font-bold shadow-lg shadow-red-500/30">
            <Star className="w-4 h-4 mr-2" fill="currentColor" />
            v2.0.4
          </Badge>
        </motion.div>
      </div>
    </header>
  );
}

export function HeroSection({ downloadCount }) {
  return (
    <motion.section 
      className="text-center space-y-8"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="inline-flex items-center gap-3 bg-gradient-to-r from-red-500/10 to-red-600/10 backdrop-blur-xl border border-red-500/20 rounded-full px-6 py-3"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <Sparkles className="w-4 h-4 text-red-400" />
        </div>
        <span className="text-sm font-bold text-white">
          {downloadCount.toLocaleString()} téléchargements ce mois
        </span>
        <TrendingUp className="w-4 h-4 text-green-400" />
      </motion.div>
      
      <motion.h2 
        className="text-5xl sm:text-7xl font-black text-white leading-tight tracking-tight"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
      >
        L'avenir de la
        <span className="block bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
          livraison instantanée
        </span>
      </motion.h2>
      
      <motion.p 
        className="text-xl text-white/60 max-w-3xl mx-auto font-light leading-relaxed"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4 }}
      >
        Rejoignez la révolution SILGAPP. Une expérience premium conçue pour les clients exigeants et les livreurs professionnels.
      </motion.p>
    </motion.section>
  );
}