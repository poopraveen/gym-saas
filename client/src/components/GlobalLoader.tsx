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

  return (
    <div className="global-loader-overlay" aria-busy="true" aria-live="polite" role="status">
      <div className="global-loader-spinner" />
      <span className="global-loader-label">Loading…</span>
    </div>
  );
}
