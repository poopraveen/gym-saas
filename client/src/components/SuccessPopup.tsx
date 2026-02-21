import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './SuccessPopup.css';

type Props = {
  message: string;
  onClose: () => void;
  /** Auto-close after this many ms (default 2200). Set 0 to disable. */
  durationMs?: number;
  /** Optional details (e.g. member info) shown below the message. */
  details?: React.ReactNode;
};

export default function SuccessPopup({ message, onClose, durationMs = 2200, details }: Props) {
  useEffect(() => {
    if (durationMs > 0) {
      const t = setTimeout(onClose, durationMs);
      return () => clearTimeout(t);
    }
  }, [onClose, durationMs]);

  const content = (
    <div
      className="success-popup-overlay"
      role="alert"
      aria-live="polite"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="success-popup-card">
        <div className="success-popup-icon">✓</div>
        <p className="success-popup-message">{message}</p>
        {details && <div className="success-popup-details">{details}</div>}
        {durationMs === 0 && (
          <button type="button" className="success-popup-close-btn" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
