import React, { useState, useEffect } from 'react';
import { format, addMonths, isAfter, differenceInDays } from 'date-fns';
import { api } from '../api/client';
import './PayFeesModal.css';

const RATES: Record<string, Record<number, number>> = {
  Gendral: { 1: 800, 3: 2200, 6: 3999, 12: 7999 },
  Cardio: { 1: 1000, 3: 2700, 6: 4999, 12: 8999 },
};

export interface PayFeesModalProps {
  member: Record<string, unknown>;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

const LONG_DEFAULTER_DAYS = 30;

export default function PayFeesModal({ member, onClose, onSave }: PayFeesModalProps) {
  const dueRaw = member.dueDate ?? member['DUE DATE'];
  const currentDue = dueRaw ? new Date(dueRaw as string | number) : null;
  const today = new Date();
  const isLongDefaulter =
    currentDue && !isAfter(currentDue, today) && differenceInDays(today, currentDue) > LONG_DEFAULTER_DAYS;
  const defaultStartFromToday = !!isLongDefaulter;

  const [startFromToday, setStartFromToday] = useState(defaultStartFromToday);
  const [receiptId, setReceiptId] = useState<string>('');
  const [pack, setPack] = useState<string>((member['Typeof pack'] as string) || 'Gendral');
  const [duration, setDuration] = useState<number>(Number(member['Fees Options']) || 1);
  const [amount, setAmount] = useState<number>(Number(member['Fees Amount']) || 800);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customDueDate, setCustomDueDate] = useState<Date | null>(null);

  useEffect(() => {
    api.legacy.getNextReceiptId().then((r) => setReceiptId(r.receiptId)).catch(() => setReceiptId('—'));
  }, []);

  useEffect(() => {
    const amt = RATES[pack]?.[duration] ?? 800;
    setAmount(amt);
  }, [pack, duration]);

  useEffect(() => {
    setCustomDueDate(null);
  }, [startFromToday, pack, duration, currentDue?.getTime()]);

  const baseDate = startFromToday ? today : (currentDue || today);
  const computedDueDate = addMonths(baseDate, duration);
  const todayStr = format(today, 'yyyy-MM-dd');
  const maxDueDate = today;
  const newDueDateRaw = customDueDate ?? computedDueDate;
  const newDueDate = isAfter(newDueDateRaw, maxDueDate) ? maxDueDate : newDueDateRaw;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (amount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }
    setSaving(true);
    try {
      const updateData = {
        ...member,
        'Reg No:': member['Reg No:'],
        'Typeof pack': pack,
        'Fees Options': duration,
        'Fees Amount': amount,
        'DUE DATE': newDueDate.getTime(),
        comments: [receiptId && receiptId !== '—' ? `Receipt: ${receiptId}` : null, member.comments, comment.trim()].filter(Boolean).join('; '),
        lastUpdateDateTime: new Date().toISOString(),
      };
      await onSave(updateData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update fees');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal pay-fees-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Pay fees</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="pf-member">
          {member.NAME as string} — Reg No: {member['Reg No:']}
          {currentDue && (
            <span className="pf-current-due"> (Current due: {format(currentDue, 'MMM d, yyyy')})</span>
          )}
        </p>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}
          <div className="form-section">
            <h4>Payment</h4>
            <div className="form-row">
              <label>Package type</label>
              <select value={pack} onChange={(e) => setPack(e.target.value)}>
                <option value="Gendral">Gendral</option>
                <option value="Cardio">Cardio</option>
              </select>
            </div>
            <div className="form-row">
              <label>Duration</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={1}>1 Month</option>
                <option value={3}>3 Months</option>
                <option value={6}>6 Months</option>
                <option value={12}>12 Months</option>
              </select>
            </div>
            <div className="form-row">
              <label>Amount (₹)</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="amount-input"
              />
            </div>
            <div className="form-row pf-start-from">
              <label className="pf-checkbox-label">
                <input
                  type="checkbox"
                  checked={startFromToday}
                  onChange={(e) => setStartFromToday(e.target.checked)}
                />
                Start from current date
              </label>
              <span className="pf-hint">
                {startFromToday ? 'Due date = today + duration' : 'Due date = last due + duration'}
              </span>
            </div>
            <div className="form-row pf-new-due">
              <label>New due date</label>
              <input
                type="date"
                value={format(newDueDate, 'yyyy-MM-dd')}
                max={todayStr}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setCustomDueDate(new Date(v));
                  else setCustomDueDate(null);
                }}
                className="pf-due-input"
                title="Only today or past dates (future disabled)"
              />
              <span className="pf-due-hint">Computed: {format(computedDueDate, 'MMM d, yyyy')}. Only today or past allowed.</span>
            </div>
          </div>
          <div className="form-row">
            <label>Comment (optional)</label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Cash received"
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Update fees'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
