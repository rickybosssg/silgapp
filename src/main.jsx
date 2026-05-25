import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

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
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#f9f9f9', padding: '2rem', textAlign: 'center', gap: '1rem'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32
          }}>🚚</div>
          <div>
            <p style={{ fontWeight: 'bold', fontSize: 18, margin: 0 }}>SILGAPP</p>
            <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
              Une erreur s'est produite au démarrage.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 28px', borderRadius: 10, background: '#e53e3e',
              color: 'white', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer'
            }}
          >
            Recharger l'application
          </button>
          <p style={{ fontSize: 11, color: '#999', maxWidth: 300 }}>
            {this.state.error?.message || 'Erreur inconnue'}
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