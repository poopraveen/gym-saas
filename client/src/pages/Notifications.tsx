import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { api, storage } from '../api/client';
import './Notifications.css';

export default function Notifications() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; subscriberCount?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [notifyOwnerOnFaceFailure, setNotifyOwnerOnFaceFailure] = useState<boolean>(true);
  const [faceAlertEnrollKeySet, setFaceAlertEnrollKeySet] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [showEnrollKeyModal, setShowEnrollKeyModal] = useState(false);
  const [enrollKeyInput, setEnrollKeyInput] = useState('');
  const [enrollKeyError, setEnrollKeyError] = useState<string | null>(null);
  const [newEnrollKeyInput, setNewEnrollKeyInput] = useState('');
  const [setEnrollKeySaving, setSetEnrollKeySaving] = useState(false);

  useEffect(() => {
    api.notifications.getSubscriberCount().then((r) => setSubscriberCount(r.subscriberCount)).catch(() => setSubscriberCount(null));
  }, [result]);

  useEffect(() => {
    api.tenant.getMySettings().then((r) => {
      setNotifyOwnerOnFaceFailure(r.notifyOwnerOnFaceFailure);
      setFaceAlertEnrollKeySet(r.faceAlertEnrollKeySet);
    }).catch(() => {}).finally(() => setSettingsLoading(false));
  }, []);

  const handleFaceFailureToggle = async (checked: boolean) => {
    if (!checked) {
      setSettingsSaving(true);
      try {
        const r = await api.tenant.updateMySettings({ notifyOwnerOnFaceFailure: false });
        setNotifyOwnerOnFaceFailure(r.notifyOwnerOnFaceFailure);
      } catch {
        // revert on error
      } finally {
        setSettingsSaving(false);
      }
      return;
    }
    if (faceAlertEnrollKeySet) {
      setEnrollKeyError(null);
      setEnrollKeyInput('');
      setShowEnrollKeyModal(true);
      return;
    }
    setSettingsSaving(true);
    try {
      const r = await api.tenant.updateMySettings({ notifyOwnerOnFaceFailure: true });
      setNotifyOwnerOnFaceFailure(r.notifyOwnerOnFaceFailure);
      setFaceAlertEnrollKeySet(r.faceAlertEnrollKeySet);
    } catch {
      // revert on error
    } finally {
      setSettingsSaving(false);
    }
  };

  const submitEnrollKey = async () => {
    setEnrollKeyError(null);
    setSettingsSaving(true);
    try {
      const r = await api.tenant.updateMySettings({ notifyOwnerOnFaceFailure: true, enrollKey: enrollKeyInput });
      setNotifyOwnerOnFaceFailure(r.notifyOwnerOnFaceFailure);
      setShowEnrollKeyModal(false);
      setEnrollKeyInput('');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Invalid enrollment key';
      setEnrollKeyError(msg);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSetEnrollKey = async () => {
    setSetEnrollKeySaving(true);
    try {
      const r = await api.tenant.updateMySettings({ newFaceAlertEnrollKey: newEnrollKeyInput });
      setFaceAlertEnrollKeySet(r.faceAlertEnrollKeySet);
      setNewEnrollKeyInput('');
    } catch {
      // keep previous state
    } finally {
      setSetEnrollKeySaving(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    setError(null);
    setResult(null);
    setSending(true);
    try {
      const res = await api.notifications.sendBroadcast({
        title: title.trim(),
        body: body.trim() || undefined,
        url: url.trim() || undefined,
      });
      if (res.ok) {
        setResult({
          sent: res.sent,
          failed: res.failed ?? 0,
          subscriberCount: res.subscriberCount,
        });
        setSubscriberCount(res.subscriberCount ?? null);
        setTitle('');
        setBody('');
        setUrl('');
      } else {
        setError(res.error ?? 'Failed to send.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSending(false);
    }
  };

  const handleNavChange = (id: string) => {
    if (id === 'notifications') return;
    if (id === 'main' || id === 'dashboard' || id === 'add' || id === 'checkin' || id === 'finance') navigate('/');
    else if (id === 'telegram') navigate('/telegram');
    else if (id === 'enquiries') navigate('/enquiries');
    else if (id === 'onboarding') navigate('/onboarding');
    else if (id === 'nutrition-ai') navigate('/nutrition-ai');
    else if (id === 'medical-history') navigate('/medical-history');
    else if (id === 'workout-plan') navigate('/workout-plan');
    else navigate('/');
  };

  if (storage.getRole() === 'MEMBER') {
    navigate('/nutrition-ai');
    return null;
  }

  return (
    <Layout activeNav="notifications" onNavChange={handleNavChange} onLogout={() => { storage.clear(); navigate('/login'); }}>
      <div className="notifications-page">
        <h1 className="page-title">Send notification</h1>
        {!settingsLoading && (
          <div className="notifications-face-alerts">
            <h2 className="notifications-face-alerts-title">Face check-in alerts</h2>
            {faceAlertEnrollKeySet && (
              <p className="notifications-face-alerts-key-hint">Enrollment key is set. You must enter it to enable alerts.</p>
            )}
            <label className="notifications-face-alerts-label">
              <input
                type="checkbox"
                checked={notifyOwnerOnFaceFailure}
                onChange={(e) => handleFaceFailureToggle(e.target.checked)}
                disabled={settingsSaving}
              />
              <span>Notify me when someone fails face recognition</span>
            </label>
            <p className="notifications-face-alerts-hint">
              When someone tries to check in by face and is not recognized, you’ll get a push notification (if you have push enabled in the menu).
            </p>
            <div className="notifications-face-alerts-set-key">
              <label className="notifications-face-alerts-set-key-label">Special key for enrollment (required to turn on alerts)</label>
              <div className="notifications-set-key-row">
                <input
                  type="password"
                  className="notifications-set-key-input"
                  placeholder="Set or change enrollment key"
                  value={newEnrollKeyInput}
                  onChange={(e) => setNewEnrollKeyInput(e.target.value)}
                  aria-label="Enrollment key"
                />
                <button
                  type="button"
                  className="notifications-btn-primary"
                  onClick={handleSetEnrollKey}
                  disabled={setEnrollKeySaving || !newEnrollKeyInput.trim()}
                >
                  {setEnrollKeySaving ? 'Saving…' : 'Set key'}
                </button>
              </div>
            </div>
          </div>
        )}
        {showEnrollKeyModal && (
          <div className="notifications-enroll-key-overlay" role="dialog" aria-labelledby="notifications-enroll-key-title" aria-modal="true">
            <div className="notifications-enroll-key-modal">
              <h2 id="notifications-enroll-key-title" className="notifications-face-alerts-title">Enter enrollment key</h2>
              <p className="notifications-face-alerts-hint">Enter your special enrollment key to enable face check-in alerts.</p>
              <input
                type="password"
                className="notifications-set-key-input"
                placeholder="Enrollment key"
                value={enrollKeyInput}
                onChange={(e) => { setEnrollKeyInput(e.target.value); setEnrollKeyError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && submitEnrollKey()}
                aria-label="Enrollment key"
                autoFocus
              />
              {enrollKeyError && <p className="notifications-enroll-key-error">{enrollKeyError}</p>}
              <div className="notifications-enroll-key-actions">
                <button type="button" className="notifications-btn-primary" onClick={submitEnrollKey} disabled={settingsSaving}>
                  {settingsSaving ? 'Checking…' : 'Submit'}
                </button>
                <button type="button" className="notifications-btn-cancel" onClick={() => { setShowEnrollKeyModal(false); setEnrollKeyError(null); setEnrollKeyInput(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        <p className="notifications-intro">
          Send a push message to everyone in your gym who has enabled notifications (e.g. holiday, schedule change, announcement).
        </p>
        {subscriberCount !== null && (
          <p className="notifications-subscriber-count">
            <strong>{subscriberCount}</strong> device{subscriberCount !== 1 ? 's' : ''} have notifications enabled.
          </p>
        )}
        {subscriberCount === 0 && (
          <div className="notifications-zero-hint" role="status">
            <p><strong>No devices have enabled push yet.</strong></p>
            <p>To receive notifications on a phone:</p>
            <ol>
              <li>Open this app on the phone (same URL), log in, and open the menu (☰).</li>
              <li>Turn on <strong>Push notifications</strong> in the menu.</li>
              <li>Members (including Nutrition AI users) can do the same: log in on their phone and enable in the app menu.</li>
            </ol>
            <p>After devices enable push, send from here; the message will go to all of them.</p>
          </div>
        )}
        <form onSubmit={handleSend} className="notifications-form">
          <label className="notifications-label">
            Title <span className="required">*</span>
          </label>
          <input
            type="text"
            className="notifications-input"
            placeholder="e.g. Holiday notice"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={sending}
          />
          <label className="notifications-label">Message</label>
          <textarea
            className="notifications-textarea"
            placeholder="e.g. Gym will be closed on Dec 25. Happy holidays!"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            disabled={sending}
          />
          <label className="notifications-label">Link (optional)</label>
          <input
            type="text"
            className="notifications-input"
            placeholder="e.g. / or /finance"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={sending}
          />
          {error && <p className="notifications-error">{error}</p>}
          {result && (
            <p className="notifications-result">
              Sent to <strong>{result.sent}</strong> device(s).
              {result.subscriberCount != null && result.sent === 0 && result.subscriberCount === 0 && ' No devices have enabled push yet — see note above.'}
              {result.failed > 0 && ` ${result.failed} failed.`}
            </p>
          )}
          <button type="submit" className="notifications-submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send to subscribers'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
