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


import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Agent, AppEngine, Assistant, Authorization, Collection, Config, DataStore, ReasoningEngine, GcsBucket, GcsObject, DiscoverySession } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import RestoreSelectionModal from '../components/backup/RestoreSelectionModal';
import ChatHistoryArchiveViewer from '../components/backup/ChatHistoryArchiveViewer';
import ClientSecretPrompt from '../components/backup/ClientSecretPrompt';
import CurlInfoModal from '../components/CurlInfoModal';
import CloudConsoleButton from '../components/CloudConsoleButton';

interface BackupPageProps {
  accessToken: string;
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Sub-Components ---
const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);


interface BackupRestoreCardProps {
  section: string;
  title: string;
  onBackup: () => Promise<void>;
  onRestore: (section: string, processor: (data: any) => Promise<void>) => Promise<void>;
  onDeleteBackup?: (section: string) => Promise<void>;
  onDownloadBackup?: (section: string) => Promise<void>;
  processor: (data: any) => Promise<void>;
  availableBackups: string[];
  selectedBackup: string;
  onBackupSelectionChange: (section: string, value: string) => void;
  loadingSection: string | null;
  isGloballyLoading: boolean;
  onShowInfo: (infoKey: string) => void;
  scope: 'Global' | 'User Specific';
}

const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({ 
  section, 
  title, 
  onBackup, 
  onRestore, 
  onDeleteBackup,
  onDownloadBackup,
  processor, 
  availableBackups,
  selectedBackup,
  onBackupSelectionChange,
  loadingSection,
  isGloballyLoading,
  onShowInfo,
  scope
}) => {
    const isBackupLoading = loadingSection === `Backup${section}`;
    const isRestoreLoading = loadingSection === `Restore${section}`;
  const isDeleteLoading = loadingSection === `DeleteBackup${section}`;
  const isDownloadLoading = loadingSection === `DownloadBackup${section}`;
  const isThisCardLoading = isBackupLoading || isRestoreLoading || isDeleteLoading || isDownloadLoading;

    return (
      <div className={`bg-gray-900 rounded-lg p-4 shadow-lg flex flex-col border transition-colors ${isThisCardLoading ? 'border-blue-500' : 'border-gray-700'}`}>
        <div className="flex flex-col items-center mb-4">
          <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
          <span className={`text-[10px] px-2 py-0.5 mt-1 rounded-full uppercase tracking-wider font-semibold ${scope === 'Global' ? 'bg-purple-900/80 text-purple-300 border border-purple-700/50' : 'bg-emerald-900/80 text-emerald-300 border border-emerald-700/50'}`}>
            {scope}
          </span>
        </div>
        
        {/* Backup Action */}
        <div className="flex-1 mb-4">
          <div className="flex items-center gap-2">
            <button 
                onClick={onBackup} 
                disabled={isGloballyLoading} 
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center h-10"
            >
                {isBackupLoading ? (
                <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Backing up to GCS...
                </>
                ) : 'Backup'}
            </button>
            <button onClick={() => onShowInfo(`Backup:${section}`)} title="Show backup API command" className="p-2 text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-md shrink-0 h-10">
                <InfoIcon />
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="relative flex items-center">
          <div className="flex-grow border-t border-gray-700"></div>
          <span className="flex-shrink mx-4 text-gray-500 text-xs uppercase">Or</span>
          <div className="flex-grow border-t border-gray-700"></div>
        </div>

        {/* Restore Action */}
        <div className="flex-1 mt-4">
          <p className="text-xs text-center text-gray-400 mb-2">Restore from GCS.</p>
          <div className="flex items-center gap-2">
            <select
                value={selectedBackup}
                onChange={(e) => onBackupSelectionChange(section, e.target.value)}
                disabled={isGloballyLoading}
                className="block w-full text-xs bg-gray-700 border border-gray-600 rounded-l-md text-white p-2 h-8 disabled:opacity-50"
            >
                <option value="">-- Select Backup File --</option>
                {availableBackups.map(file => (
                    <option key={file} value={file}>{file}</option>
                ))}
            </select>
            <div className="flex shrink-0">
                <button
                onClick={() => onRestore(section, processor)}
                disabled={isGloballyLoading || !selectedBackup}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center h-8"
                >
                {isRestoreLoading ? (
                    <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    </>
                ) : 'Restore'}
                </button>
                 <button onClick={() => onShowInfo(`Restore:${section}`)} title="Show restore API command" className="p-1.5 text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-r-md h-8">
                    <InfoIcon />
                </button>
              {onDownloadBackup && (
                <button
                  onClick={() => onDownloadBackup(section)}
                  disabled={isGloballyLoading || !selectedBackup}
                  className="ml-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center rounded-md h-8"
                  title="Download selected backup JSON"
                >
                  {isDownloadLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  ) : 'Download'}
                </button>
              )}
              {onDeleteBackup && (
                <button
                  onClick={() => onDeleteBackup(section)}
                  disabled={isGloballyLoading || !selectedBackup}
                  className="ml-2 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center rounded-md h-8"
                  title="Delete selected backup"
                >
                  {isDeleteLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  ) : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
};


// --- Main Page Component ---

const BackupPage: React.FC<BackupPageProps> = ({ accessToken, projectNumber, setProjectNumber }) => {
  const [config, setConfig] = useState({
    appLocation: 'global',
    appId: '',
    reasoningEngineLocation: 'us-central1',
    reasoningEngineId: '', // Added Agent Engine selection
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
  
  // Available Backup Files (Keyed by section prefix)
  const [backupFiles, setBackupFiles] = useState<Record<string, string[]>>({});
  const [selectedRestoreFiles, setSelectedRestoreFiles] = useState<Record<string, string>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const [modalData, setModalData] = useState<{
    section: string;
    title: string;
    items: any[];
    processor: (data: any) => Promise<void>;
    originalData: any;
  } | null>(null);

  const [chatHistoryArchiveData, setChatHistoryArchiveData] = useState<{ sessions: any[]; fileName: string } | null>(null);

  const [secretPrompt, setSecretPrompt] = useState<{ auth: Authorization; resolve: (secret: string | null) => void; customMessage?: string; } | null>(null);
  
  const [infoModalKey, setInfoModalKey] = useState<string | null>(null);

  // State for dropdown options
  const [apps, setApps] = useState<AppEngine[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  
  const [reasoningEngines, setReasoningEngines] = useState<ReasoningEngine[]>([]);
  const [isLoadingReasoningEngines, setIsLoadingReasoningEngines] = useState(false);


  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectNumber,
  }), [config, projectNumber]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleProjectNumberChange = (newValue: string) => {
    setProjectNumber(newValue);
    // Reset dependent fields when project changes
    setConfig(prev => ({
        ...prev,
        appId: '',
        reasoningEngineId: '',
    }));
    setApps([]);
    setReasoningEngines([]);
    setBuckets([]);
    setSelectedBucket('');
  };
  
  const addLog = (message: string) => {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // --- Effects to fetch dropdown data ---
  
  // Fetch GCS Buckets
  useEffect(() => {
      if (!apiConfig.projectId) return;
      const fetchBuckets = async () => {
          setIsLoadingBuckets(true);
          setBuckets([]);
          try {
              const res = await api.listBuckets(apiConfig.projectId);
              const items = res.items || [];
              setBuckets(items);
              if (items.length > 0) {
                  // Default to first bucket if not set
                  if (!selectedBucket) setSelectedBucket(items[0].name);
              }
          } catch (e) {
              console.error("Failed to fetch buckets", e);
          } finally {
              setIsLoadingBuckets(false);
          }
      };
      fetchBuckets();
  }, [apiConfig.projectId]);

  const fetchBackups = async () => {
      if (!selectedBucket || !apiConfig.projectId) return;
      setIsLoadingFiles(true);
      setBackupFiles({}); // Clear while loading
      try {
          const res = await api.listGcsObjects(selectedBucket, '', apiConfig.projectId);
          const objects = res.items || [];
          
          // Categorize files based on prefixes
        const categorized: Record<string, string[]> = {
              'DiscoveryResources': [],
              'ReasoningEngine': [],
              'Assistant': [],
              'Agents': [],
          'DataStores': [],
              'Authorizations': [],
          'ChatHistory': [],
          'NotebookLM': [],
          };

          objects.forEach(obj => {
              if (obj.name.startsWith('agentspace-discovery-backup')) categorized['DiscoveryResources'].push(obj.name);
              else if (obj.name.startsWith('agentspace-reasoning-engine')) categorized['ReasoningEngine'].push(obj.name);
              else if (obj.name.startsWith('agentspace-assistant')) categorized['Assistant'].push(obj.name);
              else if (obj.name.startsWith('agentspace-agents')) categorized['Agents'].push(obj.name);
              else if (obj.name.startsWith('agentspace-data-stores')) categorized['DataStores'].push(obj.name);
              else if (obj.name.startsWith('agentspace-authorizations')) categorized['Authorizations'].push(obj.name);
              else if (obj.name.startsWith('agentspace-chat-history')) categorized['ChatHistory'].push(obj.name);
              else if (obj.name.startsWith('agentspace-notebooks')) categorized['NotebookLM'].push(obj.name);
          });

          // Sort chronologically (names contain ISO timestamp, so alphabetical reverse works)
          Object.keys(categorized).forEach(key => {
              categorized[key].sort().reverse();
          });

          setBackupFiles(categorized);
      } catch (e) {
          console.error("Failed to list objects", e);
          addLog(`Error listing backup files: ${(e as any).message}`);
      } finally {
          setIsLoadingFiles(false);
      }
  };

  // Fetch Backup Files when bucket changes
  useEffect(() => {
      fetchBackups();
  }, [selectedBucket, apiConfig.projectId]);


  useEffect(() => {
    if (!apiConfig.projectId || !apiConfig.appLocation) {
        setApps([]);
        return;
    }
    const fetchApps = async () => {
        setIsLoadingApps(true);
        setApps([]);
        try {
            const response = await api.listResources('engines', apiConfig);
            const fetchedApps = response.engines || [];
            setApps(fetchedApps);
            if (fetchedApps.length === 1) {
                const singleAppId = fetchedApps[0].name.split('/').pop();
                if (singleAppId) {
                    setConfig(prev => ({ ...prev, appId: singleAppId }));
                }
            }
        } catch (err) {
            console.error("Failed to fetch apps:", err);
        } finally {
            setIsLoadingApps(false);
        }
    };
    fetchApps();
  }, [apiConfig.projectId, apiConfig.appLocation, apiConfig.collectionId]);

  // Fetch Agent Engines
  useEffect(() => {
    if(!apiConfig.projectId || !apiConfig.reasoningEngineLocation) return;
    const fetchREs = async () => {
        setIsLoadingReasoningEngines(true);
        setReasoningEngines([]);
        try {
            const res = await api.listReasoningEngines(apiConfig);
            const engines = res.reasoningEngines || [];
            setReasoningEngines(engines);
            // Auto select if only one
             if (engines.length === 1) {
                 const id = engines[0].name.split('/').pop() || '';
                 setConfig(p => ({...p, reasoningEngineId: id}));
             }
        } catch(e) { 
          console.error("Failed to fetch agent engines:", e); 
        } finally { 
            setIsLoadingReasoningEngines(false); 
        }
    }
    fetchREs();
  }, [apiConfig.projectId, apiConfig.reasoningEngineLocation]);


  const uploadBackupToGcs = async (data: object, filenamePrefix: string) => {
      if (!selectedBucket) {
          throw new Error("No GCS bucket selected for backup.");
      }
      const jsonString = JSON.stringify(data, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${filenamePrefix}-${timestamp}.json`;
      const file = new File([jsonString], filename, { type: 'application/json' });
      
      addLog(`Uploading backup to gs://${selectedBucket}/${filename}...`);
      await api.uploadFileToGcs(selectedBucket, filename, file, apiConfig.projectId);
      addLog(`Upload successful.`);
      
      // Refresh file list to show the new backup
      await fetchBackups();
  };
  
  const executeOperation = async (section: string, operation: () => Promise<void>) => {
      setIsLoading(true);
      setLoadingSection(section);
      setError(null);
      setLogs([]);
      try {
          await operation();
      } catch (err: any) {
          setError(err.message || `An unknown error occurred in ${section}.`);
          addLog(`FATAL ERROR: ${err.message}`);
      } finally {
          setIsLoading(false);
          setLoadingSection(null);
      }
  };

  const pollOperation = async (operation: any, pollConfig: typeof apiConfig, resourceName: string, apiVersion: 'v1alpha' | 'v1beta' = 'v1beta') => {
    let currentOperation = operation;
    addLog(`  - Operation for ${resourceName} initiated (${currentOperation.name}). Polling for completion...`);
    while (!currentOperation.done) {
        await delay(5000); // Poll every 5 seconds
        currentOperation = await api.getDiscoveryOperation(currentOperation.name, pollConfig, apiVersion);
        addLog(`    - Polling ${resourceName}... status: ${currentOperation.done ? 'DONE' : 'IN_PROGRESS'}`);
    }

    if (currentOperation.error) {
        const errorMessage = currentOperation.error.message || JSON.stringify(currentOperation.error);
        throw new Error(`${resourceName} creation failed: ${errorMessage}`);
    }
    addLog(`  - ${resourceName} ready.`);
    return currentOperation.response;
  };

  // --- Backup Handlers ---
  const handleBackupDiscovery = async () => executeOperation('BackupDiscoveryResources', async () => {
    addLog('Starting Discovery Resources backup for default_collection...');
    const collections: Collection[] = [];
    let colToken: string | undefined = undefined;
    do {
      const collectionsResponse = await api.listResources('collections', apiConfig, colToken);
      collections.push(...(collectionsResponse.collections || []).filter(c => c.name.endsWith('/default_collection')));
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
        const enginesResponse = await api.listResources('engines', { ...apiConfig, collectionId }, engToken);
        engines.push(...(enginesResponse.engines || []));
        engToken = enginesResponse.nextPageToken;
      } while (engToken);
        collection.engines = engines;

        for (const engine of engines) {
            const appId = engine.name.split('/').pop()!;

          const assistants: Assistant[] = [];
          let asstToken: string | undefined = undefined;
          do {
            const assistantsResponse = await api.listResources('assistants', { ...apiConfig, collectionId, appId }, asstToken);
            assistants.push(...(assistantsResponse.assistants || []).filter(a => a.name.endsWith('/default_assistant')));
            asstToken = assistantsResponse.nextPageToken;
          } while (asstToken);
          engine.assistants = assistants;
        }
    }

    const backupData = { type: 'DiscoveryResources', createdAt: new Date().toISOString(), sourceConfig: apiConfig, collections };
    await uploadBackupToGcs(backupData, 'agentspace-discovery-backup');
    addLog(`Backup complete! Found and backed up 'default_collection'.`);
  });
  
  const handleBackupReasoningEngine = async () => executeOperation('BackupReasoningEngine', async () => {
    if (!apiConfig.reasoningEngineId) {
      throw new Error("Target Agent Engine ID must be selected.");
    }
    const engineName = `projects/${apiConfig.projectId}/locations/${apiConfig.reasoningEngineLocation}/reasoningEngines/${apiConfig.reasoningEngineId}`;
    addLog(`Starting backup for Agent Engine: ${engineName}...`);
    
    const engine = await api.getReasoningEngine(engineName, apiConfig);
    
    const backupData = { type: 'ReasoningEngine', createdAt: new Date().toISOString(), sourceConfig: apiConfig, engine };
    await uploadBackupToGcs(backupData, `agentspace-reasoning-engine-${apiConfig.reasoningEngineId}-backup`);
    addLog(`Backup complete! Agent Engine '${engine.displayName}' saved.`);
  });

  const handleBackupAssistant = async () => executeOperation('BackupAssistant', async () => {
    if (!apiConfig.appId) {
      throw new Error("Gemini Enterprise ID must be set to back up an assistant.");
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
          (agent as any).iamPolicy = policy;
        }
      } catch (e) {
        addLog(`  - Warning: Failed to backup IAM policy for agent ${agent.name}: ${(e as any).message}`);
      }
    }
    assistant.agents = agents;
    
    const backupData = { type: 'Assistant', createdAt: new Date().toISOString(), sourceConfig: apiConfig, assistant };
    await uploadBackupToGcs(backupData, `agentspace-assistant-${apiConfig.assistantId}-backup`);
    addLog(`Backup complete! Assistant '${assistant.displayName}' and its ${assistant.agents.length} agents saved.`);
  });
  
  const handleBackupAgents = async () => executeOperation('BackupAgents', async () => {
    if (!apiConfig.appId) {
      throw new Error("Gemini Enterprise ID must be set to back up agents.");
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
          (agent as any).iamPolicy = policy;
        }
      } catch (e) {
        addLog(`  - Warning: Failed to backup IAM policy for agent ${agent.name}: ${(e as any).message}`);
      }
    }
    
    const backupData = { type: 'Agents', createdAt: new Date().toISOString(), sourceConfig: apiConfig, agents };
    await uploadBackupToGcs(backupData, `agentspace-agents-${apiConfig.assistantId}-backup`);
    addLog(`Backup complete! Found ${agents.length} agents.`);
  });

  const handleBackupDataStores = async () => executeOperation('BackupDataStores', async () => {
    addLog('Starting Data Stores backup for default_collection...');
    addLog('  - Note: Backing up Data Store configurations (raw document contents and connector data must be re-synced upon restore).');
    const dataStores: DataStore[] = [];
    let pageToken: string | undefined = undefined;
    do {
      const dataStoresResponse = await api.listResources('dataStores', apiConfig, pageToken);
      dataStores.push(...(dataStoresResponse.dataStores || []));
      pageToken = dataStoresResponse.nextPageToken;
    } while (pageToken);
    
    const backupData = { type: 'DataStores', createdAt: new Date().toISOString(), sourceConfig: apiConfig, dataStores };
    await uploadBackupToGcs(backupData, 'agentspace-data-stores-backup');
    addLog(`Backup complete! Found ${dataStores.length} data stores.`);
  });

  const handleBackupNotebooks = async () => executeOperation('BackupNotebookLM', async () => {
    addLog(`Starting backup for Notebooks in ${apiConfig.appLocation}...`);
    const response = await api.listNotebooks(apiConfig);
    const notebooks = response.notebooks || [];

    addLog(`Found ${notebooks.length} notebooks. Fetching detailed sources...`);
    const fullNotebooks = [];

    for (const nb of notebooks) {
      const notebookId = nb.name.split('/').pop()!;
      try {
        const rawNotebook = await api.getNotebook(apiConfig, notebookId);

        // Loop through the sources to pull full metadata
        const fullSources = [];
        for (const source of (rawNotebook.sources || [])) {
          const sourceId = source.name.split('/').pop()!;
          try {
            const fullSource = await api.getNotebookSource(apiConfig, notebookId, sourceId);
            fullSources.push(fullSource);
          } catch (sourceErr: any) {
            addLog(`  - Warning: Could not fetch details for source ${sourceId} in notebook ${notebookId}: ${sourceErr.message}`);
            fullSources.push(source); // Fallback to shallow copy
          }
        }
        rawNotebook.sources = fullSources;
        fullNotebooks.push(rawNotebook);
        addLog(`  - Fetched details for: ${rawNotebook.displayName || notebookId} (${fullSources.length} sources)`);
      } catch (nbErr: any) {
        addLog(`  - Error fetching details for notebook ${notebookId}: ${nbErr.message}`);
      }
      await delay(500); // Rate limit
    }

    const backupData = { type: 'NotebookLM', createdAt: new Date().toISOString(), sourceConfig: apiConfig, notebooks: fullNotebooks };
    await uploadBackupToGcs(backupData, 'agentspace-notebooks-backup');
    addLog(`Backup complete! Found ${fullNotebooks.length} fully resolved NotebookLMs.`);
  });

  const handleBackupAuthorizations = async () => executeOperation('BackupAuthorizations', async () => {
      addLog("Starting Authorizations backup...");
    const authorizations: Authorization[] = [];
    let pageToken: string | undefined = undefined;
    do {
      const response = await api.listAuthorizations(apiConfig, pageToken);
      const rawAuths: Authorization[] = response.authorizations || [];
      authorizations.push(...rawAuths.map(auth => {
    // Explicitly remove client secret for security
            if (auth.serverSideOauth2?.clientSecret) {
              delete auth.serverSideOauth2.clientSecret;
            }
            return auth;
          }));
        pageToken = response.nextPageToken;
      } while (pageToken);
      
      const backupData = { type: 'Authorizations', createdAt: new Date().toISOString(), sourceConfig: apiConfig, authorizations };
      await uploadBackupToGcs(backupData, 'agentspace-authorizations-backup');
      addLog(`Backup complete! Found ${authorizations.length} authorizations (client secrets omitted).`);
  });

  const handleBackupChatHistory = async () => executeOperation('BackupChatHistory', async () => {
    addLog("Starting Chat History backup...");

    // 1. Discovery Engine Sessions
    addLog("Fetching Discovery Engine sessions...");
    const discoverySessions: DiscoverySession[] = [];
    try {
      // We need to iterate over all "Engines"/Apps to get their sessions.
      // This might be expensive if there are many apps.
      // For now, let's use the CURRENTLY SELECTED App in config, or try to discovery all?
      // The other backups try to discover all (e.g. iterate collections).
      // Let's iterate all collections -> engines -> sessions.

      const collectionsResponse = await api.listResources('collections', apiConfig);
      const collections: Collection[] = collectionsResponse.collections || [];

      for (const collection of collections) {
        const collectionId = collection.name.split('/').pop()!;
        const enginesResponse = await api.listResources('engines', { ...apiConfig, collectionId });
        const engines: AppEngine[] = enginesResponse.engines || [];
        for (const engine of engines) {
          const appId = engine.name.split('/').pop()!;
          try {
            let pageToken: string | undefined = undefined;
            do {
              const sessionsResp = await api.listDiscoverySessions({ ...apiConfig, collectionId, appId }, pageToken, 100); // Fetch 100 at a time
              const sessions = sessionsResp.sessions || [];

              if (sessions.length > 0) {
                addLog(`  - Found ${sessions.length} sessions in App '${engine.displayName}' (Page Token: ${pageToken ? 'Yes' : 'First'})`);

                // Fetch details for each session in parallel to speed up
                // We use a concurrency limit to avoid hitting rate limits too hard
                const chunkedSessions = [];
                for (let i = 0; i < sessions.length; i += 5) {
                  chunkedSessions.push(sessions.slice(i, i + 5));
                }

                for (const chunk of chunkedSessions) {
                  await Promise.all(chunk.map(async (session) => {
                    try {
                      const fullSession = await api.getDiscoverySession(session.name, { ...apiConfig, collectionId, appId });

                      // Hydrate Answers if they are references (Fix for missing chat text)
                      if (fullSession.turns && fullSession.turns.length > 0) {
                        // Fetch answers sequentially or parallel? Parallel for this session.
                        await Promise.all(fullSession.turns.map(async (turn) => {
                          let answerRef = '';
                          if (typeof turn.answer === 'string' && turn.answer.startsWith('projects/')) answerRef = turn.answer;
                          else if (turn.assistAnswer && typeof turn.assistAnswer === 'string' && turn.assistAnswer.startsWith('projects/')) answerRef = turn.assistAnswer;
                          else {
                            const assistantKey = Object.keys(turn).find(k => k.startsWith('assist'));
                            if (assistantKey && typeof turn[assistantKey] === 'string' && turn[assistantKey].startsWith('projects/')) {
                              answerRef = turn[assistantKey];
                            }
                          }

                          if (answerRef) {
                            try {
                              const answerObj = await api.getDiscoveryAnswer(answerRef, { ...apiConfig, collectionId, appId });
                              // Normalize for UI/Restore
                              turn.answer = {
                                ...answerObj,
                                reply: {
                                  replyText: answerObj.answerText || answerObj.answer_text || (answerObj.steps ? 'Step-based answer' : 'No text'),
                                  ...answerObj.reply // Keep original if exists
                                }
                              };
                            } catch (err) {
                              // Keep as string if failed
                              console.warn('Failed to hydrate answer during backup', answerRef);
                            }
                          }
                        }));
                      }

                      discoverySessions.push(fullSession);
                    } catch (e: any) {
                      console.warn(`Failed to fetch session details for ${session.name}`, e);
                      discoverySessions.push(session);
                    }
                  }));
                  // Small delay between chunks
                  await delay(100);
                }
              }
              pageToken = sessionsResp.nextPageToken;
            } while (pageToken);

          } catch (err) {
            // Ignore errors (e.g. no sessions found or permission issues)
            addLog(`  - Warning: Failed to fetch sessions for App '${engine.displayName}': ${(err as any).message}`);
          }
        }
      }
    } catch (e: any) {
      addLog(`Error fetching Discovery sessions: ${e.message}`);
    }

    // 2./Agent Engine Sessions (if a reasoning engine is selected or iterate all?)
    // We'll skip complex iteration for now and just check the selected one if present, or maybe list all?
    // listReasoningEngines -> sessions
    addLog("Fetching Agent Engine sessions...");
    const reasoningSessions: any[] = []; // Type is generic for now
    try {
      const res = await api.listReasoningEngines(apiConfig);
      const engines = res.reasoningEngines || [];
      for (const engine of engines) {
        try {
          const sessionsResp = await api.listReasoningEngineSessions(engine.name, apiConfig);
          const sessions = sessionsResp.sessions || [];
          if (sessions.length > 0) {
            addLog(`  - Found ${sessions.length} sessions in Agent Engine '${engine.displayName}'`);
            for (const session of sessions) {
              try {
                const fullSession = await api.getReasoningEngineSession(session.name, apiConfig);
                reasoningSessions.push(fullSession);
              } catch (e) {
                reasoningSessions.push(session);
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e: any) {
      addLog(`Error fetching Agent Engine sessions: ${e.message}`);
    }

    const totalSessions = discoverySessions.length + reasoningSessions.length;
    if (totalSessions === 0) {
      addLog("No chat sessions found to backup.");
      return;
    }

    const backupData = {
      type: 'ChatHistory',
      createdAt: new Date().toISOString(),
      sourceConfig: apiConfig,
      discoverySessions,
      reasoningSessions
    };

    await uploadBackupToGcs(backupData, 'agentspace-chat-history-backup');
    addLog(`Backup complete! Saved ${totalSessions} sessions.`);
  });


  // --- Restore Handlers & Processors ---

  const handleDeleteBackup = async (section: string) => {
    const filename = selectedRestoreFiles[section];
    if (!filename || !selectedBucket) {
      setError(`Please select a bucket and a backup file for ${section} to delete.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    executeOperation(`DeleteBackup${section}`, async () => {
      addLog(`Deleting ${filename} from ${selectedBucket}...`);
      await api.deleteGcsObject(selectedBucket, filename, apiConfig.projectId);
      addLog(`Successfully deleted ${filename}.`);

      // Clear selection and refresh list
      setSelectedRestoreFiles(prev => {
        const next = { ...prev };
        delete next[section];
        return next;
      });
      fetchBackups();
    });
  };


  const handleRestore = async (section: string, processor: (data: any) => Promise<void>) => {
    const filename = selectedRestoreFiles[section];
    if (!filename || !selectedBucket) {
      setError(`Please select a bucket and a backup file for ${section}.`);
      return;
    }
    
    const sectionName = section.replace(/[A-Z]/g, ' $&').trim(); // e.g., 'DiscoveryResources' -> 'Discovery Resources'
    executeOperation(`Restore${section}`, async () => {
      addLog(`Downloading file: gs://${selectedBucket}/${filename}...`);
      
      const fileContent = await api.getGcsObjectContent(selectedBucket, filename, apiConfig.projectId);
      const backupData = JSON.parse(fileContent);
      
      if (backupData.type !== section) {
        // Allow backward compatibility or relaxed checking if needed, but for now strict.
        // Actually, some backups might be old format?
        // ChatHistory backups have type 'ChatHistory'.
        throw new Error(`Invalid backup file type. Expected '${section}', but found '${backupData.type}'.`);
      }

      if (section === 'ChatHistory') {
        // Special handling for Chat History: Open Archive Viewer
        const sessions = [
          ...(backupData.discoverySessions || []),
          ...(backupData.reasoningSessions || [])
        ];
        setChatHistoryArchiveData({ sessions, fileName: filename });
        addLog(`Opened Chat History Archive Viewer for ${filename}.`);
      } else {
        await processor(backupData);
      }

      addLog(`Restore process for ${sectionName} finished.`);
    });
  };

  const handleConfirmRestore = (section: string, items: any[], processor: (data: any) => Promise<void>, originalData: any) => {
    setModalData(null); // Close the modal first

    const sectionName = section.replace(/[A-Z]/g, ' $&').trim();
    executeOperation(`Restore${section}`, async () => {
      const dataToRestore = { ...originalData };
      
      // Filter the original data based on the selected items
      switch (section) {
          case 'DiscoveryResources':
              dataToRestore.collections = originalData.collections.filter((c: Collection) => items.some(item => item.name === c.name));
              break;
          case 'ReasoningEngine':
              // It's a single item select for now
              dataToRestore.engine = items.length > 0 ? items[0] : null; 
              break;
          case 'Assistant':
              dataToRestore.assistant.agents = originalData.assistant.agents.filter((a: Agent) => items.some(item => item.name === a.name));
              break;
          case 'Agents':
              dataToRestore.agents = originalData.agents.filter((a: Agent) => items.some(item => item.name === a.name));
              break;
          case 'DataStores':
              dataToRestore.dataStores = originalData.dataStores.filter((ds: DataStore) => items.some(item => item.name === ds.name));
              break;
          case 'Authorizations':
              dataToRestore.authorizations = originalData.authorizations.filter((auth: Authorization) => items.some(item => item.name === auth.name));
              break;
        case 'NotebookLM':
          dataToRestore.notebooks = originalData.notebooks.filter((nb: any) => items.some(item => item.name === nb.name));
          break;
          default:
              throw new Error(`Unknown section type for selective restore: ${section}`);
      }
      
      addLog(`Starting restore of ${items.length} selected ${sectionName}...`);
      await processor(dataToRestore);
      addLog(`Restore process for ${sectionName} finished.`);
    });
  };

  const restoreAgentsIntoAssistant = async (agents: Agent[], restoreConfig: typeof apiConfig) => {
    addLog(`  - Restoring ${agents.length} agent(s)...`);
    for (const agent of agents) {
      const originalAgentId = agent.name.split('/').pop()!;
      addLog(`    - Preparing to restore agent: ${agent.displayName} (from original ID: ${originalAgentId}) as a new agent.`);

      const buildPayload = (currentAgent: Agent): any => {
        const finalStarterPrompts = (currentAgent.starterPrompts || [])
          .map(p => p.text ? p.text.trim() : '')
          .filter(text => text)
          .map(text => ({ text }));

        // Base payload
        const payload: any = {
          displayName: currentAgent.displayName,
          description: currentAgent.description || '',
          icon: currentAgent.icon || undefined,
          starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
          authorizationConfig: currentAgent.authorizationConfig,
          authorizations: !currentAgent.authorizationConfig ? currentAgent.authorizations : undefined,
        };

        // Rewrite Authorizations to the NEW project/location
        const rewriteAuth = (authName: string) => {
          if (!authName) return authName;
          const authId = authName.split('/').pop()!;
          // Always target the new project/location for authorizations
          return `projects/${restoreConfig.projectId}/locations/${restoreConfig.appLocation || 'global'}/authorizations/${authId}`;
        };

        if (payload.authorizationConfig?.toolAuthorizations) {
          payload.authorizationConfig.toolAuthorizations = payload.authorizationConfig.toolAuthorizations.map(rewriteAuth);
        }
        if (payload.authorizations) {
          payload.authorizations = payload.authorizations.map(rewriteAuth);
        }

        // Dynamically copy ANY definition property from the currentAgent
        const definitionKeys = Object.keys(currentAgent).filter(key => key.toLowerCase().includes('agentdefinition'));
        for (const key of definitionKeys) {
          if (key === 'adkAgentDefinition') {
            const adkDef = currentAgent.adkAgentDefinition;
            let reasoningEngineStr = adkDef.provisionedReasoningEngine?.reasoningEngine;

            if (reasoningEngineStr) {
              const parts = reasoningEngineStr.split('/');
              if (parts.length >= 6) {
                const oldReId = parts.pop()!;
                parts.pop(); // reasoningEngines
                const oldReLoc = parts.pop()!;
                parts.pop(); // locations
                const oldProject = parts.pop()!;
                parts.pop(); // projects
                // Rebuild with new project and new location
                reasoningEngineStr = `projects/${restoreConfig.projectId}/locations/${restoreConfig.appLocation || oldReLoc}/reasoningEngines/${oldReId}`;
              }
            }

            payload.adkAgentDefinition = {
              toolSettings: { toolDescription: adkDef.toolSettings?.toolDescription },
              provisionedReasoningEngine: { reasoningEngine: reasoningEngineStr }
            };
          } else {
            // For any other agent definition (a2aAgentDefinition, managedAgentDefinition, dialogflowAgentDefinition, generativeAgentDefinition, etc.)
            // We just pass it along directly in camelCase as the Google Cloud API accepts both cases.
            payload[key] = (currentAgent as any)[key];
          }
        }

        return payload;
      };

      const createPayload = buildPayload(agent);
  
      try {
        // Create the agent without specifying an ID to get a new one.
        const newAgent = await api.createAgent(createPayload, restoreConfig);
        const newAgentId = newAgent.name.split('/').pop()!;
        addLog(`      - CREATED: Agent '${agent.displayName}' created successfully with new ID '${newAgentId}'.`);
        
        if ((agent as any).iamPolicy && (agent as any).iamPolicy.bindings) {
          try {
            addLog(`      - Restoring IAM policy bindings for new agent: ${newAgentId}...`);
            const payloadPolicy = { bindings: (agent as any).iamPolicy.bindings };
            await api.setAgentIamPolicy(newAgent.name, payloadPolicy, restoreConfig);
            addLog(`      - IAM policy successfully restored for agent: ${newAgentId}`);
          } catch (iamErr: any) {
            addLog(`      - WARNING: Failed to apply IAM policy snapshot for agent ${newAgentId}: ${iamErr.message}`);
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes("is used by another agent")) {
          addLog(`      - WARNING: Authorization is in use. Attempting to create a new one.`);
          // IMPORTANT: we need the ORIGINAL authorization name to fetch details, which we grab from the backup agent directly.
          const originalAuthName = agent.authorizationConfig?.toolAuthorizations?.[0] || agent.authorizations?.[0];
          if (!originalAuthName) {
            addLog(`      - ERROR: Cannot resolve authorization conflict. Agent in backup has no authorization specified. Skipping agent.`);
            continue;
          }

          try {
            // We fetch the authorization by providing the Old Project ID through a custom config override,
            // because `restoreConfig` points to the *new* project. 
            // `originalAuthName` contains `projects/[old_project]/...` so apiService should parse it out if it handles full paths, 
            // but we can extract it explicitly to be safe.
            const oldProjectMatch = originalAuthName.match(/projects\/([^/]+)/);
            const oldProject = oldProjectMatch ? oldProjectMatch[1] : restoreConfig.projectId;
            const originalAuthConfig = { ...restoreConfig, projectId: oldProject };

            addLog(`        - Fetching details for original authorization: ${originalAuthName.split('/').pop()} from project: ${oldProject}`);
            const originalAuthDetails = await api.getAuthorization(originalAuthName, originalAuthConfig);
            
            const originalAuthId = originalAuthName.split('/').pop()!;
            const newAuthId = `${originalAuthId}-${Date.now()}`;
            addLog(`        - Proposing new authorization ID: ${newAuthId}`);
            
            // The prompt uses the *new* project ID
            const tempAuthForPrompt: Authorization = { name: `projects/${restoreConfig.projectId}/locations/global/authorizations/${newAuthId}`, serverSideOauth2: originalAuthDetails.serverSideOauth2 };
            const clientSecret = await promptForSecret(tempAuthForPrompt, `The original authorization ('${originalAuthId}') is in use. A new one named "${newAuthId}" will be created. Please provide the client secret to proceed.`);
            
            if (!clientSecret) {
                addLog(`        - SKIPPED: User did not provide a secret for the new authorization. Cannot restore agent.`);
                continue;
            }

            addLog(`        - Creating new authorization: ${newAuthId} in target project: ${restoreConfig.projectId}`);
            const newAuthPayload = { serverSideOauth2: { ...originalAuthDetails.serverSideOauth2, clientSecret } };
            // We intentionally pass `restoreConfig` to create it in the new project
            const newAuthorization = await api.createAuthorization(newAuthId, newAuthPayload, restoreConfig);
            addLog(`        - CREATED: New authorization created: ${newAuthorization.name}`);
            
            addLog(`        - Retrying agent creation with new authorization...`);
            createPayload.authorizationConfig = { toolAuthorizations: [newAuthorization.name] };
            delete createPayload.authorizations; // Ensure legacy field is removed if present
            const newAgent = await api.createAgent(createPayload, restoreConfig);
            const newAgentId = newAgent.name.split('/').pop()!;
            addLog(`      - CREATED: Agent '${agent.displayName}' created successfully with new ID '${newAgentId}' and new authorization.`);
            
            if ((agent as any).iamPolicy && (agent as any).iamPolicy.bindings) {
              try {
                addLog(`      - Restoring IAM policy bindings for new agent: ${newAgentId}...`);
                const payloadPolicy = { bindings: (agent as any).iamPolicy.bindings };
                await api.setAgentIamPolicy(newAgent.name, payloadPolicy, restoreConfig);
                addLog(`      - IAM policy successfully restored for agent: ${newAgentId}`);
              } catch (iamErr: any) {
                addLog(`      - WARNING: Failed to apply IAM policy snapshot for agent ${newAgentId}: ${iamErr.message}`);
              }
            }

          } catch (recoveryErr: any) {
            addLog(`      - ERROR: Failed during authorization recovery process: ${recoveryErr.message}. Skipping agent.`);
          }
        } else {
            addLog(`      - ERROR: Failed to create new agent for '${agent.displayName}': ${err.message}`);
        }
      }
      await delay(1000); // Rate limit
    }
  };

  const processRestoreDiscovery = async (backupData: any) => {
    if (!backupData.collections || backupData.collections.length === 0) {
      addLog("No collections found in backup file to restore.");
      return;
    }

    setModalData({
      section: 'DiscoveryResources',
      title: 'Select Collections to Restore',
      items: backupData.collections,
      originalData: backupData,
      processor: async (data) => {
        addLog(`Restoring ${data.collections.length} Collection(s)...`);
        for (const collection of data.collections) {
            const collectionId = collection.name.split('/').pop()!;
            addLog(`Restoring Collection '${collection.displayName}' (${collectionId})...`);
            
            const restoreConfig = { ...apiConfig, collectionId };
            
            try {
                await api.createCollection(collectionId, { displayName: collection.displayName }, restoreConfig);
                addLog(`  - CREATED: Collection '${collectionId}'`);
            } catch (err: any) {
                if (err.message && err.message.includes("ALREADY_EXISTS")) {
                    addLog(`  - INFO: Collection '${collectionId}' already exists. Proceeding...`);
                } else {
                    addLog(`  - ERROR: Failed to create collection '${collectionId}': ${err.message}`);
                    continue; // Skip to next collection on failure
                }
            }
            await delay(2000); // Wait for collection to be ready

            if (collection.engines && collection.engines.length > 0) {
              addLog(`  - Restoring ${collection.engines.length} App/Engine(s) into collection '${collectionId}'...`);

              for (const engine of collection.engines) {
                  const engineId = engine.name.split('/').pop()!;
                  addLog(`    - Restoring App/Engine '${engine.displayName}' (${engineId})`);
                  const engineRestoreConfig = { ...restoreConfig, appId: engineId };
                  
                  try {
                      const enginePayload: any = {
                          displayName: engine.displayName,
                          solutionType: engine.solutionType || 'SOLUTION_TYPE_SEARCH',
                          dataStoreIds: engine.dataStoreIds,
                          ...(engine.searchEngineConfig && { searchEngineConfig: engine.searchEngineConfig }),
                          ...(engine.industryVertical && { industryVertical: engine.industryVertical }),
                          ...(engine.appType && { appType: engine.appType }),
                      };
                      
                      const engineOperation = await api.createEngine(engineId, enginePayload, engineRestoreConfig);
                      await pollOperation(engineOperation, engineRestoreConfig, `App/Engine '${engineId}'`, 'v1alpha');
                      addLog(`      - CREATED: App/Engine '${engineId}' with linked data store.`);

                  } catch (err: any) {
                      if (err.message && err.message.includes("ALREADY_EXISTS")) {
                          addLog(`      - INFO: App/Engine '${engineId}' already exists. Proceeding...`);
                      } else {
                          addLog(`      - ERROR: Failed to create App/Engine '${engineId}': ${err.message}`);
                          continue; // Skip to next engine
                      }
                  }

                  if (engine.assistants && engine.assistants.length > 0) {
                      addLog(`      - Restoring ${engine.assistants.length} assistant(s)...`);
                      for (const assistant of engine.assistants) {
                         await processRestoreAssistant({ assistant }, false);
                      }
                  }
              }
            }
        }
      }
    });
  };

  const processRestoreReasoningEngine = async (backupData: any) => {
    const { engine } = backupData;
    if (!engine) {
      addLog("No Agent Engine data found in backup file.");
      return;
    }
     setModalData({
      section: 'ReasoningEngine',
       title: 'Confirm Restore Agent Engine',
      items: [engine],
      originalData: backupData,
      processor: async (data) => {
        const engineToRestore = data.engine;
        if (!engineToRestore) return; // Should not happen

        addLog(`Restoring Agent Engine '${engineToRestore.displayName}' to ${apiConfig.reasoningEngineLocation}...`);
        
        try {
            const payload: any = {
                displayName: engineToRestore.displayName,
                description: engineToRestore.description,
                spec: engineToRestore.spec, // Contains GCS URIs
            };
            
            const operation = await api.createReasoningEngine(apiConfig, payload);
            addLog(`  - Operation started: ${operation.name}`);
            
            // Poll for completion
            let currentOp = operation;
            while (!currentOp.done) {
                await delay(10000); // Poll every 10 seconds (deployment takes time)
                try {
                    currentOp = await api.getVertexAiOperation(operation.name, apiConfig);
                    addLog(`    - Polling status: ${currentOp.done ? 'DONE' : 'IN_PROGRESS'}`);
                } catch (pollErr: any) {
                    console.warn("Polling error", pollErr);
                    addLog(`    - WARNING: Error polling operation: ${pollErr.message}. Retrying...`);
                }
            }

            if (currentOp.error) {
                 addLog(`  - ERROR: Restore failed: ${currentOp.error.message}`);
                 throw new Error(currentOp.error.message);
            } else {
              addLog(`  - SUCCESS: Agent Engine '${engineToRestore.displayName}' restored successfully.`);
                 // Optionally try to fetch the new resource to confirm
                 if (currentOp.response && currentOp.response.name) {
                     addLog(`  - Resource Name: ${currentOp.response.name}`);
                 }
            }
            
        } catch (err: any) {
          addLog(`  - ERROR: Failed to create Agent Engine: ${err.message}`);
        }
      }
    });
  };

  const processRestoreAssistant = async (backupData: any, useModal = true) => {
      const { assistant } = backupData;
      if (!assistant) {
          addLog("No Assistant data found in the backup.");
          return;
      }

      // This is the new logic for the "Restore Single Assistant" button.
      // It uses the assistant selected in the UI dropdown as the target.
      if (useModal) {
          if (!assistant.agents || assistant.agents.length === 0) {
            addLog("No agents found in the assistant backup file to restore.");
            return;
          }
          
          // The processor function that will be called after the user selects agents in the modal.
          const processor = async (data: any) => {
              const agentsToRestore = data.assistant.agents; 
              const restoreConfig = apiConfig; // Uses the UI config, including the target assistantId

              if (!restoreConfig.appId) {
                  throw new Error("You must select a target Gemini Enterprise in the configuration before restoring agents from an assistant backup.");
              }
              
              addLog(`Restoring ${agentsToRestore.length} agent(s) into selected assistant '${restoreConfig.assistantId}'...`);
              await restoreAgentsIntoAssistant(agentsToRestore, restoreConfig);
          };

          // Open the modal to let the user select which agents to restore.
          setModalData({
              section: 'Assistant',
              title: 'Select Agents to Restore',
              items: assistant.agents || [],
              originalData: backupData,
              processor: processor,
          });

      // This is the old logic, preserved for cascading restores (e.g., from an AppEngine backup).
      } else {
          const assistantToRestore = backupData.assistant;
          const assistantId = assistantToRestore.name.split('/').pop()!;
          const restoreConfig = { ...apiConfig, assistantId }; 

          const updateExistingAssistant = async () => {
              addLog(`  - INFO: Assistant '${assistantId}' already exists or is default. Attempting to update its settings from backup.`);
              try {
                  const assistantName = `projects/${restoreConfig.projectId}/locations/${restoreConfig.appLocation}/collections/${restoreConfig.collectionId}/engines/${restoreConfig.appId}/assistants/${assistantId}`;
                  const payload: any = {};
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
                  } else {
                    addLog(`  - INFO: No updatable settings found in backup for assistant '${assistantId}'.`);
                  }
              } catch (updateErr: any) {
                  addLog(`  - ERROR: Failed to update existing assistant '${assistantId}': ${updateErr.message}. Proceeding to restore agents anyway.`);
              }
          };

          if (assistantId === 'default_assistant') {
              await updateExistingAssistant();
          } else {
            // Logic for custom assistants
            addLog(`Restoring custom Assistant '${assistantToRestore.displayName}' (${assistantId}) into app '${restoreConfig.appId}'...`);
            try {
                await api.createAssistant(assistantId, { displayName: assistantToRestore.displayName }, restoreConfig);
                addLog(`  - CREATED: Assistant '${assistantId}'`);
            } catch (err: any) {
                if (err.message && err.message.includes("ALREADY_EXISTS")) {
                    await updateExistingAssistant();
                } else {
                    addLog(`  - ERROR: Failed to create assistant '${assistantId}': ${err.message}`);
                    throw err; // Stop if it's not an ALREADY_EXISTS error
                }
            }
          }
          
          await delay(2000);
          
          if (assistantToRestore.agents && assistantToRestore.agents.length > 0) {
              await restoreAgentsIntoAssistant(assistantToRestore.agents, restoreConfig);
          } else {
              addLog("  - No agents found in the backup for this assistant.");
          }
      }
  };
  
  const processRestoreAgents = async (backupData: any) => {
    const { agents } = backupData;
    if (!agents) {
        addLog("No agent data found in the backup.");
        return;
    }

    const restoreConfig = apiConfig;
    if (!restoreConfig.appId) {
        throw new Error("You must select a target Gemini Enterprise in the configuration before restoring agents.");
    }

    const itemsWithTypes = agents.map((agent: any) => {
      let agentType = "Low Code";
      if (agent.adkAgentDefinition) {
        agentType = "ADK";
      } else if (agent.a2aAgentDefinition) {
        agentType = "A2A";
      }

      let disabled = false;
      let disabledReason = undefined;

      // Extract original project and app ID from the agent name (projects/*/locations/*/collections/*/engines/*/assistants/*/agents/*)
      const nameParts = agent.name.split('/');
      const originalProject = nameParts.length >= 2 ? nameParts[1] : '';
      const originalAppId = nameParts.length >= 8 ? nameParts[7] : '';

      const isCrossInstance = originalProject !== restoreConfig.projectId || originalAppId !== restoreConfig.appId;

      if (isCrossInstance && (agentType === "ADK" || agentType === "A2A")) {
        disabled = true;
        disabledReason = "Cross-instance RESTORE is only supported for Low-Code agents.";
      }

      return { ...agent, agentType, disabled, disabledReason };
    });

    setModalData({
        section: 'Agents',
        title: 'Select Agents to Restore',
      items: itemsWithTypes,
        originalData: backupData,
        processor: async (data) => {
            await restoreAgentsIntoAssistant(data.agents, restoreConfig);
        },
    });
  };

  const processRestoreDataStores = async (backupData: any) => {
    setModalData({
      section: 'DataStores',
      title: 'Select Data Stores to Restore',
      items: backupData.dataStores || [],
      originalData: backupData,
      processor: async (data) => {
        addLog(`Restoring ${data.dataStores.length} Data Store(s) into collection '${apiConfig.collectionId}'...`);
        addLog(`  - Note: Data Store schemas and configs restored. Please trigger connector synchronization to re-index document contents.`);
        for (const dataStore of data.dataStores) {
          const dsId = dataStore.name.split('/').pop()!;
          addLog(`  - Restoring Data Store '${dataStore.displayName}' (${dsId})`);
          try {
            // Construct a clean payload with only writable fields
            const payload = {
                displayName: dataStore.displayName,
                industryVertical: dataStore.industryVertical,
                solutionTypes: dataStore.solutionTypes,
                contentConfig: dataStore.contentConfig || 'NO_CONTENT',
            };
            await api.createDataStore(dsId, payload, apiConfig);
            addLog(`    - CREATED: Data Store '${dsId}'`);
          } catch (err: any) {
            if (err.message && err.message.includes("ALREADY_EXISTS")) {
                addLog(`    - INFO: Data Store '${dsId}' already exists. Skipping.`);
            } else {
                addLog(`    - ERROR: Failed to create Data Store '${dsId}': ${err.message}`);
            }
          }
          await delay(1000); // Rate limit
        }
      }
    });
  };

  const processRestoreNotebooks = async (backupData: any) => {
    if (!backupData.notebooks || backupData.notebooks.length === 0) {
      addLog("No notebooks found in backup file to restore.");
      return;
    }

    const displayableNotebooks = backupData.notebooks.map((notebook: any) => ({
      ...notebook,
      displayName: notebook.displayName || notebook.title || notebook.name?.split('/').pop() || 'Unnamed Notebook'
    }));

    setModalData({
      section: 'NotebookLM',
      title: 'Select Notebooks to Restore',
      items: displayableNotebooks,
      originalData: { ...backupData, notebooks: displayableNotebooks },
      processor: async (data) => {
        addLog(`Restoring ${data.notebooks.length} Notebooks...`);
        for (const notebook of data.notebooks) {
          addLog(`  - Restoring Notebook '${notebook.displayName}'...`);

          // Construct a clean payload
          const { name, displayName, createTime, updateTime, sources, ...rest } = notebook;
          const payload: any = { ...rest };

          if (notebook.displayName || notebook.title) {
            payload.title = notebook.displayName || notebook.title;
          }

          try {
            const newNotebook = await api.createNotebook(apiConfig, payload);
            const newNotebookId = newNotebook.name.split('/').pop()!;
            addLog(`    - CREATED: Notebook '${newNotebookId}'`);

            // Restore sources
            if (notebook.sources && notebook.sources.length > 0) {
              addLog(`    - Restoring ${notebook.sources.length} sources for notebook '${newNotebookId}'...`);
              const sourceRequests = notebook.sources.map((source: any) => {
                // Determine source type from metadata or other hints
                const sourcePayload: any = {};
                const sourceName = source.title || source.displayName || 'Restored Source';

                if (source.metadata?.googleDocsMetadata) {
                  sourcePayload.googleDriveContent = {
                    sourceName: sourceName,
                    documentId: source.metadata.googleDocsMetadata.documentId,
                    mimeType: source.metadata.googleDocsMetadata.mimeType || 'application/vnd.google-apps.document'
                  };
                } else if (source.metadata?.youtubeMetadata) {
                  sourcePayload.videoContent = {
                    youtubeUrl: source.metadata.youtubeMetadata.youtubeUrl || source.metadata.youtubeMetadata.uri || source.metadata.youtubeMetadata.url
                  };
                } else if (source.metadata?.agentspaceMetadata) {
                  sourcePayload.agentspaceContent = {
                    documentName: source.metadata.agentspaceMetadata.documentName
                  };
                } else if (source.metadata?.webpageMetadata || source.webScrapeConfig || source.url) {
                  sourcePayload.webContent = {
                    sourceName: sourceName,
                    url: source.metadata?.webpageMetadata?.webpageUrl || source.url || (source.webScrapeConfig && source.webScrapeConfig.url)
                  };
                } else {
                  // Fallback to minimal text content if unidentifiable or unsupported
                  sourcePayload.textContent = {
                    sourceName: sourceName,
                    content: source.content || source.text || `[Restored Source: ${source.name || sourceName}]`
                  };
                }
                return sourcePayload;
              });

              try {
                await api.batchCreateNotebookSources(apiConfig, newNotebookId, sourceRequests);
                addLog(`      - SUCCESS: Batch created ${sourceRequests.length} sources.`);
              } catch (srcErr: any) {
                addLog(`      - ERROR: Failed to batch create sources for notebook '${newNotebookId}': ${srcErr.message}`);
              }
            }
          } catch (err: any) {
            addLog(`    - ERROR: Failed to create notebook '${notebook.displayName}': ${err.message}`);
          }
          await delay(2000); // Rate limit between notebooks
        }
      }
    });
  };

  const promptForSecret = (auth: Authorization, customMessage?: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setSecretPrompt({ auth, resolve, customMessage });
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
      addLog(`Download initiated for ${fileName}.`);
    } catch (err: any) {
      console.error("Failed to download backup", err);
      addLog(`ERROR: Failed to download backup: ${err.message}`);
    } finally {
      setLoadingSection(null);
    }
  };

  const processRestoreAuthorizations = async (backupData: any) => {
     setModalData({
      section: 'Authorizations',
      title: 'Select Authorizations to Restore',
      items: backupData.authorizations || [],
      originalData: backupData,
      processor: async (data) => {
        addLog(`Restoring ${data.authorizations.length} Authorizations...`);
        for (const auth of data.authorizations) {
          const authId = auth.name.split('/').pop()!;
          addLog(`  - Preparing to restore authorization: ${authId}`);

          const clientSecret = await promptForSecret(auth);
          
          if (!clientSecret) {
            addLog(`    - SKIPPED: No client secret provided for ${authId}.`);
            continue;
          }

          const payload = { ...auth };
          payload.serverSideOauth2.clientSecret = clientSecret;

          try {
            await api.createAuthorization(authId, payload, apiConfig);
            addLog(`    - CREATED: Authorization '${authId}'`);
          } catch (err: any) {
            if (err.message && err.message.includes("ALREADY_EXISTS")) {
                addLog(`    - INFO: Authorization '${authId}' already exists. Skipping.`);
            } else {
                addLog(`    - ERROR: Failed to create authorization '${authId}': ${err.message}`);
            }
          }
          await delay(1000);
        }
      }
    });
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
      setSelectedRestoreFiles(prev => ({ ...prev, [section]: value }));
  };

  const cardConfigs: Array<{
    section: string;
    title: string;
    scope: 'Global' | 'User Specific';
    backupHandler: () => Promise<void>;
    restoreProcessor: (data: any) => Promise<void>;
  }> = [
      { section: 'DiscoveryResources', title: 'All Discovery Resources', scope: 'Global', backupHandler: handleBackupDiscovery, restoreProcessor: processRestoreDiscovery },
      { section: 'ReasoningEngine', title: 'Single Agent Engine', scope: 'Global', backupHandler: handleBackupReasoningEngine, restoreProcessor: processRestoreReasoningEngine },
      { section: 'Assistant', title: 'Single Assistant', scope: 'Global', backupHandler: handleBackupAssistant, restoreProcessor: processRestoreAssistant },
      { section: 'Agents', title: 'Agents', scope: 'Global', backupHandler: handleBackupAgents, restoreProcessor: processRestoreAgents },
      { section: 'DataStores', title: 'Data Stores', scope: 'Global', backupHandler: handleBackupDataStores, restoreProcessor: processRestoreDataStores },
      { section: 'Authorizations', title: 'Authorizations', scope: 'Global', backupHandler: handleBackupAuthorizations, restoreProcessor: processRestoreAuthorizations },
      { section: 'NotebookLM', title: 'NotebookLMs', scope: 'User Specific', backupHandler: handleBackupNotebooks, restoreProcessor: processRestoreNotebooks },
      { section: 'ChatHistory', title: 'Chat History', scope: 'User Specific', backupHandler: handleBackupChatHistory, restoreProcessor: async () => { /* Handled by handleRestore special case */ } },
  ];

  return (
    <div className="space-y-6">
      {/* Chat History Archive Viewer Modal */}
      {chatHistoryArchiveData && (
        <ChatHistoryArchiveViewer
          sessions={chatHistoryArchiveData.sessions}
          fileName={chatHistoryArchiveData.fileName}
          onClose={() => setChatHistoryArchiveData(null)}
          config={apiConfig}
        />
      )}

      {/* Restore Selection Modal */}
      {modalData && (
        <RestoreSelectionModal
          isOpen={!!modalData}
          onClose={() => setModalData(null)}
          onConfirm={(selectedItems) => handleConfirmRestore(modalData.section, selectedItems, modalData.processor, modalData.originalData)}
          title={modalData.title}
          items={modalData.items}
          isLoading={isLoading}
        />
      )}
      {secretPrompt && (
        <ClientSecretPrompt
          isOpen={!!secretPrompt}
          authId={secretPrompt.auth.name.split('/').pop() || ''}
          onSubmit={handleSecretSubmit}
          onClose={handleSecretClose}
          customMessage={secretPrompt.customMessage}
        />
      )}
      {infoModalKey && (
        <CurlInfoModal infoKey={infoModalKey} onClose={() => setInfoModalKey(null)} />
      )}

      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-white">Configuration for Backup & Restore</h2>
            <CloudConsoleButton url={`https://console.cloud.google.com/storage/browser/${selectedBucket}?project=${projectNumber}`} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Target Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={handleProjectNumberChange} />
          </div>
          <div>
            <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Target Location (Discovery)</label>
            <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
              <option value="global">global</option>
              <option value="us">us</option>
              <option value="eu">eu</option>
            </select>
          </div>
          <div>
            <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">Target Gemini Enterprise ID</label>
             <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps || apps.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingApps ? 'Loading...' : '-- Select App --'}</option>
              {apps.map(a => {
                  const id = a.name.split('/').pop() || '';
                  return <option key={a.name} value={id}>{a.displayName || id}</option>
              })}
            </select>
          </div>
          
          <div>
            <label htmlFor="reasoningEngineLocation" className="block text-sm font-medium text-gray-400 mb-1">Agent Engine Location</label>
            <select name="reasoningEngineLocation" value={config.reasoningEngineLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
                <option value="us-central1">us-central1</option>
                <option value="europe-west1">europe-west1</option>
                <option value="asia-east1">asia-east1</option>
            </select>
          </div>
          <div>
            <label htmlFor="reasoningEngineId" className="block text-sm font-medium text-gray-400 mb-1">Target Agent Engine</label>
             <select name="reasoningEngineId" value={config.reasoningEngineId} onChange={handleConfigChange} disabled={isLoadingReasoningEngines || reasoningEngines.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingReasoningEngines ? 'Loading...' : '-- Select Engine --'}</option>
              {reasoningEngines.map(re => {
                  const id = re.name.split('/').pop() || '';
                  return <option key={re.name} value={id}>{re.displayName} ({id})</option>
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Backup Bucket (GCS)</label>
            <div className="flex gap-2">
                <select 
                    value={selectedBucket} 
                    onChange={(e) => setSelectedBucket(e.target.value)} 
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 h-[42px]"
                    disabled={isLoadingBuckets || buckets.length === 0}
                >
                    <option value="">{isLoadingBuckets ? 'Loading buckets...' : '-- Select Bucket --'}</option>
                    {buckets.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
            </div>
          </div>
        </div>
      </div>
      
       <div className="space-y-4">
          <h2 className="text-xl font-bold text-white text-center">Backup & Restore Actions (GCS)</h2>
          <p className="text-center text-gray-400 text-sm -mt-2">
              Backups are stored in <strong>gs://{selectedBucket || '...'}</strong>. Select a file from the dropdown to restore.
          </p>
          <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2.5 max-w-4xl mx-auto">
            <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <span className="font-semibold text-amber-300">Metadata Scope Notice:</span> Backups store configuration schemas, settings, and authorization metadata. Data Store backups do not bundle indexed document blobs or raw connector payloads — upon restoration, documents and external connectors must be re-synced from primary data sources.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cardConfigs.map(card => (
                <BackupRestoreCard
                    key={card.section}
                    section={card.section}
                    title={card.title}
                scope={card.scope}
                    onBackup={card.backupHandler}
                    onRestore={handleRestore}
                onDeleteBackup={handleDeleteBackup}
                onDownloadBackup={handleDownloadBackup}
                    processor={card.restoreProcessor}
                    availableBackups={backupFiles[card.section] || []}
                    selectedBackup={selectedRestoreFiles[card.section] || ''}
                    onBackupSelectionChange={handleBackupSelectionChange}
                    loadingSection={loadingSection}
                    isGloballyLoading={isLoading || isLoadingFiles}
                    onShowInfo={setInfoModalKey}
                />
            ))}
        </div>

      {(isLoading || logs.length > 0) && (
        <div className="bg-gray-800 p-4 rounded-lg shadow-md mt-6">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
            {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>}
            {isLoading ? `Running: ${loadingSection?.replace(/[A-Z]/g, ' $&').trim()}` : 'Logs'}
          </h2>
          {error && <div className="text-sm text-red-400 p-2 mb-2 bg-red-900/20 rounded-md">{error}</div>}
          <pre className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-64 overflow-y-auto font-mono">
            {logs.join('\n')}
          </pre>
        </div>
      )}

    </div>
  );
};

export default BackupPage;
