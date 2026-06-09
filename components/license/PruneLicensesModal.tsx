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

interface PruneLicensesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (days: number) => void;
  userLicenses: any[];
  isDeleting: boolean;
}

const PruneLicensesModal: React.FC<PruneLicensesModalProps> = ({ isOpen, onClose, onConfirm, userLicenses, isDeleting }) => {
  const [days, setDays] = useState<number | ''>(30);
  const [matches, setMatches] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      calculateMatches(days);
    }
  }, [isOpen, userLicenses, days]);

  const calculateMatches = (numDays: number | '') => {
    if (numDays === '') {
        setMatches(0);
        return;
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - numDays);
    const count = userLicenses.filter(l => {
        if (!l.lastLoginTime) return false; // Or decide if never logged in counts
        return new Date(l.lastLoginTime) < cutoff;
    }).length;
    setMatches(count);
  };

  const handleDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDays(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <header className="p-4 border-b border-gray-700 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <h2 className="text-xl font-bold text-white">Prune Inactive Licenses</h2>
        </header>

        <main className="p-6 space-y-4">
            <p className="text-sm text-gray-300">
                Delete user licenses that have not been used in the specified number of days.
            </p>
            <div>
                <label htmlFor="days" className="block text-sm font-medium text-gray-400">Days since last login</label>
                <input
                    type="number"
                    id="days"
                    value={days}
                    onChange={handleDaysChange}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white p-2"
                    min="1"
                />
            </div>
            <div className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                 <p className="text-sm text-gray-400">Found <strong className="text-white">{matches}</strong> matching users in the current list.</p>
            </div>
             <p className="text-xs text-yellow-500">
                Note: This operation acts on the retrieved list of licenses. Ensure the list is up-to-date.
            </p>
        </main>

        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3">
          <button onClick={onClose} disabled={isDeleting} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50">Cancel</button>
          <button
            onClick={() => onConfirm(days === '' ? 30 : days)}
            disabled={isDeleting || matches === 0}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed flex items-center"
          >
            {isDeleting ? (
                 <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Deleting...
                </>
            ) : 'Confirm Prune'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PruneLicensesModal;