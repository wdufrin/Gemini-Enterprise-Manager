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
import ProjectInput from "../ProjectInput";
import CloudConsoleButton from "../CloudConsoleButton";

interface ConnectorConfigHeaderProps {
  projectNumber: string;
  setProjectNumber: (val: string) => void;
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
  setProjectNumber,
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
    <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-white">
          Connector Configuration
        </h2>
        <CloudConsoleButton
          url={`https://console.cloud.google.com/gemini-enterprise/data-stores?project=${projectNumber}`}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Project ID / Number
          </label>
          <ProjectInput value={projectNumber} onChange={setProjectNumber} />
        </div>
        <div>
          <label
            htmlFor="appLocation"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Location
          </label>
          <select
            id="appLocation"
            name="appLocation"
            value={appLocation}
            onChange={onLocationChange}
            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-blue-500"
          >
            <option value="global">global</option>
            <option value="us">us</option>
            <option value="eu">eu</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="scanDuration"
            className="block text-sm font-medium text-gray-400 mb-1"
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
                val === "" ? "" : Math.max(1, parseInt(val, 10) || 1)
              );
            }}
            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-blue-500"
            min="1"
          />
        </div>
        <div className="flex items-end space-x-2">
          <button
            type="button"
            onClick={onScanCollections}
            disabled={isLoading || !projectNumber}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 h-[42px]"
          >
            {isLoading ? "Scanning..." : "Scan Collections"}
          </button>
          <button
            type="button"
            onClick={onBulkDiagnostics}
            disabled={collectionsCount === 0 || isBulkScanning}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 h-[42px] flex items-center"
          >
            {isBulkScanning && (
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
    </div>
  );
};
