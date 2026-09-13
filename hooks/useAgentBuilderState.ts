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

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '../services/apiService';
import {
  CloudRunService,
  DataStore,
  GcsBucket,
  Collection,
  AppEngine,
  Authorization,
} from '../types';
import { CloudBuildOperation } from '../services/api/cloudBuild';
import { PartialFailure } from './useAsyncResource';
import { usePersistedConfig } from './usePersistedConfig';
import { useToast } from '../context/ToastContext';
import { toErrorMessage } from '../utils/errors';
import { AdkAgentConfig, A2aConfig, AgentTool } from '../services/adkTemplates';
import { DEFAULT_ADK_CONFIG } from '../components/agent-builder/defaultAdkConfig';
import { AdkFileKey, A2aFileKey } from '../components/agent-builder/CodePreviewPane';
import { useWifValidation } from './useWifValidation';

export { DEFAULT_ADK_CONFIG };

export interface UseAgentBuilderStateProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  context?: { serviceToEdit?: CloudRunService; [key: string]: unknown };
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

export function useAgentBuilderState({
  projectNumber,
  setProjectNumber,
  context,
  onBuildTriggered,
}: UseAgentBuilderStateProps) {
  const { toast } = useToast();
  const [builderTab, setBuilderTab] = useState<'a2a' | 'adk'>('adk');

  // --- A2A State ---
  const [a2aConfig, setA2aConfig] = useState<A2aConfig>({
    serviceName: 'my-a2a-function',
    displayName: 'My A2A Function',
    providerOrganization: 'My Company',
    model: 'gemini-2.5-flash',
    region: 'us-central1',
    memory: '1Gi',
    instruction:
      'You are a helpful assistant that responds to user queries directly and concisely.',
    cloudRunAccess: 'authenticated',
    enableCors: true,
    useGoogleSearch: false,
    tools: [],
  });

  const [deployProjectId, setDeployProjectId] = useState(projectNumber);
  const [isResolvingId, setIsResolvingId] = useState(false);

  const [a2aActiveTab, setA2aActiveTab] = useState<A2aFileKey>('main');
  const [a2aCopySuccess, setA2aCopySuccess] = useState('');
  const [isFixMode, setIsFixMode] = useState(false);
  const [isA2aDeployModalOpen, setIsA2aDeployModalOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [showWifInstructions, setShowWifInstructions] = useState(false);

  // --- ADK State ---
  const [adkConfig, setAdkConfig, clearAdkDraft] = usePersistedConfig<AdkAgentConfig>(
    'adk_studio_draft',
    DEFAULT_ADK_CONFIG,
    {
      migrate: (parsed) => ({ ...DEFAULT_ADK_CONFIG, ...parsed }),
    }
  );

  const [lastTriggeredBuildId, setLastTriggeredBuildId] = useState<string | null>(null);

  // Register in Gemini Enterprise Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registrationNotice, setRegistrationNotice] = useState<string | null>(null);

  const handleClearDraft = () => {
    if (
      window.confirm(
        'Reset all builder fields to default? Any unsaved draft changes will be lost.'
      )
    ) {
      clearAdkDraft();
    }
  };

  // IAM & WIF State & Validation
  const {
    serviceAccounts,
    wifProviders,
    validationStatus,
    validationMessage,
    setValidationStatus,
    setValidationMessage,
  } = useWifValidation(adkConfig, projectNumber);

  const [vertexLocation, setVertexLocation] = useState('us-central1');
  const [adkActiveTab, setAdkActiveTab] = useState<AdkFileKey>('app');
  const [adkCopySuccess, setAdkCopySuccess] = useState('');

  // Discovery Engine State
  const [collections, setCollections] = useState<Collection[]>([]);
  const [engines, setEngines] = useState<AppEngine[]>([]);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);

  // Authorizations State for Dropdown Select
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [isLoadingAuths, setIsLoadingAuths] = useState(false);
  const [authInputMode, setAuthInputMode] = useState<'manual' | 'select'>('manual');

  // Data Store Tool State
  const [toolBuilderConfig, setToolBuilderConfig] = useState({
    dataStoreId: '',
  });
  const [dataStores, setDataStores] = useState<(DataStore & { location: string })[]>([]);
  const [isLoadingDataStores, setIsLoadingDataStores] = useState(false);
  const [dataStoreSearchTerm, setDataStoreSearchTerm] = useState('');
  const [builderPartialFailures, setBuilderPartialFailures] = useState<PartialFailure[]>([]);

  // Staging Bucket State
  const [stagingBucket, setStagingBucket] = useState('');
  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);

  // A2A Tool State
  const [cloudRunServices, setCloudRunServices] = useState<CloudRunService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [selectedA2aService, setSelectedA2aService] = useState('');
  const [a2aSearchTerm, setA2aSearchTerm] = useState('');

  const [isAdkDeployModalOpen, setIsAdkDeployModalOpen] = useState(false);
  const [rewritingField, setRewritingField] = useState<string | null>(null);

  // Deployment Progress State
  const [buildId, setBuildId] = useState<string | null>(null);
  const [isBuildVisible, setIsBuildVisible] = useState(false);
  const [customMcpStatus, setCustomMcpStatus] = useState<{
    [key: number]: { loading: boolean; tools?: Array<Record<string, unknown>>; error?: string };
  }>({});

  // Common Logic
  const fetchProjectId = useCallback(async () => {
    if (!projectNumber) return;
    setIsResolvingId(true);
    try {
      const project = await api.getProject(projectNumber);
      if (project.projectId) {
        setDeployProjectId(project.projectId);
      }
    } catch (e) {
      console.warn('Could not auto-resolve Project ID from Number:', e);
    } finally {
      setIsResolvingId(false);
    }
  }, [projectNumber]);

  useEffect(() => {
    setDeployProjectId(projectNumber);
    fetchProjectId();
  }, [projectNumber, fetchProjectId]);

  // Handle Fix Mode context
  useEffect(() => {
    if (context && context.serviceToEdit) {
      setBuilderTab('a2a');
      setIsFixMode(true);
      const service: CloudRunService = context.serviceToEdit;
      const container = service.template?.containers?.[0];
      const envVars = container?.env || [];
      const getEnv = (key: string) => envVars.find((e) => e.name === key)?.value || '';

      setA2aConfig((prev) => ({
        ...prev,
        serviceName: service.name.split('/').pop() || prev.serviceName,
        region: service.location || prev.region,
        displayName: getEnv('AGENT_DISPLAY_NAME') || prev.displayName,
        providerOrganization: getEnv('PROVIDER_ORGANIZATION') || prev.providerOrganization,
        model: getEnv('MODEL') || prev.model,
        instruction: getEnv('AGENT_DESCRIPTION') || prev.instruction,
      }));
    }
  }, [context]);

  // ADK Data Store & Buckets Fetching
  const apiConfig = useMemo(
    () => ({
      projectId: projectNumber,
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: '',
    }),
    [projectNumber]
  );

  const fetchData = useCallback(async () => {
    if (!projectNumber) return;

    setIsLoadingDataStores(true);
    setDataStores([]);
    setBuilderPartialFailures([]);
    const failures: PartialFailure[] = [];

    const locations = ['global', 'us', 'eu'];
    const dsResults: (DataStore & { location: string })[] = [];

    await Promise.all(
      locations.map(async (loc) => {
        const dsConfig = {
          projectId: projectNumber,
          appLocation: loc,
          collectionId: 'default_collection',
          appId: '',
          assistantId: '',
        };
        try {
          const res = await api.listResources('dataStores', dsConfig);
          if (res.dataStores) {
            res.dataStores.forEach((ds: DataStore) => dsResults.push({ ...ds, location: loc }));
          }
        } catch (e: unknown) {
          console.warn(
            `[AgentBuilder] Failed to list data stores in location "${loc}". Results may be incomplete.`,
            e
          );
          failures.push({
            id: `dataStores-${loc}`,
            name: `Data Stores (${loc})`,
            resourceType: 'Data Stores',
            status: typeof e === 'object' && e !== null && ('status' in e || 'code' in e) ? Number((e as { status?: unknown; code?: unknown }).status || (e as { status?: unknown; code?: unknown }).code) : (toErrorMessage(e).includes('403') ? 403 : undefined),
            error: toErrorMessage(e),
            reason: `Failed to list data stores in location "${loc}": ${toErrorMessage(e)}`,
          });
        }
      })
    );

    setDataStores(dsResults);
    if (dsResults.length === 1 && !toolBuilderConfig.dataStoreId) {
      setToolBuilderConfig((prev) => ({
        ...prev,
        dataStoreId: dsResults[0].name,
      }));
    }
    setIsLoadingDataStores(false);

    setIsLoadingServices(true);
    setCloudRunServices([]);
    const regions = ['us-central1', 'us-east1', 'europe-west1', 'asia-east1'];
    const services: CloudRunService[] = [];

    await Promise.all(
      regions.map(async (region) => {
        try {
          const res = await api.listCloudRunServices({ ...apiConfig, projectId: projectNumber }, region);
          if (res.services) services.push(...res.services);
        } catch (e: unknown) {
          console.warn(
            `[AgentBuilder] Failed to list Cloud Run services in region "${region}". Results may be incomplete.`,
            e
          );
          failures.push({
            id: `cloudRun-${region}`,
            name: `Cloud Run (${region})`,
            resourceType: 'Cloud Run Services',
            status: typeof e === 'object' && e !== null && ('status' in e || 'code' in e) ? Number((e as { status?: unknown; code?: unknown }).status || (e as { status?: unknown; code?: unknown }).code) : (toErrorMessage(e).includes('403') ? 403 : undefined),
            error: toErrorMessage(e),
            reason: `Failed to list Cloud Run services in region "${region}": ${toErrorMessage(e)}`,
          });
        }
      })
    );

    const a2a = services.filter((s) => {
      const envVars = s.template?.containers?.[0]?.env || [];
      const getEnv = (name: string) => envVars.find((e) => e.name === name)?.value;
      return !!(
        getEnv('AGENT_URL') ||
        getEnv('PROVIDER_ORGANIZATION') ||
        s.name.toLowerCase().includes('a2a')
      );
    });

    setCloudRunServices(a2a);
    setIsLoadingServices(false);

    // Fetch Buckets
    setIsLoadingBuckets(true);
    try {
      const b = await api.listBuckets(projectNumber);
      const items = b.items || [];
      setBuckets(items);
      if (items.length > 0 && !stagingBucket) {
        setStagingBucket(`gs://${items[0].name}`);
      }
    } catch (e: unknown) {
      console.error('Failed to fetch buckets', e);
      failures.push({
        id: `buckets-${projectNumber}`,
        name: `Buckets (${projectNumber})`,
        resourceType: 'GCS Buckets',
        status: typeof e === 'object' && e !== null && ('status' in e || 'code' in e) ? Number((e as { status?: unknown; code?: unknown }).status || (e as { status?: unknown; code?: unknown }).code) : undefined,
        error: toErrorMessage(e),
        reason: `Failed to list Cloud Storage buckets: ${toErrorMessage(e)}`,
      });
    } finally {
      setIsLoadingBuckets(false);
    }

    // Fetch Authorizations for Dropdown Select
    setIsLoadingAuths(true);
    setAuthorizations([]);
    try {
      const response = await api.listAuthorizations(apiConfig);
      const auths = response.authorizations || [];
      setAuthorizations(auths);
      if (auths.length > 0) {
        setAuthInputMode('select');
      } else {
        setAuthInputMode('manual');
      }
    } catch (e: unknown) {
      console.warn('Failed to fetch authorizations', e);
      setAuthInputMode('manual');
      failures.push({
        id: `authorizations-${apiConfig.appLocation || 'global'}`,
        name: `Authorizations (${apiConfig.appLocation || 'global'})`,
        resourceType: 'Authorizations',
        status: typeof e === 'object' && e !== null && ('status' in e || 'code' in e) ? Number((e as { status?: unknown; code?: unknown }).status || (e as { status?: unknown; code?: unknown }).code) : undefined,
        error: toErrorMessage(e),
        reason: `Failed to fetch authorizations list: ${toErrorMessage(e)}`,
      });
    } finally {
      setIsLoadingAuths(false);
    }

    setBuilderPartialFailures(failures);
  }, [projectNumber, apiConfig, stagingBucket, toolBuilderConfig.dataStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers
  const handleA2aConfigChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setA2aConfig((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else if (name === 'serviceName') {
      const sanitizedValue = value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 63);
      setA2aConfig((prev) => ({ ...prev, [name]: sanitizedValue }));
    } else {
      setA2aConfig((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleAdkConfigChange = (
    e:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
      | { target: { name: string; type: string; checked?: boolean; value?: string } }
  ) => {
    const { name, value, type } = e.target;
    if (name.startsWith('discovery.')) {
      const field = name.split('.')[1];
      setAdkConfig((prev) => ({
        ...prev,
        discoveryConfig: {
          ...prev.discoveryConfig,
          [field]: value,
        },
      }));
    } else if (type === 'checkbox') {
      const isChecked = 'checked' in e.target ? Boolean(e.target.checked) : false;

      setAdkConfig((prev) => {
        const updates: Partial<AdkAgentConfig> = { [name]: isChecked };

        if (
          (name.endsWith('Mcp') ||
            name.endsWith('Api') ||
            name === 'enableEmailTool' ||
            name === 'enableBqAnalytics') &&
          isChecked
        ) {
          updates.enableOAuth = true;
        }

        if (
          (name.endsWith('Mcp') ||
            name.endsWith('Api') ||
            name === 'enableEmailTool' ||
            name === 'enableBqAnalytics') &&
          !isChecked
        ) {
          const merged = { ...prev, [name]: false };
          const hasRemainingOAuthTools =
            Object.keys(merged).some(
              (k) =>
                (k.endsWith('Mcp') ||
                  k.endsWith('Api') ||
                  k === 'enableEmailTool' ||
                  k === 'enableBqAnalytics') &&
                Boolean((merged as unknown as Record<string, unknown>)[k])
            ) ||
            (merged.tools && merged.tools.length > 0);
          if (!hasRemainingOAuthTools) {
            updates.enableOAuth = false;
          }
        }

        if (isChecked) {
          if (name.endsWith('Mcp')) {
            const apiCounterpart = name.replace('Mcp', 'Api');
            if (apiCounterpart in prev) {
              updates[apiCounterpart] = false;
            }
          } else if (name.endsWith('Api')) {
            const mcpCounterpart = name.replace('Api', 'Mcp');
            if (mcpCounterpart in prev) {
              updates[mcpCounterpart] = false;
            }
          }
        }

        return { ...prev, ...updates };
      });
    } else if (name === 'thinkingBudget') {
      const numVal = parseInt(value || '0', 10);
      setAdkConfig((prev) => ({
        ...prev,
        thinkingBudget: isNaN(numVal) ? 1024 : numVal,
      }));
    } else if (name === 'thinkingLevel') {
      setAdkConfig((prev) => ({
        ...prev,
        thinkingLevel: value || '',
      }));
    } else {
      setAdkConfig((prev) => ({ ...prev, [name]: value ?? '' } as AdkAgentConfig));
    }
  };

  const handleAddTool = (tool: AgentTool) => {
    if (builderTab === 'a2a') {
      setA2aConfig((prev) => ({ ...prev, tools: [...prev.tools, tool] }));
    } else {
      setAdkConfig((prev) => ({
        ...prev,
        tools: [...prev.tools, tool],
        enableOAuth: true,
      }));
    }
  };

  const handleRemoveTool = (index: number) => {
    if (builderTab === 'a2a') {
      setA2aConfig((prev) => ({
        ...prev,
        tools: prev.tools.filter((_, i) => i !== index),
      }));
    } else {
      setAdkConfig((prev) => {
        const remainingTools = prev.tools.filter((_, i) => i !== index);
        const hasRemainingOAuthTools =
          remainingTools.length > 0 ||
          Object.keys(prev).some(
            (k) =>
              (k.endsWith('Mcp') ||
                k.endsWith('Api') ||
                k === 'enableEmailTool' ||
                k === 'enableBqAnalytics') &&
              Boolean((prev as unknown as Record<string, unknown>)[k])
          );
        return {
          ...prev,
          tools: remainingTools,
          enableOAuth: hasRemainingOAuthTools,
        };
      });
    }
  };

  const handleAddCustomMcp = () => {
    setAdkConfig((prev) => ({
      ...prev,
      customMcpEndpoints: [...prev.customMcpEndpoints, { name: '', url: '' }],
    }));
  };

  const handleUpdateCustomMcp = (index: number, field: 'name' | 'url', value: string) => {
    setAdkConfig((prev) => {
      const newEndpoints = [...prev.customMcpEndpoints];
      newEndpoints[index] = { ...newEndpoints[index], [field]: value };
      return { ...prev, customMcpEndpoints: newEndpoints };
    });
  };

  const handleRemoveCustomMcp = (index: number) => {
    setAdkConfig((prev) => ({
      ...prev,
      customMcpEndpoints: prev.customMcpEndpoints.filter((_, i) => i !== index),
    }));
  };

  const handleVerifyCustomMcp = async (index: number, url: string) => {
    if (!url) return;
    setCustomMcpStatus((prev) => ({ ...prev, [index]: { loading: true } }));
    try {
      const tools = await api.listMcpTools(deployProjectId || '', url);
      setCustomMcpStatus((prev) => ({
        ...prev,
        [index]: { loading: false, tools },
      }));
    } catch (e: unknown) {
      console.error('Failed to verify custom MCP:', e);
      setCustomMcpStatus((prev) => ({
        ...prev,
        [index]: { loading: false, error: toErrorMessage(e) },
      }));
    }
  };

  const handleRewrite = async (field: 'instruction') => {
    setRewritingField(field);

    const currentInstruction =
      builderTab === 'a2a' ? a2aConfig.instruction : adkConfig.instruction;

    let toolNames = '';
    if (builderTab === 'a2a') {
      toolNames =
        a2aConfig.tools.map((t) => t.displayName || t.variableName).join(', ') || 'None';
    } else {
      const adkTools = [...adkConfig.tools.map((t) => t.displayName || t.variableName)];
      if (adkConfig.useGoogleSearch) adkTools.push('Google Search');
      if (adkConfig.enableCodeExecution) adkTools.push('Code Execution Sub-Agent');
      if (adkConfig.enableGraphvizRendering) adkTools.push('Graphviz Renderer');
      if (adkConfig.enableBigQueryMcp) adkTools.push('BigQuery MCP');
      if (adkConfig.enableCloudLoggingMcp) adkTools.push('Cloud Logging MCP');
      if (adkConfig.enableCloudSqlMcp) adkTools.push('Cloud SQL MCP');
      if (adkConfig.customMcpEndpoints.length > 0)
        adkTools.push(...adkConfig.customMcpEndpoints.map((e) => e.name));
      toolNames = adkTools.join(', ') || 'None';
    }

    const prompt = `You are an expert prompt engineer. Your task is to rewrite the following system instruction to be highly effective for a Large Language Model (LLM).
        Structure the rewritten prompt clearly.
        Add necessary context and details to make the agent robust while preserving the user's original intent.
        The agent has access to the following tools: [${toolNames}]. Ensure the instructions explicitly guide the agent on when and how to use these tools effectively.
        Output ONLY the rewritten system instruction.
        
        Original Instruction: "${currentInstruction}"`;

    try {
      const text = await api.generateVertexContent(apiConfig, prompt, 'gemini-2.5-flash', 8192);
      const rewrittenText = text
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/^```\w*\n?|\n?```$/g, '')
        .trim();
      if (builderTab === 'a2a') {
        setA2aConfig((prev) => ({ ...prev, instruction: rewrittenText }));
      } else {
        setAdkConfig((prev) => ({ ...prev, instruction: rewrittenText }));
      }
    } catch (err: unknown) {
      toast.error(`AI rewrite failed: ${toErrorMessage(err)}`);
    } finally {
      setRewritingField(null);
    }
  };

  const handleCopy = (
    content: string,
    setSuccess: React.Dispatch<React.SetStateAction<string>>
  ) => {
    navigator.clipboard.writeText(content).then(() => {
      setSuccess('Copied!');
      setTimeout(() => setSuccess(''), 2000);
    });
  };

  const handleBuildTriggered = (id: string) => {
    setLastTriggeredBuildId(id);
    setBuildId(id);
    setIsBuildVisible(true);

    const pid = deployProjectId || projectNumber;
    if (onBuildTriggered) onBuildTriggered(id, pid);

    setIsA2aDeployModalOpen(false);
    setIsAdkDeployModalOpen(false);
  };

  const handleCheckBuildStatus = async () => {
    if (!deployProjectId && !projectNumber) {
      toast.warning('Project ID not set.');
      return;
    }
    const pid = deployProjectId || projectNumber;
    let foundAny = false;

    try {
      if (lastTriggeredBuildId) {
        try {
          const specific = await api.getCloudBuild(pid, lastTriggeredBuildId);
          if (specific && specific.id) {
            console.log('handleCheckBuildStatus: FOUND specific triggered build:', specific.id, specific.status);
            setBuildId(specific.id);
            setIsBuildVisible(true);
            if (onBuildTriggered) onBuildTriggered(specific.id, pid);
            foundAny = true;
          }
        } catch (err) {
          console.warn(`Could not get specific build ${lastTriggeredBuildId}:`, err);
        }
      }

      const running = await api.listCloudBuilds(pid, 'status="WORKING"');
      if (running.builds && running.builds.length > 0) {
        console.log(`handleCheckBuildStatus: FOUND ${running.builds.length} WORKING builds`);
        running.builds.forEach((b: CloudBuildOperation) => {
          if (onBuildTriggered && b.id) onBuildTriggered(b.id, pid);
        });
        setBuildId(running.builds[0].id || null);
        setIsBuildVisible(true);
        foundAny = true;
      }

      const queued = await api.listCloudBuilds(pid, 'status="QUEUED"');
      if (queued.builds && queued.builds.length > 0) {
        console.log(`handleCheckBuildStatus: FOUND ${queued.builds.length} QUEUED builds`);
        queued.builds.forEach((b: CloudBuildOperation) => {
          if (onBuildTriggered && b.id) onBuildTriggered(b.id, pid);
        });
        if (!foundAny) {
          setBuildId(queued.builds[0].id || null);
          setIsBuildVisible(true);
        }
        foundAny = true;
      }

      if (!foundAny) {
        toast.info('No active or queued builds found.');
      }
    } catch (e: unknown) {
      toast.error(`Failed to check builds: ${toErrorMessage(e)}`);
    }
  };

  return {
    builderTab,
    setBuilderTab,
    a2aConfig,
    setA2aConfig,
    handleA2aConfigChange,
    deployProjectId,
    setDeployProjectId,
    isResolvingId,
    fetchProjectId,
    a2aActiveTab,
    setA2aActiveTab,
    a2aCopySuccess,
    setA2aCopySuccess,
    isFixMode,
    isA2aDeployModalOpen,
    setIsA2aDeployModalOpen,
    isGithubModalOpen,
    setIsGithubModalOpen,
    showWifInstructions,
    setShowWifInstructions,
    adkConfig,
    setAdkConfig,
    handleAdkConfigChange,
    handleClearDraft,
    lastTriggeredBuildId,
    isRegisterModalOpen,
    setIsRegisterModalOpen,
    registrationNotice,
    setRegistrationNotice,
    serviceAccounts,
    wifProviders,
    validationStatus,
    validationMessage,
    vertexLocation,
    setVertexLocation,
    adkActiveTab,
    setAdkActiveTab,
    adkCopySuccess,
    setAdkCopySuccess,
    collections,
    engines,
    isDiscoveryLoading,
    authorizations,
    isLoadingAuths,
    authInputMode,
    setAuthInputMode,
    toolBuilderConfig,
    setToolBuilderConfig,
    dataStores,
    isLoadingDataStores,
    dataStoreSearchTerm,
    setDataStoreSearchTerm,
    builderPartialFailures,
    stagingBucket,
    setStagingBucket,
    buckets,
    setBuckets,
    isLoadingBuckets,
    setIsLoadingBuckets,
    cloudRunServices,
    isLoadingServices,
    selectedA2aService,
    setSelectedA2aService,
    a2aSearchTerm,
    setA2aSearchTerm,
    isAdkDeployModalOpen,
    setIsAdkDeployModalOpen,
    rewritingField,
    buildId,
    isBuildVisible,
    customMcpStatus,
    handleAddTool,
    handleRemoveTool,
    handleAddCustomMcp,
    handleUpdateCustomMcp,
    handleRemoveCustomMcp,
    handleVerifyCustomMcp,
    handleRewrite,
    handleCopy,
    handleBuildTriggered,
    handleCheckBuildStatus,
    fetchData,
  };
}
