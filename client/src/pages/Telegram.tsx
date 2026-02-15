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

  const handleRegisterWebhook = () => {
    setWebhookStatus(null);
    setWebhookLoading(true);
    api.notifications
      .registerWebhook()
      .then((r) => {
        if (r.ok) {
          setWebhookStatus({ ok: true, message: `Webhook registered. URL: ${r.webhookUrl ?? '(same)'}. Send "Hi" to your bot again.` });
        } else {
          setWebhookStatus({ ok: false, message: r.error ?? 'Failed to register webhook.' });
        }
      })
      .catch((e) => setWebhookStatus({ ok: false, message: e?.message ?? 'Request failed.' }))
      .finally(() => setWebhookLoading(false));
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
        <h1 className="page-title">Telegram</h1>
        <p className="telegram-intro">
          Share the Telegram group link or QR code with members who want to enroll for absence alerts. See who has messaged the bot below.
        </p>

        {loading ? (
          <p className="telegram-loading">Loading…</p>
        ) : (
          <>
            {config?.groupInviteLink && (
              <section className="telegram-card telegram-qr-card">
                <h2 className="telegram-card-title">Present to members who want to enroll for absence alerts</h2>
                <p className="telegram-hint">Share this QR code or link with members so they can join the Telegram group. Then they message the bot with their registered phone number to get absence reminders (3+ days no visit).</p>
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
              <section className="telegram-card telegram-qr-card telegram-setup-required">
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
              <section className="telegram-card">
                <p className="telegram-hint">No Telegram bot configured for this gym. Super Admin can set <strong>Telegram bot token</strong> and <strong>group invite link</strong> when creating or editing the tenant.</p>
              </section>
            )}

            <section className="telegram-card">
              <h2 className="telegram-card-title">Who tried to set up (Telegram opt-in attempts)</h2>
              <p className="telegram-hint">When someone sends &quot;Hi&quot; or their phone number to your gym&apos;s bot (e.g. in private chat or in the group), they appear here. Confirm who has registered for absence alerts.</p>
              {config?.hasBot && (
                <div className="telegram-webhook-actions">
                  <p className="telegram-webhook-hint">
                    If you message the bot but nothing appears here, the server may not have the webhook set. <strong>Re-register webhook</strong> only works when the API has <strong>PUBLIC_API_URL</strong> set (e.g. on Render). From localhost, use the deployed app or set <code>PUBLIC_API_URL</code> in .env to your Render URL.
                  </p>
                  {webhookInfo && (
                    <div className="telegram-webhook-url-note">
                      <p>Webhook URL must include your tenant ID (not just <code>/telegram-webhook</code>).</p>
                      {webhookInfo.webhookUrl ? (
                        <p>Correct URL for this gym: <code className="telegram-webhook-code">{webhookInfo.webhookUrl}</code></p>
                      ) : (
                        <p>Path: <code className="telegram-webhook-code">{webhookInfo.webhookPath}</code> — set <strong>PUBLIC_API_URL</strong> on the server to see full URL.</p>
                      )}
                      <p className="telegram-webhook-manual">Manual set: <code>https://api.telegram.org/bot&lt;BOT_TOKEN&gt;/setWebhook?url=&lt;WEBHOOK_URL_ABOVE&gt;</code></p>
                    </div>
                  )}
                  <div className="telegram-webhook-buttons">
                    <button type="button" className="telegram-btn telegram-btn-register" onClick={handleRegisterWebhook} disabled={webhookLoading}>
                      {webhookLoading ? 'Registering…' : 'Re-register webhook'}
                    </button>
                    <button type="button" className="telegram-btn telegram-btn-refresh" onClick={fetchData} disabled={loading}>
                      Refresh attempts
                    </button>
                  </div>
                  {webhookStatus && (
                    <p className={`telegram-webhook-result ${webhookStatus.ok ? 'telegram-webhook-ok' : 'telegram-webhook-err'}`}>
                      {webhookStatus.message}
                    </p>
                  )}
                </div>
              )}
              {attempts.length === 0 ? (
                <p className="telegram-empty">No attempts yet. Message your gym&apos;s bot (e.g. &quot;Hi&quot; or /start), then send your phone number. If it still doesn&apos;t appear, use &quot;Re-register webhook&quot; above and ensure PUBLIC_API_URL is set on the server.</p>
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
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((a) => (
                        <tr key={a._id}>
                          <td className="telegram-td-chat">{a.telegramChatId}</td>
                          <td>{a.phoneAttempted || '—'}</td>
                          <td className="telegram-td-msg">{a.messageText || '—'}</td>
                          <td>
                            <span className={`telegram-status telegram-status-${a.status}`}>{a.status}</span>
                          </td>
                          <td className="telegram-td-date">{formatDate(a.createdAt)}</td>
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
