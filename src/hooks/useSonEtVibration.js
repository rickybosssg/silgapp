/**
 * Hook pour son + vibration continue — identique au système des livreurs
 * Utilisé pour les notifications importantes (nouvelle course, colis livré, etc.)
 */

import { useEffect, useRef } from "react";

// Vibration continue — pattern: 500ms on, 150ms off, répété
function useVibration(active) {
  const intervalRef = useRef(null);
  useEffect(() => {
    if (active && navigator.vibrate) {
      navigator.vibrate([500, 150, 500, 150, 500]);
      intervalRef.current = setInterval(() => {
        navigator.vibrate([500, 150, 500, 150, 500]);
      }, 3000);
    }
    return () => {
      navigator.vibrate?.(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);
}

// Contexte audio partagé — évite de recréer un contexte à chaque fois
let sharedAudioCtx = null;
function getAudioCtx() {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

// Sonnerie type "notification urgente" — 4 bips répétés
function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    const notes = [880, 1100, 880, 1100];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.12);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.13);
    });
  } catch (_) {}
}

/**
 * Hook principal — active son + vibration pour les notifications importantes
 * @param {boolean} active — si true, déclenche son + vibration
 * @param {boolean} repeatSound — si true, répète le son toutes les 5s (comme les livreurs)
 */
export function useSonEtVibration(active, repeatSound = true) {
  useVibration(active);

  useEffect(() => {
    if (!active) return;
    
    // Son immédiat
    playNotificationSound();
    
    // Répétition toutes les 5s si repeatSound=true
    if (repeatSound) {
      const t = setInterval(playNotificationSound, 5000);
      return () => clearInterval(t);
    }
  }, [active, repeatSound]);
}

// Export pour usage direct sans hook
export { playNotificationSound, useVibration };