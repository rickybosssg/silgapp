import { useEffect, useRef, useState } from "react";

/**
 * usePullToRefresh — déclenche onRefresh quand l'utilisateur tire vers le bas
 * depuis le haut de la page (touch uniquement, compatible Android)
 */
export function usePullToRefresh(onRefresh, { threshold = 70 } = {}) {
  const startYRef = useRef(null);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = document.documentElement;

    const onTouchStart = (e) => {
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e) => {
      if (startYRef.current === null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 10 && window.scrollY === 0) {
        setPulling(true);
      }
    };

    const onTouchEnd = async (e) => {
      if (startYRef.current === null) return;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - startYRef.current;
      startYRef.current = null;
      setPulling(false);
      if (dy >= threshold) {
        setRefreshing(true);
        await onRefresh();
        setRefreshing(false);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh, threshold]);

  return { pulling, refreshing };
}