import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getApiErrorMessage } from '../api/client';
import './CheckIn.css';

export default function CheckIn() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t') || '';
  const [regNo, setRegNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!token) setMessage({ type: 'error', text: 'Invalid link. Please scan the QR code at the gym.' });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(regNo.trim(), 10);
    if (!token || isNaN(num)) {
      setMessage({ type: 'error', text: 'Please enter your Registration number.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await api.attendance.checkInByQR(token, num);
      setMessage({ type: 'success', text: res.name ? `Welcome, ${res.name}! Check-in successful.` : 'Check-in successful.' });
      setRegNo('');
    } catch (err) {
      setMessage({ type: 'error', text: getApiErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

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
        <p className="checkin-hint">Enter your Registration number to mark attendance.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Reg. No."
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            disabled={submitting}
            autoFocus
            className="checkin-input"
          />
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
