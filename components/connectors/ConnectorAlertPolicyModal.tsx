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

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Collection } from "../../types";
import * as alertPoliciesApi from "../../services/api/alertPolicies";
import type {
  AlertPolicy,
  NotificationChannel,
} from "../../services/api/alertPolicies";
import { useModalA11y } from "../../hooks/useModalA11y";
import { toErrorMessage } from "../../utils/errors";

export interface ConnectorAlertPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  collections: Collection[];
  initialCollectionId?: string;
}

type TemplateKind = "connector_sync_failure" | "daily_quota_threshold";

export const ConnectorAlertPolicyModal: React.FC<ConnectorAlertPolicyModalProps> = ({
  isOpen,
  onClose,
  projectId,
  collections,
  initialCollectionId = "",
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y({
    isOpen,
    onClose,
    containerRef: dialogRef,
  });

  const [templateKind, setTemplateKind] = useState<TemplateKind>(
    "connector_sync_failure",
  );
  const [selectedCollectionId, setSelectedCollectionId] = useState(
    initialCollectionId,
  );
  const [rateLimitSeconds, setRateLimitSeconds] = useState(900);
  const [dailyQuotaThreshold, setDailyQuotaThreshold] = useState(50000);

  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [existingPolicies, setExistingPolicies] = useState<AlertPolicy[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);
  const [copiedCli, setCopiedCli] = useState(false);
  const [deletingPolicyName, setDeletingPolicyName] = useState<string | null>(
    null,
  );

  const refreshMonitoringData = async () => {
    if (!projectId.trim()) return;
    setIsLoadingMeta(true);
    setMetaError(null);
    try {
      const [fetchedPolicies, fetchedChannels] = await Promise.all([
        alertPoliciesApi.listAlertPolicies(projectId),
        alertPoliciesApi.listNotificationChannels(projectId),
      ]);
      setExistingPolicies(fetchedPolicies);
      setChannels(fetchedChannels);
    } catch (err: unknown) {
      setMetaError(
        toErrorMessage(
          err,
          "Failed to load existing Cloud Monitoring alert policies or notification channels.",
        ),
      );
    } finally {
      setIsLoadingMeta(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedCollectionId(initialCollectionId || "");
      setDeployError(null);
      setDeploySuccess(null);
      setCopiedCli(false);
      void refreshMonitoringData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, initialCollectionId]);

  const selectedCollectionObj = useMemo(
    () =>
      collections.find(
        (c) => (c.name.split("/").pop() || "") === selectedCollectionId,
      ),
    [collections, selectedCollectionId],
  );

  const { previewPolicy, previewError, gcloudCli } = useMemo(() => {
    if (!projectId.trim()) {
      return {
        previewPolicy: null,
        previewError: "Project ID is required to generate an alert policy.",
        gcloudCli: "",
      };
    }
    try {
      const policy =
        templateKind === "connector_sync_failure"
          ? alertPoliciesApi.buildConnectorSyncFailureAlertPolicy({
              projectId,
              collectionId: selectedCollectionId || undefined,
              collectionDisplayName: selectedCollectionObj?.displayName,
              notificationChannels: selectedChannels,
              rateLimitSeconds,
            })
          : alertPoliciesApi.buildQuotaThresholdAlertPolicy({
              projectId,
              dailyRequestThreshold: dailyQuotaThreshold,
              notificationChannels: selectedChannels,
            });
      const cli = alertPoliciesApi.buildGcloudAlertPolicyCommand(projectId, policy);
      return { previewPolicy: policy, previewError: null, gcloudCli: cli };
    } catch (err: unknown) {
      return {
        previewPolicy: null,
        previewError: toErrorMessage(err),
        gcloudCli: "",
      };
    }
  }, [
    projectId,
    templateKind,
    selectedCollectionId,
    selectedCollectionObj,
    selectedChannels,
    rateLimitSeconds,
    dailyQuotaThreshold,
  ]);

  const relevantPolicies = useMemo(() => {
    return existingPolicies.filter((p) => {
      const serialized = JSON.stringify(p).toLowerCase();
      return (
        serialized.includes("vertex_ai_search_connector") ||
        serialized.includes("discoveryengine.googleapis.com") ||
        serialized.includes("gemini_enterprise_manager") ||
        serialized.includes("dataconnector")
      );
    });
  }, [existingPolicies]);

  const handleToggleChannel = (channelName: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelName)
        ? prev.filter((c) => c !== channelName)
        : [...prev, channelName],
    );
  };

  const handleDeploy = async () => {
    if (!previewPolicy) return;
    setIsDeploying(true);
    setDeployError(null);
    setDeploySuccess(null);
    try {
      const created = await alertPoliciesApi.createAlertPolicy(projectId, previewPolicy);
      setDeploySuccess(
        `Deployed alert policy "${created.displayName}" (${created.name.split("/").pop()}).`,
      );
      await refreshMonitoringData();
    } catch (err: unknown) {
      setDeployError(toErrorMessage(err, "Failed to deploy Cloud Monitoring alert policy."));
    } finally {
      setIsDeploying(false);
    }
  };

  const handleDeleteExisting = async (policyName: string) => {
    setDeletingPolicyName(policyName);
    setDeployError(null);
    try {
      await alertPoliciesApi.deleteAlertPolicy(projectId, policyName);
      setExistingPolicies((prev) => prev.filter((p) => p.name !== policyName));
    } catch (err: unknown) {
      setDeployError(toErrorMessage(err, "Failed to delete alert policy."));
    } finally {
      setDeletingPolicyName(null);
    }
  };

  const handleCopyCli = async () => {
    if (!gcloudCli) return;
    try {
      await navigator.clipboard.writeText(gcloudCli);
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 2000);
    } catch (err: unknown) {
      setDeployError(`Clipboard copy failed: ${toErrorMessage(err)}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connector-alert-modal-title"
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2
              id="connector-alert-modal-title"
              className="text-lg font-bold text-white"
            >
              Cloud Monitoring Alert Policy Provisioner
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              1-click deploy or export <code className="text-gray-300">gcloud</code>{" "}
              alert policies for Discovery Engine DataConnector sync failures &amp; daily quota breaches.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Alert Policy Provisioner"
            className="text-gray-400 hover:text-white px-2 py-1 text-lg font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {metaError && (
            <div
              role="alert"
              className="bg-amber-900/30 border border-amber-700/60 text-amber-200 p-3 rounded-lg text-xs"
            >
              {metaError}
            </div>
          )}

          {deployError && (
            <div
              role="alert"
              className="bg-red-900/30 border border-red-700/60 text-red-200 p-3 rounded-lg text-xs"
            >
              {deployError}
            </div>
          )}

          {deploySuccess && (
            <div
              role="status"
              className="bg-emerald-900/30 border border-emerald-700/60 text-emerald-200 p-3 rounded-lg text-xs"
            >
              {deploySuccess}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTemplateKind("connector_sync_failure")}
              className={`p-3.5 rounded-lg border text-left transition-colors ${
                templateKind === "connector_sync_failure"
                  ? "bg-blue-950/50 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              <div className="text-sm font-bold">
                DataConnector Sync Failure Alert
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Log-based alert (<code className="font-mono">vertex_ai_search_connector</code>{" "}
                severity &gt;= ERROR) with notification rate limiting.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTemplateKind("daily_quota_threshold")}
              className={`p-3.5 rounded-lg border text-left transition-colors ${
                templateKind === "daily_quota_threshold"
                  ? "bg-blue-950/50 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              <div className="text-sm font-bold">
                Daily Quota Threshold Breach
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Metric threshold alert on{" "}
                <code className="font-mono">serviceruntime.googleapis.com/quota/rate/net_usage</code>{" "}
                for Discovery Engine.
              </div>
            </button>
          </div>

          {templateKind === "connector_sync_failure" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-800/60 p-4 rounded-lg border border-gray-700">
              <div>
                <label
                  htmlFor="alert-collection-scope"
                  className="block text-xs font-semibold text-gray-300 mb-1"
                >
                  Connector Scope
                </label>
                <select
                  id="alert-collection-scope"
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white"
                >
                  <option value="">All Connectors in Project ({projectId})</option>
                  {collections
                    .filter((c) => !c.name.endsWith("/default_collection"))
                    .map((col) => {
                      const colId = col.name.split("/").pop() || "";
                      return (
                        <option key={col.name} value={colId}>
                          {col.displayName ? `${col.displayName} (${colId})` : colId}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label
                  htmlFor="alert-rate-limit"
                  className="block text-xs font-semibold text-gray-300 mb-1"
                >
                  Notification Rate Limit
                </label>
                <select
                  id="alert-rate-limit"
                  value={rateLimitSeconds}
                  onChange={(e) => setRateLimitSeconds(Number(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white"
                >
                  <option value={300}>Every 5 minutes (300s)</option>
                  <option value={900}>Every 15 minutes (900s)</option>
                  <option value={3600}>Every 1 hour (3600s)</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="bg-gray-800/60 p-4 rounded-lg border border-gray-700">
              <label
                htmlFor="alert-daily-quota-threshold"
                className="block text-xs font-semibold text-gray-300 mb-1"
              >
                Daily Discovery Engine Request Threshold (24h Window)
              </label>
              <input
                id="alert-daily-quota-threshold"
                type="number"
                min={1}
                value={dailyQuotaThreshold}
                onChange={(e) =>
                  setDailyQuotaThreshold(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-full sm:w-64 bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          )}

          <div className="bg-gray-800/60 p-4 rounded-lg border border-gray-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-300">
                Notification Channels ({channels.length} discovered)
              </span>
              {isLoadingMeta && (
                <span className="text-xs text-gray-400">Loading channels...</span>
              )}
            </div>
            {channels.length === 0 ? (
              <p className="text-xs text-gray-400">
                No notification channels configured in this project yet. You can still deploy the policy (incidents appear in Cloud Monitoring) and attach Email/Slack/PagerDuty channels later.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {channels.map((ch) => (
                  <label
                    key={ch.name}
                    className="flex items-center gap-2 p-2 rounded bg-gray-900 border border-gray-700 text-xs text-gray-200 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(ch.name)}
                      onChange={() => handleToggleChannel(ch.name)}
                      className="rounded bg-gray-800 border-gray-600 text-blue-500"
                    />
                    <span className="truncate">
                      {ch.displayName || ch.name.split("/").pop()}{" "}
                      <span className="text-gray-500 font-mono">({ch.type})</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {previewError ? (
            <div className="text-xs text-red-300 bg-red-900/20 border border-red-800 p-3 rounded-lg">
              {previewError}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">
                  Equivalent <code className="font-mono">gcloud</code> CLI Command
                </span>
                <button
                  type="button"
                  onClick={handleCopyCli}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-xs text-gray-200 rounded font-semibold"
                >
                  {copiedCli ? "Copied CLI!" : "Copy gcloud CLI"}
                </button>
              </div>
              <pre className="p-3 bg-gray-950 border border-gray-800 rounded-lg text-[11px] text-gray-300 font-mono overflow-x-auto max-h-44">
                {gcloudCli}
              </pre>
            </div>
          )}

          {relevantPolicies.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Active Discovery Engine Alert Policies ({relevantPolicies.length})
              </h3>
              <div className="space-y-1.5">
                {relevantPolicies.map((pol) => (
                  <div
                    key={pol.name}
                    className="flex items-center justify-between bg-gray-800/80 border border-gray-700 px-3 py-2 rounded-md text-xs"
                  >
                    <div className="truncate pr-3">
                      <span className="font-semibold text-white">
                        {pol.displayName}
                      </span>
                      <span
                        className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          pol.enabled !== false
                            ? "bg-emerald-900/60 text-emerald-300"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {pol.enabled !== false ? "ENABLED" : "DISABLED"}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={deletingPolicyName === pol.name}
                      onClick={() => handleDeleteExisting(pol.name)}
                      className="text-red-400 hover:text-red-300 font-semibold shrink-0"
                    >
                      {deletingPolicyName === pol.name ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-800 border-t border-gray-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-md"
          >
            Close
          </button>
          <button
            type="button"
            disabled={isDeploying || !previewPolicy}
            onClick={handleDeploy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-semibold rounded-md"
          >
            {isDeploying ? "Deploying Policy..." : "1-Click Deploy Alert Policy"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectorAlertPolicyModal;
