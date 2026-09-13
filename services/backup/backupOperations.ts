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
  AppEngine,
  Assistant,
  Collection,
  Config,
  DataStore,
  DiscoverySession,
  ReasoningEngineSession,
} from '../../types';
import * as api from '../apiService';
import { Notebook, NotebookSource } from '../api/notebooks';
import { toErrorMessage } from '../../utils/errors';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function uploadBackupToGcs(
  data: object,
  filenamePrefix: string,
  selectedBucket: string,
  projectId: string,
  addLog: (msg: string) => void,
  onUploaded?: () => Promise<void>
): Promise<void> {
  if (!selectedBucket) {
    throw new Error('No GCS bucket selected for backup.');
  }
  const jsonString = JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${filenamePrefix}-${timestamp}.json`;
  const file = new File([jsonString], filename, { type: 'application/json' });

  addLog(`Uploading backup to gs://${selectedBucket}/${filename}...`);
  await api.uploadFileToGcs(selectedBucket, filename, file, projectId);
  addLog(`Upload successful.`);

  if (onUploaded) {
    await onUploaded();
  }
}

export async function backupDiscoveryResources(
  apiConfig: Omit<Config, 'accessToken'>,
  selectedBucket: string,
  addLog: (msg: string) => void,
  onUploaded: () => Promise<void>
): Promise<void> {
  addLog('Starting Discovery Resources backup for default_collection...');
  const collections: Collection[] = [];
  let colToken: string | undefined = undefined;
  do {
    const collectionsResponse = await api.listResources('collections', apiConfig, colToken);
    collections.push(
      ...(collectionsResponse.collections || []).filter((c) =>
        c.name.endsWith('/default_collection')
      )
    );
    colToken = collectionsResponse.nextPageToken;
  } while (colToken);

  if (collections.length === 0) {
    addLog('Warning: default_collection not found in this location.');
    return;
  }

  for (const collection of collections) {
    const collectionId = collection.name.split('/').pop()!;
    const engines: AppEngine[] = [];
    let engToken: string | undefined = undefined;
    do {
      const enginesResponse = await api.listResources(
        'engines',
        { ...apiConfig, collectionId },
        engToken
      );
      engines.push(...(enginesResponse.engines || []));
      engToken = enginesResponse.nextPageToken;
    } while (engToken);
    collection.engines = engines;

    for (const engine of engines) {
      const appId = engine.name.split('/').pop()!;
      const assistants: Assistant[] = [];
      let asstToken: string | undefined = undefined;
      do {
        const assistantsResponse = await api.listResources(
          'assistants',
          { ...apiConfig, collectionId, appId },
          asstToken
        );
        assistants.push(
          ...(assistantsResponse.assistants || []).filter((a) =>
            a.name.endsWith('/default_assistant')
          )
        );
        asstToken = assistantsResponse.nextPageToken;
      } while (asstToken);
      engine.assistants = assistants;
    }
  }

  const backupData = {
    type: 'DiscoveryResources',
    createdAt: new Date().toISOString(),
    sourceConfig: apiConfig,
    collections,
  };
  await uploadBackupToGcs(
    backupData,
    'agentspace-discovery-backup',
    selectedBucket,
    apiConfig.projectId,
    addLog,
    onUploaded
  );
  addLog(`Backup complete! Found and backed up 'default_collection'.`);
}

export async function backupReasoningEngine(
  apiConfig: Omit<Config, 'accessToken'>,
  selectedBucket: string,
  addLog: (msg: string) => void,
  onUploaded: () => Promise<void>
): Promise<void> {
  if (!apiConfig.reasoningEngineId) {
    throw new Error('Target Agent Engine ID must be selected.');
  }
  const engineName = `projects/${apiConfig.projectId}/locations/${apiConfig.reasoningEngineLocation}/reasoningEngines/${apiConfig.reasoningEngineId}`;
  addLog(`Starting backup for Agent Engine: ${engineName}...`);

  const engine = await api.getReasoningEngine(engineName, apiConfig);

  const backupData = {
    type: 'ReasoningEngine',
    createdAt: new Date().toISOString(),
    sourceConfig: apiConfig,
    engine,
  };
  await uploadBackupToGcs(
    backupData,
    `agentspace-reasoning-engine-${apiConfig.reasoningEngineId}-backup`,
    selectedBucket,
    apiConfig.projectId,
    addLog,
    onUploaded
  );
  addLog(`Backup complete! Agent Engine '${engine.displayName}' saved.`);
}

export async function backupAssistant(
  apiConfig: Omit<Config, 'accessToken'>,
  selectedBucket: string,
  addLog: (msg: string) => void,
  onUploaded: () => Promise<void>
): Promise<void> {
  if (!apiConfig.appId) {
    throw new Error('Gemini Enterprise ID must be set to back up an assistant.');
  }
  addLog(`Starting backup for Assistant: ${apiConfig.assistantId}...`);
  const assistantName = `projects/${apiConfig.projectId}/locations/${apiConfig.appLocation}/collections/${apiConfig.collectionId}/engines/${apiConfig.appId}/assistants/${apiConfig.assistantId}`;

  const assistant = await api.getAssistant(assistantName, apiConfig);

  const agents: Agent[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const agentsResponse = await api.listResources('agents', apiConfig, pageToken);
    agents.push(...(agentsResponse.agents || []));
    pageToken = agentsResponse.nextPageToken;
  } while (pageToken);

  for (const agent of agents) {
    try {
      const policy = await api.getAgentIamPolicy(agent.name, apiConfig);
      if (policy) {
        agent.iamPolicy = policy;
      }
    } catch (e) {
      addLog(
        `  - Warning: Failed to backup IAM policy for agent ${agent.name}: ${toErrorMessage(e)}`
      );
    }
  }
  assistant.agents = agents;

  const backupData = {
    type: 'Assistant',
    createdAt: new Date().toISOString(),
    sourceConfig: apiConfig,
    assistant,
  };
  await uploadBackupToGcs(
    backupData,
    `agentspace-assistant-${apiConfig.assistantId}-backup`,
    selectedBucket,
    apiConfig.projectId,
    addLog,
    onUploaded
  );
  addLog(
    `Backup complete! Assistant '${assistant.displayName}' and its ${assistant.agents.length} agents saved.`
  );
}

export async function backupAgents(
  apiConfig: Omit<Config, 'accessToken'>,
  selectedBucket: string,
  addLog: (msg: string) => void,
  onUploaded: () => Promise<void>
): Promise<void> {
  if (!apiConfig.appId) {
    throw new Error('Gemini Enterprise ID must be set to back up agents.');
  }
  addLog(`Starting backup for agents in Assistant: ${apiConfig.assistantId}...`);

  const agents: Agent[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const agentsResponse = await api.listResources('agents', apiConfig, pageToken);
    agents.push(...(agentsResponse.agents || []));
    pageToken = agentsResponse.nextPageToken;
  } while (pageToken);

  for (const agent of agents) {
    try {
      const policy = await api.getAgentIamPolicy(agent.name, apiConfig);
      if (policy) {
        agent.iamPolicy = policy;
      }
    } catch (e) {
      addLog(
        `  - Warning: Failed to backup IAM policy for agent ${agent.name}: ${toErrorMessage(e)}`
      );
    }
  }

  const backupData = {
    type: 'Agents',
    createdAt: new Date().toISOString(),
    sourceConfig: apiConfig,
    agents,
  };
  await uploadBackupToGcs(
    backupData,
    `agentspace-agents-${apiConfig.assistantId}-backup`,
    selectedBucket,
    apiConfig.projectId,
    addLog,
    onUploaded
  );
  addLog(`Backup complete! Found ${agents.length} agents.`);
}

export async function backupDataStores(
  apiConfig: Omit<Config, 'accessToken'>,
  selectedBucket: string,
  addLog: (msg: string) => void,
  onUploaded: () => Promise<void>
): Promise<void> {
  addLog('Starting Data Stores backup for default_collection...');
  addLog(
    '  - Note: Backing up Data Store configurations (raw document contents and connector data must be re-synced upon restore).'
  );
  const dataStores: DataStore[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const dataStoresResponse = await api.listResources('dataStores', apiConfig, pageToken);
    dataStores.push(...(dataStoresResponse.dataStores || []));
    pageToken = dataStoresResponse.nextPageToken;
  } while (pageToken);

  const backupData = {
    type: 'DataStores',
    createdAt: new Date().toISOString(),
    sourceConfig: apiConfig,
    dataStores,
  };
  await uploadBackupToGcs(
    backupData,
    'agentspace-data-stores-backup',
    selectedBucket,
    apiConfig.projectId,
    addLog,
    onUploaded
  );
  addLog(`Backup complete! Found ${dataStores.length} data stores.`);
}

export async function backupNotebooks(
  apiConfig: Omit<Config, 'accessToken'>,
  selectedBucket: string,
  addLog: (msg: string) => void,
  onUploaded: () => Promise<void>
): Promise<void> {
  addLog(`Starting backup for Notebooks in ${apiConfig.appLocation}...`);
  const notebooks: Notebook[] = [];
  let nbToken: string | undefined = undefined;
  do {
    const response = await api.listNotebooks(apiConfig, nbToken);
    notebooks.push(...(response.notebooks || []));
    nbToken = response.nextPageToken;
  } while (nbToken);

  addLog(`Found ${notebooks.length} notebooks. Fetching detailed sources...`);
  const fullNotebooks: Notebook[] = [];

  for (const nb of notebooks) {
    const notebookId = nb.name.split('/').pop()!;
    try {
      const rawNotebook = await api.getNotebook(apiConfig, notebookId);
      const fullSources: NotebookSource[] = [];
      for (const source of rawNotebook.sources || []) {
        const sourceId = source.name?.split('/').pop() || '';
        try {
          const fullSource = await api.getNotebookSource(apiConfig, notebookId, sourceId);
          fullSources.push(fullSource);
        } catch (sourceErr: unknown) {
          addLog(
            `  - Warning: Could not fetch details for source ${sourceId} in notebook ${notebookId}: ${toErrorMessage(sourceErr)}`
          );
          fullSources.push(source);
        }
      }
      rawNotebook.sources = fullSources;
      fullNotebooks.push(rawNotebook);
      addLog(
        `  - Fetched details for: ${rawNotebook.displayName || notebookId} (${fullSources.length} sources)`
      );
    } catch (nbErr: unknown) {
      addLog(`  - Error fetching details for notebook ${notebookId}: ${toErrorMessage(nbErr)}`);
    }
    await delay(500);
  }

  const backupData = {
    type: 'NotebookLM',
    createdAt: new Date().toISOString(),
    sourceConfig: apiConfig,
    notebooks: fullNotebooks,
  };
  await uploadBackupToGcs(
    backupData,
    'agentspace-notebooklm-backup',
    selectedBucket,
    apiConfig.projectId,
    addLog,
    onUploaded
  );
  addLog(`Backup complete! Found ${fullNotebooks.length} notebooks.`);
}

export async function backupAuthorizations(
  apiConfig: Omit<Config, 'accessToken'>,
  selectedBucket: string,
  addLog: (msg: string) => void,
  onUploaded: () => Promise<void>
): Promise<void> {
  addLog('Starting Authorizations backup...');
  const response = await api.listAuthorizations(apiConfig);
  const authorizations = response.authorizations || [];

  const backupData = {
    type: 'Authorizations',
    createdAt: new Date().toISOString(),
    sourceConfig: apiConfig,
    authorizations,
  };
  await uploadBackupToGcs(
    backupData,
    'agentspace-authorizations-backup',
    selectedBucket,
    apiConfig.projectId,
    addLog,
    onUploaded
  );
  addLog(`Backup complete! Found ${authorizations.length} authorizations.`);
}

export async function backupChatHistory(
  apiConfig: Omit<Config, 'accessToken'>,
  apps: AppEngine[],
  selectedBucket: string,
  addLog: (msg: string) => void,
  onUploaded: () => Promise<void>
): Promise<void> {
  addLog('Starting Chat History backup...');
  const discoverySessions: DiscoverySession[] = [];
  try {
    const engines =
      apps.length > 0 ? apps : (await api.listResources('engines', apiConfig)).engines || [];
    for (const engine of engines) {
      const appId = engine.name.split('/').pop()!;
      const appConfig = { ...apiConfig, appId };
      let pageToken: string | undefined = undefined;
      do {
        const sessionsResp = await api.listDiscoverySessions(appConfig, pageToken);
        const sessions = sessionsResp.sessions || [];
        if (sessions.length > 0) {
          addLog(`  - Found ${sessions.length} sessions in App '${engine.displayName || appId}'`);
          const chunkSize = 10;
          for (let i = 0; i < sessions.length; i += chunkSize) {
            const chunk = sessions.slice(i, i + chunkSize);
            await Promise.all(
              chunk.map(async (session: DiscoverySession) => {
                try {
                  const fullSession = await api.getDiscoverySession(session.name, appConfig);
                  discoverySessions.push(fullSession);
                } catch (e) {
                  discoverySessions.push(session);
                }
              })
            );
            await delay(100);
          }
        }
        pageToken = sessionsResp.nextPageToken;
      } while (pageToken);
    }
  } catch (e: unknown) {
    addLog(`Error fetching Discovery sessions: ${toErrorMessage(e)}`);
  }

  addLog('Fetching Agent Engine sessions...');
  const reasoningSessions: (ReasoningEngineSession | { name: string })[] = [];
  try {
    const engines = await api.listAllReasoningEngines(apiConfig);
    for (const engine of engines) {
      try {
        const sessions = await api.listAllReasoningEngineSessions(engine.name, apiConfig);
        if (sessions.length > 0) {
          addLog(`  - Found ${sessions.length} sessions in Agent Engine '${engine.displayName}'`);
          for (const session of sessions) {
            try {
              const fullSession = await api.getReasoningEngineSession(session.name, apiConfig);
              reasoningSessions.push(fullSession);
            } catch {
              reasoningSessions.push(session);
            }
          }
        }
      } catch {
        // ignore
      }
    }
  } catch (e: unknown) {
    addLog(`Error fetching Agent Engine sessions: ${toErrorMessage(e)}`);
  }

  const totalSessions = discoverySessions.length + reasoningSessions.length;
  if (totalSessions === 0) {
    addLog('No chat sessions found to backup.');
    return;
  }

  const backupData = {
    type: 'ChatHistory',
    createdAt: new Date().toISOString(),
    sourceConfig: apiConfig,
    discoverySessions,
    reasoningSessions,
  };
  await uploadBackupToGcs(
    backupData,
    'agentspace-chat-history-backup',
    selectedBucket,
    apiConfig.projectId,
    addLog,
    onUploaded
  );
  addLog(`Backup complete! Saved ${totalSessions} sessions.`);
}
