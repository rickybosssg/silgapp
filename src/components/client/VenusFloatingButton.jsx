import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Move } from "lucide-react";
import VenusChat from "./VenusChat";
import { useAdminContext } from "@/hooks/useAdminContext";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const VENUS_AVATAR_URL = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

export default function VenusFloatingButton() {
  const [showChat, setShowChat] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [constraint, setConstraint] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const imgRef = useRef(null);
  const buttonRef = useRef(null);

  // Contexte admin (pays actif)
  const { selectedCountry, isPays, countryCode } = useAdminContext();
  const effectiveCountry = isPays ? countryCode : (selectedCountry || null);

  // Charger les données du pays actif
  const { data: countryData } = useQuery({
    queryKey: ["country_context", effectiveCountry],
    queryFn: () => base44.entities.Country.filter({ code: effectiveCountry }),
    enabled: !!effectiveCountry,
    staleTime: 5 * 60 * 1000,
  });

  // Livreurs disponibles du pays
  const { data: livreursData } = useQuery({
    queryKey: ["livreurs_dispos_venus", effectiveCountry],
    queryFn: () => base44.entities.Livreur.filter({ country_code: effectiveCountry, statut: "disponible", actif: true }),
    enabled: !!effectiveCountry,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Publicités actives du pays
  const { data: pubsData } = useQuery({
    queryKey: ["pubs_actives_venus", effectiveCountry],
    queryFn: () => base44.entities.Publicite.filter({ actif: true }),
    enabled: !!effectiveCountry,
    staleTime: 5 * 60 * 1000,
    select: (pubs) => pubs.filter(p => {
      if (!effectiveCountry) return true;
      if (!p.pays_cibles || p.pays_cibles === "tous") return true;
      try { const arr = JSON.parse(p.pays_cibles); return arr.includes(effectiveCountry); } catch { return false; }
    }),
  });

  // Construire le contexte pays pour VENUS
  const country = countryData?.[0];
  const countryContext = country ? {
    code: country.code,
    nom: country.nom,
    ville: country.ville_principale,
    devise: country.devise || "FCFA",
    prix_par_km: country.prix_par_km,
    prix_minimum: country.prix_minimum,
    indicatif: country.indicatif,
    rayon_km: country.rayon_km,
    emoji: country.emoji_flag,
    livreursDispos: livreursData?.length ?? null,
    pubsActives: pubsData?.length ?? 0,
  } : null;

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

  // Initialiser les contraintes de déplacement
  useEffect(() => {
    const updateConstraints = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setConstraint({
          left: -window.innerWidth + rect.width + 24,
          right: window.innerWidth - rect.width - 24,
          top: -window.innerHeight + rect.height + 24,
          bottom: window.innerHeight - rect.height - 24,
        });
      }
    };

    updateConstraints();
    window.addEventListener("resize", updateConstraints);
    return () => window.removeEventListener("resize", updateConstraints);
  }, []);

  // Sauvegarder la position dans le localStorage
  useEffect(() => {
    const saved = localStorage.getItem("venus_button_position");
    if (saved) {
      try {
        setPosition(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const handleDragEnd = (_, info) => {
    const newPosition = {
      x: position.x + info.offset.x,
      y: position.y + info.offset.y,
    };
    setPosition(newPosition);
    localStorage.setItem("venus_button_position", JSON.stringify(newPosition));
    setIsDragging(false);
  };

  return (
    <>
      {/* Bouton flottant VENUS déplaçable */}
      <motion.button
        ref={buttonRef}
        drag
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={constraint}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        initial={{ scale: 0, opacity: 0, x: position.x, y: position.y }}
        animate={{ scale: 1, opacity: 1, x: position.x, y: position.y }}
        exit={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: isDragging ? 1 : 1.1 }}
        whileTap={{ scale: isDragging ? 1 : 0.95 }}
        onClick={() => !isDragging && setShowChat(true)}
        className="fixed z-50 flex items-center justify-center w-16 h-16 rounded-full shadow-2xl overflow-hidden border-4 border-white cursor-grab active:cursor-grabbing"
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          boxShadow: isDragging 
            ? "0 12px 40px rgba(102, 126, 234, 0.5)" 
            : "0 8px 32px rgba(102, 126, 234, 0.4), 0 0 20px rgba(118, 75, 162, 0.3)",
          right: "24px",
          bottom: "24px",
        }}
      >
        {/* Animation glow/pulse */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            animation: isDragging ? "none" : "pulse-glow 2s ease-in-out infinite",
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
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-400 to-pink-500">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          )}
        </div>

        {/* Badge d'indication */}
        {!isDragging && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center"
          >
            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
          </motion.div>
        )}

        {/* Icône de déplacement (visible au survol) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isDragging ? 1 : 0 }}
          className="absolute inset-0 bg-black/20 flex items-center justify-center"
        >
          <Move className="w-6 h-6 text-white" />
        </motion.div>
      </motion.button>

      {/* Chat VENUS */}
      <AnimatePresence>
        {showChat && <VenusChat onClose={() => setShowChat(false)} countryContext={countryContext} />}
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
