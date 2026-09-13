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

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Agent,
  AppEngine,
  Assistant,
  Authorization,
  Collection,
  Config,
  DataStore,
  ReasoningEngine,
  GcsBucket,
  DiscoverySession,
} from '../types';
import { Notebook } from '../services/api/notebooks';
import * as api from '../services/apiService';
import { validateBackupSchema } from '../components/backup/backupSchemaValidator';
import {
  backupDiscoveryResources,
  backupReasoningEngine,
  backupAssistant,
  backupAgents,
  backupDataStores,
  backupNotebooks,
  backupAuthorizations,
  backupChatHistory,
} from '../services/backup/backupOperations';
import {
  restoreAgentsIntoAssistant,
  executeRestoreDiscovery,
  executeRestoreReasoningEngine,
  executeRestoreDataStores,
  executeRestoreNotebooks,
  executeRestoreAuthorizations,
  RestoredNotebook,
} from '../services/backup/restoreOperations';
import { SelectableItem } from '../components/backup/RestoreSelectionModal';
import { toErrorMessage } from '../utils/errors';
import {
  RestoreOutcome,
  assertRestoreComplete,
  createRestoreOutcome,
  mergeRestoreOutcomes,
  recordFailure,
  summarizeRestoreOutcome,
} from '../services/backup/restoreOutcome';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface BackupRestorePayload {
  type?: string;
  collections?: Collection[];
  engine?: ReasoningEngine | null;
  assistant?: Assistant & { agents?: Agent[] };
  agents?: Agent[];
  dataStores?: DataStore[];
  authorizations?: Authorization[];
  notebooks?: (Notebook | RestoredNotebook)[];
  discoverySessions?: DiscoverySession[];
  reasoningSessions?: DiscoverySession[];
  [key: string]: unknown;
}

/**
 * Returns a RestoreOutcome when the processor restores resources, so the
 * caller can distinguish a complete restore from a partial one. `void` is
 * still allowed for processors that only open a viewer.
 */
export type RestoreProcessor = (
  data: BackupRestorePayload
) => Promise<RestoreOutcome | void>;


export interface UseBackupOperationsProps {
  accessToken: string;
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

export function useBackupOperations({
  accessToken,
  projectNumber,
  setProjectNumber,
}: UseBackupOperationsProps) {
  const [config, setConfig] = useState({
    appLocation: 'global',
    appId: '',
    reasoningEngineLocation: 'us-central1',
    reasoningEngineId: '',
    collectionId: 'default_collection',
    assistantId: 'default_assistant',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // GCS State
  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);

  // Available Backup Files
  const [backupFiles, setBackupFiles] = useState<Record<string, string[]>>({});
  const [selectedRestoreFiles, setSelectedRestoreFiles] = useState<Record<string, string>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const [modalData, setModalData] = useState<{
    section: string;
    title: string;
    items: SelectableItem[];
    processor: RestoreProcessor;
    originalData: BackupRestorePayload;
  } | null>(null);

  const [backupToDelete, setBackupToDelete] = useState<{
    section: string;
    filename: string;
  } | null>(null);
  const [restoreConfirmData, setRestoreConfirmData] = useState<{
    section: string;
    items: SelectableItem[];
    processor: RestoreProcessor;
    originalData: BackupRestorePayload;
  } | null>(null);

  const [chatHistoryArchiveData, setChatHistoryArchiveData] = useState<{
    sessions: DiscoverySession[];
    fileName: string;
  } | null>(null);

  const [secretPrompt, setSecretPrompt] = useState<{
    auth: Authorization;
    resolve: (secret: string | null) => void;
    customMessage?: string;
  } | null>(null);

  const [infoModalKey, setInfoModalKey] = useState<string | null>(null);

  // Dropdown options
  const [apps, setApps] = useState<AppEngine[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [reasoningEngines, setReasoningEngines] = useState<ReasoningEngine[]>([]);
  const [isLoadingReasoningEngines, setIsLoadingReasoningEngines] = useState(false);

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(
    () => ({
      ...config,
      projectId: projectNumber,
    }),
    [config, projectNumber]
  );

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleProjectNumberChange = (newValue: string) => {
    setProjectNumber(newValue);
    setConfig((prev) => ({
      ...prev,
      appId: '',
      reasoningEngineId: '',
    }));
    setSelectedBucket('');
    setBackupFiles({});
  };

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  // Fetch Buckets
  useEffect(() => {
    if (!projectNumber) return;
    async function fetchBuckets() {
      setIsLoadingBuckets(true);
      try {
        const response = await api.listBuckets(projectNumber);
        const fetchedBuckets = response.items || [];
        setBuckets(fetchedBuckets);
        if (fetchedBuckets.length > 0) {
          setSelectedBucket((prev) => prev || fetchedBuckets[0].name);
        }
      } catch (err: unknown) {
        console.error('Failed to fetch buckets:', err);
      } finally {
        setIsLoadingBuckets(false);
      }
    }
    fetchBuckets();
  }, [projectNumber]);

  // Fetch Backup Files from Selected Bucket
  const fetchBackups = useCallback(async () => {
    if (!selectedBucket || !projectNumber) {
      setBackupFiles({});
      return;
    }
    setIsLoadingFiles(true);
    try {
      const response = await api.listGcsObjects(selectedBucket, undefined, projectNumber);
      const items = response.items || [];
      const jsonFiles = items
        .filter((obj) => obj.name && obj.name.endsWith('.json'))
        .map((obj) => obj.name!)
        .sort((a, b) => b.localeCompare(a));

      const filesBySection: Record<string, string[]> = {
        DiscoveryResources: jsonFiles.filter((f) => f.startsWith('agentspace-discovery-backup')),
        ReasoningEngine: jsonFiles.filter((f) => f.includes('-reasoning-engine-')),
        Assistant: jsonFiles.filter((f) => f.includes('-assistant-')),
        Agents: jsonFiles.filter((f) => f.includes('-agents-')),
        DataStores: jsonFiles.filter((f) => f.startsWith('agentspace-data-stores-backup')),
        Authorizations: jsonFiles.filter((f) => f.startsWith('agentspace-authorizations-backup')),
        ChatHistory: jsonFiles.filter((f) => f.startsWith('agentspace-chat-history-backup')),
        NotebookLM: jsonFiles.filter((f) => f.startsWith('agentspace-notebooklm-backup')),
      };

      setBackupFiles(filesBySection);
    } catch (e) {
      console.error('Failed to list backups in bucket:', e);
      setBackupFiles({});
    } finally {
      setIsLoadingFiles(false);
    }
  }, [selectedBucket, projectNumber]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Fetch Apps
  const { projectId, appLocation, reasoningEngineLocation } = apiConfig;
  useEffect(() => {
    if (!projectId) return;
    async function fetchApps() {
      setIsLoadingApps(true);
      try {
        const response = await api.listResources('engines', {
          ...apiConfig,
          projectId,
          appLocation,
        });
        const fetched = response.engines || [];
        setApps(fetched);
        if (fetched.length > 0) {
          const firstId = fetched[0].name.split('/').pop() || '';
          setConfig((p) => (p.appId ? p : { ...p, appId: firstId }));
        }
      } catch (e) {
        console.error('Failed to fetch apps:', e);
      } finally {
        setIsLoadingApps(false);
      }
    }
    fetchApps();
  }, [projectId, appLocation, apiConfig]);

  // Fetch Agent Engines
  useEffect(() => {
    if (!projectId) return;
    async function fetchREs() {
      setIsLoadingReasoningEngines(true);
      try {
        const engines = await api.listAllReasoningEngines({
          ...apiConfig,
          projectId,
          reasoningEngineLocation,
        });
        setReasoningEngines(engines);
        if (engines.length === 1) {
          const id = engines[0].name.split('/').pop() || '';
          setConfig((p) => ({ ...p, reasoningEngineId: id }));
        }
      } catch (e) {
        console.error('Failed to fetch agent engines:', e);
      } finally {
        setIsLoadingReasoningEngines(false);
      }
    }
    fetchREs();
  }, [projectId, reasoningEngineLocation, apiConfig]);

  const executeOperation = async (section: string, operation: () => Promise<void>) => {
    setIsLoading(true);
    setLoadingSection(section);
    setError(null);
    setLogs([]);
    try {
      await operation();
    } catch (err: unknown) {
      const msg = toErrorMessage(err);
      setError(msg || `An unknown error occurred in ${section}.`);
      addLog(`FATAL ERROR: ${msg}`);
    } finally {
      setIsLoading(false);
      setLoadingSection(null);
    }
  };

  // --- Backup Handlers ---
  const handleBackupDiscovery = async () =>
    executeOperation('BackupDiscoveryResources', () =>
      backupDiscoveryResources(apiConfig, selectedBucket, addLog, fetchBackups)
    );

  const handleBackupReasoningEngine = async () =>
    executeOperation('BackupReasoningEngine', () =>
      backupReasoningEngine(apiConfig, selectedBucket, addLog, fetchBackups)
    );

  const handleBackupAssistant = async () =>
    executeOperation('BackupAssistant', () =>
      backupAssistant(apiConfig, selectedBucket, addLog, fetchBackups)
    );

  const handleBackupAgents = async () =>
    executeOperation('BackupAgents', () =>
      backupAgents(apiConfig, selectedBucket, addLog, fetchBackups)
    );

  const handleBackupDataStores = async () =>
    executeOperation('BackupDataStores', () =>
      backupDataStores(apiConfig, selectedBucket, addLog, fetchBackups)
    );

  const handleBackupNotebooks = async () =>
    executeOperation('BackupNotebookLM', () =>
      backupNotebooks(apiConfig, selectedBucket, addLog, fetchBackups)
    );

  const handleBackupAuthorizations = async () =>
    executeOperation('BackupAuthorizations', () =>
      backupAuthorizations(apiConfig, selectedBucket, addLog, fetchBackups)
    );

  const handleBackupChatHistory = async () =>
    executeOperation('BackupChatHistory', () =>
      backupChatHistory(apiConfig, apps, selectedBucket, addLog, fetchBackups)
    );

  // --- Restore Operations ---
  const promptForSecret = (
    auth: Authorization,
    customMessage?: string
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      setSecretPrompt({ auth, resolve, customMessage });
    });
  };

  const processRestoreAssistant = async (
    backupData: { assistant?: { name: string; displayName?: string; generationConfig?: Record<string, unknown>; agents?: Agent[] } },
    useModal = true
  ): Promise<RestoreOutcome> => {
    const outcome = createRestoreOutcome();
    const { assistant } = backupData;
    if (!assistant) {
      addLog('No Assistant data found in the backup.');
      return outcome;
    }

    if (useModal) {
      if (!assistant.agents || assistant.agents.length === 0) {
        addLog('No agents found in the assistant backup file to restore.');
        return outcome;
      }
      const processor = async (data: { assistant?: { agents?: Agent[] } }) => {
        const agentsToRestore = data.assistant?.agents || [];
        const restoreConfig = apiConfig;
        if (!restoreConfig.appId) {
          throw new Error(
            'You must select a target Gemini Enterprise in the configuration before restoring agents from an assistant backup.'
          );
        }
        addLog(
          `Restoring ${agentsToRestore.length} agent(s) into selected assistant '${restoreConfig.assistantId}'...`
        );
        return restoreAgentsIntoAssistant(
          agentsToRestore,
          restoreConfig,
          addLog,
          promptForSecret
        );
      };

      setModalData({
        section: 'Assistant',
        title: 'Select Agents to Restore',
        items: assistant.agents || [],
        originalData: backupData,
        processor,
      });
    } else {
      const assistantToRestore = backupData.assistant;
      if (!assistantToRestore) {
        addLog('  - ERROR: Backup does not contain assistant configuration.');
        recordFailure(
          outcome,
          'Assistant',
          'unknown',
          'Backup does not contain assistant configuration.'
        );
        return outcome;
      }
      const assistantId = assistantToRestore.name.split('/').pop()!;
      const restoreConfig = { ...apiConfig, assistantId };

      const updateExistingAssistant = async () => {
        try {
          const assistantName = `projects/${restoreConfig.projectId}/locations/${restoreConfig.appLocation}/collections/${restoreConfig.collectionId}/engines/${restoreConfig.appId}/assistants/${assistantId}`;
          const payload: Record<string, unknown> = {};
          const updateMask: string[] = [];
          if (assistantToRestore.displayName) {
            payload.displayName = assistantToRestore.displayName;
            updateMask.push('displayName');
          }
          if (assistantToRestore.generationConfig) {
            payload.generationConfig = assistantToRestore.generationConfig;
            updateMask.push('generationConfig');
          }
          if (updateMask.length > 0) {
            await api.updateAssistant(assistantName, payload, updateMask, restoreConfig);
            addLog(`  - UPDATED: Assistant '${assistantId}' settings applied.`);
          }
        } catch (updateErr: unknown) {
          const reason = toErrorMessage(updateErr);
          addLog(`  - ERROR: Failed to update assistant '${assistantId}': ${reason}.`);
          // The assistant keeps its old displayName/generationConfig, so the
          // restore did not actually reproduce the backed-up configuration.
          recordFailure(outcome, 'Assistant', assistantId, reason);
        }
      };

      if (assistantId === 'default_assistant') {
        await updateExistingAssistant();
      } else {
        try {
          await api.createAssistant(
            assistantId,
            { displayName: assistantToRestore.displayName },
            restoreConfig
          );
          addLog(`  - CREATED: Assistant '${assistantId}'`);
        } catch (err: unknown) {
          const errorMsg = toErrorMessage(err);
          if (errorMsg.includes('ALREADY_EXISTS')) {
            await updateExistingAssistant();
          } else {
            throw err;
          }
        }
      }
      await delay(2000);
      if (assistantToRestore.agents && assistantToRestore.agents.length > 0) {
        mergeRestoreOutcomes(
          outcome,
          await restoreAgentsIntoAssistant(
            assistantToRestore.agents,
            restoreConfig,
            addLog,
            promptForSecret
          )
        );
      }
    }
    return outcome;
  };

  const processRestoreDiscovery = async (backupData: { collections?: Collection[] }) => {
    if (!backupData.collections || backupData.collections.length === 0) {
      addLog('No collections found in backup file to restore.');
      return;
    }
    setModalData({
      section: 'DiscoveryResources',
      title: 'Select Collections to Restore',
      items: backupData.collections,
      originalData: backupData,
      processor: (data) =>
        executeRestoreDiscovery(
          { collections: data.collections || [] },
          apiConfig,
          addLog,
          processRestoreAssistant
        ),
    });
  };

  const processRestoreReasoningEngine = async (backupData: { engine?: ReasoningEngine }) => {
    const { engine } = backupData;
    if (!engine) {
      addLog('No Agent Engine data found in backup file.');
      return;
    }
    setModalData({
      section: 'ReasoningEngine',
      title: 'Confirm Restore Agent Engine',
      items: [engine],
      originalData: backupData,
      processor: (data) => executeRestoreReasoningEngine({ engine: data.engine || undefined }, apiConfig, addLog),
    });
  };

  const processRestoreAgents = async (backupData: { agents?: Agent[] }) => {
    const { agents } = backupData;
    if (!agents) {
      addLog('No agent data found in the backup.');
      return;
    }
    const restoreConfig = apiConfig;
    if (!restoreConfig.appId) {
      throw new Error(
        'You must select a target Gemini Enterprise in the configuration before restoring agents.'
      );
    }

    const itemsWithTypes = agents.map((agent: Agent) => {
      let agentType = 'Low Code';
      if (agent.adkAgentDefinition) agentType = 'ADK';
      else if (agent.a2aAgentDefinition) agentType = 'A2A';

      let disabled = false;
      let disabledReason: string | undefined = undefined;
      const nameParts = agent.name.split('/');
      const originalProject = nameParts.length >= 2 ? nameParts[1] : '';
      const originalAppId = nameParts.length >= 8 ? nameParts[7] : '';
      const isCrossInstance =
        originalProject !== restoreConfig.projectId || originalAppId !== restoreConfig.appId;

      if (isCrossInstance && (agentType === 'ADK' || agentType === 'A2A')) {
        disabled = true;
        disabledReason = 'Cross-instance RESTORE is only supported for Low-Code agents.';
      }
      return { ...agent, agentType, disabled, disabledReason };
    });

    setModalData({
      section: 'Agents',
      title: 'Select Agents to Restore',
      items: itemsWithTypes,
      originalData: backupData,
      processor: async (data: BackupRestorePayload) => {
        await restoreAgentsIntoAssistant(data.agents || [], restoreConfig, addLog, promptForSecret);
      },
    });
  };

  const processRestoreDataStores = async (backupData: { dataStores?: DataStore[] }) => {
    setModalData({
      section: 'DataStores',
      title: 'Select Data Stores to Restore',
      items: backupData.dataStores || [],
      originalData: backupData,
      processor: (data) => executeRestoreDataStores({ dataStores: data.dataStores || [] }, apiConfig, addLog),
    });
  };

  const processRestoreNotebooks = async (backupData: { notebooks?: RestoredNotebook[] }) => {
    if (!backupData.notebooks || backupData.notebooks.length === 0) {
      addLog('No notebooks found in backup file to restore.');
      return;
    }

    const displayableNotebooks = backupData.notebooks.map((notebook: RestoredNotebook) => ({
      ...notebook,
      displayName:
        notebook.displayName ||
        notebook.title ||
        notebook.name?.split('/').pop() ||
        'Unnamed Notebook',
    }));

    setModalData({
      section: 'NotebookLM',
      title: 'Select Notebooks to Restore',
      items: displayableNotebooks,
      originalData: { ...backupData, notebooks: displayableNotebooks },
      processor: (data) =>
        executeRestoreNotebooks(
          { notebooks: (data.notebooks as RestoredNotebook[]) || [] },
          apiConfig,
          addLog
        ),
    });
  };

  const processRestoreAuthorizations = async (backupData: { authorizations?: Authorization[] }) => {
    setModalData({
      section: 'Authorizations',
      title: 'Select Authorizations to Restore',
      items: backupData.authorizations || [],
      originalData: backupData,
      processor: (data) =>
        executeRestoreAuthorizations(
          { authorizations: data.authorizations || [] },
          apiConfig,
          addLog,
          promptForSecret
        ),
    });
  };

  const handleDeleteBackup = (section: string) => {
    const filename = selectedRestoreFiles[section];
    if (!filename || !selectedBucket) {
      setError(`Please select a bucket and a backup file for ${section} to delete.`);
      return;
    }
    setBackupToDelete({ section, filename });
  };

  const confirmDeleteBackup = async () => {
    if (!backupToDelete || !selectedBucket) return;
    const { section, filename } = backupToDelete;

    executeOperation(`DeleteBackup${section}`, async () => {
      addLog(`Deleting ${filename} from ${selectedBucket}...`);
      await api.deleteGcsObject(selectedBucket, filename, apiConfig.projectId);
      addLog(`Deleted ${filename} successfully.`);
      await fetchBackups();
    });
    setBackupToDelete(null);
  };

  const handleRestore = async (section: string, processor: RestoreProcessor) => {
    const filename = selectedRestoreFiles[section];
    if (!filename || !selectedBucket) {
      setError(`Please select a bucket and a backup file for ${section}.`);
      return;
    }

    const sectionName = section.replace(/[A-Z]/g, ' $&').trim();
    executeOperation(`Restore${section}`, async () => {
      addLog(`Downloading file: gs://${selectedBucket}/${filename}...`);

      const fileContent = await api.getGcsObjectContent(
        selectedBucket,
        filename,
        apiConfig.projectId
      );
      let backupData: BackupRestorePayload;
      try {
        backupData = JSON.parse(fileContent);
      } catch (parseErr: unknown) {
        throw new Error(
          `Failed to parse backup JSON from gs://${selectedBucket}/${filename}: ${toErrorMessage(parseErr)}`
        );
      }

      const validation = validateBackupSchema(backupData, section);
      if (!validation.valid) {
        addLog(`      - ERROR: Backup schema validation failed for ${section}:`);
        validation.errors.forEach((err) => addLog(`        * ${err}`));
        throw new Error(`Invalid backup schema for ${section}:\n- ${validation.errors.join('\n- ')}`);
      }

      if (section === 'ChatHistory') {
        const sessions = [
          ...(backupData.discoverySessions || []),
          ...(backupData.reasoningSessions || []),
        ];
        setChatHistoryArchiveData({ sessions, fileName: filename });
        addLog(`Opened Chat History Archive Viewer for ${filename}.`);
      } else {
        const outcome = await processor(backupData);
        if (outcome) {
          addLog(
            `Restore process for ${sectionName} finished: ${summarizeRestoreOutcome(outcome)}.`
          );
          for (const failure of outcome.failed) {
            addLog(
              `  - NOT RESTORED: ${failure.resourceType} '${failure.resourceId}' -- ${failure.reason}`
            );
          }
          assertRestoreComplete(outcome, sectionName);
          return;
        }
      }

      addLog(`Restore process for ${sectionName} finished.`);
    });
  };

  const handleConfirmRestore = (
    section: string,
    items: SelectableItem[],
    processor: RestoreProcessor,
    originalData: BackupRestorePayload
  ) => {
    setModalData(null);
    setRestoreConfirmData({ section, items, processor, originalData });
  };

  const executeConfirmedRestore = () => {
    if (!restoreConfirmData) return;
    const { section, items, processor, originalData } = restoreConfirmData;
    setRestoreConfirmData(null);

    const sectionName = section.replace(/[A-Z]/g, ' $&').trim();
    executeOperation(`Restore${section}`, async () => {
      const dataToRestore = { ...originalData };

      switch (section) {
        case 'DiscoveryResources':
          dataToRestore.collections = (originalData.collections || []).filter((c: Collection) =>
            items.some((item) => item.name === c.name)
          );
          break;
        case 'ReasoningEngine':
          dataToRestore.engine = items.length > 0 ? (items[0] as ReasoningEngine) : null;
          break;
        case 'Assistant':
          if (dataToRestore.assistant && originalData.assistant?.agents) {
            dataToRestore.assistant.agents = originalData.assistant.agents.filter((a: Agent) =>
              items.some((item) => item.name === a.name)
            );
          }
          break;
        case 'Agents':
          dataToRestore.agents = (originalData.agents || []).filter((a: Agent) =>
            items.some((item) => item.name === a.name)
          );
          break;
        case 'DataStores':
          dataToRestore.dataStores = (originalData.dataStores || []).filter((ds: DataStore) =>
            items.some((item) => item.name === ds.name)
          );
          break;
        case 'Authorizations':
          dataToRestore.authorizations = (originalData.authorizations || []).filter((auth: Authorization) =>
            items.some((item) => item.name === auth.name)
          );
          break;
        case 'NotebookLM':
          dataToRestore.notebooks = (originalData.notebooks || []).filter((nb: { name?: string }) =>
            items.some((item) => item.name === nb.name)
          );
          break;
        default:
          throw new Error(`Unknown section type for selective restore: ${section}`);
      }

      addLog(`Starting restore of ${items.length} selected ${sectionName}...`);
      const outcome = await processor(dataToRestore);
      if (outcome) {
        addLog(`Restore process for ${sectionName} finished: ${summarizeRestoreOutcome(outcome)}.`);
        for (const failure of outcome.failed) {
          addLog(`  - NOT RESTORED: ${failure.resourceType} '${failure.resourceId}' -- ${failure.reason}`);
        }
        // Throws when anything failed, so executeOperation surfaces an error
        // state. Previously a restore that created nothing still ended with
        // "finished" and no error, which is indistinguishable from success
        // during a disaster recovery.
        assertRestoreComplete(outcome, sectionName);
      } else {
        addLog(`Restore process for ${sectionName} finished.`);
      }
    });
  };

  const handleDownloadBackup = async (section: string) => {
    setLoadingSection(`DownloadBackup${section}`);
    const fileName = selectedRestoreFiles[section];
    if (!selectedBucket || !fileName) {
      addLog(`ERROR: No bucket or file selected for download in section ${section}.`);
      setLoadingSection(null);
      return;
    }

    addLog(`Downloading backup file: ${fileName}...`);
    try {
      const blob = await api.downloadGcsObject(selectedBucket, fileName, accessToken);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      addLog(`Download of ${fileName} initiated.`);
    } catch (err: unknown) {
      const msg = toErrorMessage(err);
      addLog(`ERROR: Failed to download ${fileName}: ${msg}`);
      setError(`Failed to download backup: ${msg}`);
    } finally {
      setLoadingSection(null);
    }
  };

  const handleSecretSubmit = (secret: string) => {
    secretPrompt?.resolve(secret);
    setSecretPrompt(null);
  };

  const handleSecretClose = () => {
    secretPrompt?.resolve(null);
    setSecretPrompt(null);
  };

  const handleBackupSelectionChange = (section: string, value: string) => {
    setSelectedRestoreFiles((prev) => ({ ...prev, [section]: value }));
  };

  return {
    config,
    setConfig,
    handleConfigChange,
    handleProjectNumberChange,
    apiConfig,
    isLoading,
    loadingSection,
    error,
    logs,
    buckets,
    selectedBucket,
    setSelectedBucket,
    isLoadingBuckets,
    backupFiles,
    selectedRestoreFiles,
    isLoadingFiles,
    modalData,
    setModalData,
    backupToDelete,
    setBackupToDelete,
    restoreConfirmData,
    setRestoreConfirmData,
    chatHistoryArchiveData,
    setChatHistoryArchiveData,
    secretPrompt,
    infoModalKey,
    setInfoModalKey,
    apps,
    isLoadingApps,
    reasoningEngines,
    isLoadingReasoningEngines,
    handleBackupDiscovery,
    handleBackupReasoningEngine,
    handleBackupAssistant,
    handleBackupAgents,
    handleBackupDataStores,
    handleBackupAuthorizations,
    handleBackupNotebooks,
    handleBackupChatHistory,
    processRestoreDiscovery,
    processRestoreReasoningEngine,
    processRestoreAssistant,
    processRestoreAgents,
    processRestoreDataStores,
    processRestoreAuthorizations,
    processRestoreNotebooks,
    handleRestore,
    handleConfirmRestore,
    executeConfirmedRestore,
    handleDeleteBackup,
    confirmDeleteBackup,
    handleDownloadBackup,
    handleSecretSubmit,
    handleSecretClose,
    handleBackupSelectionChange,
  };
}
