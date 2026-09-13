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

interface DuplicateModalFooterProps {
  currentStep: number;
  totalSteps: number;
  isSubmitting: boolean;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

export const DuplicateModalFooter: React.FC<DuplicateModalFooterProps> = ({
  currentStep,
  totalSteps,
  isSubmitting,
  onBack,
  onClose,
  onNext,
  onSubmit,
}) => {
  return (
    <footer className="p-4 bg-gray-800 border-t border-gray-700 rounded-b-lg shrink-0 flex justify-between items-center">
      <div>
        {currentStep > 1 && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-750 hover:bg-gray-700 border border-gray-650 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50"
          >
            Back
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-655 border border-gray-600 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50"
        >
          Cancel
        </button>

        {currentStep < totalSteps ? (
          <button
            type="button"
            onClick={onNext}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors disabled:bg-gray-700 disabled:text-gray-500 shadow-lg flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin h-3.5 w-3.5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Duplicating...
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                Provision Connector
              </>
            )}
          </button>
        )}
      </div>
    </footer>
  );
};
