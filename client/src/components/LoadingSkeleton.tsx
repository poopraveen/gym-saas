import React from 'react';
import './LoadingSkeleton.css';

export function CardSkeleton() {
  return <div className="skeleton card-skeleton" />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton list-row-skeleton" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="chart-skeleton">
      <div className="skeleton chart-bar" style={{ height: '60%' }} />
      <div className="skeleton chart-bar" style={{ height: '80%' }} />
      <div className="skeleton chart-bar" style={{ height: '45%' }} />
      <div className="skeleton chart-bar" style={{ height: '90%' }} />
      <div className="skeleton chart-bar" style={{ height: '70%' }} />
    </div>
  );
}
