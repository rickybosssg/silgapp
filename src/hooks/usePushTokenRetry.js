import { useEffect, useRef } from "react";
import { registerPushToken } from "@/lib/notifications";

/**
 * Relance l'enregistrement du token push quand l'app revient au premier plan.
 * Critique pour iOS : l'événement `registration` Capacitor peut échouer au
 * premier essai (permission pas encore accordée, Firebase pas encore prêt,
 * cold start). Sans retry, l'utilisateur n'a jamais de token enregistré.
 *
 * @param {string|null} livreurId
 * @param {object|null} currentUser - { email, user_type, client_id, livreur_id }
 */
export function usePushTokenRetry(livreurId = null, currentUser = null) {
  const lastAttemptRef = useRef(0);
  const userRef = useRef(currentUser);

  useEffect(() => {
    userRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    const RETRY_COOLDOWN_MS = 60_000; // 1 minute entre les tentatives

    const attempt = () => {
      const now = Date.now();
      if (now - lastAttemptRef.current < RETRY_COOLDOWN_MS) return;
      lastAttemptRef.current = now;

      registerPushToken(livreurId, userRef.current).catch(() => null);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        attempt();
      }
    };

    // Réessayer quand l'app revient au premier plan
    document.addEventListener("visibilitychange", handleVisibility);

    // Pour les apps natives (Capacitor) — événement resume
    window.addEventListener("nativeAppResume", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("nativeAppResume", handleVisibility);
    };
  }, [livreurId]);
}