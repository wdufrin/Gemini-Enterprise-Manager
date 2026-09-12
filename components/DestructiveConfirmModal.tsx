/**
 * Copyright 2025 Google LLC
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

import React, { useState, useEffect, useId } from 'react';

export interface DestructiveResourceItem {
  name: string;
  details?: string;
  type?: string;
}

export interface DestructiveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  /** Primary description or warning explanation */
  description: React.ReactNode;
  /** Specific resource(s) affected (can be strings or structured items) */
  resources?: (string | DestructiveResourceItem)[];
  /** Optional resource type label (e.g. "License", "Redirect URL", "Backup") */
  resourceType?: string;
  /** Expected phrase user must type to unlock the action. Defaults to 'DELETE' */
  confirmKeyword?: string;
  /** Button text. Defaults to 'Permanently Delete' */
  confirmButtonText?: string;
  /** Cancel button text. Defaults to 'Cancel' */
  cancelButtonText?: string;
  /** Explicit bullet list of irreversible consequences */
  consequences?: string[];
  /** Optional callback to trigger export before destruction */
  onExport?: () => void;
  /** Text for the export button, e.g. "Export Backup (JSON)" or "Export CSV" */
  exportButtonText?: string;
  /** Loading state during async execution */
  isLoading?: boolean;
}

export const DestructiveConfirmModal: React.FC<DestructiveConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  resources = [],
  resourceType,
  confirmKeyword = 'DELETE',
  confirmButtonText = 'Permanently Delete',
  cancelButtonText = 'Cancel',
  consequences = [],
  onExport,
  exportButtonText = 'Export Backup First',
  isLoading = false,
}) => {
  const [typedKeyword, setTypedKeyword] = useState('');
  const inputId = useId();

  useEffect(() => {
    if (isOpen) {
      setTypedKeyword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isMatch = typedKeyword.trim() === confirmKeyword.trim();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isMatch && !isLoading) {
      e.preventDefault();
      void onConfirm();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby={`${inputId}-title`}
    >
      <div className="bg-gray-850 bg-gray-800 border border-red-500/30 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="p-5 border-b border-gray-700/80 bg-red-950/20 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-900/40 border border-red-700/50 text-red-400 shrink-0 mt-0.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 id={`${inputId}-title`} className="text-lg font-bold text-white tracking-tight">
              {title}
            </h2>
            <div className="text-xs text-gray-400 mt-1 leading-relaxed">
              {description}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Consequences callout */}
          {consequences.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/60 rounded-lg p-3.5">
              <h3 className="text-xs font-semibold text-red-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Irreversible Action Consequences
              </h3>
              <ul className="text-xs text-red-200/90 space-y-1.5 list-disc pl-4 leading-relaxed">
                {consequences.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Resources list */}
          {resources.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Target {resourceType ? `${resourceType}s` : 'Resources'} ({resources.length})
                </label>
              </div>
              <div className="bg-gray-900/60 border border-gray-700/80 rounded-lg p-2.5 max-h-36 overflow-y-auto divide-y divide-gray-800">
                {resources.map((item, idx) => {
                  const name = typeof item === 'string' ? item : item.name;
                  const details = typeof item === 'string' ? undefined : item.details;
                  return (
                    <div key={idx} className="py-1.5 px-2 flex justify-between items-center text-xs">
                      <span className="font-mono text-gray-200 truncate pr-2 select-all">{name}</span>
                      {details && <span className="text-gray-500 text-[11px] shrink-0">{details}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optional Export first banner */}
          {onExport && (
            <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="text-xs text-blue-200 leading-relaxed">
                <strong className="text-blue-100 block">Recommended safety check:</strong>
                Download a local copy of this data before proceeding with deletion.
              </div>
              <button
                type="button"
                onClick={onExport}
                className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-semibold rounded-md border border-blue-500 flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exportButtonText}
              </button>
            </div>
          )}

          {/* Typed confirmation input */}
          <div className="space-y-2 pt-1 border-t border-gray-700/50">
            <label htmlFor={inputId} className="block text-xs font-medium text-gray-300 leading-relaxed">
              To proceed, please type{' '}
              <span className="font-mono font-bold text-red-300 bg-red-950/40 px-1.5 py-0.5 rounded border border-red-800 select-all">
                {confirmKeyword}
              </span>{' '}
              below:
            </label>
            <input
              id={inputId}
              type="text"
              value={typedKeyword}
              onChange={(e) => setTypedKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder={`Type ${confirmKeyword} to confirm`}
              autoComplete="off"
              spellCheck="false"
              className="w-full bg-gray-900 border border-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-md px-3 py-2 text-sm text-white font-mono placeholder:text-gray-600 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-900/70 border-t border-gray-700/80 flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
          >
            {cancelButtonText}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={!isMatch || isLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md transition-colors disabled:bg-red-900/40 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white" />
            )}
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DestructiveConfirmModal;
