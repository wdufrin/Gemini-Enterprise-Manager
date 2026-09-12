import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Config, DataStore, CloudRunService, GcsBucket } from "../types";
import * as api from "../services/apiService";
import AgentDeploymentModal from "../components/agent-catalog/AgentDeploymentModal";
import A2aDeployModal from "../components/a2a/A2aDeployModal";
import InfoTooltip from "../components/InfoTooltip";
import CloudBuildProgress from "../components/agent-builder/CloudBuildProgress";
import GitHubDeployModal from "../components/agent-builder/GitHubDeployModal";
import ProjectInput from "../components/ProjectInput";
import { McpServiceCheck } from "../components/McpServiceCheck";
import CloudConsoleButton from "../components/CloudConsoleButton";

import JSZip from "jszip";


// Re-export all ADK & A2A types and generators from modular template service
export * from "../services/adkTemplates";
import {
  AgentTool,
  A2aConfig,
  AdkAgentConfig,
  DiscoveryConfig,
  ADK_TABS,
  A2A_TABS,
  AgentTemplate,
  TEMPLATES,
  generateMainPy,
  generateA2aEnvYaml,
  generateDockerfile,
  generateRequirementsTxt,
  generateGcloudCommand,
  generateAuthPy,
  generateToolsPy,
  hasAnyTools,
  generateAdkDeployBashWrapper,
  generateTestConfigJson,
  generateEvalSetJson,
  generateMakefile,
  generateCloudBuildYaml,
  generateGithubWorkflow,
  generateCallerGithubWorkflow,
  generateTestConfig,
  generateEvalSet,
  generateDesignSpec,
  generateLaunchScript,
  generateAdk22PythonCode,
  generateAdkPythonCode,
  generateAppPy,
  generateInitPy,
  generateAdkDeployScript,
  generateAdkEnvFile,
  generateAdkRequirementsFile,
  generateAdkReadmeFile,
} from "../services/adkTemplates";

interface AgentBuilderPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  context?: any;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

const AgentBuilderPage: React.FC<AgentBuilderPageProps> = ({
  projectNumber,
  setProjectNumber,
  context,
  onBuildTriggered,
}) => {
  const [builderTab, setBuilderTab] = useState<"a2a" | "adk">("adk");

  // --- A2A State ---
  const [a2aConfig, setA2aConfig] = useState<A2aConfig>({
    serviceName: "my-a2a-function",
    displayName: "My A2A Function",
    providerOrganization: "My Company",
    model: "gemini-2.5-flash",
    region: "us-central1",
    memory: "1Gi",
    instruction:
      "You are a helpful assistant that responds to user queries directly and concisely.",
    allowUnauthenticated: true,
    enableCors: true,
    useGoogleSearch: false,
    tools: [],
  });

  const [deployProjectId, setDeployProjectId] = useState(projectNumber);
  const [isResolvingId, setIsResolvingId] = useState(false);

  const [a2aGeneratedCode, setA2aGeneratedCode] = useState({
    main: "",
    dockerfile: "",
    requirements: "",
    gcloud: "",
    yaml: "",
  });

  const [a2aActiveTab, setA2aActiveTab] = useState<
    "main" | "dockerfile" | "requirements" | "env"
  >("main");
  const [a2aCopySuccess, setA2aCopySuccess] = useState("");
  const [isFixMode, setIsFixMode] = useState(false);
  const [isA2aDeployModalOpen, setIsA2aDeployModalOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [showWifInstructions, setShowWifInstructions] = useState(false);

  // --- ADK State ---
  const [adkConfig, setAdkConfig] = useState<AdkAgentConfig>({
    adkVersion: "1.35.1",
    name: "",
    description: "An agent that can do awesome things.",
    model: "gemini-2.5-flash",
    instruction: "You are an awesome and helpful agent.",
    tools: [],
    useGoogleSearch: false,
    enableOAuth: false,
    authId: "temp_oauth",
    allowAdcFallback: true,
    enableDiscoveryApi: false,
    discoveryConfig: {
      projectId: "",
      location: "global",
      collection: "default_collection",
      engineId: "",
      dataStoreIds: "",
    },
    enableBqAnalytics: false,
    bqDatasetId: "",
    bqTableId: "",
    enableThinking: false,
    thinkingBudget: 1024,
    thinkingLevel: "HIGH",
    enableStreaming: false,
    enableBigQueryMcp: false,
    enableCodeExecution: false,
    enableGraphvizRendering: false,
    enableEmailTool: false,
    enableSecurityCommandCenterApi: false,
    enableRecommenderApi: false,
    enableServiceHealthApi: false,
    enableNetworkManagementApi: false,
    enableCloudAssistApi: false,
    enableTelemetry: true,
    enableMessageLogging: false,
    enableCloudLoggingApi: false,
    enableCloudMonitoringApi: false,
    enableCloudRunApi: false,
    enableResourceManagerApi: false,
    enableAdminActivityApi: false,
    enableDatabaseFleetApi: false,
    enableCloudLoggingMcp: false,
    enableBigtableAdminMcp: false,
    enableCloudSqlMcp: false,
    enableCloudMonitoringMcp: false,
    enableComputeEngineMcp: false,
    enableFirestoreMcp: false,
    enableGkeMcp: false,
    enableResourceManagerMcp: false,
    enableSpannerMcp: false,
    enableDeveloperKnowledgeMcp: false,
    enableMapsGroundingMcp: false,
    enableEvaluation: false,
    enableCiCd: false,
    ciCdRunner: "none",
    deploymentTarget: "agent_engine",
    githubWifProvider: "",
    githubServiceAccount: "",
    customMcpEndpoints: [],
  });

  // IAM & WIF State
  const [serviceAccounts, setServiceAccounts] = useState<any[]>([]);
  const [wifProviders, setWifProviders] = useState<any[]>([]);
  const [validationStatus, setValidationStatus] = useState<
    "unchecked" | "testing" | "valid" | "invalid"
  >("unchecked");
  const [validationMessage, setValidationMessage] = useState("");

  const [vertexLocation, setVertexLocation] = useState("us-central1");
  const [adkGeneratedCode, setAdkGeneratedCode] = useState({
    app: "",
    agent: "",
    env: "",
    requirements: "",
    readme: "",
    deploy_re: "",
    auth: "",
    tools: "",
    init: "",
  });
  const [adkActiveTab, setAdkActiveTab] = useState<
    | "app"
    | "agent"
    | "env"
    | "requirements"
    | "readme"
    | "deploy_re"
    | "auth"
    | "tools"
    | "init"
    | "makefile"
    | "dockerfile"
    | "cloudbuild"
    | "github_deploy"
  >("app");
  const [adkCopySuccess, setAdkCopySuccess] = useState("");

  // Discovery Engine State
  const [collections, setCollections] = useState<any[]>([]);
  const [engines, setEngines] = useState<any[]>([]);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);

  // Authorizations State for Dropdown Select
  const [authorizations, setAuthorizations] = useState<any[]>([]);
  const [isLoadingAuths, setIsLoadingAuths] = useState(false);
  const [authInputMode, setAuthInputMode] = useState<"manual" | "select">(
    "manual",
  );

  // Fetch Collections when project/location changes
  useEffect(() => {
    if (
      !adkConfig.enableDiscoveryApi ||
      (!adkConfig.discoveryConfig.projectId && !projectNumber)
    )
      return;
    if (!adkConfig.discoveryConfig.location) return;

    const fetchCollections = async () => {
      setIsDiscoveryLoading(true);
      try {
        const targetProject =
          adkConfig.discoveryConfig.projectId || projectNumber;
        const tempConfig: any = {
          projectId: targetProject,
          appLocation: adkConfig.discoveryConfig.location,
        };

        const res = await api.listResources("collections", tempConfig);
        setCollections(res.collections || []);
      } catch (e) {
        console.error("Failed to fetch collections", e);
      } finally {
        setIsDiscoveryLoading(false);
      }
    };
    fetchCollections();
  }, [
    adkConfig.enableDiscoveryApi,
    adkConfig.discoveryConfig.projectId,
    adkConfig.discoveryConfig.location,
    projectNumber,
  ]);

  // Fetch Engines when Collection changes
  useEffect(() => {
    if (!adkConfig.enableDiscoveryApi || !adkConfig.discoveryConfig.collection)
      return;

    const fetchEngines = async () => {
      setIsDiscoveryLoading(true);
      try {
        const targetProject =
          adkConfig.discoveryConfig.projectId || projectNumber;
        const tempConfig: any = {
          projectId: targetProject,
          appLocation: adkConfig.discoveryConfig.location,
          collectionId: adkConfig.discoveryConfig.collection,
        };
        const res = await api.listResources("engines", tempConfig);
        setEngines(res.engines || []);
      } catch (e) {
        console.error("Failed to fetch engines", e);
      } finally {
        setIsDiscoveryLoading(false);
      }
    };
    fetchEngines();
  }, [
    adkConfig.enableDiscoveryApi,
    adkConfig.discoveryConfig.collection,
    adkConfig.discoveryConfig.projectId,
    adkConfig.discoveryConfig.location,
    projectNumber,
  ]);

  // Data Store Tool State
  const [toolBuilderConfig, setToolBuilderConfig] = useState({
    dataStoreId: "",
  });
  const [dataStores, setDataStores] = useState<
    (DataStore & { location: string })[]
  >([]);
  const [isLoadingDataStores, setIsLoadingDataStores] = useState(false);
  const [dataStoreSearchTerm, setDataStoreSearchTerm] = useState("");

  // Staging Bucket State
  const [stagingBucket, setStagingBucket] = useState("");
  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);

  // A2A Tool State
  const [cloudRunServices, setCloudRunServices] = useState<CloudRunService[]>(
    [],
  );
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [selectedA2aService, setSelectedA2aService] = useState("");
  const [a2aSearchTerm, setA2aSearchTerm] = useState("");

  const [isAdkDeployModalOpen, setIsAdkDeployModalOpen] = useState(false);
  const [rewritingField, setRewritingField] = useState<string | null>(null);

  // Deployment Progress State
  const [buildId, setBuildId] = useState<string | null>(null);
  const [isBuildVisible, setIsBuildVisible] = useState(false);
  const [customMcpStatus, setCustomMcpStatus] = useState<{
    [key: number]: { loading: boolean; tools?: any[]; error?: string };
  }>({});

  // CI/CD IAM Data
  useEffect(() => {
    const fetchIamData = async () => {
      if (!projectNumber || !adkConfig.enableCiCd) return;
      try {
        const accounts = await api.listServiceAccounts(projectNumber);
        setServiceAccounts(accounts);

        const pools = await api.listWorkloadIdentityPools(projectNumber);
        let allProviders: any[] = [];
        for (const pool of pools) {
          const providers = await api.listWorkloadIdentityProviders(
            pool.name,
            projectNumber,
          );
          allProviders = allProviders.concat(providers);
        }
        setWifProviders(allProviders);
      } catch (e) {
        console.error("Failed to fetch IAM data:", e);
      }
    };
    fetchIamData();
  }, [projectNumber, adkConfig.enableCiCd]);

  useEffect(() => {
    const validateWif = async () => {
      if (
        !adkConfig.githubServiceAccount ||
        !adkConfig.githubWifProvider ||
        !projectNumber
      ) {
        setValidationStatus("unchecked");
        return;
      }
      setValidationStatus("testing");
      try {
        const policy = await api.getServiceAccountIamPolicy(
          adkConfig.githubServiceAccount,
          projectNumber,
        );
        const bindings = policy.bindings || [];
        let hasBinding = false;
        for (const binding of bindings) {
          if (binding.role === "roles/iam.workloadIdentityUser") {
            const poolName =
              adkConfig.githubWifProvider.split("/providers/")[0];
            if (
              binding.members &&
              binding.members.some((m: string) => m.includes(poolName))
            ) {
              hasBinding = true;
              break;
            }
          }
        }
        if (hasBinding) {
          setValidationStatus("valid");
          setValidationMessage(
            "Service Account is correctly bound to the related WIF Pool.",
          );
        } else {
          setValidationStatus("invalid");
          setValidationMessage(
            "Service Account is missing roles/iam.workloadIdentityUser binding for this WIF Provider / Pool.",
          );
        }
      } catch (e: any) {
        setValidationStatus("invalid");
        if (e.message && e.message.includes("permission")) {
          setValidationMessage(
            "Permission denied to read Service Account IAM policy.",
          );
        } else {
          setValidationMessage("Failed to validate IAM policy.");
        }
      }
    };
    const timeoutId = setTimeout(validateWif, 300);
    return () => clearTimeout(timeoutId);
  }, [
    adkConfig.githubServiceAccount,
    adkConfig.githubWifProvider,
    projectNumber,
  ]);

  // --- Common Logic ---
  const fetchProjectId = async () => {
    if (!projectNumber) return;
    setIsResolvingId(true);
    try {
      const project = await api.getProject(projectNumber);
      if (project.projectId) {
        setDeployProjectId(project.projectId);
      }
    } catch (e) {
      console.warn("Could not auto-resolve Project ID from Number:", e);
    } finally {
      setIsResolvingId(false);
    }
  };

  useEffect(() => {
    setDeployProjectId(projectNumber);
    fetchProjectId();
  }, [projectNumber]);

  // Handle Fix Mode context
  useEffect(() => {
    if (context && context.serviceToEdit) {
      setBuilderTab("a2a");
      setIsFixMode(true);
      const service: CloudRunService = context.serviceToEdit;
      const container = service.template?.containers?.[0];
      const envVars = container?.env || [];
      const getEnv = (key: string) =>
        envVars.find((e) => e.name === key)?.value || "";

      setA2aConfig((prev) => ({
        ...prev,
        serviceName: service.name.split("/").pop() || prev.serviceName,
        region: service.location || prev.region,
        displayName: getEnv("AGENT_DISPLAY_NAME") || prev.displayName,
        providerOrganization:
          getEnv("PROVIDER_ORGANIZATION") || prev.providerOrganization,
        model: getEnv("MODEL") || prev.model,
        instruction: getEnv("AGENT_DESCRIPTION") || prev.instruction,
      }));
    }
  }, [context]);

  // A2A Code Generation
  useEffect(() => {
    setA2aGeneratedCode({
      main: generateMainPy(a2aConfig),
      dockerfile: generateDockerfile(adkConfig),
      requirements: generateRequirementsTxt(),
      gcloud: generateGcloudCommand(a2aConfig, deployProjectId),
      yaml: generateA2aEnvYaml(a2aConfig, deployProjectId),
    });
  }, [a2aConfig, deployProjectId]);

  // ADK Code Generation
  useEffect(() => {
    const agentCode = generateAdkPythonCode(adkConfig, true);
    const envCode = generateAdkEnvFile(
      adkConfig,
      deployProjectId || projectNumber,
      vertexLocation,
      stagingBucket,
    );
    const reqsCode = generateAdkRequirementsFile(adkConfig);
    const readmeCode = generateAdkReadmeFile(adkConfig);
    const deployCode = generateAdkDeployScript(adkConfig);
    const authCode = generateAuthPy(adkConfig, adkConfig.allowAdcFallback);
    const toolsCode = generateToolsPy(adkConfig, true);
    const initCode = generateInitPy();
    setAdkGeneratedCode({
      app: generateAppPy(true),
      agent: agentCode,
      env: envCode,
      requirements: reqsCode,
      readme: readmeCode,
      deploy_re: deployCode,
      auth: authCode,
      tools: toolsCode,
      init: initCode,
    });
  }, [adkConfig, projectNumber, deployProjectId, vertexLocation, stagingBucket]);

  // ADK Data Store & Buckets Fetching
  const apiConfig = useMemo(
    () => ({
      projectId: projectNumber,
      appLocation: "global",
      collectionId: "",
      appId: "",
      assistantId: "",
    }),
    [projectNumber],
  );

  useEffect(() => {
    if (!projectNumber) return;

    const fetchData = async () => {
      setIsLoadingDataStores(true);
      setDataStores([]);

      const locations = ["global", "us", "eu"];
      const dsResults: (DataStore & { location: string })[] = [];

      await Promise.all(
        locations.map(async (loc) => {
          const dsConfig = {
            projectId: projectNumber,
            appLocation: loc,
            collectionId: "default_collection",
            appId: "",
            assistantId: "",
          };
          try {
            const res = await api.listResources("dataStores", dsConfig);
            if (res.dataStores) {
              res.dataStores.forEach((ds: any) =>
                dsResults.push({ ...ds, location: loc }),
              );
            }
          } catch (e) { }
        }),
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
      const regions = ["us-central1", "us-east1", "europe-west1", "asia-east1"];
      const services: CloudRunService[] = [];

      await Promise.all(
        regions.map(async (region) => {
          try {
            const res = await api.listCloudRunServices(
              { projectId: projectNumber } as any,
              region,
            );
            if (res.services) services.push(...res.services);
          } catch (e) { }
        }),
      );

      const a2a = services.filter((s) => {
        const envVars = s.template?.containers?.[0]?.env || [];
        const getEnv = (name: string) =>
          envVars.find((e) => e.name === name)?.value;
        return !!(
          getEnv("AGENT_URL") ||
          getEnv("PROVIDER_ORGANIZATION") ||
          s.name.toLowerCase().includes("a2a")
        );
      });

      setCloudRunServices(a2a);
      setIsLoadingServices(false);

      // Fetch Buckets
      setIsLoadingBuckets(true);
      try {
        // We need to resolve the project string first if currently a number,
        // but here we just try api.listBuckets which likely expects an ID string or number.
        // Best effort:
        const b = await api.listBuckets(projectNumber);
        const items = b.items || [];
        setBuckets(items);
        if (items.length > 0 && !stagingBucket) {
          setStagingBucket(`gs://${items[0].name}`);
        }
      } catch (e) {
        console.error("Failed to fetch buckets", e);
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
          setAuthInputMode("select");
        } else {
          setAuthInputMode("manual");
        }
      } catch (e) {
        console.warn("Failed to fetch authorizations", e);
        setAuthInputMode("manual");
      } finally {
        setIsLoadingAuths(false);
      }
    };

    fetchData();
  }, [projectNumber, apiConfig]);

  // --- Handlers ---
  const handleA2aConfigChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setA2aConfig((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else if (name === "serviceName") {
      const sanitizedValue = value
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);
      setA2aConfig((prev) => ({ ...prev, [name]: sanitizedValue }));
    } else {
      setA2aConfig((prev) => ({ ...prev, [name]: value as any }));
    }
  };

  const handleAdkConfigChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    if (name.startsWith("discovery.")) {
      const field = name.split(".")[1];
      setAdkConfig((prev) => ({
        ...prev,
        discoveryConfig: {
          ...prev.discoveryConfig,
          [field]: value,
        },
      }));
    } else if (type === "checkbox") {
      const isChecked = (e.target as HTMLInputElement).checked;

      setAdkConfig((prev) => {
        const updates: any = { [name]: isChecked };

        // Link MCPs, APIs, and Plugins to OAuth
        if (
          (name.endsWith("Mcp") ||
            name.endsWith("Api") ||
            name === "enableEmailTool" ||
            name === "enableBqAnalytics") &&
          isChecked
        ) {
          updates.enableOAuth = true;
        }

        // When unchecking, turn off enableOAuth if no other OAuth-dependent tools remain
        if (
          (name.endsWith("Mcp") ||
            name.endsWith("Api") ||
            name === "enableEmailTool" ||
            name === "enableBqAnalytics") &&
          !isChecked
        ) {
          const merged = { ...prev, [name]: false };
          const hasRemainingOAuthTools =
            Object.keys(merged).some(
              (k) =>
                (k.endsWith("Mcp") ||
                  k.endsWith("Api") ||
                  k === "enableEmailTool" ||
                  k === "enableBqAnalytics") &&
                (merged as any)[k] === true,
            ) || (merged.tools && merged.tools.length > 0);
          if (!hasRemainingOAuthTools) {
            updates.enableOAuth = false;
          }
        }

        // Enforce mutual exclusivity between API and MCP counterparts
        if (isChecked) {
          if (name.endsWith("Mcp")) {
            const apiCounterpart = name.replace("Mcp", "Api");
            if (apiCounterpart in prev) {
              updates[apiCounterpart] = false;
            }
          } else if (name.endsWith("Api")) {
            const mcpCounterpart = name.replace("Api", "Mcp");
            if (mcpCounterpart in prev) {
              updates[mcpCounterpart] = false;
            }
          }
        }

        return { ...prev, ...updates };
      });
    } else if (name === "thinkingBudget") {
      const numVal = parseInt(value, 10);
      setAdkConfig((prev) => ({
        ...prev,
        thinkingBudget: isNaN(numVal) ? 1024 : numVal,
      }));
    } else if (name === "name") {
      const sanitizedValue = value
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_-]/g, "");
      setAdkConfig((prev) => ({ ...prev, [name]: sanitizedValue }));
    } else {
      setAdkConfig((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleAddTool = (tool: AgentTool) => {
    if (builderTab === "a2a") {
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
    if (builderTab === "a2a") {
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
              (k.endsWith("Mcp") ||
                k.endsWith("Api") ||
                k === "enableEmailTool" ||
                k === "enableBqAnalytics") &&
              (prev as any)[k] === true,
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
      customMcpEndpoints: [...prev.customMcpEndpoints, { name: "", url: "" }],
    }));
  };

  const handleUpdateCustomMcp = (
    index: number,
    field: "name" | "url",
    value: string,
  ) => {
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
      const tools = await api.listMcpTools(deployProjectId || "", url);
      setCustomMcpStatus((prev) => ({
        ...prev,
        [index]: { loading: false, tools },
      }));
    } catch (e: any) {
      console.error("Failed to verify custom MCP:", e);
      setCustomMcpStatus((prev) => ({
        ...prev,
        [index]: { loading: false, error: e.message || String(e) },
      }));
    }
  };

  const handleRewrite = async (field: "instruction") => {
    setRewritingField(field);

    const currentInstruction =
      builderTab === "a2a" ? a2aConfig.instruction : adkConfig.instruction;

    let toolNames = "";
    if (builderTab === "a2a") {
      toolNames =
        a2aConfig.tools
          .map((t) => t.displayName || t.variableName)
          .join(", ") || "None";
    } else {
      const adkTools = [
        ...adkConfig.tools.map((t) => t.displayName || t.variableName),
      ];
      if (adkConfig.useGoogleSearch) adkTools.push("Google Search");
      if (adkConfig.enableCodeExecution)
        adkTools.push("Code Execution Sub-Agent");
      if (adkConfig.enableGraphvizRendering) adkTools.push("Graphviz Renderer");
      if (adkConfig.enableBigQueryMcp) adkTools.push("BigQuery MCP");
      if (adkConfig.enableCloudLoggingMcp) adkTools.push("Cloud Logging MCP");
      if (adkConfig.enableCloudSqlMcp) adkTools.push("Cloud SQL MCP");
      if (adkConfig.customMcpEndpoints.length > 0)
        adkTools.push(...adkConfig.customMcpEndpoints.map((e) => e.name));
      toolNames = adkTools.join(", ") || "None";
    }

    const prompt = `You are an expert prompt engineer. Your task is to rewrite the following system instruction to be highly effective for a Large Language Model (LLM).
        Structure the rewritten prompt clearly.
        Add necessary context and details to make the agent robust while preserving the user's original intent.
        The agent has access to the following tools: [${toolNames}]. Ensure the instructions explicitly guide the agent on when and how to use these tools effectively.
        Output ONLY the rewritten system instruction.
        
        Original Instruction: "${currentInstruction}"`;

    try {
      const text = await api.generateVertexContent(
        apiConfig,
        prompt,
        "gemini-2.5-flash",
        8192,
      );
      const rewrittenText = text
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/^```\w*\n?|\n?```$/g, "")
        .trim();
      if (builderTab === "a2a") {
        setA2aConfig((prev) => ({ ...prev, instruction: rewrittenText }));
      } else {
        setAdkConfig((prev) => ({ ...prev, instruction: rewrittenText }));
      }
    } catch (err: any) {
      alert(`AI rewrite failed: ${err.message}`);
    } finally {
      setRewritingField(null);
    }
  };

  const handleCopy = (
    content: string,
    setSuccess: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    navigator.clipboard.writeText(content).then(() => {
      setSuccess("Copied!");
      setTimeout(() => setSuccess(""), 2000);
    });
  };

  const handleDownloadA2a = async () => {
    const zip = new JSZip();
    zip.file("main.py", a2aGeneratedCode.main);
    zip.file("Dockerfile", a2aGeneratedCode.dockerfile);
    zip.file("requirements.txt", a2aGeneratedCode.requirements);
    zip.file("deploy.sh", a2aGeneratedCode.gcloud);
    zip.file("env.yaml", a2aGeneratedCode.yaml);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${a2aConfig.serviceName}-source.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAdkZip = () => {
    const zip = new JSZip();

    // App Directory
    const appFolder = zip.folder("app");
    appFolder.file("app.py", generateAppPy(true));
    appFolder.file("agent.py", generateAdkPythonCode(adkConfig, true));
    appFolder.file("requirements.txt", adkGeneratedCode.requirements);
    if (adkConfig.enableOAuth) {
      appFolder.file("auth.py", adkGeneratedCode.auth);
    }
    if (hasAnyTools(adkConfig)) {
      appFolder.file("tools.py", generateToolsPy(adkConfig, true));
    }
    appFolder.file("__init__.py", adkGeneratedCode.init);
    appFolder.file("deploy_re.py", generateAdkDeployScript(adkConfig));

    // Root Files
    zip.file(
      "agent.py",
      "import os, sys\nsys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))\nfrom app.agent import root_agent\n",
    );
    zip.file(".env", adkGeneratedCode.env);
    zip.file("README.md", generateAdkReadmeFile(adkConfig));
    zip.file("DESIGN_SPEC.md", generateDesignSpec(adkConfig));
    zip.file("Makefile", generateMakefile(adkConfig));

    if (adkConfig.deploymentTarget === "cloud_run") {
      zip.file("Dockerfile", generateDockerfile(adkConfig));
    }

    // Tests Directory
    const testsFolder = zip.folder("tests");
    const evalFolder = testsFolder.folder("eval");
    evalFolder.file("test_config.json", generateTestConfigJson(adkConfig));
    const evalsetsFolder = evalFolder.folder("evalsets");
    evalsetsFolder.file("basic.evalset.json", generateEvalSetJson(adkConfig));

    // Deployment Directory
    const deployFolder = zip.folder("deployment");
    deployFolder.file("terraform/main.tf", "# Terraform config placeholder");

    // Scripts Directory
    const scriptsFolder = zip.folder("scripts");
    scriptsFolder.file("launch_local.sh", generateLaunchScript(adkConfig));
    scriptsFolder.file("deploy.sh", generateAdkDeployBashWrapper());

    if (adkConfig.ciCdRunner === "google_cloud_build") {
      zip.file(
        "cloudbuild.yaml",
        generateCloudBuildYaml(adkConfig, deployProjectId || "YOUR_PROJECT_ID"),
      );
    } else if (adkConfig.ciCdRunner === "github_actions") {
      const githubFolder = zip.folder(".github");
      const workflowsFolder = githubFolder.folder("workflows");
      workflowsFolder.file("deploy.yaml", generateGithubWorkflow(adkConfig));
    }

    zip.generateAsync({ type: "blob" }).then(function (content) {
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${adkConfig.name || "adk_agent"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const adkCodeDisplay = {
    app: adkGeneratedCode.app,
    agent: adkGeneratedCode.agent,
    env: adkGeneratedCode.env,
    requirements: adkGeneratedCode.requirements,
    auth: adkGeneratedCode.auth,
    tools: adkGeneratedCode.tools,
    init: adkGeneratedCode.init,
    makefile: generateMakefile(adkConfig),
    dockerfile: generateDockerfile(adkConfig),
    cloudbuild: generateCloudBuildYaml(
      adkConfig,
      deployProjectId || "YOUR_PROJECT_ID",
    ),
    github_deploy: generateGithubWorkflow(adkConfig),
  }[adkActiveTab];

  const a2aCodeDisplay = {
    main: a2aGeneratedCode.main,
    dockerfile: a2aGeneratedCode.dockerfile,
    requirements: a2aGeneratedCode.requirements,
    env: a2aGeneratedCode.yaml,
  }[a2aActiveTab];

  const gitignoreContent = `.venv/\nvenv/\nnode_modules/\n__pycache__/\n.git/\n*.pyc\n*.pkl\ndeploy_re.py\n`;

  const adkFilesForBuild = [
    { name: "app.py", content: adkGeneratedCode.app },
    { name: "agent.py", content: adkGeneratedCode.agent },
    { name: ".env", content: adkGeneratedCode.env },
    { name: "requirements.txt", content: adkGeneratedCode.requirements },
    ...(adkConfig.enableOAuth ? [{ name: "auth.py", content: adkGeneratedCode.auth }] : []),
    ...(hasAnyTools(adkConfig) ? [{ name: "tools.py", content: adkGeneratedCode.tools }] : []),
    { name: "deploy_re.py", content: adkGeneratedCode.deploy_re },
    ...(adkConfig.deploymentTarget === "cloud_run" ? [{ name: "Dockerfile", content: generateDockerfile(adkConfig) }] : []),
    { name: ".gitignore", content: gitignoreContent },
    { name: ".ignore", content: gitignoreContent },
  ];

  const a2aFilesForBuild = [
    { name: "main.py", content: a2aGeneratedCode.main },
    { name: "Dockerfile", content: a2aGeneratedCode.dockerfile },
    { name: "requirements.txt", content: a2aGeneratedCode.requirements },
    { name: "deploy.sh", content: a2aGeneratedCode.gcloud },
    { name: "env.yaml", content: a2aGeneratedCode.yaml },
  ];

  const handleBuildTriggered = (id: string) => {
    // Use Global Handler
    const pid = deployProjectId || projectNumber;
    if (onBuildTriggered) onBuildTriggered(id, pid);

    setIsA2aDeployModalOpen(false);
    setIsAdkDeployModalOpen(false);
  };

  const handleCheckBuildStatus = async () => {
    if (!deployProjectId && !projectNumber) {
      alert("Project ID not set.");
      return;
    }
    const pid = deployProjectId || projectNumber;
    let foundAny = false;

    try {
      // Check for running builds first
      const running = await api.listCloudBuilds(pid, 'status="WORKING"');
      if (running.builds && running.builds.length > 0) {
        console.log(
          `handleCheckBuildStatus: FOUND ${running.builds.length} WORKING builds`,
        );
        running.builds.forEach((b: any) => {
          if (onBuildTriggered) onBuildTriggered(b.id, pid);
        });
        foundAny = true;
      }

      // Check for queued builds
      const queued = await api.listCloudBuilds(pid, 'status="QUEUED"');
      if (queued.builds && queued.builds.length > 0) {
        console.log(
          `handleCheckBuildStatus: FOUND ${queued.builds.length} QUEUED builds`,
        );
        queued.builds.forEach((b: any) => {
          if (onBuildTriggered) onBuildTriggered(b.id, pid);
        });
        foundAny = true;
      }

      // Fallback: Fetch latest if nothing active found yet
      if (!foundAny) {
        console.log(
          "No active (WORKING/QUEUED) builds. Fetching recent history...",
        );
        const recent = await api.listCloudBuilds(pid);
        const build = recent.builds?.[0];

        if (build) {
          console.log(
            "handleCheckBuildStatus: FOUND recent build:",
            build.id,
            build.status,
          );
          if (onBuildTriggered) onBuildTriggered(build.id, pid);
          foundAny = true;
        }
      }

      if (!foundAny) {
        alert("No active or queued builds found.");
      }
    } catch (e: any) {
      alert(`Failed to check builds: ${e.message}`);
    }
  };

  const ADK_TABS = [
    { id: "app", label: "app.py" },
    { id: "agent", label: "agent.py" },
    { id: "env", label: ".env" },
    { id: "requirements", label: "requirements.txt" },
    { id: "auth", label: "auth.py" },
    { id: "tools", label: "tools.py" },
    { id: "init", label: "__init__.py" },
    { id: "makefile", label: "Makefile" },
    ...(adkConfig.deploymentTarget === "cloud_run"
      ? [{ id: "dockerfile", label: "Dockerfile" }]
      : []),
    ...(adkConfig.enableCiCd && adkConfig.ciCdRunner === "google_cloud_build"
      ? [{ id: "cloudbuild", label: "cloudbuild.yaml" }]
      : []),
    ...(adkConfig.enableCiCd && adkConfig.ciCdRunner === "github_actions"
      ? [{ id: "github_deploy", label: "deploy.yaml" }]
      : []),
  ];

  const A2A_TABS = [
    { id: "main", label: "main.py" },
    { id: "dockerfile", label: "Dockerfile" },
    { id: "requirements", label: "requirements.txt" },
    { id: "env", label: "env.yaml" },
  ];

  // Map generated ADK code into the format expected by the GitHub API
  const githubDeploymentFiles = [
    { path: "app/app.py", content: adkGeneratedCode.app },
    { path: "app/agent.py", content: adkGeneratedCode.agent },
    { path: "app/.env", content: adkGeneratedCode.env },
    { path: "app/requirements.txt", content: adkGeneratedCode.requirements },
    { path: "app/__init__.py", content: adkGeneratedCode.init },
    { path: "app/deploy_re.py", content: adkGeneratedCode.deploy_re },
    { path: "Makefile", content: generateMakefile(adkConfig) },
    { path: "README.md", content: adkGeneratedCode.readme },
    { path: "tests/eval/test_config.json", content: generateTestConfig() },
    {
      path: "tests/eval/evalsets/basic.evalset.json",
      content: generateEvalSet(),
    },
  ];

  if (adkConfig.enableOAuth) {
    githubDeploymentFiles.push({
      path: "app/auth.py",
      content: adkGeneratedCode.auth,
    });
  }

  if (hasAnyTools(adkConfig)) {
    githubDeploymentFiles.push({
      path: "app/tools.py",
      content: adkGeneratedCode.tools,
    });
  }

  if (adkConfig.deploymentTarget === "cloud_run") {
    githubDeploymentFiles.push({
      path: "Dockerfile",
      content: generateDockerfile(adkConfig),
    });
  }

  // Always push the GitHub actions deploy config if they enabled GitHub CI/CD here!
  if (adkConfig.enableCiCd && adkConfig.ciCdRunner === "github_actions") {
    githubDeploymentFiles.push({
      path: ".github/workflows/deploy.yaml",
      content: generateGithubWorkflow(adkConfig),
    });
  }

  return (
    <div className="space-y-6 flex flex-col lg:h-full">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">ADK Prototyper & Code Studio</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Interactive ADK agent code generation, tool composition, and enterprise OAuth delegation blueprints.
          </p>
        </div>
        <div className="bg-gray-800 p-1 rounded-lg border border-gray-700">
          <button
            onClick={() => setBuilderTab("adk")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${builderTab === "adk" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            ADK Agent (Engine)
          </button>
          <button
            onClick={() => setBuilderTab("a2a")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${builderTab === "a2a" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            A2A Function (Cloud Run)
          </button>
        </div>

        <button
          onClick={handleCheckBuildStatus}
          className="ml-4 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 rounded border border-gray-600"
          title="Check for active builds if status window is missing"
        >
          Check Build Status
        </button>
      </div>

      {/* Deploy Modals */}
      <AgentDeploymentModal
        isOpen={isAdkDeployModalOpen}
        onClose={() => setIsAdkDeployModalOpen(false)}
        agentName={adkConfig.name || "my-agent"}
        files={adkFilesForBuild}
        projectNumber={projectNumber}
        onBuildTriggered={handleBuildTriggered}
        initialBucket={
          stagingBucket ? stagingBucket.replace("gs://", "") : undefined
        }
      />
      <A2aDeployModal
        isOpen={isA2aDeployModalOpen}
        onClose={() => setIsA2aDeployModalOpen(false)}
        projectNumber={projectNumber}
        serviceName={a2aConfig.serviceName}
        region={a2aConfig.region}
        files={a2aFilesForBuild}
        onBuildTriggered={handleBuildTriggered}
      />

      <GitHubDeployModal
        isOpen={isGithubModalOpen}
        onClose={() => setIsGithubModalOpen(false)}
        projectId={deployProjectId}
        agentName={adkConfig.name}
        files={githubDeploymentFiles}
        adkConfig={adkConfig}
        setAdkConfig={setAdkConfig}
        generateCallerGithubWorkflow={generateCallerGithubWorkflow}
      />

      {isFixMode && builderTab === "a2a" && (
        <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-lg shrink-0">
          <h3 className="text-yellow-400 font-bold mb-1">
            Fixing Service: {a2aConfig.serviceName}
          </h3>
          <p className="text-sm text-gray-300">
            Configuration pre-filled from deployed service.
          </p>
        </div>
      )}

      {/* Layout Container */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Column: Configuration (Box 1) */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-md lg:w-1/3 flex flex-col overflow-y-auto border border-gray-700">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h2 className="text-lg font-semibold text-white">
              1. Configure Agent
            </h2>
            <CloudConsoleButton
              url={`https://console.cloud.google.com/vertex-ai/agents/agent-engines?project=${projectNumber}`}
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Project Number
              </label>
              <ProjectInput value={projectNumber} onChange={setProjectNumber} />
            </div>

            {builderTab === "adk" ? (
              <>
                {/* Templates Selection */}
                <div className="mb-4 p-3 bg-gray-750 rounded-lg border border-gray-600">
                  <label className="block text-sm font-medium text-blue-400 mb-2">
                    🚀 Quick Start Templates
                  </label>
                  <select
                    onChange={(e) => {
                      const template = TEMPLATES.find(
                        (t) => t.id === e.target.value,
                      );
                      if (template) {
                        setAdkConfig((prev) => {
                          const cleanConfig: AdkAgentConfig = {
                            name: "",
                            description: "An agent that can do awesome things.",
                            model: "gemini-2.5-flash",
                            instruction:
                              "You are an awesome and helpful agent.",
                            tools: [],
                            useGoogleSearch: false,
                            enableOAuth: false,
                            authId: "temp_oauth",
                            allowAdcFallback: true,
                            enableDiscoveryApi: false,
                            discoveryConfig: {
                              projectId: "",
                              location: "global",
                              collection: "default_collection",
                              engineId: "",
                              dataStoreIds: "",
                            },
                            enableBqAnalytics: false,
                            bqDatasetId: "",
                            bqTableId: "",
                            enableThinking: false,
                            thinkingBudget: 1024,
                            thinkingLevel: "HIGH",
                            enableStreaming: false,
                            enableBigQueryMcp: false,
                            enableCodeExecution: false,
                            enableGraphvizRendering: false,
                            enableEmailTool: false,
                            enableSecurityCommandCenterApi: false,
                            enableRecommenderApi: false,
                            enableServiceHealthApi: false,
                            enableNetworkManagementApi: false,
                            enableCloudAssistApi: false,
                            enableTelemetry: true,
                            enableMessageLogging: false,
                            enableCloudLoggingApi: false,
                            enableCloudMonitoringApi: false,
                            enableCloudRunApi: false,
                            enableResourceManagerApi: false,
                            enableAdminActivityApi: false,
                            enableDatabaseFleetApi: false,
                            enableCloudLoggingMcp: false,
                            enableBigtableAdminMcp: false,
                            enableCloudSqlMcp: false,
                            enableCloudMonitoringMcp: false,
                            enableComputeEngineMcp: false,
                            enableFirestoreMcp: false,
                            enableGkeMcp: false,
                            enableResourceManagerMcp: false,
                            enableSpannerMcp: false,
                            enableDeveloperKnowledgeMcp: false,
                            enableMapsGroundingMcp: false,
                            enableEvaluation: false,
                            enableCiCd: false,
                            ciCdRunner: "none",
                            deploymentTarget: "agent_engine",
                            githubWifProvider: "",
                            githubServiceAccount: "",
                            customMcpEndpoints: [],
                          };

                          return {
                            ...cleanConfig,
                            ...template.config,
                            discoveryConfig: {
                              ...cleanConfig.discoveryConfig,
                              ...(template.config.discoveryConfig || {}),
                            },
                          };
                        });
                      }
                    }}
                    className="bg-gray-800 border border-gray-500 rounded-md px-3 py-2 text-sm text-white w-full hover:border-blue-500 focus:border-blue-500 transition-colors"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a template to auto-fill...
                    </option>
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} - {t.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Agent Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    value={adkConfig.name}
                    onChange={handleAdkConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Description
                  </label>
                  <input
                    name="description"
                    type="text"
                    value={adkConfig.description}
                    onChange={handleAdkConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Agent Location
                  </label>
                  <select
                    value={vertexLocation}
                    onChange={(e) => setVertexLocation(e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <option value="us-central1">us-central1</option>
                    <option value="europe-west1">europe-west1</option>
                    <option value="asia-east1">asia-east1</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    ADK Version
                  </label>
                  <select
                    name="adkVersion"
                    value={adkConfig.adkVersion || "1.35.1"}
                    onChange={handleAdkConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <option value="1.35.1">ADK 1.35.1 (Legacy)</option>
                    <option value="2.2">ADK 2.2 (Antigravity SDK)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Model
                  </label>
                  <select
                    name="model"
                    value={adkConfig.model}
                    onChange={handleAdkConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <optgroup label="Auto-Updating & Cutting-Edge (Global)">
                      <option value="gemini-flash-latest">Gemini Flash (Latest Auto-Updating)</option>
                      <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended)</option>
                      <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Preview)</option>
                      <option value="gemini-3-flash-preview">Gemini 3.0 Flash (Preview - Legacy)</option>
                    </optgroup>
                    <optgroup label="Stable Regional (us-central1)">
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    </optgroup>
                  </select>
                </div>

                {/* Staging Bucket - Moved here for ADK */}
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Staging Bucket
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={stagingBucket}
                      onChange={(e) => setStagingBucket(e.target.value)}
                      className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-teal-500 focus:border-teal-500"
                    >
                      <option value="">-- Select Bucket --</option>
                      {buckets.map((b) => (
                        <option key={b.name} value={`gs://${b.name}`}>
                          gs://{b.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setIsLoadingBuckets(true);
                        api.listBuckets(projectNumber).then((res) => {
                          setBuckets(res.items || []);
                          setIsLoadingBuckets(false);
                        });
                      }}
                      disabled={isLoadingBuckets}
                      className="px-3 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50"
                      title="Refresh Buckets"
                    >
                      &#x21bb;
                    </button>
                  </div>
                  {!stagingBucket && (
                    <p className="text-xs text-yellow-500 mt-1">
                      Required for deployment.
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-400">
                      Instruction
                    </label>
                    <button
                      onClick={() => handleRewrite("instruction")}
                      disabled={rewritingField === "instruction"}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {rewritingField === "instruction" ? "..." : "AI Rewrite"}
                    </button>
                  </div>

                  <textarea
                    name="instruction"
                    value={adkConfig.instruction}
                    onChange={handleAdkConfigChange}
                    rows={4}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full mt-2"
                  />
                </div>
                <div className="space-y-2 pt-2 border-t border-gray-600">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="useGoogleSearch"
                      checked={adkConfig.useGoogleSearch}
                      onChange={handleAdkConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Enable Google Search Tool
                    </span>
                  </label>

                  <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400">
                      Agent Capabilities
                    </h4>
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          name="enableThinking"
                          checked={adkConfig.enableThinking}
                          onChange={handleAdkConfigChange}
                          className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                        />
                        <span className="text-sm text-gray-300">
                          Enable Thinking Details
                        </span>
                      </label>
                      {adkConfig.enableThinking && (
                        <div className="flex items-center gap-2">
                          {adkConfig.model &&
                            (adkConfig.model.startsWith("gemini-3") || adkConfig.model.includes("3.5")) &&
                            !adkConfig.model.includes("latest") ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Level:</span>
                              <select
                                name="thinkingLevel"
                                value={adkConfig.thinkingLevel || "HIGH"}
                                onChange={handleAdkConfigChange}
                                title="Thinking depth for Gemini 3 models"
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-28"
                              >
                                <option value="MINIMAL">Minimal</option>
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Budget:</span>
                              <input
                                type="number"
                                name="thinkingBudget"
                                value={adkConfig.thinkingBudget || 1024}
                                onChange={handleAdkConfigChange}
                                placeholder="Limit (-1)"
                                title="Token limit for thinking process (-1 for unlimited)"
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-24"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableStreaming"
                        checked={adkConfig.enableStreaming}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Streaming Responses
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCodeExecution"
                        checked={adkConfig.enableCodeExecution}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Code Execution Sub-Agent
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableGraphvizRendering"
                        checked={adkConfig.enableGraphvizRendering}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Graphviz Local Renderer
                      </span>
                    </label>
                  </div>

                  <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400">
                      Integrations (Tools)
                    </h4>
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="bigquery.googleapis.com"
                      mcpEndpoint="https://bigquery.googleapis.com/mcp"
                      label="BigQuery Managed MCP"
                      checked={adkConfig.enableBigQueryMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableBigQueryMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="logging.googleapis.com"
                      mcpEndpoint="https://logging.googleapis.com/mcp"
                      label="Cloud Logging Managed MCP"
                      checked={adkConfig.enableCloudLoggingMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableCloudLoggingMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="bigtableadmin.googleapis.com"
                      mcpEndpoint="https://bigtableadmin.googleapis.com/mcp"
                      label="Bigtable Admin MCP"
                      checked={adkConfig.enableBigtableAdminMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableBigtableAdminMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="sqladmin.googleapis.com"
                      mcpEndpoint="https://sqladmin.googleapis.com/mcp"
                      label="Cloud SQL Admin MCP"
                      checked={adkConfig.enableCloudSqlMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableCloudSqlMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="monitoring.googleapis.com"
                      mcpEndpoint="https://monitoring.googleapis.com/mcp"
                      label="Cloud Monitoring MCP"
                      checked={adkConfig.enableCloudMonitoringMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableCloudMonitoringMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="compute.googleapis.com"
                      mcpEndpoint="https://compute.googleapis.com/mcp"
                      label="Compute Engine MCP"
                      checked={adkConfig.enableComputeEngineMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableComputeEngineMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="firestore.googleapis.com"
                      mcpEndpoint="https://firestore.googleapis.com/mcp"
                      label="Firestore MCP"
                      checked={adkConfig.enableFirestoreMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableFirestoreMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="container.googleapis.com"
                      mcpEndpoint="https://container.googleapis.com/mcp"
                      label="GKE MCP"
                      checked={adkConfig.enableGkeMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableGkeMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="cloudresourcemanager.googleapis.com"
                      mcpEndpoint="https://cloudresourcemanager.googleapis.com/mcp"
                      label="Resource Manager MCP"
                      checked={adkConfig.enableResourceManagerMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableResourceManagerMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="spanner.googleapis.com"
                      mcpEndpoint="https://spanner.googleapis.com/mcp"
                      label="Spanner MCP"
                      checked={adkConfig.enableSpannerMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableSpannerMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <h4 className="text-xs font-semibold text-gray-400 mt-2">
                      Google MCPs
                    </h4>
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="developerknowledge.googleapis.com"
                      mcpEndpoint="https://developerknowledge.googleapis.com/mcp"
                      label="Developer Knowledge MCP"
                      checked={adkConfig.enableDeveloperKnowledgeMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableDeveloperKnowledgeMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="mapstools.googleapis.com"
                      mcpEndpoint="https://mapstools.googleapis.com/mcp"
                      label="Maps Grounding Lite MCP"
                      checked={adkConfig.enableMapsGroundingMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableMapsGroundingMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />

                    <div className="mt-4 pt-4 border-t border-gray-600">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-xs font-semibold text-gray-400">
                          Custom MCP Endpoints
                        </h4>
                        <button
                          onClick={handleAddCustomMcp}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                        >
                          + Add Endpoint
                        </button>
                      </div>
                      <div className="space-y-3">
                        {adkConfig.customMcpEndpoints.map((endpoint, index) => (
                          <div
                            key={index}
                            className="flex space-x-2 items-start border border-gray-700 bg-gray-800 p-3 rounded-lg relative group"
                          >
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-col">
                                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                  Variable Name
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g., custom_zendesk_mcp"
                                  value={endpoint.name}
                                  onChange={(e) =>
                                    handleUpdateCustomMcp(
                                      index,
                                      "name",
                                      e.target.value.replace(/\s+/g, "_"),
                                    )
                                  }
                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs"
                                />
                              </div>
                              <div className="flex flex-col">
                                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                  Endpoint URL
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g., https://your-mcp-server.internal"
                                  value={endpoint.url}
                                  onChange={(e) =>
                                    handleUpdateCustomMcp(
                                      index,
                                      "url",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-mono"
                                />
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <button
                                  onClick={() =>
                                    handleVerifyCustomMcp(index, endpoint.url)
                                  }
                                  className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs transition-colors"
                                >
                                  Verify
                                </button>
                                {customMcpStatus[index] && (
                                  <span
                                    className={`text-xs ${customMcpStatus[index].error ? "text-red-400" : "text-green-400"}`}
                                  >
                                    {customMcpStatus[index].loading
                                      ? "Loading..."
                                      : customMcpStatus[index].error
                                        ? `Error: ${customMcpStatus[index].error}`
                                        : `Ready (${customMcpStatus[index].tools?.length || 0} tools)`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveCustomMcp(index)}
                              className="text-gray-500 hover:text-red-400 p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2"
                              title="Remove Endpoint"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {adkConfig.customMcpEndpoints.length === 0 && (
                          <p className="text-xs text-gray-500 italic pb-2">
                            No custom endpoints defined.
                          </p>
                        )}
                      </div>
                    </div>

                    <h4 className="text-xs font-semibold text-gray-400 mt-4 border-t border-gray-600 pt-4">
                      Custom APIs
                    </h4>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableSecurityCommandCenterApi"
                        checked={adkConfig.enableSecurityCommandCenterApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Security Command Center Tool
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableRecommenderApi"
                        checked={adkConfig.enableRecommenderApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Recommender Tool
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableServiceHealthApi"
                        checked={adkConfig.enableServiceHealthApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Service Health Tool
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableNetworkManagementApi"
                        checked={adkConfig.enableNetworkManagementApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Network Management Tool
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCloudLoggingApi"
                        checked={adkConfig.enableCloudLoggingApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Cloud Logging (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCloudMonitoringApi"
                        checked={adkConfig.enableCloudMonitoringApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Cloud Monitoring (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCloudRunApi"
                        checked={adkConfig.enableCloudRunApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Cloud Run Discovery (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableResourceManagerApi"
                        checked={adkConfig.enableResourceManagerApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Resource Manager (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableAdminActivityApi"
                        checked={adkConfig.enableAdminActivityApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Admin Activity / Changes (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableDatabaseFleetApi"
                        checked={adkConfig.enableDatabaseFleetApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Database Fleet Health (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCloudAssistApi"
                        checked={adkConfig.enableCloudAssistApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Gemini Cloud Assist
                      </span>
                    </label>

                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableEmailTool"
                        checked={adkConfig.enableEmailTool}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Email Sending Tool
                      </span>
                    </label>

                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center space-x-3">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            name="enableOAuth"
                            checked={adkConfig.enableOAuth}
                            onChange={handleAdkConfigChange}
                            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                          />
                          <span className="text-sm text-gray-300">
                            Enable OAuth Flow
                          </span>
                        </label>
                        {adkConfig.enableOAuth && (
                          <div className="flex items-center space-x-2">
                            {authInputMode === "select" &&
                              authorizations.length > 0 ? (
                              <select
                                name="authId"
                                value={adkConfig.authId}
                                onChange={handleAdkConfigChange}
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-44 h-[26px]"
                              >
                                <option value="">-- Select Auth ID --</option>
                                {authorizations.map((auth) => {
                                  const aId = auth.name.split("/").pop() || "";
                                  return (
                                    <option key={auth.name} value={aId}>
                                      {auth.displayName || aId}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <input
                                type="text"
                                name="authId"
                                value={adkConfig.authId}
                                onChange={handleAdkConfigChange}
                                placeholder="Auth ID (e.g. bqtest)"
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-32"
                              />
                            )}
                            {authorizations.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAuthInputMode((prev) =>
                                    prev === "select" ? "manual" : "select",
                                  )
                                }
                                className="text-xs text-blue-400 hover:text-blue-300 underline font-semibold shrink-0"
                              >
                                {authInputMode === "select"
                                  ? "Manual Input"
                                  : "Select Existing"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {adkConfig.enableOAuth && (
                        <label
                          className="flex items-center space-x-3 pl-6 cursor-pointer"
                          title="If disabled, tools will fail with an error if no user token is present, instead of defaulting to the service account."
                        >
                          <input
                            type="checkbox"
                            name="allowAdcFallback"
                            checked={adkConfig.allowAdcFallback}
                            onChange={handleAdkConfigChange}
                            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                          />
                          <span className="text-xs text-gray-400">
                            Allow fallback to Service Account (ADC)
                          </span>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400">
                      Observability
                    </h4>
                    <label
                      className="flex items-center space-x-3 cursor-pointer"
                      title="Populates the agent observability dashboard and traces pages."
                    >
                      <input
                        type="checkbox"
                        name="enableTelemetry"
                        checked={adkConfig.enableTelemetry}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable OpenTelemetry Traces & Logs
                      </span>
                    </label>
                    <label
                      className="flex items-center space-x-3 cursor-pointer"
                      title="Enabling this will collect and store the full content of user prompts and responses. Ensure you have necessary user consents."
                    >
                      <input
                        type="checkbox"
                        name="enableMessageLogging"
                        checked={adkConfig.enableMessageLogging}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Log Prompts & Responses (Sensitive)
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-400">
                    Lifecycle Management (WIP)
                  </h4>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="enableEvaluation"
                      checked={adkConfig.enableEvaluation}
                      onChange={handleAdkConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Enable Evaluation Configs
                    </span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="enableCiCd"
                      checked={adkConfig.enableCiCd}
                      onChange={handleAdkConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Enable CI/CD Scaffolding
                    </span>
                  </label>

                  {adkConfig.enableCiCd && (
                    <div className="pl-6 space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          CI/CD Runner
                        </label>
                        <select
                          name="ciCdRunner"
                          value={adkConfig.ciCdRunner}
                          onChange={handleAdkConfigChange}
                          className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                        >
                          <option value="none">None</option>
                          <option value="github_actions">GitHub Actions</option>
                          <option value="google_cloud_build">
                            Google Cloud Build
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Deployment Target
                        </label>
                        <select
                          name="deploymentTarget"
                          value={adkConfig.deploymentTarget}
                          onChange={handleAdkConfigChange}
                          className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                        >
                          <option value="agent_engine">Agent Engine</option>
                          <option value="cloud_run">Cloud Run</option>
                        </select>
                      </div>
                      {adkConfig.ciCdRunner === "github_actions" && (
                        <div className="pt-2 space-y-2 border-t border-gray-600 mt-2">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-medium text-gray-400">
                                WIF Provider
                              </label>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  setShowWifInstructions(!showWifInstructions);
                                }}
                                className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                              >
                                {showWifInstructions
                                  ? "Hide setup instructions"
                                  : "How to set up WIF"}
                              </button>
                            </div>
                            {wifProviders.length > 0 ? (
                              <select
                                name="githubWifProvider"
                                value={adkConfig.githubWifProvider || ""}
                                onChange={handleAdkConfigChange}
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                              >
                                <option value="">
                                  Select a WIF Provider...
                                </option>
                                {wifProviders.map((p) => (
                                  <option key={p.name} value={p.name}>
                                    {p.displayName || p.name.split("/").pop()}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                name="githubWifProvider"
                                value={adkConfig.githubWifProvider || ""}
                                onChange={handleAdkConfigChange}
                                placeholder="projects/123.../providers/my-provider"
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">
                              Service Account Email
                            </label>
                            {serviceAccounts.length > 0 ? (
                              <select
                                name="githubServiceAccount"
                                value={adkConfig.githubServiceAccount || ""}
                                onChange={handleAdkConfigChange}
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                              >
                                <option value="">
                                  Select a Service Account...
                                </option>
                                {serviceAccounts.map((sa) => (
                                  <option key={sa.email} value={sa.email}>
                                    {sa.email}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="email"
                                name="githubServiceAccount"
                                value={adkConfig.githubServiceAccount || ""}
                                onChange={handleAdkConfigChange}
                                placeholder="sa@my-project.iam.gserviceaccount.com"
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                              />
                            )}
                          </div>
                          {validationStatus !== "unchecked" && (
                            <div
                              className={`text-xs mt-1 ${validationStatus === "valid" ? "text-green-400" : validationStatus === "testing" ? "text-yellow-400" : "text-red-400"}`}
                            >
                              {validationStatus === "testing"
                                ? "Validating connection..."
                                : validationMessage}
                            </div>
                          )}

                          {showWifInstructions && (
                            <div className="p-3 bg-gray-800 rounded border border-gray-600 mt-2 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre">
                              <div># 1. Create a Workload Identity Pool</div>
                              <div className="text-gray-400">
                                gcloud iam workload-identity-pools create
                                "github-actions" \<br />{" "}
                                --project="YOUR_PROJECT_ID" \<br />{" "}
                                --location="global" \<br />{" "}
                                --display-name="GitHub Actions Pool"
                              </div>
                              <br />
                              <div># 2. Create a WIF Provider in that pool</div>
                              <div className="text-gray-400">
                                gcloud iam workload-identity-pools providers
                                create-oidc "my-repo" \<br />{" "}
                                --project="YOUR_PROJECT_ID" \<br />{" "}
                                --location="global" \<br />{" "}
                                --workload-identity-pool="github-actions" \
                                <br /> --display-name="My GitHub repo Provider"
                                \<br />{" "}
                                --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository_owner=assertion.repository_owner"
                                \<br />{" "}
                                --attribute-condition="attribute.repository_owner
                                == 'YOUR_ORG'" \<br />{" "}
                                --issuer-uri="https://token.actions.githubusercontent.com"
                              </div>
                              <br />
                              <div># 3. Create a Service Account</div>
                              <div className="text-gray-400">
                                gcloud iam service-accounts create
                                "github-actions-sa" \<br />{" "}
                                --project="YOUR_PROJECT_ID" \<br />{" "}
                                --display-name="GitHub Actions Service Account"
                              </div>
                              <br />
                              <div>
                                # 4. Bind the Service Account to the WIF
                                Provider
                              </div>
                              <div className="text-gray-400">
                                gcloud iam service-accounts
                                add-iam-policy-binding
                                "github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com"
                                \<br />
                                --project="YOUR_PROJECT_ID" \<br />
                                --role="roles/iam.workloadIdentityUser" \<br />
                                --member="principalSet://iam.googleapis.com/projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/attribute.repository_owner/YOUR_ORG"
                              </div>
                            </div>
                          )}

                          <div className="pt-2 flex justify-end">
                            <button
                              onClick={() => setIsGithubModalOpen(true)}
                              className="text-xs bg-gray-600 hover:bg-gray-500 text-white py-1.5 px-3 rounded flex items-center gap-1 transition-colors border border-gray-500"
                            >
                              <svg
                                viewBox="0 0 16 16"
                                className="w-3 h-3 fill-current"
                              >
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                              </svg>
                              Automated CI/CD Workflow Setup
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Validation Panel */}
                <div className="mt-4 p-3 bg-gray-900 rounded-lg border border-gray-700">
                  <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                    ADK Standards Validation
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-xs text-gray-300">
                        Standard Folder Structure (app/, tests/)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={
                          adkConfig.enableEvaluation
                            ? "text-green-400"
                            : "text-gray-600"
                        }
                      >
                        {adkConfig.enableEvaluation ? "✓" : "○"}
                      </span>
                      <span
                        className={`text-xs ${adkConfig.enableEvaluation ? "text-gray-300" : "text-gray-500"}`}
                      >
                        Evaluation Configured
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={
                          adkConfig.enableCiCd
                            ? "text-green-400"
                            : "text-gray-600"
                        }
                      >
                        {adkConfig.enableCiCd ? "✓" : "○"}
                      </span>
                      <span
                        className={`text-xs ${adkConfig.enableCiCd ? "text-gray-300" : "text-gray-500"}`}
                      >
                        CI/CD Pipeline Configured
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-xs text-gray-300">
                        Design Spec Generated
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Project ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deployProjectId}
                      onChange={(e) => setDeployProjectId(e.target.value)}
                      className={`bg-gray-700 border rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] ${/^\d+$/.test(deployProjectId) ? "border-yellow-500" : "border-gray-600"}`}
                      placeholder="e.g. my-project-id"
                    />
                    <button
                      onClick={fetchProjectId}
                      disabled={isResolvingId}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-white disabled:opacity-50"
                    >
                      {isResolvingId ? "..." : "↻"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Service Name
                  </label>
                  <input
                    name="serviceName"
                    type="text"
                    value={a2aConfig.serviceName}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Display Name
                  </label>
                  <input
                    name="displayName"
                    type="text"
                    value={a2aConfig.displayName}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Provider Organization
                  </label>
                  <input
                    name="providerOrganization"
                    type="text"
                    value={a2aConfig.providerOrganization}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Model
                  </label>
                  <select
                    name="model"
                    value={a2aConfig.model}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <optgroup label="Auto-Updating & Cutting-Edge (Global)">
                      <option value="gemini-flash-latest">Gemini Flash (Latest Auto-Updating)</option>
                      <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended)</option>
                      <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Preview)</option>
                      <option value="gemini-3-flash-preview">Gemini 3.0 Flash (Preview - Legacy)</option>
                    </optgroup>
                    <optgroup label="Stable Regional (us-central1)">
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Region
                  </label>
                  <select
                    name="region"
                    value={a2aConfig.region}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <option value="us-central1">us-central1</option>
                    <option value="europe-west1">europe-west1</option>
                    <option value="asia-east1">asia-east1</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-400">
                      System Instruction
                    </label>
                    <button
                      onClick={() => handleRewrite("instruction")}
                      disabled={rewritingField === "instruction"}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {rewritingField === "instruction" ? "..." : "AI Rewrite"}
                    </button>
                  </div>
                  <textarea
                    name="instruction"
                    value={a2aConfig.instruction}
                    onChange={handleA2aConfigChange}
                    rows={4}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full"
                  />
                </div>
                <div className="space-y-2 pt-2 border-t border-gray-600">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="useGoogleSearch"
                      checked={a2aConfig.useGoogleSearch}
                      onChange={handleA2aConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Enable Google Search Tool
                    </span>
                  </label>
                </div>
              </>
            )}

            <div className="pt-4 border-t border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-2">
                Add Tools
              </h3>
              <div className="bg-gray-700/50 p-3 rounded-md space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Vertex AI Search Data Store
                  </label>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Search data stores..."
                      value={dataStoreSearchTerm}
                      onChange={(e) => setDataStoreSearchTerm(e.target.value)}
                      className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={toolBuilderConfig.dataStoreId}
                        onChange={(e) =>
                          setToolBuilderConfig({
                            ...toolBuilderConfig,
                            dataStoreId: e.target.value,
                          })
                        }
                        className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full"
                        disabled={isLoadingDataStores}
                      >
                        <option value="">-- Select Data Store --</option>
                        {dataStores
                          .filter(
                            (ds) =>
                              !dataStoreSearchTerm ||
                              ds.displayName
                                .toLowerCase()
                                .includes(dataStoreSearchTerm.toLowerCase()) ||
                              ds.name.includes(dataStoreSearchTerm),
                          )
                          .map((ds) => {
                            const dsId = ds.name.split("/").pop();
                            return (
                              <option key={ds.name} value={ds.name}>
                                {ds.displayName} ({dsId}) - {ds.location}
                              </option>
                            );
                          })}
                      </select>
                      <button
                        onClick={() =>
                          handleAddTool({
                            type: "VertexAiSearchTool",
                            dataStoreId: toolBuilderConfig.dataStoreId,
                            variableName: `search_tool_${(builderTab === "a2a" ? a2aConfig.tools : adkConfig.tools).length + 1}`,
                          })
                        }
                        disabled={!toolBuilderConfig.dataStoreId}
                        className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Call Other Agent (A2A)
                  </label>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Search A2A services..."
                      value={a2aSearchTerm}
                      onChange={(e) => setA2aSearchTerm(e.target.value)}
                      className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={selectedA2aService}
                        onChange={(e) => setSelectedA2aService(e.target.value)}
                        className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full"
                        disabled={isLoadingServices}
                      >
                        <option value="">-- Select A2A Service --</option>
                        {cloudRunServices
                          .filter(
                            (s) =>
                              !a2aSearchTerm ||
                              s.name
                                .toLowerCase()
                                .includes(a2aSearchTerm.toLowerCase()),
                          )
                          .map((s) => (
                            <option key={s.name} value={s.uri}>
                              {s.name.split("/").pop()}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() =>
                          handleAddTool({
                            type: "A2AClientTool",
                            url: selectedA2aService,
                            variableName: `a2a_agent_${(builderTab === "a2a" ? a2aConfig.tools : adkConfig.tools).length + 1}`,
                          })
                        }
                        disabled={!selectedA2aService}
                        className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {(builderTab === "a2a" ? a2aConfig.tools : adkConfig.tools).map(
                  (tool, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-gray-900 px-3 py-2 rounded border border-gray-700"
                    >
                      <div className="text-xs text-gray-300">
                        <span className="font-bold text-teal-400">
                          {tool.type === "VertexAiSearchTool"
                            ? "Search"
                            : "A2A"}
                        </span>
                        : {tool.variableName}
                      </div>
                      <button
                        onClick={() => handleRemoveTool(i)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  ),
                )}
              </div>
            </div>

            {builderTab === "a2a" && (
              <div className="pt-4 border-t border-gray-700">
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Testing Options
                </h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="allowUnauthenticated"
                      checked={a2aConfig.allowUnauthenticated}
                      onChange={handleA2aConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Allow unauthenticated invocations
                    </span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="enableCors"
                      checked={a2aConfig.enableCors}
                      onChange={handleA2aConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">Enable CORS</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Code & Deploy (Box 2 & 3) */}
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col flex-1 min-h-0 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-3 shrink-0">
              2. Generated Source Code
            </h2>
            <div className="flex justify-between items-center mb-2 shrink-0">
              <div className="flex border-b border-gray-700">
                {(builderTab === "adk"
                  ? ADK_TABS.filter(
                    (t) =>
                      (t.id !== "auth" || adkConfig.enableOAuth) &&
                      (t.id !== "tools" || hasAnyTools(adkConfig)),
                  )
                  : A2A_TABS
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() =>
                      builderTab === "adk"
                        ? setAdkActiveTab(tab.id as any)
                        : setA2aActiveTab(tab.id as any)
                    }
                    className={`px-3 py-2 text-xs font-medium transition-colors ${(builderTab === "adk" ? adkActiveTab : a2aActiveTab) ===
                        tab.id
                        ? "border-b-2 border-blue-500 text-white"
                        : "text-gray-400 hover:text-white"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Location */}
              <button
                onClick={() =>
                  handleCopy(
                    builderTab === "adk" ? adkCodeDisplay : a2aCodeDisplay,
                    builderTab === "adk"
                      ? setAdkCopySuccess
                      : setA2aCopySuccess,
                  )
                }
                className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
              >
                {(builderTab === "adk" ? adkCopySuccess : a2aCopySuccess) ||
                  "Copy"}
              </button>
            </div>
            <div className="bg-gray-900 rounded-b-md flex-1 overflow-auto border border-gray-700">
              <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap">
                <code>
                  {builderTab === "adk" ? adkCodeDisplay : a2aCodeDisplay}
                </code>
              </pre>
            </div>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col flex-1 min-h-0 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-3 shrink-0">
              3. Deployment Options
            </h2>
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
              <div className="bg-blue-900/20 p-4 rounded-md border border-blue-800 shrink-0">
                <h3 className="text-sm font-bold text-blue-300 mb-1">
                  Option A: Cloud Build (Automated)
                </h3>
                <button
                  onClick={() =>
                    builderTab === "adk"
                      ? setIsAdkDeployModalOpen(true)
                      : setIsA2aDeployModalOpen(true)
                  }
                  className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 text-white font-bold rounded-md shadow-lg flex items-center justify-center gap-2"
                >
                  Deploy with Cloud Build
                </button>
              </div>
              <div className="bg-gray-900/50 p-4 rounded-md border border-gray-700 flex-1 flex flex-col min-h-[150px]">
                <div className="flex justify-between items-center mb-2 shrink-0">
                  <h3 className="text-sm font-bold text-gray-200">
                    {builderTab === "adk"
                      ? "Option B: Manual Deployment (README)"
                      : "Option B: Manual Deployment (CLI Script)"}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={
                        builderTab === "adk"
                          ? handleDownloadAdkZip
                          : handleDownloadA2a
                      }
                      className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
                    >
                      Download .zip
                    </button>
                    <button
                      onClick={() =>
                        handleCopy(
                          builderTab === "adk"
                            ? adkGeneratedCode.readme
                            : a2aGeneratedCode.gcloud,
                          builderTab === "adk"
                            ? setAdkCopySuccess
                            : setA2aCopySuccess,
                        )
                      }
                      className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
                    >
                      {(builderTab === "adk"
                        ? adkCopySuccess
                        : a2aCopySuccess) ||
                        (builderTab === "adk" ? "Copy README" : "Copy Script")}
                    </button>
                  </div>
                </div>
                <div className="bg-black rounded-md flex-1 min-h-0 border border-gray-800 flex items-center justify-center p-4">
                  <p className="text-sm text-gray-400 text-center">
                    Export as .zip for manual inspection or deployment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentBuilderPage;
