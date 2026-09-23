import React, { Component, type ReactNode } from 'react';

import {
  ErrorBoundaryContent,
  ErrorBoundaryPage,
  ErrorBoundaryReloadButton,
  ErrorBoundaryText,
  ErrorBoundaryTitle,
} from './ErrorBoundary.styles';

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
      <ErrorBoundaryPage role="alert">
        <ErrorBoundaryContent>
          <ErrorBoundaryTitle>Что-то пошло не так</ErrorBoundaryTitle>
          <ErrorBoundaryText>
            Не удалось отобразить приложение. Перезагрузите страницу и попробуйте снова.
          </ErrorBoundaryText>
          <ErrorBoundaryReloadButton
            type="button"
            onClick={() => window.location.reload()}
          >
            Перезагрузить
          </ErrorBoundaryReloadButton>
        </ErrorBoundaryContent>
      </ErrorBoundaryPage>
    );
  }
}
