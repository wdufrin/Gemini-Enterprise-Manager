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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GlobalDebugProvider } from './context/GlobalDebugContext';
import Sidebar from './components/Sidebar';
import AgentsPage from './pages/AgentsPage';
import AuthorizationsPage from './pages/AuthorizationsPage';
import { Page, ReasoningEngine, GraphNode, GraphEdge, UserProfile, AppEngine, Authorization, Agent, ServiceAgentValidation, UserPermissionsValidation } from './types';
import AccessTokenInput from './components/AccessTokenInput';
import AgentEnginesPage from './pages/AgentEnginesPage';
import DataStoresPage from './pages/DataStoresPage';
import BackupPage from './pages/BackupPage';
import ModelArmorPage from './pages/ModelArmorPage';
import ObservabilityPage from './pages/ObservabilityPage';
import AgentBuilderPage from './pages/AgentBuilderPage';
import A2aTesterPage from './pages/A2aTesterPage';
import McpServersPage from './pages/McpServersPage';
import AgentCatalogPage from './pages/AgentCatalogPage';
import AgentStarterPackPage from './pages/AgentStarterPackPage';
import CloudRunAgentsPage from './pages/CloudRunAgentsPage';
import DialogflowAgentsPage from './pages/DialogflowAgentsPage';
import ConnectorsPage from './pages/ConnectorsPage';
import ProjectInput from './components/ProjectInput';
import { initGapiClient, getGapiClient } from './services/gapiService';
import * as api from './services/apiService';
import ChatPage from './pages/ChatPage';
import ArchitecturePage from './pages/ArchitecturePage';
import CurlInfoModal from './components/CurlInfoModal';
import DirectQueryChatWindow from './components/agent-engines/DirectQueryChatWindow';
import AssistantPage from './pages/AssistantPage';
import LicensePage from './pages/LicensePage';
import GEQuotaUsagePage from './pages/GEQuotaUsagePage';
import VanityUrlsPage from './pages/VanityUrlsPage';
import AgentPermissionsPage from './pages/AgentPermissionsPage';
import CloudBuildProgress from './components/agent-builder/CloudBuildProgress';
import Breadcrumbs from './components/Breadcrumbs';
import HeaderProjectInput from './components/HeaderProjectInput';
import HelpButton from './components/HelpButton';

declare global {
    interface Window {
        google: any;
    }
}

const ALL_REASONING_ENGINE_LOCATIONS = [
    'us-central1', 'us-east1', 'us-east4', 'us-west1',
    'europe-west1', 'europe-west2', 'europe-west4',
    'asia-east1', 'asia-southeast1'
];
const ALL_DISCOVERY_LOCATIONS = ['global', 'us', 'eu'];
const ALL_CLOUD_RUN_LOCATIONS = [
    'us-central1', 'us-east1', 'us-east4', 'us-west1',
    'europe-west1', 'europe-west2', 'europe-west4',
    'asia-east1', 'asia-southeast1'
];

const DEFAULT_GOOGLE_CLIENT_ID = '180054373655-2b600fnjissdmll4ipj2ndhr0i2h03fj.apps.googleusercontent.com';

const InnerApp: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(Page.AGENTS);
  const [pageContext, setPageContext] = useState<any>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [accessToken, setAccessToken] = useState<string>('');
  const [projectNumber, setProjectNumber] = useState<string>(() => sessionStorage.getItem('agentspace-projectNumber') || '');
    const [projectId, setProjectId] = useState<string>(() => sessionStorage.getItem('agentspace-projectId') || '');
  
  // SSO State
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const userEmailRef = useRef<string | null>(null);
  const tokenClient = useRef<any>(null);
  const tokenExpiryRef = useRef<number | null>(null);
  const isRenewingRef = useRef<boolean>(false);

  // Load client ID from storage, env variables, or config.json
  useEffect(() => {
    const storedClientId = localStorage.getItem('custom-google-client-id');
    if (storedClientId) {
      setGoogleClientId(storedClientId);
      return;
    }

    const viteEnvClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (viteEnvClientId) {
      setGoogleClientId(viteEnvClientId);
      return;
    }

    fetch('/config.json')
      .then(res => res.json())
      .then(data => {
        if (data && data.GOOGLE_CLIENT_ID) {
          setGoogleClientId(data.GOOGLE_CLIENT_ID);
        } else {
          setGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID);
        }
      })
      .catch(() => {
        setGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID);
      });
  }, []);

  // State for the initialization and login flow
  const [isGapiInitialized, setIsGapiInitialized] = useState(false);
  const [isGapiReady, setIsGapiReady] = useState(false); // New state for two-stage welcome screen
  const [isGapiLoading, setIsGapiLoading] = useState(false);
  const [isTokenValidating, setIsTokenValidating] = useState(false);
  const [gapiError, setGapiError] = useState<string | null>(null);

  // State for API validation check
  const [isApiValidationLoading, setIsApiValidationLoading] = useState(false);
  const [apiValidationResult, setApiValidationResult] = useState<{ enabled: string[], disabled: string[] } | null>(null);
  const [serviceAgentValidation, setServiceAgentValidation] = useState<ServiceAgentValidation | null>(null);
  const [userPermissionsValidation, setUserPermissionsValidation] = useState<UserPermissionsValidation | null>(null);
  const [isGrantingServiceAgent, setIsGrantingServiceAgent] = useState(false);
  const [serviceAgentActionFeedback, setServiceAgentActionFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showAllUserPermissions, setShowAllUserPermissions] = useState(false);
  const [activeValidationTab, setActiveValidationTab] = useState<'all' | 'apis' | 'serviceAgent' | 'permissions'>('all');
  const [showOAuthSettings, setShowOAuthSettings] = useState(false);

  // State for enabling APIs
  const [apisToEnable, setApisToEnable] = useState<Set<string>>(new Set());
  const [isApiEnablingLoading, setIsApiEnablingLoading] = useState(false);
  const [apiEnablementLogs, setApiEnablementLogs] = useState<string[]>([]);

  // State for modals
  const [infoModalKey, setInfoModalKey] = useState<string | null>(null);
  const [directQueryEngine, setDirectQueryEngine] = useState<ReasoningEngine | null>(null);

  // State for Architecture Page (lifted state for caching)
  const [architectureNodes, setArchitectureNodes] = useState<GraphNode[]>([]);
  const [architectureEdges, setArchitectureEdges] = useState<GraphEdge[]>([]);
  const [architectureLogs, setArchitectureLogs] = useState<string[]>([]);
  const [isArchitectureLoading, setIsArchitectureLoading] = useState(false);
  const [architectureError, setArchitectureError] = useState<string | null>(null);

    // Global State for Authorizations
    const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
    const [authUsage, setAuthUsage] = useState<Record<string, Agent[]>>({});
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [isScanningAuthAgents, setIsScanningAuthAgents] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [hasAuthLoaded, setHasAuthLoaded] = useState(false);

  // Global State for Cloud Build Progress
    const [activeBuilds, setActiveBuilds] = useState<{ id: string, projectId: string }[]>([]);

    const handleBuildTriggered = (buildId: string, buildProjectId?: string) => {
        const pid = buildProjectId || projectNumber || projectId; // Fallback to global context
        setActiveBuilds(prev => {
            // Deduplicate
            if (prev.some(b => b.id === buildId)) return prev;
            return [...prev, { id: buildId, projectId: pid }];
        });
  };

  const handleRemoveBuild = (buildId: string) => {
      setActiveBuilds(prev => prev.filter(b => b.id !== buildId));
  };


  const handleSetAccessToken = useCallback((token: string) => {
    const trimmedToken = token.trim();
    setAccessToken(trimmedToken); // Keep main state in sync
    
    if (trimmedToken) {
      setIsGapiLoading(true);
      setIsTokenValidating(false);
      setGapiError(null);
      setApiValidationResult(null);
      setApisToEnable(new Set());
      setApiEnablementLogs([]);
      
      initGapiClient(trimmedToken)
        .then(() => {
          console.log("Google API Client Initialized Successfully. Validating token...");
          setIsGapiLoading(false);
          setIsTokenValidating(true);
          // Perform a lightweight API call to validate the token's usability.
          return getGapiClient().then(client => client.cloudresourcemanager.projects.list({ pageSize: 1 }));
        })
        .then(() => {
          console.log("Token validated successfully.");
          setIsGapiReady(true);
          setGapiError(null);
        })
        .catch((err: any) => {
          console.error("GAPI initialization or token validation failed", err);
          let detailMessage = 'An unknown error occurred.';
          if (typeof err === 'string') {
              detailMessage = err;
          } else if (err instanceof Error) {
              detailMessage = err.message;
          } else if (err?.result?.error?.message) {
              detailMessage = err.result.error.message;
          } else {
              try {
                  detailMessage = JSON.stringify(err, null, 2);
              } catch {
                  detailMessage = 'A non-serializable error object was caught.';
              }
          }
          const errorMessage = `Failed to initialize or validate the token. Details: ${detailMessage}. The access token might be invalid, expired, or missing required scopes (e.g., cloud-platform).`;
          setGapiError(errorMessage);
          setIsGapiReady(false);
        })
        .finally(() => {
          setIsGapiLoading(false);
          setIsTokenValidating(false);
        });
    } else {
        setIsGapiReady(false);
        setIsGapiInitialized(false);
    }
  }, []);

  // Initialize Token Client
  useEffect(() => {

      if (window.google && window.google.accounts && googleClientId) {
          tokenClient.current = window.google.accounts.oauth2.initTokenClient({
              client_id: googleClientId,
              // Update scopes to include Dialogflow
              scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/dialogflow',
              callback: (tokenResponse: any) => {
                  if (tokenResponse && tokenResponse.access_token) {
                      handleSetAccessToken(tokenResponse.access_token);
                      
                      // Keep track of token expiry
                      const expiresIn = tokenResponse.expires_in || 3600;
                      tokenExpiryRef.current = Date.now() + (expiresIn * 1000);
                      isRenewingRef.current = false;

                      // Fetch user profile
                      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                      })
                      .then(res => res.json())
                      .then(data => {
                          setUserProfile({
                              name: data.name,
                              email: data.email,
                              picture: data.picture
                          });
                          userEmailRef.current = data.email;
                      })
                      .catch(e => console.error("Failed to fetch user profile", e));
                  }
              },
          });
          
          // Try to obtain a token silently on load
          try {
              tokenClient.current.requestAccessToken({ prompt: 'none' });
          } catch (e) {
              console.log("Silent login not available on mount:", e);
          }
      }
  }, [googleClientId, handleSetAccessToken]);

    // Passive Auto-Renewal on user activity
    useEffect(() => {
        const handleActivity = () => {
            if (!tokenExpiryRef.current || isRenewingRef.current || !tokenClient.current) return;

            const now = Date.now();
            const timeToExpiry = tokenExpiryRef.current - now;

            // If expiring in less than 30 minutes (1,800,000 ms) and not already expired
            if (timeToExpiry < 1800000 && timeToExpiry > -60000) {
                console.log("Token expiring soon, renewing on user activity...");
                isRenewingRef.current = true;
                const requestConfig: any = { prompt: 'none' }; // try 'none' first
                if (userEmailRef.current) {
                    requestConfig.login_hint = userEmailRef.current;
                }
                tokenClient.current.requestAccessToken(requestConfig);
            }
        };

        // Listen for multiple types of trusted user interactions
        window.addEventListener('click', handleActivity);
        window.addEventListener('keydown', handleActivity);

        return () => {
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('keydown', handleActivity);
        };
    }, []);

  const handleGoogleSignIn = () => {
      if (tokenClient.current) {
          tokenClient.current.requestAccessToken();
      } else {
          setGapiError("Token client initializing... please try again in a moment.");
      }
  };

  const handleSignOut = () => {
      setAccessToken('');
      setUserProfile(null);
      setIsGapiInitialized(false);
      setIsGapiReady(false);
  };
  
    const handleSetProjectNumber = async (identifier: string) => {
        // If identifier is empty, clear everything
        if (!identifier) {
            sessionStorage.removeItem('agentspace-projectNumber');
            sessionStorage.removeItem('agentspace-projectId');
            setProjectNumber('');
            setProjectId('');
            setApiValidationResult(null);
            setArchitectureNodes([]);
            setArchitectureEdges([]);
            setArchitectureLogs([]);
            setAuthorizations([]);
            setAuthUsage({});
            setHasAuthLoaded(false);
            return;
        }

        // Check if we already have this identifier stored as number or ID to avoid refetching if possible
        // But since we want to ensure we have both, it's safer to just fetch if it looks like a change.

        // Optimistic update if it looks like a number
        if (/^\d+$/.test(identifier)) {
            sessionStorage.setItem('agentspace-projectNumber', identifier);
            setProjectNumber(identifier);
        } else {
            // Optimistic update if it looks like an ID
            sessionStorage.setItem('agentspace-projectId', identifier);
            setProjectId(identifier);
        }

        try {
            const projectDetails = await api.getProject(identifier);

            // Update state with canonical values
            setProjectNumber(projectDetails.projectNumber);
            setProjectId(projectDetails.projectId);

            sessionStorage.setItem('agentspace-projectId', projectDetails.projectId);

            // Reset dependent states
            setApiValidationResult(null);
            setArchitectureNodes([]);
            setArchitectureEdges([]);
            setArchitectureLogs([]);
            setAuthorizations([]);
            setAuthUsage({});
            setHasAuthLoaded(false);
        } catch (e) {
            console.error("Failed to resolve project details", e);
            // Fallback: Use whatever we have
            if (/^\d+$/.test(identifier)) {
                setProjectNumber(identifier);
            } else {
                // If we failed to resolve an ID, we might not have a number, which breaks API calls.
                // But we can let the user try.
            }
        }
  };
  
  const handleValidateApis = async () => {
    const targetProject = projectId || projectNumber;
    if (!targetProject) return;
    setIsApiValidationLoading(true);
    setApiValidationResult(null);
    setServiceAgentValidation(null);
    setUserPermissionsValidation(null);
    setServiceAgentActionFeedback(null);
    setApisToEnable(new Set());
    setApiEnablementLogs([]);
    setGapiError(null);
    try {
      const result = await api.runComprehensiveProjectValidation(targetProject, projectNumber || targetProject);
      setApiValidationResult(result.apis);
      setServiceAgentValidation(result.serviceAgent);
      setUserPermissionsValidation(result.userPermissions);
    } catch (err: any) {
      setGapiError(`Validation check failed: ${err.message}. Ensure the Service Usage API is enabled.`);
    } finally {
      setIsApiValidationLoading(false);
    }
  };

  const handleGrantServiceAgent = async () => {
    const targetProject = projectId || projectNumber;
    if (!targetProject || !projectNumber) return;
    setIsGrantingServiceAgent(true);
    setServiceAgentActionFeedback(null);
    try {
      await api.grantDiscoveryEngineServiceAgentRole(targetProject, projectNumber, ['roles/aiplatform.user']);
      setServiceAgentActionFeedback({
        type: 'success',
        message: 'Successfully assigned roles/discoveryengine.serviceAgent and roles/aiplatform.user to Discovery Engine Service Agent!'
      });
      // Refresh SA check
      const updatedSA = await api.checkDiscoveryEngineServiceAgent(targetProject, projectNumber);
      setServiceAgentValidation(updatedSA);
    } catch (err: any) {
      setServiceAgentActionFeedback({
        type: 'error',
        message: `Failed to grant Service Agent role: ${err.message}. You need roles/resourcemanager.projectIamAdmin or Project Owner privileges.`
      });
    } finally {
      setIsGrantingServiceAgent(false);
    }
  };

  const handleToggleApiToEnable = (apiName: string) => {
    setApisToEnable(prev => {
        const newSet = new Set(prev);
        if (newSet.has(apiName)) {
            newSet.delete(apiName);
        } else {
            newSet.add(apiName);
        }
        return newSet;
    });
  };

  const handleToggleAllApisToEnable = () => {
    if (apiValidationResult?.disabled) {
        if (apisToEnable.size === apiValidationResult.disabled.length) {
            setApisToEnable(new Set()); // Deselect all
        } else {
            setApisToEnable(new Set(apiValidationResult.disabled)); // Select all
        }
    }
  };

  const addEnablementLog = (log: string) => {
    setApiEnablementLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${log}`]);
  };

  const handleEnableApis = async () => {
    if (apisToEnable.size === 0) return;
    
    setIsApiEnablingLoading(true);
    setApiEnablementLogs([]);
    setGapiError(null);
    
    addEnablementLog(`Starting to enable ${apisToEnable.size} API(s)...`);
    try {
        const operation = await api.batchEnableApis(projectNumber, Array.from(apisToEnable));
        addEnablementLog(`Enablement operation started: ${operation.name}`);
        
        let currentOperation = operation;
        while (!currentOperation.done) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            currentOperation = await api.getServiceUsageOperation(operation.name);
            addEnablementLog('Polling for operation status...');
        }
        
        if (currentOperation.error) {
            throw new Error(`Operation failed: ${currentOperation.error.message}`);
        }
        
        addEnablementLog('API enablement successful! Re-validating...');
        setApisToEnable(new Set());
        await handleValidateApis();

    } catch (err: any) {
        const message = `API enablement failed: ${err.message}`;
        setGapiError(message);
        addEnablementLog(`ERROR: ${message}`);
    } finally {
        setIsApiEnablingLoading(false);
    }
  };

  const handleEnterApp = () => {
    if (isGapiReady && projectNumber) {
        setIsGapiInitialized(true);
    } else {
        setGapiError("Cannot enter application. Ensure the API client is initialized and a project is set.");
    }
  };

  const handleShowInfo = (infoKey: string) => {
    setInfoModalKey(infoKey);
  };

  const handleCloseInfoModal = () => {
    setInfoModalKey(null);
  };
  
  const handleNavigation = (page: Page, context: any = null) => {
    setCurrentPage(page);
    setPageContext(context);
  };

    const handleMenuClick = (page: Page) => {
        if (page === currentPage) {
            // Force remount to reset state
            setRefreshKey(prev => prev + 1);
            setPageContext(null);
        } else {
            setCurrentPage(page);
            setPageContext(null);
        }
    };
  
  const handleDirectQuery = (engine: ReasoningEngine) => {
    setDirectQueryEngine(engine);
  };

  const handleArchitectureScan = useCallback(async () => {
        if (!projectNumber) {
            setArchitectureError("Project ID/Number is required to scan the architecture.");
            return;
        }
        setIsArchitectureLoading(true);
        setArchitectureError(null);
        setArchitectureLogs([]);
        setArchitectureNodes([]);
        setArchitectureEdges([]);

        const addLog = (message: string) => {
            setArchitectureLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
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
                const existingNode = newNodes.find(n => n.id === node.id);
                if (existingNode) {
                    existingNode.data = { ...existingNode.data, ...node.data };
                }
            }
        };

        const addEdge = (sourceId: string, targetId: string) => {
            const edgeId = `${sourceId}__to__${targetId}`;
            if (foundNodeIds.has(sourceId) && foundNodeIds.has(targetId)) {
                 newEdges.push({ id: edgeId, source: sourceId, target: targetId });
            } else {
                addLog(`SKIPPED_EDGE: Cannot draw link from ${sourceId.split('/').pop()} to ${targetId.split('/').pop()} as one of the resources was not found in the scan.`);
            }
        };
        
        const apiConfig = { projectId: projectNumber, appLocation: 'global', collectionId: '', appId: '', assistantId: ''};

        try {
            addLog("Starting architecture scan...");
            
            const projectNodeId = `projects/${projectNumber}`;
            addNode({ id: projectNodeId, type: 'Project', label: `Project (${projectNumber})`, data: { name: projectNodeId } });

            addLog("Fetching all Authorizations and Agent Engines...");
            const [authResponse, allReasoningEngines] = await Promise.all([
                api.listAuthorizations(apiConfig).catch(e => { addLog(`WARNING: Could not fetch authorizations: ${e.message}`); return { authorizations: [] }; }),
                Promise.all(ALL_REASONING_ENGINE_LOCATIONS.map(loc =>
                    api.listReasoningEngines({ ...apiConfig, reasoningEngineLocation: loc })
                        .then(res => res.reasoningEngines || [])
                        .catch(e => { addLog(`NOTE: Could not scan Agent Engines in ${loc}: ${e.message}`); return []; })
                )).then(results => results.flat())
            ]);

            const authorizations = authResponse.authorizations || [];
            authorizations.forEach(auth => addNode({ id: auth.name, type: 'Authorization', label: auth.name.split('/').pop()!, data: auth }));
            allReasoningEngines.forEach(re => addNode({ id: re.name, type: 'ReasoningEngine', label: re.displayName, data: re }));
            addLog(`Found ${authorizations.length} authorizations and ${allReasoningEngines.length} agent engines across all locations.`);

            // Scan Cloud Run Services
            addLog("Scanning Cloud Run Services across all regions...");
            const cloudRunPromises = ALL_CLOUD_RUN_LOCATIONS.map(loc => 
                api.listCloudRunServices({ projectId: projectNumber } as any, loc)
                    .then(res => res.services || [])
                    .catch(e => { addLog(`NOTE: Could not scan Cloud Run in ${loc}: ${e.message}`); return []; })
            );
            const allCloudRunServices = (await Promise.all(cloudRunPromises)).flat();
            
            for (const service of allCloudRunServices) {
                // Ensure Location node exists for this service
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
                addLog(`Scanning discovery location: ${location}...`);
                const locationNodeId = `${projectNodeId}/locations/${location}`;
                addNode({ id: locationNodeId, type: 'Location', label: location, data: { name: locationNodeId } });
                addEdge(projectNodeId, locationNodeId);

                const locationConfig = { ...apiConfig, appLocation: location, collectionId: 'default_collection' };
                
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
                } catch (e: any) {
                    addLog(`NOTE: Could not scan for Data Stores in ${location}: ${e.message}`);
                }

                try {
                    const enginesResponse = await api.listResources('engines', locationConfig);
                    const engines: AppEngine[] = enginesResponse.engines || [];
                    if (engines.length === 0) continue;

                    addLog(`  Found ${engines.length} App/Engine(s) in ${location}.`);
                    for (const engine of engines) {
                        addNode({ id: engine.name, type: 'Engine', label: engine.displayName, data: engine });
                        addEdge(collectionNodeId, engine.name);

                        // Fetch full engine details to find direct data store links
                        try {
                            const fullEngine = await api.getEngine(engine.name, locationConfig);
                            // Update the node data with the full details, including dataStoreIds
                            const existingNode = newNodes.find(n => n.id === engine.name);
                            if (existingNode) existingNode.data = fullEngine;
                            
                            if (fullEngine.dataStoreIds && fullEngine.dataStoreIds.length > 0) {
                                addLog(`    - Engine '${engine.displayName}' is linked to ${fullEngine.dataStoreIds.length} data store(s).`);
                                for (const dsId of fullEngine.dataStoreIds) {
                                    const fullDsName = `projects/${projectNumber}/locations/${location}/collections/default_collection/dataStores/${dsId}`;
                                    
                                    // The data store should have been found already. If not, add a placeholder.
                                    if (!foundNodeIds.has(fullDsName)) {
                                         addLog(`    - WARNING: Engine '${engine.displayName}' links to DataStore '${dsId}' which was not found in the initial scan. Adding a placeholder node.`);
                                         addNode({ id: fullDsName, type: 'DataStore', label: dsId, data: { name: fullDsName, error: 'Not found in initial scan' } });
                                    }
                                    addEdge(engine.name, fullDsName);
                                }
                            }
                        } catch (e: any) {
                            addLog(`    - NOTE: Could not get full details for engine '${engine.displayName}' to find linked data stores: ${e.message}`);
                        }

                        // Robustly list assistants
                        let assistants: any[] = [];
                        try {
                            const assistantConfig = { ...locationConfig, appId: engine.name.split('/').pop()! };
                            const assistantsResponse = await api.listResources('assistants', assistantConfig);
                            assistants = assistantsResponse.assistants || [];
                        } catch (assistantListErr: any) {
                            addLog(`    - WARNING: Could not list assistants for engine '${engine.displayName}': ${assistantListErr.message}`);
                            continue; // Skip to next engine
                        }

                        for (const assistant of assistants) {
                            addNode({ id: assistant.name, type: 'Assistant', label: assistant.displayName, data: assistant });
                            addEdge(engine.name, assistant.name);

                            // Robustly list agents
                            let agents: any[] = [];
                            try {
                                const assistantConfig = { ...locationConfig, appId: engine.name.split('/').pop()!, assistantId: assistant.name.split('/').pop()! };
                                const agentsResponse = await api.listResources('agents', assistantConfig);
                                agents = agentsResponse.agents || [];
                            } catch (agentListErr: any) {
                                addLog(`      - WARNING: Could not list agents for assistant '${assistant.displayName}': ${agentListErr.message}`);
                                continue; // Skip to next assistant
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
                                            if (agentUrl.includes("/reasoningEngines/")) {
                                                const parts = agentUrl.split("/reasoningEngines/");
                                                if (parts.length > 1) {
                                                    const engineId = parts[1].split("/")[0];
                                                    const matchingRe = allReasoningEngines.find(re => re.name.endsWith(`/reasoningEngines/${engineId}`));
                                                    if (matchingRe) {
                                                        addEdge(agent.name, matchingRe.name);
                                                    }
                                                }
                                            } else {
                                                const matchingService = allCloudRunServices.find(s => s.uri && agentUrl.startsWith(s.uri));
                                                if (matchingService) {
                                                    addEdge(agent.name, matchingService.name);
                                                }
                                            }
                                        }
                                    } catch (e: any) {
                                        addLog(`      - WARNING: Failed to parse A2A agent card JSON for agent '${agent.displayName}': ${e.message}`);
                                    }
                                }

                                (agent.authorizationConfig?.toolAuthorizations || agent.authorizations || []).forEach(authName => addEdge(agent.name, authName));

                                try {
                                    const assistantConfig = { ...locationConfig, appId: engine.name.split('/').pop()!, assistantId: assistant.name.split('/').pop()! };
                                    const agentView = await api.getAgentView(agent.name, assistantConfig);
                                    const findDataStoreIds = (obj: any): string[] => {
                                        if (!obj || typeof obj !== 'object') return [];
                                        return Object.values(obj).flatMap((value: any) => {
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
                                            } catch (dsError: any) {
                                                addLog(`WARNING: Could not fetch details for DataStore ${dsId}: ${dsError.message}`);
                                                addNode({ id: dsId, type: 'DataStore', label: dsId.split('/').pop()!, data: { name: dsId, error: 'Could not fetch details' } });
                                            }
                                        }
                                        addEdge(agent.name, dsId);
                                    }
                                } catch (viewError: any) {
                                    // 403 Errors are expected here if the user lacks granular permissions
                                    addLog(`NOTE: Could not get agent view for ${agent.displayName} to find data stores: ${viewError.message}`);
                                }
                            }
                        }
                    }
                } catch(e: any) {
                    addLog(`NOTE: No resources found or error in location '${location}': ${e.message}`);
                }
            }

            setArchitectureNodes(newNodes);
            setArchitectureEdges(newEdges);
            addLog("Scan complete. Rendering graph...");

        } catch (err: any) {
            const message = err instanceof Error ? err.message : 'An unknown error occurred';
            setArchitectureError(message);
            addLog(`FATAL ERROR: ${message}`);
        } finally {
            setIsArchitectureLoading(false);
        }
    }, [projectNumber]);


  // Note: Session token load removed in favor of direct browser silent refresh on load.

  const renderPage = () => {
    const commonProps = { projectNumber };
    const projectProps = { ...commonProps, setProjectNumber: handleSetProjectNumber };

    switch (currentPage) {
      case Page.AGENTS:
        return <AgentsPage {...projectProps} context={pageContext} accessToken={accessToken} />;
      case Page.ASSISTANT:
            return <AssistantPage projectId={projectId} {...projectProps} accessToken={accessToken} userProfile={userProfile} onBuildTriggered={handleBuildTriggered} />;
      case Page.AUTHORIZATIONS:
            return <AuthorizationsPage
                {...commonProps}
                authorizations={authorizations}
                setAuthorizations={setAuthorizations}
                authUsage={authUsage}
                setAuthUsage={setAuthUsage}
                isLoading={isAuthLoading}
                setIsLoading={setIsAuthLoading}
                isScanningAgents={isScanningAuthAgents}
                setIsScanningAgents={setIsScanningAuthAgents}
                error={authError}
                setError={setAuthError}
                hasLoaded={hasAuthLoaded}
                setHasLoaded={setHasAuthLoaded}
            />;
      case Page.AGENT_PERMISSIONS:
        return <AgentPermissionsPage {...projectProps} />;
      case Page.AGENT_ENGINES:
        return <AgentEnginesPage {...commonProps} onNavigate={handleNavigation} accessToken={accessToken} onDirectQuery={handleDirectQuery} />;
      case Page.A2A_TESTER:
        return <A2aTesterPage {...projectProps} onNavigate={handleNavigation} accessToken={accessToken} />;
      case Page.AGENT_BUILDER:
        return <AgentBuilderPage {...projectProps} context={pageContext} onBuildTriggered={handleBuildTriggered} />;
      case Page.AGENT_CATALOG:
            return <AgentCatalogPage {...projectProps} accessToken={accessToken} onBuildTriggered={(id) => handleBuildTriggered(id, projectNumber)} />;
        case Page.AGENT_STARTER_PACK:
            return <AgentStarterPackPage {...projectProps} accessToken={accessToken} onBuildTriggered={handleBuildTriggered} />;
      case Page.CLOUD_RUN_AGENTS:
        return <CloudRunAgentsPage {...projectProps} />;
      case Page.DIALOGFLOW_AGENTS:
        return <DialogflowAgentsPage {...projectProps} accessToken={accessToken} />;
      case Page.CHAT:
            return <ChatPage {...projectProps} accessToken={accessToken} context={pageContext} userProfile={userProfile} />;
      case Page.DATA_STORES:
        return <DataStoresPage {...commonProps} />;
      case Page.MCP_SERVERS:
        return <McpServersPage {...commonProps} />;
      case Page.MODEL_ARMOR:
        return <ModelArmorPage {...projectProps} />;
      case Page.OBSERVABILITY:
        return <ObservabilityPage {...projectProps} projectId={projectId} />;
      case Page.BACKUP_RECOVERY:
        return <BackupPage {...projectProps} accessToken={accessToken} />;
      case Page.LICENSE:
        return <LicensePage {...projectProps} onBuildTriggered={handleBuildTriggered} />;
      case Page.GE_QUOTA_USAGE:
        return <GEQuotaUsagePage projectNumber={projectNumber} />;
      case Page.VANITY_URLS:
        return <VanityUrlsPage {...projectProps} onBuildTriggered={handleBuildTriggered} />;
      case Page.CONNECTORS:
            return <ConnectorsPage {...projectProps} accessToken={accessToken} />;
      case Page.ARCHITECTURE:
        return <ArchitecturePage 
                    {...projectProps} 
                    onNavigate={handleNavigation} 
                    onDirectQuery={handleDirectQuery}
                    nodes={architectureNodes}
                    edges={architectureEdges}
                    logs={architectureLogs}
                    isLoading={isArchitectureLoading}
                    error={architectureError}
                    onScan={handleArchitectureScan}
                />;
      default:
        return <AgentsPage {...projectProps} accessToken={accessToken} />;
    }
  };

  const renderApiValidationResults = () => {
    if (!apiValidationResult && !serviceAgentValidation && !userPermissionsValidation) return null;
    
    const renderList = (items: string[], isSuccess: boolean) => (
      <ul className="space-y-1.5">
        {items.map(item => {
          const serviceUrl = `https://console.cloud.google.com/apis/library/${item}?project=${projectNumber}`;
          return (
            <li key={item} className={`flex items-center text-xs ${isSuccess ? 'text-green-300' : 'text-red-300'} bg-gray-950/40 px-2.5 py-1.5 rounded border ${isSuccess ? 'border-green-900/30' : 'border-red-900/40'}`}>
              {!isSuccess && (
                  <input
                      type="checkbox"
                      checked={apisToEnable.has(item)}
                      onChange={() => handleToggleApiToEnable(item)}
                      className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 mr-2.5 shrink-0"
                      disabled={isApiEnablingLoading}
                  />
              )}
              {isSuccess ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
              )}
              <span className="font-mono">{item}</span>
              {!isSuccess && <a href={serviceUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-400 hover:underline">[View in Console]</a>}
            </li>
          );
        })}
      </ul>
    );

    return (
        <div className="mt-6 space-y-4">
            {/* Validation Section Tabs */}
            <div className="flex border-b border-gray-700 gap-1 pb-1">
                {[
                    { id: 'all', label: 'All Checks' },
                    { id: 'serviceAgent', label: 'Service Agent' },
                    { id: 'permissions', label: 'User Access' },
                    { id: 'apis', label: `APIs (${apiValidationResult?.enabled.length || 0}/13)` },
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveValidationTab(tab.id as any)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                            activeValidationTab === tab.id
                                ? 'bg-gray-800 text-blue-400 border-t-2 border-blue-500'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 1. Discovery Engine Service Agent Check */}
            {(activeValidationTab === 'all' || activeValidationTab === 'serviceAgent') && serviceAgentValidation && (
                <div className="p-4 bg-gray-900/60 rounded-lg border border-gray-700/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <h4 className="text-sm font-bold text-white">Discovery Engine Service Agent</h4>
                        </div>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border self-start sm:self-auto ${
                            serviceAgentValidation.hasRequiredRole
                                ? 'bg-green-900/50 text-green-300 border-green-700'
                                : serviceAgentValidation.status === 'PERMISSION_DENIED'
                                    ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                                    : 'bg-red-900/50 text-red-300 border-red-700'
                        }`}>
                            {serviceAgentValidation.hasRequiredRole
                                ? '🟢 Service Agent Authorized'
                                : serviceAgentValidation.status === 'PERMISSION_DENIED'
                                    ? '⚠️ IAM Inspection Scoped'
                                    : '❌ Missing Service Agent Role'}
                        </span>
                    </div>

                    <div className="text-xs text-gray-300 space-y-1 bg-gray-950/60 p-3 rounded border border-gray-800 font-mono break-all">
                        <span className="text-gray-500 block text-[11px] font-sans">Expected Service Identity:</span>
                        <span className="text-blue-300">{serviceAgentValidation.email}</span>
                    </div>

                    {serviceAgentValidation.hasRequiredRole ? (
                        <div className="space-y-2">
                            <p className="text-xs text-green-300">
                                Primary role <code className="bg-gray-800 px-1 py-0.5 rounded text-green-200">roles/discoveryengine.serviceAgent</code> is actively bound on this project.
                            </p>
                            {serviceAgentValidation.assignedRoles.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {serviceAgentValidation.assignedRoles.map(role => (
                                        <span key={role} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">
                                            {role}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : serviceAgentValidation.status === 'PERMISSION_DENIED' ? (
                        <div className="text-xs text-yellow-300 bg-yellow-950/30 p-3 rounded border border-yellow-900/50 space-y-1">
                            <p className="font-semibold">Notice: Current user cannot inspect project-level IAM policy.</p>
                            <p className="text-yellow-400/80 text-[11px]">
                                {serviceAgentValidation.errorMessage} If assistants experience execution errors, verify that <code className="text-yellow-200">{serviceAgentValidation.email}</code> has <code className="text-yellow-200">roles/discoveryengine.serviceAgent</code> in GCP IAM Console.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="text-xs text-red-300 bg-red-950/30 p-3 rounded border border-red-900/50 space-y-1">
                                <p className="font-bold">Required Role Missing: roles/discoveryengine.serviceAgent</p>
                                <p className="text-red-300/80 text-[11px]">
                                    Discovery Engine uses this service identity to ground search queries, crawl data stores, and orchestrate reasoning engines. Without this role, agent execution and data indexing will fail.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleGrantServiceAgent}
                                disabled={isGrantingServiceAgent}
                                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white text-xs font-bold rounded-md shadow transition-colors flex items-center justify-center gap-2"
                            >
                                {isGrantingServiceAgent ? (
                                    <>
                                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white"></div>
                                        Granting Service Agent Role...
                                    </>
                                ) : (
                                    '+ Grant Discovery Engine Service Agent Role'
                                )}
                            </button>
                        </div>
                    )}

                    {serviceAgentActionFeedback && (
                        <div className={`p-2.5 rounded text-xs ${
                            serviceAgentActionFeedback.type === 'success'
                                ? 'bg-green-900/40 text-green-200 border border-green-800'
                                : 'bg-red-900/40 text-red-200 border border-red-800'
                        }`}>
                            {serviceAgentActionFeedback.message}
                        </div>
                    )}
                </div>
            )}

            {/* 2. User Permissions Audit */}
            {(activeValidationTab === 'all' || activeValidationTab === 'permissions') && userPermissionsValidation && (
                <div className="p-4 bg-gray-900/60 rounded-lg border border-gray-700/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <h4 className="text-sm font-bold text-white">Caller / User Permissions Audit</h4>
                        </div>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border self-start sm:self-auto ${
                            userPermissionsValidation.hasAdminAccess
                                ? 'bg-green-900/50 text-green-300 border-green-700'
                                : 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                        }`}>
                            {userPermissionsValidation.grantedCount} of {userPermissionsValidation.totalCount} Permissions Verified
                        </span>
                    </div>

                    {userPermissionsValidation.missingCritical.length > 0 && (
                        <div className="text-xs text-yellow-300 bg-yellow-950/30 p-3 rounded border border-yellow-900/50 space-y-1">
                            <p className="font-bold">Missing Core Discovery Engine Privileges</p>
                            <p className="text-yellow-400/80 text-[11px]">
                                Your account is missing: <code className="text-yellow-200">{userPermissionsValidation.missingCritical.join(', ')}</code>. Request <code className="text-yellow-200">roles/discoveryengine.admin</code> or <code className="text-yellow-200">roles/discoveryengine.editor</code> from your project administrator.
                            </p>
                        </div>
                    )}

                    {userPermissionsValidation.notice && (
                        <p className="text-xs text-gray-400 bg-gray-950/40 p-2.5 rounded border border-gray-800">
                            {userPermissionsValidation.notice}
                        </p>
                    )}

                    {/* Permissions Group Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {['Discovery Engine Admin', 'IAM & Security', 'Service Management', 'Vertex AI / Reasoning'].map(cat => {
                            const groupItems = userPermissionsValidation.items.filter(i => i.category === cat);
                            const grantedInGroup = groupItems.filter(i => i.granted).length;
                            const isAllGranted = grantedInGroup === groupItems.length;

                            return (
                                <div key={cat} className="p-2.5 bg-gray-950/40 rounded border border-gray-800 text-xs space-y-1">
                                    <div className="flex justify-between items-center">
                                        <span className="font-semibold text-gray-200">{cat}</span>
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                            isAllGranted ? 'bg-green-900/60 text-green-300' : 'bg-yellow-900/60 text-yellow-300'
                                        }`}>
                                            {grantedInGroup}/{groupItems.length}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-400">
                                        {isAllGranted ? 'All capabilities verified.' : 'Some management operations may be restricted.'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={() => setShowAllUserPermissions(!showAllUserPermissions)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                        >
                            {showAllUserPermissions ? '▲ Hide Granular Permissions' : '▼ View All Granular Permissions Tested'}
                        </button>

                        {showAllUserPermissions && (
                            <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto pr-1">
                                {userPermissionsValidation.items.map(item => (
                                    <div key={item.permission} className="flex items-center justify-between p-2 rounded bg-gray-950/60 border border-gray-800 text-xs">
                                        <div className="flex items-center gap-2">
                                            {item.granted ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                            <div>
                                                <span className="font-mono text-gray-200 block text-[11px]">{item.permission}</span>
                                                <span className="text-[10px] text-gray-400">{item.description}</span>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-gray-500 font-mono ml-2 whitespace-nowrap">{item.recommendedRole}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 3. API Validation Results */}
            {(activeValidationTab === 'all' || activeValidationTab === 'apis') && apiValidationResult && (
                <div className="p-4 bg-gray-900/60 rounded-lg border border-gray-700/80 space-y-3">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Required Google Cloud APIs ({apiValidationResult.enabled.length} of 13 Enabled)
                        </h4>
                    </div>

                    {apiValidationResult.disabled.length > 0 && (
                        <div className="mb-4 space-y-2">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h5 className="font-bold text-red-400 text-xs">Disabled APIs ({apiValidationResult.disabled.length})</h5>
                                    <p className="text-[11px] text-red-300">These APIs must be enabled for Gemini Enterprise to function properly.</p>
                                </div>
                                <label className="flex items-center text-xs text-gray-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        onChange={handleToggleAllApisToEnable}
                                        checked={apiValidationResult.disabled.length > 0 && apisToEnable.size === apiValidationResult.disabled.length}
                                        disabled={isApiEnablingLoading}
                                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 mr-2"
                                    />
                                    Select All
                                </label>
                            </div>
                            {renderList(apiValidationResult.disabled, false)}
                            
                            <div className="mt-3 pt-3 border-t border-gray-800">
                                <button
                                    onClick={handleEnableApis}
                                    disabled={apisToEnable.size === 0 || isApiEnablingLoading}
                                    className="w-full px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white text-xs font-bold rounded-md shadow transition-colors flex items-center justify-center"
                                >
                                    {isApiEnablingLoading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                            Enabling APIs...
                                        </>
                                    ) : `Enable ${apisToEnable.size} Selected API(s)`}
                                </button>
                            </div>
                        </div>
                    )}

                    {apiValidationResult.enabled.length > 0 && (
                        <div>
                            <h5 className="font-bold text-green-400 text-xs mb-2">Enabled APIs ({apiValidationResult.enabled.length})</h5>
                            {renderList(apiValidationResult.enabled, true)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
  };


  if (!isGapiInitialized) {
    return (
        <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-100 font-sans p-4 overflow-y-auto">
            <div className="w-full max-w-3xl p-8 space-y-6 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 my-8">
                <div className="text-center">
                    <div className="flex justify-center mb-4 text-blue-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white">Welcome to Gemini Enterprise Manager</h1>
                </div>

                {!isGapiReady ? (
                    <div className="space-y-4">
                        <p className="text-center text-gray-400">
                            Please authenticate to access and manage your Google Cloud Gemini Enterprise resources.
                        </p>
                        
                        <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-3">
                            <h3 className="text-sm font-semibold text-white">Sign In with Google</h3>
                            <p className="text-xs text-gray-400">
                                Sign in using your Google account to automatically grant access to Discovery Engine and related APIs.
                            </p>
                            <button
                                onClick={handleGoogleSignIn}
                                disabled={isGapiLoading || isTokenValidating}
                                className="w-full py-2.5 px-4 bg-white hover:bg-gray-100 text-gray-900 font-medium text-sm rounded-md shadow flex items-center justify-center gap-3 transition-colors disabled:bg-gray-600 disabled:text-gray-400"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                </svg>
                                Sign in with Google
                            </button>
                        </div>

                        <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-gray-700"></div>
                            <span className="flex-shrink mx-4 text-xs text-gray-500 uppercase">Or use Access Token</span>
                            <div className="flex-grow border-t border-gray-700"></div>
                        </div>

                        <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-3">
                             <h3 className="text-sm font-semibold text-white">Manual Access Token</h3>
                             <p className="text-xs text-gray-400">
                                If you cannot use Google Sign-In, paste an access token obtained via <code className="bg-gray-800 px-1 py-0.5 rounded text-blue-300">gcloud auth print-access-token</code>.
                             </p>
                             <AccessTokenInput
                                accessToken={accessToken}
                                setAccessToken={handleSetAccessToken}
                                userProfile={userProfile}
                                onSignOut={handleSignOut}
                              />
                              
                              {/* Advanced OAuth Settings Toggle */}
                              <div className="pt-2 border-t border-gray-800">
                                  <button
                                      type="button"
                                      onClick={() => setShowOAuthSettings(!showOAuthSettings)}
                                      className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 focus:outline-none"
                                  >
                                      <span>{showOAuthSettings ? '▲' : '▼'}</span>
                                      <span>Advanced: Configure OAuth Client ID</span>
                                  </button>
                                  
                                  <div className={`mt-2 space-y-2 overflow-hidden transition-all duration-200 ${showOAuthSettings ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                                      <p className="text-[11px] text-gray-500">
                                          If you are hosting this on a custom domain, provide your custom OAuth Client ID authorized for that origin.
                                      </p>
                                      <div className="flex gap-2">
                                          <input 
                                              type="text" 
                                              placeholder={DEFAULT_GOOGLE_CLIENT_ID} 
                                              value={googleClientId === DEFAULT_GOOGLE_CLIENT_ID ? '' : googleClientId} 
                                              onChange={(e) => {
                                                  const val = e.target.value.trim();
                                                  if (val) {
                                                      localStorage.setItem('custom-google-client-id', val);
                                                      setGoogleClientId(val);
                                                  } else {
                                                      localStorage.removeItem('custom-google-client-id');
                                                      fetch('/config.json')
                                                          .then(res => res.json())
                                                          .then(data => {
                                                              setGoogleClientId(data?.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID);
                                                          })
                                                          .catch(() => setGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID));
                                                  }
                                              }}
                                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500 flex-1 font-mono"
                                          />
                                          {googleClientId !== DEFAULT_GOOGLE_CLIENT_ID && (
                                              <button 
                                                  onClick={() => {
                                                      localStorage.removeItem('custom-google-client-id');
                                                      fetch('/config.json')
                                                          .then(res => res.json())
                                                          .then(data => {
                                                              setGoogleClientId(data?.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID);
                                                          })
                                                          .catch(() => setGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID));
                                                  }}
                                                  className="text-[10px] bg-red-900/30 text-red-300 hover:bg-red-900/50 px-2 py-1 rounded border border-red-800"
                                              >
                                                  Clear
                                              </button>
                                          )}
                                      </div>
                                  </div>
                               </div>
                        </div>

                        {isGapiLoading && (
                             <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                                Initializing Google API Client... Please wait.
                            </div>
                        )}
                        {isTokenValidating && (
                             <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                                Validating access token permissions...
                            </div>
                        )}
                        {gapiError && <div className="p-4 text-sm text-center text-red-300 bg-red-900/30 rounded-lg border border-red-800">{gapiError}</div>}
                    </div>
                ) : (
                     <>
                        <div className="p-4 text-center text-green-300 bg-green-900/30 rounded-lg border border-green-700">
                           API Client Initialized & Token Validated Successfully!
                        </div>
                        <p className="text-center text-gray-400 text-xs">Step 2: Set your Project and validate required APIs, service agents, and caller permissions.</p>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                            <ProjectInput value={projectNumber} onChange={handleSetProjectNumber} />
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={handleValidateApis}
                                disabled={!projectNumber || isApiValidationLoading || isApiEnablingLoading}
                                className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-600 flex items-center justify-center"
                            >
                                {isApiValidationLoading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                        Validating Diagnostics...
                                    </>
                                ) : 'Validate APIs & Permissions'}
                            </button>
                             <button
                                onClick={handleEnterApp}
                                disabled={!projectNumber || isApiEnablingLoading}
                                className="w-full px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600"
                            >
                                Enter Application
                            </button>
                        </div>
                        {gapiError && <div className="p-4 text-sm text-center text-red-300 bg-red-900/30 rounded-lg">{gapiError}</div>}
                        {renderApiValidationResults()}
                        {(isApiEnablingLoading || apiEnablementLogs.length > 0) && (
                            <div className="mt-4">
                                <h4 className="text-sm font-semibold text-gray-300 mb-2">API Enablement Log</h4>
                                <pre className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-32 overflow-y-auto font-mono">
                                    {apiEnablementLogs.join('\n')}
                                </pre>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
  }

  return (
    <>
      <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
              <Sidebar
                currentPage={currentPage}
                setCurrentPage={handleMenuClick}
                onShowInfo={handleShowInfo}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              />
        <main className="flex-1 flex flex-col overflow-hidden">
                  <header className="bg-gray-800 border-b border-gray-700 p-4 flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
                      <div className="flex flex-col gap-1">
                          <Breadcrumbs currentPage={currentPage} context={pageContext} />
                          <HeaderProjectInput projectId={projectId} projectNumber={projectNumber} onChange={handleSetProjectNumber} />
                      </div>

                      <div className="flex items-center gap-4">
                          <HelpButton />
                          <div className="h-8 w-px bg-gray-700 mx-2 hidden md:block"></div>
                          <AccessTokenInput
                              accessToken={accessToken}
                              setAccessToken={handleSetAccessToken}
                              userProfile={userProfile}
                              onSignOut={handleSignOut}
                          />
                      </div>
          </header>
                  <div key={`${currentPage}-${refreshKey}`} className="flex-1 overflow-y-auto p-6 relative">
            {renderPage()}
          </div>
        </main>
      </div>
      
      {/* Global Build Progress Indicators */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
              {activeBuilds.map(build => (
              <CloudBuildProgress 
                  key={build.id}
                  projectId={build.projectId}
                  buildId={build.id}
                  onClose={() => handleRemoveBuild(build.id)} 
              />
          ))}
      </div>

      {infoModalKey && (
        <CurlInfoModal infoKey={infoModalKey} onClose={handleCloseInfoModal} />
      )}
      {directQueryEngine && (
        <DirectQueryChatWindow
          engine={directQueryEngine}
          userProfile={userProfile}
          config={{
            projectId: projectNumber,
            reasoningEngineLocation: directQueryEngine.name.split('/')[3],
            // Dummy values
            appLocation: 'global',
            collectionId: '',
            appId: '',
            assistantId: ''
          }}
          accessToken={accessToken}
          onClose={() => setDirectQueryEngine(null)}
        />
      )}
    </>
  );
};


const App: React.FC = () => {
    return (
        <GlobalDebugProvider>
            <InnerApp />
        </GlobalDebugProvider>
    );
};

export default App;

