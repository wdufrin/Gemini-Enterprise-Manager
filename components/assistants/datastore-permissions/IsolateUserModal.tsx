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

import React, { useEffect, useRef, useState } from 'react';
import {
  BROAD_PROJECT_ROLES,
  buildCustomRestrictedRoleName,
  IsolateTarget,
  NOTEBOOK_LM_USER_ROLE,
} from './types';
import { useModalA11y } from '../../../hooks/useModalA11y';

interface IsolateUserModalProps {
  isolateModalTarget: IsolateTarget | null;
  projectId: string;
  isIsolating: boolean;
  currentUserEmail?: string;
  onClose: () => void;
  onConfirm: (
    members: string[],
    grantNotebookLm?: boolean,
    allowSelfIsolation?: boolean
  ) => Promise<void>;
}

export const IsolateUserModal: React.FC<IsolateUserModalProps> = ({
  isolateModalTarget,
  projectId,
  isIsolating,
  currentUserEmail,
  onClose,
  onConfirm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [grantNotebookLm, setGrantNotebookLm] = useState(true);
  const [acknowledgeSelfLockout, setAcknowledgeSelfLockout] = useState(false);

  useEffect(() => {
    setAcknowledgeSelfLockout(false);
  }, [isolateModalTarget]);

  useModalA11y({
    isOpen: !!isolateModalTarget,
    onClose,
    containerRef,
    preventClose: isIsolating,
  });

  if (!isolateModalTarget) return null;

  const normalizedAdminEmail = currentUserEmail?.trim().toLowerCase() || '';
  const isSelfIncluded =
    normalizedAdminEmail.length > 0 &&
    isolateModalTarget.members.some(
      (m) => m.replace(/^user:/i, '').trim().toLowerCase() === normalizedAdminEmail
    );

  const customEndUserRoleName = buildCustomRestrictedRoleName(projectId, 'endUser');
  const rolesToDisplay =
    isolateModalTarget.broadRoles && isolateModalTarget.broadRoles.length > 0
      ? isolateModalTarget.broadRoles
      : BROAD_PROJECT_ROLES;

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
      aria-modal="true"
      role="dialog"
      aria-labelledby="isolate-user-modal-title"
      onClick={() => {
        if (!isIsolating) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-900/50 text-yellow-300 border border-yellow-700 flex items-center justify-center font-bold text-lg">
            ⚠️
          </div>
          <div>
            <h3 id="isolate-user-modal-title" className="text-base font-bold text-white">Isolate User(s) for DataStore Control</h3>
            <p className="text-xs text-gray-400">Convert {isolateModalTarget.members.length} user(s) to the GA custom restricted access model</p>
          </div>
        </div>

        <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-4 space-y-3 text-xs">
          <div>
            <span className="text-gray-400 font-semibold block mb-1">Target User(s):</span>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {isolateModalTarget.members.map(m => (
                <span key={m} className="px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-blue-300 font-mono">
                  {m}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-800 space-y-1.5">
            <div className="text-red-300 flex items-center gap-1.5 font-medium">
              <span>🔻 Roles to be REMOVED from Project Level:</span>
            </div>
            <div className="text-gray-400 pl-4 space-y-1">
              <p>Project-wide roles (including App-Only <code>agentspaceRestrictedUser</code>) that bypass DataStore ACLs:</p>
              <p className="font-mono text-[11px] text-red-400">
                {rolesToDisplay.join(', ')}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-800 space-y-1.5">
            <div className="text-green-300 flex items-center gap-1.5 font-medium">
              <span>🟢 GA Custom &amp; NotebookLM Roles to be GRANTED at Project Level:</span>
            </div>
            <p className="text-green-400 font-mono pl-4 text-[11px] break-all">
              {customEndUserRoleName}
            </p>
            <p className="text-[11px] text-gray-400 pl-4">
              Automatically created/verified on project <code>{projectId}</code> with location-level OAuth &amp; user permissions and zero <code>collections.get</code> / <code>dataStores.get</code> bypasses.
            </p>
            <div className="pl-4 pt-1">
              <label className="flex items-start gap-2 cursor-pointer text-[11px] text-gray-300">
                <input
                  type="checkbox"
                  checked={grantNotebookLm}
                  onChange={(e) => setGrantNotebookLm(e.target.checked)}
                  className="mt-0.5 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  Also grant <code className="text-purple-300">{NOTEBOOK_LM_USER_ROLE}</code> at project level (preserves NotebookLM Enterprise access)
                </span>
              </label>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-800 text-[11px] text-blue-300 bg-blue-950/30 p-2.5 rounded border border-blue-900/50">
            👉 <strong>Next Step:</strong> After stripping bypass roles and granting <code>customRestrictedEndUser</code>, the provisioner wizard below will open automatically so you can grant access to the App Engine and specific DataStores/Connectors!
          </div>

          {isSelfIncluded ? (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-950/60 border border-red-700/80 text-red-200 space-y-2 text-[11px]"
            >
              <p className="font-semibold text-red-300">
                Self-Lockout Guard: Your active account ({currentUserEmail}) is selected!
              </p>
              <p>
                Stripping project-wide Discovery Engine roles from your own signed-in identity can immediately revoke your administrative visibility in this console.
              </p>
              <label className="flex items-start gap-2 cursor-pointer text-red-100 pt-1">
                <input
                  type="checkbox"
                  checked={acknowledgeSelfLockout}
                  onChange={(e) => setAcknowledgeSelfLockout(e.target.checked)}
                  className="mt-0.5 rounded bg-gray-900 border-red-500 text-red-600 focus:ring-red-500"
                />
                <span>
                  I understand isolating my own account ({currentUserEmail}) may lock me out of project-wide Discovery Engine administration.
                </span>
              </label>
            </div>
          ) : (
            <p className="text-[11px] text-amber-300/90 bg-amber-950/25 border border-amber-800/50 rounded p-2">
              Caution: Never isolate your own active administrator account unless another project owner can restore your IAM bindings.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isIsolating}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                isolateModalTarget.members,
                grantNotebookLm,
                isSelfIncluded ? acknowledgeSelfLockout : false
              )
            }
            disabled={isIsolating || (isSelfIncluded && !acknowledgeSelfLockout)}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isIsolating ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Isolating...</span>
              </>
            ) : (
              <span>Confirm & Isolate User(s)</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
