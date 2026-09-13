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

import { useState, useRef, useCallback, useEffect } from 'react';
import { GraphNode, GraphEdge, AppEngine, ReasoningEngine, Assistant, Agent, Config } from '../types';
import { toErrorMessage } from '../utils/errors';
import * as api from '../services/apiService';

export const ALL_REASONING_ENGINE_LOCATIONS = [
  'us-central1', 'us-east1', 'us-east4', 'us-west1',
  'europe-west1', 'europe-west2', 'europe-west4',
  'asia-east1', 'asia-southeast1',
];

export const ALL_DISCOVERY_LOCATIONS = ['global', 'us', 'eu'];

export const ALL_CLOUD_RUN_LOCATIONS = [
  'us-central1', 'us-east1', 'us-west1', 'europe-west1', 'asia-northeast1',
];

export interface UseArchitectureScannerResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  logs: string[];
  isLoading: boolean;
  error: string | null;
  elapsedSeconds: number;
  scan: () => Promise<void>;
  cancelScan: () => void;
  setNodes: React.Dispatch<React.SetStateAction<GraphNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<GraphEdge[]>>;
}

export function useArchitectureScanner(projectNumber: string): UseArchitectureScannerResult {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // Track elapsed seconds during scan
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isLoading) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const cancelScan = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Architecture scan cancelled by user.`]);
  }, []);

  const scan = useCallback(async () => {
    if (!projectNumber) {
      setError('Project ID/Number is required to scan the architecture.');
      return;
    }

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setElapsedSeconds(0);
    setIsLoading(true);
    setError(null);
    setLogs([]);
    setNodes([]);
    setEdges([]);

    const addLog = (message: string) => {
      setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    };

    const newNodes: GraphNode[] = [];
    const newEdges: GraphEdge[] = [];
    const foundNodeIds = new Set<string>();

    const addNode = (node: GraphNode) => {
      if (!foundNodeIds.has(node.id)) {
        newNodes.push(node);
        foundNodeIds.add(node.id);
      } else {
        // If node exists, update its data if new data is more complete
        const existingNode = newNodes.find((n) => n.id === node.id);
        if (existingNode) {
          const prevData = typeof existingNode.data === 'object' && existingNode.data !== null ? existingNode.data : {};
          const newData = typeof node.data === 'object' && node.data !== null ? node.data : {};
          existingNode.data = { ...prevData, ...newData };
        }
      }
    };

    const addEdge = (sourceId: string, targetId: string) => {
      const edgeId = `${sourceId}__to__${targetId}`;
      if (foundNodeIds.has(sourceId) && foundNodeIds.has(targetId)) {
        newEdges.push({ id: edgeId, source: sourceId, target: targetId });
      } else {
        addLog(
          `SKIPPED_EDGE: Cannot draw link from ${sourceId.split('/').pop()} to ${targetId.split('/').pop()} as one of the resources was not found in the scan.`
        );
      }
    };

    const apiConfig = {
      projectId: projectNumber,
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: '',
    };

    try {
      addLog('Starting architecture scan...');

      const projectNodeId = `projects/${projectNumber}`;
      addNode({ id: projectNodeId, type: 'Project', label: `Project (${projectNumber})`, data: { name: projectNodeId } });

      addLog('Fetching all Authorizations and Agent Engines...');
      const [authResponse, allReasoningEngines] = await Promise.all([
        api.listAuthorizations(apiConfig).catch((e) => {
          addLog(`WARNING: Could not fetch authorizations: ${e.message}`);
          return { authorizations: [] };
        }),
        Promise.all(
          ALL_REASONING_ENGINE_LOCATIONS.map((loc) =>
            api
              .listReasoningEngines({ ...apiConfig, reasoningEngineLocation: loc })
              .then((res) => res.reasoningEngines || [])
              .catch((e) => {
                addLog(`NOTE: Could not scan Agent Engines in ${loc}: ${e.message}`);
                return [];
              })
          )
        ).then((results) => results.flat()),
      ]);

      const authorizations = authResponse.authorizations || [];
      authorizations.forEach((auth) =>
        addNode({ id: auth.name, type: 'Authorization', label: auth.name.split('/').pop()!, data: auth })
      );
      allReasoningEngines.forEach((re) =>
        addNode({ id: re.name, type: 'ReasoningEngine', label: re.displayName, data: re })
      );
      addLog(
        `Found ${authorizations.length} authorizations and ${allReasoningEngines.length} agent engines across all locations.`
      );

      if (signal.aborted) {
        addLog('Architecture scan cancelled.');
        return;
      }

      // Scan Cloud Run Services
      addLog('Scanning Cloud Run Services across all regions...');
      const cloudRunPromises = ALL_CLOUD_RUN_LOCATIONS.map((loc) =>
        api
          .listCloudRunServices({ projectId: projectNumber, appLocation: loc, collectionId: 'default_collection', appId: '' }, loc)
          .then((res) => res.services || [])
          .catch((e: unknown) => {
            addLog(`NOTE: Could not scan Cloud Run in ${loc}: ${toErrorMessage(e)}`);
            return [];
          })
      );
      const allCloudRunServices = (await Promise.all(cloudRunPromises)).flat();

      for (const service of allCloudRunServices) {
        const locationNodeId = `${projectNodeId}/locations/${service.location}`;
        if (!foundNodeIds.has(locationNodeId)) {
          addNode({ id: locationNodeId, type: 'Location', label: service.location, data: { name: locationNodeId } });
          addEdge(projectNodeId, locationNodeId);
        }

        addNode({ id: service.name, type: 'CloudRunService', label: service.name.split('/').pop()!, data: service });
        addEdge(locationNodeId, service.name);
      }
      addLog(`Found ${allCloudRunServices.length} Cloud Run services.`);

      for (const location of ALL_DISCOVERY_LOCATIONS) {
        if (signal.aborted) {
          addLog('Architecture scan cancelled.');
          return;
        }
        addLog(`Scanning discovery location: ${location}...`);
        const locationNodeId = `${projectNodeId}/locations/${location}`;
        addNode({ id: locationNodeId, type: 'Location', label: location, data: { name: locationNodeId } });
        addEdge(projectNodeId, locationNodeId);

        const locationConfig: Config = { ...apiConfig, appLocation: location, collectionId: 'default_collection' };

        // Add collection node
        const collectionNodeId = `projects/${projectNumber}/locations/${location}/collections/default_collection`;
        addNode({ id: collectionNodeId, type: 'Collection', label: 'default_collection', data: { name: collectionNodeId } });
        addEdge(locationNodeId, collectionNodeId);

        // Scan for all Data Stores in the collection
        try {
          addLog(`  Scanning for all Data Stores in ${location}...`);
          const dataStoresResponse = await api.listResources('dataStores', locationConfig);
          const dataStores = dataStoresResponse.dataStores || [];
          if (dataStores.length > 0) {
            addLog(`  Found ${dataStores.length} Data Store(s) in ${location}.`);
            for (const dataStore of dataStores) {
              if (!foundNodeIds.has(dataStore.name)) {
                addNode({ id: dataStore.name, type: 'DataStore', label: dataStore.displayName, data: dataStore });
              }
              addEdge(collectionNodeId, dataStore.name);
            }
          }
        } catch (e: unknown) {
          addLog(`NOTE: Could not scan for Data Stores in ${location}: ${toErrorMessage(e)}`);
        }

        try {
          const enginesResponse = await api.listResources('engines', locationConfig);
          const engines: AppEngine[] = enginesResponse.engines || [];
          if (engines.length === 0) continue;

          addLog(`  Found ${engines.length} App/Engine(s) in ${location}.`);
          for (const engine of engines) {
            if (signal.aborted) {
              addLog('Architecture scan cancelled.');
              return;
            }
            addNode({ id: engine.name, type: 'Engine', label: engine.displayName, data: engine });
            addEdge(collectionNodeId, engine.name);

            // Fetch full engine details to find direct data store links
            try {
              const fullEngine = await api.getEngine(engine.name, locationConfig);
              const existingNode = newNodes.find((n) => n.id === engine.name);
              if (existingNode) existingNode.data = fullEngine;

              if (fullEngine.dataStoreIds && fullEngine.dataStoreIds.length > 0) {
                addLog(`    - Engine '${engine.displayName}' is linked to ${fullEngine.dataStoreIds.length} data store(s).`);
                for (const dsId of fullEngine.dataStoreIds) {
                  const fullDsName = `projects/${projectNumber}/locations/${location}/collections/default_collection/dataStores/${dsId}`;
                  if (!foundNodeIds.has(fullDsName)) {
                    addLog(
                      `    - WARNING: Engine '${engine.displayName}' links to DataStore '${dsId}' which was not found in the initial scan. Adding a placeholder node.`
                    );
                    addNode({ id: fullDsName, type: 'DataStore', label: dsId, data: { name: fullDsName, error: 'Not found in initial scan' } });
                  }
                  addEdge(engine.name, fullDsName);
                }
              }
            } catch (e: unknown) {
              addLog(
                `    - NOTE: Could not get full details for engine '${engine.displayName}' to find linked data stores: ${toErrorMessage(e)}`
              );
            }

            // Robustly list assistants
            let assistants: Assistant[] = [];
            try {
              const assistantConfig = { ...locationConfig, appId: engine.name.split('/').pop()! };
              const assistantsResponse = await api.listResources('assistants', assistantConfig);
              assistants = assistantsResponse.assistants || [];
            } catch (assistantListErr: unknown) {
              addLog(
                `    - WARNING: Could not list assistants for engine '${engine.displayName}': ${toErrorMessage(assistantListErr)}`
              );
              continue;
            }

            for (const assistant of assistants) {
              if (signal.aborted) {
                addLog('Architecture scan cancelled.');
                return;
              }
              addNode({ id: assistant.name, type: 'Assistant', label: assistant.displayName || assistant.name.split('/').pop() || 'Assistant', data: assistant });
              addEdge(engine.name, assistant.name);

              // Robustly list agents
              let agents: Agent[] = [];
              try {
                const assistantConfig = {
                  ...locationConfig,
                  appId: engine.name.split('/').pop()!,
                  assistantId: assistant.name.split('/').pop()!,
                };
                const agentsResponse = await api.listResources('agents', assistantConfig);
                agents = agentsResponse.agents || [];
              } catch (agentListErr: unknown) {
                addLog(
                  `      - WARNING: Could not list agents for assistant '${assistant.displayName}': ${toErrorMessage(agentListErr)}`
                );
                continue;
              }

              for (const agent of agents) {
                addNode({ id: agent.name, type: 'Agent', label: agent.displayName, data: agent });
                addEdge(assistant.name, agent.name);

                const reName = agent.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine;
                if (reName) addEdge(agent.name, reName);

                if (agent.a2aAgentDefinition?.jsonAgentCard) {
                  try {
                    const card = JSON.parse(agent.a2aAgentDefinition.jsonAgentCard);
                    const agentUrl = card.url;
                    if (agentUrl) {
                      if (agentUrl.includes('/reasoningEngines/')) {
                        const parts = agentUrl.split('/reasoningEngines/');
                        if (parts.length > 1) {
                          const engineId = parts[1].split('/')[0];
                          const matchingRe = allReasoningEngines.find((re) =>
                            re.name.endsWith(`/reasoningEngines/${engineId}`)
                          );
                          if (matchingRe) {
                            addEdge(agent.name, matchingRe.name);
                          }
                        }
                      } else {
                        const matchingService = allCloudRunServices.find((s) => s.uri && agentUrl.startsWith(s.uri));
                        if (matchingService) {
                          addEdge(agent.name, matchingService.name);
                        }
                      }
                    }
                  } catch (e: unknown) {
                    addLog(
                      `      - WARNING: Failed to parse A2A agent card JSON for agent '${agent.displayName}': ${toErrorMessage(e)}`
                    );
                  }
                }

                (agent.authorizationConfig?.toolAuthorizations || agent.authorizations || []).forEach((authName) =>
                  addEdge(agent.name, authName)
                );

                try {
                  const assistantConfig = {
                    ...locationConfig,
                    appId: engine.name.split('/').pop()!,
                    assistantId: assistant.name.split('/').pop()!,
                  };
                  const agentView = await api.getAgentView(agent.name, assistantConfig);
                  const findDataStoreIds = (obj: unknown): string[] => {
                    if (!obj || typeof obj !== 'object') return [];
                    return Object.values(obj).flatMap((value: unknown) => {
                      if (typeof value === 'string' && value.includes('/dataStores/')) return [value];
                      if (typeof value === 'object') return findDataStoreIds(value);
                      return [];
                    });
                  };
                  const dataStoreIds = [...new Set(findDataStoreIds(agentView))];
                  for (const dsId of dataStoreIds) {
                    if (!foundNodeIds.has(dsId)) {
                      try {
                        const dataStore = await api.getDataStore(dsId, assistantConfig);
                        addNode({ id: dsId, type: 'DataStore', label: dataStore.displayName, data: dataStore });
                      } catch (dsError: unknown) {
                        addLog(`WARNING: Could not fetch details for DataStore ${dsId}: ${toErrorMessage(dsError)}`);
                        addNode({
                          id: dsId,
                          type: 'DataStore',
                          label: dsId.split('/').pop()!,
                          data: { name: dsId, error: 'Could not fetch details' },
                        });
                      }
                    }
                    addEdge(agent.name, dsId);
                  }
                } catch (viewError: unknown) {
                  addLog(
                    `NOTE: Could not get agent view for ${agent.displayName} to find data stores: ${toErrorMessage(viewError)}`
                  );
                }
              }
            }
          }
        } catch (e: unknown) {
          addLog(`NOTE: No resources found or error in location '${location}': ${toErrorMessage(e)}`);
        }
      }

      setNodes(newNodes);
      setEdges(newEdges);
      addLog('Scan complete. Rendering graph...');
    } catch (err: unknown) {
      const message = toErrorMessage(err) || 'An unknown error occurred';
      setError(message);
      addLog(`FATAL ERROR: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [projectNumber]);

  return {
    nodes,
    edges,
    logs,
    isLoading,
    error,
    elapsedSeconds,
    scan,
    cancelScan,
    setNodes,
    setEdges,
  };
}
