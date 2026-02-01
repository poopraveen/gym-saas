import React, { useState } from 'react';
import { format } from 'date-fns';
import './FollowUpModal.css';

export interface FollowUpModalProps {
  memberId: string;
  regNo: number;
  memberName: string;
  onClose: () => void;
  onSave: (comment: string, nextFollowUpDate?: string) => Promise<void>;
}

export default function FollowUpModal({
  memberId,
  regNo,
  memberName,
  onClose,
  onSave,
}: FollowUpModalProps) {
  const [comment, setComment] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      setError('Comment is required');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave(comment.trim(), nextDate || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal follow-up-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Follow-up</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="follow-up-member">{memberName} (ID: {memberId})</p>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}
          <div className="form-row">
            <label>Comment *</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Enter follow-up comment..."
              rows={3}
              required
            />
          </div>
          <div className="form-row">
            <label>Next follow-up date</label>
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
