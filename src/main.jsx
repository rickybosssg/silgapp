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
// Utilise un "retry key" pour forcer React à remonter les enfants et réessayer les lazy imports
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0, retryKey: 0 };
    this.maxRetries = 3;
  }

  static getDerivedStateFromError(error) {
    console.error('[ErrorBoundary] getDerivedStateFromError:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] componentDidCatch:', error);
    console.error('[ErrorBoundary] ComponentStack:', info?.componentStack);
    this.setState({ errorInfo: info });

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
    } catch (e) {}

    // Auto-retry for dynamic import failures — incrémente retryKey pour forcer remount
    const isDynamicImportError = error?.message?.includes('Failed to fetch dynamically imported module');
    if (isDynamicImportError && this.state.retryCount < this.maxRetries) {
      const nextRetry = this.state.retryCount + 1;
      console.warn(`[ErrorBoundary] Auto-retry ${nextRetry}/${this.maxRetries} dans 2s (key: ${this.state.retryKey + 1})...`);
      setTimeout(() => {
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: nextRetry,
          retryKey: this.state.retryKey + 1
        });
      }, 2000);
    }
  }

  handleManualReload = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isRetrying = this.state.error?.message?.includes('Failed to fetch dynamically imported module') && this.state.retryCount < this.maxRetries;

      if (isRetrying) {
        return (
          <div style={{
            position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#0f172a', padding: '2rem', textAlign: 'center', gap: '1rem',
            fontFamily: 'system-ui, sans-serif'
          }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/2c20ad136_SILGAPPLOGO2.jpg" alt="" style={{ width: 40, height: 40, borderRadius: 10 }} />
            </div>
            <p style={{ fontWeight: 800, fontSize: 18, margin: 0, color: '#f8fafc' }}>SILGAPP</p>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
              Connexion en cours... ({this.state.retryCount}/{this.maxRetries})
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: i < this.state.retryCount ? '#22c55e' : '#334155',
                  transition: 'background 0.3s'
                }} />
              ))}
            </div>
          </div>
        );
      }

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
          }}>🚚</div>
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
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
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