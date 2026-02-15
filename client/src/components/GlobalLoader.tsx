import React, { useState, useEffect } from 'react';
import { setLoaderCallbacks } from '../api/client';
import './GlobalLoader.css';

export default function GlobalLoader() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setLoaderCallbacks(
      () => setCount((c) => c + 1),
      () => setCount((c) => Math.max(0, c - 1)),
    );
    return () => setLoaderCallbacks(() => {}, () => {});
  }, []);

  if (count === 0) return null;
  // Hide overlay during pitch screenshot capture so PDF images are clean
  if (typeof window !== 'undefined' && sessionStorage.getItem('hide_loader_for_screenshot') === '1') return null;

  return (
    <div className="global-loader-overlay" aria-busy="true" aria-live="polite" role="status">
      <div className="global-loader-icon">
        <svg viewBox="0 0 48 24" className="global-loader-dumbbell" aria-hidden>
          <rect x="2" y="8" width="8" height="8" rx="2" fill="currentColor" />
          <rect x="38" y="8" width="8" height="8" rx="2" fill="currentColor" />
          <rect x="10" y="10" width="28" height="4" rx="1" fill="currentColor" />
        </svg>
      </div>
      <span className="global-loader-label">Loading…</span>
    </div>
  );
}
