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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useModalA11y } from '../../hooks/useModalA11y';

interface PruneLicensesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (days: number, includeNeverLoggedIn?: boolean) => void;
  userLicenses: any[];
  isDeleting: boolean;
}

const PruneLicensesModal: React.FC<PruneLicensesModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  userLicenses,
  isDeleting,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState<number | ''>(30);
  const [includeNeverLoggedIn, setIncludeNeverLoggedIn] = useState<boolean>(false);
  const [confirmInput, setConfirmInput] = useState('');

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isDeleting,
  });

  // Reset confirmation input whenever modal opens or parameters change
  useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
    }
  }, [isOpen, days, includeNeverLoggedIn]);

  // Fix stale-closure bug: pure useMemo computed reactively from props and state
  const matchingLicenses = useMemo(() => {
    if (days === '' || typeof days !== 'number' || days < 1) {
      return [];
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return userLicenses.filter(l => {
      if (!l.lastLoginTime) {
        if (!includeNeverLoggedIn) return false;
        if (l.createTime) {
          return new Date(l.createTime) < cutoff;
        }
        return true;
      }
      return new Date(l.lastLoginTime) < cutoff;
    });
  }, [userLicenses, days, includeNeverLoggedIn]);

  const handleDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDays(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
  };

  const exportDryRunCsv = () => {
    const rows = [
      'User Principal,Last Login,Assigned Date',
      ...matchingLicenses.map(l => {
        const principal = l.userPrincipal || l.name || 'Unknown';
        const lastLogin = l.lastLoginTime ? new Date(l.lastLoginTime).toISOString() : 'Never';
        const created = l.createTime ? new Date(l.createTime).toISOString() : 'Unknown';
        return `"${principal}","${lastLogin}","${created}"`;
      }),
    ];
    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `license_prune_dryrun_${days}days_${matchingLicenses.length}_users.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isConfirmed = confirmInput.trim().toUpperCase() === 'PRUNE';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-fade-in"
      aria-modal="true"
      role="dialog"
      aria-labelledby="prune-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-900/40 border border-red-700/50 rounded-lg text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h2 id="prune-modal-title" className="text-lg font-bold text-white">Prune Inactive Licenses</h2>
              <p className="text-xs text-gray-400">Identify and revoke licenses with no recent user activity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-md hover:bg-gray-700"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </header>

        {/* Body */}
        <main className="p-6 space-y-4 overflow-y-auto flex-1 text-sm text-gray-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prune-days-input" className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Inactive threshold (Days)
              </label>
              <input
                type="number"
                id="prune-days-input"
                value={days}
                onChange={handleDaysChange}
                className="w-full bg-gray-900 border border-gray-600 rounded-md shadow-sm text-sm text-white px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                min="1"
                placeholder="30"
              />
              <p className="text-xs text-gray-400 mt-1">Users with no login in this period</p>
            </div>

            <div className="flex flex-col justify-center">
              <label className="flex items-start gap-2 p-2 rounded bg-gray-900/50 border border-gray-700/70 cursor-pointer hover:border-gray-600 transition-colors">
                <input
                  type="checkbox"
                  id="prune-never-logged-in"
                  checked={includeNeverLoggedIn}
                  onChange={(e) => setIncludeNeverLoggedIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded bg-gray-800 border-gray-600 text-red-600 focus:ring-red-500"
                />
                <span className="text-xs select-none">
                  <strong className="text-white block">Include never-logged-in users</strong>
                  <span className="text-gray-400">Prune users assigned longer than {days || 30} days who never accessed Gemini</span>
                </span>
              </label>
            </div>
          </div>

          {/* Dry Run Preview Summary */}
          <div className="bg-gray-900/80 border border-gray-700 rounded-md p-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-700/60">
              <div>
                <span className="text-xs uppercase font-semibold tracking-wider text-gray-400">Dry-Run Preview Result</span>
                <div className="text-base font-bold text-white mt-0.5">
                  <span className="text-red-400">{matchingLicenses.length}</span> matching user{matchingLicenses.length === 1 ? '' : 's'} identified
                </div>
              </div>
              {matchingLicenses.length > 0 && (
                <button
                  type="button"
                  onClick={exportDryRunCsv}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-md border border-gray-600 flex items-center gap-1.5 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export Inactive Users (CSV)
                </button>
              )}
            </div>

            {/* Dry-run table list */}
            {matchingLicenses.length > 0 ? (
              <div className="mt-3 max-h-48 overflow-y-auto border border-gray-700 rounded bg-gray-950/60">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-gray-800 text-gray-400 uppercase text-[10px] tracking-wider sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Principal</th>
                      <th className="py-2 px-3">Last Login</th>
                      <th className="py-2 px-3">Assigned Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 font-mono">
                    {matchingLicenses.map((lic, idx) => (
                      <tr key={lic.userPrincipal || idx} className="hover:bg-gray-800/40">
                        <td className="py-1.5 px-3 truncate max-w-xs text-gray-200" title={lic.userPrincipal}>
                          {lic.userPrincipal || '—'}
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap text-gray-400">
                          {lic.lastLoginTime ? new Date(lic.lastLoginTime).toLocaleDateString() : <span className="text-amber-400">Never</span>}
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap text-gray-500">
                          {lic.createTime ? new Date(lic.createTime).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 p-4 text-center text-xs text-gray-500 bg-gray-950/40 rounded">
                No users match the inactive criteria of {days || 30} days.
              </div>
            )}
          </div>

          {/* Warning & Typed confirmation */}
          {matchingLicenses.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-md text-xs text-red-200 space-y-1">
                <div className="font-semibold text-red-300 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Irreversible Consequence
                </div>
                <p>
                  Pruning will permanently revoke Gemini Enterprise licenses for these <strong>{matchingLicenses.length}</strong> users.
                  They will immediately lose access until a license is re-assigned manually or by sync.
                </p>
              </div>

              <div>
                <label htmlFor="prune-confirm-input" className="block text-xs text-gray-300 mb-1">
                  Type <span className="font-mono font-bold text-red-400 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-700">PRUNE</span> to confirm:
                </label>
                <input
                  type="text"
                  id="prune-confirm-input"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type PRUNE to unlock"
                  disabled={isDeleting}
                  className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white font-mono placeholder:font-sans placeholder:text-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-between items-center">
          <div className="text-xs text-gray-500">
            {matchingLicenses.length > 0 && !isConfirmed && (
              <span>Confirmation keyword required</span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-medium rounded-md hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(days === '' ? 30 : days, includeNeverLoggedIn)}
              disabled={isDeleting || matchingLicenses.length === 0 || !isConfirmed}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center transition-colors shadow-sm"
            >
              {isDeleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Revoking Licenses...
                </>
              ) : (
                `Confirm Prune (${matchingLicenses.length})`
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default PruneLicensesModal;