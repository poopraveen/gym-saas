import React, { useState, useEffect } from 'react';
import { setConnectionErrorCallback } from '../api/client';
import './ApiConnectionBanner.css';

/**
 * Shows a dismissible banner when the backend is unreachable (e.g. ERR_CONNECTION_REFUSED).
 * Non-blocking; better UX than alert().
 */
export default function ApiConnectionBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setConnectionErrorCallback((msg) => setMessage(msg));
    return () => setConnectionErrorCallback(null);
  }, []);

  if (!message) return null;

  return (
    <div className="api-connection-banner" role="alert">
      <span className="api-connection-banner-text">{message}</span>
      <button
        type="button"
        className="api-connection-banner-dismiss"
        onClick={() => setMessage(null)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
