import React, { useState, useEffect } from 'react';
import { format, addMonths, parseISO } from 'date-fns';
import type { EnquiryListItem } from '../api/client';
import './AddMemberModal.css';

const RATES: Record<string, Record<number, number>> = {
  Gendral: { 1: 800, 3: 2200, 6: 3999, 12: 7999 },
  Cardio: { 1: 1000, 3: 2700, 6: 4999, 12: 8999 },
};

type FormState = {
  NAME: string;
  Gender: string;
  'Date of Joining': number;
  'Phone Number': string;
  'Typeof pack': string;
  'Fees Options': number;
  'Fees Amount': number;
  'DUE DATE': number;
  comments: string;
};

export default function ConvertToMemberModal({
  enquiry,
  onClose,
  onSubmit,
}: {
  enquiry: EnquiryListItem;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>({
    NAME: enquiry.name,
    Gender: 'Male',
    'Date of Joining': Date.now(),
    'Phone Number': enquiry.phoneNumber,
    'Typeof pack': 'Gendral',
    'Fees Options': 1,
    'Fees Amount': 800,
    'DUE DATE': addMonths(new Date(), 1).getTime(),
    comments: enquiry.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (key: keyof FormState, value: string | number) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'Fees Options' || key === 'Typeof pack') {
        const opts = Number(next['Fees Options']) || 1;
        const pack = next['Typeof pack'] || 'Gendral';
        next['Fees Amount'] = RATES[pack]?.[opts] ?? 800;
        next['DUE DATE'] = addMonths(new Date(), opts).getTime();
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.NAME.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      const data = {
        NAME: form.NAME,
        Gender: form.Gender,
        'Date of Joining': form['Date of Joining'],
        'Phone Number': form['Phone Number'],
        'Typeof pack': form['Typeof pack'],
        'Fees Options': form['Fees Options'],
        'Fees Amount': form['Fees Amount'],
        'DUE DATE': form['DUE DATE'],
        comments: form.comments,
        lastUpdateDateTime: String(Date.now()),
        monthlyAttendance: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 },
      };
      await onSubmit(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Convert to Member</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="enquiry-followup-context">
          Prefilled from enquiry: {enquiry.name} · {enquiry.phoneNumber}
        </p>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}
          <div className="form-section">
            <h4>About</h4>
            <div className="form-row">
              <label>Full Name *</label>
              <input
                value={form.NAME}
                onChange={(e) => update('NAME', e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div className="form-row form-row-radio">
              <label>Gender</label>
              <div className="radio-group">
                <label className="radio-opt">
                  <input type="radio" name="gender" value="Male" checked={form.Gender === 'Male'} onChange={(e) => update('Gender', e.target.value)} /> Male
                </label>
                <label className="radio-opt">
                  <input type="radio" name="gender" value="Female" checked={form.Gender === 'Female'} onChange={(e) => update('Gender', e.target.value)} /> Female
                </label>
              </div>
            </div>
            <div className="form-row">
              <label>Phone Number *</label>
              <input
                type="tel"
                value={form['Phone Number']}
                onChange={(e) => update('Phone Number', e.target.value)}
                placeholder="Phone number"
                required
              />
            </div>
          </div>
          <div className="form-section">
            <h4>Membership</h4>
            <div className="form-row">
              <label>Package Type</label>
              <select value={form['Typeof pack']} onChange={(e) => update('Typeof pack', e.target.value)}>
                <option value="Gendral">Gendral</option>
                <option value="Cardio">Cardio</option>
              </select>
            </div>
            <div className="form-row">
              <label>Date of Joining</label>
              <input
                type="date"
                value={format(new Date(form['Date of Joining']), 'yyyy-MM-dd')}
                onChange={(e) => update('Date of Joining', new Date(e.target.value).getTime())}
                title="Past, today, and future dates allowed"
              />
            </div>
            <div className="form-row">
              <label>Duration</label>
              <select value={form['Fees Options']} onChange={(e) => update('Fees Options', Number(e.target.value))}>
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
                value={form['Fees Amount']}
                onChange={(e) => update('Fees Amount', Number(e.target.value))}
                className="amount-input"
              />
            </div>
            <div className="form-row">
              <label>Due Date</label>
              <input
                type="date"
                value={format(new Date(form['DUE DATE']), 'yyyy-MM-dd')}
                onChange={(e) => update('DUE DATE', new Date(e.target.value).getTime())}
              />
            </div>
          </div>
          <div className="form-row">
            <label>Comments</label>
            <textarea
              value={form.comments}
              onChange={(e) => update('comments', e.target.value)}
              rows={2}
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Converting...' : 'Convert & Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
