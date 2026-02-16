import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import './PushNotificationSettings.css';

/** Base64url decode to Uint8Array for VAPID applicationServerKey. Must be 65 bytes (uncompressed P-256). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const normalized = String(base64String).replace(/\s+/g, '').trim();
  if (!normalized) throw new Error('VAPID public key is empty.');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  if (output.length !== 65) {
    throw new Error(
      'VAPID public key from server is invalid (expected 65 bytes, got ' + output.length + '). ' +
      'Ask the admin to set VAPID_PUBLIC_KEY correctly. Generate new keys with: npx web-push generate-vapid-keys',
    );
  }
  return output;
}

type PushVariant = 'full' | 'drawer';

export default function PushNotificationSettings({ variant = 'full' }: { variant?: PushVariant }) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [vapidConfigured, setVapidConfigured] = useState(false);

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(!!ok);
    if (ok && Notification.permission) setPermission(Notification.permission);
    api.notifications
      .getVapidPublicKey()
      .then((r) => setVapidConfigured(!!r?.publicKey))
      .catch(() => setVapidConfigured(false));
  }, []);

  const enable = async () => {
    if (!supported || !vapidConfigured) {
      setMessage('Push notifications are not available or not configured on the server.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setMessage('Permission denied. Enable notifications in your browser settings to get alerts.');
        setLoading(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await api.notifications.getVapidPublicKey();
      const publicKey = keyRes?.publicKey;
      if (!publicKey) {
        setMessage('Server has not configured push (VAPID key missing).');
        setLoading(false);
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await api.notifications.savePushSubscription(sub.toJSON());
      setMessage('Notifications enabled. You’ll get alerts from this app.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to enable notifications.');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await api.notifications.removePushSubscription();
      setPermission('default');
      setMessage('Notifications disabled.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to disable.');
    } finally {
      setLoading(false);
    }
  };

  if (!supported) return null;

  return (
    <PushNotificationSettingsInner
      permission={permission}
      loading={loading}
      message={message}
      vapidConfigured={vapidConfigured}
      onEnable={enable}
      onDisable={disable}
      variant={variant}
    />
  );
}

function PushNotificationSettingsInner({
  permission,
  loading,
  message,
  vapidConfigured,
  onEnable,
  onDisable,
  variant = 'full',
}: {
  permission: NotificationPermission;
  loading: boolean;
  message: string | null;
  vapidConfigured: boolean;
  onEnable: () => void;
  onDisable: () => void;
  variant?: 'full' | 'drawer';
}) {
  const title = variant === 'drawer' ? 'Notifications' : 'Push notifications';
  return (
    <div className={`push-settings push-settings--${variant}`}>
      <h3 className="push-settings-title">{title}</h3>
      {!vapidConfigured && (
        <p className="push-settings-hint">Server has not configured push (VAPID keys). Notifications are unavailable.</p>
      )}
      {vapidConfigured && (
        <>
          <p className="push-settings-desc">
            Get alerts (e.g. renewal reminders, new enquiries) even when the app is closed.
          </p>
          <div className="push-settings-actions">
            {permission === 'granted' ? (
              <button type="button" className="push-settings-btn push-settings-btn-off" onClick={onDisable} disabled={loading}>
                {loading ? '…' : 'Disable notifications'}
              </button>
            ) : (
              <button type="button" className="push-settings-btn push-settings-btn-on" onClick={onEnable} disabled={loading}>
                {loading ? '…' : 'Enable notifications'}
              </button>
            )}
          </div>
        </>
      )}
      {message && <p className={`push-settings-msg ${message.includes('enabled') ? 'push-settings-msg-ok' : ''}`}>{message}</p>}
    </div>
  );
}
