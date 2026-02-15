import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import './PushNotificationSettings.css';

/** Base64url decode to Uint8Array for VAPID applicationServerKey */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

export default function PushNotificationSettings() {
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
    <div className="push-settings">
      <h3 className="push-settings-title">Push notifications</h3>
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
              <button type="button" className="push-settings-btn push-settings-btn-off" onClick={disable} disabled={loading}>
                {loading ? '…' : 'Disable notifications'}
              </button>
            ) : (
              <button type="button" className="push-settings-btn push-settings-btn-on" onClick={enable} disabled={loading}>
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
