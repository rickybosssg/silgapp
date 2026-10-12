import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { playVictorySoundOnce } from "@/lib/victorySound";

/**
 * LivreurVictoryOverlay — Animation plein écran de célébration livreur.
 *
 * Déclenchée UNIQUEMENT après confirmation backend de la LIVRAISON.
 * Jamais sur la récupération, jamais sur erreur, jamais sur ouverture/rafraîchissement.
 *
 * Durée : 9 secondes exactement.
 *  0.0→1.0s  : le mot apparaît au centre
 *  1.0→4.0s  : le mot grandit de façon spectaculaire (rebond + glow + confettis)
 *  4.0→7.0s  : le mot reste visible à grande taille (lecture confortable)
 *  7.0→8.0s  : "✓ +1 COURSE RÉUSSIE" apparaît
 *  8.5→9.0s  : fondu de sortie
 *
 * Anti-doublon : le composant mémorise le dernier courseId célébré.
 * Un même courseId ne rejoue jamais l'animation.
 *
 * Strictement visuelle — n'effectue aucune opération métier.
 */
const VICTORY_WORDS = [
  "FORMIDABLE !",
  "MAGNIFIQUE !",
  "SUPER !",
  "INCROYABLE !",
  "BRAVO !",
  "EXCELLENT !",
  "CHAMPION !",
];

const DURATION_MS = 9000;

export default function LivreurVictoryOverlay({ courseId, onClose }) {
  const [visible, setVisible] = useState(false);
  const lastCourseIdRef = useRef(null);
  const deadlineRef = useRef(0);
  const closedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Mot aléatoire — choisi une seule fois par courseId (pas de re-tirage au rerender)
  const word = useMemo(
    () => VICTORY_WORDS[Math.floor(Math.random() * VICTORY_WORDS.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId]
  );

  useEffect(() => {
    if (!courseId) {
      setVisible(false);
      return;
    }

    // ── Anti-doublon : même courseId = pas de replay ──
    const firstRun = lastCourseIdRef.current !== courseId;
    if (firstRun) {
      void playVictorySoundOnce(courseId);
      lastCourseIdRef.current = courseId;
      deadlineRef.current = Date.now() + DURATION_MS;
      closedRef.current = false;
    }
    if (closedRef.current) return;
    setVisible(true);
    let cancelled = false;
    let frameId;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // ── Confettis légers (seulement si motion autorisé) ──
    if (!prefersReducedMotion && typeof confetti === "function") {
      const colors = ["#34C759", "#007AFF", "#FFD60A", "#FF9500", "#AF52DE"];
      const end = Date.now() + 3500;
      (function frame() {
        confetti({
          particleCount: 2,
          angle: 60,
          spread: 50,
          startVelocity: 25,
          origin: { x: 0, y: 0.8 },
          colors,
          disableForReducedMotion: true,
          scalar: 0.8,
        });
        confetti({
          particleCount: 2,
          angle: 120,
          spread: 50,
          startVelocity: 25,
          origin: { x: 1, y: 0.8 },
          colors,
          disableForReducedMotion: true,
          scalar: 0.8,
        });
        if (!cancelled && Date.now() < end) frameId = requestAnimationFrame(frame);
      })();
    }

    // Le rafraichissement du parent ne doit pas annuler ce minuteur.
    const timer = setTimeout(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      setVisible(false);
      onCloseRef.current?.();
    }, Math.max(0, deadlineRef.current - Date.now()));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [courseId]);

  if (!visible || !courseId) return null;

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Taille de police responsive : le mot remplit presque l'écran à l'échelle 1.
  // Formule basée sur la longueur du mot pour éviter tout débordement horizontal.
  const wordLength = word.replace(/\s/g, "").length;
  const fontSizeVw = Math.floor(124 / wordLength);
  const fontSize = `clamp(1.35rem, ${fontSizeVw}vw, 4.75rem)`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
          style={{ background: "rgba(0,0,0,0.88)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* ── Phase 1+2+3 : le mot de célébration ── */}
          <motion.div
            className="relative text-center px-4 w-full flex flex-col items-center justify-center"
            initial={{ scale: 0.2, opacity: 0 }}
            animate={
              prefersReducedMotion
                ? { scale: 1, opacity: 1 }
                : { scale: [0.2, 0.6, 1.0, 0.95, 1.0], opacity: 1 }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0.3 }
                : {
                    duration: 3.0,
                    times: [0, 0.33, 0.72, 0.86, 1],
                    ease: "easeOut",
                  }
            }
          >
            <motion.h1
              className="font-black text-white leading-none select-none"
              style={{
                fontSize,
                maxWidth: "calc(100vw - 24px)",
                textShadow:
                  "0 0 30px rgba(52,199,89,0.9), 0 0 60px rgba(0,122,255,0.6), 0 2px 8px rgba(0,0,0,0.5)",
                wordBreak: "keep-all",
                whiteSpace: "nowrap",
                overflowWrap: "normal",
              }}
            >
              {word}
            </motion.h1>
          </motion.div>

          {/* ── Phase 4 : "✓ +1 COURSE RÉUSSIE" puis fondu ── */}
          <motion.div
            className="absolute bottom-[20%] left-0 right-0 text-center px-4"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 7.0, duration: 0.5 }}
          >
            <p
              className="font-bold text-white"
              style={{ fontSize: "clamp(0.9rem, 4.5vw, 1.3rem)" }}
            >
              ✓ +1 COURSE RÉUSSIE
            </p>
          </motion.div>

          {/* ── Fondu de sortie global (5.7→6.0s) ── */}
          <motion.div
            className="absolute inset-0 bg-black pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1] }}
            transition={{ duration: 0.4, delay: 8.5 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
