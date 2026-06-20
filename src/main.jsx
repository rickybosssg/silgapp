import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { installNativeGeolocationShim } from '@/lib/nativeAndroid'
import '@/index.css'

installNativeGeolocationShim()

// Note: la capture du access_token depuis l'URL est faite dans index.html
// (script inline synchrone, exécuté avant tout module ES)

const notifyBase44Mounted = () => {
  if (window.self === window.top) return;
  window.parent?.postMessage({ type: 'sandbox:onMounted' }, '*');
};

// ErrorBoundary global — évite l'écran blanc si une erreur JS non gérée survient
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    console.error('[ErrorBoundary] getDerivedStateFromError:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] componentDidCatch:', error);
    console.error('[ErrorBoundary] ComponentStack:', info?.componentStack);
    console.error('[ErrorBoundary] Stack trace:', error.stack);
    this.setState({ errorInfo: info });

    // Log complet pour diagnostic
    try {
      const errorData = {
        message: error?.message,
        stack: error?.stack,
        componentStack: info?.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      };
      console.error('[ErrorBoundary] DIAGNOSTIC COMPLET:', JSON.stringify(errorData, null, 2));
    } catch (e) {
      console.error('[ErrorBoundary] Erreur lors du log:', e);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#f0f0f0', padding: '2rem', textAlign: 'center', gap: '1rem',
          fontFamily: 'monospace', fontSize: '12px'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32
          }}></div>
          <div>
            <p style={{ fontWeight: 'bold', fontSize: 18, margin: 0, color: '#dc2626' }}>SILGAPP - ERREUR CRITIQUE</p>
            <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
              Une erreur s'est produite au démarrage.
            </p>
          </div>
          <div style={{
            background: '#fff', padding: '1rem', borderRadius: 8,
            maxWidth: '500px', textAlign: 'left', border: '1px solid #fee2e2',
            maxHeight: '200px', overflow: 'auto'
          }}>
            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Erreur :</p>
            <p style={{ color: '#dc2626', marginBottom: '1rem' }}>{this.state.error?.message || 'Erreur inconnue'}</p>
            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Stack :</p>
            <pre style={{ fontSize: '10px', color: '#666', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error?.stack || 'Stack non disponible'}
            </pre>
          </div>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{
              padding: '12px 28px', borderRadius: 10, background: '#dc2626',
              color: 'white', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer'
            }}
          >
            Recharger (Clear Storage)
          </button>
          <p style={{ fontSize: 10, color: '#999', maxWidth: 400 }}>
            Astuce : Si l'erreur persiste, essayez de vider le cache de l'application.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
rootElement?.setAttribute('data-dynamic-content', 'silgapp2-root');

ReactDOM.createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

window.setTimeout(notifyBase44Mounted, 250);
window.setTimeout(notifyBase44Mounted, 1500);
