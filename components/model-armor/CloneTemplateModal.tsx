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

import React, { useState, useRef } from 'react';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';

export interface CloneTemplateModalProps {
  template: any;
  currentProjectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CloneTemplateModal: React.FC<CloneTemplateModalProps> = ({
  template,
  currentProjectId,
  onClose,
  onSuccess,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceTemplateId = template.name.split('/').pop();
  const sourceLocation = template.name.split('/')[3];

  const [targetProjectId, setTargetProjectId] = useState(currentProjectId);
  const [targetLocation, setTargetLocation] = useState(sourceLocation);
  const [targetTemplateId, setTargetTemplateId] = useState(`${sourceTemplateId}-clone`);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useModalA11y({
    isOpen: true,
    onClose,
    containerRef,
    preventClose: isSubmitting,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProjectId.trim() || !targetTemplateId.trim()) {
      setError('Project ID and New Template ID are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        filterConfig: template.filterConfig,
        templateMetadata: template.templateMetadata,
      };

      await api.createModelArmorTemplate(
        targetProjectId.trim(),
        targetLocation,
        targetTemplateId.trim(),
        payload
      );

      onSuccess();
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Failed to clone template.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clone-template-modal-title"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-fade-in-up"
      >
        <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/80">
          <h3 id="clone-template-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
              />
            </svg>
            Clone Protection Policy
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/20 rounded border border-red-900/50 text-red-400 text-sm">{error}</div>
          )}

          <div className="p-3.5 bg-gray-900/40 border border-gray-700/60 rounded-lg space-y-1.5 text-xs">
            <div className="text-gray-500 font-semibold uppercase tracking-wider">Source Template</div>
            <div className="text-gray-300 font-mono">
              <span className="text-gray-400">ID:</span> {sourceTemplateId}
            </div>
            <div className="text-gray-300 font-mono">
              <span className="text-gray-400">Location:</span> {sourceLocation}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Target GCP Project ID</label>
            <input
              type="text"
              value={targetProjectId}
              onChange={(e) => setTargetProjectId(e.target.value)}
              placeholder="GCP Project ID or Project Number"
              className="w-full bg-gray-900 border border-gray-650 rounded px-3 py-2 text-white text-sm focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="clone-target-location" className="block text-xs font-semibold text-gray-400 mb-1.5">Target Location</label>
              <select
                id="clone-target-location"
                aria-label="Target Location"
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
                className="w-full bg-gray-900 border border-gray-650 rounded px-3 py-2 text-white text-sm focus:ring-blue-500"
              >
                <option value="global">global</option>
                <option value="us">us</option>
                <option value="eu">eu</option>
                <option value="us-central1">us-central1</option>
              </select>
            </div>
            <div>
              <label htmlFor="clone-new-template-id" className="block text-xs font-semibold text-gray-400 mb-1.5">New Template ID</label>
              <input
                id="clone-new-template-id"
                aria-label="New Template ID"
                type="text"
                value={targetTemplateId}
                onChange={(e) => setTargetTemplateId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-650 rounded px-3 py-2 text-white text-sm focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="col-span-2">
              <p className="text-[10px] text-gray-500 italic mt-0.5 leading-relaxed">
                Note: Location availability depends on the target project&apos;s Google Cloud Organization Resource
                Location Policies (e.g. some projects restrict template writes to the &quot;global&quot; location).
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-650 text-gray-200 text-sm font-semibold rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting && (
                <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              )}
              Clone Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
