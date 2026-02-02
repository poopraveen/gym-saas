import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isValid, subDays } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { api, storage, getApiErrorMessage } from '../api/client';
import type {
  CalorieEntry,
  CalorieChatResult,
  CalorieDaySummary,
  CalorieHistoryEntry,
  AiMember,
} from '../api/client';
import Layout from '../components/Layout';
import './NutritionAI.css';

function safeDateStr(s: string | undefined): string {
  if (!s) return '—';
  const d = parseISO(s);
  return isValid(d) ? format(d, 'dd MMM yyyy') : s;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function averageCalories(history: { totalCalories: number }[]): number | null {
  if (!history?.length) return null;
  const sum = history.reduce((s, r) => s + r.totalCalories, 0);
  return Math.round(sum / history.length);
}

export default function NutritionAI() {
  const navigate = useNavigate();
  const role = storage.getRole();
  const isMember = role === 'MEMBER';

  const [me, setMe] = useState<{ createdAt?: string; role: string } | null>(null);
  const [onboardedDate, setOnboardedDate] = useState<string>(() =>
    toDateOnly(subDays(new Date(), 30)),
  );
  const [todayEntry, setTodayEntry] = useState<CalorieEntry | null>(null);
  const [last7Days, setLast7Days] = useState<CalorieDaySummary[]>([]);
  const [history, setHistory] = useState<CalorieHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatDate, setChatDate] = useState<string>(() => toDateOnly(new Date()));
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<CalorieChatResult | null>(null);
  const [chatError, setChatError] = useState('');
  const [addForDateMode, setAddForDateMode] = useState(false);
  /** When editing a day: pre-filled list; user can remove items then Update day or Add more. */
  const [editingCurrentItems, setEditingCurrentItems] = useState<{
    date: string;
    items: { name: string; quantity?: string; estimatedCalories: number }[];
  } | null>(null);
  const [updatingDay, setUpdatingDay] = useState(false);
  /** Date for which "Use default" is in progress (show Filling… and disable button). */
  const [acceptingDefaultDate, setAcceptingDefaultDate] = useState<string | null>(null);
  /** Copy from previous day: source date (from history) and selected missing days to copy to. */
  const [copySourceDate, setCopySourceDate] = useState<string>('');
  const [copyTargetDates, setCopyTargetDates] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);
  /** Staff view: members onboarded for AI, search, and selected member progress */
  const [memberSearch, setMemberSearch] = useState('');
  const [aiMembers, setAiMembers] = useState<AiMember[]>([]);
  const [aiMembersLoading, setAiMembersLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<AiMember | null>(null);
  const [memberProgress, setMemberProgress] = useState<{
    today: CalorieEntry | null;
    last7Days: CalorieDaySummary[];
    history: CalorieHistoryEntry[];
  } | null>(null);
  const [memberProgressLoading, setMemberProgressLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyRefreshInProgressRef = useRef(false);

  const todayStr = toDateOnly(new Date());

  const loadData = async (): Promise<string> => {
    setLoading(true);
    let nextOnboarded = onboardedDate;
    try {
      const [meRes, today, days] = await Promise.all([
        api.auth.getMe(),
        api.calories.getToday(),
        api.calories.getLast7Days(),
      ]);
      setMe(meRes);
      if (meRes?.createdAt) {
        const d = meRes.createdAt.slice(0, 10);
        setOnboardedDate(d);
        nextOnboarded = d;
      } else {
        const d = toDateOnly(subDays(new Date(), 30));
        setOnboardedDate(d);
        nextOnboarded = d;
      }
      setTodayEntry(today || null);
      setLast7Days(days || []);
    } catch {
      setTodayEntry(null);
      setLast7Days([]);
      const d = toDateOnly(subDays(new Date(), 30));
      setOnboardedDate(d);
      nextOnboarded = d;
    } finally {
      setLoading(false);
    }
    return nextOnboarded;
  };

  const loadHistory = async (from?: string, to?: string) => {
    const toDate = to ?? toDateOnly(new Date());
    const fromDate = from ?? onboardedDate;
    try {
      const list = await api.calories.getHistory(fromDate, toDate);
      setHistory(list || []);
    } catch {
      // Don't clear history on error - keep existing table so UI doesn't go blank
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading && onboardedDate && !historyRefreshInProgressRef.current) {
      loadHistory(onboardedDate, toDateOnly(new Date()));
    }
  }, [loading, onboardedDate]);

  const searchMembers = async () => {
    if (isMember) return;
    setAiMembersLoading(true);
    try {
      const list = await api.auth.getAiMembers(memberSearch.trim() || undefined);
      setAiMembers(list || []);
    } catch {
      setAiMembers([]);
    } finally {
      setAiMembersLoading(false);
    }
  };

  useEffect(() => {
    if (!isMember) {
      api.auth.getAiMembers().then((list) => setAiMembers(list || [])).catch(() => setAiMembers([]));
    }
  }, [isMember]);

  const loadMemberProgress = async (member: AiMember) => {
    setSelectedMember(member);
    setMemberProgressLoading(true);
    setMemberProgress(null);
    try {
      const from = member.createdAt
        ? member.createdAt.slice(0, 10)
        : toDateOnly(subDays(new Date(), 30));
      const to = toDateOnly(new Date());
      const [today, last7Days, history] = await Promise.all([
        api.calories.getMemberToday(member.id),
        api.calories.getMemberLast7Days(member.id),
        api.calories.getMemberHistory(member.id, from, to),
      ]);
      setMemberProgress({
        today: today || null,
        last7Days: last7Days || [],
        history: history || [],
      });
    } catch {
      setMemberProgress({ today: null, last7Days: [], history: [] });
    } finally {
      setMemberProgressLoading(false);
    }
  };

  // When on today and todayEntry has items, pre-fill editable list so user can remove or add more
  useEffect(() => {
    if (loading || addForDateMode) return;
    const items = todayEntry?.detailsJson?.items;
    if (!items?.length) return;
    setEditingCurrentItems((prev) => {
      if (prev?.date === todayStr) return prev;
      return { date: todayStr, items: [...items] };
    });
  }, [loading, addForDateMode, todayEntry?.detailsJson?.items, todayStr]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastResult]);

  const missingDays = last7Days.filter((d) => !d.hasEntry);
  const missingCount = missingDays.length;

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || chatSubmitting) return;
    setChatSubmitting(true);
    setChatError('');
    setLastResult(null);
    try {
      const dateToUse = addForDateMode ? chatDate : undefined;
      const existingItems =
        editingCurrentItems &&
        (dateToUse ? editingCurrentItems.date === dateToUse : editingCurrentItems.date === todayStr)
          ? editingCurrentItems.items
          : undefined;
      const result = await api.calories.chat(msg, dateToUse, existingItems);
      setLastResult(result);
      setChatInput('');
      setEditingCurrentItems({ date: result.date, items: result.items });
      if (addForDateMode) setAddForDateMode(false);
      historyRefreshInProgressRef.current = true;
      const nextOnboarded = await loadData();
      await loadHistory(nextOnboarded, toDateOnly(new Date()));
    } catch (err) {
      setChatError(getApiErrorMessage(err));
    } finally {
      setChatSubmitting(false);
      historyRefreshInProgressRef.current = false;
    }
  };

  const handleUpdateDay = async () => {
    if (!editingCurrentItems || updatingDay) return;
    setChatError('');
    setUpdatingDay(true);
    try {
      await api.calories.setEntry(editingCurrentItems.date, editingCurrentItems.items);
      historyRefreshInProgressRef.current = true;
      const nextOnboarded = await loadData();
      await loadHistory(nextOnboarded, toDateOnly(new Date()));
    } catch (err) {
      setChatError(getApiErrorMessage(err));
    } finally {
      setUpdatingDay(false);
      historyRefreshInProgressRef.current = false;
    }
  };

  const removeItemAt = (date: string, index: number) => {
    setEditingCurrentItems((prev) => {
      if (!prev || prev.date !== date) return prev;
      const next = prev.items.filter((_, i) => i !== index);
      return next.length ? { date: prev.date, items: next } : null;
    });
  };

  const handleAcceptDefault = async (date: string) => {
    setAcceptingDefaultDate(date);
    setChatError('');
    try {
      await api.calories.acceptDefault(date);
      historyRefreshInProgressRef.current = true;
      const nextOnboarded = await loadData();
      await loadHistory(nextOnboarded, toDateOnly(new Date()));
    } catch (err) {
      setChatError(getApiErrorMessage(err));
    } finally {
      setAcceptingDefaultDate(null);
      historyRefreshInProgressRef.current = false;
    }
  };

  const toggleCopyTarget = (date: string) => {
    setCopyTargetDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
    );
  };

  const handleCopyToMissing = async () => {
    if (!copySourceDate || copyTargetDates.length === 0 || copying) return;
    const sourceEntry = history.find((r) => r.date === copySourceDate);
    const items = sourceEntry?.detailsJson?.items ?? [];
    if (items.length === 0) return;
    setChatError('');
    setCopying(true);
    historyRefreshInProgressRef.current = true;
    try {
      for (const targetDate of copyTargetDates) {
        await api.calories.setEntry(targetDate, items);
      }
      const nextOnboarded = await loadData();
      const toDate = toDateOnly(new Date());
      const fromDate =
        copyTargetDates.length > 0
          ? copyTargetDates.reduce((min, d) => (d < min ? d : min), nextOnboarded)
          : nextOnboarded;
      await loadHistory(fromDate, toDate);
      setCopySourceDate('');
      setCopyTargetDates([]);
    } catch (err) {
      setChatError(getApiErrorMessage(err));
    } finally {
      setCopying(false);
      historyRefreshInProgressRef.current = false;
    }
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  const handleNavChange = (id: string) => {
    if (id === 'nutrition-ai') return;
    if (id === 'onboarding') {
      navigate('/onboarding');
      return;
    }
    if (id === 'enquiries') {
      navigate('/enquiries');
      return;
    }
    navigate('/');
  };

  return (
    <Layout activeNav="nutrition-ai" onNavChange={handleNavChange} onLogout={handleLogout}>
      <div className="nutrition-ai-page">
        <h1 className="page-title">Nutrition AI</h1>

        {!isMember ? (
          <>
            <p className="nutrition-intro">
              View progress of members onboarded for the AI campaign. Search by name or email, then select a member to see their calorie history one by one.
            </p>
            <section className="nutrition-widget staff-members-widget">
              <h2>Members onboarded for AI</h2>
              <div className="staff-search-row">
                <input
                  type="text"
                  className="staff-search-input"
                  placeholder="Search by name or email..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchMembers()}
                />
                <button type="button" className="btn-primary" onClick={searchMembers} disabled={aiMembersLoading}>
                  {aiMembersLoading ? 'Searching…' : 'Search'}
                </button>
              </div>
              {aiMembers.length === 0 && !aiMembersLoading && (
                <p className="staff-empty">No members found. Onboard members from the Onboarding page.</p>
              )}
              <ul className="staff-member-list">
                {aiMembers.map((m) => (
                  <li key={m.id} className="staff-member-item">
                    <button
                      type="button"
                      className={`staff-member-btn ${selectedMember?.id === m.id ? 'selected' : ''}`}
                      onClick={() => loadMemberProgress(m)}
                      disabled={memberProgressLoading && selectedMember?.id === m.id}
                    >
                      <span className="staff-member-name">{m.name || m.email}</span>
                      {m.email !== m.name && <span className="staff-member-email">{m.email}</span>}
                      {m.linkedRegNo != null && <span className="staff-member-reg">Reg #{m.linkedRegNo}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {selectedMember && (
              <section className="nutrition-widget staff-progress-widget">
                <h2>Progress: {selectedMember.name || selectedMember.email}</h2>
                {memberProgressLoading ? (
                  <div className="nutrition-loading">Loading progress…</div>
                ) : memberProgress ? (
                  <>
                    <div className="today-value-block">
                      <strong>Today</strong>{' '}
                      {memberProgress.today ? (
                        <span>{memberProgress.today.totalCalories} kcal</span>
                      ) : (
                        <span className="today-empty">No entry</span>
                      )}
                      {(() => {
                        const avg = averageCalories(memberProgress.history);
                        return avg != null ? (
                          <div className="today-average">
                            Average entered: <strong>{avg}</strong> kcal
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <div className="last7-block">
                      <strong>Last 7 days</strong>
                      <ul className="last7-list">
                        {memberProgress.last7Days.map((d) => (
                          <li key={d.date}>
                            {safeDateStr(d.date)}: {d.hasEntry ? `${d.totalCalories} kcal` : '—'}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="history-block">
                      <strong>Calorie history</strong>
                      {memberProgress.history.length === 0 ? (
                        <p className="history-empty">No entries yet.</p>
                      ) : (
                        <div className="history-table-wrap">
                          <table className="history-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Total (kcal)</th>
                                <th>Source</th>
                                <th>Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {memberProgress.history.map((row) => (
                                <tr key={row.date}>
                                  <td>{safeDateStr(row.date)}</td>
                                  <td>{row.totalCalories}</td>
                                  <td>
                                    {row.isSystemEstimated ? (
                                      <span className="badge-system">System</span>
                                    ) : (
                                      <span className="badge-user">You</span>
                                    )}
                                  </td>
                                  <td>
                                    {row.detailsJson?.items?.length
                                      ? row.detailsJson.items.map((i) => i.name).join(', ')
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </section>
            )}
          </>
        ) : (
          <>
        <p className="nutrition-intro">
          Track calories with AI. Describe what you ate and get instant estimates (Indian diet–friendly).
          Data shown from your onboarded date.
        </p>

        {/* Today's calories widget */}
        <section className="nutrition-widget today-widget">
          <h2>Today&apos;s calories</h2>
          {loading ? (
            <div className="nutrition-loading">Loading…</div>
          ) : todayEntry ? (
            <div className="today-value">
              <span className="today-number">{todayEntry.totalCalories}</span>
              <span className="today-unit">kcal</span>
              {todayEntry.source === 'system' && (
                <span className="today-badge">System-estimated</span>
              )}
            </div>
          ) : (
            <div className="today-empty">No entry yet. Add what you ate below.</div>
          )}
          {!loading && (() => {
            const avg = averageCalories(history);
            return avg != null ? (
              <div className="today-average">
                Average entered: <strong>{avg}</strong> kcal
              </div>
            ) : null;
          })()}
        </section>

        {/* Missing days alert */}
        {missingCount > 0 && (
          <section className="nutrition-widget missing-widget">
            <h2>Missing calorie input</h2>
            <p className="missing-desc">
              You missed calorie input for <strong>{missingCount}</strong> day{missingCount !== 1 ? 's' : ''}. Tap to fill with default or add food below.
            </p>
            <ul className="missing-list">
              {missingDays.slice(0, 7).map((d) => (
                <li key={d.date} className="missing-item">
                  <span>{safeDateStr(d.date)}</span>
                  <div className="missing-actions">
                    <button
                      type="button"
                      className="btn-sm btn-fill"
                      onClick={() => handleAcceptDefault(d.date)}
                      disabled={acceptingDefaultDate === d.date}
                    >
                      {acceptingDefaultDate === d.date ? 'Filling…' : 'Use default'}
                    </button>
                    <button
                      type="button"
                      className="btn-sm btn-add-date"
                      onClick={() => {
                        setChatDate(d.date);
                        setAddForDateMode(true);
                      }}
                    >
                      Add food
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {history.some((h) => h.detailsJson?.items?.length) && (
              <div className="copy-from-day">
                <h3 className="copy-from-title">Or copy from an existing day</h3>
                <p className="copy-from-desc">Select a day that has entries, then choose which missing days to fill with the same entry.</p>
                <div className="copy-from-row">
                  <label>Copy from</label>
                  <select
                    value={copySourceDate}
                    onChange={(e) => setCopySourceDate(e.target.value)}
                    className="copy-from-select"
                  >
                    <option value="">— Select day —</option>
                    {history
                      .filter((h) => h.detailsJson?.items?.length)
                      .map((h) => (
                        <option key={h.date} value={h.date}>
                          {safeDateStr(h.date)} ({h.totalCalories} kcal)
                        </option>
                      ))}
                  </select>
                </div>
                <div className="copy-targets">
                  <span className="copy-targets-label">Apply to:</span>
                  {missingDays.slice(0, 7).map((d) => (
                    <label key={d.date} className="copy-target-check">
                      <input
                        type="checkbox"
                        checked={copyTargetDates.includes(d.date)}
                        onChange={() => toggleCopyTarget(d.date)}
                      />
                      {safeDateStr(d.date)}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-primary btn-copy-to-missing"
                  onClick={handleCopyToMissing}
                  disabled={!copySourceDate || copyTargetDates.length === 0 || copying}
                >
                  {copying ? 'Copying…' : `Copy to ${copyTargetDates.length} selected`}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Chat: What did you eat? (today or for a date) */}
        <section className="nutrition-widget chat-widget">
          <h2>{addForDateMode ? 'Add food for a missed day' : 'What did you eat?'}</h2>
          {addForDateMode && (
            <div className="chat-date-row">
              <label>Date</label>
              <input
                type="date"
                value={chatDate}
                onChange={(e) => {
                  const d = e.target.value;
                  setChatDate(d);
                  if (d === todayStr && todayEntry?.detailsJson?.items?.length) {
                    setEditingCurrentItems({ date: d, items: [...todayEntry.detailsJson!.items!] });
                  } else {
                    const fromHistory = history.find((r) => r.date === d);
                    setEditingCurrentItems(
                      fromHistory?.detailsJson?.items?.length
                        ? { date: d, items: [...fromHistory.detailsJson!.items!] }
                        : null,
                    );
                  }
                }}
                max={todayStr}
              />
              <button
                type="button"
                className="btn-sm btn-link"
                onClick={() => {
                  setAddForDateMode(false);
                  setEditingCurrentItems(null);
                }}
              >
                Back to today
              </button>
            </div>
          )}
          {editingCurrentItems &&
            ((addForDateMode && editingCurrentItems.date === chatDate) ||
              (!addForDateMode && editingCurrentItems.date === todayStr)) &&
            editingCurrentItems.items.length > 0 && (
              <div className="chat-existing-day chat-editable-day">
                <strong>
                  {editingCurrentItems.date === todayStr ? 'Today' : 'This day'} (
                  {editingCurrentItems.items.reduce((s, i) => s + (i.estimatedCalories || 0), 0)} kcal)
                </strong>
                <ul>
                  {editingCurrentItems.items.map((item, i) => (
                    <li key={i} className="editable-item">
                      <span>
                        {item.name}
                        {item.quantity ? ` (${item.quantity})` : ''}: {item.estimatedCalories} kcal
                      </span>
                      <button
                        type="button"
                        className="btn-sm btn-remove-item"
                        onClick={() => removeItemAt(editingCurrentItems.date, i)}
                        title="Remove"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="chat-desc">
                  Remove any item above if added by mistake, then tap &quot;Update day&quot; to save. Or add more food below.
                </p>
                <button
                  type="button"
                  className="btn-primary btn-update-day"
                  onClick={handleUpdateDay}
                  disabled={updatingDay}
                >
                  {updatingDay ? 'Saving…' : 'Update day'}
                </button>
              </div>
            )}
          {(!editingCurrentItems || editingCurrentItems.items.length === 0) && (
            <p className="chat-desc">E.g. &quot;2 idlis, sambar, 1 cup coffee&quot;</p>
          )}
          <form onSubmit={handleChatSubmit} className="chat-form">
            <input
              type="text"
              className="chat-input"
              placeholder={addForDateMode ? 'Describe what you ate on that day...' : 'Describe your meal...'}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatSubmitting}
            />
            <button type="submit" className="btn-primary" disabled={chatSubmitting || !chatInput.trim()}>
              {chatSubmitting ? 'Adding…' : 'Add'}
            </button>
          </form>
          {!addForDateMode && (
            <button
              type="button"
              className="btn-sm btn-outline-date"
              onClick={() => setAddForDateMode(true)}
            >
              Add food for a past day
            </button>
          )}
          {chatError && <div className="chat-error">{chatError}</div>}
          {lastResult && (
            <div className="chat-result">
              <div className="chat-result-header">✓ Added for {safeDateStr(lastResult.date)}</div>
              <div className="chat-result-total">
                {lastResult.totalCalories} kcal total
              </div>
              {lastResult.items?.length > 0 && (
                <ul className="chat-result-items">
                  {lastResult.items.map((item, i) => (
                    <li key={i}>
                      {item.name}
                      {item.quantity ? ` (${item.quantity})` : ''}: {item.estimatedCalories} kcal
                    </li>
                  ))}
                </ul>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        {/* History table + roadmap (from onboarded date) */}
        <section className="nutrition-widget history-widget">
          <h2>Your calorie history</h2>
          <p className="section-desc">
            From {safeDateStr(onboardedDate)} to today. Add missed days above, then they appear here.
          </p>
          {history.length === 0 ? (
            <div className="history-empty">No entries yet in this range.</div>
          ) : (
            <>
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Total (kcal)</th>
                      <th>Source</th>
                      <th>Details</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.date}>
                        <td>{safeDateStr(row.date)}</td>
                        <td>{row.totalCalories}</td>
                        <td>
                          {row.isSystemEstimated ? (
                            <span className="badge-system">System</span>
                          ) : (
                            <span className="badge-user">You</span>
                          )}
                        </td>
                        <td>
                          {row.detailsJson?.items?.length
                            ? row.detailsJson.items.map((i, idx) => i.name).join(', ')
                            : '—'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-sm btn-edit-day"
                            onClick={() => {
                              setChatDate(row.date);
                              setAddForDateMode(true);
                              setEditingCurrentItems({
                                date: row.date,
                                items: [...(row.detailsJson?.items ?? [])],
                              });
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="roadmap-title">Roadmap (daily kcal)</h3>
              <div className="roadmap-chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={[...history]
                      .reverse()
                      .slice(-60)
                      .map((row) => ({
                        date: row.date,
                        dateLabel: format(parseISO(row.date), 'dd MMM'),
                        kcal: row.totalCalories,
                      }))}
                    margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                      tickLine={{ stroke: 'var(--border)' }}
                      axisLine={{ stroke: 'var(--border)' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      dataKey="kcal"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                      tickLine={{ stroke: 'var(--border)' }}
                      axisLine={{ stroke: 'var(--border)' }}
                      label={{ value: 'kcal', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 11 }}
                      domain={(_dataMin: number, dataMax: number) => [0, Math.ceil(Math.max((dataMax || 0) * 1.15, 2400))]}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      labelStyle={{ color: 'var(--text-primary)' }}
                      formatter={(value: number) => [`${value} kcal`, 'Calories']}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.date ? safeDateStr(payload[0].payload.date) : ''
                      }
                    />
                    <ReferenceLine
                      y={2000}
                      stroke="var(--pill-soon)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.8}
                    />
                    <Bar
                      dataKey="kcal"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </section>
          </>
        )}
      </div>
    </Layout>
  );
}
