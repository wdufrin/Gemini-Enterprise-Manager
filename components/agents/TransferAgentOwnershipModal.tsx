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
  Agent,
  Config,
  IamPolicy,
  PreviousOwnerDisposition,
} from '../../types';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';

const AGENT_OWNER_ROLE = 'roles/discoveryengine.agentOwner';

export interface TransferAgentOwnershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedPolicy?: IamPolicy | null) => void;
  agent: Agent;
  config: Config;
  currentPolicy?: IamPolicy | null;
}

const TransferAgentOwnershipModal: React.FC<TransferAgentOwnershipModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  agent,
  config,
  currentPolicy,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [targetMode, setTargetMode] = useState<'self' | 'other'>('self');
  const [targetPrincipalInput, setTargetPrincipalInput] = useState('');
  const [previousOwnerDisposition, setPreviousOwnerDisposition] =
    useState<PreviousOwnerDisposition>('KEEP_AS_AGENT_USER');
  const [policyData, setPolicyData] = useState<IamPolicy | null>(
    currentPolicy || null,
  );
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isSubmitting,
  });

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setCopiedCurl(false);
    if (currentPolicy) {
      setPolicyData(currentPolicy);
      return;
    }

    let cancelled = false;
    const loadPolicy = async () => {
      setIsLoadingPolicy(true);
      try {
        const fetched = await api.getAgentIamPolicy(agent.name, config);
        if (!cancelled) {
          setPolicyData(fetched);
        }
      } catch {
        // Non-fatal: policy preview is informational; transferAgentOwner RPC does not require an etag
      } finally {
        if (!cancelled) {
          setIsLoadingPolicy(false);
        }
      }
    };
    loadPolicy();

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentPolicy, agent.name, config]);

  const currentOwners = useMemo(() => {
    const bindings = policyData?.bindings || [];
    const ownerBinding = bindings.find((b) => b.role === AGENT_OWNER_ROLE);
    return ownerBinding?.members || [];
  }, [policyData]);

  const resolvedPreviewPayload = useMemo(() => {
    if (targetMode === 'self') {
      return {
        currentUser: {},
        previousOwnerDisposition,
      };
    }
    let formattedPrincipal = targetPrincipalInput.trim() || 'user:new-owner@example.com';
    try {
      formattedPrincipal = api.formatTransferTargetPrincipal(targetPrincipalInput);
    } catch {
      // Keep raw preview if not yet valid
    }
    return {
      targetPrincipal: {
        principal: formattedPrincipal,
      },
      previousOwnerDisposition,
    };
  }, [targetMode, targetPrincipalInput, previousOwnerDisposition]);

  const curlPreview = useMemo(() => {
    const endpoint =
      !config.appLocation || config.appLocation === 'global'
        ? 'https://discoveryengine.googleapis.com'
        : `https://${config.appLocation}-discoveryengine.googleapis.com`;
    const agentName = agent.name.startsWith('projects/')
      ? agent.name
      : `projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || 'default_collection'}/engines/${config.appId}/assistants/${config.assistantId || 'default_assistant'}/agents/${agent.name}`;
    return [
      `curl -X POST \\`,
      `  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "X-Goog-User-Project: ${config.projectId}" \\`,
      `  "${endpoint}/v1alpha/${agentName}:transferAgentOwner" \\`,
      `  -d '${JSON.stringify(resolvedPreviewPayload, null, 2)}'`,
    ].join('\n');
  }, [agent.name, config, resolvedPreviewPayload]);

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlPreview);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let validatedPrincipal: string | undefined;
    if (targetMode === 'other') {
      try {
        validatedPrincipal = api.formatTransferTargetPrincipal(targetPrincipalInput);
      } catch (validationErr: unknown) {
        setError(toErrorMessage(validationErr));
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await api.transferAgentOwner(
        agent.name,
        {
          toSelf: targetMode === 'self',
          targetPrincipal: validatedPrincipal,
          previousOwnerDisposition,
        },
        config,
      );

      let refreshedPolicy: IamPolicy | null = null;
      try {
        refreshedPolicy = await api.getAgentIamPolicy(agent.name, config);
      } catch {
        // Ignore policy refresh failure if transfer itself succeeded
      }
      onSuccess(refreshedPolicy);
    } catch (err: unknown) {
      setError(
        toErrorMessage(
          err,
          'Failed to transfer agent ownership. Verify you have the Gemini Enterprise Admin (roles/discoveryengine.agentspaceAdmin) or Discovery Engine Admin (roles/discoveryengine.admin) role and that the agent is shared.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      aria-labelledby="transfer-ownership-modal-title"
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
                id="transfer-ownership-modal-title"
                className="text-xl font-bold text-white flex items-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-amber-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                Transfer Ownership of &ldquo;{agent.displayName}&rdquo;
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Reassign the <code className="text-amber-300 font-mono text-xs">{AGENT_OWNER_ROLE}</code> role for this shared no-code agent.
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
            {/* Current Owner Summary */}
            <div className="p-3.5 bg-gray-900/60 border border-gray-700 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  Current Agent Owner ({AGENT_OWNER_ROLE})
                </span>
                <div className="mt-1 text-sm font-mono text-white">
                  {isLoadingPolicy ? (
                    <span className="text-gray-400 italic">Resolving current owner from IAM policy...</span>
                  ) : currentOwners.length > 0 ? (
                    currentOwners.join(', ')
                  ) : (
                    <span className="text-gray-400 italic">Not listed in IAM bindings</span>
                  )}
                </div>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-900/50 text-purple-300 border border-purple-700/50 self-start sm:self-center">
                Single Owner Enforced
              </span>
            </div>

            {/* Target Radio Selection */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-gray-200 mb-2">
                Transfer ownership to
              </legend>

              <label
                className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                  targetMode === 'self'
                    ? 'bg-blue-900/25 border-blue-500/60'
                    : 'bg-gray-900/40 border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="transferTarget"
                  value="self"
                  checked={targetMode === 'self'}
                  onChange={() => {
                    setTargetMode('self');
                    setError(null);
                  }}
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-600 bg-gray-700 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-semibold text-white">
                    Myself (Current Authenticated User)
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Transfers ownership to your currently signed-in account via end-user credentials (<code className="text-blue-300">currentUser: &#123;&#125;</code>).
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                  targetMode === 'other'
                    ? 'bg-blue-900/25 border-blue-500/60'
                    : 'bg-gray-900/40 border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="transferTarget"
                  value="other"
                  checked={targetMode === 'other'}
                  onChange={() => {
                    setTargetMode('other');
                    setError(null);
                  }}
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-600 bg-gray-700 focus:ring-blue-500"
                />
                <div className="w-full">
                  <div className="text-sm font-semibold text-white">
                    Another user
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Specify a Google Identity email address or a Workforce Identity Federation (3P IdP) subject principal.
                  </p>
                </div>
              </label>
            </fieldset>

            {/* Target Principal Input when 'other' is selected */}
            {targetMode === 'other' && (
              <div className="p-4 bg-gray-900/50 border border-gray-700 rounded-lg space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="new-owner-principal-input"
                    className="block text-sm font-medium text-gray-200"
                  >
                    New Owner Email or Workforce Identity Principal
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-400">Insert template:</span>
                    <button
                      type="button"
                      onClick={() => setTargetPrincipalInput('user@example.com')}
                      className="px-2 py-0.5 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600 font-mono"
                    >
                      Google Email
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTargetPrincipalInput(
                          'principal://iam.googleapis.com/locations/global/workforcePools/POOL_ID/subject/SUBJECT_ID',
                        )
                      }
                      className="px-2 py-0.5 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600 font-mono"
                    >
                      WIF Principal
                    </button>
                  </div>
                </div>

                <input
                  id="new-owner-principal-input"
                  type="text"
                  value={targetPrincipalInput}
                  onChange={(e) => {
                    setTargetPrincipalInput(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g., alice@example.com or principal://iam.googleapis.com/locations/global/workforcePools/POOL_ID/subject/SUBJECT_ID"
                  className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white font-mono focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />

                <div className="text-xs text-gray-400 space-y-1">
                  <p>
                    <strong className="text-gray-300">Google Identity (1P):</strong>{' '}
                    Enter an email address like <code className="text-blue-300 font-mono">alice@example.com</code> (automatically formatted as <code className="text-blue-300 font-mono">user:alice@example.com</code>).
                  </p>
                  <p>
                    <strong className="text-gray-300">Workforce Identity Federation (3P IdP):</strong>{' '}
                    Enter <code className="text-blue-300 font-mono">principal://iam.googleapis.com/locations/global/workforcePools/POOL_ID/subject/SUBJECT_ID</code>. Note: WIF principals are case-sensitive and must match the exact casing in <code className="text-gray-300 font-mono">google.subject</code>.
                  </p>
                </div>
              </div>
            )}

            {/* Previous Owner Disposition */}
            <div className="space-y-1.5">
              <label
                htmlFor="previous-owner-disposition"
                className="block text-sm font-medium text-gray-200"
              >
                Previous Owner Access After Transfer
              </label>
              <select
                id="previous-owner-disposition"
                value={previousOwnerDisposition}
                onChange={(e) =>
                  setPreviousOwnerDisposition(
                    e.target.value as PreviousOwnerDisposition,
                  )
                }
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="KEEP_AS_AGENT_USER">
                  Demote previous owner to Agent User (roles/discoveryengine.agentUser) — Recommended
                </option>
                <option value="REMOVE">
                  Remove previous owner from agent IAM policy (loses explicit access)
                </option>
              </select>
            </div>

            {/* Considerations Callout per GA / Public Docs */}
            <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg text-xs text-amber-200 space-y-2">
              <div className="font-semibold text-amber-300 flex items-center gap-1.5 text-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Ownership Transfer Considerations
              </div>
              <ul className="list-disc list-inside space-y-1 text-amber-100/90">
                <li>
                  <strong>Required Admin Role:</strong> You must have the{' '}
                  <code className="font-mono text-amber-300">roles/discoveryengine.agentspaceAdmin</code>{' '}
                  or <code className="font-mono text-amber-300">roles/discoveryengine.admin</code> role.
                </li>
                <li>
                  <strong>Previous Owner Demoted:</strong> The current owner will lose edit permissions and be demoted to{' '}
                  <code className="font-mono text-amber-300">roles/discoveryengine.agentUser</code> (unless removed).
                </li>
                <li>
                  <strong>Schedule &amp; Event Triggers Disabled:</strong> If this agent has a schedule trigger or event trigger, the transfer operation marks them as <strong>disabled</strong>. The new owner must re-enable them after transfer.
                </li>
              </ul>
            </div>

            {/* REST API cURL Preview */}
            <div className="p-3.5 bg-gray-900 border border-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  REST API Preview (:transferAgentOwner)
                </span>
                <button
                  type="button"
                  onClick={handleCopyCurl}
                  className="px-2.5 py-1 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-blue-300 border border-gray-600 rounded transition-colors"
                >
                  {copiedCurl ? 'Copied cURL!' : 'Copy cURL'}
                </button>
              </div>
              <pre className="text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                <code>{curlPreview}</code>
              </pre>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-300"
              >
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-end space-x-3 rounded-b-lg">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (targetMode === 'other' && !targetPrincipalInput.trim())}
              className="px-5 py-2 bg-amber-600 text-white font-semibold rounded-md hover:bg-amber-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  <span>Transferring...</span>
                </>
              ) : (
                <span>Transfer Ownership</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TransferAgentOwnershipModal;
