import React from 'react';

type LogoProps = {
  compact?: boolean;
  /** Tenant/gym name – when provided, shown instead of default "Reps & Dips" */
  tenantName?: string;
  /** Tenant logo URL – when provided, shown instead of default SVG icon */
  logoUrl?: string;
};

export default function Logo({ compact = false, tenantName, logoUrl }: LogoProps) {
  const displayName = tenantName || 'Reps & Dips';
  return (
    <div className={`logo ${compact ? 'logo-compact' : ''}`}>
      {logoUrl ? (
        <img src={logoUrl} alt={displayName} className="logo-img" />
      ) : (
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="logo-icon"
        >
          <circle cx="24" cy="24" r="20" fill="url(#logoGrad)" />
          <path
            d="M16 28v-8l8 4 8-4v8l-8 4-8-4z"
            fill="white"
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M24 20v8M20 22l4 2 4-2"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="logoGrad" x1="8" y1="8" x2="40" y2="40">
              <stop stopColor="#3b82f6" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
      )}
      {!compact && (
        <span className="logo-text">
          {tenantName ? displayName : <><strong>Reps</strong> &amp; Dips</>}
        </span>
      )}
    </div>
  );
}
