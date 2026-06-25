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

interface HeaderProjectInputProps {
  projectId: string;
  projectNumber: string;
  onChange: (value: string) => void;
}

const HeaderProjectInput: React.FC<HeaderProjectInputProps> = ({ projectId, projectNumber, onChange }) => {
  const [inputValue, setInputValue] = useState(projectId || projectNumber);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(projectId || projectNumber);
  }, [projectId, projectNumber]);

  const handleResolve = async () => {
    const trimmedValue = inputValue.trim();
    setError(null);
    if (!trimmedValue) {
      onChange('');
      setIsEditing(false);
      return;
    }

    if (/^\d+$/.test(trimmedValue)) {
      onChange(trimmedValue);
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    try {
      const projectNum = await api.getProjectNumber(trimmedValue);
      onChange(projectNum);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to resolve Project ID');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleResolve();
    }
  };

  if (isEditing) {
    return (
      <div className="relative flex items-center space-x-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Project ID or Number"
          className={`bg-gray-700 border ${error ? 'border-red-500 focus:ring-red-500/20' : 'border-gray-600 focus:border-blue-500 focus:ring-blue-500/20'} rounded-md px-2 py-1 text-sm text-gray-200 focus:ring-2 outline-none w-48 transition-colors`}
          autoFocus
          onBlur={() => { 
            setTimeout(() => {
              if (!isLoading) {
                setIsEditing(false);
                setError(null);
              }
            }, 150);
          }}
        />
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            handleResolve();
          }}
          disabled={isLoading}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors"
        >
          {isLoading ? '...' : 'Set'}
        </button>
        {error && (
          <div className="absolute top-full left-0 mt-1 bg-red-950/90 border border-red-900/50 text-red-200 text-xs px-2.5 py-1.5 rounded-lg shadow-lg z-50 font-medium animate-fade-in whitespace-nowrap">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 group cursor-pointer" onClick={() => setIsEditing(true)}>
      <span className="text-sm font-medium text-gray-400 group-hover:text-gray-300">Project:</span>
      <div className="flex items-baseline gap-1" title="Click to change">
        <span className="text-sm font-bold text-white group-hover:text-blue-300 font-mono">{projectId || 'Not Set'}</span>
        {projectNumber && projectId && projectNumber !== projectId && (
          <span className="text-xs text-gray-500 font-mono">({projectNumber})</span>
        )}
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 group-hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    </div>
  );
};

export default HeaderProjectInput;
