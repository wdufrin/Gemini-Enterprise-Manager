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
import type { ToastItem, ToastType } from '../../context/ToastContext';

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const toastTypeStyles: Record<
  ToastType,
  {
    border: string;
    iconColor: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  success: {
    border: 'border-emerald-500/60 shadow-emerald-950/20',
    iconColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-950/80',
    badgeText: 'text-emerald-300',
  },
  error: {
    border: 'border-rose-500/60 shadow-rose-950/20',
    iconColor: 'text-rose-400',
    badgeBg: 'bg-rose-950/80',
    badgeText: 'text-rose-300',
  },
  warning: {
    border: 'border-amber-500/60 shadow-amber-950/20',
    iconColor: 'text-amber-400',
    badgeBg: 'bg-amber-950/80',
    badgeText: 'text-amber-300',
  },
  info: {
    border: 'border-blue-500/60 shadow-blue-950/20',
    iconColor: 'text-blue-400',
    badgeBg: 'bg-blue-950/80',
    badgeText: 'text-blue-300',
  },
};

const ToastIcon: React.FC<{ type: ToastType }> = ({ type }) => {
  switch (type) {
    case 'success':
      return (
        <svg
          className="w-5 h-5 flex-shrink-0 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'error':
      return (
        <svg
          className="w-5 h-5 flex-shrink-0 text-rose-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'warning':
      return (
        <svg
          className="w-5 h-5 flex-shrink-0 text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg
          className="w-5 h-5 flex-shrink-0 text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
  }
};

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const style = toastTypeStyles[toast.type];
        const isAlert = toast.type === 'error' || toast.type === 'warning';

        return (
          <div
            key={toast.id}
            role={isAlert ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto bg-gray-800/95 backdrop-blur-sm border ${style.border} rounded-lg shadow-xl p-3.5 flex items-start space-x-3 text-sm text-gray-200 transition-all transform duration-200 animate-in fade-in slide-in-from-bottom-2`}
          >
            <ToastIcon type={toast.type} />

            <div className="flex-1 min-w-0 pr-1">
              {toast.title && (
                <p className="font-semibold text-gray-100 text-xs uppercase tracking-wider mb-0.5">
                  {toast.title}
                </p>
              )}
              <p className="text-xs text-gray-200 break-words leading-relaxed">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="flex-shrink-0 text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-700/60 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
