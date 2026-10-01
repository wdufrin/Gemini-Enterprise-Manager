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

import {
  Agent,
  AgentDataConnectorRef,
  AgentDataStoreSpec,
  AgentDataStoreSpecs,
  Collection,
  Config,
  DataConnector,
  DataStore,
  WorkflowAgentFlowNode,
} from "../../../types";
import { getDataConnector } from "../dataStores";
import { listCollections, listResources } from "./engines";
import {
  deployLowCodeAgent,
  getAgent,
  publishAgent,
  transferAgentOwner,
  updateAgent,
} from "./agents";

const FULL_CONNECTOR_REGEX =
  /^projects\/[^/\s]+\/locations\/[^/\s]+\/collections\/([^/\s]+)\/dataConnector$/;
const RELATIVE_CONNECTOR_REGEX = /^collections\/([^/\s]+)\/dataConnector$/;
const FULL_DATASTORE_REGEX =
  /^projects\/([^/\s]+)\/locations\/([^/\s]+)\/collections\/([^/\s]+)\/dataStores\/([^/\s]+)$/;
const RELATIVE_DATASTORE_REGEX =
  /^collections\/([^/\s]+)\/dataStores\/([^/\s]+)$/;

export interface AgentConnectorBinding {
  id: string;
  connectorName: string;
  collectionId: string | null;
  dataSource?: string;
  tag?: string;
  locationType:
    | "low_code_llm_node"
    | "workflow_agent_node"
    | "workflow_connector_node"
    | "workflow_trigger_node"
    | "workflow_mcp_node"
    | "agent_top_level";
  nodeId?: string;
  nodeLabel: string;
  canRemove: boolean;
}

export interface AgentDataStoreBinding {
  id: string;
  dataStore: string;
  collectionId: string | null;
  dataStoreId: string;
  locationType:
    | "low_code_llm_node"
    | "workflow_agent_node"
    | "workflow_knowledge_source"
    | "workflow_connector_node"
    | "agent_top_level";
  nodeId?: string;
  nodeLabel: string;
}

export interface AgentDatasourceBindings {
  connectors: AgentConnectorBinding[];
  dataStores: AgentDataStoreBinding[];
}

export interface DiscoveredConnectorOption {
  name: string;
  relativeName: string;
  collectionId: string;
  displayName: string;
  dataSource: string;
  state?: string;
  staticIpEnabled?: boolean;
  entityDataStores: DataStore[];
}

export interface DiscoveredDataStoreOption {
  name: string;
  dataStoreId: string;
  collectionId: string;
  displayName: string;
}

export interface ProjectDatasourcesCatalog {
  connectors: DiscoveredConnectorOption[];
  dataStores: DiscoveredDataStoreOption[];
}

export type AgentDatasourceMutation =
  | {
      type: "replace_connector";
      oldConnectorName: string;
      newConnectorName: string;
      newDataSource?: string;
      newTag?: string;
      targetBindingId?: string;
      entityDataStoreRemap?: Record<string, string>;
    }
  | {
      type: "add_connector";
      connectorName: string;
      dataSource?: string;
      tag?: string;
    }
  | {
      type: "remove_connector";
      connectorName: string;
      targetBindingId?: string;
    }
  | {
      type: "replace_datastore";
      oldDataStore: string;
      newDataStore: string;
      targetBindingId?: string;
    }
  | {
      type: "add_datastore";
      dataStore: string;
    }
  | {
      type: "remove_datastore";
      dataStore: string;
      targetBindingId?: string;
    };

export interface AgentDatasourceMutationResult {
  updatedAgent: Agent;
  payload: Partial<Agent>;
  changedCount: number;
  changes: string[];
}

/**
 * Extracts the collectionId from either a full or relative Discovery Engine DataConnector resource name:
 * - `projects/{p}/locations/{l}/collections/{collectionId}/dataConnector`
 * - `collections/{collectionId}/dataConnector`
 */
export const extractCollectionIdFromConnectorPath = (
  connectorPath: string,
): string | null => {
  const trimmed = (connectorPath || "").trim();
  if (!trimmed) return null;
  const fullMatch = trimmed.match(FULL_CONNECTOR_REGEX);
  if (fullMatch) return fullMatch[1];
  const relMatch = trimmed.match(RELATIVE_CONNECTOR_REGEX);
  if (relMatch) return relMatch[1];
  return null;
};

/**
 * Validates and normalizes a DataConnector resource name.
 * Rejects empty or malformed strings that do not match Discovery Engine connector paths.
 */
export const validateConnectorResourceName = (
  rawName: string,
  config?: Partial<Config>,
): string => {
  const trimmed = (rawName || "").trim();
  if (!trimmed) {
    throw new Error("Connector resource name cannot be empty.");
  }
  if (FULL_CONNECTOR_REGEX.test(trimmed) || RELATIVE_CONNECTOR_REGEX.test(trimmed)) {
    return trimmed;
  }
  // Allow bare collection ID if it is a simple identifier without slashes and config is provided
  if (!trimmed.includes("/") && config?.projectId && config?.appLocation) {
    return `projects/${config.projectId}/locations/${config.appLocation}/collections/${trimmed}/dataConnector`;
  }
  throw new Error(
    `Invalid DataConnector resource name '${trimmed}'. Expected 'projects/{project}/locations/{location}/collections/{collection}/dataConnector' or 'collections/{collection}/dataConnector'.`,
  );
};

/**
 * Extracts `{ collectionId, dataStoreId }` from a DataStore resource path.
 */
export const extractDataStoreInfo = (
  dsPath: string,
): { collectionId: string | null; dataStoreId: string } => {
  const trimmed = (dsPath || "").trim();
  const fullMatch = trimmed.match(FULL_DATASTORE_REGEX);
  if (fullMatch) {
    return { collectionId: fullMatch[3], dataStoreId: fullMatch[4] };
  }
  const relMatch = trimmed.match(RELATIVE_DATASTORE_REGEX);
  if (relMatch) {
    return { collectionId: relMatch[1], dataStoreId: relMatch[2] };
  }
  return { collectionId: null, dataStoreId: trimmed.split("/").pop() || trimmed };
};

/**
 * Validates and normalizes a DataStore resource name.
 */
export const validateDataStoreResourceName = (
  rawDataStore: string,
  config?: Partial<Config>,
): string => {
  const trimmed = (rawDataStore || "").trim();
  if (!trimmed) {
    throw new Error("DataStore resource name cannot be empty.");
  }
  if (FULL_DATASTORE_REGEX.test(trimmed)) {
    return trimmed;
  }
  const relMatch = trimmed.match(RELATIVE_DATASTORE_REGEX);
  if (relMatch && config?.projectId && config?.appLocation) {
    return `projects/${config.projectId}/locations/${config.appLocation}/collections/${relMatch[1]}/dataStores/${relMatch[2]}`;
  }
  if (!trimmed.includes("/") && config?.projectId && config?.appLocation) {
    const col = config.collectionId || "default_collection";
    return `projects/${config.projectId}/locations/${config.appLocation}/collections/${col}/dataStores/${trimmed}`;
  }
  throw new Error(
    `Invalid DataStore resource name '${trimmed}'. Expected 'projects/{project}/locations/{location}/collections/{collection}/dataStores/{dataStoreId}'.`,
  );
};

/**
 * Checks if two connector resource paths refer to the same connector
 * (matching both full `projects/.../collections/{c}/dataConnector` and relative `collections/{c}/dataConnector`,
 * mirroring Google's internal `agent_data_store_migration.cc`).
 */
export const isSameConnectorReference = (pathA: string, pathB: string): boolean => {
  const a = (pathA || "").trim();
  const b = (pathB || "").trim();
  if (!a || !b) return false;
  if (a === b) return true;

  const colA = extractCollectionIdFromConnectorPath(a);
  const colB = extractCollectionIdFromConnectorPath(b);
  if (!colA || !colB || colA !== colB) return false;

  // If both are full paths with projects/locations, require the same project/location or one to be relative
  const isARelative = RELATIVE_CONNECTOR_REGEX.test(a);
  const isBRelative = RELATIVE_CONNECTOR_REGEX.test(b);
  if (isARelative || isBRelative) {
    return true;
  }
  return a === b;
};

/**
 * Checks if two DataStore resource strings refer to the same DataStore.
 */
export const isSameDataStoreReference = (dsA: string, dsB: string): boolean => {
  const a = (dsA || "").trim();
  const b = (dsB || "").trim();
  if (!a || !b) return false;
  if (a === b) return true;

  const infoA = extractDataStoreInfo(a);
  const infoB = extractDataStoreInfo(b);
  if (
    infoA.collectionId &&
    infoB.collectionId &&
    infoA.collectionId === infoB.collectionId &&
    infoA.dataStoreId === infoB.dataStoreId
  ) {
    const isARel = RELATIVE_DATASTORE_REGEX.test(a);
    const isBRel = RELATIVE_DATASTORE_REGEX.test(b);
    if (isARel || isBRel) return true;
  }
  return false;
};

/**
 * Resolves the replacement connector name, preserving relative `collections/{c}/dataConnector` format
 * if the existing node used relative format and the new connector's collection ID can be extracted.
 */
const formatReplacementConnectorName = (
  existingName: string,
  newConnectorName: string,
): string => {
  const isExistingRelative = RELATIVE_CONNECTOR_REGEX.test((existingName || "").trim());
  const newColId = extractCollectionIdFromConnectorPath(newConnectorName);
  if (isExistingRelative && newColId) {
    return `collections/${newColId}/dataConnector`;
  }
  return newConnectorName.trim();
};

/**
 * Extracts all Connector and DataStore bindings from a Low-Code or Workflow agent.
 */
export const extractAgentDatasources = (
  agent: Partial<Agent> | null | undefined,
): AgentDatasourceBindings => {
  const connectors: AgentConnectorBinding[] = [];
  const dataStores: AgentDataStoreBinding[] = [];
  if (!agent) return { connectors, dataStores };

  // 1. Low-Code Agent Definition (`nodes` or fallback to `deployedNodes` if `nodes` is absent)
  const lowCodeDef = agent.lowCodeAgentDefinition;
  if (lowCodeDef) {
    const sourceNodes =
      lowCodeDef.nodes && lowCodeDef.nodes.length > 0
        ? lowCodeDef.nodes
        : lowCodeDef.deployedNodes || [];

    sourceNodes.forEach((node, nodeIdx) => {
      const llm = node.llmAgentNode;
      if (!llm) return;
      const nodeId = node.id || `node_${nodeIdx}`;
      const nodeLabel = node.displayName || node.id || `LLM Node #${nodeIdx + 1}`;

      if (Array.isArray(llm.dataConnectors)) {
        llm.dataConnectors.forEach((dc, dcIdx) => {
          if (dc?.name) {
            connectors.push({
              id: `lowcode:${nodeIdx}:dc:${dcIdx}:${dc.name}`,
              connectorName: dc.name,
              collectionId: extractCollectionIdFromConnectorPath(dc.name),
              dataSource: dc.dataSource,
              tag: dc.tag,
              locationType: "low_code_llm_node",
              nodeId,
              nodeLabel,
              canRemove: true,
            });
          }
        });
      }

      if (Array.isArray(llm.dataStoreSpecs?.specs)) {
        llm.dataStoreSpecs!.specs!.forEach((spec, specIdx) => {
          if (spec?.dataStore) {
            const info = extractDataStoreInfo(spec.dataStore);
            dataStores.push({
              id: `lowcode:${nodeIdx}:ds:${specIdx}:${spec.dataStore}`,
              dataStore: spec.dataStore,
              collectionId: info.collectionId,
              dataStoreId: info.dataStoreId,
              locationType: "low_code_llm_node",
              nodeId,
              nodeLabel,
            });
          }
        });
      }
    });
  }

  // 2. Workflow Agent Definition (`workflowAgentDefinition.agentFlow.nodes` + nested `forLoopNode`)
  const inspectWorkflowNodes = (
    nodes: WorkflowAgentFlowNode[] | undefined,
    prefix: string = "wf",
  ) => {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((node, nodeIdx) => {
      const nodeId = node.id || `${prefix}_node_${nodeIdx}`;
      const baseTitle = node.title || node.displayName || node.id || `Node #${nodeIdx + 1}`;

      if (node.agentNode) {
        const an = node.agentNode;
        if (Array.isArray(an.connectorToolSelections)) {
          an.connectorToolSelections.forEach((sel, selIdx) => {
            if (sel?.dataConnector?.name) {
              connectors.push({
                id: `${prefix}:${nodeId}:cts:${selIdx}:${sel.dataConnector.name}`,
                connectorName: sel.dataConnector.name,
                collectionId: extractCollectionIdFromConnectorPath(sel.dataConnector.name),
                dataSource: sel.dataConnector.dataSource,
                tag: sel.dataConnector.tag,
                locationType: "workflow_agent_node",
                nodeId,
                nodeLabel: `Agent Node (${baseTitle})`,
                canRemove: true,
              });
            }
          });
        }

        if (Array.isArray(an.dataStoreSpecs?.specs)) {
          an.dataStoreSpecs!.specs!.forEach((spec, specIdx) => {
            if (spec?.dataStore) {
              const info = extractDataStoreInfo(spec.dataStore);
              dataStores.push({
                id: `${prefix}:${nodeId}:ds:${specIdx}:${spec.dataStore}`,
                dataStore: spec.dataStore,
                collectionId: info.collectionId,
                dataStoreId: info.dataStoreId,
                locationType: "workflow_agent_node",
                nodeId,
                nodeLabel: `Agent Node (${baseTitle})`,
              });
            }
          });
        }

        if (Array.isArray(an.knowledgeSources)) {
          an.knowledgeSources.forEach((ks, ksIdx) => {
            const specs = ks?.dataStoreKnowledgeSource?.dataStoreSpecs?.specs;
            if (Array.isArray(specs)) {
              specs.forEach((spec, specIdx) => {
                if (spec?.dataStore) {
                  // Only push if not already represented identically in agentNode.dataStoreSpecs
                  const alreadyInAgentNode = an.dataStoreSpecs?.specs?.some(
                    (s) => s.dataStore === spec.dataStore,
                  );
                  if (!alreadyInAgentNode) {
                    const info = extractDataStoreInfo(spec.dataStore);
                    dataStores.push({
                      id: `${prefix}:${nodeId}:ks:${ksIdx}:ds:${specIdx}:${spec.dataStore}`,
                      dataStore: spec.dataStore,
                      collectionId: info.collectionId,
                      dataStoreId: info.dataStoreId,
                      locationType: "workflow_knowledge_source",
                      nodeId,
                      nodeLabel: `Knowledge Source (${baseTitle})`,
                    });
                  }
                }
              });
            }
          });
        }
      }

      if (node.connectorNode) {
        const cn = node.connectorNode;
        if (cn.dataConnector?.name) {
          connectors.push({
            id: `${prefix}:${nodeId}:cn:${cn.dataConnector.name}`,
            connectorName: cn.dataConnector.name,
            collectionId: extractCollectionIdFromConnectorPath(cn.dataConnector.name),
            dataSource: cn.dataConnector.dataSource,
            tag: cn.dataConnector.tag,
            locationType: "workflow_connector_node",
            nodeId,
            nodeLabel: `Connector Action Node (${baseTitle})`,
            canRemove: false,
          });
        }
        if (Array.isArray(cn.dataStoreSpecs?.specs)) {
          cn.dataStoreSpecs!.specs!.forEach((spec, specIdx) => {
            if (spec?.dataStore) {
              const info = extractDataStoreInfo(spec.dataStore);
              dataStores.push({
                id: `${prefix}:${nodeId}:cnds:${specIdx}:${spec.dataStore}`,
                dataStore: spec.dataStore,
                collectionId: info.collectionId,
                dataStoreId: info.dataStoreId,
                locationType: "workflow_connector_node",
                nodeId,
                nodeLabel: `Connector Action Node (${baseTitle})`,
              });
            }
          });
        }
      }

      if (node.connectorEventTrigger?.dataConnector?.name) {
        const dc = node.connectorEventTrigger.dataConnector;
        connectors.push({
          id: `${prefix}:${nodeId}:trigger:${dc.name}`,
          connectorName: dc.name,
          collectionId: extractCollectionIdFromConnectorPath(dc.name),
          dataSource: dc.dataSource,
          tag: dc.tag,
          locationType: "workflow_trigger_node",
          nodeId,
          nodeLabel: `Event Trigger (${baseTitle})`,
          canRemove: false,
        });
      }

      if (node.mcpNode?.dataConnector?.name) {
        const dc = node.mcpNode.dataConnector;
        connectors.push({
          id: `${prefix}:${nodeId}:mcp:${dc.name}`,
          connectorName: dc.name,
          collectionId: extractCollectionIdFromConnectorPath(dc.name),
          dataSource: dc.dataSource,
          tag: dc.tag,
          locationType: "workflow_mcp_node",
          nodeId,
          nodeLabel: `MCP Node (${baseTitle})`,
          canRemove: false,
        });
      }

      if (node.forLoopNode?.subAgentFlow?.nodes) {
        inspectWorkflowNodes(
          node.forLoopNode.subAgentFlow.nodes,
          `${prefix}:loop_${nodeId}`,
        );
      }
    });
  };

  if (agent.workflowAgentDefinition?.agentFlow?.nodes) {
    inspectWorkflowNodes(agent.workflowAgentDefinition.agentFlow.nodes);
  }

  // 3. Top-level Agent fields
  if (Array.isArray(agent.dataConnectors)) {
    agent.dataConnectors.forEach((dc, idx) => {
      if (dc?.name) {
        connectors.push({
          id: `top:dc:${idx}:${dc.name}`,
          connectorName: dc.name,
          collectionId: extractCollectionIdFromConnectorPath(dc.name),
          dataSource: dc.dataSource,
          tag: dc.tag,
          locationType: "agent_top_level",
          nodeLabel: "Agent Top-Level",
          canRemove: true,
        });
      }
    });
  }

  if (Array.isArray(agent.dataStoreSpecs?.specs)) {
    agent.dataStoreSpecs!.specs!.forEach((spec, idx) => {
      if (spec?.dataStore) {
        const info = extractDataStoreInfo(spec.dataStore);
        dataStores.push({
          id: `top:ds:${idx}:${spec.dataStore}`,
          dataStore: spec.dataStore,
          collectionId: info.collectionId,
          dataStoreId: info.dataStoreId,
          locationType: "agent_top_level",
          nodeLabel: "Agent Top-Level",
        });
      }
    });
  }

  return { connectors, dataStores };
};

/**
 * Helper to mutate `AgentDataStoreSpecs.specs` in place for replace or remove operations,
 * deduplicating any resulting specs.
 */
const replaceInDataStoreSpecs = (
  specsObj: AgentDataStoreSpecs | undefined,
  oldDs: string,
  newDs: string,
): number => {
  if (!specsObj || !Array.isArray(specsObj.specs)) return 0;
  let count = 0;
  const seen = new Set<string>();
  const nextSpecs: AgentDataStoreSpec[] = [];

  for (const spec of specsObj.specs) {
    if (spec && isSameDataStoreReference(spec.dataStore, oldDs)) {
      count++;
      const updatedDs = newDs.trim();
      if (!seen.has(updatedDs)) {
        seen.add(updatedDs);
        nextSpecs.push({ ...spec, dataStore: updatedDs });
      }
    } else if (spec?.dataStore) {
      if (!seen.has(spec.dataStore)) {
        seen.add(spec.dataStore);
        nextSpecs.push(spec);
      }
    }
  }
  specsObj.specs = nextSpecs;
  return count;
};

const removeFromDataStoreSpecs = (
  specsObj: AgentDataStoreSpecs | undefined,
  targetDs: string,
): number => {
  if (!specsObj || !Array.isArray(specsObj.specs)) return 0;
  const before = specsObj.specs.length;
  specsObj.specs = specsObj.specs.filter(
    (spec) => !spec?.dataStore || !isSameDataStoreReference(spec.dataStore, targetDs),
  );
  return before - specsObj.specs.length;
};

/**
 * Applies a connector or dataStore mutation (`replace_connector`, `add_connector`, `remove_connector`,
 * `replace_datastore`, `add_datastore`, `remove_datastore`) to a deep-cloned Agent and produces
 * the minimal `PATCH` payload for `updateAgent`.
 */
export const applyAgentDatasourceMutation = (
  agent: Agent,
  mutation: AgentDatasourceMutation,
  config?: Partial<Config>,
): AgentDatasourceMutationResult => {
  if (!agent || !agent.name) {
    throw new Error("A valid Agent with a resource name is required.");
  }

  const updatedAgent: Agent = JSON.parse(JSON.stringify(agent));
  const payload: Partial<Agent> = {};
  let changedCount = 0;
  const changes: string[] = [];

  let lowCodeTouched = false;
  let workflowTouched = false;
  let topConnectorsTouched = false;
  let topDataStoresTouched = false;

  // Ensure LowCode `nodes` is initialized from `deployedNodes` if `nodes` was empty
  if (
    updatedAgent.lowCodeAgentDefinition &&
    (!updatedAgent.lowCodeAgentDefinition.nodes ||
      updatedAgent.lowCodeAgentDefinition.nodes.length === 0) &&
    Array.isArray(updatedAgent.lowCodeAgentDefinition.deployedNodes) &&
    updatedAgent.lowCodeAgentDefinition.deployedNodes.length > 0
  ) {
    updatedAgent.lowCodeAgentDefinition.nodes = JSON.parse(
      JSON.stringify(updatedAgent.lowCodeAgentDefinition.deployedNodes),
    );
  }

  if (mutation.type === "replace_connector") {
    const oldName = (mutation.oldConnectorName || "").trim();
    if (!oldName) {
      throw new Error("Source connector name is required for replacement.");
    }
    const validatedNewName = validateConnectorResourceName(
      mutation.newConnectorName,
      config,
    );

    const mutateConnectorRef = (ref: AgentDataConnectorRef): boolean => {
      if (!ref?.name || !isSameConnectorReference(ref.name, oldName)) {
        return false;
      }
      const prev = ref.name;
      const formattedNew = formatReplacementConnectorName(prev, validatedNewName);
      ref.name = formattedNew;
      if (mutation.newDataSource) {
        ref.dataSource = mutation.newDataSource;
      }
      if (mutation.newTag !== undefined) {
        if (mutation.newTag) {
          ref.tag = mutation.newTag;
        } else {
          delete ref.tag;
        }
      } else if (!isSameConnectorReference(prev, formattedNew)) {
        // Clear version-specific tag when migrating to a different connector collection
        delete ref.tag;
      }
      changedCount++;
      changes.push(`Connector: ${prev} -> ${formattedNew}`);
      return true;
    };

    if (updatedAgent.lowCodeAgentDefinition?.nodes) {
      for (const node of updatedAgent.lowCodeAgentDefinition.nodes) {
        if (Array.isArray(node.llmAgentNode?.dataConnectors)) {
          for (const dc of node.llmAgentNode!.dataConnectors!) {
            if (mutateConnectorRef(dc)) {
              lowCodeTouched = true;
            }
          }
        }
      }
    }

    const mutateWorkflowConnectorNodes = (nodes: WorkflowAgentFlowNode[] | undefined) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (Array.isArray(node.agentNode?.connectorToolSelections)) {
          for (const sel of node.agentNode!.connectorToolSelections!) {
            if (sel?.dataConnector && mutateConnectorRef(sel.dataConnector)) {
              workflowTouched = true;
            }
          }
        }
        if (node.connectorNode?.dataConnector) {
          if (mutateConnectorRef(node.connectorNode.dataConnector)) {
            workflowTouched = true;
          }
        }
        if (node.connectorEventTrigger?.dataConnector) {
          if (mutateConnectorRef(node.connectorEventTrigger.dataConnector)) {
            workflowTouched = true;
          }
        }
        if (node.mcpNode?.dataConnector) {
          if (mutateConnectorRef(node.mcpNode.dataConnector)) {
            workflowTouched = true;
          }
        }
        if (node.forLoopNode?.subAgentFlow?.nodes) {
          mutateWorkflowConnectorNodes(node.forLoopNode.subAgentFlow.nodes);
        }
      }
    };

    if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
      mutateWorkflowConnectorNodes(updatedAgent.workflowAgentDefinition.agentFlow.nodes);
    }

    if (Array.isArray(updatedAgent.dataConnectors)) {
      for (const dc of updatedAgent.dataConnectors) {
        if (mutateConnectorRef(dc)) {
          topConnectorsTouched = true;
        }
      }
    }

    // Also remap any associated entity DataStores if provided (e.g. VPC-SC connector rebuild)
    if (
      mutation.entityDataStoreRemap &&
      Object.keys(mutation.entityDataStoreRemap).length > 0
    ) {
      for (const [oldDs, newDs] of Object.entries(mutation.entityDataStoreRemap)) {
        const subResult = applyAgentDatasourceMutation(
          updatedAgent,
          {
            type: "replace_datastore",
            oldDataStore: oldDs,
            newDataStore: newDs,
          },
          config,
        );
        if (subResult.changedCount > 0) {
          Object.assign(updatedAgent, subResult.updatedAgent);
          Object.assign(payload, subResult.payload);
          changedCount += subResult.changedCount;
          changes.push(...subResult.changes);
        }
      }
    }
  } else if (mutation.type === "add_connector") {
    const validatedNewName = validateConnectorResourceName(
      mutation.connectorName,
      config,
    );
    const dataSource = (mutation.dataSource || "").trim() || undefined;

    if (updatedAgent.lowCodeAgentDefinition) {
      if (!Array.isArray(updatedAgent.lowCodeAgentDefinition.nodes) || updatedAgent.lowCodeAgentDefinition.nodes.length === 0) {
        updatedAgent.lowCodeAgentDefinition.nodes = [{ llmAgentNode: {} }];
      }
      for (const node of updatedAgent.lowCodeAgentDefinition.nodes) {
        if (!node.llmAgentNode) continue;
        if (!Array.isArray(node.llmAgentNode.dataConnectors)) {
          node.llmAgentNode.dataConnectors = [];
        }
        const exists = node.llmAgentNode.dataConnectors.some((dc) =>
          isSameConnectorReference(dc.name, validatedNewName),
        );
        if (!exists) {
          const newRef: AgentDataConnectorRef = { name: validatedNewName };
          if (dataSource) newRef.dataSource = dataSource;
          if (mutation.tag) newRef.tag = mutation.tag;
          node.llmAgentNode.dataConnectors.push(newRef);
          lowCodeTouched = true;
          changedCount++;
          changes.push(`Added Connector: ${validatedNewName}`);
        }
      }
    }

    if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
      const addConnectorToWorkflow = (nodes: WorkflowAgentFlowNode[]) => {
        for (const node of nodes) {
          if (node.agentNode) {
            if (!Array.isArray(node.agentNode.connectorToolSelections)) {
              node.agentNode.connectorToolSelections = [];
            }
            const exists = node.agentNode.connectorToolSelections.some(
              (sel) =>
                sel?.dataConnector?.name &&
                isSameConnectorReference(sel.dataConnector.name, validatedNewName),
            );
            if (!exists) {
              const newRef: AgentDataConnectorRef = { name: validatedNewName };
              if (dataSource) newRef.dataSource = dataSource;
              if (mutation.tag) newRef.tag = mutation.tag;
              node.agentNode.connectorToolSelections.push({
                dataConnector: newRef,
                enabled: true,
                searchToolEnabled: true,
              });
              workflowTouched = true;
              changedCount++;
              changes.push(
                `Added Connector to ${node.title || node.id || "Agent Node"}: ${validatedNewName}`,
              );
            }
          }
          if (node.forLoopNode?.subAgentFlow?.nodes) {
            addConnectorToWorkflow(node.forLoopNode.subAgentFlow.nodes);
          }
        }
      };
      addConnectorToWorkflow(updatedAgent.workflowAgentDefinition.agentFlow.nodes);
    }
  } else if (mutation.type === "remove_connector") {
    const targetName = (mutation.connectorName || "").trim();
    if (!targetName) {
      throw new Error("Target connector name is required for removal.");
    }

    let nonRemovableHits = 0;

    if (updatedAgent.lowCodeAgentDefinition?.nodes) {
      for (const node of updatedAgent.lowCodeAgentDefinition.nodes) {
        if (Array.isArray(node.llmAgentNode?.dataConnectors)) {
          const before = node.llmAgentNode!.dataConnectors!.length;
          node.llmAgentNode!.dataConnectors =
            node.llmAgentNode!.dataConnectors!.filter(
              (dc) => !dc?.name || !isSameConnectorReference(dc.name, targetName),
            );
          const diff = before - node.llmAgentNode!.dataConnectors!.length;
          if (diff > 0) {
            lowCodeTouched = true;
            changedCount += diff;
            changes.push(`Removed Connector: ${targetName}`);
          }
        }
      }
    }

    const removeConnectorFromWorkflow = (nodes: WorkflowAgentFlowNode[] | undefined) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (Array.isArray(node.agentNode?.connectorToolSelections)) {
          const before = node.agentNode!.connectorToolSelections!.length;
          node.agentNode!.connectorToolSelections =
            node.agentNode!.connectorToolSelections!.filter(
              (sel) =>
                !sel?.dataConnector?.name ||
                !isSameConnectorReference(sel.dataConnector.name, targetName),
            );
          const diff = before - node.agentNode!.connectorToolSelections!.length;
          if (diff > 0) {
            workflowTouched = true;
            changedCount += diff;
            changes.push(
              `Removed Connector from ${node.title || node.id || "Agent Node"}: ${targetName}`,
            );
          }
        }
        if (
          node.connectorNode?.dataConnector?.name &&
          isSameConnectorReference(node.connectorNode.dataConnector.name, targetName)
        ) {
          nonRemovableHits++;
        }
        if (
          node.connectorEventTrigger?.dataConnector?.name &&
          isSameConnectorReference(
            node.connectorEventTrigger.dataConnector.name,
            targetName,
          )
        ) {
          nonRemovableHits++;
        }
        if (
          node.mcpNode?.dataConnector?.name &&
          isSameConnectorReference(node.mcpNode.dataConnector.name, targetName)
        ) {
          nonRemovableHits++;
        }
        if (node.forLoopNode?.subAgentFlow?.nodes) {
          removeConnectorFromWorkflow(node.forLoopNode.subAgentFlow.nodes);
        }
      }
    };

    if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
      removeConnectorFromWorkflow(updatedAgent.workflowAgentDefinition.agentFlow.nodes);
    }

    if (Array.isArray(updatedAgent.dataConnectors)) {
      const before = updatedAgent.dataConnectors.length;
      updatedAgent.dataConnectors = updatedAgent.dataConnectors.filter(
        (dc) => !dc?.name || !isSameConnectorReference(dc.name, targetName),
      );
      const diff = before - updatedAgent.dataConnectors.length;
      if (diff > 0) {
        topConnectorsTouched = true;
        changedCount += diff;
        changes.push(`Removed top-level Connector: ${targetName}`);
      }
    }

    if (changedCount === 0 && nonRemovableHits > 0) {
      throw new Error(
        `Connector '${targetName}' is bound to a dedicated Workflow Action, Trigger, or MCP node and cannot be removed without deleting the workflow node. Use 'Swap / Replace Connector' instead.`,
      );
    }
  } else if (mutation.type === "replace_datastore") {
    const oldDs = (mutation.oldDataStore || "").trim();
    if (!oldDs) {
      throw new Error("Source DataStore resource name is required for replacement.");
    }
    const validatedNewDs = validateDataStoreResourceName(
      mutation.newDataStore,
      config,
    );

    if (updatedAgent.lowCodeAgentDefinition?.nodes) {
      for (const node of updatedAgent.lowCodeAgentDefinition.nodes) {
        const diff = replaceInDataStoreSpecs(
          node.llmAgentNode?.dataStoreSpecs,
          oldDs,
          validatedNewDs,
        );
        if (diff > 0) {
          lowCodeTouched = true;
          changedCount += diff;
          changes.push(`DataStore: ${oldDs} -> ${validatedNewDs}`);
        }
      }
    }

    const replaceDsInWorkflow = (nodes: WorkflowAgentFlowNode[] | undefined) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        let nodeChanged = 0;
        if (node.agentNode) {
          nodeChanged += replaceInDataStoreSpecs(
            node.agentNode.dataStoreSpecs,
            oldDs,
            validatedNewDs,
          );
          if (Array.isArray(node.agentNode.knowledgeSources)) {
            for (const ks of node.agentNode.knowledgeSources) {
              nodeChanged += replaceInDataStoreSpecs(
                ks?.dataStoreKnowledgeSource?.dataStoreSpecs,
                oldDs,
                validatedNewDs,
              );
            }
          }
        }
        if (node.connectorNode) {
          nodeChanged += replaceInDataStoreSpecs(
            node.connectorNode.dataStoreSpecs,
            oldDs,
            validatedNewDs,
          );
        }
        if (nodeChanged > 0) {
          workflowTouched = true;
          changedCount += nodeChanged;
          changes.push(
            `DataStore (${node.title || node.id || "Workflow Node"}): ${oldDs} -> ${validatedNewDs}`,
          );
        }
        if (node.forLoopNode?.subAgentFlow?.nodes) {
          replaceDsInWorkflow(node.forLoopNode.subAgentFlow.nodes);
        }
      }
    };

    if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
      replaceDsInWorkflow(updatedAgent.workflowAgentDefinition.agentFlow.nodes);
    }

    if (updatedAgent.dataStoreSpecs) {
      const diff = replaceInDataStoreSpecs(
        updatedAgent.dataStoreSpecs,
        oldDs,
        validatedNewDs,
      );
      if (diff > 0) {
        topDataStoresTouched = true;
        changedCount += diff;
        changes.push(`Top-level DataStore: ${oldDs} -> ${validatedNewDs}`);
      }
    }
  } else if (mutation.type === "add_datastore") {
    const validatedNewDs = validateDataStoreResourceName(
      mutation.dataStore,
      config,
    );

    if (updatedAgent.lowCodeAgentDefinition) {
      if (
        !Array.isArray(updatedAgent.lowCodeAgentDefinition.nodes) ||
        updatedAgent.lowCodeAgentDefinition.nodes.length === 0
      ) {
        updatedAgent.lowCodeAgentDefinition.nodes = [{ llmAgentNode: {} }];
      }
      for (const node of updatedAgent.lowCodeAgentDefinition.nodes) {
        if (!node.llmAgentNode) continue;
        if (!node.llmAgentNode.dataStoreSpecs) {
          node.llmAgentNode.dataStoreSpecs = { specs: [] };
        }
        if (!Array.isArray(node.llmAgentNode.dataStoreSpecs.specs)) {
          node.llmAgentNode.dataStoreSpecs.specs = [];
        }
        const exists = node.llmAgentNode.dataStoreSpecs.specs.some((s) =>
          isSameDataStoreReference(s.dataStore, validatedNewDs),
        );
        if (!exists) {
          node.llmAgentNode.dataStoreSpecs.specs.push({
            dataStore: validatedNewDs,
          });
          lowCodeTouched = true;
          changedCount++;
          changes.push(`Added DataStore: ${validatedNewDs}`);
        }
      }
    }

    if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
      const addDsToWorkflow = (nodes: WorkflowAgentFlowNode[]) => {
        for (const node of nodes) {
          if (node.agentNode) {
            if (!node.agentNode.dataStoreSpecs) {
              node.agentNode.dataStoreSpecs = { specs: [] };
            }
            if (!Array.isArray(node.agentNode.dataStoreSpecs.specs)) {
              node.agentNode.dataStoreSpecs.specs = [];
            }
            const exists = node.agentNode.dataStoreSpecs.specs.some((s) =>
              isSameDataStoreReference(s.dataStore, validatedNewDs),
            );
            if (!exists) {
              node.agentNode.dataStoreSpecs.specs.push({
                dataStore: validatedNewDs,
              });
              // Also sync into knowledgeSources if this agentNode already uses dataStoreKnowledgeSource
              if (Array.isArray(node.agentNode.knowledgeSources)) {
                const dsKs = node.agentNode.knowledgeSources.find(
                  (ks) => ks.dataStoreKnowledgeSource?.dataStoreSpecs,
                );
                if (dsKs?.dataStoreKnowledgeSource?.dataStoreSpecs) {
                  if (!Array.isArray(dsKs.dataStoreKnowledgeSource.dataStoreSpecs.specs)) {
                    dsKs.dataStoreKnowledgeSource.dataStoreSpecs.specs = [];
                  }
                  const ksExists =
                    dsKs.dataStoreKnowledgeSource.dataStoreSpecs.specs.some((s) =>
                      isSameDataStoreReference(s.dataStore, validatedNewDs),
                    );
                  if (!ksExists) {
                    dsKs.dataStoreKnowledgeSource.dataStoreSpecs.specs.push({
                      dataStore: validatedNewDs,
                    });
                  }
                }
              }
              workflowTouched = true;
              changedCount++;
              changes.push(
                `Added DataStore to ${node.title || node.id || "Agent Node"}: ${validatedNewDs}`,
              );
            }
          }
          if (node.forLoopNode?.subAgentFlow?.nodes) {
            addDsToWorkflow(node.forLoopNode.subAgentFlow.nodes);
          }
        }
      };
      addDsToWorkflow(updatedAgent.workflowAgentDefinition.agentFlow.nodes);
    }
  } else if (mutation.type === "remove_datastore") {
    const targetDs = (mutation.dataStore || "").trim();
    if (!targetDs) {
      throw new Error("Target DataStore resource name is required for removal.");
    }

    if (updatedAgent.lowCodeAgentDefinition?.nodes) {
      for (const node of updatedAgent.lowCodeAgentDefinition.nodes) {
        const diff = removeFromDataStoreSpecs(
          node.llmAgentNode?.dataStoreSpecs,
          targetDs,
        );
        if (diff > 0) {
          lowCodeTouched = true;
          changedCount += diff;
          changes.push(`Removed DataStore: ${targetDs}`);
        }
      }
    }

    const removeDsFromWorkflow = (nodes: WorkflowAgentFlowNode[] | undefined) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        let nodeRemoved = 0;
        if (node.agentNode) {
          nodeRemoved += removeFromDataStoreSpecs(
            node.agentNode.dataStoreSpecs,
            targetDs,
          );
          if (Array.isArray(node.agentNode.knowledgeSources)) {
            for (const ks of node.agentNode.knowledgeSources) {
              nodeRemoved += removeFromDataStoreSpecs(
                ks?.dataStoreKnowledgeSource?.dataStoreSpecs,
                targetDs,
              );
            }
          }
        }
        if (node.connectorNode) {
          nodeRemoved += removeFromDataStoreSpecs(
            node.connectorNode.dataStoreSpecs,
            targetDs,
          );
        }
        if (nodeRemoved > 0) {
          workflowTouched = true;
          changedCount += nodeRemoved;
          changes.push(
            `Removed DataStore from ${node.title || node.id || "Workflow Node"}: ${targetDs}`,
          );
        }
        if (node.forLoopNode?.subAgentFlow?.nodes) {
          removeDsFromWorkflow(node.forLoopNode.subAgentFlow.nodes);
        }
      }
    };

    if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
      removeDsFromWorkflow(updatedAgent.workflowAgentDefinition.agentFlow.nodes);
    }

    if (updatedAgent.dataStoreSpecs) {
      const diff = removeFromDataStoreSpecs(updatedAgent.dataStoreSpecs, targetDs);
      if (diff > 0) {
        topDataStoresTouched = true;
        changedCount += diff;
        changes.push(`Removed top-level DataStore: ${targetDs}`);
      }
    }
  }

  if (lowCodeTouched && updatedAgent.lowCodeAgentDefinition) {
    payload.lowCodeAgentDefinition = updatedAgent.lowCodeAgentDefinition;
  }
  if (workflowTouched && updatedAgent.workflowAgentDefinition) {
    payload.workflowAgentDefinition = updatedAgent.workflowAgentDefinition;
  }
  if (topConnectorsTouched && updatedAgent.dataConnectors) {
    payload.dataConnectors = updatedAgent.dataConnectors;
  }
  if (topDataStoresTouched && updatedAgent.dataStoreSpecs) {
    payload.dataStoreSpecs = updatedAgent.dataStoreSpecs;
  }

  return {
    updatedAgent,
    payload,
    changedCount,
    changes,
  };
};

/**
 * Computes an automatic Entity DataStore remap dictionary `{ [oldDataStore]: newDataStore }`
 * when migrating an agent from `oldConnectorName` (`oldCollectionId`) to `newConnectorName` (`newCollectionId`).
 * Matches entity data stores by entity suffix (e.g. `jira_old_issue` -> `jira_vpcsc_issue` or same `dataStoreId` under `newCollectionId`).
 */
export const buildEntityDataStoreRemap = (
  agent: Agent,
  oldConnectorName: string,
  newConnectorName: string,
  catalogDataStores: DiscoveredDataStoreOption[],
): Record<string, string> => {
  const oldColId = extractCollectionIdFromConnectorPath(oldConnectorName);
  const newColId = extractCollectionIdFromConnectorPath(newConnectorName);
  if (!oldColId || !newColId || oldColId === newColId) return {};

  const bindings = extractAgentDatasources(agent);
  const remap: Record<string, string> = {};

  const targetColStores = catalogDataStores.filter(
    (ds) =>
      ds.collectionId === newColId ||
      ds.dataStoreId.startsWith(`${newColId}_`) ||
      ds.dataStoreId === newColId,
  );

  for (const dsBinding of bindings.dataStores) {
    const { collectionId, dataStoreId } = dsBinding;
    const belongsToOldConnector =
      collectionId === oldColId ||
      dataStoreId.startsWith(`${oldColId}_`) ||
      dataStoreId === oldColId;

    if (!belongsToOldConnector) continue;

    // Determine entity suffix (e.g. "issue" from "jira_old_issue")
    const entitySuffix = dataStoreId.startsWith(`${oldColId}_`)
      ? dataStoreId.slice(oldColId.length + 1)
      : dataStoreId;

    const matchBySuffix = targetColStores.find(
      (candidate) =>
        candidate.dataStoreId === `${newColId}_${entitySuffix}` ||
        candidate.dataStoreId === entitySuffix ||
        (entitySuffix && candidate.dataStoreId.endsWith(`_${entitySuffix}`)),
    );

    if (matchBySuffix) {
      remap[dsBinding.dataStore] = matchBySuffix.name;
    } else if (targetColStores.length === 1) {
      remap[dsBinding.dataStore] = targetColStores[0].name;
    } else if (collectionId === oldColId) {
      // Fallback: rewrite collection segment & prefix in the resource path
      const rewrittenId = dataStoreId.startsWith(`${oldColId}_`)
        ? `${newColId}_${entitySuffix}`
        : dataStoreId;
      remap[dsBinding.dataStore] = dsBinding.dataStore
        .replace(`/collections/${oldColId}/`, `/collections/${newColId}/`)
        .replace(`/dataStores/${dataStoreId}`, `/dataStores/${rewrittenId}`);
    }
  }

  return remap;
};

/**
 * Discovers all live Collections, DataConnectors, and DataStores in the project & location.
 */
export const discoverProjectDatasources = async (
  config: Config,
): Promise<ProjectDatasourcesCatalog> => {
  if (!config.projectId || !config.appLocation) {
    return { connectors: [], dataStores: [] };
  }

  const collectionsMap = new Map<string, Collection>();
  collectionsMap.set("default_collection", {
    name: `projects/${config.projectId}/locations/${config.appLocation}/collections/default_collection`,
    displayName: "default_collection",
  });

  try {
    const colRes = await listCollections(config);
    for (const col of colRes.collections || []) {
      const colId = col.name?.split("/").pop();
      if (colId) {
        collectionsMap.set(colId, col);
      }
    }
  } catch (err) {
    console.warn("Could not list collections for datasource catalog:", err);
  }

  const connectors: DiscoveredConnectorOption[] = [];
  const dataStoresMap = new Map<string, DiscoveredDataStoreOption>();

  const collectionEntries = Array.from(collectionsMap.entries());
  await Promise.allSettled(
    collectionEntries.map(async ([collectionId, col]) => {
      const colConfig: Config = { ...config, collectionId };
      let entityDataStores: DataStore[] = [];

      // 1. Fetch dataStores in this collection
      try {
        const dsRes = await listResources<DataStore>(
          "dataStores",
          colConfig,
          undefined,
          200,
          true,
        );
        entityDataStores = dsRes.dataStores || [];
        for (const ds of entityDataStores) {
          if (ds?.name) {
            const dsId = ds.name.split("/").pop() || ds.name;
            dataStoresMap.set(ds.name, {
              name: ds.name,
              dataStoreId: dsId,
              collectionId,
              displayName: ds.displayName || dsId,
            });
          }
        }
      } catch {
        // Collection may not have dataStores or caller lacks permission on this collection
      }

      // 2. Fetch dataConnector on this collection (skip default_collection unless it has one)
      const inlineConnector =
        col.dataConnector && typeof col.dataConnector === "object"
          ? (col.dataConnector as DataConnector)
          : null;

      let connector: DataConnector | null = inlineConnector;
      if (!connector && collectionId !== "default_collection") {
        try {
          connector = await getDataConnector({
            ...colConfig,
            suppressErrorLog: true,
          });
        } catch {
          connector = null;
        }
      }

      if (connector && (connector.name || connector.dataSource)) {
        const fullName =
          connector.name && connector.name.startsWith("projects/")
            ? connector.name
            : `projects/${config.projectId}/locations/${config.appLocation}/collections/${collectionId}/dataConnector`;
        const staticIp = Boolean(
          connector.staticIpEnabled || connector.params?.static_ip_enabled,
        );
        connectors.push({
          name: fullName,
          relativeName: `collections/${collectionId}/dataConnector`,
          collectionId,
          displayName:
            col.displayName ||
            connector.displayName ||
            `${collectionId} (${connector.dataSource || "connector"})`,
          dataSource: connector.dataSource || "custom",
          state: connector.state,
          staticIpEnabled: staticIp,
          entityDataStores,
        });
      }
    }),
  );

  // Also link any dataStores from default_collection that match a connector's collectionId prefix
  const allDataStores = Array.from(dataStoresMap.values());
  for (const conn of connectors) {
    if (conn.entityDataStores.length === 0) {
      const prefixMatches = allDataStores.filter(
        (ds) =>
          ds.dataStoreId.startsWith(`${conn.collectionId}_`) ||
          ds.dataStoreId === conn.collectionId,
      );
      if (prefixMatches.length > 0) {
        conn.entityDataStores = prefixMatches.map((m) => ({
          name: m.name,
          displayName: m.displayName,
        }));
      }
    }
  }

  return {
    connectors: connectors.sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    ),
    dataStores: allDataStores.sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    ),
  };
};

const isPermissionDeniedError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    msg.includes("403") ||
    lower.includes("permission_denied") ||
    lower.includes("permission denied") ||
    lower.includes("does not have permission")
  );
};

export interface UpdateAndPublishOptions {
  autoDeployOrPublish?: boolean;
  autoClaimOwnershipOn403?: boolean;
  publishLabel?: string;
}

export interface UpdateAndPublishResult {
  updatedAgent: Agent;
  deployedOrPublished: boolean;
  ownershipClaimed: boolean;
  deployWarning?: string;
}

/**
 * Updates a No-Code (`lowCodeAgentDefinition` or `workflowAgentDefinition`) agent via `PATCH`,
 * optionally claiming ownership (`:transferAgentOwner`) if blocked by 403, and then publishes
 * (`:publish` for Workflow agents) or deploys (`:deployLowCode` for Low-Code agents) so the live
 * agent immediately uses the updated model/connectors/dataStores.
 */
export const updateAndPublishNoCodeAgent = async (
  agent: Agent,
  payload: Partial<Agent>,
  config: Config,
  options: UpdateAndPublishOptions = {
    autoDeployOrPublish: true,
    autoClaimOwnershipOn403: false,
  },
): Promise<UpdateAndPublishResult> => {
  let ownershipClaimed = false;
  let patchedAgent: Agent;
  const isPrivateAgent = agent.state === "PRIVATE";
  const canClaimOwnership = Boolean(
    options.autoClaimOwnershipOn403 && !isPrivateAgent,
  );

  try {
    patchedAgent = await updateAgent(agent, payload, config);
  } catch (err: unknown) {
    if (canClaimOwnership && isPermissionDeniedError(err)) {
      await transferAgentOwner(
        agent.name,
        { toSelf: true, previousOwnerDisposition: "KEEP_AS_AGENT_USER" },
        config,
      );
      ownershipClaimed = true;
      patchedAgent = await updateAgent(agent, payload, config);
    } else {
      throw err;
    }
  }

  let deployedOrPublished = false;
  let deployWarning: string | undefined;

  if (options.autoDeployOrPublish !== false) {
    const isWorkflow = Boolean(
      payload.workflowAgentDefinition || agent.workflowAgentDefinition,
    );
    const isLowCode = Boolean(
      payload.lowCodeAgentDefinition || agent.lowCodeAgentDefinition,
    );

    if (isWorkflow) {
      try {
        const pubRes = await publishAgent(agent.name, config, {
          label: options.publishLabel,
        });
        if (pubRes?.agent) {
          patchedAgent = pubRes.agent;
        }
        deployedOrPublished = true;
      } catch (pubErr: unknown) {
        if (
          canClaimOwnership &&
          !ownershipClaimed &&
          isPermissionDeniedError(pubErr)
        ) {
          try {
            await transferAgentOwner(
              agent.name,
              { toSelf: true, previousOwnerDisposition: "KEEP_AS_AGENT_USER" },
              config,
            );
            ownershipClaimed = true;
            const pubRes = await publishAgent(agent.name, config, {
              label: options.publishLabel,
            });
            if (pubRes?.agent) {
              patchedAgent = pubRes.agent;
            }
            deployedOrPublished = true;
          } catch (retryErr: unknown) {
            deployWarning = `Draft saved, but publishing failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`;
          }
        } else {
          deployWarning = `Draft saved, but publishing failed: ${pubErr instanceof Error ? pubErr.message : String(pubErr)}`;
        }
      }
    } else if (isLowCode) {
      try {
        await deployLowCodeAgent(agent.name, config, "DEPLOY");
        deployedOrPublished = true;
      } catch (depErr: unknown) {
        if (
          canClaimOwnership &&
          !ownershipClaimed &&
          isPermissionDeniedError(depErr)
        ) {
          try {
            await transferAgentOwner(
              agent.name,
              { toSelf: true, previousOwnerDisposition: "KEEP_AS_AGENT_USER" },
              config,
            );
            ownershipClaimed = true;
            await deployLowCodeAgent(agent.name, config, "DEPLOY");
            deployedOrPublished = true;
          } catch (retryErr: unknown) {
            deployWarning = `Draft saved, but :deployLowCode failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`;
          }
        } else if (isPrivateAgent && isPermissionDeniedError(depErr)) {
          deployWarning = `Draft saved, but :deployLowCode requires the agent owner. Because this agent is PRIVATE (unshared), :transferAgentOwner cannot be used — the owner must click Deploy or share the agent first.`;
        } else {
          deployWarning = `Draft saved, but :deployLowCode failed (Low-Code deploy requires agent owner; enable 'Auto-claim ownership' on shared agents or transfer ownership first): ${depErr instanceof Error ? depErr.message : String(depErr)}`;
        }
      }
    }
  }

  try {
    patchedAgent = await getAgent(agent.name, config);
  } catch {
    // Keep patchedAgent from updateAgent/publishAgent if re-fetch fails
  }

  return {
    updatedAgent: patchedAgent,
    deployedOrPublished,
    ownershipClaimed,
    deployWarning,
  };
};

export interface BulkDatasourceAgentOutcome {
  agentName: string;
  displayName: string;
  status: "updated_and_published" | "draft_updated" | "skipped" | "failed";
  changedCount: number;
  changes: string[];
  ownershipClaimed?: boolean;
  warning?: string;
  error?: string;
}

export interface BulkUpdateDatasourcesResult {
  total: number;
  updatedAndPublished: number;
  draftOnlyUpdated: number;
  skipped: number;
  failed: number;
  outcomes: BulkDatasourceAgentOutcome[];
}

/**
 * Bulk-applies a datasource mutation across multiple No-Code (`LOW_CODE` / `WORKFLOW_AGENT`) agents.
 */
export const bulkUpdateNoCodeAgentDatasources = async (
  agents: Agent[],
  mutation: AgentDatasourceMutation,
  config: Config,
  options: UpdateAndPublishOptions & {
    catalogDataStores?: DiscoveredDataStoreOption[];
    remapMatchingEntityDataStores?: boolean;
    onProgress?: (completed: number, total: number, latest: BulkDatasourceAgentOutcome) => void;
  } = { autoDeployOrPublish: true, autoClaimOwnershipOn403: false },
): Promise<BulkUpdateDatasourcesResult> => {
  const result: BulkUpdateDatasourcesResult = {
    total: agents.length,
    updatedAndPublished: 0,
    draftOnlyUpdated: 0,
    skipped: 0,
    failed: 0,
    outcomes: [],
  };

  for (let i = 0; i < agents.length; i++) {
    const target = agents[i];
    const displayName = target.displayName || target.name.split("/").pop() || "Agent";

    try {
      // Ensure we have the full agent definition if neither lowCode nor workflow is populated on the list item
      const fullAgent =
        target.lowCodeAgentDefinition || target.workflowAgentDefinition
          ? target
          : await getAgent(target.name, config);

      let effectiveMutation: AgentDatasourceMutation = mutation;
      if (
        mutation.type === "replace_connector" &&
        options.remapMatchingEntityDataStores &&
        options.catalogDataStores
      ) {
        const autoRemap = buildEntityDataStoreRemap(
          fullAgent,
          mutation.oldConnectorName,
          mutation.newConnectorName,
          options.catalogDataStores,
        );
        effectiveMutation = {
          ...mutation,
          entityDataStoreRemap: {
            ...autoRemap,
            ...(mutation.entityDataStoreRemap || {}),
          },
        };
      }

      const mutationRes = applyAgentDatasourceMutation(
        fullAgent,
        effectiveMutation,
        config,
      );

      if (mutationRes.changedCount === 0) {
        const outcome: BulkDatasourceAgentOutcome = {
          agentName: fullAgent.name,
          displayName,
          status: "skipped",
          changedCount: 0,
          changes: [],
        };
        result.skipped++;
        result.outcomes.push(outcome);
        options.onProgress?.(i + 1, agents.length, outcome);
        continue;
      }

      const saveRes = await updateAndPublishNoCodeAgent(
        fullAgent,
        mutationRes.payload,
        config,
        options,
      );

      const isPublished =
        options.autoDeployOrPublish !== false && saveRes.deployedOrPublished;
      const outcome: BulkDatasourceAgentOutcome = {
        agentName: fullAgent.name,
        displayName,
        status: isPublished ? "updated_and_published" : "draft_updated",
        changedCount: mutationRes.changedCount,
        changes: mutationRes.changes,
        ownershipClaimed: saveRes.ownershipClaimed,
        warning: saveRes.deployWarning,
      };

      if (isPublished) {
        result.updatedAndPublished++;
      } else {
        result.draftOnlyUpdated++;
      }
      result.outcomes.push(outcome);
      options.onProgress?.(i + 1, agents.length, outcome);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const cleanMsg = rawMsg.includes("[ORIGINAL ERROR]")
        ? rawMsg.split("[ORIGINAL ERROR]")[0].trim().replace(/\(\s*$/, "").trim()
        : rawMsg;

      const outcome: BulkDatasourceAgentOutcome = {
        agentName: target.name,
        displayName,
        status: "failed",
        changedCount: 0,
        changes: [],
        error: cleanMsg,
      };
      result.failed++;
      result.outcomes.push(outcome);
      options.onProgress?.(i + 1, agents.length, outcome);
    }
  }

  return result;
};
