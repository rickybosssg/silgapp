import { useCallback, useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { createDriverAcceptanceAudio } from '@/lib/driverAcceptanceAudio';

// Owned by the dashboard, never by a card that closes immediately on success.
export function useDriverAcceptanceAudio(driverId, activeTab) {
  const controller = useRef(null);
  const currentScope = useRef({ driverId, activeTab });
  currentScope.current = { driverId, activeTab };
  useEffect(() => {
    if (!driverId) return;
    const audio = createDriverAcceptanceAudio();
    controller.current = audio;
    const hide = () => audio.setForeground(document.visibilityState === 'visible');
    const pagehide = () => audio.setForeground(false);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pagehide);
    let removed = false, handle;
    App.addListener('appStateChange', ({ isActive }) => audio.setForeground(isActive))
      .then(listener => { if (removed) void listener.remove(); else handle = listener; })
      .catch(() => { /* Browser visibility remains the fallback lifecycle signal. */ });
    return () => {
      removed = true;
      void handle?.remove();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', pagehide);
      audio.dispose();
      if (controller.current === audio) controller.current = null;
    };
  }, [driverId]);
  useEffect(() => {
    // The automatic Disponibles -> Mes courses transition must keep the clip alive.
    if (activeTab !== 'courses') controller.current?.stop();
  }, [activeTab]);
  return useCallback(event => {
    const scope = currentScope.current;
    if (scope.driverId !== driverId || !['courses', 'disponibles'].includes(scope.activeTab)) return;
    void controller.current?.play(event);
  }, [driverId]);
}
