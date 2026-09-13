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

import React, { useRef, useId } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isConfirming?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isConfirming = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isConfirming,
  });

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isConfirming) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-fade-in"
      aria-modal="true"
      role="dialog"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      >
        <header className="p-4 border-b border-gray-700 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400 mr-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 id={titleId} className="text-xl font-bold text-white">{title}</h2>
        </header>

        <main className="p-6">
          <div className="text-sm text-gray-300">
            {children}
          </div>
        </main>

        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed flex items-center justify-center min-w-[110px]"
          >
            {isConfirming ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
            ) : (
                confirmText
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ConfirmationModal;
