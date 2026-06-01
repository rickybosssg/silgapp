import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PremiumHeader from "@/components/download/PremiumHeader";
import DownloadCard from "@/components/download/DownloadCard";
import FeatureCards from "@/components/download/FeatureCards";
import InstallationSection from "@/components/download/InstallationSection";
import SecurityAndSupport from "@/components/download/SecurityAndSupport";

export default function TelechargerSILGAPP() {
  const [downloadCount, setDownloadCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("silgapp_download_count");
    const count = stored ? parseInt(stored) : 2847;
    setDownloadCount(count);
  }, []);

  const handleDownload = () => {
    const newCount = downloadCount + 1;
    setDownloadCount(newCount);
    localStorage.setItem("silgapp_download_count", newCount.toString());
    window.open("https://drive.google.com/file/d/1CpTlE9E2EE3bnydQPsA0CarV9-taWkVO/view?usp=sharing", "_blank");
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