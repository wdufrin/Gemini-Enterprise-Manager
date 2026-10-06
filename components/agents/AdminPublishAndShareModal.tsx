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

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AdminPublishAndShareResult,
  Agent,
  Config,
  PreviousOwnerDisposition,
} from '../../types';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';

export interface AdminPublishAndShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: AdminPublishAndShareResult) => void;
  agent: Agent;
  config: Config;
  initialSharingScope?: 'PRIVATE' | 'RESTRICTED' | 'ALL_USERS';
}

const AdminPublishAndShareModal: React.FC<AdminPublishAndShareModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  agent,
  config,
  initialSharingScope = 'RESTRICTED',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const detectedOwnerHint = useMemo(
    () => api.extractAgentOwnerHint(agent) || '',
    [agent],
  );

  const [displayName, setDisplayName] = useState(agent.displayName || '');
  const [ownerMode, setOwnerMode] = useState<'user' | 'self'>('user');
  const [targetOwnerInput, setTargetOwnerInput] = useState(detectedOwnerHint);
  const [previousOwnerDisposition, setPreviousOwnerDisposition] =
    useState<PreviousOwnerDisposition>('KEEP_AS_AGENT_USER');
  const [sharingScope, setSharingScope] = useState<
    'PRIVATE' | 'RESTRICTED' | 'ALL_USERS'
  >(initialSharingScope);
  const [sharedPrincipalsInput, setSharedPrincipalsInput] = useState('');
  const [deleteOriginalPrivateAgent, setDeleteOriginalPrivateAgent] =
    useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isSubmitting,
  });

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(agent.displayName || '');
    const hint = api.extractAgentOwnerHint(agent) || '';
    setTargetOwnerInput(hint);
    setSharingScope(initialSharingScope);
    if (initialSharingScope === 'PRIVATE') {
      setOwnerMode('self');
    }
    setError(null);
    setProgressMessage(null);
  }, [isOpen, agent, initialSharingScope]);

  const parsedSharedPrincipals = useMemo(
    () =>
      sharedPrincipalsInput
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [sharedPrincipalsInput],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }

    const isPrivateOnly = sharingScope === 'PRIVATE';

    let validatedOwnerPrincipal: string | undefined;
    if (!isPrivateOnly && ownerMode === 'user') {
      if (!targetOwnerInput.trim()) {
        setError(
          'Enter the user email or Workforce Identity principal who should own the published agent, or select "Keep Myself (Admin) as Owner".',
        );
        return;
      }
      try {
        validatedOwnerPrincipal =
          api.formatTransferTargetPrincipal(targetOwnerInput);
      } catch (validationErr: unknown) {
        setError(toErrorMessage(validationErr));
        return;
      }
    }

    if (sharingScope === 'RESTRICTED' && parsedSharedPrincipals.length > 0) {
      for (const rawPrincipal of parsedSharedPrincipals) {
        try {
          api.formatSharedIamPrincipal(rawPrincipal);
        } catch (validationErr: unknown) {
          setError(toErrorMessage(validationErr));
          return;
        }
      }
    }

    setIsSubmitting(true);
    setProgressMessage(
      isPrivateOnly
        ? 'Publishing agent out of draft (keeping Private / unshared)...'
        : 'Starting Admin Publish & Share workflow...',
    );
    try {
      const result = await api.adminPublishAndShareForUser(
        agent,
        {
          displayName: displayName.trim(),
          keepAdminAsOwner: isPrivateOnly || ownerMode === 'self',
          targetOwnerPrincipal:
            !isPrivateOnly && ownerMode === 'user'
              ? validatedOwnerPrincipal
              : undefined,
          previousOwnerDisposition,
          sharingScope,
          sharedPrincipals:
            sharingScope === 'RESTRICTED' ? parsedSharedPrincipals : [],
          deleteOriginalPrivateAgent,
          onProgress: (stepMessage) => {
            setProgressMessage(stepMessage);
          },
        },
        config,
      );

      onSuccess(result);
    } catch (err: unknown) {
      setError(
        toErrorMessage(
          err,
          'Failed to publish and share agent on behalf of user.',
        ),
      );
    } finally {
      setIsSubmitting(false);
      setProgressMessage(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      aria-labelledby="admin-publish-share-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={containerRef}
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700"
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="p-6 border-b border-gray-700 flex items-start justify-between gap-4">
            <div>
              <h3
                id="admin-publish-share-modal-title"
                className="text-xl font-bold text-white flex items-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-indigo-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                Admin Publish &amp; Share for User
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Publish a user&apos;s private agent, activate sharing, and assign{' '}
                <code className="text-amber-300 font-mono text-xs">
                  roles/discoveryengine.agentOwner
                </code>{' '}
                back to the user.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-white text-sm font-medium"
              aria-label="Close modal"
            >
              &#10005;
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* API Architecture Callout */}
            <div className="p-3.5 bg-indigo-950/40 border border-indigo-700/60 rounded-lg text-xs text-indigo-200 space-y-1.5">
              <p className="font-semibold text-indigo-300">
                How Admin Publish &amp; Share Works (Discovery Engine Lifecycle):
              </p>
              <p>
                Discovery Engine blocks non-owners (including Admins) from calling{' '}
                <code className="font-mono">:deployLowCode</code>,{' '}
                <code className="font-mono">:initIamPolicy</code>,{' '}
                <code className="font-mono">:requestAgentReview</code>, or{' '}
                <code className="font-mono">:transferAgentOwner</code> directly on a{' '}
                <span className="font-semibold text-yellow-300">PRIVATE</span> agent
                created by another user.
              </p>
              <p>
                This workflow clones the agent&apos;s full definition (nodes, instructions,
                connectors, starter prompts, and schedules), deploys &amp; shares the clone
                (<code className="font-mono">:deployLowCode</code> &rarr;{' '}
                <code className="font-mono">:initIamPolicy</code> &rarr;{' '}
                <code className="font-mono">:requestAgentReview</code> &rarr;{' '}
                <code className="font-mono">:enableAgent</code>), configures IAM access, and
                transfers ownership (<code className="font-mono">:transferAgentOwner</code>)
                to the target user.
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label
                htmlFor="publish-agent-display-name"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Published Agent Display Name
              </label>
              <input
                id="publish-agent-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Sales Research Assistant"
                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Target Owner */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">
                Agent Owner After Publishing
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    ownerMode === 'user'
                      ? 'bg-amber-950/30 border-amber-500/80 text-white'
                      : 'bg-gray-900/40 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="publishOwnerMode"
                    value="user"
                    checked={ownerMode === 'user'}
                    onChange={() => setOwnerMode('user')}
                    disabled={isSubmitting}
                    className="mt-1 text-amber-500 focus:ring-amber-500"
                  />
                  <div>
                    <div className="text-sm font-semibold">
                      Assign to User (Transfer Owner)
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Calls <code className="font-mono">:transferAgentOwner</code> after
                      sharing so the user owns the shared agent.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    ownerMode === 'self'
                      ? 'bg-amber-950/30 border-amber-500/80 text-white'
                      : 'bg-gray-900/40 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="publishOwnerMode"
                    value="self"
                    checked={ownerMode === 'self'}
                    onChange={() => setOwnerMode('self')}
                    disabled={isSubmitting}
                    className="mt-1 text-amber-500 focus:ring-amber-500"
                  />
                  <div>
                    <div className="text-sm font-semibold">
                      Keep Myself (Admin) as Owner
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      You remain the <code className="font-mono">agentOwner</code> and can
                      grant the user viewer access below.
                    </div>
                  </div>
                </label>
              </div>

              {ownerMode === 'user' && (
                <div className="p-3.5 bg-gray-900/50 border border-gray-700 rounded-lg space-y-3">
                  <div>
                    <label
                      htmlFor="publish-target-owner-input"
                      className="block text-xs font-medium text-gray-300 mb-1"
                    >
                      Target Owner Email or Workforce Principal
                    </label>
                    <input
                      id="publish-target-owner-input"
                      type="text"
                      value={targetOwnerInput}
                      onChange={(e) => setTargetOwnerInput(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="alice@company.com or principal://iam.googleapis.com/locations/global/workforcePools/..."
                      className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:ring-amber-500 focus:border-amber-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Supports Google Identity emails (<code className="font-mono">user:alice@company.com</code>) or Workforce Identity Pool principals.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="publish-prev-owner-disposition"
                      className="block text-xs font-medium text-gray-300 mb-1"
                    >
                      Your Access After Transferring Ownership
                    </label>
                    <select
                      id="publish-prev-owner-disposition"
                      value={previousOwnerDisposition}
                      onChange={(e) =>
                        setPreviousOwnerDisposition(
                          e.target.value as PreviousOwnerDisposition,
                        )
                      }
                      disabled={isSubmitting}
                      className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-amber-500 focus:border-amber-500"
                    >
                      <option value="KEEP_AS_AGENT_USER">
                        KEEP_AS_AGENT_USER — Keep me as an Agent User (Viewer)
                      </option>
                      <option value="REMOVE">
                        REMOVE — Remove me from direct IAM policy
                      </option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Sharing Scope */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">
                Sharing Scope
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    sharingScope === 'PRIVATE'
                      ? 'bg-cyan-950/30 border-cyan-500/80 text-white'
                      : 'bg-gray-900/40 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="publishSharingScope"
                    value="PRIVATE"
                    checked={sharingScope === 'PRIVATE'}
                    onChange={() => {
                      setSharingScope('PRIVATE');
                      setOwnerMode('self');
                    }}
                    disabled={isSubmitting}
                    className="mt-1 text-cyan-500 focus:ring-cyan-500"
                  />
                  <div>
                    <div className="text-sm font-semibold">
                      Keep Private (Publish Only)
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Publishes out of draft (<code className="font-mono">:deployLowCode</code> / <code className="font-mono">:publish</code>) without sharing (<code className="font-mono">state: PRIVATE</code>).
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    sharingScope === 'RESTRICTED'
                      ? 'bg-indigo-950/30 border-indigo-500/80 text-white'
                      : 'bg-gray-900/40 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="publishSharingScope"
                    value="RESTRICTED"
                    checked={sharingScope === 'RESTRICTED'}
                    onChange={() => setSharingScope('RESTRICTED')}
                    disabled={isSubmitting}
                    className="mt-1 text-indigo-500 focus:ring-indigo-500"
                  />
                  <div>
                    <div className="text-sm font-semibold">
                      Restricted (Specific Users / Groups)
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Shared only with the owner and specified IAM principals.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    sharingScope === 'ALL_USERS'
                      ? 'bg-indigo-950/30 border-indigo-500/80 text-white'
                      : 'bg-gray-900/40 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="publishSharingScope"
                    value="ALL_USERS"
                    checked={sharingScope === 'ALL_USERS'}
                    onChange={() => setSharingScope('ALL_USERS')}
                    disabled={isSubmitting}
                    className="mt-1 text-indigo-500 focus:ring-indigo-500"
                  />
                  <div>
                    <div className="text-sm font-semibold">
                      All Users in App (<code className="font-mono">allUsers</code>)
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Available to everyone with access to this Gemini Enterprise app.
                    </div>
                  </div>
                </label>
              </div>

              {sharingScope === 'PRIVATE' && (
                <div className="p-3 bg-cyan-950/30 border border-cyan-700/50 rounded-md text-xs text-cyan-200">
                  <strong>Publish Without Sharing:</strong> Skips{' '}
                  <code className="font-mono">:initIamPolicy</code> and{' '}
                  <code className="font-mono">:requestAgentReview</code>. The
                  agent is deployed out of draft while remaining{' '}
                  <code className="font-mono">PRIVATE</code> (unshared and not
                  sharable via IAM).
                </div>
              )}

              {sharingScope === 'RESTRICTED' && (
                <div>
                  <label
                    htmlFor="publish-shared-principals"
                    className="block text-xs font-medium text-gray-300 mb-1"
                  >
                    Additional Users or Groups (<code className="font-mono">roles/discoveryengine.agentUser</code>) — Optional
                  </label>
                  <textarea
                    id="publish-shared-principals"
                    rows={2}
                    value={sharedPrincipalsInput}
                    onChange={(e) => setSharedPrincipalsInput(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="user:teammate@company.com, group:engineering@company.com"
                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-xs text-white font-mono placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Leave blank to keep access restricted strictly to the owner. Comma- or newline-separated emails, <code className="font-mono">user:...</code>, <code className="font-mono">group:...</code>, <code className="font-mono">domain:...</code>, or Workforce <code className="font-mono">principal://...</code> / <code className="font-mono">principalSet://...</code>.
                  </p>
                </div>
              )}
            </div>

            {/* Cleanup Original Option */}
            <div className="p-3.5 bg-gray-900/50 border border-gray-700 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteOriginalPrivateAgent}
                  onChange={(e) =>
                    setDeleteOriginalPrivateAgent(e.target.checked)
                  }
                  disabled={isSubmitting}
                  className="mt-0.5 rounded bg-gray-900 border-gray-600 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-200">
                    Delete original unshared Private agent after publishing succeeds
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Removes the original <code className="font-mono">{agent.name.split('/').pop()}</code> draft once the new agent is published, preventing duplicate agents in the list.
                  </p>
                </div>
              </label>
            </div>

            {/* Live Progress */}
            {progressMessage && (
              <div className="p-3 bg-indigo-950/60 border border-indigo-600 rounded-md flex items-center gap-3 text-xs text-indigo-200">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-400 shrink-0" />
                <span>{progressMessage}</span>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="p-3 bg-red-900/40 border border-red-700 rounded-md text-xs text-red-200 whitespace-pre-wrap"
              >
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-3 rounded-b-lg">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-medium rounded-md hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                  {sharingScope === 'PRIVATE'
                    ? 'Publishing...'
                    : 'Publishing & Sharing...'}
                </>
              ) : sharingScope === 'PRIVATE' ? (
                'Publish Agent (Keep Private)'
              ) : (
                'Publish & Share Agent'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminPublishAndShareModal;
