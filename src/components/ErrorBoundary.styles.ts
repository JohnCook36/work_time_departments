import styled from '@emotion/styled';

import { fallbackPalette } from '../theme/palette';

export const ErrorBoundaryPage = styled('main')({
  boxSizing: 'border-box',
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: fallbackPalette.background,
  color: fallbackPalette.text,
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'center',
});

export const ErrorBoundaryContent = styled('div')({
  maxWidth: 480,
});

export const ErrorBoundaryTitle = styled('h1')({
  fontSize: 28,
});

export const ErrorBoundaryText = styled('p')({
  lineHeight: 1.6,
});

export const ErrorBoundaryReloadButton = styled('button')({
  padding: '12px 20px',
  border: '1px solid ' + fallbackPalette.action,
  borderRadius: 8,
  background: fallbackPalette.action,
  color: fallbackPalette.actionText,
  font: 'inherit',
  cursor: 'pointer',
});
