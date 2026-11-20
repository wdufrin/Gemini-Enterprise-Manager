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

import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { LicenseConfig, UserLicense } from './types';
import { assignUserLicenses } from '../../services/api/licenses';
import { getLocationFromResourceName } from '../../services/api/core';
import { updateCachedUserLicenses } from '../../services/licenseCache';
import { Config } from '../../types';
import { toErrorMessage } from '../../utils/errors';

export const BULK_ASSIGN_CHUNK_SIZE = 100;

/**
 * Regex Pattern Matching validator for standard enterprise RFC-like email addresses.
 * Known limits: Uses regular expression matching (`local@domain.tld`) plus structural dot/length checks;
 * does not parse RFC 5322 quoted local-parts, comments, or internationalized IDN punycode ASTs.
 */
const RFC_LIKE_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const EMAIL_CSV_HEADER_NAMES = new Set([
  'email',
  'emails',
  'email_address',
  'emailaddress',
  'user_email',
  'useremail',
  'user_principal',
  'userprincipal',
  'principal',
  'mail',
  'upn',
]);

export const isValidEnterpriseEmail = (candidate: string): boolean => {
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length > 254) return false;
  if (!RFC_LIKE_EMAIL_REGEX.test(trimmed)) return false;
  const [localPart] = trimmed.split('@');
  if (!localPart || localPart.length > 64) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false;
  }
  return true;
};

const splitCsvRow = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
};

export interface ParsedEmailBatchResult {
  validEmails: string[];
  invalidEntries: string[];
  duplicateCount: number;
}

export const parseAndValidateEmailList = (rawText: string): ParsedEmailBatchResult => {
  const trimmedText = rawText.replace(/^\uFEFF/, '').trim();
  if (!trimmedText) {
    return { validEmails: [], invalidEntries: [], duplicateCount: 0 };
  }

  const lines = trimmedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { validEmails: [], invalidEntries: [], duplicateCount: 0 };
  }

  const firstRowCells = splitCsvRow(lines[0]).map((c) => c.replace(/^["']+|["']+$/g, '').trim());
  const headerIdx = firstRowCells.findIndex((col) =>
    EMAIL_CSV_HEADER_NAMES.has(col.toLowerCase().replace(/\s+/g, '_')),
  );

  const rawCandidates: string[] = [];
  if (headerIdx >= 0) {
    // Structured CSV with a recognized header row
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvRow(lines[i]);
      const cell = (cells[headerIdx] ?? '').replace(/^["']+|["']+$/g, '').trim();
      if (cell) {
        rawCandidates.push(cell);
      }
    }
  } else {
    // Pasted list or headerless CSV
    for (const line of lines) {
      const tokens = splitCsvRow(line)
        .flatMap((part) => part.split(/\s+/))
        .map((t) => t.replace(/^["'<]+|["'>]+$/g, '').trim())
        .filter(Boolean);
      rawCandidates.push(...tokens);
    }
  }

  const seenValid = new Set<string>();
  const validEmails: string[] = [];
  const invalidEntries: string[] = [];
  let duplicateCount = 0;

  for (const entry of rawCandidates) {
    if (isValidEnterpriseEmail(entry)) {
      const normalized = entry.toLowerCase();
      if (seenValid.has(normalized)) {
        duplicateCount += 1;
      } else {
        seenValid.add(normalized);
        validEmails.push(normalized);
      }
    } else {
      invalidEntries.push(entry);
    }
  }

  return { validEmails, invalidEntries, duplicateCount };
};

export interface SeatAvailabilityCheck {
  alreadyOnTargetCount: number;
  netSeatsNeeded: number;
  allocatedSeats: number | null;
  currentlyUsedSeats: number;
  availableSeats: number | null;
  exceedsCapacity: boolean;
  seatShortfall: number;
}

export const evaluateSeatCapacity = (
  validEmails: string[],
  targetConfig: LicenseConfig | undefined,
  existingLicenses: UserLicense[] = [],
): SeatAvailabilityCheck => {
  if (!targetConfig) {
    return {
      alreadyOnTargetCount: 0,
      netSeatsNeeded: validEmails.length,
      allocatedSeats: null,
      currentlyUsedSeats: 0,
      availableSeats: null,
      exceedsCapacity: false,
      seatShortfall: 0,
    };
  }

  const assignedOnTargetPrincipals = new Set(
    existingLicenses
      .filter(
        (l) =>
          l.licenseAssignmentState === 'ASSIGNED' &&
          l.licenseConfig === targetConfig.name &&
          Boolean(l.userPrincipal),
      )
      .map((l) => l.userPrincipal.toLowerCase()),
  );

  const alreadyOnTargetCount = validEmails.filter((e) =>
    assignedOnTargetPrincipals.has(e.toLowerCase()),
  ).length;
  const netSeatsNeeded = Math.max(0, validEmails.length - alreadyOnTargetCount);

  const rawCap = targetConfig.licenseCount !== undefined ? Number(targetConfig.licenseCount) : NaN;
  const allocatedSeats = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : null;

  const reportedUsed = Number(targetConfig.userLicenseCount) || 0;
  const currentlyUsedSeats = Math.max(reportedUsed, assignedOnTargetPrincipals.size);

  const availableSeats =
    allocatedSeats !== null ? Math.max(0, allocatedSeats - currentlyUsedSeats) : null;
  const exceedsCapacity = availableSeats !== null && netSeatsNeeded > availableSeats;
  const seatShortfall =
    exceedsCapacity && availableSeats !== null ? netSeatsNeeded - availableSeats : 0;

  return {
    alreadyOnTargetCount,
    netSeatsNeeded,
    allocatedSeats,
    currentlyUsedSeats,
    availableSeats,
    exceedsCapacity,
    seatShortfall,
  };
};

export interface BulkAssignCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectNumber: string;
  appLocation?: string;
  userStoreId?: string;
  apiLicenseConfigs: LicenseConfig[];
  existingLicenses: UserLicense[];
  onAssignSuccess?: () => void;
  onExecuteBulkAssign?: (
    emails: string[],
    targetLicenseConfigName: string,
    onProgress?: (completedChunks: number, totalChunks: number) => void,
  ) => Promise<void>;
}

export const BulkAssignCsvModal: React.FC<BulkAssignCsvModalProps> = ({
  isOpen,
  onClose,
  projectNumber,
  appLocation,
  userStoreId = 'default_user_store',
  apiLicenseConfigs,
  existingLicenses,
  onAssignSuccess,
  onExecuteBulkAssign,
}) => {
  const [rawEmailText, setRawEmailText] = useState<string>('');
  const [selectedConfigName, setSelectedConfigName] = useState<string>('');
  const [confirmText, setConfirmText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !selectedConfigName && apiLicenseConfigs.length > 0) {
      setSelectedConfigName(apiLicenseConfigs[0].name);
    }
  }, [isOpen, selectedConfigName, apiLicenseConfigs]);

  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setSubmitError(null);
      setProgress(null);
    }
  }, [isOpen]);

  const parsed = useMemo(() => parseAndValidateEmailList(rawEmailText), [rawEmailText]);

  const selectedConfigObj = useMemo(
    () => apiLicenseConfigs.find((c) => c.name === selectedConfigName),
    [apiLicenseConfigs, selectedConfigName],
  );

  const seatCheck = useMemo(
    () => evaluateSeatCapacity(parsed.validEmails, selectedConfigObj, existingLicenses),
    [parsed.validEmails, selectedConfigObj, existingLicenses],
  );

  const readFileAsText = (file: File): Promise<string> => {
    if (typeof file.text === 'function') {
      return file.text();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read CSV file.'));
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitError(null);
    try {
      const text = await readFileAsText(file);
      setUploadedFileName(file.name);
      setRawEmailText(text);
    } catch (err: unknown) {
      setSubmitError(toErrorMessage(err, 'Failed to read uploaded CSV file.'));
    }
  };

  const canSubmit =
    Boolean(projectNumber) &&
    Boolean(selectedConfigName) &&
    parsed.validEmails.length > 0 &&
    parsed.invalidEntries.length === 0 &&
    !seatCheck.exceedsCapacity &&
    confirmText === 'ASSIGN' &&
    !isSubmitting;

  const handleConfirmAssign = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const totalChunks = Math.ceil(parsed.validEmails.length / BULK_ASSIGN_CHUNK_SIZE);
    setProgress({ completed: 0, total: totalChunks });

    try {
      if (onExecuteBulkAssign) {
        await onExecuteBulkAssign(parsed.validEmails, selectedConfigName, (done, total) => {
          setProgress({ completed: done, total });
        });
      } else {
        const effectiveLocation =
          appLocation || getLocationFromResourceName(selectedConfigName) || 'global';
        const config: Config = {
          projectId: projectNumber,
          appLocation: effectiveLocation,
          collectionId: '',
          appId: '',
          assistantId: '',
        };

        for (let i = 0; i < parsed.validEmails.length; i += BULK_ASSIGN_CHUNK_SIZE) {
          const chunk = parsed.validEmails.slice(i, i + BULK_ASSIGN_CHUNK_SIZE);
          await assignUserLicenses(config, userStoreId, chunk, selectedConfigName);
          setProgress({
            completed: Math.floor(i / BULK_ASSIGN_CHUNK_SIZE) + 1,
            total: totalChunks,
          });
        }

        const assignedSet = new Set(parsed.validEmails);
        await updateCachedUserLicenses(
          projectNumber,
          userStoreId,
          (current) => {
            const seen = new Set<string>();
            const updated = current.map((lic) => {
              const lower = (lic.userPrincipal || '').toLowerCase();
              if (lower) seen.add(lower);
              if (assignedSet.has(lower)) {
                return {
                  ...lic,
                  licenseAssignmentState: 'ASSIGNED',
                  licenseConfig: selectedConfigName,
                };
              }
              return lic;
            });
            for (const email of parsed.validEmails) {
              if (!seen.has(email)) {
                updated.push({
                  userPrincipal: email,
                  licenseAssignmentState: 'ASSIGNED',
                  licenseConfig: selectedConfigName,
                });
              }
            }
            return updated;
          },
          effectiveLocation,
        );
      }

      setRawEmailText('');
      setConfirmText('');
      setUploadedFileName(null);
      onAssignSuccess?.();
      onClose();
    } catch (err: unknown) {
      setSubmitError(toErrorMessage(err, 'Bulk license assignment failed.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      preventClose={isSubmitting}
      size="2xl"
      title="Bulk Assign User Licenses (Net-New Emails / CSV)"
      titleId="bulk-assign-csv-title"
      subtitle={
        <>
          Pre-provision Gemini Enterprise seats for net-new employees before their first sign-in via chunked{' '}
          <code className="text-gray-300">:batchUpdateUserLicenses</code> calls.
        </>
      }
      bodyClassName="p-6 space-y-4"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="csv-assign-submit-button"
            disabled={!canSubmit}
            onClick={() => void handleConfirmAssign()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded-md transition-colors"
          >
            {isSubmitting
              ? 'Assigning...'
              : `Assign ${parsed.validEmails.length > 0 ? parsed.validEmails.length : ''} License(s)`.replace(/\s+/g, ' ')}
          </button>
        </>
      }
    >
      {/* Target License Config Selector */}
      <div>
        <label
          htmlFor="csv-target-license-select"
          className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5"
        >
          Target License Configuration
        </label>
        <select
          id="csv-target-license-select"
          aria-label="Target License Configuration"
          data-testid="csv-target-license-select"
          value={selectedConfigName}
          onChange={(e) => setSelectedConfigName(e.target.value)}
          disabled={isSubmitting}
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select License Configuration...</option>
          {apiLicenseConfigs.map((cfg) => {
            const id = cfg.name.split('/').pop() || cfg.name;
            const label = cfg.displayName || id;
            const total = cfg.licenseCount !== undefined ? ` (${cfg.licenseCount} total seats)` : '';
            return (
              <option key={cfg.name} value={cfg.name}>
                {label} — {cfg.subscriptionTier || 'GEMINI_ENTERPRISE'}
                {total}
              </option>
            );
          })}
        </select>
        {selectedConfigObj && seatCheck.availableSeats !== null && (
          <p data-testid="csv-available-seats-info" className="text-xs text-gray-400 mt-1">
            Available capacity:{' '}
            <strong className="text-blue-300">{seatCheck.availableSeats}</strong> of{' '}
            <strong className="text-gray-200">{seatCheck.allocatedSeats}</strong> seats remaining (
            {seatCheck.currentlyUsedSeats} assigned).
          </p>
        )}
      </div>

      {/* CSV Upload + Paste Textarea */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="csv-emails-textarea"
            className="block text-xs font-semibold uppercase tracking-wider text-gray-300"
          >
            Employee Emails (Paste or Upload .CSV)
          </label>
          <label className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-white rounded cursor-pointer border border-gray-600">
            <span>Upload .CSV</span>
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              aria-label="Upload CSV File"
              data-testid="csv-file-upload-input"
              onChange={(e) => void handleFileUpload(e)}
              disabled={isSubmitting}
              className="sr-only"
            />
          </label>
        </div>
        {uploadedFileName && (
          <p className="text-xs text-indigo-300 font-mono">Loaded file: {uploadedFileName}</p>
        )}
        <textarea
          id="csv-emails-textarea"
          aria-label="Employee Emails or CSV"
          data-testid="csv-emails-textarea"
          rows={5}
          value={rawEmailText}
          onChange={(e) => setRawEmailText(e.target.value)}
          disabled={isSubmitting}
          placeholder={"email\nalice.new@company.com\nbob.new@company.com"}
          className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-xs text-gray-100 font-mono placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Live Validation Summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          data-testid="csv-valid-count"
          className="px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-200 font-semibold"
        >
          Valid Unique Emails: {parsed.validEmails.length}
        </span>
        {parsed.duplicateCount > 0 && (
          <span
            data-testid="csv-duplicate-count"
            className="px-2.5 py-1 rounded bg-amber-950/60 border border-amber-800 text-amber-200"
          >
            Duplicates Deduplicated: {parsed.duplicateCount}
          </span>
        )}
        {seatCheck.alreadyOnTargetCount > 0 && (
          <span className="px-2.5 py-1 rounded bg-gray-900 border border-gray-700 text-gray-300">
            Already on target config: {seatCheck.alreadyOnTargetCount} (Net-new seats needed: {seatCheck.netSeatsNeeded})
          </span>
        )}
      </div>

      {parsed.invalidEntries.length > 0 && (
        <div
          data-testid="csv-invalid-warning"
          role="alert"
          className="bg-red-950/50 border border-red-700 rounded-lg p-3 text-xs text-red-200 space-y-1.5"
        >
          <div className="font-bold">
            Invalid Email Format Detected ({parsed.invalidEntries.length} entry{parsed.invalidEntries.length === 1 ? '' : 'ies'}):
          </div>
          <p>Fix or remove malformed entries before assigning seats:</p>
          <div className="font-mono bg-black/40 p-2 rounded max-h-24 overflow-y-auto">
            {parsed.invalidEntries.slice(0, 20).join(', ')}
            {parsed.invalidEntries.length > 20 && ` ... (+${parsed.invalidEntries.length - 20} more)`}
          </div>
        </div>
      )}

      {seatCheck.exceedsCapacity && (
        <div
          data-testid="csv-seat-shortfall-error"
          role="alert"
          className="bg-red-950/60 border-2 border-red-600 rounded-lg p-3 text-xs text-red-100"
        >
          <strong>Seat Capacity Exceeded:</strong> Need{' '}
          <strong>{seatCheck.netSeatsNeeded}</strong> net-new seat(s), but only{' '}
          <strong>{seatCheck.availableSeats}</strong> seat(s) remain on this LicenseConfig (shortfall of{' '}
          <strong>{seatCheck.seatShortfall}</strong> seat(s)). Distribute additional seats or reduce the CSV batch.
        </div>
      )}

      {/* Typed ASSIGN Confirmation */}
      <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-3.5 space-y-2">
        <label htmlFor="csv-confirm-assign-input" className="block text-xs text-gray-300">
          Type <code className="text-white font-bold bg-gray-800 px-1.5 py-0.5 rounded">ASSIGN</code> to confirm provisioning{' '}
          <strong className="text-white">{parsed.validEmails.length}</strong> user license(s)
          {parsed.validEmails.length > BULK_ASSIGN_CHUNK_SIZE && (
            <span>
              {' '}
              across {Math.ceil(parsed.validEmails.length / BULK_ASSIGN_CHUNK_SIZE)} chunks of {BULK_ASSIGN_CHUNK_SIZE}
            </span>
          )}
          :
        </label>
        <input
          id="csv-confirm-assign-input"
          aria-label="Type ASSIGN to confirm"
          data-testid="csv-confirm-input"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.trim())}
          disabled={isSubmitting}
          placeholder="ASSIGN"
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white font-mono focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isSubmitting && progress && (
        <div data-testid="csv-assign-progress" className="text-xs text-blue-300 font-mono">
          Assigning batch chunk {progress.completed} of {progress.total}...
        </div>
      )}

      {submitError && (
        <div
          data-testid="csv-submit-error"
          role="alert"
          className="bg-red-900/40 border border-red-700 rounded p-3 text-xs text-red-200"
        >
          {submitError}
        </div>
      )}
    </Modal>
  );
};

export default BulkAssignCsvModal;
