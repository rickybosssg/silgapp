import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PremiumHeader from "@/components/download/PremiumHeader";
import DownloadCard from "@/components/download/DownloadCard";
import FeatureCards from "@/components/download/FeatureCards";
import InstallationSection from "@/components/download/InstallationSection";
import SecurityAndSupport from "@/components/download/SecurityAndSupport";
import { base44 } from "@/api/base44Client";

export default function TelechargerSILGAPP() {
  const [downloadCount, setDownloadCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState(null);

  // Détecter le pays et la plateforme
  const detectCountry = () => {
    const lang = navigator.language || 'fr-FR';
    const countryMap = {
      'fr-BF': 'BF', 'fr-CI': 'CI', 'fr-TG': 'TG', 'fr-BJ': 'BJ',
      'fr-SN': 'SN', 'fr-ML': 'ML', 'fr-GN': 'GN', 'fr-NE': 'NE',
      'fr': 'BF'
    };
    return countryMap[lang] || 'BF';
  };

  const detectPlatform = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Android')) return 'android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'ios';
    return 'web';
  };

  useEffect(() => {
    setMounted(true);
    
    // Charger les statistiques (fonction publique)
    base44.functions.invoke('getDownloadStatsPublic', {}).then(res => {
      if (res.data && res.data.stats) {
        setStats(res.data.stats);
        setDownloadCount(res.data.stats.month_downloads || 2847);
      }
    }).catch(() => {
      // En cas d'erreur, utiliser une valeur par défaut
      setDownloadCount(2847);
    });

    // Tracker la visite (fonction publique - ne bloque pas)
    const country = detectCountry();
    const platform = detectPlatform();
    base44.functions.invoke('trackDownloadPublic', {
      event_type: 'page_visit',
      country_code: country,
      platform: platform,
      referrer: 'direct'
    }).catch(() => {}); // Ignore les erreurs
  }, []);

  const handleDownload = () => {
    const newCount = downloadCount + 1;
    setDownloadCount(newCount);
    
    // Tracker le clic (fonction publique - ne bloque pas)
    const country = detectCountry();
    const platform = detectPlatform();
    base44.functions.invoke('trackDownloadPublic', {
      event_type: 'download_click',
      country_code: country,
      platform: platform,
      referrer: 'direct'
    }).catch(() => {}); // Ignore silencieusement

    // OUVERTURE IMMÉDIATE DU LIEN GOOGLE DRIVE
    window.open("https://drive.google.com/file/d/1CpTlE9E2EE3bnydQPsA0CarV9-taWkVO/view?usp=sharing", "_blank");

    // Tracker le téléchargement effectif (après 3 secondes - ne bloque pas)
    setTimeout(() => {
      base44.functions.invoke('trackDownloadPublic', {
        event_type: 'apk_download',
        country_code: country,
        platform: platform,
        referrer: 'direct'
      }).catch(() => {}); // Ignore silencieusement
    }, 3000);
  };

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
      {/* Background ambient effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-950/20 via-black to-red-950/20" />
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[128px]" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-red-700/10 rounded-full blur-[128px]" />
      
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      
      {/* Main content */}
      <div className="relative z-10">
        <AnimatePresence>
          {mounted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              <PremiumHeader />
              
              <main className="max-w-6xl mx-auto px-6 py-16 space-y-12">
                <DownloadCard 
                downloadCount={downloadCount}
                onDownload={handleDownload}
              />
                
                <FeatureCards />
                
                <InstallationSection />
                
                <SecurityAndSupport pageUrl={pageUrl} />
              </main>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}