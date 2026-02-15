import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../api/client';
import './CheckIn.css';

type QRMember = { regNo: number; name: string };

export default function CheckIn() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t') || '';
  const [members, setMembers] = useState<QRMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<QRMember | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setMessage({ type: 'error', text: 'Invalid link. Please scan the QR code at the gym.' });
      return;
    }
    setMessage(null);
    api.attendance.getCheckInQRMembers(token).then((r) => setMembers(r.members || [])).catch(() => setMembers([]));
  }, [token]);

  const matches = (() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
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
    try {
      const res = await api.attendance.checkInByQR(token, regNo);
      setMessage({ type: 'success', text: res.name ? `Welcome, ${res.name}! Check-in recorded. You’ll appear in the gym’s Attendance tab.` : 'Check-in recorded.' });
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

  return (
    <div className="checkin-page">
      <div className="checkin-card">
        <h1>Gym Check-in</h1>
        <p className="checkin-hint">Type your name or Reg. No. — autocomplete will suggest you. Select yourself and tap Check In.</p>
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
            {dropdownOpen && searchQuery.trim() && (
              <div ref={dropdownRef} className="checkin-dropdown" role="listbox">
                {matches.length === 0 ? (
                  <div className="checkin-dropdown-item checkin-dropdown-empty">No match — type your Reg. No. and tap Check In</div>
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
        {message && (
          <p className={message.type === 'success' ? 'checkin-success' : 'checkin-error'}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
