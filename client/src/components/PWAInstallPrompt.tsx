import React, { useState, useEffect } from 'react';
import './PWAInstallPrompt.css';

const DISMISS_STORAGE_KEY = 'gym_pwa_install_dismissed';
const DISMISS_HIDE_DAYS = 7;

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const alreadyInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (alreadyInstalled) {
      setIsInstalled(true);
      return;
    }

    const dismissedAt = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - Number(dismissedAt);
      if (elapsed < DISMISS_HIDE_DAYS * 24 * 60 * 60 * 1000) return;
    }

    const onBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    setShowPrompt(false);
  };

  if (!showPrompt || isInstalled) return null;

  return (
    <div className="pwa-install-overlay" role="dialog" aria-labelledby="pwa-install-title" aria-modal="true">
      <div className="pwa-install-card">
        <div className="pwa-install-icon">
          <svg viewBox="0 0 48 24" className="pwa-install-dumbbell" aria-hidden>
            <rect x="2" y="8" width="8" height="8" rx="2" fill="currentColor" />
            <rect x="38" y="8" width="8" height="8" rx="2" fill="currentColor" />
            <rect x="10" y="10" width="28" height="4" rx="1" fill="currentColor" />
          </svg>
        </div>
        <h2 id="pwa-install-title" className="pwa-install-title">Install app</h2>
        <p className="pwa-install-desc">Add this app to your home screen for quick access and a better experience.</p>
        <div className="pwa-install-actions">
          <button type="button" className="pwa-install-btn pwa-install-btn-primary" onClick={handleInstall}>
            Install
          </button>
          <button type="button" className="pwa-install-btn pwa-install-btn-secondary" onClick={handleDismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
