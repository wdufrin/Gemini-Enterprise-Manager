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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Agent, Config } from "../../types";
import * as api from "../../services/apiService";
import {
  AgentDatasourceMutation,
  DiscoveredConnectorOption,
  DiscoveredDataStoreOption,
  extractAgentDatasources,
  applyAgentDatasourceMutation,
  buildEntityDataStoreRemap,
  discoverProjectDatasources,
  updateAndPublishNoCodeAgent,
  isSameConnectorReference,
  isSameDataStoreReference,
} from "../../services/api/discovery/agentDatasources";
import { useToast } from "../../context/ToastContext";
import { toErrorMessage } from "../../utils/errors";

interface AgentDatasourceEditorProps {
  agent: Agent;
  config: Config;
  onAgentUpdated: (updatedAgent: Agent) => void;
}

const AgentDatasourceEditor: React.FC<AgentDatasourceEditorProps> = ({
  agent,
  config,
  onAgentUpdated,
}) => {
  const { toast } = useToast();

  const [catalogConnectors, setCatalogConnectors] = useState<DiscoveredConnectorOption[]>([]);
  const [catalogDataStores, setCatalogDataStores] = useState<DiscoveredDataStoreOption[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Per-row swap target selections
  const [connectorSwapTargets, setConnectorSwapTargets] = useState<Record<string, string>>({});
  const [connectorCustomSwapPaths, setConnectorCustomSwapPaths] = useState<Record<string, string>>({});
  const [remapEntityStoresOnSwap, setRemapEntityStoresOnSwap] = useState(true);

  const [dataStoreSwapTargets, setDataStoreSwapTargets] = useState<Record<string, string>>({});
  const [dataStoreCustomSwapPaths, setDataStoreCustomSwapPaths] = useState<Record<string, string>>({});

  // Add Connector state
  const [newConnectorSelection, setNewConnectorSelection] = useState<string>("");
  const [customNewConnectorPath, setCustomNewConnectorPath] = useState<string>("");
  const [customNewConnectorSource, setCustomNewConnectorSource] = useState<string>("");

  // Add DataStore state
  const [newDataStoreSelection, setNewDataStoreSelection] = useState<string>("");
  const [customNewDataStorePath, setCustomNewDataStorePath] = useState<string>("");

  // Execution options & status
  const [autoDeployOrPublish, setAutoDeployOrPublish] = useState(true);
  const [autoClaimOwnership, setAutoClaimOwnership] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isPublishingOnly, setIsPublishingOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [lastChanges, setLastChanges] = useState<string[]>([]);

  const loadCatalog = useCallback(async () => {
    if (!config.projectId || !config.appLocation) return;
    setIsLoadingCatalog(true);
    try {
      const res = await discoverProjectDatasources(config);
      setCatalogConnectors(res.connectors);
      setCatalogDataStores(res.dataStores);
    } catch (err) {
      console.warn("Failed to load project datasource catalog:", err);
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [config]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const bindings = useMemo(() => extractAgentDatasources(agent), [agent]);
  const isWorkflow = Boolean(agent.workflowAgentDefinition);

  const resolveConnectorLabel = (connectorName: string, dataSource?: string) => {
    const match = catalogConnectors.find((c) =>
      isSameConnectorReference(c.name, connectorName),
    );
    if (match) {
      return {
        title: match.displayName,
        subtitle: `${match.collectionId} • ${match.dataSource}`,
        staticIp: match.staticIpEnabled,
        state: match.state,
      };
    }
    const shortCol =
      connectorName.split("/collections/")[1]?.split("/")[0] || connectorName;
    return {
      title: shortCol,
      subtitle: dataSource ? `Source: ${dataSource}` : connectorName,
      staticIp: false,
      state: undefined,
    };
  };

  const resolveDataStoreLabel = (dsPath: string) => {
    const match = catalogDataStores.find((ds) =>
      isSameDataStoreReference(ds.name, dsPath),
    );
    if (match) {
      return {
        title: match.displayName,
        subtitle: `${match.collectionId} / ${match.dataStoreId}`,
      };
    }
    const shortId = dsPath.split("/").pop() || dsPath;
    const colId = dsPath.split("/collections/")[1]?.split("/")[0] || "custom";
    return {
      title: shortId,
      subtitle: `Collection: ${colId}`,
    };
  };

  const executeMutation = async (mutation: AgentDatasourceMutation) => {
    setIsMutating(true);
    setActionError(null);
    setActionWarning(null);
    setLastChanges([]);

    try {
      let effectiveMutation = mutation;
      if (
        mutation.type === "replace_connector" &&
        remapEntityStoresOnSwap &&
        catalogDataStores.length > 0
      ) {
        const autoRemap = buildEntityDataStoreRemap(
          agent,
          mutation.oldConnectorName,
          mutation.newConnectorName,
          catalogDataStores,
        );
        effectiveMutation = {
          ...mutation,
          entityDataStoreRemap: {
            ...autoRemap,
            ...(mutation.entityDataStoreRemap || {}),
          },
        };
      }

      const mutationResult = applyAgentDatasourceMutation(
        agent,
        effectiveMutation,
        config,
      );

      if (mutationResult.changedCount === 0) {
        setActionWarning("No changes were needed (datasource may already be bound or unchanged).");
        return;
      }

      const saveResult = await updateAndPublishNoCodeAgent(
        agent,
        mutationResult.payload,
        config,
        {
          autoDeployOrPublish,
          autoClaimOwnershipOn403: autoClaimOwnership,
        },
      );

      onAgentUpdated(saveResult.updatedAgent);
      setLastChanges(mutationResult.changes);

      if (saveResult.deployWarning) {
        setActionWarning(saveResult.deployWarning);
        toast.info("Agent draft updated (see deployment notice).");
      } else if (saveResult.deployedOrPublished) {
        toast.success(
          `Updated and ${isWorkflow ? "published" : "deployed"} agent datasources!`,
        );
      } else {
        toast.success("Agent draft datasources updated!");
      }
    } catch (err: unknown) {
      const msg = toErrorMessage(err) || "Failed to update agent datasources.";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setIsMutating(false);
    }
  };

  const handleSwapConnector = async (bindingId: string, oldConnectorName: string) => {
    const selectedTarget = connectorSwapTargets[bindingId] || "";
    const targetPath =
      selectedTarget === "__custom__"
        ? (connectorCustomSwapPaths[bindingId] || "").trim()
        : selectedTarget;

    if (!targetPath) {
      setActionError("Please select a target connector from the dropdown.");
      return;
    }

    const catalogMatch = catalogConnectors.find((c) =>
      isSameConnectorReference(c.name, targetPath),
    );

    await executeMutation({
      type: "replace_connector",
      oldConnectorName,
      newConnectorName: targetPath,
      newDataSource: catalogMatch?.dataSource,
      targetBindingId: bindingId,
    });
  };

  const handleAddConnector = async () => {
    const targetPath =
      newConnectorSelection === "__custom__"
        ? customNewConnectorPath.trim()
        : newConnectorSelection;

    if (!targetPath) {
      setActionError("Please select a connector to add.");
      return;
    }

    const catalogMatch = catalogConnectors.find((c) =>
      isSameConnectorReference(c.name, targetPath),
    );

    await executeMutation({
      type: "add_connector",
      connectorName: targetPath,
      dataSource:
        catalogMatch?.dataSource || customNewConnectorSource.trim() || undefined,
    });
    setNewConnectorSelection("");
    setCustomNewConnectorPath("");
    setCustomNewConnectorSource("");
  };

  const handleRemoveConnector = async (connectorName: string) => {
    await executeMutation({
      type: "remove_connector",
      connectorName,
    });
  };

  const handleSwapDataStore = async (bindingId: string, oldDataStore: string) => {
    const selectedTarget = dataStoreSwapTargets[bindingId] || "";
    const targetPath =
      selectedTarget === "__custom__"
        ? (dataStoreCustomSwapPaths[bindingId] || "").trim()
        : selectedTarget;

    if (!targetPath) {
      setActionError("Please select a target Data Store from the dropdown.");
      return;
    }

    await executeMutation({
      type: "replace_datastore",
      oldDataStore,
      newDataStore: targetPath,
      targetBindingId: bindingId,
    });
  };

  const handleAddDataStore = async () => {
    const targetPath =
      newDataStoreSelection === "__custom__"
        ? customNewDataStorePath.trim()
        : newDataStoreSelection;

    if (!targetPath) {
      setActionError("Please select a Data Store to add.");
      return;
    }

    await executeMutation({
      type: "add_datastore",
      dataStore: targetPath,
    });
    setNewDataStoreSelection("");
    setCustomNewDataStorePath("");
  };

  const handleRemoveDataStore = async (dataStore: string) => {
    await executeMutation({
      type: "remove_datastore",
      dataStore,
    });
  };

  const handleManualPublishOrDeploy = async () => {
    setIsPublishingOnly(true);
    setActionError(null);
    setActionWarning(null);
    try {
      if (isWorkflow) {
        const res = await api.publishAgent(agent.name, config);
        if (res?.agent) {
          onAgentUpdated(res.agent);
        }
        toast.success("Workflow agent published to a new active revision!");
      } else {
        await api.deployLowCodeAgent(agent.name, config, "DEPLOY");
        const refreshed = await api.getAgent(agent.name, config);
        onAgentUpdated(refreshed);
        toast.success("Low-Code agent draft nodes deployed to live agent!");
      }
    } catch (err: unknown) {
      setActionError(toErrorMessage(err) || "Failed to publish/deploy agent.");
    } finally {
      setIsPublishingOnly(false);
    }
  };

  return (
    <div className="mt-6 border-t border-gray-700 pt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">
              Connectors &amp; Data Stores Configuration
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {isWorkflow ? "Workflow Agent" : "Low-Code Agent"}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Add, remove, or swap Data Connectors and Vertex AI Search Data Stores bound to this no-code agent (including VPC-SC compliant replacements).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadCatalog}
            disabled={isLoadingCatalog || isMutating}
            className="px-3 py-1.5 text-xs bg-gray-700 text-gray-200 font-medium rounded-md hover:bg-gray-600 border border-gray-600 disabled:opacity-50"
          >
            {isLoadingCatalog ? "Scanning Project..." : "Refresh Available Sources"}
          </button>
          <button
            type="button"
            onClick={handleManualPublishOrDeploy}
            disabled={isPublishingOnly || isMutating}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-500 disabled:opacity-50"
            title={
              isWorkflow
                ? "Publish current workflow definition to a new active revision (:publish)"
                : "Copy draft nodes to deployed_nodes (:deployLowCode)"
            }
          >
            {isPublishingOnly
              ? "Publishing..."
              : isWorkflow
                ? "Publish Revision (:publish)"
                : "Redeploy Live (:deployLowCode)"}
          </button>
        </div>
      </div>

      {/* Options bar */}
      <div className="p-3 bg-gray-900/60 border border-gray-700 rounded-lg flex flex-wrap items-center gap-6 text-xs text-gray-300">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoDeployOrPublish}
            onChange={(e) => setAutoDeployOrPublish(e.target.checked)}
            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
          />
          <span>
            <strong>Auto-{isWorkflow ? "publish" : "deploy"} after update</strong>{" "}
            <span className="text-gray-400">
              (makes connector/datastore changes live immediately via{" "}
              <code className="text-blue-300">{isWorkflow ? ":publish" : ":deployLowCode"}</code>)
            </span>
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={remapEntityStoresOnSwap}
            onChange={(e) => setRemapEntityStoresOnSwap(e.target.checked)}
            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
          />
          <span>
            <strong>Also remap matching Entity Data Stores when swapping a connector</strong>
          </span>
        </label>

        <label
          className={`flex items-center gap-2 ${agent.state === "PRIVATE" ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          title={
            agent.state === "PRIVATE"
              ? ":transferAgentOwner only works on shared (ENABLED/DISABLED) agents — private agents do not have an IAM policy yet."
              : "Calls :transferAgentOwner if owned by another user and deploy/publish returns 403"
          }
        >
          <input
            type="checkbox"
            checked={agent.state === "PRIVATE" ? false : autoClaimOwnership}
            disabled={agent.state === "PRIVATE"}
            onChange={(e) => setAutoClaimOwnership(e.target.checked)}
            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-600 disabled:opacity-50"
          />
          <span>
            <strong>Auto-claim ownership if blocked (403)</strong>{" "}
            <span className="text-gray-400">
              {agent.state === "PRIVATE" ? (
                <span>
                  (shared agents only — <code className="text-amber-300">PRIVATE</code> agents cannot use{" "}
                  <code className="text-amber-300">:transferAgentOwner</code>)
                </span>
              ) : (
                <span>
                  (calls <code className="text-amber-300">:transferAgentOwner</code> on shared agents if owned by another user)
                </span>
              )}
            </span>
          </span>
        </label>
      </div>

      {actionError && (
        <div className="p-3 bg-red-900/30 border border-red-700/60 rounded-md text-sm text-red-300">
          {actionError}
        </div>
      )}

      {actionWarning && (
        <div className="p-3 bg-amber-900/30 border border-amber-700/60 rounded-md text-sm text-amber-200">
          {actionWarning}
        </div>
      )}

      {lastChanges.length > 0 && (
        <div className="p-3 bg-green-900/20 border border-green-700/50 rounded-md text-xs text-green-300 space-y-1">
          <p className="font-semibold">Applied Changes:</p>
          <ul className="list-disc list-inside font-mono space-y-0.5">
            {lastChanges.map((c, idx) => (
              <li key={idx}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 1. Data Connectors Section */}
      <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
            Bound Data Connectors ({bindings.connectors.length})
          </h4>
          <span className="text-xs text-gray-400">
            {catalogConnectors.length} connector(s) discovered in project
          </span>
        </div>

        {bindings.connectors.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            No Data Connectors are currently attached to this agent.
          </p>
        ) : (
          <div className="divide-y divide-gray-700/70 border border-gray-700 rounded-md bg-gray-800/60">
            {bindings.connectors.map((conn) => {
              const info = resolveConnectorLabel(conn.connectorName, conn.dataSource);
              const selectedTarget = connectorSwapTargets[conn.id] || "";
              return (
                <div
                  key={conn.id}
                  className="p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white text-sm">
                        {info.title}
                      </span>
                      {conn.dataSource && (
                        <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-blue-900/50 text-blue-300 border border-blue-700/50">
                          {conn.dataSource}
                        </span>
                      )}
                      {info.staticIp && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                          VPC-SC / Static IP
                        </span>
                      )}
                      <span className="px-2 py-0.5 text-[11px] rounded bg-gray-700 text-gray-300">
                        {conn.nodeLabel}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-gray-400 truncate" title={conn.connectorName}>
                      {conn.connectorName}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Swap connector for ${info.title}`}
                      value={selectedTarget}
                      onChange={(e) =>
                        setConnectorSwapTargets((prev) => ({
                          ...prev,
                          [conn.id]: e.target.value,
                        }))
                      }
                      disabled={isMutating}
                      className="bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-gray-200 focus:ring-blue-500 focus:border-blue-500 max-w-xs"
                    >
                      <option value="">-- Change / Swap Connector --</option>
                      {catalogConnectors.map((opt) => (
                        <option key={opt.name} value={opt.name}>
                          {opt.displayName} ({opt.collectionId} • {opt.dataSource}
                          {opt.staticIpEnabled ? " • Static IP" : ""})
                        </option>
                      ))}
                      <option value="__custom__">+ Custom Connector Resource Path...</option>
                    </select>

                    {selectedTarget === "__custom__" && (
                      <input
                        type="text"
                        placeholder="projects/.../collections/{col}/dataConnector"
                        value={connectorCustomSwapPaths[conn.id] || ""}
                        onChange={(e) =>
                          setConnectorCustomSwapPaths((prev) => ({
                            ...prev,
                            [conn.id]: e.target.value,
                          }))
                        }
                        className="bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white font-mono w-64"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => handleSwapConnector(conn.id, conn.connectorName)}
                      disabled={isMutating || !selectedTarget}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500"
                    >
                      Swap
                    </button>

                    {conn.canRemove ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveConnector(conn.connectorName)}
                        disabled={isMutating}
                        className="px-2.5 py-1.5 text-xs bg-red-600/80 text-white font-semibold rounded hover:bg-red-600 disabled:opacity-50"
                        title="Remove this connector from the agent"
                      >
                        Remove
                      </button>
                    ) : (
                      <span
                        className="text-[11px] text-gray-500 italic px-1"
                        title="Dedicated workflow action/trigger/MCP nodes require a connector; use Swap to change it."
                      >
                        Swap only
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Connector Row */}
        <div className="pt-2 border-t border-gray-700/60 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Add Connector to Agent
            </label>
            <select
              aria-label="Select connector to add"
              value={newConnectorSelection}
              onChange={(e) => setNewConnectorSelection(e.target.value)}
              disabled={isMutating}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-xs text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full"
            >
              <option value="">-- Select Connector to Add --</option>
              {catalogConnectors.map((opt) => (
                <option key={opt.name} value={opt.name}>
                  {opt.displayName} ({opt.collectionId} • {opt.dataSource}
                  {opt.staticIpEnabled ? " • Static IP" : ""})
                </option>
              ))}
              <option value="__custom__">+ Enter Custom Connector Path...</option>
            </select>
          </div>

          {newConnectorSelection === "__custom__" && (
            <>
              <div className="min-w-[240px]">
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Connector Resource Path
                </label>
                <input
                  type="text"
                  placeholder="collections/my_connector/dataConnector"
                  value={customNewConnectorPath}
                  onChange={(e) => setCustomNewConnectorPath(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-xs text-white font-mono w-full"
                />
              </div>
              <div className="w-36">
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Data Source (opt.)
                </label>
                <input
                  type="text"
                  placeholder="e.g. jira, slack"
                  value={customNewConnectorSource}
                  onChange={(e) => setCustomNewConnectorSource(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-xs text-white font-mono w-full"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={handleAddConnector}
            disabled={isMutating || !newConnectorSelection}
            className="px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-md hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500"
          >
            + Add Connector
          </button>
        </div>
      </div>

      {/* 2. Data Stores Section */}
      <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
            Bound Grounding Data Stores ({bindings.dataStores.length})
          </h4>
          <span className="text-xs text-gray-400">
            {catalogDataStores.length} Data Store(s) discovered in project
          </span>
        </div>

        {bindings.dataStores.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            No Vertex AI Search Data Stores are currently attached to this agent.
          </p>
        ) : (
          <div className="divide-y divide-gray-700/70 border border-gray-700 rounded-md bg-gray-800/60">
            {bindings.dataStores.map((ds) => {
              const info = resolveDataStoreLabel(ds.dataStore);
              const selectedTarget = dataStoreSwapTargets[ds.id] || "";
              return (
                <div
                  key={ds.id}
                  className="p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white text-sm">
                        {info.title}
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-cyan-900/40 text-cyan-300 border border-cyan-700/50">
                        {info.subtitle}
                      </span>
                      <span className="px-2 py-0.5 text-[11px] rounded bg-gray-700 text-gray-300">
                        {ds.nodeLabel}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-gray-400 truncate" title={ds.dataStore}>
                      {ds.dataStore}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Swap data store for ${info.title}`}
                      value={selectedTarget}
                      onChange={(e) =>
                        setDataStoreSwapTargets((prev) => ({
                          ...prev,
                          [ds.id]: e.target.value,
                        }))
                      }
                      disabled={isMutating}
                      className="bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-gray-200 focus:ring-blue-500 focus:border-blue-500 max-w-xs"
                    >
                      <option value="">-- Change / Swap Data Store --</option>
                      {catalogDataStores.map((opt) => (
                        <option key={opt.name} value={opt.name}>
                          {opt.displayName} ({opt.collectionId} / {opt.dataStoreId})
                        </option>
                      ))}
                      <option value="__custom__">+ Custom Data Store Resource Path...</option>
                    </select>

                    {selectedTarget === "__custom__" && (
                      <input
                        type="text"
                        placeholder="projects/.../collections/{c}/dataStores/{ds}"
                        value={dataStoreCustomSwapPaths[ds.id] || ""}
                        onChange={(e) =>
                          setDataStoreCustomSwapPaths((prev) => ({
                            ...prev,
                            [ds.id]: e.target.value,
                          }))
                        }
                        className="bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white font-mono w-64"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => handleSwapDataStore(ds.id, ds.dataStore)}
                      disabled={isMutating || !selectedTarget}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500"
                    >
                      Swap
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveDataStore(ds.dataStore)}
                      disabled={isMutating}
                      className="px-2.5 py-1.5 text-xs bg-red-600/80 text-white font-semibold rounded hover:bg-red-600 disabled:opacity-50"
                      title="Remove this Data Store from the agent"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Data Store Row */}
        <div className="pt-2 border-t border-gray-700/60 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Add Data Store to Agent
            </label>
            <select
              aria-label="Select data store to add"
              value={newDataStoreSelection}
              onChange={(e) => setNewDataStoreSelection(e.target.value)}
              disabled={isMutating}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-xs text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full"
            >
              <option value="">-- Select Data Store to Add --</option>
              {catalogDataStores.map((opt) => (
                <option key={opt.name} value={opt.name}>
                  {opt.displayName} ({opt.collectionId} / {opt.dataStoreId})
                </option>
              ))}
              <option value="__custom__">+ Enter Custom Data Store Resource Path...</option>
            </select>
          </div>

          {newDataStoreSelection === "__custom__" && (
            <div className="flex-1 min-w-[260px]">
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Data Store Resource Name
              </label>
              <input
                type="text"
                placeholder="projects/.../collections/default_collection/dataStores/my_ds"
                value={customNewDataStorePath}
                onChange={(e) => setCustomNewDataStorePath(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-xs text-white font-mono w-full"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleAddDataStore}
            disabled={isMutating || !newDataStoreSelection}
            className="px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-md hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500"
          >
            + Add Data Store
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentDatasourceEditor;
