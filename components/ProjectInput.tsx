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

import React, { useState, useEffect } from 'react';
import * as api from '../services/apiService';

interface ProjectInputProps {
  value: string;
  onChange: (value: string) => void;
}

const ProjectInput: React.FC<ProjectInputProps> = ({ value, onChange }) => {
  const [inputValue, setInputValue] = useState(value);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);
  
  const handleResolve = async () => {
    const trimmedValue = inputValue.trim();
    
    // If it's a number, a valid project number, or empty, just update parent.
    if (!trimmedValue || /^\d+$/.test(trimmedValue)) {
      setError(null);
      onChange(trimmedValue);
      return;
    }
    
    // It's a string (project ID), so try to resolve it to a project number.
    setIsLoading(true);
    setError(null);
    try {
      const projectNumber = await api.getProjectNumber(trimmedValue);
      onChange(projectNumber);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to resolve Project ID: ${errMsg}. Ensure the API client is initialized.`);
      // Do not update parent on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent any potential form submission
      handleResolve();
    }
  };

  return (
    <div>
        <div className="flex items-center space-x-2">
            <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Project ID or Number"
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full"
            />
             <button
                type="button"
                onClick={handleResolve}
                disabled={isLoading}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500 shrink-0 h-[34px] flex items-center justify-center w-[60px]"
            >
                {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                ) : (
                    'Set'
                )}
            </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
};

export default ProjectInput;