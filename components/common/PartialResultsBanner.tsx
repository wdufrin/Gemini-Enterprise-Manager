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

import React, { useState } from 'react';
import { PartialFailure } from '../../hooks/useAsyncResource';
import { toErrorMessage } from '../../utils/errors';

export type { PartialFailure };

export interface PartialResultsBannerProps {
  partialFailures: PartialFailure[];
  resourceName?: string;
  totalCount?: number;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Formats status code into a human-readable label.
 */
function formatStatusLabel(status?: number): string {
  if (!status) return 'Error';
  switch (status) {
    case 400:
      return '400 Bad Request';
    case 401:
      return '401 Unauthorized';
    case 403:
      return '403 Permission Denied';
    case 404:
      return '404 Not Found';
    case 409:
      return '409 Conflict';
    case 429:
      return '429 Rate Limited';
    case 500:
      return '500 Server Error';
    case 503:
      return '503 Unavailable';
    default:
      return `HTTP ${status}`;
  }
}

/**
 * Banner notifying users of partial resource degradation instead of
 * silently rendering empty views.
 */
export const PartialResultsBanner: React.FC<PartialResultsBannerProps> = ({
  partialFailures,
  resourceName = 'resources',
  totalCount,
  onRetry,
  isRetrying = false,
  onDismiss,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  if (!partialFailures || partialFailures.length === 0) {
    return null;
  }

  const failedCount = partialFailures.length;
  const message =
    totalCount !== undefined
      ? `${failedCount} of ${totalCount} ${resourceName} could not be loaded`
      : `${failedCount} ${resourceName} could not be loaded`;

  return (
    <div
      role="region"
      aria-label="Partial results warning"
      className={`bg-amber-950/40 border border-amber-700/50 rounded-lg p-4 text-amber-200 mb-4 shadow-sm transition-all duration-200 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          {/* Warning Icon */}
          <div className="flex-shrink-0 text-amber-400">
            <svg
              className="w-5 h-5"
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
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-200 truncate">
              {message}
            </p>
            <p className="text-xs text-amber-300/80">
              Some items were skipped due to permission restrictions or API errors.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="text-xs font-medium text-amber-300 hover:text-amber-100 underline decoration-amber-500/50 hover:decoration-amber-200 transition-colors"
          >
            {isExpanded ? 'Hide details' : `Show details (${failedCount})`}
          </button>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-100 bg-amber-800/60 hover:bg-amber-700/80 active:bg-amber-800 rounded border border-amber-600/50 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isRetrying && (
                <svg
                  className="animate-spin h-3.5 w-3.5 text-amber-200"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
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
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              )}
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss warning"
              className="text-amber-400 hover:text-amber-200 p-1 rounded hover:bg-amber-900/50 transition-colors"
            >
              <svg
                className="w-4 h-4"
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
          )}
        </div>
      </div>

      {isExpanded && (
        <div
          role="region"
          aria-label="Failed resources details"
          className="mt-3 pt-3 border-t border-amber-800/40 text-xs text-amber-100 space-y-2 overflow-x-auto"
        >
          <div className="space-y-1.5">
            {partialFailures.map((failure, idx) => {
              const errorMessage = failure.reason || toErrorMessage(failure.error);
              const statusLabel = formatStatusLabel(failure.status);

              return (
                <div
                  key={failure.id || `failure-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-gray-900/60 border border-amber-900/40"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="font-mono text-amber-300 font-semibold truncate">
                      {failure.name || failure.id}
                    </span>
                    {failure.resourceType && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] uppercase font-semibold">
                        {failure.resourceType}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        failure.status === 403
                          ? 'bg-red-950/80 border border-red-800/60 text-red-300'
                          : failure.status === 404
                          ? 'bg-amber-950/80 border border-amber-800/60 text-amber-300'
                          : 'bg-gray-800 border border-gray-700 text-gray-300'
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <span className="text-gray-300 max-w-xs md:max-w-md truncate" title={errorMessage}>
                      {errorMessage}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PartialResultsBanner;
