import React, { useState } from 'react';
import { format } from 'date-fns';
import type { EnquiryListItem } from '../api/client';
import './AddMemberModal.css';

const TYPES = ['Call', 'WhatsApp', 'Visit'] as const;

export default function EnquiryFollowUpModal({
  enquiry,
  onClose,
  onSubmit,
  defaultFollowUpType = 'Call',
}: {
  enquiry: EnquiryListItem;
  onClose: () => void;
  onSubmit: (data: { followUpType: string; notes?: string; nextFollowUpDate?: string }) => Promise<void>;
  /** Pre-select type when opened from WhatsApp icon (same as gym member flow). */
  defaultFollowUpType?: 'Call' | 'WhatsApp' | 'Visit';
}) {
  const [followUpType, setFollowUpType] = useState<'Call' | 'WhatsApp' | 'Visit'>(defaultFollowUpType);
  const [notes, setNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        followUpType,
        notes: notes.trim() || undefined,
        nextFollowUpDate: nextFollowUpDate || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add follow-up');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Follow-up</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="enquiry-followup-context">
          {enquiry.name} · {enquiry.phoneNumber}
        </p>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}
          <div className="form-row">
            <label>Follow-up Date</label>
            <input type="text" value={format(new Date(), 'dd MMM yyyy')} readOnly disabled className="input-readonly" />
          </div>
          <div className="form-row">
            <label>Follow-up Type</label>
            <select
              value={followUpType}
              onChange={(e) => setFollowUpType(e.target.value as 'Call' | 'WhatsApp' | 'Visit')}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Follow-up notes"
            />
          </div>
          <div className="form-row">
            <label>Next Follow-up Date (optional)</label>
            <input
              type="date"
              value={nextFollowUpDate}
              onChange={(e) => setNextFollowUpDate(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Add Follow-up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
