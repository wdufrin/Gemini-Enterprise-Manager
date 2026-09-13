/**
 * Copyright 2026 Google LLC
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

import React, { useRef, useId } from 'react';
import { useModalA11y } from '../../hooks/useModalA11y';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  titleId?: string;
  descriptionId?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  preventClose?: boolean;
  className?: string;
  bodyClassName?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  headerIcon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  showCloseButton?: boolean;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  full: 'max-w-[95vw] h-[90vh]'
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  titleId: propTitleId,
  descriptionId: propDescriptionId,
  children,
  footer,
  size = 'md',
  preventClose = false,
  className = '',
  bodyClassName = 'p-6',
  initialFocusRef,
  headerIcon,
  headerExtra,
  showCloseButton = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const titleId = propTitleId || `${generatedId}-title`;
  const descriptionId = subtitle ? propDescriptionId || `${generatedId}-desc` : propDescriptionId;

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    initialFocusRef,
    preventClose
  });

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !preventClose) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-fade-in"
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={descriptionId}
      onClick={handleBackdropClick}
    >
      <div
        ref={containerRef}
        className={`bg-gray-800 border border-gray-700/80 rounded-xl shadow-2xl w-full ${SIZE_CLASSES[size]} flex flex-col max-h-[90vh] overflow-hidden ${className}`}
        tabIndex={-1}
      >
        {(title || showCloseButton) && (
          <header className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/80 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {headerIcon && <div className="shrink-0">{headerIcon}</div>}
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-lg font-bold text-white leading-tight truncate">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p id={descriptionId} className="text-xs text-gray-400 mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-4">
              {headerExtra}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={preventClose}
                  aria-label="Close dialog"
                  className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </header>
        )}

        <main className={`overflow-y-auto flex-1 ${bodyClassName}`}>
          {children}
        </main>

        {footer && (
          <footer className="px-6 py-4 bg-gray-900/60 border-t border-gray-700 flex justify-end items-center gap-3 shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

export default Modal;
