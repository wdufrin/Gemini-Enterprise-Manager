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

import React from 'react';
import { Page } from '../../types';
import CloudConsoleButton from '../CloudConsoleButton';

export interface PageHeaderPrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  title?: string;
  testId?: string;
}

export interface PageHeaderProps {
  /** Primary H1 title — should match or closely reflect the Sidebar tab label */
  title: string;
  /** Concise 1-line description of what this module manages */
  subtitle?: React.ReactNode;
  /** Optional leading icon rendered in a subtle Stitch accent tile */
  icon?: React.ReactNode;
  /** Optional inline status/API pills rendered beside the H1 title */
  badges?: React.ReactNode;
  /** Optional Back button when rendered in a drill-down detail state */
  onBack?: () => void;
  backLabel?: string;
  /** Optional Cloud Console deep-link configuration */
  consolePage?: Page;
  consoleUrl?: string;
  projectId?: string;
  projectNumber?: string;
  /** Standardized secondary Refresh button */
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  /** Additional secondary buttons rendered before Refresh / Primary CTA */
  secondaryActions?: React.ReactNode;
  /** Standardized primary blue-600 CTA button */
  primaryAction?: PageHeaderPrimaryAction;
  /** Optional embedded footer slot (e.g., <ScopeBar embedded /> or KPI summary strip) */
  children?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  badges,
  onBack,
  backLabel = 'Back',
  consolePage,
  consoleUrl,
  projectId,
  projectNumber,
  onRefresh,
  isRefreshing = false,
  refreshDisabled = false,
  refreshLabel = 'Refresh',
  secondaryActions,
  primaryAction,
  children,
  className = '',
}) => {
  const showConsole = Boolean(consoleUrl || consolePage);

  return (
    <section
      aria-label={`${title} Header`}
      className={`bg-gray-900/85 border border-gray-800/90 rounded-xl px-4 py-4 sm:px-5 shadow-md ${className}`.trim()}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
        <div className="flex items-start gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              title={backLabel}
              className="mt-0.5 inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-gray-800 hover:bg-gray-750 border border-gray-700 text-xs font-medium text-gray-200 hover:text-white transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>{backLabel}</span>
            </button>
          )}

          {icon && (
            <div
              className="mt-0.5 p-2 rounded-lg bg-blue-950/60 border border-blue-800/50 text-blue-400 shrink-0"
              aria-hidden="true"
            >
              {icon}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight">
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && (
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
        </div>

        {(secondaryActions || onRefresh || showConsole || primaryAction) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {secondaryActions}

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing || refreshDisabled}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs sm:text-sm font-medium text-gray-200 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg
                  className={`w-3.5 h-3.5 text-gray-300 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{isRefreshing ? 'Refreshing...' : refreshLabel}</span>
              </button>
            )}

            {showConsole && (
              <CloudConsoleButton
                currentPage={consolePage}
                projectId={projectId}
                projectNumber={projectNumber}
                url={consoleUrl}
                className="h-9 text-xs sm:text-sm rounded-lg bg-gray-800 hover:bg-gray-700 border-gray-700"
              />
            )}

            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                title={primaryAction.title}
                data-testid={primaryAction.testId}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {primaryAction.icon}
                <span>{primaryAction.label}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {children && <div className="border-t border-gray-800/80 pt-3.5 mt-3.5">{children}</div>}
    </section>
  );
};

export default PageHeader;
