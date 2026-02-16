import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import type { EnquiryListItem, EnquiryFollowUpItem } from '../api/client';
import { api } from '../api/client';
import WhatsAppButton from './WhatsAppButton';
import './AddMemberModal.css';
import './EnquiryDetailModal.css';

export default function EnquiryDetailModal({
  enquiry,
  onClose,
  onEdit,
  onFollowUp,
  onWhatsAppClick,
  onConvert,
  onMarkLost,
  onMarkAsNew,
}: {
  enquiry: EnquiryListItem;
  onClose: () => void;
  onEdit: () => void;
  onFollowUp: () => void;
  /** Open follow-up modal with type WhatsApp (same as gym member screen). */
  onWhatsAppClick?: () => void;
  onConvert?: () => void;
  onMarkLost?: () => void;
  /** When status is Lost: reopen / convert back to New */
  onMarkAsNew?: () => void;
}) {
  const [followUps, setFollowUps] = useState<EnquiryFollowUpItem[]>([]);
  const [loadingFu, setLoadingFu] = useState(true);

  useEffect(() => {
    api.enquiries.getFollowUps(enquiry._id)
      .then(setFollowUps)
      .catch(() => setFollowUps([]))
      .finally(() => setLoadingFu(false));
  }, [enquiry._id]);

  const canAct = enquiry.status !== 'Converted' && enquiry.status !== 'Lost';
  const isLost = enquiry.status === 'Lost';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-detail" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Enquiry Details</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="enquiry-detail-body">
          <div className="detail-section">
            <h4>Contact</h4>
            <dl className="detail-dl">
              <dt>Name</dt>
              <dd>{enquiry.name}</dd>
              <dt>Phone</dt>
              <dd className="detail-phone-row">
                {enquiry.phoneNumber}
                {enquiry.phoneNumber && onWhatsAppClick && (
                  <WhatsAppButton
                    phone={enquiry.phoneNumber}
                    onClick={onWhatsAppClick}
                    title="WhatsApp & add follow-up"
                  />
                )}
              </dd>
              <dt>Email</dt>
              <dd>{enquiry.email || '—'}</dd>
            </dl>
          </div>
          <div className="detail-section">
            <h4>Enquiry</h4>
            <dl className="detail-dl">
              <dt>Date</dt>
              <dd>{enquiry.enquiryDate ? format(parseISO(enquiry.enquiryDate), 'dd MMM yyyy') : '—'}</dd>
              <dt>Source</dt>
              <dd>{enquiry.source}</dd>
              <dt>Interested Plan</dt>
              <dd>{enquiry.interestedPlan || '—'}</dd>
              <dt>Expected Join Date</dt>
              <dd>{enquiry.expectedJoinDate ? format(parseISO(enquiry.expectedJoinDate), 'dd MMM yyyy') : '—'}</dd>
              <dt>Assigned Trainer</dt>
              <dd>{enquiry.assignedStaff || '—'}</dd>
              <dt>Follow-up Required</dt>
              <dd>{enquiry.followUpRequired ? 'Yes' : 'No'}</dd>
              <dt>Status</dt>
              <dd><span className={`status-badge status-${enquiry.status}`}>{enquiry.status}</span></dd>
              {enquiry.notes && (
                <>
                  <dt>Notes</dt>
                  <dd className="detail-notes">{enquiry.notes}</dd>
                </>
              )}
            </dl>
          </div>
          <div className="detail-section">
            <h4>Follow-up History</h4>
            {loadingFu ? (
              <p className="detail-muted">Loading...</p>
            ) : followUps.length === 0 ? (
              <p className="detail-muted">No follow-ups yet.</p>
            ) : (
              <ul className="followup-list">
                {followUps.map((fu) => (
                  <li key={fu._id} className="followup-item">
                    <span className="followup-date">{fu.followUpDate ? format(parseISO(fu.followUpDate), 'dd MMM yyyy') : '—'}</span>
                    <span className="followup-type">{fu.followUpType}</span>
                    {fu.notes && <p className="followup-notes">{fu.notes}</p>}
                    {fu.nextFollowUpDate && (
                      <span className="followup-next">Next: {format(parseISO(fu.nextFollowUpDate), 'dd MMM')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-actions enquiry-detail-actions">
            {canAct && (
              <>
                <button type="button" className="btn-secondary" onClick={onEdit}>Edit</button>
                <button type="button" className="btn-secondary" onClick={onFollowUp}>Add Follow-up</button>
                {onConvert && <button type="button" className="btn-primary" onClick={onConvert}>Convert to Member</button>}
                {onMarkLost && <button type="button" className="btn-lost" onClick={onMarkLost}>Mark as Lost</button>}
              </>
            )}
            {isLost && onMarkAsNew && (
              <button type="button" className="btn-primary btn-mark-new" onClick={onMarkAsNew}>
                Mark as New
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
