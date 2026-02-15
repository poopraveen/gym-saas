import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Layout from '../components/Layout';
import { api, storage } from '../api/client';
import './Telegram.css';

type Attempt = {
  _id: string;
  telegramChatId: string;
  phoneAttempted?: string;
  messageText?: string;
  memberId?: string;
  status: string;
  createdAt: string;
};

export default function Telegram() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<{ groupInviteLink?: string; hasBot: boolean } | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [webhookInfo, setWebhookInfo] = useState<{ tenantId: string; webhookPath: string; webhookUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<string>('telegram');
  const [webhookStatus, setWebhookStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.notifications.getTelegramConfig(),
      api.notifications.listTelegramAttempts({ limit: 100 }),
      api.notifications.getWebhookInfo().catch(() => null),
    ])
      .then(([c, list, info]) => {
        setConfig(c);
        setAttempts(Array.isArray(list) ? list : []);
        setWebhookInfo(info ?? null);
      })
      .catch(() => {
        setConfig(null);
        setAttempts([]);
        setWebhookInfo(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (storage.getRole() === 'MEMBER') {
      navigate('/nutrition-ai');
      return;
    }
    fetchData();
  }, [navigate]);

  const handleRegisterWebhook = (optionalUrl?: string) => {
    setWebhookStatus(null);
    setWebhookLoading(true);
    const urlToSend = optionalUrl?.trim() || undefined;
    api.notifications
      .registerWebhook(urlToSend)
      .then((r) => {
        if (r.ok) {
          setWebhookStatus({
            ok: true,
            message: `Webhook registered. Next: open your bot in a private chat (tap the bot → Start), send "Hi" or /start, then click Refresh attempts. In groups only /start works.`,
          });
        } else {
          setWebhookStatus({ ok: false, message: r.error ?? 'Failed to register webhook.' });
        }
      })
      .catch((e) => setWebhookStatus({ ok: false, message: e?.message ?? 'Request failed.' }))
      .finally(() => setWebhookLoading(false));
  };

  const handleRegisterWithTunnelUrl = () => {
    if (!webhookInfo || !tunnelUrl.trim()) return;
    let base = tunnelUrl.trim().replace(/\/$/, '');
    if (base.endsWith('.ngrok-free.d')) {
      base = base.replace(/\.ngrok-free\.d$/, '.ngrok-free.dev');
      setTunnelUrl(base);
    }
    const fullUrl = base.includes('/api/notifications/telegram-webhook/')
      ? base
      : `${base}${webhookInfo.webhookPath}`;
    if (!fullUrl.startsWith('https://')) {
      setWebhookStatus({ ok: false, message: 'URL must start with https://' });
      return;
    }
    handleRegisterWebhook(fullUrl);
  };

  const handleNavChange = (id: string) => {
    setActiveNav(id);
    if (id === 'dashboard') navigate('/');
    else if (id === 'enquiries') navigate('/enquiries');
    else if (id === 'onboarding') navigate('/onboarding');
    else if (id === 'nutrition-ai') navigate('/nutrition-ai');
    else if (id === 'main') navigate('/');
    else if (id === 'add' || id === 'checkin' || id === 'finance') navigate('/');
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  const handleDeleteAttempt = (id: string) => {
    api.notifications
      .deleteTelegramAttempt(id)
      .then((r) => {
        if (r.ok) setDeletingId(id);
        else setWebhookStatus({ ok: false, message: r.error ?? 'Delete failed' });
      })
      .catch((e) => setWebhookStatus({ ok: false, message: e?.message ?? 'Delete failed' }));
  };

  const handleRowTransitionEnd = (id: string) => {
    if (deletingId === id) {
      setAttempts((prev) => prev.filter((a) => a._id !== id));
      setDeletingId(null);
    }
  };

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return s;
    }
  };

  const copyGroupLink = () => {
    if (!config?.groupInviteLink) return;
    navigator.clipboard.writeText(config.groupInviteLink).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  const [copyFeedback, setCopyFeedback] = useState(false);

  return (
    <Layout activeNav={activeNav as any} onNavChange={handleNavChange} onLogout={handleLogout}>
      <div className="telegram-page">
        <h1 className="page-title telegram-page-title">Telegram</h1>
        <p className="telegram-intro">
          Invite members to your Telegram group and let them message the bot to sign up for absence alerts. Share the QR or link below, then see who&apos;s signed up.
        </p>

        {loading ? (
          <div className="telegram-loading-wrap" aria-hidden>
            <div className="telegram-loading-icon">
              <svg viewBox="0 0 48 24" className="telegram-gym-icon" aria-hidden>
                <rect x="2" y="8" width="8" height="8" rx="2" fill="currentColor" />
                <rect x="38" y="8" width="8" height="8" rx="2" fill="currentColor" />
                <rect x="10" y="10" width="28" height="4" rx="1" fill="currentColor" />
              </svg>
            </div>
            <p className="telegram-loading-text">Loading Telegram setup…</p>
          </div>
        ) : (
          <>
            {config?.groupInviteLink && (
              <section className="telegram-card telegram-qr-card telegram-card-enter">
                <h2 className="telegram-card-title">Present to members who want to enroll for absence alerts</h2>
                <p className="telegram-hint">Share this QR code or link with members so they can join the Telegram group. They message the bot with their <strong>registered phone number</strong> to enroll. After that, they can send <strong>attendance</strong> or <strong>present</strong> anytime to mark their visit for the day (shows in the Attendance tab with date & time). They also get absence reminders if they don’t visit for 3+ days.</p>
                <div className="telegram-qr-row">
                  <div className="telegram-qr-wrap">
                    <QRCodeSVG
                      value={config.groupInviteLink}
                      size={200}
                      level="M"
                      includeMargin
                    />
                  </div>
                  <div className="telegram-link-block">
                    <label className="telegram-link-label">Group link (copy or open)</label>
                    <div className="telegram-link-row">
                      <input
                        type="text"
                        readOnly
                        value={config.groupInviteLink}
                        className="telegram-link-input"
                      />
                      <button type="button" className="telegram-copy-btn" onClick={copyGroupLink}>
                        {copyFeedback ? 'Copied!' : 'Copy link'}
                      </button>
                    </div>
                    <a href={config.groupInviteLink} target="_blank" rel="noopener noreferrer" className="telegram-link">
                      Open group link
                    </a>
                  </div>
                </div>
              </section>
            )}

            {config && !config.groupInviteLink && config.hasBot && (
              <section className="telegram-card telegram-qr-card telegram-setup-required telegram-card-enter">
                <h2 className="telegram-card-title">QR code for group link – setup required</h2>
                <p className="telegram-hint">Your Telegram bot is set up, but the <strong>group invite link</strong> is not saved yet. Without it, the QR code cannot be shown here.</p>
                <div className="telegram-setup-steps">
                  <p className="telegram-setup-title">To show the QR code here:</p>
                  <ol>
                    <li>Log in as <strong>Super Admin</strong> and open <strong>Platform Admin</strong>.</li>
                    <li>Click your gym (tenant) in the table to open details.</li>
                    <li>In the <strong>Telegram</strong> section, fill <strong>Group Invite Link (for QR)</strong> with the invite link from your Telegram group.</li>
                    <li>Click <strong>Save Telegram</strong>.</li>
                  </ol>
                  <p className="telegram-hint">To get the link in Telegram: open your group → tap the group name → <strong>Invite to Group via Link</strong> → Copy link (e.g. https://t.me/joinchat/...).</p>
                </div>
              </section>
            )}

            {config && !config.hasBot && (
              <section className="telegram-card telegram-card-enter">
                <p className="telegram-hint">No Telegram bot configured for this gym. Super Admin can set <strong>Telegram bot token</strong> and <strong>group invite link</strong> when creating or editing the tenant.</p>
              </section>
            )}

            <section className="telegram-card telegram-card-attempts telegram-card-enter">
              <h2 className="telegram-card-title">Absence alert sign-ups &amp; attendance</h2>
              <p className="telegram-hint">When members message your gym&apos;s bot with their phone number (in the group or in private chat), they show up here. Once enrolled, they can send <strong>attendance</strong> or <strong>present</strong> to mark their visit for the day—it appears in the <strong>Attendance</strong> tab with date and time. You can see who has registered for 3/7/14‑day absence reminders.</p>
              {config?.hasBot && (
                <div className="telegram-tip-box">
                  <span className="telegram-tip-icon" aria-hidden>💬</span>
                  <span>In groups, ask members to send <strong>/start</strong> to the bot. In private chat they can send &quot;Hi&quot; or their phone number.</span>
                </div>
              )}
              {config?.hasBot && (
                <div className="telegram-actions-row">
                  <div className="telegram-actions-buttons">
                    <button type="button" className="telegram-btn telegram-btn-refresh" onClick={fetchData} disabled={loading}>
                      Refresh list
                    </button>
                    <button type="button" className="telegram-btn telegram-btn-register" onClick={() => handleRegisterWebhook()} disabled={webhookLoading}>
                      {webhookLoading ? 'Registering…' : 'Re-register webhook'}
                    </button>
                  </div>
                  <p className="telegram-actions-hint">Messages not showing? Try <strong>Re-register webhook</strong>.</p>
                  {webhookInfo && !webhookInfo.webhookUrl && (
                    <details className="telegram-dev-details">
                      <summary>Local testing (developer)</summary>
                      <div className="telegram-paste-url-row">
                        <input
                          type="url"
                          placeholder="https://xxxx.ngrok-free.dev"
                          value={tunnelUrl}
                          onChange={(e) => setTunnelUrl(e.target.value)}
                          className="telegram-paste-url-input"
                        />
                        <button
                          type="button"
                          className="telegram-btn telegram-btn-register"
                          onClick={handleRegisterWithTunnelUrl}
                          disabled={webhookLoading || !tunnelUrl.trim()}
                        >
                          {webhookLoading ? 'Registering…' : 'Register with this URL'}
                        </button>
                      </div>
                    </details>
                  )}
                  {webhookStatus && (
                    <p className={`telegram-webhook-result ${webhookStatus.ok ? 'telegram-webhook-ok' : 'telegram-webhook-err'}`}>
                      {webhookStatus.message}
                    </p>
                  )}
                </div>
              )}
              {attempts.length === 0 ? (
                <div className="telegram-empty-state">
                  <span className="telegram-empty-icon" aria-hidden>📋</span>
                  <p className="telegram-empty">No sign-ups yet. When members message your bot, they&apos;ll appear here. Click <strong>Refresh list</strong> to check.</p>
                </div>
              ) : (
                <div className="telegram-table-wrap">
                  <table className="telegram-table">
                    <thead>
                      <tr>
                        <th>Telegram Chat ID</th>
                        <th>Phone attempted</th>
                        <th>Message</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th className="telegram-th-action">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((a) => (
                        <tr
                          key={a._id}
                          className={deletingId === a._id ? 'telegram-row-deleting' : ''}
                          onTransitionEnd={() => handleRowTransitionEnd(a._id)}
                        >
                          <td className="telegram-td-chat">{a.telegramChatId}</td>
                          <td>{a.phoneAttempted || '—'}</td>
                          <td className="telegram-td-msg">{a.messageText || '—'}</td>
                          <td>
                            <span className={`telegram-status telegram-status-${a.status}`}>{a.status}</span>
                          </td>
                          <td className="telegram-td-date">{formatDate(a.createdAt)}</td>
                          <td className="telegram-td-action">
                            <button
                              type="button"
                              className="telegram-btn-delete"
                              onClick={() => handleDeleteAttempt(a._id)}
                              disabled={deletingId !== null}
                              title="Delete attempt"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
