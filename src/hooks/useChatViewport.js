import { useEffect, useState } from 'react';

// The IME changes the visual viewport, not necessarily 100dvh in Android WebView.
export default function useChatViewport() {
  const measure = () => ({ height: window.visualViewport?.height || window.innerHeight,
    top: window.visualViewport?.offsetTop || 0 });
  const [viewport, setViewport] = useState(measure);
  useEffect(() => {
    const update = () => setViewport(measure());
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return { height: viewport.height, top: viewport.top, bottom: 'auto' };
}
