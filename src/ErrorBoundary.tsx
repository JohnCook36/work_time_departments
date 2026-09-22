import React, { Component, type ReactNode } from 'react';

import { fallbackPalette } from './theme/palette';

// Catches descendant React render/lifecycle errors only. Event handlers,
// async callbacks, Promise rejections and API/network errors need their own handling.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        role="alert"
        style={{
          boxSizing: 'border-box',
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: fallbackPalette.background,
          color: fallbackPalette.text,
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 28 }}>Что-то пошло не так</h1>
          <p style={{ lineHeight: 1.6 }}>
            Не удалось отобразить приложение. Перезагрузите страницу и попробуйте снова.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 20px',
              border: '1px solid ' + fallbackPalette.action,
              borderRadius: 8,
              background: fallbackPalette.action,
              color: fallbackPalette.actionText,
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Перезагрузить
          </button>
        </div>
      </main>
    );
  }
}
