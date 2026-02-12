import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { api, getApiErrorMessage, storage } from '../api/client';
import { PLAN_TEMPLATES, WORKOUT_GUIDE } from '../data/workoutPlans';
import './WorkoutPlan.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function WorkoutPlan() {
  const navigate = useNavigate();
  const isMember = storage.getRole() === 'MEMBER';

  const [activeNav, setActiveNav] = useState<'nutrition-ai' | 'medical-history' | 'workout-plan'>('workout-plan');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('custom');
  const [plan, setPlan] = useState<{ name: string; days: { dayOfWeek: number; label: string }[]; updatedAt?: string } | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState('');

  const [logs, setLogs] = useState<Array<{ _id: string; date: string; workoutLabel: string; notes?: string; durationMinutes?: number; createdAt: string }>>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logDate, setLogDate] = useState(() => toDateOnly(new Date()));
  const [logWorkoutLabel, setLogWorkoutLabel] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logDuration, setLogDuration] = useState('');
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState('');
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  useEffect(() => {
    if (!isMember) return;
    setPlanLoading(true);
    setPlanError('');
    api.workoutPlan
      .getMine()
      .then((p) => setPlan(p ?? null))
      .catch((e) => setPlanError(getApiErrorMessage(e)))
      .finally(() => setPlanLoading(false));
  }, [isMember]);

  useEffect(() => {
    if (!isMember) return;
    setLogsLoading(true);
    api.workoutPlan
      .getLogs({ limit: 30 })
      .then((list) => setLogs(Array.isArray(list) ? list : []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  }, [isMember]);

  const loadLogs = () => {
    if (!isMember) return;
    api.workoutPlan.getLogs({ limit: 30 }).then((list) => setLogs(Array.isArray(list) ? list : [])).catch(() => {});
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  const handleNavChange = (id: string) => {
    if (id === 'nutrition-ai') {
      setActiveNav('nutrition-ai');
      navigate('/nutrition-ai');
      return;
    }
    if (id === 'medical-history') {
      setActiveNav('medical-history');
      navigate('/medical-history');
      return;
    }
    if (id === 'workout-plan') {
      setActiveNav('workout-plan');
      navigate('/workout-plan');
      return;
    }
  };

  const planDays = plan?.days ?? [];
  const daysWithLabels = DAY_NAMES.map((name, dayOfWeek) => ({
    dayOfWeek,
    label: planDays.find((d) => d.dayOfWeek === dayOfWeek)?.label ?? 'Rest',
  }));

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'custom') return;
    const template = PLAN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const newDays = template.days.map((label, dayOfWeek) => ({
      dayOfWeek,
      label: (label && label.trim()) || 'Rest',
    }));
    setPlan((prev) => ({
      name: prev?.name ?? template.name,
      days: newDays,
      updatedAt: prev?.updatedAt,
    }));
  };

  const uniqueWorkoutLabels = Array.from(
    new Set(daysWithLabels.map((d) => d.label).filter((l) => l && l !== 'Rest')),
  ).sort();
  const guideEntries = uniqueWorkoutLabels
    .map((label) => ({ label, exercises: WORKOUT_GUIDE[label] ?? [] }))
    .filter((e) => e.exercises.length > 0);

  const handleSavePlan = () => {
    setPlanError('');
    setPlanSaving(true);
    api.workoutPlan
      .upsertMine({ name: plan?.name ?? 'My Plan', days: daysWithLabels })
      .then((updated) => setPlan(updated))
      .catch((e) => setPlanError(getApiErrorMessage(e)))
      .finally(() => setPlanSaving(false));
  };

  const handleDayLabelChange = (dayOfWeek: number, value: string) => {
    const next = daysWithLabels.map((d) =>
      d.dayOfWeek === dayOfWeek ? { ...d, label: value } : d,
    );
    setPlan((prev) => ({ name: prev?.name ?? 'My Plan', days: next, updatedAt: prev?.updatedAt }));
  };

  const todayDayOfWeek = new Date().getDay();
  const todayLabel = daysWithLabels.find((d) => d.dayOfWeek === todayDayOfWeek)?.label ?? null;

  const workoutOptions = Array.from(new Set([todayLabel, ...daysWithLabels.map((d) => d.label)].filter(Boolean))) as string[];

  const handleSubmitLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = logWorkoutLabel.trim();
    if (!label) {
      setLogError('Select or enter a workout.');
      return;
    }
    setLogError('');
    setLogSubmitting(true);
    try {
      const durationNum = logDuration.trim() ? parseInt(logDuration, 10) : undefined;
      await api.workoutPlan.createLog({
        date: logDate,
        workoutLabel: label,
        notes: logNotes.trim() || undefined,
        durationMinutes: durationNum != null && !Number.isNaN(durationNum) ? durationNum : undefined,
      });
      setLogWorkoutLabel('');
      setLogNotes('');
      setLogDuration('');
      loadLogs();
    } catch (e) {
      setLogError(getApiErrorMessage(e));
    } finally {
      setLogSubmitting(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!window.confirm('Remove this log entry?')) return;
    setDeletingLogId(id);
    try {
      await api.workoutPlan.deleteLog(id);
      loadLogs();
    } finally {
      setDeletingLogId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'Z');
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (!isMember) {
    return (
      <Layout activeNav="workout-plan" onNavChange={handleNavChange} onLogout={handleLogout}>
        <div className="workout-plan-page">
          <h1 className="page-title">Workout Plan</h1>
          <div className="wp-card">
            <p className="wp-hint">Workout plan is available for member accounts only.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout activeNav={activeNav as any} onNavChange={handleNavChange} onLogout={handleLogout}>
      <div className="workout-plan-page">
        <h1 className="page-title">Workout Plan</h1>
        <p className="wp-intro">Define your weekly plan and track your workouts in one place.</p>

        {/* My weekly plan */}
        <div className="wp-card">
          <h2 className="wp-card-title">My weekly plan</h2>
          {!planLoading && (
            <div className="wp-plan-select-row">
              <label htmlFor="wp-plan-select" className="wp-plan-select-label">
                Choose a plan
              </label>
              <select
                id="wp-plan-select"
                className="wp-plan-select"
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                {PLAN_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {PLAN_TEMPLATES.find((t) => t.id === selectedTemplateId)?.description && (
                <p className="wp-plan-desc">
                  {PLAN_TEMPLATES.find((t) => t.id === selectedTemplateId)?.description}
                </p>
              )}
            </div>
          )}
          {todayLabel && (
            <p className="wp-today">
              Today: <strong>{todayLabel}</strong>
            </p>
          )}
          {planError && <div className="wp-error">{planError}</div>}
          {planLoading ? (
            <p className="wp-hint">Loading…</p>
          ) : (
            <>
              <div className="wp-days">
                {daysWithLabels.map((d) => (
                  <div key={d.dayOfWeek} className="wp-day-row">
                    <label className="wp-day-name">{DAY_NAMES[d.dayOfWeek]}</label>
                    <input
                      type="text"
                      className="wp-day-input"
                      value={d.label}
                      onChange={(e) => handleDayLabelChange(d.dayOfWeek, e.target.value)}
                      placeholder="e.g. Push, Rest"
                    />
                  </div>
                ))}
              </div>
              <div className="wp-actions">
                <button type="button" className="btn-primary" onClick={handleSavePlan} disabled={planSaving}>
                  {planSaving ? 'Saving…' : 'Save plan'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Workout guide – what to do each day type */}
        {!planLoading && guideEntries.length > 0 && (
          <div className="wp-card wp-guide-card">
            <h2 className="wp-card-title">Workout guide</h2>
            <p className="wp-hint">Suggested exercises for each day type. Use this as a reference when you hit the gym.</p>
            <div className="wp-guide-list">
              {guideEntries.map(({ label, exercises }) => (
                <div key={label} className="wp-guide-block">
                  <h3 className="wp-guide-label">{label}</h3>
                  <ul className="wp-guide-exercises">
                    {exercises.map((ex, i) => (
                      <li key={i} className="wp-guide-exercise">
                        <span className="wp-guide-ex-name">{ex.name}</span>
                        {ex.sets && <span className="wp-guide-ex-sets">{ex.sets}</span>}
                        {ex.notes && <span className="wp-guide-ex-notes">{ex.notes}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Log workout */}
        <div className="wp-card">
          <h2 className="wp-card-title">Log workout</h2>
          <p className="wp-hint">Record what you did. Stays in this window with your plan and history.</p>
          <form onSubmit={handleSubmitLog} className="wp-log-form">
            <div className="wp-log-row">
              <label>Date</label>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="wp-input"
                required
              />
            </div>
            <div className="wp-log-row">
              <label>Workout</label>
              <input
                type="text"
                list="wp-workout-list"
                value={logWorkoutLabel}
                onChange={(e) => setLogWorkoutLabel(e.target.value)}
                className="wp-input"
                placeholder="e.g. Push, Pull, Cardio"
              />
              <datalist id="wp-workout-list">
                {workoutOptions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>
            <div className="wp-log-row">
              <label>Notes (optional)</label>
              <input
                type="text"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                className="wp-input"
                placeholder="e.g. Felt strong"
              />
            </div>
            <div className="wp-log-row">
              <label>Duration (min, optional)</label>
              <input
                type="number"
                min={1}
                value={logDuration}
                onChange={(e) => setLogDuration(e.target.value)}
                className="wp-input wp-input-narrow"
                placeholder="45"
              />
            </div>
            {logError && <div className="wp-error">{logError}</div>}
            <button type="submit" className="btn-primary" disabled={logSubmitting}>
              {logSubmitting ? 'Saving…' : 'Log workout'}
            </button>
          </form>
        </div>

        {/* Recent activity */}
        <div className="wp-card">
          <h2 className="wp-card-title">Recent activity</h2>
          {logsLoading ? (
            <p className="wp-hint">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="wp-hint">No workouts logged yet. Log one above.</p>
          ) : (
            <div className="wp-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Workout</th>
                    <th>Notes</th>
                    <th>Duration</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id}>
                      <td>{formatDate(log.date)}</td>
                      <td className="wp-td-label">{log.workoutLabel}</td>
                      <td className="wp-td-notes">{log.notes || '—'}</td>
                      <td>{log.durationMinutes != null ? `${log.durationMinutes} min` : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="wp-btn-delete"
                          onClick={() => handleDeleteLog(log._id)}
                          disabled={deletingLogId === log._id}
                          title="Remove"
                        >
                          {deletingLogId === log._id ? '…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
