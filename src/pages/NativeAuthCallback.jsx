import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildNativeAuthCallbackUrl } from '@/lib/authRedirect';

const isValidToken = (token) => token && token !== 'null' && token !== 'undefined';
const TOKEN_STORAGE_KEYS = ['base44_access_token', 'token', 'base44_token'];

export default function NativeAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('access_token')
      || url.searchParams.get('token')
      || TOKEN_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(isValidToken);

    if (isValidToken(token)) {
      TOKEN_STORAGE_KEYS.forEach((key) => localStorage.setItem(key, token));

      if (/Android/i.test(window.navigator.userAgent)) {
        window.location.replace(buildNativeAuthCallbackUrl(token));
        return;
      }
    }

    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Retour vers SILGAPP...</p>
      </div>
    </div>
  );
}
