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
  Authorization,
  Collection,
  Config,
  DataStore,
  IamPolicy,
  Operation,
  ReasoningEngine,
  AppEngine,
} from '../../types';
import * as api from '../apiService';
import { toErrorMessage } from '../../utils/errors';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollOperation<T = Record<string, unknown>>(
  operation: Operation<T>,
  pollConfig: Omit<Config, 'accessToken'>,
  resourceName: string,
  apiVersion: 'v1alpha' | 'v1beta' = 'v1beta',
  maxAttempts: number = 60,
  addLog: (msg: string) => void = () => {}
): Promise<T | undefined> {
  let currentOperation: Operation<T> = operation;
  let attempts = 0;
  addLog(
    `  - Operation for ${resourceName} initiated (${currentOperation.name}). Polling for completion...`
  );
  while (!currentOperation.done) {
    if (attempts++ >= maxAttempts) {
      throw new Error(
        `${resourceName} operation timed out after ${maxAttempts * 5}s waiting for completion. It may still be running in Google Cloud.`
      );
    }
    await delay(5000);
    currentOperation = await api.getDiscoveryOperation(
      currentOperation.name,
      pollConfig,
      apiVersion
    );
    addLog(
      `    - Polling ${resourceName}... status: ${currentOperation.done ? 'DONE' : 'IN_PROGRESS'}`
    );
  }

  if (currentOperation.error) {
    const errorMessage =
      currentOperation.error.message || JSON.stringify(currentOperation.error);
    throw new Error(`${resourceName} creation failed: ${errorMessage}`);
  }
  addLog(`  - ${resourceName} ready.`);
  return currentOperation.response;
}

export async function restoreAgentsIntoAssistant(
  agents: Agent[],
  restoreConfig: Omit<Config, 'accessToken'>,
  addLog: (msg: string) => void,
  promptForSecret: (auth: Authorization, customMessage?: string) => Promise<string | null>
): Promise<void> {
  addLog(`  - Restoring ${agents.length} agent(s)...`);
  for (const agent of agents) {
    const originalAgentId = agent.name.split('/').pop()!;
    addLog(
      `    - Preparing to restore agent: ${agent.displayName} (from original ID: ${originalAgentId}) as a new agent.`
    );

    const buildPayload = (currentAgent: Agent): Partial<Agent> & Record<string, unknown> => {
      const finalStarterPrompts = (currentAgent.starterPrompts || [])
        .map((p) => (p.text ? p.text.trim() : ''))
        .filter((text) => text)
        .map((text) => ({ text }));

      const payload: Partial<Agent> & Record<string, unknown> = {
        displayName: currentAgent.displayName,
        description: currentAgent.description || '',
        icon: currentAgent.icon || undefined,
        starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
        authorizationConfig: currentAgent.authorizationConfig,
        authorizations: !currentAgent.authorizationConfig ? currentAgent.authorizations : undefined,
      };

      const rewriteAuth = (authName: string) => {
        if (!authName) return authName;
        const authId = authName.split('/').pop()!;
        return `projects/${restoreConfig.projectId}/locations/${restoreConfig.appLocation || 'global'}/authorizations/${authId}`;
      };

      if (payload.authorizationConfig?.toolAuthorizations) {
        payload.authorizationConfig.toolAuthorizations =
          payload.authorizationConfig.toolAuthorizations.map(rewriteAuth);
      }
      if (payload.authorizations) {
        payload.authorizations = payload.authorizations.map(rewriteAuth);
      }

      const definitionKeys = Object.keys(currentAgent).filter((key) =>
        key.toLowerCase().includes('agentdefinition')
      );
      for (const key of definitionKeys) {
        if (key === 'adkAgentDefinition') {
          const adkDef = currentAgent.adkAgentDefinition;
          let reasoningEngineStr = adkDef?.provisionedReasoningEngine?.reasoningEngine;
          if (reasoningEngineStr) {
            const parts = reasoningEngineStr.split('/');
            if (parts.length >= 6) {
              const oldReId = parts.pop()!;
              parts.pop();
              const oldReLoc = parts.pop()!;
              parts.pop();
              parts.pop();
              parts.pop();
              reasoningEngineStr = `projects/${restoreConfig.projectId}/locations/${restoreConfig.appLocation || oldReLoc}/reasoningEngines/${oldReId}`;
            }
          }
          payload.adkAgentDefinition = {
            toolSettings: { toolDescription: adkDef?.toolSettings?.toolDescription || '' },
            provisionedReasoningEngine: { reasoningEngine: reasoningEngineStr || '' },
          };
        } else {
          payload[key] = (currentAgent as unknown as Record<string, unknown>)[key];
        }
      }
      return payload;
    };

    const createPayload = buildPayload(agent);
    try {
      const newAgent = await api.createAgent(createPayload, restoreConfig);
      const newAgentId = newAgent.name.split('/').pop()!;
      addLog(
        `      - CREATED: Agent '${agent.displayName}' created successfully with new ID '${newAgentId}'.`
      );

      if (agent.iamPolicy && agent.iamPolicy.bindings) {
        try {
          addLog(`      - Restoring IAM policy bindings for new agent: ${newAgentId}...`);
          const payloadPolicy: IamPolicy = { bindings: agent.iamPolicy.bindings };
          await api.setAgentIamPolicy(newAgent.name, payloadPolicy, restoreConfig);
          addLog(`      - IAM policy successfully restored for agent: ${newAgentId}`);
        } catch (iamErr: unknown) {
          addLog(
            `      - WARNING: Failed to apply IAM policy snapshot for agent ${newAgentId}: ${toErrorMessage(iamErr)}`
          );
        }
      }
    } catch (err: unknown) {
      const errorMsg = toErrorMessage(err);
      if (errorMsg.includes('is used by another agent')) {
        addLog(`      - WARNING: Authorization is in use. Attempting to create a new one.`);
        const originalAuthName =
          agent.authorizationConfig?.toolAuthorizations?.[0] || agent.authorizations?.[0];
        if (!originalAuthName) {
          addLog(
            `      - ERROR: Cannot resolve authorization conflict. Agent in backup has no authorization specified. Skipping agent.`
          );
          continue;
        }

        const originalAuthId = originalAuthName.split('/').pop()!;
        try {
          addLog(
            `        - Fetching details for original authorization '${originalAuthId}' from target environment...`
          );
          let baseAuth: Authorization | null = null;
          try {
            baseAuth = await api.getAuthorization(originalAuthName, restoreConfig);
          } catch {
            addLog(
              `        - WARNING: Could not fetch original authorization from target. Creating a placeholder.`
            );
          }

          const clientSecret = await promptForSecret(
            baseAuth || ({ name: originalAuthName } as Authorization),
            `Authorization '${originalAuthId}' is in use. Enter client secret to create a unique one for this agent:`
          );

          if (!clientSecret) {
            addLog(
              `        - SKIPPED: User canceled secret prompt for new authorization. Skipping agent '${agent.displayName}'.`
            );
            continue;
          }

          const uniqueAuthId = `${originalAgentId}-${Date.now().toString().slice(-4)}`;
          addLog(
            `        - Creating new, unique authorization '${uniqueAuthId}' for this agent...`
          );

          const authPayload: Partial<Authorization> = {
            serverSideOauth2: {
              clientId: baseAuth?.serverSideOauth2?.clientId || 'UNKNOWN_CLIENT_ID',
              authorizationUri:
                baseAuth?.serverSideOauth2?.authorizationUri || 'https://accounts.google.com/o/oauth2/auth',
              tokenUri:
                baseAuth?.serverSideOauth2?.tokenUri || 'https://oauth2.googleapis.com/token',
              clientSecret,
            },
          };

          const newAuthorization = await api.createAuthorization(
            uniqueAuthId,
            authPayload,
            restoreConfig
          );
          addLog(`        - CREATED: New authorization created: ${newAuthorization.name}`);

          createPayload.authorizationConfig = { toolAuthorizations: [newAuthorization.name] };
          delete createPayload.authorizations;
          const newAgent = await api.createAgent(createPayload, restoreConfig);
          const newAgentId = newAgent.name.split('/').pop()!;
          addLog(
            `      - CREATED: Agent '${agent.displayName}' created successfully with new ID '${newAgentId}' and new authorization.`
          );

          if (agent.iamPolicy && agent.iamPolicy.bindings) {
            try {
              const payloadPolicy: IamPolicy = { bindings: agent.iamPolicy.bindings };
              await api.setAgentIamPolicy(newAgent.name, payloadPolicy, restoreConfig);
              addLog(`      - IAM policy successfully restored for agent: ${newAgentId}`);
            } catch (iamErr: unknown) {
              addLog(
                `      - WARNING: Failed to apply IAM policy snapshot for agent ${newAgentId}: ${toErrorMessage(iamErr)}`
              );
            }
          }
        } catch (recoveryErr: unknown) {
          addLog(
            `      - ERROR: Failed during authorization recovery process: ${toErrorMessage(recoveryErr)}. Skipping agent.`
          );
        }
      } else {
        addLog(
          `      - ERROR: Failed to create new agent for '${agent.displayName}': ${errorMsg}`
        );
      }
    }
    await delay(1000);
  }
}

export async function executeRestoreDiscovery(
  data: { collections: Collection[] },
  apiConfig: Omit<Config, 'accessToken'>,
  addLog: (msg: string) => void,
  restoreAssistantFn: (backupData: unknown, useModal?: boolean) => Promise<void>
): Promise<void> {
  addLog(`Restoring ${data.collections.length} Collection(s)...`);
  for (const collection of data.collections) {
    const collectionId = collection.name.split('/').pop()!;
    addLog(`Restoring Collection '${collection.displayName}' (${collectionId})...`);
    const restoreConfig = { ...apiConfig, collectionId };

    try {
      await api.createCollection(
        collectionId,
        { displayName: collection.displayName },
        restoreConfig
      );
      addLog(`  - CREATED: Collection '${collectionId}'`);
    } catch (err: unknown) {
      const errorMsg = toErrorMessage(err);
      if (errorMsg.includes('ALREADY_EXISTS')) {
        addLog(`  - INFO: Collection '${collectionId}' already exists. Proceeding...`);
      } else {
        addLog(`  - ERROR: Failed to create collection '${collectionId}': ${errorMsg}`);
        continue;
      }
    }
    await delay(2000);

    if (collection.engines && collection.engines.length > 0) {
      addLog(
        `  - Restoring ${collection.engines.length} App/Engine(s) into collection '${collectionId}'...`
      );
      for (const engine of collection.engines) {
        const engineId = engine.name.split('/').pop()!;
        addLog(`    - Restoring App/Engine '${engine.displayName}' (${engineId})`);
        const engineRestoreConfig = { ...restoreConfig, appId: engineId };
        try {
          const enginePayload: Partial<AppEngine> = {
            displayName: engine.displayName,
            solutionType: engine.solutionType || 'SOLUTION_TYPE_SEARCH',
            dataStoreIds: engine.dataStoreIds,
            ...(engine.searchEngineConfig && {
              searchEngineConfig: engine.searchEngineConfig,
            }),
            ...(engine.industryVertical && { industryVertical: engine.industryVertical }),
            ...(engine.appType && { appType: engine.appType }),
          };
          const engineOperation = await api.createEngine(
            engineId,
            enginePayload,
            engineRestoreConfig
          );
          await pollOperation(
            engineOperation,
            engineRestoreConfig,
            `App/Engine '${engineId}'`,
            'v1alpha',
            60,
            addLog
          );
          addLog(`      - CREATED: App/Engine '${engineId}' with linked data store.`);
        } catch (err: unknown) {
          const errorMsg = toErrorMessage(err);
          if (errorMsg.includes('ALREADY_EXISTS')) {
            addLog(`      - INFO: App/Engine '${engineId}' already exists. Proceeding...`);
          } else {
            addLog(`      - ERROR: Failed to create App/Engine '${engineId}': ${errorMsg}`);
            continue;
          }
        }

        if (engine.assistants && engine.assistants.length > 0) {
          for (const assistant of engine.assistants) {
            await restoreAssistantFn({ assistant }, false);
          }
        }
      }
    }
  }
}

export async function executeRestoreReasoningEngine(
  data: { engine?: ReasoningEngine },
  apiConfig: Omit<Config, 'accessToken'>,
  addLog: (msg: string) => void
): Promise<void> {
  const engineToRestore = data.engine;
  if (!engineToRestore) return;

  addLog(
    `Restoring Agent Engine '${engineToRestore.displayName}' to ${apiConfig.reasoningEngineLocation}...`
  );
  try {
    const payload: Partial<ReasoningEngine> & Record<string, unknown> = {
      displayName: engineToRestore.displayName,
      spec: engineToRestore.spec,
    };
    const operation = await api.createReasoningEngine(apiConfig, payload);
    addLog(`  - Operation started: ${operation.name}`);

    let currentOp = operation;
    let attempts = 0;
    const maxAttempts = 60;
    while (!currentOp.done) {
      if (attempts++ >= maxAttempts) {
        throw new Error(
          `Agent Engine restore timed out after ${maxAttempts * 10}s waiting for operation to complete. Operation name: ${operation.name}`
        );
      }
      await delay(10000);
      try {
        currentOp = await api.getVertexAiOperation(operation.name, apiConfig);
        addLog(`    - Polling status: ${currentOp.done ? 'DONE' : 'IN_PROGRESS'}`);
      } catch (pollErr: unknown) {
        console.warn('Polling error', pollErr);
      }
    }

    if (currentOp.error) {
      addLog(`  - ERROR: Restore failed: ${currentOp.error.message}`);
      throw new Error(currentOp.error.message);
    } else {
      addLog(
        `  - SUCCESS: Agent Engine '${engineToRestore.displayName}' restored successfully.`
      );
    }
  } catch (err: unknown) {
    addLog(`  - ERROR: Failed to create Agent Engine: ${toErrorMessage(err)}`);
  }
}

export async function executeRestoreDataStores(
  data: { dataStores: DataStore[] },
  apiConfig: Omit<Config, 'accessToken'>,
  addLog: (msg: string) => void
): Promise<void> {
  addLog(
    `Restoring ${data.dataStores.length} Data Store(s) into collection '${apiConfig.collectionId}'...`
  );
  for (const dataStore of data.dataStores) {
    const dsId = dataStore.name.split('/').pop()!;
    try {
      const payload = {
        displayName: dataStore.displayName,
        industryVertical: dataStore.industryVertical,
        solutionTypes: dataStore.solutionTypes,
        contentConfig: dataStore.contentConfig || 'NO_CONTENT',
      };
      await api.createDataStore(dsId, payload, apiConfig);
      addLog(`    - CREATED: Data Store '${dsId}'`);
    } catch (err: unknown) {
      const errorMsg = toErrorMessage(err);
      if (errorMsg.includes('ALREADY_EXISTS')) {
        addLog(`    - INFO: Data Store '${dsId}' already exists. Skipping.`);
      } else {
        addLog(`    - ERROR: Failed to create Data Store '${dsId}': ${errorMsg}`);
      }
    }
    await delay(1000);
  }
}

export interface RestoredNotebookSource {
  title?: string;
  displayName?: string;
  name?: string;
  content?: string;
  text?: string;
  url?: string;
  webScrapeConfig?: { url?: string };
  metadata?: {
    googleDocsMetadata?: { documentId?: string; mimeType?: string };
    youtubeMetadata?: { youtubeUrl?: string; uri?: string; url?: string };
    agentspaceMetadata?: { documentName?: string };
    webpageMetadata?: { webpageUrl?: string };
  };
}

export interface RestoredNotebook {
  name: string;
  displayName?: string;
  title?: string;
  createTime?: string;
  updateTime?: string;
  sources?: RestoredNotebookSource[];
  [key: string]: unknown;
}

export async function executeRestoreNotebooks(
  data: { notebooks: RestoredNotebook[] },
  apiConfig: Omit<Config, 'accessToken'>,
  addLog: (msg: string) => void
): Promise<void> {
  addLog(`Restoring ${data.notebooks.length} Notebooks...`);
  for (const notebook of data.notebooks) {
    const { name: _name, displayName, createTime: _ct, updateTime: _ut, sources, ...rest } = notebook;
    const payload: Record<string, unknown> = { ...rest };
    if (notebook.displayName || notebook.title) {
      payload.title = notebook.displayName || notebook.title;
    }

    try {
      const newNotebook = await api.createNotebook(apiConfig, payload);
      const newNotebookId = newNotebook.name.split('/').pop()!;
      addLog(`    - CREATED: Notebook '${newNotebookId}'`);

      if (notebook.sources && notebook.sources.length > 0) {
        const sourceRequests = notebook.sources.map((source: RestoredNotebookSource) => {
          const sourcePayload: Record<string, unknown> = {};
          const sourceName = source.title || source.displayName || 'Restored Source';
          if (source.metadata?.googleDocsMetadata) {
            sourcePayload.googleDriveContent = {
              sourceName,
              documentId: source.metadata.googleDocsMetadata.documentId,
              mimeType:
                source.metadata.googleDocsMetadata.mimeType ||
                'application/vnd.google-apps.document',
            };
          } else if (source.metadata?.youtubeMetadata) {
            sourcePayload.videoContent = {
              youtubeUrl:
                source.metadata.youtubeMetadata.youtubeUrl ||
                source.metadata.youtubeMetadata.uri ||
                source.metadata.youtubeMetadata.url,
            };
          } else if (source.metadata?.agentspaceMetadata) {
            sourcePayload.agentspaceContent = {
              documentName: source.metadata.agentspaceMetadata.documentName,
            };
          } else if (
            source.metadata?.webpageMetadata ||
            source.webScrapeConfig ||
            source.url
          ) {
            sourcePayload.webContent = {
              sourceName,
              url:
                source.metadata?.webpageMetadata?.webpageUrl ||
                source.url ||
                (source.webScrapeConfig && source.webScrapeConfig.url),
            };
          } else {
            sourcePayload.textContent = {
              sourceName,
              content:
                source.content ||
                source.text ||
                `[Restored Source: ${source.name || sourceName}]`,
            };
          }
          return sourcePayload;
        });

        try {
          await api.batchCreateNotebookSources(apiConfig, newNotebookId, sourceRequests);
          addLog(`      - SUCCESS: Batch created ${sourceRequests.length} sources.`);
        } catch (srcErr: unknown) {
          addLog(
            `      - ERROR: Failed to batch create sources for notebook '${newNotebookId}': ${toErrorMessage(srcErr)}`
          );
        }
      }
    } catch (err: unknown) {
      addLog(
        `    - ERROR: Failed to create notebook '${notebook.displayName}': ${toErrorMessage(err)}`
      );
    }
    await delay(2000);
  }
}

export async function executeRestoreAuthorizations(
  data: { authorizations: Authorization[] },
  apiConfig: Omit<Config, 'accessToken'>,
  addLog: (msg: string) => void,
  promptForSecret: (auth: Authorization, customMessage?: string) => Promise<string | null>
): Promise<void> {
  addLog(`Restoring ${data.authorizations.length} Authorization(s)...`);
  for (const auth of data.authorizations) {
    const authId = auth.name.split('/').pop()!;
    const clientSecret = await promptForSecret(auth);
    if (!clientSecret) {
      addLog(`  - SKIPPED: User canceled secret input for Authorization '${authId}'`);
      continue;
    }
    try {
      const payload = {
        serverSideOauth2: {
          ...auth.serverSideOauth2,
          clientSecret,
        },
      };
      await api.createAuthorization(authId, payload, apiConfig);
      addLog(`  - CREATED: Authorization '${authId}'`);
    } catch (err: unknown) {
      const errorMsg = toErrorMessage(err);
      if (errorMsg.includes('ALREADY_EXISTS')) {
        addLog(`  - INFO: Authorization '${authId}' already exists. Skipping.`);
      } else {
        addLog(`  - ERROR: Failed to create Authorization '${authId}': ${errorMsg}`);
      }
    }
    await delay(1000);
  }
}
