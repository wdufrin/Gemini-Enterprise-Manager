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

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useMemo,
  useEffect,
} from 'react';
import { ToastContainer } from '../components/common/ToastContainer';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  durationMs: number;
  timestamp: number;
}

export interface ToastContextType {
  toasts: ToastItem[];
  showToast: (
    message: string,
    type?: ToastType,
    durationMs?: number,
    title?: string
  ) => string;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
  toast: {
    success: (message: string, durationMs?: number, title?: string) => string;
    error: (message: string, durationMs?: number, title?: string) => string;
    warning: (message: string, durationMs?: number, title?: string) => string;
    info: (message: string, durationMs?: number, title?: string) => string;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 5000,
  error: 6000,
};

const MAX_TOASTS = 6;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = 'info',
      durationMs?: number,
      title?: string
    ): string => {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const effectiveDuration =
        durationMs !== undefined ? durationMs : DEFAULT_DURATION[type];

      const newToast: ToastItem = {
        id,
        type,
        message,
        title,
        durationMs: effectiveDuration,
        timestamp: Date.now(),
      };

      setToasts((prev) => {
        const next = [newToast, ...prev];
        if (next.length > MAX_TOASTS) {
          // Dismiss oldest excess toasts
          const excess = next.slice(MAX_TOASTS);
          excess.forEach((t) => {
            const timer = timersRef.current.get(t.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(t.id);
            }
          });
          return next.slice(0, MAX_TOASTS);
        }
        return next;
      });

      if (effectiveDuration > 0) {
        const timer = setTimeout(() => {
          dismissToast(id);
        }, effectiveDuration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismissToast]
  );

  // Clean up all timers on unmount
  useEffect(() => {
    const currentTimers = timersRef.current;
    return () => {
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  const toastHelpers = useMemo(
    () => ({
      success: (msg: string, dur?: number, title?: string) =>
        showToast(msg, 'success', dur, title),
      error: (msg: string, dur?: number, title?: string) =>
        showToast(msg, 'error', dur, title),
      warning: (msg: string, dur?: number, title?: string) =>
        showToast(msg, 'warning', dur, title),
      info: (msg: string, dur?: number, title?: string) =>
        showToast(msg, 'info', dur, title),
    }),
    [showToast]
  );

  const contextValue = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast,
      clearAllToasts,
      toast: toastHelpers,
    }),
    [toasts, showToast, dismissToast, clearAllToasts, toastHelpers]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
