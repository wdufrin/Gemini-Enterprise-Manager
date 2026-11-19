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

import React, { useState, useMemo } from "react";
import { Collection, DataConnector, Operation } from "../../types";
import { ValidationResult } from "./connectorDiagnostics";
import { getConnectorCloneEligibility } from "./duplicate/duplicateFieldUtils";

export interface SyncSlaStatus {
  breached: boolean;
  severity: "ok" | "warning" | "error";
  label: string;
  reason: string;
  ageMs?: number;
  intervalMs?: number;
}

/**
 * Parses a Discovery Engine DataConnector `refreshInterval` string into milliseconds.
 * Supports Protobuf Duration seconds (`"86400s"`, `"21600.5s"`) and ISO-8601
 * durations (`"P1D"`, `"PT6H"`, `"P1DT12H"`, `"PT30M"`, `"P1W"`).
 */
export function parseRefreshIntervalMs(
  rawInterval?: string | number | null,
): number | null {
  if (rawInterval === undefined || rawInterval === null) return null;
  if (typeof rawInterval === "number") {
    return Number.isFinite(rawInterval) && rawInterval > 0
      ? rawInterval * 1000
      : null;
  }
  const trimmed = rawInterval.trim();
  if (!trimmed) return null;

  const secondsMatch = trimmed.match(/^(\d+(?:\.\d+)?)s?$/i);
  if (secondsMatch) {
    const secs = parseFloat(secondsMatch[1]);
    return secs > 0 ? secs * 1000 : null;
  }

  const isoMatch = trimmed.match(
    /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
  );
  if (isoMatch) {
    const [, wStr, dStr, hStr, mStr, sStr] = isoMatch;
    if (!wStr && !dStr && !hStr && !mStr && !sStr) return null;
    const totalMs =
      (wStr ? parseFloat(wStr) * 7 * 86400_000 : 0) +
      (dStr ? parseFloat(dStr) * 86400_000 : 0) +
      (hStr ? parseFloat(hStr) * 3600_000 : 0) +
      (mStr ? parseFloat(mStr) * 60_000 : 0) +
      (sStr ? parseFloat(sStr) * 1000 : 0);
    return totalMs > 0 ? totalMs : null;
  }

  return null;
}

function formatDurationCompact(ms: number): string {
  const hours = ms / 3600_000;
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.max(1, Math.round(ms / 60_000))}m`;
}

export function evaluateConnectorSyncSla(
  connector?: DataConnector | Record<string, unknown> | null,
  nowMs: number = Date.now(),
): SyncSlaStatus {
  if (!connector || typeof connector !== "object") {
    return { breached: false, severity: "ok", label: "", reason: "" };
  }

  const conn = connector as DataConnector & Record<string, unknown>;
  const latestRun = conn.latestRun as
    | {
        state?: string;
        endTime?: string;
        startTime?: string;
        updateTime?: string;
        error?: { message?: string; code?: number };
      }
    | undefined;

  const runStateUpper =
    typeof latestRun?.state === "string"
      ? latestRun.state.trim().toUpperCase()
      : "";

  if (
    runStateUpper === "FAILED" ||
    runStateUpper === "STATE_FAILED" ||
    Boolean(latestRun?.error)
  ) {
    const errMsg =
      latestRun?.error?.message || `latestRun state is ${runStateUpper || "FAILED"}`;
    return {
      breached: true,
      severity: "error",
      label: "SLA Stale",
      reason: `Sync SLA breached: ${errMsg}`,
    };
  }

  const intervalMs = parseRefreshIntervalMs(
    typeof conn.refreshInterval === "string" || typeof conn.refreshInterval === "number"
      ? conn.refreshInterval
      : undefined,
  );
  if (!intervalMs) {
    return { breached: false, severity: "ok", label: "", reason: "" };
  }

  const rawRunTimestamp =
    latestRun?.endTime ||
    latestRun?.startTime ||
    latestRun?.updateTime ||
    (typeof conn.lastSyncTime === "string" ? conn.lastSyncTime : undefined);
  if (!rawRunTimestamp) {
    return { breached: false, severity: "ok", label: "", reason: "" };
  }

  const runTimeMs = Date.parse(rawRunTimestamp);
  if (Number.isNaN(runTimeMs)) {
    return { breached: false, severity: "ok", label: "", reason: "" };
  }

  const ageMs = Math.max(0, nowMs - runTimeMs);
  if (ageMs > 2 * intervalMs) {
    return {
      breached: true,
      severity: ageMs > 4 * intervalMs ? "error" : "warning",
      label: "SLA Stale",
      reason: `Last sync completed ${formatDurationCompact(ageMs)} ago, exceeding 2x refreshInterval (${formatDurationCompact(intervalMs)}).`,
      ageMs,
      intervalMs,
    };
  }

  return {
    breached: false,
    severity: "ok",
    label: "SLA Healthy",
    reason: `Last sync ${formatDurationCompact(ageMs)} ago (interval ${formatDurationCompact(intervalMs)}).`,
    ageMs,
    intervalMs,
  };
}

export function extractDeadLetterGcsPrefix(
  collection: Collection,
  result?: ValidationResult,
): string | undefined {
  const detailsObj =
    result?.details && typeof result.details === "object"
      ? result.details
      : undefined;
  const conn =
    result?.dataConnector ||
    detailsObj?.connectorState ||
    (collection.dataConnector && typeof collection.dataConnector === "object"
      ? (collection.dataConnector as DataConnector)
      : undefined);

  const directPrefix = (conn?.errorConfig as { gcsPrefix?: unknown } | undefined)
    ?.gcsPrefix;
  if (typeof directPrefix === "string" && directPrefix.trim().startsWith("gs://")) {
    return directPrefix.trim();
  }

  const rawOps = Array.isArray(detailsObj?.rawOperations)
    ? (detailsObj.rawOperations as Operation[])
    : [];
  for (const op of rawOps) {
    const respPrefix = (
      op?.response as { errorConfig?: { gcsPrefix?: unknown } } | undefined
    )?.errorConfig?.gcsPrefix;
    if (typeof respPrefix === "string" && respPrefix.trim().startsWith("gs://")) {
      return respPrefix.trim();
    }
    const metaPrefix = (
      op?.metadata as { errorConfig?: { gcsPrefix?: unknown } } | undefined
    )?.errorConfig?.gcsPrefix;
    if (typeof metaPrefix === "string" && metaPrefix.trim().startsWith("gs://")) {
      return metaPrefix.trim();
    }
  }
  return undefined;
}

interface ConnectorCollectionTableProps {
  collections: Collection[];
  validationResults: Record<string, ValidationResult>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editName: string;
  setEditName: (name: string) => void;
  isSavingName: boolean;
  onSaveName: (collection: Collection) => void;
  getAssociatedApps: (collectionName: string) => string[];
  onCheckDataConnector: (collection: Collection) => void;
  onOpenDetails: (collection: Collection) => void;
  onSelectResult: (payload: { result: ValidationResult; title: string }) => void;
  onDuplicateConnector: (collection: Collection) => void;
  onRequestDelete: (collection: Collection) => void;
  onOpenDeadLetter?: (collection: Collection, gcsPrefix?: string) => void;
  onOpenAlertPolicy?: (collection: Collection) => void;
  associationWarning?: string | null;
  enableExperimentalClone?: boolean;
  onToggleExperimentalClone?: (enabled: boolean) => void;
  loadingDetailsCollectionId?: string | null;
}

export const ConnectorCollectionTable: React.FC<ConnectorCollectionTableProps> = ({
  collections,
  validationResults,
  editingId,
  setEditingId,
  editName,
  setEditName,
  isSavingName,
  onSaveName,
  getAssociatedApps,
  onCheckDataConnector,
  onOpenDetails,
  onSelectResult,
  onDuplicateConnector,
  onRequestDelete,
  onOpenDeadLetter,
  onOpenAlertPolicy,
  associationWarning,
  enableExperimentalClone,
  onToggleExperimentalClone,
  loadingDetailsCollectionId,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [internalEnableClone, setInternalEnableClone] = useState(false);

  const isCloneEnabled = enableExperimentalClone ?? internalEnableClone;
  const handleToggleClone = (enabled: boolean) => {
    if (onToggleExperimentalClone) {
      onToggleExperimentalClone(enabled);
    } else {
      setInternalEnableClone(enabled);
    }
  };

  const resolveKnownConnector = (
    collection: Collection,
    result?: ValidationResult,
  ): DataConnector | undefined => {
    const fromDetails =
      result?.details &&
      typeof result.details === "object" &&
      "connectorState" in result.details
        ? (result.details as { connectorState?: DataConnector | null })
            .connectorState || undefined
        : undefined;
    return (
      result?.dataConnector ||
      fromDetails ||
      (collection.dataConnector && typeof collection.dataConnector === "object"
        ? (collection.dataConnector as DataConnector)
        : undefined)
    );
  };

  const filteredCollections = useMemo(() => {
    return collections.filter((collection) => {
      const collectionId = collection.name.split("/").pop() || "";
      const displayName = collection.displayName || collectionId;
      const apps = getAssociatedApps(collection.name);
      const result = validationResults[collection.name];
      const status = result ? result.status : "unchecked";
      const knownConn = resolveKnownConnector(collection, result);
      const sla = evaluateConnectorSyncSla(knownConn);

      if (statusFilter === "sla_breach") {
        if (!sla.breached) return false;
      } else if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = displayName.toLowerCase().includes(q);
        const matchesId = collectionId.toLowerCase().includes(q);
        const matchesApps = apps.some((a) => a.toLowerCase().includes(q));
        if (!matchesName && !matchesId && !matchesApps) {
          return false;
        }
      }

      return true;
    });
  }, [collections, validationResults, getAssociatedApps, searchQuery, statusFilter]);

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
      <div className="p-4 border-b border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">
            Collections ({collections.length})
          </h3>
          {(searchQuery.trim() || statusFilter !== "all") && (
            <span className="text-xs bg-gray-900 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full font-mono">
              Showing {filteredCollections.length}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label
            className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors select-none ${
              isCloneEnabled
                ? "bg-amber-950/40 border-amber-500/50 text-amber-200"
                : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
            }`}
            title="Toggle experimental cross-project connector cloning"
          >
            <input
              type="checkbox"
              checked={isCloneEnabled}
              onChange={(e) => handleToggleClone(e.target.checked)}
              aria-label="Enable experimental connector cloning"
              className="h-3.5 w-3.5 rounded bg-gray-800 border-gray-600 text-amber-500 focus:ring-amber-500 cursor-pointer"
            />
            <span>Clone</span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Experimental
            </span>
          </label>

          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections or apps..."
              aria-label="Search collections"
              className="bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-52 sm:w-64"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                aria-label="Clear collection search"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter collections by diagnostic status"
            className="bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="success">PASS</option>
            <option value="error">FAIL</option>
            <option value="sla_breach">SLA Stale</option>
            <option value="n/a">N/A</option>
            <option value="unchecked">Not Checked</option>
          </select>
        </div>
      </div>
      <div className="gem-table-container" role="region" aria-label="Connector collections table" tabIndex={0}>
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th
                scope="col"
                className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Display Name
              </th>
              <th
                scope="col"
                className="gem-col-xl px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Collection ID
              </th>
              <th
                scope="col"
                className="px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Status
              </th>
              <th
                scope="col"
                className="gem-col-lg px-3 xl:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Associated App
              </th>
              <th
                scope="col"
                className="gem-sticky-action-th px-3 xl:px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {filteredCollections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No collections match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredCollections.map((collection) => {
                const collectionId = collection.name.split("/").pop() || "";
                const result = validationResults[collection.name];

                return (
                  <tr
                    key={collection.name}
                    className="hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
                      {editingId === collection.name ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            onSaveName(collection);
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            autoFocus
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                          />
                          <button
                            type="submit"
                            disabled={isSavingName}
                            className="text-blue-400 hover:text-blue-300 font-semibold text-xs disabled:opacity-50"
                          >
                            {isSavingName ? "..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-gray-400 hover:text-gray-300 font-semibold text-xs"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 group">
                            <span className="truncate max-w-[190px] xl:max-w-[280px]" title={collection.displayName || collectionId}>
                              {collection.displayName || collectionId}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(collection.name);
                                setEditName(
                                  collection.displayName || collectionId
                                );
                              }}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 transition-opacity shrink-0"
                              title="Edit Name"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                            </button>
                          </div>
                          {collection.displayName && collection.displayName !== collectionId && (
                            <div className="gem-hide-xl text-[11px] text-gray-400 font-mono truncate max-w-[190px] mt-0.5" title={collectionId}>
                              {collectionId}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      className="gem-col-xl px-3 xl:px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono max-w-[180px] xl:max-w-[240px] truncate"
                      title={collectionId}
                    >
                      {collectionId}
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap text-sm">
                      <div className="inline-flex items-center gap-1.5">
                        {result ? (
                          <button
                            type="button"
                            disabled={result.status === "n/a"}
                            className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors shadow-sm ${
                              result.status === "success"
                                ? "bg-green-900/80 text-green-200 border border-green-700 hover:bg-green-800 cursor-pointer"
                                : result.status === "error"
                                  ? "bg-red-900/80 text-red-200 border border-red-700 hover:bg-red-800 cursor-pointer"
                                  : result.status === "n/a"
                                    ? "bg-gray-700/80 text-gray-300 border border-gray-600 cursor-default"
                                    : "bg-blue-900/80 text-blue-200 border border-blue-700 cursor-pointer"
                            }`}
                            onClick={() => {
                              if (result.status !== "n/a") {
                                const displayLabel =
                                  collection.displayName &&
                                  collection.displayName !== collectionId
                                    ? `${collection.displayName} (${collectionId})`
                                    : collectionId;
                                onSelectResult({
                                  result: {
                                    ...result,
                                    details:
                                      result.details && typeof result.details === "object"
                                        ? {
                                            ...result.details,
                                            collectionDisplayName:
                                              collection.displayName,
                                          }
                                        : result.details,
                                  },
                                  title: `Connector Diagnostics: ${displayLabel}`,
                                });
                              }
                            }}
                          >
                            {result.status === "pending" && (
                              <svg
                                className="animate-spin h-3 w-3 mr-2 shrink-0"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                            )}
                            {result.status === "success"
                              ? "PASS"
                              : result.status === "error"
                                ? "FAIL"
                                : result.status === "n/a"
                                  ? "N/A"
                                  : "CHECKING"}
                          </button>
                        ) : (
                          <span className="text-gray-500 text-xs italic whitespace-nowrap">
                            Not checked
                          </span>
                        )}
                        {(() => {
                          if (collectionId === "default_collection") return null;
                          const knownConn = resolveKnownConnector(collection, result);
                          const sla = evaluateConnectorSyncSla(knownConn);
                          if (!sla.breached) return null;
                          return (
                            <span
                              data-testid={`sla-stale-badge-${collectionId}`}
                              title={sla.reason}
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${
                                sla.severity === "error"
                                  ? "bg-red-950/90 text-red-200 border-red-600/80"
                                  : "bg-amber-950/90 text-amber-200 border-amber-500/80"
                              }`}
                            >
                              {sla.label}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="gem-col-lg px-3 xl:px-4 py-3 whitespace-normal text-sm">
                      {(() => {
                        const apps = getAssociatedApps(collection.name);
                        if (apps.length === 0) {
                          if (associationWarning && collectionId !== "default_collection") {
                            return (
                              <span
                                data-testid={`connector-assoc-unverified-${collectionId}`}
                                className="text-amber-400 text-xs italic"
                                title={associationWarning}
                              >
                                Unverified (API Warning)
                              </span>
                            );
                          }
                          return (
                            <span className="text-gray-500 text-xs italic">
                              None
                            </span>
                          );
                        }
                        return (
                          <div className="flex flex-wrap gap-1.5">
                            {apps.map((app, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50"
                              >
                                {app}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="gem-sticky-action-td px-3 xl:px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => onCheckDataConnector(collection)}
                        className="text-blue-400 hover:text-blue-300 font-semibold text-xs border border-blue-500/30 px-2.5 xl:px-3 py-1.5 rounded hover:bg-blue-500/10 transition-colors whitespace-nowrap shrink-0"
                      >
                        Run Diagnostics
                      </button>
                      <button
                        type="button"
                        disabled={loadingDetailsCollectionId === collection.name}
                        onClick={() => onOpenDetails(collection)}
                        className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white font-semibold text-xs border border-gray-600 px-2.5 xl:px-3 py-1.5 rounded hover:bg-gray-700 disabled:opacity-60 transition-colors ml-1.5 xl:ml-2 whitespace-nowrap shrink-0"
                      >
                        {loadingDetailsCollectionId === collection.name ? (
                          <>
                            <svg
                              className="animate-spin h-3 w-3 text-blue-400 shrink-0"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            <span>Opening...</span>
                          </>
                        ) : (
                          "Details"
                        )}
                      </button>
                      {onOpenDeadLetter && collectionId !== "default_collection" && (() => {
                        const detectedGcsPrefix = extractDeadLetterGcsPrefix(
                          collection,
                          result,
                        );
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenDeadLetter(collection, detectedGcsPrefix)
                            }
                            className={`font-semibold text-xs border px-2.5 xl:px-3 py-1.5 rounded transition-colors ml-1.5 xl:ml-2 whitespace-nowrap shrink-0 ${
                              detectedGcsPrefix
                                ? "text-orange-300 hover:text-orange-200 border-orange-500/50 bg-orange-950/30 hover:bg-orange-900/40"
                                : "text-gray-300 hover:text-white border-gray-600 hover:bg-gray-700"
                            }`}
                            title={
                              detectedGcsPrefix
                                ? `Inspect GCS dead-letter errors (${detectedGcsPrefix})`
                                : "Inspect GCS dead-letter JSONL logs for this connector"
                            }
                          >
                            Dead-Letter
                          </button>
                        );
                      })()}
                      {onOpenAlertPolicy && collectionId !== "default_collection" && (
                        <button
                          type="button"
                          onClick={() => onOpenAlertPolicy(collection)}
                          className="text-purple-300 hover:text-purple-200 font-semibold text-xs border border-purple-500/30 px-2.5 xl:px-3 py-1.5 rounded hover:bg-purple-500/10 transition-colors ml-1.5 xl:ml-2 whitespace-nowrap shrink-0"
                          title="Provision Cloud Monitoring sync failure alert policy"
                        >
                          Alert
                        </button>
                      )}
                      {(() => {
                        if (!isCloneEnabled || collectionId === "default_collection") return null;
                        const knownConnector =
                          result?.dataConnector ||
                          (result?.details &&
                          typeof result.details === "object" &&
                          "connectorState" in result.details
                            ? (result.details as { connectorState?: unknown }).connectorState
                            : undefined) ||
                          collection.dataConnector;
                        const eligibility = knownConnector
                          ? getConnectorCloneEligibility(knownConnector)
                          : { canClone: true };
                        if (!eligibility.canClone) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => onDuplicateConnector(collection)}
                            className="text-amber-400 hover:text-amber-300 font-semibold text-xs border border-amber-500/30 px-2.5 xl:px-3 py-1.5 rounded hover:bg-amber-500/10 transition-colors ml-1.5 xl:ml-2 whitespace-nowrap shrink-0"
                            title="Clone this connector to another project"
                          >
                            Clone
                          </button>
                        );
                      })()}
                      {collectionId !== "default_collection" && (
                        <button
                          type="button"
                          onClick={() => onRequestDelete(collection)}
                          className="text-red-400 hover:text-red-300 font-semibold text-xs border border-red-500/30 px-2.5 xl:px-3 py-1.5 rounded hover:bg-red-500/10 transition-colors ml-1.5 xl:ml-2 whitespace-nowrap shrink-0"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
