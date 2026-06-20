import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const globalErrors = [];
let errorListeners = [];

// Global error handler
window.addEventListener('error', (event) => {
  const error = {
    type: 'error',
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack,
    timestamp: new Date().toISOString(),
  };
  console.error('[GlobalError] Caught:', error);
  globalErrors.push(error);
  errorListeners.forEach(listener => listener(globalErrors));
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  const error = {
    type: 'unhandledrejection',
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack,
    timestamp: new Date().toISOString(),
  };
  console.error('[GlobalError] Unhandled rejection:', error);
  globalErrors.push(error);
  errorListeners.forEach(listener => listener(globalErrors));
});

export const useGlobalErrors = () => {
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const listener = (newErrors) => {
      setErrors([...newErrors]);
    };
    errorListeners.push(listener);
    setErrors([...globalErrors]);

    return () => {
      errorListeners = errorListeners.filter(l => l !== listener);
    };
  }, []);

  const clearErrors = () => {
    globalErrors.length = 0;
    setErrors([]);
  };

  return { errors, clearErrors };
};

export const GlobalErrorDisplay = () => {
  const { errors, clearErrors } = useGlobalErrors();

  if (errors.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-900/95 text-white p-4 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h3 className="font-bold text-sm">ERREURS CAPTURÉES ({errors.length})</h3>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={clearErrors}
          className="text-white hover:bg-red-800"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-2 text-xs font-mono">
        {errors.map((error, idx) => (
          <div key={idx} className="bg-red-950/50 rounded p-2 border border-red-700">
            <div className="text-red-300 font-bold">
              [{new Date(error.timestamp).toLocaleTimeString()}] {error.type}
            </div>
            <div className="text-white mt-1">{error.message}</div>
            {error.filename && (
              <div className="text-red-400 mt-1">
                {error.filename}:{error.lineno}:{error.colno}
              </div>
            )}
            {error.stack && (
              <details className="mt-1">
                <summary className="text-red-500 cursor-pointer">Stack trace</summary>
                <pre className="text-red-400 mt-1 whitespace-pre-wrap break-all">{error.stack}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};