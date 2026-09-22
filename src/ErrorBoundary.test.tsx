import React, { Component } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const error = new Error('private employee data /internal/src/App.tsx');
error.stack = 'SECRET_STACK at /internal/src/App.tsx:42';

function BrokenRender(): React.ReactNode {
  throw error;
}

class BrokenLifecycle extends Component {
  componentDidMount() {
    throw error;
  }

  render() {
    return <p>Original child</p>;
  }
}

describe('ErrorBoundary', () => {
  const suppressExpectedError = (event: ErrorEvent) => {
    if (event.error === error) event.preventDefault();
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.addEventListener('error', suppressExpectedError);
  });

  afterEach(() => window.removeEventListener('error', suppressExpectedError));

  it('renders healthy children without a fallback', () => {
    render(<ErrorBoundary><p>Healthy child</p></ErrorBoundary>);
    expect(screen.getByText('Healthy child')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перезагрузить' })).not.toBeInTheDocument();
  });

  it.each([BrokenRender, BrokenLifecycle])('replaces a crashed tree with a safe standalone fallback (%s)', (BrokenChild) => {
    render(
      <ErrorBoundary>
        <p>Original sibling</p>
        <BrokenChild />
      </ErrorBoundary>,
    );
    expect(screen.queryByText('Original sibling')).not.toBeInTheDocument();
    expect(screen.queryByText('Original child')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Что-то пошло не так' })).toBeInTheDocument();
    expect(screen.getByText('Не удалось отобразить приложение. Перезагрузите страницу и попробуйте снова.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезагрузить' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent(error.message);
    expect(screen.getByRole('alert')).not.toHaveTextContent(error.stack!);
    expect(screen.getByRole('alert').innerHTML).not.toMatch(/private employee|SECRET_STACK|\/internal/);
  });

});
