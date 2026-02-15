import React, { useState, useEffect, useRef } from 'react';
import './PWAInstallPrompt.css';

const DISMISS_STORAGE_KEY = 'gym_pwa_install_dismissed';
const DISMISS_HIDE_DAYS = 7;

/** iOS (iPhone/iPad) does not fire beforeinstallprompt; show manual "Add to Home Screen" instructions. */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Android: beforeinstallprompt may not fire (heuristics); we show fallback instructions if it doesn't. */
function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent) && !/iPhone|iPad|iPod/.test(navigator.userAgent);
}

type PromptVariant = 'native' | 'ios' | 'android';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [promptVariant, setPromptVariant] = useState<PromptVariant>('native');
  const nativePromptFiredRef = useRef(false);

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

    const onBeforeInstall = (e: Event) => {
      const ev = e as BeforeInstallPromptEvent;
      ev.preventDefault();
      nativePromptFiredRef.current = true;
      setDeferredPrompt(ev);
      setPromptVariant('native');
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS: never fires beforeinstallprompt → show instructions after delay
    if (isIOS()) {
      const t = setTimeout(() => {
        setPromptVariant('ios');
        setShowPrompt(true);
      }, 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    // Android: if beforeinstallprompt doesn't fire, show fallback instructions after delay
    if (isAndroid()) {
      const t = setTimeout(() => {
        if (!nativePromptFiredRef.current) {
          setPromptVariant('android');
          setShowPrompt(true);
        }
      }, 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    // Desktop: only show when beforeinstallprompt fires (Chrome/Edge)
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

  const showNativeInstallButton = promptVariant === 'native' && deferredPrompt;

  const title = promptVariant === 'ios' ? 'Add to Home Screen' : 'Install app';

  const description =
    promptVariant === 'ios'
      ? 'Tap the Share button at the bottom (or in the menu), then choose "Add to Home Screen" to install this app.'
      : promptVariant === 'android'
        ? 'Tap the menu (⋮) in your browser, then tap "Add to Home screen" or "Install app" to add this app to your device.'
        : 'Add this app to your home screen for quick access and a better experience.';

  const dismissLabel = promptVariant === 'ios' || promptVariant === 'android' ? 'Got it' : 'Not now';

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
        <h2 id="pwa-install-title" className="pwa-install-title">
          {title}
        </h2>
        <p className="pwa-install-desc">
          {description}
        </p>
        <div className="pwa-install-actions">
          {showNativeInstallButton && (
            <button type="button" className="pwa-install-btn pwa-install-btn-primary" onClick={handleInstall}>
              Install
            </button>
          )}
          <button type="button" className="pwa-install-btn pwa-install-btn-secondary" onClick={handleDismiss}>
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
