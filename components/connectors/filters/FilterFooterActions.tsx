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

interface FilterFooterActionsProps {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  disableSave: boolean;
  onResetFilters: () => void;
  onSaveFilters: () => void;
}

export const FilterFooterActions: React.FC<FilterFooterActionsProps> = ({
  hasUnsavedChanges,
  isSaving,
  disableSave,
  onResetFilters,
  onSaveFilters,
}) => {
  return (
    <div className="pt-4 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="text-xs text-gray-400 flex items-center gap-2">
        {hasUnsavedChanges ? (
          <span className="text-yellow-400 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
            You have unsaved filter changes
          </span>
        ) : (
          <span className="text-gray-500">Filters match current connector state</span>
        )}
      </div>

      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
        <button
          type="button"
          onClick={onResetFilters}
          disabled={!hasUnsavedChanges || isSaving}
          className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-semibold rounded-md border border-gray-700 transition-colors disabled:opacity-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onSaveFilters}
          disabled={disableSave}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-md transition-colors flex items-center gap-2 disabled:bg-gray-700 disabled:text-gray-500"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving Filters...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save & Apply Filters
            </>
          )}
        </button>
      </div>
    </div>
  );
};
