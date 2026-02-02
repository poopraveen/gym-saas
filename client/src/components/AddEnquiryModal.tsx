import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { EnquiryListItem, CreateEnquiryBody } from '../api/client';
import './AddMemberModal.css';

const defaultForm: CreateEnquiryBody & { expectedJoinDate?: string; followUpRequired?: boolean } = {
  name: '',
  phoneNumber: '',
  email: '',
  enquiryDate: format(new Date(), 'yyyy-MM-dd'),
  source: 'Walk-in',
  interestedPlan: '',
  notes: '',
  expectedJoinDate: '',
  assignedStaff: '',
  followUpRequired: true,
};

export default function AddEnquiryModal({
  enquiry,
  onClose,
  onSubmit,
  sources,
}: {
  enquiry?: EnquiryListItem | null;
  onClose: () => void;
  onSubmit: (data: CreateEnquiryBody) => Promise<void>;
  sources: readonly string[];
}) {
  const isEdit = !!enquiry;
  const [form, setForm] = useState(() => {
    if (enquiry) {
      return {
        name: enquiry.name,
        phoneNumber: enquiry.phoneNumber,
        email: enquiry.email || '',
        enquiryDate: enquiry.enquiryDate ? format(parseISO(enquiry.enquiryDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        source: enquiry.source,
        interestedPlan: enquiry.interestedPlan || '',
        notes: enquiry.notes || '',
        expectedJoinDate: enquiry.expectedJoinDate ? format(parseISO(enquiry.expectedJoinDate), 'yyyy-MM-dd') : '',
        assignedStaff: enquiry.assignedStaff || '',
        followUpRequired: enquiry.followUpRequired ?? true,
      };
    }
    return defaultForm;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!form.phoneNumber.trim()) {
      setError('Phone number is required');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        phoneNumber: form.phoneNumber.trim(),
        email: form.email?.trim() || undefined,
        enquiryDate: form.enquiryDate || undefined,
        source: form.source as CreateEnquiryBody['source'],
        interestedPlan: form.interestedPlan?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        expectedJoinDate: form.expectedJoinDate || undefined,
        assignedStaff: form.assignedStaff?.trim() || undefined,
        followUpRequired: form.followUpRequired,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Enquiry' : 'Add Enquiry'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}
          <div className="form-row">
            <label>Full Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
              required
            />
          </div>
          <div className="form-row">
            <label>Phone Number *</label>
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              placeholder="Phone number"
              required
            />
          </div>
          <div className="form-row">
            <label>Email (optional)</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email"
            />
          </div>
          <div className="form-row">
            <label>Enquiry Date</label>
            <input
              type="date"
              value={form.enquiryDate}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setForm((f) => ({ ...f, enquiryDate: e.target.value }))}
              title="Future dates disabled"
            />
          </div>
          <div className="form-row">
            <label>Source</label>
            <select
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            >
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Interested Plan (optional)</label>
            <input
              value={form.interestedPlan}
              onChange={(e) => setForm((f) => ({ ...f, interestedPlan: e.target.value }))}
              placeholder="e.g. Monthly, 3 months"
            />
          </div>
          <div className="form-row">
            <label>Notes / Remarks</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Notes"
            />
          </div>
          <div className="form-row">
            <label>Expected Join Date (optional)</label>
            <input
              type="date"
              value={form.expectedJoinDate}
              onChange={(e) => setForm((f) => ({ ...f, expectedJoinDate: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label>Assigned Staff / Trainer (optional)</label>
            <input
              value={form.assignedStaff}
              onChange={(e) => setForm((f) => ({ ...f, assignedStaff: e.target.value }))}
              placeholder="Staff name"
            />
          </div>
          <div className="form-row form-row-radio">
            <label>Follow-up Required</label>
            <div className="radio-group">
              <label className="radio-opt">
                <input
                  type="radio"
                  name="followUp"
                  checked={form.followUpRequired === true}
                  onChange={() => setForm((f) => ({ ...f, followUpRequired: true }))}
                />
                Yes
              </label>
              <label className="radio-opt">
                <input
                  type="radio"
                  name="followUp"
                  checked={form.followUpRequired === false}
                  onChange={() => setForm((f) => ({ ...f, followUpRequired: false }))}
                />
                No
              </label>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Add Enquiry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
