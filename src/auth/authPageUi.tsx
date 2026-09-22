import React from 'react';

export const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  background:
    'radial-gradient(circle at top, rgba(59,130,246,.13), transparent 38%), #0f172a',
  color: '#e5e7eb',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export const cardStyle: React.CSSProperties = {
  width: 'min(520px, 100%)',
  padding: 24,
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,.2)',
  background: 'rgba(15,23,42,.94)',
  boxShadow: '0 24px 70px rgba(0,0,0,.28)',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,.28)',
  background: '#111827',
  color: '#f8fafc',
  outline: 'none',
};

export const buttonStyle: React.CSSProperties = {
  minHeight: 42,
  padding: '0 14px',
  border: 0,
  borderRadius: 10,
  background: '#2563eb',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

export const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'rgba(148,163,184,.14)',
  color: '#e5e7eb',
  border: '1px solid rgba(148,163,184,.18)',
};

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 10,
        background: 'rgba(220,38,38,.12)',
        color: '#fecaca',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}
