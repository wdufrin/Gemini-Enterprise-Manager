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

import React from "react";
import { GEMINI_ENTERPRISE_LOCATIONS } from "../../utils/locations";

interface ConnectorConfigHeaderProps {
  projectNumber?: string;
  setProjectNumber?: (val: string) => void;
  appLocation: string;
  onLocationChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  scanDurationHours: number | "";
  setScanDurationHours: (val: number | "") => void;
  isLoading: boolean;
  isBulkScanning: boolean;
  collectionsCount: number;
  onScanCollections: () => void;
  onBulkDiagnostics: () => void;
}

export const ConnectorConfigHeader: React.FC<ConnectorConfigHeaderProps> = ({
  projectNumber,
  appLocation,
  onLocationChange,
  scanDurationHours,
  setScanDurationHours,
  isLoading,
  isBulkScanning,
  collectionsCount,
  onScanCollections,
  onBulkDiagnostics,
}) => {
  return (
    <div className="bg-gray-900/75 border border-gray-800/90 rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-3 min-w-0 flex-1">
        <div className="min-w-[190px] sm:min-w-[230px]">
          <label
            htmlFor="appLocation"
            className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 whitespace-nowrap"
          >
            Location
          </label>
          <select
            id="appLocation"
            name="appLocation"
            value={appLocation}
            onChange={onLocationChange}
            className="w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg px-3 text-xs sm:text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {GEMINI_ENTERPRISE_LOCATIONS.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-48 shrink-0">
          <label
            htmlFor="scanDuration"
            className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 whitespace-nowrap"
          >
            Log Scan Duration (Hours)
          </label>
          <input
            type="number"
            id="scanDuration"
            value={scanDurationHours}
            onChange={(e) => {
              const val = e.target.value;
              setScanDurationHours(
                val === "" ? "" : Math.max(1, parseInt(val, 10) || 1),
              );
            }}
            className="w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg px-3 text-xs sm:text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
          />
        </div>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onScanCollections}
          disabled={isLoading || !projectNumber}
          className="px-3.5 h-9 bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 whitespace-nowrap shrink-0 inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {isLoading ? "Scanning..." : "Scan Collections"}
        </button>
        <button
          type="button"
          onClick={onBulkDiagnostics}
          disabled={collectionsCount === 0 || isBulkScanning}
          className="px-3.5 h-9 bg-emerald-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 whitespace-nowrap shrink-0 inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          {isBulkScanning && (
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white shrink-0"
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
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          )}
          {isBulkScanning ? "Scanning..." : "Run Bulk Diagnosis"}
        </button>
      </div>
    </div>
  );
};
