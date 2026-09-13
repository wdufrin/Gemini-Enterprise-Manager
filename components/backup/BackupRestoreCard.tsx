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
import type { RestoreProcessor } from '../../hooks/useBackupOperations';

const InfoIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
      clipRule="evenodd"
    />
  </svg>
);

export interface BackupRestoreCardProps {
  section: string;
  title: string;
  onBackup: () => Promise<void>;
  onRestore: (section: string, processor: RestoreProcessor) => Promise<void>;
  onDeleteBackup?: (section: string) => void | Promise<void>;
  onDownloadBackup?: (section: string) => Promise<void>;
  processor: RestoreProcessor;
  availableBackups: string[];
  selectedBackup: string;
  onBackupSelectionChange: (section: string, value: string) => void;
  loadingSection: string | null;
  isGloballyLoading: boolean;
  onShowInfo: (infoKey: string) => void;
  scope: 'Global' | 'User Specific';
}

export const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({
  section,
  title,
  onBackup,
  onRestore,
  onDeleteBackup,
  onDownloadBackup,
  processor,
  availableBackups,
  selectedBackup,
  onBackupSelectionChange,
  loadingSection,
  isGloballyLoading,
  onShowInfo,
  scope,
}) => {
  const isBackupLoading = loadingSection === `Backup${section}`;
  const isRestoreLoading = loadingSection === `Restore${section}`;
  const isDeleteLoading = loadingSection === `DeleteBackup${section}`;
  const isDownloadLoading = loadingSection === `DownloadBackup${section}`;
  const isThisCardLoading =
    isBackupLoading || isRestoreLoading || isDeleteLoading || isDownloadLoading;

  return (
    <div
      className={`bg-gray-900 rounded-lg p-4 shadow-lg flex flex-col border transition-colors ${isThisCardLoading ? 'border-blue-500' : 'border-gray-700'}`}
    >
      <div className="flex flex-col items-center mb-4">
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
        <span
          className={`text-[10px] px-2 py-0.5 mt-1 rounded-full uppercase tracking-wider font-semibold ${scope === 'Global' ? 'bg-purple-900/80 text-purple-300 border border-purple-700/50' : 'bg-emerald-900/80 text-emerald-300 border border-emerald-700/50'}`}
        >
          {scope}
        </span>
      </div>

      {/* Backup Action */}
      <div className="flex-1 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackup}
            disabled={isGloballyLoading}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center h-10"
          >
            {isBackupLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                Backing up to GCS...
              </>
            ) : (
              'Backup'
            )}
          </button>
          <button
            onClick={() => onShowInfo(`Backup:${section}`)}
            title="Show backup API command"
            className="p-2 text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-md shrink-0 h-10"
          >
            <InfoIcon />
          </button>
        </div>
      </div>

      {/* Separator */}
      <div className="relative flex items-center">
        <div className="flex-grow border-t border-gray-700"></div>
        <span className="flex-shrink mx-4 text-gray-500 text-xs uppercase">Or</span>
        <div className="flex-grow border-t border-gray-700"></div>
      </div>

      {/* Restore Action */}
      <div className="flex-1 mt-4">
        <p className="text-xs text-center text-gray-400 mb-2">Restore from GCS.</p>
        <div className="flex items-center gap-2">
          <select
            value={selectedBackup}
            onChange={(e) => onBackupSelectionChange(section, e.target.value)}
            disabled={isGloballyLoading}
            className="block w-full text-xs bg-gray-700 border border-gray-600 rounded-l-md text-white p-2 h-8 disabled:opacity-50"
          >
            <option value="">-- Select Backup File --</option>
            {availableBackups.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>
          <div className="flex shrink-0">
            <button
              onClick={() => onRestore(section, processor)}
              disabled={isGloballyLoading || !selectedBackup}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center h-8"
            >
              {isRestoreLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
              ) : (
                'Restore'
              )}
            </button>
            <button
              onClick={() => onShowInfo(`Restore:${section}`)}
              title="Show restore API command"
              className="p-1.5 text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-r-md h-8"
            >
              <InfoIcon />
            </button>
            {onDownloadBackup && (
              <button
                onClick={() => onDownloadBackup(section)}
                disabled={isGloballyLoading || !selectedBackup}
                className="ml-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center rounded-md h-8"
                title="Download selected backup JSON"
              >
                {isDownloadLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                ) : (
                  'Download'
                )}
              </button>
            )}
            {onDeleteBackup && (
              <button
                onClick={() => onDeleteBackup(section)}
                disabled={isGloballyLoading || !selectedBackup}
                className="ml-2 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center rounded-md h-8"
                title="Delete selected backup"
              >
                {isDeleteLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                ) : (
                  'Delete'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackupRestoreCard;
