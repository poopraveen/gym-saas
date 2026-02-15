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

  useEffect(() => {
    api.notifications.getSubscriberCount().then((r) => setSubscriberCount(r.subscriberCount)).catch(() => setSubscriberCount(null));
  }, [result]);

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
