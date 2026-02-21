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
import { api, storage, getApiErrorMessage, getApiErrorResponseBody, type ApiErrorResponseBody } from '../api/client';
import { downloadMonthlyReportPDF } from '../utils/downloadMonthlyReport';
import Layout from '../components/Layout';
import AddMemberModal from '../components/AddMemberModal';
import FollowUpModal from '../components/FollowUpModal';
import PayFeesModal from '../components/PayFeesModal';
import WhatsAppButton from '../components/WhatsAppButton';
import { CardSkeleton, ListSkeleton, ChartSkeleton } from '../components/LoadingSkeleton';
import { QRCodeSVG } from 'qrcode.react';
import FaceCaptureModal from '../components/FaceCaptureModal';
import SuccessPopup from '../components/SuccessPopup';
import { AppIcons } from '../components/icons/AppIcons';
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

/** Days since last check-in (positive). No check-in = 999. */
function getDaysAbsent(m: Member): number {
  const last = m.lastCheckInTime as string | undefined;
  if (!last || !String(last).trim()) return 999;
  const d = new Date(String(last));
  if (isNaN(d.getTime())) return 999;
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

function isExpired(m: Member): boolean {
  const due = m.dueDate as Date | undefined;
  if (!due) return false;
  return differenceInDays(new Date(due), new Date()) < 0;
}

/** Fee amount for revenue-at-risk (default 1000 if missing). */
function getMemberFee(m: Member): number {
  const fee = Number((m as Record<string, unknown>)['Fees Amount'] ?? (m as Record<string, unknown>).feesAmount) || 0;
  return fee > 0 ? fee : 1000;
}

/** Sort key: renewal priority (higher absence first, new member <30d, PT plan). */
function renewalPrioritySort(a: Member, b: Member): number {
  const daysA = getDaysAbsent(a);
  const daysB = getDaysAbsent(b);
  if (daysB !== daysA) return daysB - daysA;
  const joinA = a.joinDate ? differenceInDays(new Date(), new Date(a.joinDate as string)) : 999;
  const joinB = b.joinDate ? differenceInDays(new Date(), new Date(b.joinDate as string)) : 999;
  const newA = joinA <= 30 ? 1 : 0;
  const newB = joinB <= 30 ? 1 : 0;
  if (newB !== newA) return newB - newA;
  const ptA = /pt|personal/i.test(String((a as Record<string, unknown>)['Typeof pack'] ?? (a as Record<string, unknown>).typeofPack ?? '')) ? 1 : 0;
  const ptB = /pt|personal/i.test(String((b as Record<string, unknown>)['Typeof pack'] ?? (b as Record<string, unknown>).typeofPack ?? '')) ? 1 : 0;
  return ptB - ptA;
}

/** Prefill message for WhatsApp renewal follow-up (manual 3-day / due-today). */
function getRenewalPrefillMessage(m: Member, type: 'today' | '3days'): string {
  const name = String(m.NAME ?? '').trim() || 'there';
  if (type === 'today') {
    return `Hi ${name}, your gym membership is due for renewal today. Please renew at your earliest to avoid any interruption. Thank you!`;
  }
  return `Hi ${name}, your gym membership is expiring in 3 days. Please renew at your earliest to avoid any interruption. Thank you!`;
}

/** Prefill message for WhatsApp when reaching out to absent members (5 or 7 days). */
function getAbsentPrefillMessage(m: Member, days: 5 | 7): string {
  const name = String(m.NAME ?? '').trim() || 'there';
  if (days === 5) {
    return `Hi ${name}, we noticed you haven't visited in 5 days. We'd love to see you back at the gym. Is everything okay? Let us know if you need anything!`;
  }
  return `Hi ${name}, we missed you! You haven't visited in a week. We're here when you're ready to get back. Need help with your routine or schedule? Just reply!`;
}

function isDueToday(m: Member): boolean {
  const due = m.dueDate as Date | undefined;
  if (!due) return false;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dueStart = new Date(due).setHours(0, 0, 0, 0);
  return dueStart === todayStart;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [checkinTable, setCheckinTable] = useState<Member[]>([]);
  /** Valid-only members from checkInList (used for today's check-ins). */
  const [checkInEligibleMembers, setCheckInEligibleMembers] = useState<Member[]>([]);
  /** All gym members for attendance tab (dropdown + full list). */
  const [attendanceAllMembers, setAttendanceAllMembers] = useState<Member[]>([]);
  /** Count of members with expired membership (owner is alerted when opening Attendance). */
  const [expiredSummaryCount, setExpiredSummaryCount] = useState(0);
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
  const [checkinSearchQuery, setCheckinSearchQuery] = useState('');
  const [selectedMemberForCheckIn, setSelectedMemberForCheckIn] = useState<Member | null>(null);
  const [checkinDropdownOpen, setCheckinDropdownOpen] = useState(false);
  /** When set, show success-style popup for expired membership (message + member info). */
  const [expiredCheckInPopup, setExpiredCheckInPopup] = useState<{ message: string; member?: ApiErrorResponseBody['member'] } | null>(null);
  const checkinInputRef = useRef<HTMLInputElement>(null);
  const checkinDropdownRef = useRef<HTMLDivElement>(null);
  const [showFaceEnrollModal, setShowFaceEnrollModal] = useState(false);
  const [faceEnrollRegNo, setFaceEnrollRegNo] = useState<number | null>(null);
  const [faceEnrollQuery, setFaceEnrollQuery] = useState('');
  const [faceEnrollDropdownOpen, setFaceEnrollDropdownOpen] = useState(false);
  const faceEnrollDropdownRef = useRef<HTMLDivElement>(null);
  const faceEnrollInputRef = useRef<HTMLInputElement>(null);
  const faceEnrollMessageRef = useRef<HTMLParagraphElement>(null);
  const [faceEnrollMessage, setFaceEnrollMessage] = useState<string | null>(null);
  const [showEnrollSuccessPopup, setShowEnrollSuccessPopup] = useState(false);
  const [notifyOwnerOnFaceFailure, setNotifyOwnerOnFaceFailure] = useState(true);
  const [faceAlertEnrollKeySet, setFaceAlertEnrollKeySet] = useState(false);
  const [faceRecognitionEnabled, setFaceRecognitionEnabled] = useState(true);
  const [faceAlertSettingsLoading, setFaceAlertSettingsLoading] = useState(false);
  const [faceAlertSettingsSaving, setFaceAlertSettingsSaving] = useState(false);
  const [faceOptOutSaving, setFaceOptOutSaving] = useState(false);
  const [faceRemoveRegNo, setFaceRemoveRegNo] = useState<number | null>(null);
  const [copyUrlFeedback, setCopyUrlFeedback] = useState(false);
  const [faceConfig, setFaceConfig] = useState<{ useImageForMatch: boolean } | null>(null);
  const [showEnrollKeyModal, setShowEnrollKeyModal] = useState(false);
  const [enrollKeyInput, setEnrollKeyInput] = useState('');
  const [enrollKeyError, setEnrollKeyError] = useState<string | null>(null);
  const [newEnrollKeyInput, setNewEnrollKeyInput] = useState('');
  const [setEnrollKeySaving, setSetEnrollKeySaving] = useState(false);
  const [activeNav, setActiveNav] = useState<'dashboard' | 'main' | 'add' | 'checkin' | 'finance'>('main');
  const [filter, setFilter] = useState<'all' | 'men' | 'women'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'expired' | 'soon' | 'valid' | 'new'>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(10);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState<Member | null>(null);
  const [showPayFeesModal, setShowPayFeesModal] = useState<Member | null>(null);
  const [showMemberEditModal, setShowMemberEditModal] = useState<Member | null>(null);
  const [showEditDetailsModal, setShowEditDetailsModal] = useState<Member | null>(null);
  const [memberUserForEdit, setMemberUserForEdit] = useState<{ id: string; email: string; name?: string; trainerUserId: string | null } | null | 'loading'>('loading');
  const [trainersList, setTrainersList] = useState<Array<{ id: string; email: string; name?: string }>>([]);
  const [editTrainerId, setEditTrainerId] = useState<string>('');
  const [editMemberSaving, setEditMemberSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [followUpHistory, setFollowUpHistory] = useState<Array<{ comment: string; nextFollowUpDate?: string; createdAt: string }>>([]);
  const [qrPayload, setQrPayload] = useState<{ url: string; token: string } | null>(null);
  const [showRenewalsDueModal, setShowRenewalsDueModal] = useState(false);
  type DashboardSubView = 'home' | 'actions' | 'renewals' | 'absent' | 'missed';
  const [dashboardSubView, setDashboardSubView] = useState<DashboardSubView>('home');
  const [cleanupLoading, setCleanupLoading] = useState(false);

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
        const memberId = (row as Record<string, unknown>).memberId as string || `GYM-${new Date().getFullYear()}-${Number(row['Reg No:']) ?? row['Reg No:']}`;
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
    active: listForCounts.filter((r) => (r.status as StatusType) !== 'expired').length,
    expired: listForCounts.filter((r) => (r.status as StatusType) === 'expired').length,
  };

  const filteredMembers = (() => {
    let list = listForCounts;
    if (statusFilter === 'active') {
      list = list.filter((r) => (r.status as StatusType) !== 'expired');
    } else if (statusFilter === 'expired') {
      list = list.filter((r) => (r.status as StatusType) === 'expired');
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

  const inactive7Count = allMembers.filter((m) => getDaysAbsent(m) > 7).length;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const renewalsDueToday = allMembers.filter((m) => {
    const due = m.dueDate as Date | undefined;
    if (!due) return false;
    const dueStart = new Date(due).setHours(0, 0, 0, 0);
    return dueStart === todayStart;
  }).sort(renewalPrioritySort);
  const renewalsDueIn3Days = allMembers.filter((m) => {
    const due = m.dueDate as Date | undefined;
    if (!due) return false;
    const daysToDue = differenceInDays(new Date(due), new Date());
    return daysToDue >= 0 && daysToDue <= 3;
  }).sort(renewalPrioritySort);
  const renewalsDue3Members = renewalsDueIn3Days;
  const renewalsDue3Count = renewalsDueIn3Days.length;
  const revenueAtRiskDueToday = renewalsDueToday.reduce((s, m) => s + getMemberFee(m), 0);
  const revenueAtRiskDueIn3 = renewalsDueIn3Days.reduce((s, m) => s + getMemberFee(m), 0);

  const activeMembersOnly = allMembers.filter((m) => !isExpired(m));
  const absent5DaysList = activeMembersOnly.filter((m) => {
    const d = getDaysAbsent(m);
    return d >= 5 && d < 7;
  }).sort(renewalPrioritySort);
  const absent7DaysList = activeMembersOnly.filter((m) => getDaysAbsent(m) >= 7).sort(renewalPrioritySort);
  const absentTodayTotal = absent5DaysList.length + absent7DaysList.length;

  const missedRenewals1_7 = allMembers.filter((m) => {
    const due = m.dueDate as Date | undefined;
    if (!due) return false;
    const daysExpired = differenceInDays(new Date(), new Date(due));
    return daysExpired >= 1 && daysExpired <= 7;
  });
  const missedRenewals8_30 = allMembers.filter((m) => {
    const due = m.dueDate as Date | undefined;
    if (!due) return false;
    const daysExpired = differenceInDays(new Date(), new Date(due));
    return daysExpired >= 8 && daysExpired <= 30;
  });
  const missedRenewals31_90 = allMembers.filter((m) => {
    const due = m.dueDate as Date | undefined;
    if (!due) return false;
    const daysExpired = differenceInDays(new Date(), new Date(due));
    return daysExpired >= 31 && daysExpired <= 90;
  });
  const missedRenewalsTotal = missedRenewals1_7.length + missedRenewals8_30.length + missedRenewals31_90.length;
  const revenueRecovery = missedRenewals1_7.reduce((s, m) => s + getMemberFee(m), 0)
    + missedRenewals8_30.reduce((s, m) => s + getMemberFee(m), 0)
    + missedRenewals31_90.reduce((s, m) => s + getMemberFee(m), 0);

  const todayActionsWhatsApp = renewalsDueToday.length;
  const todayActionsFollowUp = missedRenewals1_7.length;
  const todayActionsCall = activeMembersOnly.filter((m) => getDaysAbsent(m) >= 7 && (m.status as string) === 'soon').length;

  const todayAttendanceCount = checkinTable.length;
  const effectivePage = Math.min(membersPage, totalPages) || 1;
  const paginatedMembers = filteredMembers.slice(
    (effectivePage - 1) * membersPageSize,
    effectivePage * membersPageSize,
  );

  useEffect(() => {
    setMembersPage(1);
  }, [filter, statusFilter, sortBy, searchQuery]);

  const canEditMember = storage.getRole() === 'TENANT_ADMIN' || storage.getRole() === 'MANAGER';
  const canCleanDuplicates = storage.getRole() === 'TENANT_ADMIN';
  useEffect(() => {
    if (!showMemberEditModal) {
      setMemberUserForEdit('loading');
      setTrainersList([]);
      setEditTrainerId('');
      return;
    }
    const regNo = showMemberEditModal['Reg No:'] != null ? Number(showMemberEditModal['Reg No:']) : NaN;
    if (Number.isNaN(regNo)) {
      setMemberUserForEdit(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setMemberUserForEdit('loading');
      try {
        const [memberUser, trainers] = await Promise.all([
          api.auth.getMemberUserByReg(regNo),
          canEditMember ? api.auth.getTrainers() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setMemberUserForEdit(memberUser ?? null);
        setTrainersList(trainers);
        setEditTrainerId(memberUser?.trainerUserId ?? '');
      } catch {
        if (!cancelled) setMemberUserForEdit(null);
      }
    })();
    return () => { cancelled = true; };
  }, [showMemberEditModal, canEditMember]);

  const saveMemberEdit = async () => {
    if (memberUserForEdit === null || memberUserForEdit === 'loading' || !memberUserForEdit.id) return;
    setEditMemberSaving(true);
    try {
      if (editTrainerId) {
        await api.auth.assignMemberToTrainer(editTrainerId, memberUserForEdit.id);
      } else {
        await api.auth.unassignMemberFromTrainer(memberUserForEdit.id);
      }
      setShowMemberEditModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setEditMemberSaving(false);
    }
  };

  const regMembersTotal = allMembers.length;

  /** Face enroll autocomplete: filter by name or Reg No; supports "#4 shym" (reg + name). Tokenize query so each part can match name or reg. */
  const faceEnrollMatches = (() => {
    const raw = faceEnrollQuery.trim().replace(/^#+/, '').trim();
    const q = raw.toLowerCase();
    const source =
      activeNav === 'checkin' && attendanceAllMembers.length > 0
        ? attendanceAllMembers
        : activeNav === 'checkin' && checkInEligibleMembers.length > 0
          ? checkInEligibleMembers
          : allMembers.filter((m) => (m.status as StatusType) !== 'expired');
    if (!q) return source.slice(0, 15);
    const tokens = q.split(/\s+/).filter(Boolean);
    const filtered = source.filter((m) => {
      const name = String(m.NAME ?? '').toLowerCase();
      const regStr = String(m['Reg No:'] ?? '');
      if (tokens.length === 0) return true;
      return tokens.every((t) => name.includes(t) || regStr.toLowerCase().includes(t) || (t === regStr) || (t === String(Number(m['Reg No:']))));
    });
    const qNum = /^\d+$/.test(q) ? parseInt(q, 10) : NaN;
    const sorted =
      !isNaN(qNum) && !Number.isNaN(qNum)
        ? [...filtered].sort((a, b) => {
            const aExact = Number(a['Reg No:']) === qNum ? 1 : 0;
            const bExact = Number(b['Reg No:']) === qNum ? 1 : 0;
            return bExact - aExact;
          })
        : filtered;
    return sorted.slice(0, 15);
  })();

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

  /** True if lastCheckInTime is the same calendar day as today (client local). Handles ISO and legacy locale strings. */
  const isCheckInToday = (lastCheckInTime: string | undefined): boolean => {
    if (!lastCheckInTime || !String(lastCheckInTime).trim()) return false;
    const parsed = new Date(lastCheckInTime);
    if (!isValid(parsed)) return false;
    return format(parsed, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  };

  const loadCheckIn = async () => {
    try {
      const data = (await api.legacy.checkInList()) as Member[];
      setCheckInEligibleMembers(data);
      const withStatus = data
        .filter((r) => isCheckInToday(r.lastCheckInTime as string))
        .map((row) => {
          const dueRaw = row['DUE DATE'] ? new Date(row['DUE DATE'] as number) : null;
          const joinRaw = row['Date of Joining'] ? new Date(row['Date of Joining'] as string | number) : null;
          const due = dueRaw && isValid(dueRaw) ? dueRaw : null;
          const join = joinRaw && isValid(joinRaw) ? joinRaw : null;
          const status = getStatus(due, join);
          const memberId = (row as Record<string, unknown>).memberId as string || `GYM-${new Date().getFullYear()}-${Number(row['Reg No:']) ?? row['Reg No:']}`;
          return { ...row, status, dueDate: due, joinDate: join, memberId };
        })
        .sort((a, b) =>
          new Date((b as Record<string, unknown>).lastCheckInTime as string).getTime() -
          new Date((a as Record<string, unknown>).lastCheckInTime as string).getTime());
      setCheckinTable(withStatus);
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
      api.attendance.allMembers().then((data) => setAttendanceAllMembers((data ?? []) as Member[])).catch(() => setAttendanceAllMembers([]));
      api.attendance.expiredSummary().then((r) => setExpiredSummaryCount(r?.count ?? 0)).catch(() => setExpiredSummaryCount(0));
      api.attendance.qrPayload().then((p) => setQrPayload(p)).catch(() => setQrPayload(null));
      api.attendance.getFaceConfig().then(setFaceConfig).catch(() => setFaceConfig({ useImageForMatch: false }));
      setFaceAlertSettingsLoading(true);
      api.tenant.getMySettings().then((r) => {
        setNotifyOwnerOnFaceFailure(r.notifyOwnerOnFaceFailure);
        setFaceAlertEnrollKeySet(r.faceAlertEnrollKeySet);
        setFaceRecognitionEnabled(r.faceRecognitionEnabled);
      }).catch(() => {}).finally(() => setFaceAlertSettingsLoading(false));
    }
  }, [activeNav]);
  const handleFaceFailureAlertToggle = async (checked: boolean) => {
    if (!checked) {
      setFaceAlertSettingsSaving(true);
      try {
        const r = await api.tenant.updateMySettings({ notifyOwnerOnFaceFailure: false });
        setNotifyOwnerOnFaceFailure(r.notifyOwnerOnFaceFailure);
      } catch {
        // keep previous state
      } finally {
        setFaceAlertSettingsSaving(false);
      }
      return;
    }
    if (faceAlertEnrollKeySet) {
      setEnrollKeyError(null);
      setEnrollKeyInput('');
      setShowEnrollKeyModal(true);
      return;
    }
    setFaceAlertSettingsSaving(true);
    try {
      const r = await api.tenant.updateMySettings({ notifyOwnerOnFaceFailure: true });
      setNotifyOwnerOnFaceFailure(r.notifyOwnerOnFaceFailure);
      setFaceAlertEnrollKeySet(r.faceAlertEnrollKeySet);
    } catch {
      // keep previous state
    } finally {
      setFaceAlertSettingsSaving(false);
    }
  };

  const submitEnrollKey = async () => {
    setEnrollKeyError(null);
    setFaceAlertSettingsSaving(true);
    try {
      const r = await api.tenant.updateMySettings({ notifyOwnerOnFaceFailure: true, enrollKey: enrollKeyInput });
      setNotifyOwnerOnFaceFailure(r.notifyOwnerOnFaceFailure);
      setShowEnrollKeyModal(false);
      setEnrollKeyInput('');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Invalid enrollment key';
      setEnrollKeyError(msg);
    } finally {
      setFaceAlertSettingsSaving(false);
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

  useEffect(() => {
    if (activeNav === 'checkin') {
      return;
    }
    if (activeNav === 'finance') {
      setDashboardLoading(false);
      loadFinance();
    }
    if (activeNav === 'dashboard') loadFinance();
    if (activeNav !== 'dashboard') setDashboardSubView('home');
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

  useEffect(() => {
    if (!faceEnrollDropdownOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        faceEnrollInputRef.current?.contains(target) ||
        faceEnrollDropdownRef.current?.contains(target)
      )
        return;
      setFaceEnrollDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [faceEnrollDropdownOpen]);

  useEffect(() => {
    if (activeNav !== 'checkin' || !checkinDropdownOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (checkinInputRef.current?.contains(target) || checkinDropdownRef.current?.contains(target)) return;
      setCheckinDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [activeNav, checkinDropdownOpen]);

  const handleCheckIn = async () => {
    const member = selectedMemberForCheckIn;
    const regNo = member != null ? Number(member['Reg No:']) : NaN;
    if (!member || isNaN(regNo)) return;
    try {
      await api.legacy.checkIn({
        'Reg No:': regNo,
        checkedInBy: storage.getUserName() || undefined,
      });
      setSelectedMemberForCheckIn(null);
      setCheckinSearchQuery('');
      setCheckinDropdownOpen(false);
      loadList();
      loadCheckIn();
    } catch (err) {
      const msg = getApiErrorMessage(err);
      if (msg.includes('Membership expired')) {
        const body = getApiErrorResponseBody(err);
        setExpiredCheckInPopup({
          message: msg,
          member: body?.member,
        });
        setSelectedMemberForCheckIn(null);
        setCheckinSearchQuery('');
        setCheckinDropdownOpen(false);
      } else {
        alert('Check-in failed: ' + msg);
      }
    }
  };

  /** Members matching check-in search (name, Reg No, or phone). On check-in tab use all gym users; else valid from allMembers. */
  const checkinSearchMatches = (() => {
    if (!checkinSearchQuery.trim()) return [];
    const q = checkinSearchQuery.trim().toLowerCase();
    const qNum = /^\d+$/.test(q) ? parseInt(q, 10) : NaN;
    const sourceMembers =
      activeNav === 'checkin' && attendanceAllMembers.length > 0
        ? attendanceAllMembers
        : activeNav === 'checkin' && checkInEligibleMembers.length > 0
          ? checkInEligibleMembers
          : allMembers.filter((m) => (m.status as StatusType) !== 'expired');
    const validMembers = sourceMembers;
    const filtered = validMembers.filter(
      (m) =>
        (m.NAME as string)?.toLowerCase().includes(q) ||
        String(m['Reg No:'] || '').includes(q) ||
        String(m['Phone Number'] || '').includes(q),
    );
    const sorted = !isNaN(qNum)
      ? [...filtered].sort((a, b) => {
          const aExact = Number(a['Reg No:']) === qNum ? 1 : 0;
          const bExact = Number(b['Reg No:']) === qNum ? 1 : 0;
          return bExact - aExact;
        })
      : filtered;
    return sorted.slice(0, 15);
  })();

  const handleAddMember = async (data: Record<string, unknown>) => {
    await api.legacy.upsert(data, false);
    loadList();
    loadFinance();
  };

  const handleEditMemberDetails = async (data: Record<string, unknown>) => {
    await api.legacy.upsert(data, false);
    loadList();
    loadFinance();
    setShowEditDetailsModal(null);
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
    if (id === 'notifications') {
      navigate('/notifications');
      return;
    }
    if (id === 'add') {
      setActiveNav('add');
      setShowAddModal(true);
    } else {
      setActiveNav(id as 'dashboard' | 'main' | 'checkin' | 'finance' | 'notifications');
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setActiveNav('main');
  };

  const handleCleanupDuplicates = async () => {
    if (!canCleanDuplicates) return;
    setCleanupLoading(true);
    try {
      const res = await api.legacy.cleanupDuplicates();
      if (res.deleted > 0) {
        loadList();
        loadFinance();
      }
      setError(res.deleted > 0 ? null : null);
      alert(res.deleted > 0 ? `Cleaned up ${res.deleted} duplicate(s).` : 'No duplicates found.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cleanup failed');
    } finally {
      setCleanupLoading(false);
    }
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
      {showEditDetailsModal && (
        <AddMemberModal
          onClose={() => setShowEditDetailsModal(null)}
          onSubmit={handleEditMemberDetails}
          nextRegNo={nextRegNo}
          initialData={showEditDetailsModal as unknown as Record<string, unknown>}
          regNo={Number(showEditDetailsModal['Reg No:']) || 0}
        />
      )}
      {showPayFeesModal && (
        <PayFeesModal
          member={showPayFeesModal}
          onClose={() => setShowPayFeesModal(null)}
          onSave={handlePayFees}
        />
      )}
      {showMemberEditModal && (
        <div className="renewals-modal-overlay" onClick={() => !editMemberSaving && setShowMemberEditModal(null)} role="dialog" aria-modal="true" aria-labelledby="member-edit-modal-title">
          <div className="renewals-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="member-edit-modal-title">Edit member</h2>
            <p className="member-edit-name">{showMemberEditModal.NAME}</p>
            <p className="member-edit-reg">Reg No: {String(showMemberEditModal['Reg No:'] ?? '—')}</p>
            {memberUserForEdit === 'loading' && <p className="member-edit-loading">Loading…</p>}
            {memberUserForEdit === null && (
              <div className="member-edit-section">
                <p>Not enrolled for Nutrition AI. Create member login in Onboarding to assign a trainer.</p>
              </div>
            )}
            {memberUserForEdit && memberUserForEdit !== 'loading' && (
              <div className="member-edit-section">
                <p><strong>Enrolled for AI:</strong> Yes</p>
                <p>{memberUserForEdit.email}{memberUserForEdit.name ? ` (${memberUserForEdit.name})` : ''}</p>
                {canEditMember && (
                  <>
                    <label className="member-edit-label">
                      <span>Assign trainer</span>
                      <select
                        value={editTrainerId}
                        onChange={(e) => setEditTrainerId(e.target.value)}
                        disabled={editMemberSaving}
                      >
                        <option value="">— No trainer —</option>
                        {trainersList.map((t) => (
                          <option key={t.id} value={t.id}>{t.name || t.email}</option>
                        ))}
                      </select>
                    </label>
                    <div className="member-edit-actions">
                      <button type="button" className="btn-secondary" onClick={() => setShowMemberEditModal(null)} disabled={editMemberSaving}>Cancel</button>
                      <button type="button" className="btn-primary" onClick={saveMemberEdit} disabled={editMemberSaving}>
                        {editMemberSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
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
              <p className="renewals-modal-hint">Members whose membership is due in the next 3 days. Tap WhatsApp to send a renewal reminder (message is prefilled).</p>
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
                            message={getRenewalPrefillMessage(m, '3days')}
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
          {dashboardLoading ? (
            <div className="dashboard-cards dashboard-cards-grid">
              {[1, 2, 3, 4].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : dashboardSubView === 'home' ? (
            /* Dashboard Home: summary cards only */
            <div className="dash-home">
              <h1 className="page-title">Dashboard</h1>
              <div className="dash-summary-cards">
                <button type="button" className="dash-summary-card dash-summary-actions" onClick={() => setDashboardSubView('actions')}>
                  <span className="dash-summary-title">Today&apos;s Actions</span>
                  <div className="dash-summary-stats">
                    <span className="dash-summary-stat">Due today: {todayActionsWhatsApp}</span>
                    <span className="dash-summary-stat">Follow up: {todayActionsFollowUp}</span>
                    <span className="dash-summary-stat">Call: {todayActionsCall}</span>
                  </div>
                </button>
                <button type="button" className="dash-summary-card" onClick={() => setDashboardSubView('renewals')}>
                  <span className="dash-summary-title">Memberships expiring within 3 days</span>
                  <span className="dash-summary-value">{renewalsDueIn3Days.length} members · ₹{(revenueAtRiskDueIn3 || 0).toLocaleString()} at risk</span>
                </button>
                <button type="button" className="dash-summary-card" onClick={() => setDashboardSubView('absent')}>
                  <span className="dash-summary-title">Members who haven&apos;t visited</span>
                  <span className="dash-summary-value">5 days: {absent5DaysList.length} · 7 days: {absent7DaysList.length}</span>
                </button>
                <button type="button" className="dash-summary-card" onClick={() => setDashboardSubView('missed')}>
                  <span className="dash-summary-title">Expired memberships (follow up)</span>
                  <span className="dash-summary-value">1–7 days: {missedRenewals1_7.length} · 8–30 days: {missedRenewals8_30.length} · 31–90 days: {missedRenewals31_90.length}</span>
                </button>
                <div
                  className="dash-summary-card dash-summary-earning dash-card-clickable"
                  onClick={() => handleNavChange('finance')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavChange('finance')}
                >
                  <span className="dash-summary-title">This month&apos;s earnings</span>
                  <span className="dash-summary-value">₹{(finance?.monthlyFees ?? 0).toLocaleString()}</span>
                  <span className="dc-action">Tap to view Finance →</span>
                </div>
              </div>
            </div>
          ) : (
            /* Sub-view: back + full section content */
            <div className="dash-subview">
              <div className="dash-subview-header">
                <button type="button" className="dash-subview-back" onClick={() => setDashboardSubView('home')} aria-label="Back to dashboard">
                  ← Back
                </button>
                <h1 className="page-title dash-subview-title">
                  {dashboardSubView === 'actions' && "Today's Actions"}
                  {dashboardSubView === 'renewals' && 'Memberships expiring within 3 days'}
                  {dashboardSubView === 'absent' && 'Members who haven\'t visited'}
                  {dashboardSubView === 'missed' && 'Expired memberships (follow up)'}
                </h1>
              </div>
              <div className="dash-subview-body">
              {dashboardSubView === 'actions' && (
                <section className="dash-section">
                  <p className="dash-section-sub">Quick counts: who to WhatsApp for renewal today, who to follow up (recent missed renewals), and who to call (absent a week or more with expiry soon)</p>
                  <div className="today-actions-row">
                    <div className="today-action-card">
                      <span className="ta-count">WhatsApp {todayActionsWhatsApp} members</span>
                      <span className="ta-desc">Membership due today</span>
                    </div>
                    <div className="today-action-card">
                      <span className="ta-count">Follow up {todayActionsFollowUp} missed renewals</span>
                      <span className="ta-desc">Follow up (missed renewals)</span>
                    </div>
                    <div className="today-action-card">
                      <span className="ta-count">Call {todayActionsCall} members</span>
                      <span className="ta-desc">Call (absent 7+ days, expiring soon)</span>
                    </div>
                  </div>
                </section>
              )}
              {dashboardSubView === 'renewals' && (
                <section className="dash-section">
                  <h3>Memberships expiring within 3 days: {renewalsDueIn3Days.length} members</h3>
                  <p className="dash-section-sub">Revenue at risk if they don&apos;t renew: ₹{(revenueAtRiskDueIn3 || 0).toLocaleString()}</p>
                  <p className="sort-hint">Order: members absent longer, newer members, and PT first — prioritise these when you contact.</p>
                  <ul className="member-mini-list">
                    {renewalsDueIn3Days.slice(0, 5).map((m) => (
                      <li key={String(m['Reg No:'])}>
                        <span>{String(m.NAME ?? '—')}</span>
                        <span className="days-absent">Absent: {getDaysAbsent(m)} days</span>
                        <WhatsAppButton phone={String(m['Phone Number'] ?? '')} message={getRenewalPrefillMessage(m, isDueToday(m) ? 'today' : '3days')} onClick={() => handleWhatsAppClick(m)} />
                      </li>
                    ))}
                  </ul>
                  {renewalsDueIn3Days.length > 5 && <p className="more-hint">+{renewalsDueIn3Days.length - 5} more</p>}
                  <button type="button" className="btn-outline btn-view-renewals" onClick={() => setShowRenewalsDueModal(true)}>View full list &amp; WhatsApp all</button>
                </section>
              )}
              {dashboardSubView === 'absent' && (
                <section className="dash-section">
                  <p className="dash-section-sub">Active members who didn&apos;t check in today (expired excluded). Total: {absentTodayTotal}</p>
                  <div className="absent-grid">
                    <div className="absent-card absent-medium">
                      <h3>Absent for 5 days: {absent5DaysList.length}</h3>
                      <span className="risk-badge risk-medium">Worth a check-in</span>
                      <p className="sort-hint">Reach out first to those absent longest, newer members, and PT—they need attention sooner.</p>
                      <ul className="member-mini-list">
                        {absent5DaysList.slice(0, 5).map((m) => (
                          <li key={String(m['Reg No:'])}>
                            <span>{String(m.NAME ?? '—')}</span>
                            <WhatsAppButton phone={String(m['Phone Number'] ?? '')} message={getAbsentPrefillMessage(m, 5)} onClick={() => handleWhatsAppClick(m)} />
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="absent-card absent-high">
                      <h3>Absent for 7 days: {absent7DaysList.length}</h3>
                      <span className="risk-badge risk-high">Prioritise follow-up</span>
                      <p className="sort-hint">Reach out first to those absent longest, newer members, and PT—they need attention sooner.</p>
                      <ul className="member-mini-list">
                        {absent7DaysList.slice(0, 5).map((m) => (
                          <li key={String(m['Reg No:'])}>
                            <span>{String(m.NAME ?? '—')}</span>
                            <WhatsAppButton phone={String(m['Phone Number'] ?? '')} message={getAbsentPrefillMessage(m, 7)} onClick={() => handleWhatsAppClick(m)} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              )}
              {dashboardSubView === 'missed' && (
                <section className="dash-section">
                  <p className="dash-section-sub">Revenue you can recover by following up: ₹{revenueRecovery.toLocaleString()}</p>
                  <div className="missed-renewals-row">
                    <div className="missed-bucket high">
                      <span className="bucket-count">Expired 1–7 days ago: {missedRenewals1_7.length}</span>
                      <span className="bucket-tag">Best chance to win back</span>
                    </div>
                    <div className="missed-bucket medium">
                      <span className="bucket-count">Expired 8–30 days ago: {missedRenewals8_30.length}</span>
                      <span className="bucket-tag">Worth a follow-up</span>
                    </div>
                    <div className="missed-bucket low">
                      <span className="bucket-count">Expired 31–90 days ago: {missedRenewals31_90.length}</span>
                      <span className="bucket-tag">Older lapses</span>
                    </div>
                  </div>
                </section>
              )}
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
                <p className="mc-subtitle">Fees collected each month (new members + renewals)</p>
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
                  <><span className="btn-icon-inline">{AppIcons.download()}</span> Download PDF</>
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
            <div className="checkin-row checkin-row-autocomplete">
              <div className="checkin-autocomplete-wrap">
                <input
                  ref={checkinInputRef}
                  type="text"
                  placeholder="Type name or Reg. No. — autocomplete will suggest"
                  value={checkinSearchQuery}
                  onChange={(e) => {
                    setCheckinSearchQuery(e.target.value);
                    setCheckinDropdownOpen(true);
                    if (!e.target.value.trim()) setSelectedMemberForCheckIn(null);
                  }}
                  onFocus={() => setCheckinDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (selectedMemberForCheckIn) handleCheckIn();
                      else if (checkinSearchMatches.length === 1) {
                        setSelectedMemberForCheckIn(checkinSearchMatches[0]);
                        setCheckinSearchQuery(String(checkinSearchMatches[0].NAME));
                        setCheckinDropdownOpen(false);
                      }
                    }
                    if (e.key === 'Escape') setCheckinDropdownOpen(false);
                  }}
                  aria-autocomplete="list"
                  aria-expanded={checkinDropdownOpen}
                  aria-controls="checkin-dropdown"
                />
                {checkinDropdownOpen && checkinSearchQuery.trim() && (
                  <div
                    id="checkin-dropdown"
                    ref={checkinDropdownRef}
                    className="checkin-dropdown"
                    role="listbox"
                  >
                    {checkinSearchMatches.length === 0 ? (
                      <div className="checkin-dropdown-item checkin-dropdown-empty">No member found</div>
                    ) : (
                      checkinSearchMatches.map((m) => (
                        <button
                          key={String(m['Reg No:'])}
                          type="button"
                          role="option"
                          className={`checkin-dropdown-item ${selectedMemberForCheckIn?.['Reg No:'] === m['Reg No:'] ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedMemberForCheckIn(m);
                            setCheckinSearchQuery(String(m.NAME ?? ''));
                            setCheckinDropdownOpen(false);
                            checkinInputRef.current?.focus();
                          }}
                        >
                          {m.NAME} #{m['Reg No:']}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={handleCheckIn}
                className="btn-primary"
                disabled={!selectedMemberForCheckIn}
                title={selectedMemberForCheckIn ? `Check in ${selectedMemberForCheckIn.NAME}` : 'Select a member first'}
              >
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
                <div className="checkin-qr-url-row">
                  <input
                    type="text"
                    readOnly
                    className="checkin-qr-url-input"
                    value={qrPayload.url.startsWith('http') ? qrPayload.url : `${window.location.origin}${qrPayload.url}`}
                    aria-label="Check-in URL"
                  />
                  <button
                    type="button"
                    className="btn-secondary checkin-qr-copy-btn"
                    onClick={async () => {
                      const url = qrPayload.url.startsWith('http') ? qrPayload.url : `${window.location.origin}${qrPayload.url}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        setCopyUrlFeedback(true);
                        setTimeout(() => setCopyUrlFeedback(false), 2000);
                      } catch {
                        setCopyUrlFeedback(false);
                      }
                    }}
                  >
                    {copyUrlFeedback ? 'Copied!' : 'Copy URL'}
                  </button>
                </div>
              </div>
            )}
            <p className="checkin-validity-note">
              All gym members are shown. <strong>Membership expired?</strong> Check-in will be denied and you will be alerted.
            </p>
            {expiredSummaryCount > 0 && (
              <div className="checkin-expired-alert" role="alert">
                <strong>{expiredSummaryCount} member(s)</strong> have expired membership. You have been notified (push/Telegram). Renew from People or Add Member.
              </div>
            )}
            <div className="chips chips-with-actions">
              {checkinTable.length === 0 ? (
                <div className="empty-state">No check-ins today</div>
              ) : (
                checkinTable.map((row) => {
                  const status = row.status as StatusType;
                  const dueDate = row.dueDate as Date | null | undefined;
                  const lastCheckInTime = row.lastCheckInTime as string | undefined;
                  const checkInTimeFormatted =
                    lastCheckInTime && isValid(new Date(lastCheckInTime))
                      ? format(new Date(lastCheckInTime), 'h:mm a')
                      : null;
                  const r = row as Record<string, unknown>;
                  const phone = (r['Phone Number'] ?? r.phoneNumber) as string | undefined;
                  const pack = (r['Typeof pack'] ?? r.typeofPack) as string | undefined;
                  return (
                    <span key={String(r['Reg No:'])} className="chip chip-with-action chip-validity">
                      <span className="chip-text">
                        #{String(r['Reg No:'])} {String(r.NAME)}
                        {checkInTimeFormatted && (
                          <span className="chip-time" title="Check-in time"> @ {checkInTimeFormatted}</span>
                        )}
                        {(r.lastCheckInBy as string) && (
                          <span className="chip-by"> (by {r.lastCheckInBy as string})</span>
                        )}
                        {dueDate && (
                          <span className={`chip-due chip-due-${status}`} title={status === 'soon' ? 'Due within 5 days' : status === 'valid' ? 'Active' : 'New member'}>
                            Due: {format(dueDate, 'dd MMM yyyy')}
                          </span>
                        )}
                        {(phone || pack) && (
                          <span className="chip-details">
                            {phone && <span className="chip-phone">{AppIcons.phone()}{phone}</span>}
                            {pack && <span className="chip-pack">{pack}</span>}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="chip-remove"
                        onClick={async () => {
                          const regNo = Number(row['Reg No:']);
                          if (isNaN(regNo)) return;
                          try {
                            await api.attendance.removeTodayCheckIn(regNo);
                            loadList();
                            loadCheckIn();
                          } catch (err) {
                            alert('Failed to remove: ' + (err instanceof Error ? err.message : 'Unknown'));
                          }
                        }}
                        title="Remove today's attendance so they can check in again"
                        aria-label={`Remove attendance for ${row.NAME}`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })
              )}
            </div>
            <div className="checkin-all-members-section">
              <h3 className="checkin-all-members-title">All gym members ({attendanceAllMembers.length})</h3>
              <div className="checkin-all-members-list">
                {attendanceAllMembers.length === 0 ? (
                  <div className="checkin-all-members-empty">Loading…</div>
                ) : (
                  attendanceAllMembers.map((row) => {
                    const dueRaw = row['DUE DATE'] != null ? new Date(row['DUE DATE'] as number) : null;
                    const joinRaw = row['Date of Joining'] != null ? new Date(row['Date of Joining'] as string | number) : null;
                    const due = dueRaw && isValid(dueRaw) ? dueRaw : null;
                    const join = joinRaw && isValid(joinRaw) ? joinRaw : null;
                    const status = getStatus(due, join);
                    const regNo = Number(row['Reg No:']);
                    const checkedInToday = checkinTable.some((r) => Number(r['Reg No:']) === regNo);
                    const hasFace = (Array.isArray(row.faceDescriptor) && (row.faceDescriptor as number[]).length === 128) ||
                      (Array.isArray((row as Record<string, unknown>).faceDescriptorDlib) && ((row as Record<string, unknown>).faceDescriptorDlib as number[]).length === 128);
                    const removing = faceRemoveRegNo === regNo;
                    return (
                      <span key={String(row['Reg No:'])} className={`checkin-all-member-chip chip-due-${status}`}>
                        <span className="checkin-all-member-name">#{String(row['Reg No:'])} {String(row.NAME ?? '—')}</span>
                        <span className="checkin-all-member-status" title={status === 'expired' ? 'Membership expired' : status === 'soon' ? 'Due within 5 days' : 'Active'}>
                          {status === 'expired' ? 'Expired' : status === 'soon' ? 'Soon' : 'Valid'}
                        </span>
                        {checkedInToday && <span className="checkin-all-member-today">Today</span>}
                        {hasFace && (
                          <button
                            type="button"
                            className="checkin-all-member-remove-face"
                            disabled={removing}
                            onClick={async () => {
                              setFaceRemoveRegNo(regNo);
                              setFaceEnrollMessage(null);
                              try {
                                await api.attendance.removeFaceEnroll(regNo);
                                setFaceEnrollMessage('Face removed. Member can check in by QR or name/Reg. No.');
                                loadList();
                                loadCheckIn();
                                api.attendance.allMembers().then((data) => setAttendanceAllMembers((data ?? []) as Member[])).catch(() => {});
                              } catch (err) {
                                setFaceEnrollMessage(getApiErrorMessage(err) || 'Failed to remove face.');
                              } finally {
                                setFaceRemoveRegNo(null);
                              }
                            }}
                            title="Remove face enrollment so they use QR or Reg. No. only"
                          >
                            {removing ? 'Removing…' : 'Remove face'}
                          </button>
                        )}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
            {!faceAlertSettingsLoading && (
              <>
                <div className="checkin-face-alerts-section">
                  <h3 className="checkin-face-alerts-title">Face recognition</h3>
                  <label className="checkin-face-alerts-label">
                    <input
                      type="checkbox"
                      checked={faceRecognitionEnabled}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        setFaceAlertSettingsSaving(true);
                        try {
                          const r = await api.tenant.updateMySettings({ faceRecognitionEnabled: checked });
                          setFaceRecognitionEnabled(r.faceRecognitionEnabled);
                        } catch {
                          // keep previous state
                        } finally {
                          setFaceAlertSettingsSaving(false);
                        }
                      }}
                      disabled={faceAlertSettingsSaving}
                    />
                    <span>Enable face registration and check-in by face</span>
                  </label>
                  <p className="checkin-face-alerts-hint">
                    When enabled, you can enroll members for face check-in. When disabled, no one can enroll or check in by face; members use QR or name/Reg. No. only.
                  </p>
                </div>
                {faceRecognitionEnabled && (
              <>
                <div className="checkin-face-alerts-section">
                  <h3 className="checkin-face-alerts-title">Face check-in alerts</h3>
                {faceAlertEnrollKeySet && (
                  <p className="checkin-face-alerts-key-hint">Enrollment key is set. You must enter it to enable alerts.</p>
                )}
                <label className="checkin-face-alerts-label">
                  <input
                    type="checkbox"
                    checked={notifyOwnerOnFaceFailure}
                    onChange={(e) => handleFaceFailureAlertToggle(e.target.checked)}
                    disabled={faceAlertSettingsSaving}
                  />
                  <span>Notify me when someone fails face recognition</span>
                </label>
                <p className="checkin-face-alerts-hint">
                  When someone tries to check in by face and is not recognized, you&apos;ll get a push notification (enable push in the menu to receive it).
                </p>
                <div className="checkin-face-alerts-set-key">
                  <label className="checkin-face-alerts-set-key-label">Special key for enrollment (required to turn on alerts)</label>
                  <div className="checkin-face-enroll-row">
                    <input
                      type="password"
                      className="checkin-face-enroll-input"
                      placeholder="Set or change enrollment key"
                      value={newEnrollKeyInput}
                      onChange={(e) => setNewEnrollKeyInput(e.target.value)}
                      aria-label="Enrollment key"
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSetEnrollKey}
                      disabled={setEnrollKeySaving || !newEnrollKeyInput.trim()}
                    >
                      {setEnrollKeySaving ? 'Saving…' : 'Set key'}
                    </button>
                  </div>
                </div>
              </div>
            {showEnrollKeyModal && (
              <div className="checkin-enroll-key-overlay" role="dialog" aria-labelledby="enroll-key-title" aria-modal="true">
                <div className="checkin-enroll-key-modal">
                  <h3 id="enroll-key-title" className="checkin-face-alerts-title">Enter enrollment key</h3>
                  <p className="checkin-face-alerts-hint">Enter your special enrollment key to enable face check-in alerts.</p>
                  <input
                    type="password"
                    className="checkin-face-enroll-input"
                    placeholder="Enrollment key"
                    value={enrollKeyInput}
                    onChange={(e) => { setEnrollKeyInput(e.target.value); setEnrollKeyError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && submitEnrollKey()}
                    aria-label="Enrollment key"
                    autoFocus
                  />
                  {enrollKeyError && <p className="checkin-face-enroll-msg error">{enrollKeyError}</p>}
                  <div className="checkin-enroll-key-actions">
                    <button type="button" className="btn-primary" onClick={submitEnrollKey} disabled={faceAlertSettingsSaving}>
                      {faceAlertSettingsSaving ? 'Checking…' : 'Submit'}
                    </button>
                    <button type="button" className="face-capture-btn-cancel" onClick={() => { setShowEnrollKeyModal(false); setEnrollKeyError(null); setEnrollKeyInput(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="checkin-face-enroll-section">
              <h3 className="checkin-face-enroll-title">Face recognition (check-in by face)</h3>
              <p className="checkin-face-enroll-hint">
                Enroll a member&apos;s face here. After enrollment, they can check in by face on the QR check-in page.
              </p>
              <div className="checkin-face-enroll-row">
                <div className="checkin-face-enroll-autocomplete">
                  <input
                    ref={faceEnrollInputRef}
                    type="text"
                    inputMode="text"
                    placeholder="Search by name or Reg. No. — autocomplete will suggest"
                    value={faceEnrollQuery}
                    onChange={(e) => {
                      setFaceEnrollQuery(e.target.value);
                      setFaceEnrollDropdownOpen(true);
                      if (!e.target.value.trim()) setFaceEnrollRegNo(null);
                      setFaceEnrollMessage(null);
                    }}
                    onFocus={() => setFaceEnrollDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && faceEnrollMatches.length === 1) {
                        const m = faceEnrollMatches[0];
                        setFaceEnrollRegNo(Number(m['Reg No:']));
                        setFaceEnrollQuery(`${String(m.NAME)} #${m['Reg No:']}`);
                        setFaceEnrollDropdownOpen(false);
                      }
                      if (e.key === 'Escape') setFaceEnrollDropdownOpen(false);
                    }}
                    className="checkin-face-enroll-input"
                    aria-label="Select member to enroll face"
                    aria-autocomplete="list"
                    aria-expanded={faceEnrollDropdownOpen}
                  />
                  {faceEnrollDropdownOpen && (
                    <div
                      ref={faceEnrollDropdownRef}
                      className="checkin-face-enroll-dropdown"
                      role="listbox"
                    >
                      {faceEnrollMatches.length === 0 ? (
                        <div className="checkin-face-enroll-dropdown-empty">
                          No match — type name or Reg. No.
                        </div>
                      ) : (
                        faceEnrollMatches.map((m) => {
                          const regNo = Number(m['Reg No:']);
                          const selected = faceEnrollRegNo === regNo;
                          return (
                            <button
                              key={String(m['Reg No:'])}
                              type="button"
                              role="option"
                              className={`checkin-face-enroll-dropdown-item ${selected ? 'selected' : ''}`}
                              onClick={() => {
                                setFaceEnrollRegNo(regNo);
                                setFaceEnrollQuery(`${String(m.NAME)} #${m['Reg No:']}`);
                                setFaceEnrollDropdownOpen(false);
                                setFaceEnrollMessage(null);
                              }}
                            >
                              {String(m.NAME)} #{m['Reg No:']}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {(() => {
                  const source = activeNav === 'checkin' && checkInEligibleMembers.length > 0 ? checkInEligibleMembers : allMembers.filter((m) => (m.status as StatusType) !== 'expired');
                  const selected = faceEnrollRegNo != null ? source.find((m) => Number(m['Reg No:']) === faceEnrollRegNo) : null;
                  const hasFaceEnrolled = selected && (
                    (Array.isArray(selected.faceDescriptor) && (selected.faceDescriptor as number[]).length === 128) ||
                    (Array.isArray((selected as Record<string, unknown>).faceDescriptorDlib) && ((selected as Record<string, unknown>).faceDescriptorDlib as number[]).length === 128)
                  );
                  return (
                    <>
                      {hasFaceEnrolled ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={faceOptOutSaving}
                          onClick={async () => {
                            if (faceEnrollRegNo == null) return;
                            setFaceOptOutSaving(true);
                            setFaceEnrollMessage(null);
                            try {
                              await api.attendance.removeFaceEnroll(faceEnrollRegNo);
                              setFaceEnrollMessage('Face removed. Member can check in by QR or name/Reg. No.');
                              loadList();
                              loadCheckIn();
                              api.attendance.allMembers().then((data) => setAttendanceAllMembers((data ?? []) as Member[])).catch(() => {});
                            } catch (err) {
                              setFaceEnrollMessage(getApiErrorMessage(err) || 'Failed to remove face.');
                            } finally {
                              setFaceOptOutSaving(false);
                            }
                          }}
                        >
                          {faceOptOutSaving ? 'Removing…' : 'Remove face (opt out)'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={!faceEnrollRegNo}
                          onClick={() => setShowFaceEnrollModal(true)}
                        >
                          Enroll face
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
              {faceEnrollMessage && (
                <p
                  ref={faceEnrollMessageRef}
                  role="alert"
                  className={`checkin-face-enroll-msg ${faceEnrollMessage.startsWith('Saved') ? 'success' : 'error'} ${faceEnrollMessage.includes('already registered to another member') ? 'checkin-face-enroll-msg-alert' : ''}`}
                >
                  {faceEnrollMessage}
                  {faceEnrollMessage.includes('already registered to another member') && (
                    <span className="checkin-face-enroll-msg-hint"> Find that member in the &quot;All gym members&quot; list above and click &quot;Remove face&quot;, then try enrolling again.</span>
                  )}
                </p>
              )}
            </div>
            {showFaceEnrollModal && faceEnrollRegNo != null && (
              <FaceCaptureModal
                title="Position face in frame — then tap Capture"
                captureButtonLabel="Capture & save"
                failureMessage="Enrollment failed. Please try again or check your connection."
                onCaptureImage={
                  faceConfig?.useImageForMatch
                    ? async (blob) => {
                        try {
                          await api.attendance.faceEnrollImage(faceEnrollRegNo, blob);
                          setFaceEnrollMessage('Saved. Member can now check in by face.');
                          setShowFaceEnrollModal(false);
                          loadList();
                          setShowEnrollSuccessPopup(true);
                          return { success: true as const };
                        } catch (err) {
                          const msg = getApiErrorMessage(err);
                          setFaceEnrollMessage(msg || 'Enrollment failed. Please try again.');
                          setTimeout(() => faceEnrollMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
                          return { success: false as const };
                        }
                      }
                    : undefined
                }
                onCapture={
                  !faceConfig?.useImageForMatch
                    ? async (descriptor) => {
                        try {
                          await api.attendance.faceEnroll(faceEnrollRegNo, descriptor);
                          setFaceEnrollMessage('Saved. Member can now check in by face.');
                          setShowFaceEnrollModal(false);
                          loadList();
                          setShowEnrollSuccessPopup(true);
                          return { success: true as const };
                        } catch (err) {
                          const msg = getApiErrorMessage(err);
                          setFaceEnrollMessage(msg || 'Enrollment failed. Please try again.');
                          setTimeout(() => faceEnrollMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
                          return { success: false as const };
                        }
                      }
                    : async () => ({ success: false as const })
                }
                onClose={() => setShowFaceEnrollModal(false)}
              />
            )}
              </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {activeNav === 'main' && (
        <div ref={peopleViewRef} className="people-view people-view-sticky">
          <div className="people-sticky-top">
            <div className="people-header">
              <h1 className="page-title">Registered members ({regMembersTotal})</h1>
              <div className="people-actions">
                {canCleanDuplicates && (
                  <button
                    type="button"
                    className="btn-cleanup-duplicates"
                    onClick={handleCleanupDuplicates}
                    disabled={cleanupLoading}
                    title="Remove duplicate register numbers (keep latest)"
                  >
                    {cleanupLoading ? 'Cleaning…' : 'Clean duplicates'}
                  </button>
                )}
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
                {(['all', 'active', 'expired'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`status-pill status-pill-${s} ${statusFilter === s ? 'active' : ''}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    <span className="status-pill-label">
                      {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Expired'}
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
                            ? String(Number(row['Reg No:']) ?? row['Reg No:'])
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
                      ? String(Number(selectedMember['Reg No:']) ?? selectedMember['Reg No:'])
                      : '?'}
                  </div>
                  <h3>{selectedMember.NAME}</h3>
                  <p className="md-meta">
                    Member ID:{(selectedMember as Record<string, unknown>).memberId ||
                      `GYM-${new Date().getFullYear()}-${Number(selectedMember['Reg No:']) ?? selectedMember['Reg No:']}`}
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
                    <button
                      type="button"
                      className="btn-edit-member btn-edit-details"
                      onClick={(e) => { e.stopPropagation(); setShowEditDetailsModal(selectedMember); }}
                    >
                      Edit details
                    </button>
                    {canEditMember && (
                      <button
                        type="button"
                        className="btn-edit-member"
                        onClick={(e) => { e.stopPropagation(); setShowMemberEditModal(selectedMember); }}
                      >
                        Edit member
                      </button>
                    )}
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
      {showEnrollSuccessPopup && (
        <SuccessPopup
          message="Successfully added! Member can check in by face."
          onClose={() => {
            setShowEnrollSuccessPopup(false);
            handleNavChange('checkin');
          }}
        />
      )}
      {expiredCheckInPopup && (
        <SuccessPopup
          message={expiredCheckInPopup.message}
          durationMs={0}
          onClose={() => setExpiredCheckInPopup(null)}
          details={
            expiredCheckInPopup.member ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {expiredCheckInPopup.member.name != null && (
                  <li><strong>Name:</strong> {expiredCheckInPopup.member.name}</li>
                )}
                {expiredCheckInPopup.member.regNo != null && (
                  <li><strong>Reg. No.:</strong> {expiredCheckInPopup.member.regNo}</li>
                )}
                {expiredCheckInPopup.member.phone != null && expiredCheckInPopup.member.phone !== '' && (
                  <li><strong>Phone:</strong> {expiredCheckInPopup.member.phone}</li>
                )}
                {expiredCheckInPopup.member.dueDate != null && (
                  <li><strong>Due date:</strong> {expiredCheckInPopup.member.dueDate}</li>
                )}
              </ul>
            ) : null
          }
        />
      )}
    </Layout>
  );
}
