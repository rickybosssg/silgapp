import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { refreshEventMusicConfiguration } from '@/lib/eventMusicSettings';

// Presentation-only configuration: one bounded read, never a course mutation.
export default function EventMusicBootstrap() {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void refreshEventMusicConfiguration(base44);
    };
    refresh();
    const interval = setInterval(refresh, 300000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return null;
}
