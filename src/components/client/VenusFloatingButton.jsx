import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import VenusChat from "./VenusChat";

const VENUS_AVATAR_URL = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

export default function VenusFloatingButton() {
  const [showChat, setShowChat] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef(null);

  // Préchargement de l'image
  useEffect(() => {
    const img = new Image();
    img.src = VENUS_AVATAR_URL;
    img.onload = () => {
      setImageLoaded(true);
    };
    img.onerror = () => {
      setImageError(true);
      console.error("Failed to load VENUS avatar");
    };
  }, []);

  return (
    <>
      {/* Bouton flottant VENUS */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowChat(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-16 h-16 rounded-full shadow-2xl overflow-hidden border-4 border-white cursor-pointer"
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          boxShadow: "0 8px 32px rgba(102, 126, 234, 0.4), 0 0 20px rgba(118, 75, 162, 0.3)"
        }}
      >
        {/* Animation glow/pulse */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            animation: "pulse-glow 2s ease-in-out infinite",
            background: "radial-gradient(circle, rgba(102, 126, 234, 0.6) 0%, transparent 70%)"
          }}
        />
        
        {/* Avatar VENUS */}
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          {!imageError && imageLoaded ? (
            <img
              ref={imgRef}
              src={VENUS_AVATAR_URL}
              alt="VENUS AI Assistant"
              className="w-full h-full object-cover"
              loading="eager"
            />
          ) : (
            // Fallback en cas d'erreur de chargement
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-400 to-pink-500">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          )}
        </div>

        {/* Badge d'indication */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center"
        >
          <div className="w-2 h-2 bg-white rounded-full animate-ping" />
        </motion.div>
      </motion.button>

      {/* Chat VENUS */}
      <AnimatePresence>
        {showChat && <VenusChat onClose={() => setShowChat(false)} />}
      </AnimatePresence>

      {/* Styles CSS pour l'animation */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
      `}</style>
    </>
  );
}