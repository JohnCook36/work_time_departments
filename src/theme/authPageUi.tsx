import React from 'react';

import { authPalette } from './palette';

export const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  background:
    'radial-gradient(circle at top, ' + authPalette.pageRadial + ', transparent 38%), ' + authPalette.pageBackground,
  color: authPalette.text,
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export const cardStyle: React.CSSProperties = {
  width: 'min(520px, 100%)',
  padding: 24,
  borderRadius: 18,
  border: '1px solid ' + authPalette.cardBorder,
  background: authPalette.cardBackground,
  boxShadow: authPalette.cardShadow,
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid ' + authPalette.inputBorder,
  background: authPalette.inputBackground,
  color: authPalette.inputText,
  outline: 'none',
};

export const buttonStyle: React.CSSProperties = {
  minHeight: 42,
  padding: '0 14px',
  border: 0,
  borderRadius: 10,
  background: authPalette.buttonBackground,
  color: authPalette.buttonText,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

export const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: authPalette.secondaryBackground,
  color: authPalette.text,
  border: '1px solid ' + authPalette.secondaryBorder,
};

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 10,
        background: authPalette.errorBackground,
        color: authPalette.errorText,
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}
