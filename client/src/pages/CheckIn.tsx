import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, isValid } from 'date-fns';
import { api, getApiErrorMessage } from '../api/client';
import FaceCaptureModal from '../components/FaceCaptureModal';
import SuccessPopup from '../components/SuccessPopup';
import './CheckIn.css';

type QRMember = { regNo: number; name: string };

type MemberSummary = {
  name: string;
  dueDate?: string;
  phoneNumber?: string;
  typeofPack?: string;
};

export default function CheckIn() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t') || '';
  const [members, setMembers] = useState<QRMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<QRMember | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastCheckInInfo, setLastCheckInInfo] = useState<{
    memberSummary: MemberSummary;
    checkInTime?: string;
  } | null>(null);
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setMessage({ type: 'error', text: 'Invalid link. Please scan the QR code at the gym.' });
      setMembersLoading(false);
      return;
    }
    setMessage(null);
    setMembersLoading(true);
    api.attendance
      .getCheckInQRMembers(token)
      .then((r) => setMembers(r.members || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [token]);

  /** Show filtered list when typing, or first 15 when focused with no query (so tap/click shows list). */
  const matches = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 15);
    const qNum = /^\d+$/.test(q) ? parseInt(q, 10) : NaN;
    const filtered = members.filter(
      (m) => m.name.toLowerCase().includes(q) || String(m.regNo).includes(q),
    );
    const sorted = !isNaN(qNum)
      ? [...filtered].sort((a, b) => {
          const aExact = a.regNo === qNum ? 1 : 0;
          const bExact = b.regNo === qNum ? 1 : 0;
          return bExact - aExact;
        })
      : filtered;
    return sorted.slice(0, 15);
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const regNo = selectedMember?.regNo ?? (searchQuery.trim() ? parseInt(searchQuery.trim(), 10) : NaN);
    if (!token || isNaN(regNo)) {
      setMessage({ type: 'error', text: 'Type name or Reg. No., pick yourself from the list, then tap Check In.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    setLastCheckInInfo(null);
    try {
      const res = await api.attendance.checkInByQR(token, regNo);
      setMessage({ type: 'success', text: res.name ? `Welcome, ${res.name}! Check-in recorded. You’ll appear in the gym’s Attendance tab.` : 'Check-in recorded.' });
      if (res.memberSummary) {
        setLastCheckInInfo({ memberSummary: res.memberSummary, checkInTime: res.checkInTime });
      }
      setSearchQuery('');
      setSelectedMember(null);
      setDropdownOpen(false);
    } catch (err) {
      setMessage({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [dropdownOpen]);

  if (!token) {
    return (
      <div className="checkin-page">
        <div className="checkin-card">
          <h1>Gym Check-in</h1>
          <p className="checkin-error">Invalid link. Please scan the QR code displayed at the gym.</p>
        </div>
      </div>
    );
  }

  const showForm = message?.type !== 'success';

  return (
    <div className="checkin-page">
      <div className="checkin-card">
        <h1>Gym Check-in</h1>
        {showForm ? (
          <>
            <p className="checkin-hint">Use face recognition (if enrolled) or type your name/Reg. No. and tap Check In.</p>
            <p className="checkin-hint checkin-hint-face">Members who have enrolled their face must use the <strong>face scan</strong> option to check in.</p>
            <div className="checkin-face-row">
              <button
                type="button"
                className="checkin-btn checkin-face-btn"
                onClick={() => setShowFaceModal(true)}
                disabled={submitting}
              >
                Check in with face
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="checkin-autocomplete-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="text"
                  placeholder="Type name or Reg. No. — autocomplete will suggest"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDropdownOpen(true);
                    if (!e.target.value.trim()) setSelectedMember(null);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches.length === 1 && !selectedMember) {
                      setSelectedMember(matches[0]);
                      setSearchQuery(matches[0].name);
                      setDropdownOpen(false);
                    }
                    if (e.key === 'Escape') setDropdownOpen(false);
                  }}
                  disabled={submitting}
                  autoFocus
                  className="checkin-input"
                  aria-autocomplete="list"
                  aria-expanded={dropdownOpen}
                />
                {dropdownOpen && (searchQuery.trim() || members.length > 0) && (
                  <div ref={dropdownRef} className="checkin-dropdown" role="listbox">
                    {membersLoading ? (
                      <div className="checkin-dropdown-item checkin-dropdown-empty">Loading…</div>
                    ) : matches.length === 0 ? (
                      <div className="checkin-dropdown-item checkin-dropdown-empty">
                        {members.length === 0 ? 'Enter your Reg. No. below and tap Check In.' : 'No match — type your Reg. No. and tap Check In'}
                      </div>
                    ) : (
                      matches.map((m) => (
                        <button
                          key={m.regNo}
                          type="button"
                          role="option"
                          className={`checkin-dropdown-item ${selectedMember?.regNo === m.regNo ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedMember(m);
                            setSearchQuery(m.name);
                            setDropdownOpen(false);
                          }}
                        >
                          {m.name} #{m.regNo}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button type="submit" disabled={submitting} className="checkin-btn">
                {submitting ? 'Checking in…' : 'Check In'}
              </button>
            </form>
            {message && message.type === 'error' && (
              <p className="checkin-error">{message.text}</p>
            )}
            {showFaceModal && (
              <FaceCaptureModal
                title="Look at the camera — then tap Capture to check in"
                captureButtonLabel="Capture & check in"
                successWatermarkText="Welcome!"
                failureMessage="Face not recognized. Gym owner has been notified. Use name/Reg. No. or try again."
                onCapture={async (descriptor) => {
                  setSubmitting(true);
                  setMessage(null);
                  setLastCheckInInfo(null);
                  try {
                    const res = await api.attendance.checkInByFace(token, descriptor);
                    setShowFaceModal(false);
                    setMessage({
                      type: 'success',
                      text: res.name ? `Welcome, ${res.name}! Check-in recorded.` : 'Check-in recorded.',
                    });
                    if (res.memberSummary) {
                      setLastCheckInInfo({
                        memberSummary: res.memberSummary,
                        checkInTime: res.checkInTime,
                      });
                    }
                    setShowSuccessPopup(true);
                    return { success: true as const };
                  } catch (err) {
                    setMessage({ type: 'error', text: getApiErrorMessage(err) });
                    return { success: false as const };
                  } finally {
                    setSubmitting(false);
                  }
                }}
                onClose={() => setShowFaceModal(false)}
              />
            )}
          </>
        ) : (
          <>
            {message && (
              <p className="checkin-success">{message.text}</p>
            )}
            {lastCheckInInfo && (
              <div className="checkin-summary" aria-label="Your details and reminder">
                <h3 className="checkin-summary-title">Your details</h3>
                <ul className="checkin-summary-list">
                  <li><strong>Name:</strong> {lastCheckInInfo.memberSummary.name}</li>
                  {lastCheckInInfo.memberSummary.phoneNumber && (
                    <li><strong>Phone:</strong> {lastCheckInInfo.memberSummary.phoneNumber}</li>
                  )}
                  {lastCheckInInfo.memberSummary.typeofPack && (
                    <li><strong>Pack:</strong> {lastCheckInInfo.memberSummary.typeofPack}</li>
                  )}
                  {lastCheckInInfo.memberSummary.dueDate && (() => {
                    const d = new Date(lastCheckInInfo.memberSummary.dueDate);
                    return isValid(d) ? (
                      <li>
                        <strong>Due date (renewal reminder):</strong>{' '}
                        {format(d, 'dd MMM yyyy')} — renew before this date to avoid interruption.
                      </li>
                    ) : null;
                  })()}
                  {lastCheckInInfo.checkInTime && (
                    <li><strong>Checked in at:</strong> {format(new Date(lastCheckInInfo.checkInTime), 'h:mm a')}</li>
                  )}
                </ul>
              </div>
            )}
            <button
              type="button"
              className="checkin-btn checkin-again-btn"
              onClick={() => {
                setMessage(null);
                setLastCheckInInfo(null);
                setSearchQuery('');
                setSelectedMember(null);
              }}
            >
              Check in again
            </button>
          </>
        )}
        {showSuccessPopup && (
          <SuccessPopup
            message="Check-in recorded! Successfully added."
            onClose={() => setShowSuccessPopup(false)}
          />
        )}
      </div>
    </div>
  );
}
