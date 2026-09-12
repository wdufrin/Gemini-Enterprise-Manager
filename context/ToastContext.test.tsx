/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContext';

describe('ToastContext & ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('throws an error when useToast is used outside of ToastProvider', () => {
    // Suppress console.error from React during boundary test
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within a ToastProvider'
    );
    consoleError.mockRestore();
  });

  it('renders children properly', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Hello World</div>
      </ToastProvider>
    );

    expect(screen.getByTestId('child')).toHaveTextContent('Hello World');
  });

  it('displays a success toast and auto-dismisses after duration', () => {
    const TestComponent = () => {
      const { toast } = useToast();
      return (
        <button onClick={() => toast.success('Operation completed successfully')}>
          Trigger Toast
        </button>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    expect(screen.queryByText('Operation completed successfully')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Trigger Toast'));

    expect(screen.getByText('Operation completed successfully')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Fast-forward past default duration (4000ms)
    act(() => {
      vi.advanceTimersByTime(4001);
    });

    expect(screen.queryByText('Operation completed successfully')).not.toBeInTheDocument();
  });

  it('displays error toast with role="alert" and allows manual dismissal', () => {
    const TestComponent = () => {
      const { toast } = useToast();
      return (
        <button onClick={() => toast.error('Failed to update resource', 0, 'Critical Error')}>
          Trigger Error
        </button>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Trigger Error'));
    });

    expect(screen.getByText('Failed to update resource')).toBeInTheDocument();
    expect(screen.getByText('Critical Error')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: /dismiss notification/i });
    act(() => {
      fireEvent.click(dismissBtn);
    });

    expect(screen.queryByText('Failed to update resource')).not.toBeInTheDocument();
  });

  it('supports warning and info toast helpers', () => {
    const TestComponent = () => {
      const { toast } = useToast();
      return (
        <div>
          <button onClick={() => toast.warning('Warning message')}>Warn</button>
          <button onClick={() => toast.info('Info message')}>Info</button>
        </div>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Warn'));
    });
    act(() => {
      fireEvent.click(screen.getByText('Info'));
    });

    expect(screen.getByText('Warning message')).toBeInTheDocument();
    expect(screen.getByText('Info message')).toBeInTheDocument();
  });

  it('caps max toasts and discards oldest on excess', () => {
    const TestComponent = () => {
      const { showToast } = useToast();
      return (
        <button
          onClick={() => {
            for (let i = 1; i <= 8; i++) {
              showToast(`Message ${i}`, 'info', 10000);
            }
          }}
        >
          Spam Toasts
        </button>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Spam Toasts'));
    });

    // Newest toasts (8, 7, 6, 5, 4, 3) should be kept, 1 and 2 discarded
    expect(screen.getByText('Message 8')).toBeInTheDocument();
    expect(screen.getByText('Message 3')).toBeInTheDocument();
    expect(screen.queryByText('Message 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Message 2')).not.toBeInTheDocument();
  });

  it('clears all toasts with clearAllToasts', () => {
    const TestComponent = () => {
      const { toast, clearAllToasts } = useToast();
      return (
        <div>
          <button onClick={() => toast.info('Toast A', 0)}>Add A</button>
          <button onClick={() => toast.info('Toast B', 0)}>Add B</button>
          <button onClick={clearAllToasts}>Clear All</button>
        </div>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Add A'));
      fireEvent.click(screen.getByText('Add B'));
    });
    expect(screen.getByText('Toast A')).toBeInTheDocument();
    expect(screen.getByText('Toast B')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText('Clear All'));
    });
    expect(screen.queryByText('Toast A')).not.toBeInTheDocument();
    expect(screen.queryByText('Toast B')).not.toBeInTheDocument();
  });
});
