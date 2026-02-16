import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, storage, getApiErrorMessage } from '../api/client';
import type { AiMember } from '../api/client';
import { useI18n } from '../context/I18nContext';
import Layout from '../components/Layout';
import { AppIcons } from '../components/icons/AppIcons';
import './TrainerDashboard.css';

type AttentionRow = {
  memberName: string;
  daysWorkoutMissed: number;
  mealFollowedYesterday: boolean;
  lastActivityDate: string;
  upcomingRenewalDate: string;
};

const emptyRow = (): AttentionRow => ({
  memberName: '',
  daysWorkoutMissed: 0,
  mealFollowedYesterday: true,
  lastActivityDate: '',
  upcomingRenewalDate: '',
});

export default function TrainerDashboard() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [members, setMembers] = useState<AiMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [attentionRows, setAttentionRows] = useState<AttentionRow[]>([emptyRow()]);
  const [attentionResult, setAttentionResult] = useState<string | null>(null);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);

  useEffect(() => {
    api.auth
      .getMyAssignedMembers()
      .then((list) => setMembers(Array.isArray(list) ? list : []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  const handleNavChange = (id: string) => {
    if (id === 'nutrition-ai') navigate('/nutrition-ai');
    else if (id === 'workout-plan') navigate('/workout-plan');
    else if (id === 'onboarding') navigate('/onboarding');
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  const loadAssignedIntoAttention = () => {
    if (!members.length) return;
    setAttentionRows(
      members.map((m) => ({
        memberName: m.name || m.email || '',
        daysWorkoutMissed: 0,
        mealFollowedYesterday: true,
        lastActivityDate: '',
        upcomingRenewalDate: '',
      })),
    );
    setAttentionResult(null);
    setAttentionError(null);
  };

  const updateAttentionRow = (index: number, field: keyof AttentionRow, value: string | number | boolean) => {
    setAttentionRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addAttentionRow = () => {
    setAttentionRows((prev) => [...prev, emptyRow()]);
  };

  const removeAttentionRow = (index: number) => {
    if (attentionRows.length <= 1) return;
    setAttentionRows((prev) => prev.filter((_, i) => i !== index));
  };

  const fetchAssignedSummary = async () => {
    setSummaryError(null);
    setSummaryResult(null);
    setSummaryModalOpen(true);
    setSummaryLoading(true);
    try {
      const { result } = await api.calories.trainerAssignedSummary();
      setSummaryResult(result ?? '');
    } catch (err) {
      setSummaryError(getApiErrorMessage(err));
    } finally {
      setSummaryLoading(false);
    }
  };

  const runNeedsAttention = async () => {
    const valid = attentionRows.filter((r) => r.memberName.trim());
    if (!valid.length) {
      setAttentionError(t('trainer.addOneMemberError'));
      return;
    }
    setAttentionError(null);
    setAttentionResult(null);
    setAttentionLoading(true);
    try {
      const { result } = await api.calories.trainerNeedsAttention(
        valid.map((r) => ({
          memberName: r.memberName.trim(),
          daysWorkoutMissed: Number(r.daysWorkoutMissed) || 0,
          mealFollowedYesterday: !!r.mealFollowedYesterday,
          lastActivityDate: r.lastActivityDate || 'N/A',
          upcomingRenewalDate: r.upcomingRenewalDate || 'N/A',
        })),
      );
      setAttentionResult(result || '');
    } catch (err) {
      setAttentionError(getApiErrorMessage(err));
    } finally {
      setAttentionLoading(false);
    }
  };

  const parsedTable = (): { name: string; issue: string; risk: string; action: string }[] => {
    if (!attentionResult?.trim()) return [];
    const lines = attentionResult.trim().split(/\r?\n/).filter(Boolean);
    return lines.map((line) => {
      const parts = line.split(/\s*\|\s*/).map((p) => p.trim());
      return {
        name: parts[0] ?? '',
        issue: parts[1] ?? '',
        risk: parts[2] ?? '',
        action: parts[3] ?? '',
      };
    });
  };

  const tableRows = parsedTable();

  return (
    <Layout activeNav="dashboard" onNavChange={handleNavChange} onLogout={handleLogout}>
      <div className="trainer-dashboard">
        <h1 className="trainer-dashboard-title">{t('trainer.myAssignedMembers')}</h1>
        <p className="trainer-dashboard-desc">
          {t('trainer.viewNutritionWorkout')}
        </p>

        {/* Assigned Members – Tap to view summary */}
        <section className="trainer-assigned-summary-card">
          <div className="trainer-assigned-summary-header">
            <span className="trainer-assigned-summary-label">{t('trainer.assignedMembers')}</span>
            <button
              type="button"
              className="btn-primary trainer-tap-view-btn"
              onClick={fetchAssignedSummary}
              disabled={summaryLoading}
            >
              {summaryLoading ? t('common.loading') : t('trainer.tapToView')}
            </button>
          </div>
          {summaryModalOpen && (
            <div className="trainer-summary-modal-overlay" onClick={() => setSummaryModalOpen(false)} role="presentation">
              <div className="trainer-summary-modal" onClick={(e) => e.stopPropagation()}>
                <div className="trainer-summary-modal-header">
                  <h3>{t('trainer.assignedMembersSummary')}</h3>
                  <button type="button" className="trainer-summary-modal-close" onClick={() => setSummaryModalOpen(false)} aria-label={t('common.close')}>×</button>
                </div>
                <div className="trainer-summary-modal-body">
                  {summaryLoading && <div className="trainer-summary-loading">{t('common.loading')}</div>}
                  {summaryError && <div className="trainer-summary-err">{summaryError}</div>}
                  {!summaryLoading && summaryResult != null && summaryResult !== '' && (
                    <pre className="trainer-summary-pre">{summaryResult}</pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Needs Attention Today */}
        <section className="trainer-needs-attention">
          <h2 className="trainer-needs-attention-title">{t('trainer.needsAttentionToday')}</h2>
          <p className="trainer-needs-attention-desc">
            {t('trainer.needsAttentionDesc')}
          </p>
          <div className="trainer-needs-attention-inputs">
            {members.length > 0 && (
              <button type="button" className="btn-secondary trainer-load-members-btn" onClick={loadAssignedIntoAttention}>
                {t('trainer.loadMyAssignedMembers')}
              </button>
            )}
            <div className="trainer-attention-table-wrap">
              <table className="trainer-attention-table">
                <thead>
                  <tr>
                    <th>{t('trainer.memberName')}</th>
                    <th>{t('trainer.daysWorkoutMissed')}</th>
                    <th>{t('trainer.mealFollowedYesterday')}</th>
                    <th>{t('trainer.lastActivityDate')}</th>
                    <th>{t('trainer.upcomingRenewalDate')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {attentionRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          type="text"
                          value={row.memberName}
                          onChange={(e) => updateAttentionRow(idx, 'memberName', e.target.value)}
                          placeholder={t('trainer.placeholderName')}
                          className="trainer-attention-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={row.daysWorkoutMissed || ''}
                          onChange={(e) => updateAttentionRow(idx, 'daysWorkoutMissed', e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                          className="trainer-attention-input trainer-attention-num"
                        />
                      </td>
                      <td>
                        <select
                          value={row.mealFollowedYesterday ? 'Yes' : 'No'}
                          onChange={(e) => updateAttentionRow(idx, 'mealFollowedYesterday', e.target.value === 'Yes')}
                          className="trainer-attention-select"
                        >
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.lastActivityDate}
                          onChange={(e) => updateAttentionRow(idx, 'lastActivityDate', e.target.value)}
                          className="trainer-attention-input"
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.upcomingRenewalDate}
                          onChange={(e) => updateAttentionRow(idx, 'upcomingRenewalDate', e.target.value)}
                          className="trainer-attention-input"
                        />
                      </td>
                      <td>
                        <button type="button" className="btn-sm btn-reset trainer-remove-row" onClick={() => removeAttentionRow(idx)} disabled={attentionRows.length <= 1} title={t('trainer.remove')}>
                          {t('trainer.remove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn-secondary trainer-add-row-btn" onClick={addAttentionRow}>
              {t('trainer.addRow')}
            </button>
            <button type="button" className="btn-primary trainer-analyze-btn" onClick={runNeedsAttention} disabled={attentionLoading}>
              {attentionLoading ? t('trainer.analyzing') : t('trainer.analyze')}
            </button>
            {attentionError && <div className="trainer-attention-err">{attentionError}</div>}
            {attentionResult != null && attentionResult !== '' && (
              <div className="trainer-attention-result">
                <h3 className="trainer-attention-result-title">{t('trainer.resultTableTitle')}</h3>
                {tableRows.length > 0 ? (
                  <div className="trainer-attention-result-table-wrap">
                    <table className="trainer-attention-result-table">
                      <thead>
                        <tr>
                          <th>{t('trainer.resultName')}</th>
                          <th>{t('trainer.resultIssue')}</th>
                          <th>{t('trainer.resultRiskLevel')}</th>
                          <th>{t('trainer.resultSuggestedAction')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((r, i) => (
                          <tr key={i}>
                            <td>{r.name}</td>
                            <td>{r.issue}</td>
                            <td>{r.risk}</td>
                            <td>{r.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <pre className="trainer-attention-result-raw">{attentionResult}</pre>
                )}
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="trainer-dashboard-loading">{t('common.loading')}</div>
        ) : members.length === 0 ? (
          <div className="trainer-dashboard-empty">
            <p>{t('trainer.noMembersAssigned')}</p>
            <p className="trainer-dashboard-empty-hint">
              {t('trainer.hintOnboarding')}
            </p>
          </div>
        ) : (
          <div className="trainer-dashboard-list">
            {members.map((m) => (
              <div key={m.id} className="trainer-dashboard-card">
                <div className="trainer-dashboard-card-header">
                  <span className="trainer-dashboard-card-name">{m.name || m.email}</span>
                  {m.name && <span className="trainer-dashboard-card-email">{m.email}</span>}
                  {m.linkedRegNo != null && (
                    <span className="trainer-dashboard-card-reg">{t('trainer.regNo')}: {m.linkedRegNo}</span>
                  )}
                </div>
                <div className="trainer-dashboard-card-actions">
                  <button
                    type="button"
                    className="btn-primary trainer-dashboard-btn"
                    onClick={() => navigate(`/nutrition-ai?memberId=${encodeURIComponent(m.id)}`)}
                  >
                    <span className="trainer-dashboard-btn-icon">{AppIcons['nutrition-ai']?.() ?? null}</span>
                    {t('trainer.nutritionAI')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary trainer-dashboard-btn"
                    onClick={() => navigate(`/workout-plan?memberId=${encodeURIComponent(m.id)}`)}
                  >
                    <span className="trainer-dashboard-btn-icon">{AppIcons['workout-plan']?.() ?? null}</span>
                    {t('trainer.workoutPlan')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
