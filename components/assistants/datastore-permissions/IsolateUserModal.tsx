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

import React, { useRef } from 'react';
import { CUSTOM_ROLE_ID, IsolateTarget } from './types';
import { useModalA11y } from '../../../hooks/useModalA11y';

interface IsolateUserModalProps {
  isolateModalTarget: IsolateTarget | null;
  projectId: string;
  isIsolating: boolean;
  onClose: () => void;
  onConfirm: (members: string[]) => Promise<void>;
}

export const IsolateUserModal: React.FC<IsolateUserModalProps> = ({
  isolateModalTarget,
  projectId,
  isIsolating,
  onClose,
  onConfirm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen: !!isolateModalTarget,
    onClose,
    containerRef,
    preventClose: isIsolating,
  });

  if (!isolateModalTarget) return null;

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
            <p className="text-xs text-gray-400">Convert {isolateModalTarget.members.length} user(s) to the restricted access model</p>
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
              <p>Broad roles that bypass DataStore-level ACLs:</p>
              <p className="font-mono text-[11px] text-red-400">
                roles/viewer, roles/editor, roles/owner, roles/discoveryengine.admin, roles/discoveryengine.user, roles/discoveryengine.agentspaceUser
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-800 space-y-1.5">
            <div className="text-green-300 flex items-center gap-1.5 font-medium">
              <span>🟢 Role to be GRANTED at Project Level:</span>
            </div>
            <p className="text-green-400 font-mono pl-4 text-[11px] break-all">
              projects/{projectId}/roles/{CUSTOM_ROLE_ID}
            </p>
            <p className="text-[11px] text-gray-400 pl-4">
              Permission: <code>discoveryengine.locations.buildAuthorizationUrl</code>
            </p>
          </div>

          <div className="pt-2 border-t border-gray-800 text-[11px] text-blue-300 bg-blue-950/30 p-2.5 rounded border border-blue-900/50">
            👉 <strong>Next Step:</strong> After clearing broad roles and applying the custom role, the provisioner wizard below will open automatically so you can grant access to the App Engine and pick specific DataStores!
          </div>
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
            onClick={() => onConfirm(isolateModalTarget.members)}
            disabled={isIsolating}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
