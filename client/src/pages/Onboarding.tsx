import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isValid } from 'date-fns';
import { api, storage } from '../api/client';
import type { AiMember } from '../api/client';
import Layout from '../components/Layout';
import './Onboarding.css';

function safeFormat(d: Date | string | null | undefined, fmt: string): string {
  const dt = d ? new Date(d as string | number) : null;
  return dt && isValid(dt) ? format(dt, fmt) : '—';
}

export default function Onboarding() {
  const navigate = useNavigate();
  const role = storage.getRole();
  const canOnboardUser = role === 'TENANT_ADMIN' || role === 'MANAGER';
  const canOnboardMember = role === 'TENANT_ADMIN' || role === 'MANAGER' || role === 'TRAINER';

  const [gymIdInput, setGymIdInput] = useState('');
  const [lookupMember, setLookupMember] = useState<Record<string, unknown> | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const [onboardEmail, setOnboardEmail] = useState('');
  const [onboardPassword, setOnboardPassword] = useState('');
  const [onboardName, setOnboardName] = useState('');
  const [onboardRole, setOnboardRole] = useState<'STAFF' | 'MANAGER' | 'TRAINER'>('STAFF');
  const [onboardSubmitting, setOnboardSubmitting] = useState(false);
  const [onboardMessage, setOnboardMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [memberLoginEmail, setMemberLoginEmail] = useState('');
  const [memberLoginPassword, setMemberLoginPassword] = useState('');
  const [memberLoginName, setMemberLoginName] = useState('');
  const [memberLoginSubmitting, setMemberLoginSubmitting] = useState(false);
  const [memberLoginMessage, setMemberLoginMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [aiMembers, setAiMembers] = useState<AiMember[]>([]);
  const [aiMembersLoading, setAiMembersLoading] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<AiMember | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [showPasswordResult, setShowPasswordResult] = useState<string | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<AiMember | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  /** For admin: trainers list and member→trainer assignments (only when canOnboardUser) */
  const [trainers, setTrainers] = useState<Array<{ id: string; email: string; name?: string; createdAt?: string; assignedMemberCount: number }>>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // memberUserId -> trainerUserId
  const [assigningMemberId, setAssigningMemberId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [selectedTrainerForMember, setSelectedTrainerForMember] = useState<Record<string, string>>({}); // memberUserId -> trainerUserId (dropdown value)
  const [deleteTrainerConfirm, setDeleteTrainerConfirm] = useState<{ id: string; email: string; name?: string } | null>(null);
  const [deleteTrainerSubmitting, setDeleteTrainerSubmitting] = useState(false);

  const doLookup = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setLookupMember(null);
      setLookupError('');
      return;
    }
    setLookupLoading(true);
    setLookupError('');
    setLookupMember(null);
    try {
      const isNumeric = /^\d+$/.test(q);
      const res = await api.legacy.lookup(isNumeric ? undefined : q, isNumeric ? q : undefined);
      setLookupMember(res || null);
      if (!res) setLookupError('No member found with this Gym ID or Reg No.');
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
      setLookupMember(null);
    } finally {
      setLookupLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      doLookup(gymIdInput);
    }, 400);
    return () => clearTimeout(t);
  }, [gymIdInput, doLookup]);

  /* Prefill "Create member login" form when a member is found from lookup (name only; email and password left empty) */
  useEffect(() => {
    if (lookupMember) {
      setMemberLoginName(String(lookupMember.NAME || '').trim());
      setMemberLoginEmail('');
      setMemberLoginPassword('');
      setMemberLoginMessage(null);
    }
  }, [lookupMember]);

  const handleOnboardUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardMessage(null);
    if (!onboardEmail.trim() || !onboardPassword.trim()) {
      setOnboardMessage({ type: 'err', text: 'Email and password required' });
      return;
    }
    setOnboardSubmitting(true);
    try {
      await api.auth.onboardUser({
        email: onboardEmail.trim(),
        password: onboardPassword,
        name: onboardName.trim() || onboardEmail.trim(),
        role: onboardRole,
      });
      setOnboardMessage({ type: 'ok', text: 'User created. They can log in with the same tenant login URL.' });
      setOnboardEmail('');
      setOnboardPassword('');
      setOnboardName('');
      loadTrainersAndAssignments();
    } catch (err) {
      setOnboardMessage({ type: 'err', text: err instanceof Error ? err.message : 'Failed to create user' });
    } finally {
      setOnboardSubmitting(false);
    }
  };

  const handleCreateMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupMember || !canOnboardMember) return;
    const regNo = Number(lookupMember['Reg No:']);
    if (Number.isNaN(regNo)) {
      setMemberLoginMessage({ type: 'err', text: 'Invalid member' });
      return;
    }
    setMemberLoginMessage(null);
    if (!memberLoginEmail.trim() || !memberLoginPassword.trim()) {
      setMemberLoginMessage({ type: 'err', text: 'Email and password required' });
      return;
    }
    setMemberLoginSubmitting(true);
    try {
      await api.auth.onboardMember({
        email: memberLoginEmail.trim(),
        password: memberLoginPassword,
        name: memberLoginName.trim() || (lookupMember.NAME as string) || '',
        regNo,
      });
      setMemberLoginMessage({
        type: 'ok',
        text: 'Member login created. They can log in with this email and will see only Nutrition AI.',
      });
      setMemberLoginEmail('');
      setMemberLoginPassword('');
      setMemberLoginName('');
      loadAiMembers();
    } catch (err) {
      setMemberLoginMessage({ type: 'err', text: err instanceof Error ? err.message : 'Failed to create member login' });
    } finally {
      setMemberLoginSubmitting(false);
    }
  };

  const loadAiMembers = useCallback(async () => {
    if (!canOnboardMember) return;
    setAiMembersLoading(true);
    try {
      const list = await api.auth.getAiMembers();
      setAiMembers(list || []);
    } catch {
      setAiMembers([]);
    } finally {
      setAiMembersLoading(false);
    }
  }, [canOnboardMember]);

  const loadTrainersAndAssignments = useCallback(async () => {
    if (!canOnboardUser) return;
    try {
      const [trainerList, assignmentList] = await Promise.all([
        api.auth.getTrainers(),
        api.auth.listTrainerAssignments(),
      ]);
      setTrainers(trainerList || []);
      const map: Record<string, string> = {};
      const selectedMap: Record<string, string> = {};
      (assignmentList || []).forEach((a) => {
        map[a.memberUserId] = a.trainerUserId;
        selectedMap[a.memberUserId] = a.trainerUserId;
      });
      setAssignments(map);
      setSelectedTrainerForMember(selectedMap);
    } catch {
      setTrainers([]);
      setAssignments({});
      setSelectedTrainerForMember({});
    }
  }, [canOnboardUser]);

  useEffect(() => {
    loadAiMembers();
  }, [loadAiMembers]);

  useEffect(() => {
    if (canOnboardUser) loadTrainersAndAssignments();
  }, [canOnboardUser, loadTrainersAndAssignments]);

  /** Called when trainer dropdown changes: assign or unassign that member to the selected trainer. */
  const handleTrainerSelectChange = async (memberUserId: string, newTrainerId: string) => {
    setSelectedTrainerForMember((prev) => ({ ...prev, [memberUserId]: newTrainerId }));
    setAssignError(null);
    setAssigningMemberId(memberUserId);
    try {
      if (!newTrainerId) {
        await api.auth.unassignMemberFromTrainer(memberUserId);
      } else {
        await api.auth.assignMemberToTrainer(newTrainerId, memberUserId);
      }
      await loadTrainersAndAssignments();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Failed to update assignment');
      setSelectedTrainerForMember((prev) => ({ ...prev, [memberUserId]: assignments[memberUserId] ?? '' }));
    } finally {
      setAssigningMemberId(null);
    }
  };

  const handleConfirmDeleteTrainer = async () => {
    if (!deleteTrainerConfirm || !canOnboardUser) return;
    setDeleteTrainerSubmitting(true);
    try {
      await api.auth.deleteTrainer(deleteTrainerConfirm.id);
      setDeleteTrainerConfirm(null);
      await loadTrainersAndAssignments();
    } catch (err) {
      setOnboardMessage({ type: 'err', text: err instanceof Error ? err.message : 'Failed to remove trainer' });
    } finally {
      setDeleteTrainerSubmitting(false);
    }
  };

  const handleOpenResetPassword = (user: AiMember) => {
    setResetPasswordUser(user);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetError('');
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;
    setResetError('');
    if (resetNewPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    setResetSubmitting(true);
    try {
      const res = await api.auth.resetMemberPassword(resetPasswordUser.id, resetNewPassword);
      setResetPasswordUser(null);
      setShowPasswordResult(res.newPassword);
      loadAiMembers();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmUser) return;
    setDeleteSubmitting(true);
    try {
      await api.auth.deactivateMemberUser(deleteConfirmUser.id);
      setDeleteConfirmUser(null);
      loadAiMembers();
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  const handleNavChange = (id: string) => {
    if (id === 'onboarding') return;
    if (id === 'enquiries') {
      navigate('/enquiries');
      return;
    }
    if (id === 'nutrition-ai') {
      navigate('/nutrition-ai');
      return;
    }
    navigate('/');
  };

  return (
    <Layout activeNav="onboarding" onNavChange={handleNavChange} onLogout={handleLogout}>
      <div className="onboarding-screen">
      <div className="onboarding-page">
        <h1 className="page-title">Onboarding</h1>
        <p className="onboarding-intro">
          Onboard new users and look up members by Gym ID.
        </p>

        {/* Member lookup by Gym ID – auto-searchable */}
        <section className="onboarding-section lookup-section">
          <h2>Look up member</h2>
          <p className="section-desc">Enter Gym ID (e.g. GYM-2025-00001) or Reg No. Only onboarded members appear.</p>
          <div className="lookup-input-wrap">
            <input
              type="text"
              className="lookup-input"
              placeholder="Gym ID or Reg No"
              value={gymIdInput}
              onChange={(e) => setGymIdInput(e.target.value)}
              autoComplete="off"
            />
            {lookupLoading && <span className="lookup-loading">Searching…</span>}
          </div>
          {lookupError && <div className="lookup-error">{lookupError}</div>}
          {lookupMember && (
            <div className="member-card">
              <div className="member-card-header">
                <span className="member-card-avatar">
                  {(lookupMember.NAME as string)?.charAt(0)?.toUpperCase() || '?'}
                </span>
                <div>
                  <strong>{lookupMember.NAME || '—'}</strong>
                  <span className="member-card-id">
                    {(lookupMember as Record<string, unknown>).memberId as string} · Reg No: {lookupMember['Reg No:'] as number}
                  </span>
                </div>
              </div>
              <dl className="member-card-dl">
                <dt>Phone</dt>
                <dd>{String(lookupMember['Phone Number'] || '—')}</dd>
                <dt>Gender</dt>
                <dd>{String(lookupMember.Gender || '—')}</dd>
                <dt>Package</dt>
                <dd>{String(lookupMember['Typeof pack'] || '—')}</dd>
                <dt>Join date</dt>
                <dd>{safeFormat(lookupMember['Date of Joining'] as string, 'dd MMM yyyy')}</dd>
                <dt>Due date</dt>
                <dd>{safeFormat(lookupMember['DUE DATE'] as string, 'dd MMM yyyy')}</dd>
              </dl>
              {canOnboardMember && (
                <form onSubmit={handleCreateMemberLogin} className="member-login-form" autoComplete="off">
                  <h3>Create member login</h3>
                  <p className="section-desc">They can log in later and see only Nutrition AI.</p>
                  <label>Email</label>
                  <input
                    type="email"
                    value={memberLoginEmail}
                    onChange={(e) => setMemberLoginEmail(e.target.value)}
                    required
                    placeholder="member@example.com"
                    autoComplete="off"
                  />
                  <label>Password</label>
                  <input
                    type="password"
                    value={memberLoginPassword}
                    onChange={(e) => setMemberLoginPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <label>Name (optional)</label>
                  <input
                    type="text"
                    value={memberLoginName}
                    onChange={(e) => setMemberLoginName(e.target.value)}
                    placeholder={String(lookupMember.NAME || '')}
                  />
                  <div className="form-actions">
                    <button type="submit" className="btn-primary" disabled={memberLoginSubmitting}>
                      {memberLoginSubmitting ? 'Creating…' : 'Create member login'}
                    </button>
                  </div>
                  {memberLoginMessage && (
                    <div className={memberLoginMessage.type === 'ok' ? 'message-ok' : 'message-err'}>
                      {memberLoginMessage.text}
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </section>

        {/* User management: members enrolled for AI – Tenant Admin / Manager / Trainer */}
        {canOnboardMember && (
          <section className="onboarding-section user-mgmt-section">
            <h2>Members enrolled for AI (Nutrition)</h2>
            <p className="section-desc">Full control: reset password or remove login access. Assign a trainer per member; the dropdown saves immediately. Passwords cannot be viewed; use Reset password to set a new one and share it with the member.</p>
            {assignError && (
              <div className="message-err" role="alert">
                {assignError}
              </div>
            )}
            {aiMembersLoading ? (
              <p className="section-desc">Loading…</p>
            ) : aiMembers.length === 0 ? (
              <p className="section-desc">No members enrolled for AI yet. Create a member login above to add one.</p>
            ) : (
              <div className="user-mgmt-table-wrap">
                <table className="user-mgmt-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Reg No</th>
                      <th>Enrolled</th>
                      {canOnboardUser && <th>Trainer</th>}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiMembers.map((u) => {
                      const currentTrainerId = assignments[u.id];
                      const currentTrainer = currentTrainerId ? trainers.find((t) => t.id === currentTrainerId) : null;
const selectedId = selectedTrainerForMember[u.id] ?? currentTrainerId ?? '';
                                      const busy = assigningMemberId === u.id;
                                      const selectedTrainer = selectedId ? trainers.find((t) => t.id === selectedId) : null;
                                      return (
                                        <tr key={u.id}>
                                          <td>{u.email}</td>
                                          <td>{u.name || '—'}</td>
                                          <td>{u.linkedRegNo != null ? u.linkedRegNo : '—'}</td>
                                          <td>{u.createdAt ? safeFormat(u.createdAt, 'dd MMM yyyy') : '—'}</td>
                                          {canOnboardUser && (
                                            <td className="trainer-cell">
                                              <div className="trainer-assign-row">
                                                <select
                                                  value={selectedId}
                                                  onChange={(e) => handleTrainerSelectChange(u.id, e.target.value)}
                                                  disabled={busy}
                                                  className="trainer-select"
                                                  aria-label={`Assign trainer for ${u.name || u.email}`}
                                                >
                                                  <option value="">Select trainer</option>
                                                  {trainers.map((t) => (
                                                    <option key={t.id} value={t.id}>{t.name || t.email}</option>
                                                  ))}
                                                  {selectedId && !selectedTrainer && (
                                                    <option value={selectedId}>(Assigned)</option>
                                                  )}
                                                </select>
                                                {busy && <span className="trainer-assign-busy">…</span>}
                                              </div>
                                              {currentTrainer && (
                                                <span className="trainer-current-label">Assigned: {currentTrainer.name || currentTrainer.email}</span>
                                              )}
                                            </td>
                                          )}
                          <td>
                            <button type="button" className="btn-sm btn-reset" onClick={() => handleOpenResetPassword(u)}>
                              Reset password
                            </button>
                            {canOnboardUser && (
                              <button type="button" className="btn-sm btn-delete" onClick={() => setDeleteConfirmUser(u)}>
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Onboard new user – Tenant Admin / Manager only */}
        {canOnboardUser && (
          <section className="onboarding-section onboard-user-section">
            <h2>Onboard new user</h2>
            <p className="section-desc">Add a Staff or Manager so they can log in to this tenant app.</p>
            <form onSubmit={handleOnboardUser} className="onboard-user-form" autoComplete="off">
              <label>Email</label>
              <input
                type="email"
                value={onboardEmail}
                onChange={(e) => setOnboardEmail(e.target.value)}
                required
                placeholder="user@gym.com"
                autoComplete="off"
              />
              <label>Password</label>
              <input
                type="password"
                value={onboardPassword}
                onChange={(e) => setOnboardPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                autoComplete="new-password"
              />
              <label>Name (optional)</label>
              <input
                type="text"
                value={onboardName}
                onChange={(e) => setOnboardName(e.target.value)}
                placeholder="Display name"
              />
              <label>Role</label>
              <select value={onboardRole} onChange={(e) => setOnboardRole(e.target.value as 'STAFF' | 'MANAGER' | 'TRAINER')}>
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
                <option value="TRAINER">Trainer</option>
              </select>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={onboardSubmitting}>
                  {onboardSubmitting ? 'Creating…' : 'Create user'}
                </button>
              </div>
              {onboardMessage && (
                <div className={onboardMessage.type === 'ok' ? 'message-ok' : 'message-err'}>
                  {onboardMessage.text}
                </div>
              )}
            </form>

            {/* Trainers table – all trainers in the tenant */}
            <div className="trainers-table-wrap">
              <h3 className="trainers-table-title">Trainers</h3>
              <p className="section-desc">All trainers in this tenant. Assign members to trainers in the &quot;Members enrolled for AI&quot; section below.</p>
              {trainers.length === 0 ? (
                <p className="trainers-empty">No trainers yet.</p>
              ) : (
                <div className="trainers-table-scroll">
                  <table className="trainers-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Assigned members</th>
                        <th>Added on</th>
                        {canOnboardUser && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {trainers.map((t) => (
                        <tr key={t.id}>
                          <td>{t.name || '—'}</td>
                          <td>{t.email}</td>
                          <td>{t.assignedMemberCount}</td>
                          <td>{t.createdAt ? safeFormat(t.createdAt, 'dd MMM yyyy') : '—'}</td>
                          {canOnboardUser && (
                            <td>
                              <button
                                type="button"
                                className="btn-delete btn-sm"
                                onClick={() => setDeleteTrainerConfirm({ id: t.id, email: t.email, name: t.name })}
                                title="Remove trainer"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Reset password modal – confirm new password */}
      {resetPasswordUser && (
        <div className="onboarding-modal-overlay modal-overlay" onClick={() => !resetSubmitting && setResetPasswordUser(null)}>
          <div className="modal onboarding-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reset password</h2>
              <button type="button" className="modal-close" onClick={() => !resetSubmitting && setResetPasswordUser(null)} aria-label="Close">×</button>
            </div>
            <p className="section-desc">Set a new password for <strong>{resetPasswordUser.email}</strong>. You will see it once to share with the member.</p>
            <form onSubmit={handleConfirmResetPassword}>
              <label>New password (min 6 characters)</label>
              <input
                type="password"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
                placeholder="••••••••"
              />
              <label>Confirm new password</label>
              <input
                type="password"
                value={resetConfirmPassword}
                onChange={(e) => setResetConfirmPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
                placeholder="••••••••"
              />
              {resetError && <div className="message-err">{resetError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setResetPasswordUser(null)} disabled={resetSubmitting}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={resetSubmitting}>{resetSubmitting ? 'Updating…' : 'Update password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Show new password once after reset */}
      {showPasswordResult !== null && (
        <div className="onboarding-modal-overlay modal-overlay" onClick={() => setShowPasswordResult(null)}>
          <div className="modal onboarding-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New password – copy and share</h2>
              <button type="button" className="modal-close" onClick={() => setShowPasswordResult(null)} aria-label="Close">×</button>
            </div>
            <p className="section-desc">Share this password with the member. It will not be shown again.</p>
            <div className="password-display">
              <code>{showPasswordResult}</code>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => setShowPasswordResult(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete trainer confirmation */}
      {deleteTrainerConfirm && (
        <div className="onboarding-modal-overlay modal-overlay" onClick={() => !deleteTrainerSubmitting && setDeleteTrainerConfirm(null)}>
          <div className="modal onboarding-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Remove trainer?</h2>
              <button type="button" className="modal-close" onClick={() => !deleteTrainerSubmitting && setDeleteTrainerConfirm(null)} aria-label="Close">×</button>
            </div>
            <p className="section-desc">
              <strong>{deleteTrainerConfirm.name || deleteTrainerConfirm.email}</strong> ({deleteTrainerConfirm.email}) will no longer be able to log in. Their assigned members will be unassigned. You can add a new trainer later. Are you sure?
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleteTrainerConfirm(null)} disabled={deleteTrainerSubmitting}>Cancel</button>
              <button type="button" className="btn-delete" onClick={handleConfirmDeleteTrainer} disabled={deleteTrainerSubmitting}>{deleteTrainerSubmitting ? 'Removing…' : 'Yes, remove trainer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete user confirmation */}
      {deleteConfirmUser && (
        <div className="onboarding-modal-overlay modal-overlay" onClick={() => !deleteSubmitting && setDeleteConfirmUser(null)}>
          <div className="modal onboarding-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Remove member login?</h2>
              <button type="button" className="modal-close" onClick={() => !deleteSubmitting && setDeleteConfirmUser(null)} aria-label="Close">×</button>
            </div>
            <p className="section-desc">
              <strong>{deleteConfirmUser.email}</strong> will no longer be able to log in to Nutrition AI. You can enrol them again later from Look up member. Are you sure?
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setDeleteConfirmUser(null)} disabled={deleteSubmitting}>Cancel</button>
              <button type="button" className="btn-delete" onClick={handleConfirmDelete} disabled={deleteSubmitting}>{deleteSubmitting ? 'Removing…' : 'Yes, remove login'}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </Layout>
  );
}
