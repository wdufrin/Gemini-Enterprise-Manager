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
import { GEMINI_ENTERPRISE_LOCATIONS } from '../../utils/locations';

export interface ScopeOption {
  value: string;
  label: string;
}

export interface ScopeBarProps {
  /** Render flat without outer card chrome when nested inside <PageHeader>{children}</PageHeader> */
  embedded?: boolean;
  /** Location / Region selector */
  locationValue?: string;
  onLocationChange?: (location: string) => void;
  locationLabel?: string;
  locationId?: string;
  locationOptions?: ScopeOption[];
  locationDisabled?: boolean;
  /** Gemini Enterprise App / Engine selector */
  engineValue?: string;
  onEngineChange?: (engineId: string) => void;
  engineLabel?: string;
  engineId?: string;
  engineOptions?: ScopeOption[];
  enginePlaceholder?: string;
  engineLoading?: boolean;
  engineDisabled?: boolean;
  /** Optional Collection selector */
  collectionValue?: string;
  onCollectionChange?: (collectionId: string) => void;
  collectionLabel?: string;
  collectionOptions?: ScopeOption[];
  /** Additional custom filter/control elements aligned on the same 36px baseline */
  children?: React.ReactNode;
  /** Right-aligned action or status indicator slot */
  actions?: React.ReactNode;
  className?: string;
}

const DEFAULT_GE_OPTIONS: ScopeOption[] = GEMINI_ENTERPRISE_LOCATIONS.map((loc) => ({
  value: loc.id,
  label: loc.label,
}));

export const ScopeBar: React.FC<ScopeBarProps> = ({
  embedded = false,
  locationValue,
  onLocationChange,
  locationLabel = 'Location',
  locationId = 'scope-location-select',
  locationOptions = DEFAULT_GE_OPTIONS,
  locationDisabled = false,
  engineValue,
  onEngineChange,
  engineLabel = 'Gemini Enterprise App',
  engineId = 'scope-engine-select',
  engineOptions,
  enginePlaceholder = '-- Select App / Engine --',
  engineLoading = false,
  engineDisabled = false,
  collectionValue,
  onCollectionChange,
  collectionLabel = 'Collection',
  collectionOptions,
  children,
  actions,
  className = '',
}) => {
  const wrapperClass = embedded
    ? `flex flex-col lg:flex-row lg:items-end justify-between gap-3 ${className}`.trim()
    : `bg-gray-900/75 border border-gray-800/90 rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-end justify-between gap-3 ${className}`.trim();

  return (
    <div className={wrapperClass}>
      <div className="flex flex-wrap items-end gap-3 min-w-0 flex-1">
        {onLocationChange && locationValue !== undefined && (
          <div className="min-w-[180px] sm:min-w-[210px]">
            <label
              htmlFor={locationId}
              className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1"
            >
              {locationLabel}
            </label>
            <select
              id={locationId}
              value={locationValue}
              onChange={(e) => onLocationChange(e.target.value)}
              disabled={locationDisabled}
              className="w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg px-3 text-xs sm:text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {locationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {onCollectionChange && collectionValue !== undefined && collectionOptions && (
          <div className="min-w-[170px]">
            <label
              htmlFor="scope-collection-select"
              className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1"
            >
              {collectionLabel}
            </label>
            <select
              id="scope-collection-select"
              value={collectionValue}
              onChange={(e) => onCollectionChange(e.target.value)}
              className="w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg px-3 text-xs sm:text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {collectionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {onEngineChange && engineValue !== undefined && engineOptions && (
          <div className="min-w-[220px] sm:min-w-[280px] flex-1 max-w-md">
            <label
              htmlFor={engineId}
              className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1"
            >
              {engineLabel}
            </label>
            <select
              id={engineId}
              value={engineValue}
              onChange={(e) => onEngineChange(e.target.value)}
              disabled={engineDisabled || engineLoading}
              className="w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg px-3 text-xs sm:text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {engineLoading ? (
                <option value="">Loading apps...</option>
              ) : (
                <>
                  {enginePlaceholder && <option value="">{enginePlaceholder}</option>}
                  {engineOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        )}

        {children}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};

export default ScopeBar;
