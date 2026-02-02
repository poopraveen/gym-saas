import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, storage } from '../api/client';
import './PlatformAdmin.css';

type Tenant = { _id: string; name: string; slug?: string; subdomain?: string; isActive?: boolean };

type TenantDetails = {
  _id: string;
  name: string;
  slug?: string;
  subdomain?: string;
  customDomain?: string;
  isActive?: boolean;
  defaultTheme?: string;
  branding?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  adminUser?: { email: string; name?: string; role: string } | null;
};

export default function PlatformAdmin() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    subdomain: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [resetModal, setResetModal] = useState<{ tenantId: string; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [detailModal, setDetailModal] = useState<TenantDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (storage.getRole() !== 'SUPER_ADMIN') {
      navigate('/');
      return;
    }
    api.platform.listTenants()
      .then((r) => setTenants(r as Tenant[]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.platform.createTenant({
        name: createForm.name,
        slug: createForm.slug || undefined,
        subdomain: createForm.subdomain || undefined,
        adminEmail: createForm.adminEmail,
        adminPassword: createForm.adminPassword,
      });
      setCreateOpen(false);
      setCreatedCredentials({ email: createForm.adminEmail, password: createForm.adminPassword });
      setCreateForm({ name: '', slug: '', subdomain: '', adminEmail: '', adminPassword: '' });
      const list = await api.platform.listTenants();
      setTenants(list as Tenant[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleResetAdmin = async () => {
    if (!resetModal) return;
    setError('');
    try {
      await api.platform.resetTenantAdmin(resetModal.tenantId, resetModal.email, resetPassword);
      setResetModal(null);
      setResetPassword('');
      if (detailModal && detailModal._id === resetModal.tenantId) setDetailModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleTenantRowClick = async (tenantId: string) => {
    setDetailLoading(true);
    setDetailModal(null);
    try {
      const details = await api.platform.getTenant(tenantId) as TenantDetails;
      setDetailModal(details);
    } catch {
      setError('Failed to load tenant details');
    } finally {
      setDetailLoading(false);
    }
  };

  const openResetFromDetail = () => {
    if (!detailModal?.adminUser) return;
    setResetModal({
      tenantId: detailModal._id,
      email: detailModal.adminUser.email,
    });
    setDetailModal(null);
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  if (loading) return <div className="platform-loading">Loading...</div>;

  return (
    <div className="platform-admin">
      <header className="platform-header">
        <h1>Platform Admin</h1>
        <div className="platform-actions">
          <button onClick={() => navigate('/')}>Go to Dashboard</button>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {error && <div className="platform-error">{error}</div>}

      <section className="platform-section">
        <div className="platform-section-header">
          <h2>Tenants</h2>
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>Create Tenant</button>
        </div>

        <table className="platform-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Subdomain</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr
                key={t._id}
                className="platform-table-row-clickable"
                onClick={() => handleTenantRowClick(t._id)}
              >
                <td>{t.name}</td>
                <td>{t.slug || '—'}</td>
                <td>{t.subdomain || '—'}</td>
                <td>{t.isActive !== false ? 'Active' : 'Inactive'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-sm"
                    onClick={() => setResetModal({ tenantId: t._id, email: '' })}
                  >
                    Reset Admin
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {createdCredentials && (
        <div className="modal-overlay" onClick={() => setCreatedCredentials(null)}>
          <div className="modal-card modal-detail" onClick={(e) => e.stopPropagation()}>
            <h3>Tenant created – save these credentials</h3>
            <p className="detail-password-note" style={{ marginBottom: 12 }}>
              Admin password is shown only once. Save it now.
            </p>
            <dl className="detail-dl">
              <dt>Email</dt>
              <dd><strong>{createdCredentials.email}</strong></dd>
              <dt>Password</dt>
              <dd><strong>{createdCredentials.password}</strong></dd>
            </dl>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreatedCredentials(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Create Tenant</h3>
            <form onSubmit={handleCreate}>
              <label>Business Name</label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
              <label>Slug</label>
              <input
                value={createForm.slug}
                onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="optional"
              />
              <label>Subdomain</label>
              <input
                value={createForm.subdomain}
                onChange={(e) => setCreateForm((f) => ({ ...f, subdomain: e.target.value }))}
                placeholder="optional"
              />
              <label>Admin Email</label>
              <input
                type="email"
                value={createForm.adminEmail}
                onChange={(e) => setCreateForm((f) => ({ ...f, adminEmail: e.target.value }))}
                required
              />
              <label>Admin Password</label>
              <input
                type="password"
                value={createForm.adminPassword}
                onChange={(e) => setCreateForm((f) => ({ ...f, adminPassword: e.target.value }))}
                required
              />
              <div className="modal-actions">
                <button type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailLoading && (
        <div className="modal-overlay">
          <div className="modal-card modal-loading">Loading tenant details...</div>
        </div>
      )}

      {detailModal && !detailLoading && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-card modal-detail" onClick={(e) => e.stopPropagation()}>
            <h3>Tenant Details</h3>
            <div className="detail-section">
              <h4>Tenant</h4>
              <dl className="detail-dl">
                <dt>Name</dt>
                <dd>{detailModal.name}</dd>
                <dt>ID</dt>
                <dd><code>{detailModal._id}</code></dd>
                <dt>Slug</dt>
                <dd>{detailModal.slug || '—'}</dd>
                <dt>Subdomain</dt>
                <dd>{detailModal.subdomain || '—'}</dd>
                <dt>Custom domain</dt>
                <dd>{detailModal.customDomain || '—'}</dd>
                <dt>Status</dt>
                <dd>{detailModal.isActive !== false ? 'Active' : 'Inactive'}</dd>
                <dt>Theme</dt>
                <dd>{detailModal.defaultTheme || '—'}</dd>
                {detailModal.createdAt && (
                  <>
                    <dt>Created</dt>
                    <dd>{new Date(detailModal.createdAt).toLocaleString()}</dd>
                  </>
                )}
              </dl>
            </div>
            <div className="detail-section">
              <h4>Admin login</h4>
              {detailModal.adminUser ? (
                <>
                  <dl className="detail-dl">
                    <dt>Email</dt>
                    <dd><strong>{detailModal.adminUser.email}</strong></dd>
                    <dt>Name</dt>
                    <dd>{detailModal.adminUser.name || '—'}</dd>
                    <dt>Role</dt>
                    <dd>{detailModal.adminUser.role}</dd>
                    <dt>Password</dt>
                    <dd className="detail-password-note">
                      Not stored in plain text. Use <strong>Reset Admin</strong> below to set a new password.
                    </dd>
                  </dl>
                  <button type="button" className="btn-primary btn-reset-in-detail" onClick={openResetFromDetail}>
                    Reset Admin Password
                  </button>
                </>
              ) : (
                <p className="detail-no-admin">No tenant admin user found.</p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setDetailModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {resetModal && (
        <div className="modal-overlay" onClick={() => setResetModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Tenant Admin</h3>
            <label>Admin Email</label>
            <input
              value={resetModal.email}
              onChange={(e) => setResetModal((r) => r && { ...r, email: e.target.value })}
              placeholder="admin@tenant.com"
            />
            <label>New Password</label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              required
            />
            <div className="modal-actions">
              <button type="button" onClick={() => setResetModal(null)}>Cancel</button>
              <button onClick={handleResetAdmin} disabled={!resetModal.email || !resetPassword}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
