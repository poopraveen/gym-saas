import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays, isValid } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { api, storage } from '../api/client';
import { downloadMonthlyReportPDF } from '../utils/downloadMonthlyReport';
import Layout from '../components/Layout';
import AddMemberModal from '../components/AddMemberModal';
import FollowUpModal from '../components/FollowUpModal';
import PayFeesModal from '../components/PayFeesModal';
import WhatsAppButton from '../components/WhatsAppButton';
import { CardSkeleton, ListSkeleton, ChartSkeleton } from '../components/LoadingSkeleton';
import { QRCodeSVG } from 'qrcode.react';
import './Dashboard.css';

type Member = Record<string, unknown>;
type StatusType = 'expired' | 'soon' | 'valid' | 'new';

function safeFormat(d: Date | string | null | undefined, fmt: string): string {
  const dt = d ? new Date(d as string | number) : null;
  return dt && isValid(dt) ? format(dt, fmt) : '—';
}

function getStatus(dueDate: Date | null, joinDate: Date | null): StatusType {
  if (!dueDate) return 'new';
  const daysDiff = differenceInDays(dueDate, new Date());
  if (daysDiff < 0) return 'expired';
  if (daysDiff <= 5) return 'soon'; /* soon = due within 5 days only; more than 5 days = valid */
  const daysSinceJoin = joinDate ? differenceInDays(new Date(), joinDate) : 999;
  return daysSinceJoin <= 30 ? 'new' : 'valid';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [checkinTable, setCheckinTable] = useState<Member[]>([]);
  const [finance, setFinance] = useState<{
    monthlyFees: number;
    overallFees: number;
    totalMembers: number;
    activeMembers: number;
    pendingFees: number;
    monthlyGrowth?: { month: string; count: number; cumulative: number }[];
    monthlyCollections?: { month: string; monthKey: string; amount: number; count: number }[];
  } | null>(null);
  const [followUps, setFollowUps] = useState<Record<string, { comment: string; nextFollowUpDate?: string; createdAt: string }>>({});
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regNoInput, setRegNoInput] = useState('');
  const [activeNav, setActiveNav] = useState<'dashboard' | 'main' | 'add' | 'checkin' | 'finance'>('main');
  const [filter, setFilter] = useState<'all' | 'men' | 'women'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'expired' | 'soon' | 'valid' | 'new'>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(10);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState<Member | null>(null);
  const [showPayFeesModal, setShowPayFeesModal] = useState<Member | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [followUpHistory, setFollowUpHistory] = useState<Array<{ comment: string; nextFollowUpDate?: string; createdAt: string }>>([]);
  const [qrPayload, setQrPayload] = useState<{ url: string; token: string } | null>(null);
  const [showRenewalsDueModal, setShowRenewalsDueModal] = useState(false);

  const loadList = async () => {
    try {
      setError(null);
      const data = (await api.legacy.list()) as Member[];
      const processed = data.map((row) => {
        const dueRaw = row['DUE DATE'] ? new Date(row['DUE DATE'] as number) : null;
        const joinRaw = row['Date of Joining'] ? new Date(row['Date of Joining'] as string | number) : null;
        const due = dueRaw && isValid(dueRaw) ? dueRaw : null;
        const join = joinRaw && isValid(joinRaw) ? joinRaw : null;
        const status = getStatus(due, join);
        const memberId = (row as Record<string, unknown>).memberId as string || `GYM-${new Date().getFullYear()}-${String(row['Reg No:']).padStart(5, '0')}`;
        return { ...row, status, dueDate: due, joinDate: join, memberId };
      });
      setAllMembers(processed);
      const ids = processed.map((m) => (m as Record<string, unknown>).memberId as string).filter(Boolean);
      if (ids.length > 0) {
        try {
          const batch = await api.followUps.getBatch(ids);
          setFollowUps(batch);
        } catch {
          setFollowUps({});
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const statusOrder = { expired: 0, soon: 1, valid: 2, new: 3 };

  const listForCounts =
    filter === 'men'
      ? allMembers.filter((r) => (r.Gender as string) === 'Male')
      : filter === 'women'
      ? allMembers.filter((r) => (r.Gender as string) === 'Female')
      : allMembers;

  const statusCounts = {
    all: listForCounts.length,
    expired: listForCounts.filter((r) => (r.status as StatusType) === 'expired').length,
    soon: listForCounts.filter((r) => (r.status as StatusType) === 'soon').length,
    valid: listForCounts.filter((r) => (r.status as StatusType) === 'valid').length,
    new: listForCounts.filter((r) => (r.status as StatusType) === 'new').length,
  };

  const filteredMembers = (() => {
    let list = listForCounts;
    if (statusFilter !== 'all') {
      list = list.filter((r) => (r.status as StatusType) === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.NAME as string)?.toLowerCase().includes(q) ||
          String(r['Phone Number'] || '').includes(q) ||
          String(r['Reg No:'] || '').includes(q) ||
          ((r as Record<string, unknown>).memberId as string)?.toLowerCase().includes(q),
      );
    }
    if (sortBy !== 'default') {
      list = [...list].sort((a, b) => {
        const statusA = a.status as StatusType;
        const statusB = b.status as StatusType;
        if (sortBy === 'expired') return (statusOrder[statusA] ?? 4) - (statusOrder[statusB] ?? 4);
        if (sortBy === 'valid') return (statusOrder[statusB] ?? 4) - (statusOrder[statusA] ?? 4);
        const orderA = statusA === sortBy ? 0 : 1;
        const orderB = statusB === sortBy ? 0 : 1;
        return orderA - orderB;
      });
    }
    return list;
  })();

  const totalMembersCount = filteredMembers.length;
  const totalPages = Math.max(1, Math.ceil(totalMembersCount / membersPageSize));

  const inactive7Count = allMembers.filter((m) => {
    const last = m.lastCheckInTime as string | undefined;
    if (!last || !String(last).trim()) return true;
    const d = new Date(String(last));
    if (isNaN(d.getTime())) return true;
    const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return days > 7;
  }).length;
  const renewalsDue3Members = allMembers.filter((m) => {
    const due = m.dueDate as Date | undefined;
    if (!due) return false;
    const d = new Date(due);
    const days = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 3;
  });
  const renewalsDue3Count = renewalsDue3Members.length;
  const todayAttendanceCount = checkinTable.length;
  const effectivePage = Math.min(membersPage, totalPages) || 1;
  const paginatedMembers = filteredMembers.slice(
    (effectivePage - 1) * membersPageSize,
    effectivePage * membersPageSize,
  );

  useEffect(() => {
    setMembersPage(1);
  }, [filter, statusFilter, sortBy, searchQuery]);

  const loadFinance = async () => {
    if (activeNav === 'dashboard') setDashboardLoading(true);
    try {
      const data = await api.legacy.finance();
      setFinance(data);
    } catch {
      setFinance({
        monthlyFees: 0,
        overallFees: 0,
        totalMembers: 0,
        activeMembers: 0,
        pendingFees: 0,
        monthlyGrowth: [],
        monthlyCollections: [],
      });
    } finally {
      if (activeNav === 'dashboard') setDashboardLoading(false);
    }
  };

  const loadCheckIn = async () => {
    try {
      const data = (await api.legacy.checkInList()) as Member[];
      const today = new Date().toLocaleDateString();
      const filtered = data
        .filter((r) => r.lastCheckInTime && String(r.lastCheckInTime).split(',')[0] === today)
        .sort((a, b) => new Date(b.lastCheckInTime as string).getTime() - new Date(a.lastCheckInTime as string).getTime());
      setCheckinTable(filtered);
    } catch {}
  };

  const loadFollowUpHistory = async (memberId: string) => {
    try {
      const list = await api.followUps.getByMember(memberId) as Array<{ comment: string; nextFollowUpDate?: string; createdAt: string }>;
      setFollowUpHistory(list || []);
    } catch {
      setFollowUpHistory([]);
    }
  };

  const nextRegNo = Math.max(0, ...allMembers.map((r) => Number(r['Reg No:']) || 0)) + 1;

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (activeNav === 'checkin') {
      loadCheckIn();
      api.attendance.qrPayload().then((p) => setQrPayload(p)).catch(() => setQrPayload(null));
    }
    if (activeNav === 'finance') {
      setDashboardLoading(false);
      loadFinance();
    }
    if (activeNav === 'dashboard') loadFinance();
  }, [activeNav]);

  useEffect(() => {
    if (expandedMember) loadFollowUpHistory(expandedMember);
  }, [expandedMember]);

  const peopleViewRef = useRef<HTMLDivElement>(null);
  const memberDetailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedMember && window.innerWidth < 900) {
      setTimeout(() => {
        memberDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [selectedMember]);

  useEffect(() => {
    if (membersPage > totalPages && totalPages >= 1) setMembersPage(totalPages);
  }, [totalPages, membersPage]);

  const handleCheckIn = async () => {
    const regNo = parseInt(regNoInput, 10);
    if (isNaN(regNo)) return;
    try {
      await api.legacy.checkIn({ 'Reg No:': regNo });
      setRegNoInput('');
      loadList();
      loadCheckIn();
    } catch (err) {
      alert('Check-in failed: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  const handleAddMember = async (data: Record<string, unknown>) => {
    await api.legacy.upsert(data, false);
    loadList();
    loadFinance();
  };

  const handlePayFees = async (data: Record<string, unknown>) => {
    await api.legacy.upsert(data, false);
    loadList();
    loadFinance();
  };

  const handleWhatsAppClick = (member: Member) => {
    setShowFollowUpModal(member);
  };

  const handleSaveFollowUp = async (comment: string, nextFollowUpDate?: string) => {
    if (!showFollowUpModal) return;
    const memberId = (showFollowUpModal as Record<string, unknown>).memberId as string;
    const regNo = Number(showFollowUpModal['Reg No:']) || 0;
    await api.followUps.create({ memberId, regNo, comment, nextFollowUpDate });
    setShowFollowUpModal(null);
    loadList();
    if (expandedMember === memberId) loadFollowUpHistory(memberId);
  };

  const handleLogout = () => {
    storage.clear();
    navigate('/login');
  };

  const handleNavChange = (id: string) => {
    if (id === 'enquiries') {
      navigate('/enquiries');
      return;
    }
    if (id === 'onboarding') {
      navigate('/onboarding');
      return;
    }
    if (id === 'nutrition-ai') {
      navigate('/nutrition-ai');
      return;
    }
    if (id === 'telegram') {
      navigate('/telegram');
      return;
    }
    if (id === 'add') {
      setActiveNav('add');
      setShowAddModal(true);
    } else {
      setActiveNav(id as 'dashboard' | 'main' | 'checkin' | 'finance');
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setActiveNav('main');
  };

  const feesChartData = finance
    ? [
        { name: 'Fees Paid', value: finance.overallFees, fill: 'var(--primary)' },
        { name: 'Pending', value: finance.pendingFees, fill: 'var(--pill-soon)' },
      ]
    : [];

  return (
    <Layout activeNav={activeNav} onNavChange={handleNavChange} onLogout={handleLogout}>
      {showAddModal && (
        <AddMemberModal onClose={closeAddModal} onSubmit={handleAddMember} nextRegNo={nextRegNo} />
      )}
      {showPayFeesModal && (
        <PayFeesModal
          member={showPayFeesModal}
          onClose={() => setShowPayFeesModal(null)}
          onSave={handlePayFees}
        />
      )}
      {showFollowUpModal && (
        <FollowUpModal
          memberId={(showFollowUpModal as Record<string, unknown>).memberId as string}
          regNo={Number(showFollowUpModal['Reg No:']) || 0}
          memberName={(showFollowUpModal.NAME as string) || '—'}
          onClose={() => setShowFollowUpModal(null)}
          onSave={handleSaveFollowUp}
        />
      )}

      {showRenewalsDueModal && (
        <div className="renewals-modal-overlay" onClick={() => setShowRenewalsDueModal(false)} role="dialog" aria-modal="true" aria-labelledby="renewals-modal-title">
          <div className="renewals-modal" onClick={(e) => e.stopPropagation()}>
            <div className="renewals-modal-header">
              <h2 id="renewals-modal-title">Renewals due in 3 days</h2>
              <button type="button" className="renewals-modal-close" onClick={() => setShowRenewalsDueModal(false)} aria-label="Close">×</button>
            </div>
            <div className="renewals-modal-body">
              <p className="renewals-modal-hint">Members whose due date is within the next 3 days. Use WhatsApp to follow up.</p>
              <div className="renewals-table-wrap">
                <table className="renewals-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Due date</th>
                      <th>Follow up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewalsDue3Members.map((m) => (
                      <tr key={String((m as Record<string, unknown>).memberId ?? m['Reg No:'])}>
                        <td className="renewals-td-name">{String(m.NAME ?? '—')}</td>
                        <td className="renewals-td-phone">{String(m['Phone Number'] ?? '—')}</td>
                        <td>{safeFormat(m.dueDate as Date, 'MMM d, yyyy')}</td>
                        <td className="renewals-td-action">
                          <WhatsAppButton
                            phone={String(m['Phone Number'] ?? '')}
                            onClick={() => { setShowRenewalsDueModal(false); handleWhatsAppClick(m); }}
                          />
                          <button
                            type="button"
                            className="btn-sm renewals-followup-btn"
                            onClick={() => { setShowRenewalsDueModal(false); handleWhatsAppClick(m); }}
                          >
                            Follow up
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeNav === 'dashboard' && (
        <div className="people-view dashboard-view dashboard-fit">
          <h1 className="page-title">Dashboard</h1>
          {dashboardLoading ? (
            <div className="dashboard-cards dashboard-cards-grid">
              {[1, 2, 3, 4].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="dashboard-cards dashboard-cards-grid">
              <div className="dash-card dash-card-1 dash-card-clickable" onClick={() => handleNavChange('add')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleNavChange('add')}>
                <span className="dc-label">Register members</span>
                <span className="dc-value">{(finance?.totalMembers ?? allMembers.length ?? 0).toLocaleString()}</span>
                <span className="dc-action">Add member →</span>
              </div>
              <div className="dash-card dash-card-2">
                <span className="dc-label">Today attendance vs active</span>
                <span className="dc-value dc-value-split">{todayAttendanceCount} <span className="dc-sep">/</span> {(finance?.activeMembers ?? 0).toLocaleString()}</span>
                <span className="dc-sub">Check-ins today / Active members</span>
              </div>
              <div className="dash-card dash-card-3">
                <span className="dc-label">Inactive &gt;7 days</span>
                <span className="dc-value">{inactive7Count.toLocaleString()}</span>
                <span className="dc-sub">No check-in in last 7 days</span>
              </div>
              <div
                className="dash-card dash-card-4 dash-card-clickable"
                onClick={() => setShowRenewalsDueModal(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setShowRenewalsDueModal(true)}
              >
                <span className="dc-label">Renewals due in 3 days</span>
                <span className="dc-value">{renewalsDue3Count.toLocaleString()}</span>
                <span className="dc-sub">Due within 3 days</span>
                <span className="dc-action">View list →</span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeNav === 'finance' && (
        <div className="people-view">
          <h1 className="page-title">Finance</h1>
          <div className="finance-cards">
            <div className="finance-card finance-card-1">
              <span className="fc-label">This Month</span>
              <span className="fc-value">₹{(finance?.monthlyFees ?? 0).toLocaleString()}</span>
            </div>
            <div className="finance-card finance-card-2">
              <span className="fc-label">Overall</span>
              <span className="fc-value">₹{(finance?.overallFees ?? 0).toLocaleString()}</span>
            </div>
            <div className="finance-card finance-card-3">
              <span className="fc-label">Total Members</span>
              <span className="fc-value">{(finance?.totalMembers ?? 0)}</span>
            </div>
          </div>
          <div className="monthly-collections-section">
            <div className="mc-header">
              <div>
                <h3>Monthly Collection Details</h3>
                <p className="mc-subtitle">Fees collected per month (based on member join date)</p>
              </div>
              {finance?.monthlyCollections && finance.monthlyCollections.length > 0 && (
                <button
                  className="btn-pdf"
                  onClick={() =>
                    downloadMonthlyReportPDF(finance.monthlyCollections!, {
                      totalMembers: finance?.totalMembers,
                      overallFees: finance?.overallFees,
                      monthlyFees: finance?.monthlyFees,
                    })
                  }
                  type="button"
                >
                  📥 Download PDF
                </button>
              )}
            </div>
            {finance?.monthlyCollections && finance.monthlyCollections.length > 0 ? (
              <>
                <div className="mc-chart">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={finance.monthlyCollections} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}
                        formatter={(v: number) => [`₹${Number(v).toLocaleString()}`, 'Collection']}
                        labelFormatter={(l) => l}
                      />
                      <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mc-table-wrapper">
                  <table className="mc-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>New Members</th>
                        <th>Collection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finance.monthlyCollections.map((row) => (
                        <tr key={row.monthKey}>
                          <td>{row.month}</td>
                          <td>{row.count}</td>
                          <td>₹{row.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty-state">No monthly collection data yet</div>
            )}
          </div>
        </div>
      )}

      {activeNav === 'checkin' && (
        <div className="people-view">
          <h1 className="page-title">Attendance</h1>
          <div className="checkin-section">
            <div className="checkin-row">
              <input
                placeholder="Registration ID"
                value={regNoInput}
                onChange={(e) => setRegNoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCheckIn()}
              />
              <button onClick={handleCheckIn} className="btn-primary">
                Check In
              </button>
            </div>
            {qrPayload && (
              <div className="checkin-qr-wrap">
                <p className="checkin-qr-label">Members can scan to check in (valid 24h)</p>
                <div className="checkin-qr-box">
                  <QRCodeSVG
                    value={qrPayload.url.startsWith('http') ? qrPayload.url : `${window.location.origin}${qrPayload.url}`}
                    size={180}
                    level="M"
                    includeMargin
                  />
                </div>
              </div>
            )}
            <div className="chips">
              {checkinTable.length === 0 ? (
                <div className="empty-state">No check-ins today</div>
              ) : (
                checkinTable.map((row) => (
                  <span key={String(row['Reg No:'])} className="chip">
                    #{row['Reg No:']} {row.NAME}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeNav === 'main' && (
        <div ref={peopleViewRef} className="people-view people-view-sticky">
          <div className="people-sticky-top">
            <div className="people-header">
              <h1 className="page-title">People</h1>
              <div className="people-actions">
                <button onClick={() => handleNavChange('add')} className="btn-add" aria-label="Add member" data-tour="people-add-member">
                  +
                </button>
              </div>
            </div>
            <div className="search-and-status-row">
              <div className="search-row" data-tour="people-search-wrap">
                <input
                  type="search"
                  placeholder="Search by name, phone, Reg No, Member ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                  data-tour="people-search"
                />
              </div>
              <div className="status-filter-pills" data-tour="people-filter-status">
                {(['all', 'expired', 'soon', 'valid', 'new'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`status-pill status-pill-${s} ${statusFilter === s ? 'active' : ''}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    <span className="status-pill-label">
                      {s === 'all' ? 'All' : s === 'expired' ? 'Expired' : s === 'soon' ? 'Soon' : s === 'valid' ? 'Valid' : 'New'}
                    </span>
                    <span className="status-pill-count">{statusCounts[s]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-row">
              <div className="filter-tabs" data-tour="people-filter-gender">
                {(['all', 'men', 'women'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`filter-tab ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'men' ? 'Men' : 'Women'}
                  </button>
                ))}
              </div>
              <div className="filter-row-right">
              <div className="sort-by-wrap" data-tour="people-sort">
                <label htmlFor="sort-status">Sort by status:</label>
                <select
                  id="sort-status"
                  className="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                >
                  <option value="default">Default</option>
                  <option value="expired">Expired first</option>
                  <option value="soon">Soon expires first</option>
                  <option value="valid">Valid first</option>
                  <option value="new">New first</option>
                </select>
              </div>
              {(filter !== 'all' || statusFilter !== 'all' || sortBy !== 'default' || searchQuery.trim()) && (
                <button type="button" className="btn-clear-all" onClick={() => { setFilter('all'); setStatusFilter('all'); setSortBy('default'); setSearchQuery(''); }}>
                  Clear all
                </button>
              )}
            </div>
            </div>
            {error && <div className="error-banner">{error}</div>}
          </div>
          {loading ? (
            <div className="people-list-scroll">
              <ListSkeleton rows={6} />
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="people-list-scroll" data-tour="people-list">
              <div className="empty-state large">
                {statusFilter !== 'all' || filter !== 'all' || searchQuery.trim()
                  ? 'No members match your filters'
                  : 'No members yet. Add your first member!'}
              </div>
            </div>
          ) : (
            <>
            <div className={`people-layout ${selectedMember ? 'has-detail' : ''}`}>
              <div className="people-list" data-tour="people-list">
                <div className="people-list-header">
                  <span></span>
                  <span>Member</span>
                  <span>Phone</span>
                  <span>Subscription</span>
                  <span>Status</span>
                  <span></span>
                  <span></span>
                </div>
                <div className="people-list-body-scroll">
                  <div className="people-list-body">
                {paginatedMembers.map((row, rowIndex) => {
                  const mid = (row as Record<string, unknown>).memberId as string;
                  const fu = followUps[mid];
                  const isExpanded = expandedMember === mid;
                  return (
                    <div key={String(row['Reg No:'])} className="people-item-wrapper" data-tour={rowIndex === 0 ? 'people-first-row' : undefined}>
                      <div
                        className={`people-item ${selectedMember?.['Reg No:'] === row['Reg No:'] ? 'selected' : ''}`}
                        onClick={() => setSelectedMember(row)}
                      >
                        <div className="pi-avatar">
                          {row['Reg No:'] != null && String(row['Reg No:']).trim() !== ''
                            ? String(row['Reg No:']).padStart(3, '0').slice(-3)
                            : '?'}
                        </div>
                        <div className="pi-info">
                          <span className="pi-name">{row.NAME || '—'}</span>
                          <span className="pi-gymid">{mid || '—'}</span>
                          {fu && (
                            <span className="pi-followup">
                              Last: {safeFormat(fu.createdAt, 'MMM d')} — {fu.comment.slice(0, 35)}
                              {fu.comment.length > 35 ? '...' : ''}
                            </span>
                          )}
                        </div>
                        <div className="pi-phone">
                          {(row['Phone Number'] as string) || '—'}
                          {(row['Phone Number'] as string) && (
                            <WhatsAppButton
                              phone={row['Phone Number'] as string}
                              onClick={() => handleWhatsAppClick(row)}
                            />
                          )}
                        </div>
                        <span className="pi-dates">
                          {(() => {
                            const j = safeFormat(row.joinDate as Date, 'MMM d');
                            const d = safeFormat(row.dueDate as Date, 'MMM d');
                            return j !== '—' || d !== '—' ? `${j} – ${d}` : '—';
                          })()}
                        </span>
                        <span className={`pill pill-${row.status}`}>
                          {row.status === 'expired'
                            ? 'Expired'
                            : row.status === 'soon'
                            ? 'Soon'
                            : row.status === 'new'
                            ? 'New'
                            : 'Valid'}
                        </span>
                        <button
                          type="button"
                          className="pi-pay-btn"
                          onClick={(e) => { e.stopPropagation(); setShowPayFeesModal(row); setSelectedMember(row); }}
                          title="Pay fees"
                        >
                          ₹
                        </button>
                        <button
                          className="expand-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedMember(isExpanded ? null : mid);
                          }}
                          aria-label="Toggle history"
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="follow-up-history">
                          <h5>Follow-up History</h5>
                          {followUpHistory.length === 0 ? (
                            <p className="empty-text">No follow-ups yet</p>
                          ) : (
                            followUpHistory.map((item, i) => (
                              <div key={i} className="history-item">
                                <span className="hi-date">{safeFormat(item.createdAt, 'MMM d, yyyy')}</span>
                                {item.nextFollowUpDate && (
                                  <span className="hi-next">
                                    Next: {safeFormat(item.nextFollowUpDate, 'MMM d')}
                                  </span>
                                )}
                                <p>{item.comment}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                  </div>
                </div>
              </div>
              {selectedMember && (
                <aside ref={memberDetailRef} className="member-detail">
                  <div className="md-avatar">
                    {selectedMember['Reg No:'] != null && String(selectedMember['Reg No:']).trim() !== ''
                      ? String(selectedMember['Reg No:']).padStart(3, '0').slice(-3)
                      : '?'}
                  </div>
                  <h3>{selectedMember.NAME}</h3>
                  <p className="md-meta">
                    Member ID:{(selectedMember as Record<string, unknown>).memberId ||
                      `GYM-${new Date().getFullYear()}-${String(selectedMember['Reg No:']).padStart(5, '0')}`}
                  </p>
                  <p className="md-meta">
                    Client since {safeFormat(selectedMember.joinDate as Date, 'MMM yyyy')}
                  </p>
                  <div className="md-section">
                    <h4>Contact</h4>
                    <p className="md-phone-row">
                      {(selectedMember['Phone Number'] as string) || '—'}
                      {(selectedMember['Phone Number'] as string) && (
                        <WhatsAppButton
                          phone={selectedMember['Phone Number'] as string}
                          onClick={() => handleWhatsAppClick(selectedMember)}
                        />
                      )}
                    </p>
                  </div>
                  <div className="md-section">
                    <h4>Subscription</h4>
                    <p>
                      {selectedMember.joinDate || selectedMember.dueDate
                        ? `${safeFormat(selectedMember.joinDate as Date, 'MMM d, yyyy')} – ${safeFormat(selectedMember.dueDate as Date, 'MMM d, yyyy')}`
                        : '—'}
                    </p>
                    <span className={`pill pill-${selectedMember.status}`}>
                      {selectedMember.status === 'expired'
                        ? 'Expired'
                        : selectedMember.status === 'soon'
                        ? 'Soon expires'
                        : selectedMember.status === 'new'
                        ? 'New'
                        : 'Valid'}
                    </span>
                    <button
                      type="button"
                      className="btn-pay-fees"
                      onClick={(e) => { e.stopPropagation(); setShowPayFeesModal(selectedMember); }}
                    >
                      Pay fees
                    </button>
                  </div>
                  {followUps[(selectedMember as Record<string, unknown>).memberId as string] && (
                    <div className="md-section">
                      <h4>Last Follow-up</h4>
                      <p>
                        {
                          followUps[(selectedMember as Record<string, unknown>).memberId as string]
                            .comment
                        }
                      </p>
                    </div>
                  )}
                </aside>
              )}
            </div>
            <div className="pagination-bar">
              <div className="pagination-info">
                Showing {(effectivePage - 1) * membersPageSize + 1}–{Math.min(effectivePage * membersPageSize, totalMembersCount)} of {totalMembersCount}
              </div>
              <div className="pagination-controls">
                <label className="pagination-page-size">
                  <span>Per page</span>
                  <select
                    value={membersPageSize}
                    onChange={(e) => { setMembersPageSize(Number(e.target.value)); setMembersPage(1); }}
                    className="pagination-select"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={effectivePage <= 1}
                  onClick={() => setMembersPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span className="pagination-page-nums">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - effectivePage) <= 1)
                    .reduce<number[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push(-1);
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === -1 ? (
                        <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          className={`pagination-btn pagination-num ${p === effectivePage ? 'active' : ''}`}
                          onClick={() => setMembersPage(p)}
                        >
                          {p}
                        </button>
                      ),
                    )}
                </span>
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={effectivePage >= totalPages}
                  onClick={() => setMembersPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          </>
          )}
        </div>
      )}
    </Layout>
  );
}
