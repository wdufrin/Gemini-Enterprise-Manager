import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  generateAdkPythonCode,
  generateAdk22PythonCode,
  generateAuthPy,
  generateToolOAuthSnippet,
  generateToolsPy,
  generateAppPy,
  generateInitPy,
  generateMainPy,
  generateDockerfile,
  generateA2aEnvYaml,
  generateRequirementsTxt,
  generateGcloudCommand,
  generateAdkDeployScript,
  generateAdkDeployBashWrapper,
  generateAdkRequirementsFile,
  generateCallerGithubWorkflow,
  generateMakefile,
  generateTestConfigJson,
  generateEvalSetJson,
  TEMPLATES,
  AdkAgentConfig,
  A2aConfig,
} from '../services/adkTemplates';

const OUTPUT_DIR = '/usr/local/google/home/wdufrin/.gemini/jetski/brain/0d139446-dd76-4abe-90bd-6a263fa9974e/generated_adk_snippets';

describe('Generate All ADK Code Snippet Combinations', () => {
  it('generates all combinations of ADK Studio code snippets', () => {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const baseConfig: AdkAgentConfig = {
      adkVersion: '1.35.1',
      name: 'enterprise_adk_agent',
      description: 'Enterprise ADK Agent with full tool integration',
      model: 'gemini-2.5-flash',
      instruction: 'You are an enterprise AI assistant helping corporate users with data and operations.',
      tools: [
        {
          type: 'VertexAiSearchTool',
          dataStoreId: 'projects/123456789/locations/global/collections/default_collection/dataStores/hr-policy-store',
          variableName: 'hr_data_store',
          displayName: 'HR Policy Search',
        },
        {
          type: 'A2AClientTool',
          url: 'https://finance-service-xyz.a.run.app',
          variableName: 'finance_a2a_tool',
          displayName: 'Finance A2A Tool',
        },
      ],
      useGoogleSearch: true,
      enableOAuth: true,
      authId: 'corp-oauth-client',
      allowAdcFallback: true,
      enableDiscoveryApi: true,
      discoveryConfig: {
        projectId: 'my-gcp-project',
        location: 'global',
        collection: 'default_collection',
        engineId: 'corp-engine',
        dataStoreIds: 'hr-policy-store',
      },
      enableBqAnalytics: true,
      bqDatasetId: 'agent_observability',
      bqTableId: 'telemetry_events',
      enableThinking: true,
      thinkingBudget: 2048,
      thinkingLevel: 'HIGH',
      enableStreaming: true,
      enableBigQueryMcp: true,
      enableCodeExecution: true,
      enableGraphvizRendering: false,
      enableEmailTool: true,
      enableSecurityCommandCenterApi: true,
      enableRecommenderApi: true,
      enableServiceHealthApi: true,
      enableNetworkManagementApi: true,
      enableCloudAssistApi: true,
      enableCloudLoggingApi: true,
      enableCloudMonitoringApi: true,
      enableCloudRunApi: true,
      enableResourceManagerApi: true,
      enableAdminActivityApi: true,
      enableDatabaseFleetApi: true,
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
      enableTelemetry: true,
      enableMessageLogging: true,
      enableEvaluation: true,
      enableCiCd: true,
      ciCdRunner: 'github_actions',
      deploymentTarget: 'agent_engine',
      githubWifProvider: 'projects/123456/locations/global/workloadIdentityPools/github-pool/providers/github-provider',
      githubServiceAccount: 'adk-deployer@my-gcp-project.iam.gserviceaccount.com',
      customMcpEndpoints: [],
    };

    // 1. ADK 1.35 Complete Agent Bundle
    const v1Dir = path.join(OUTPUT_DIR, 'combo_01_adk_135_full');
    fs.mkdirSync(v1Dir, { recursive: true });
    fs.writeFileSync(path.join(v1Dir, 'agent.py'), generateAdkPythonCode(baseConfig));
    fs.writeFileSync(path.join(v1Dir, 'auth.py'), generateAuthPy(baseConfig, true));
    fs.writeFileSync(path.join(v1Dir, 'tools.py'), generateToolsPy(baseConfig));
    fs.writeFileSync(path.join(v1Dir, 'app.py'), generateAppPy(baseConfig));
    fs.writeFileSync(path.join(v1Dir, '__init__.py'), generateInitPy());
    fs.writeFileSync(path.join(v1Dir, 'requirements.txt'), generateAdkRequirementsFile(baseConfig));
    fs.writeFileSync(path.join(v1Dir, 'deploy_re.py'), generateAdkDeployScript(baseConfig));
    fs.writeFileSync(path.join(v1Dir, 'deploy.sh'), generateAdkDeployBashWrapper());

    // 2. ADK 2.2 / Antigravity Complete Agent Bundle
    const v2Config: AdkAgentConfig = { ...baseConfig, adkVersion: '2.2' };
    const v2Dir = path.join(OUTPUT_DIR, 'combo_02_adk_22_antigravity');
    fs.mkdirSync(v2Dir, { recursive: true });
    fs.writeFileSync(path.join(v2Dir, 'agent.py'), generateAdk22PythonCode(v2Config));
    fs.writeFileSync(path.join(v2Dir, 'auth.py'), generateAuthPy(v2Config, true));
    fs.writeFileSync(path.join(v2Dir, 'tools.py'), generateToolsPy(v2Config));
    fs.writeFileSync(path.join(v2Dir, 'app.py'), generateAppPy(v2Config));
    fs.writeFileSync(path.join(v2Dir, 'requirements.txt'), generateAdkRequirementsFile(v2Config));
    fs.writeFileSync(path.join(v2Dir, 'deploy_re.py'), generateAdkDeployScript(v2Config));
    fs.writeFileSync(path.join(v2Dir, 'deploy.sh'), generateAdkDeployBashWrapper());

    // 3. Strict Zero-Trust OAuth (ADC Fallback Disabled) vs Permissive
    const strictAuthDir = path.join(OUTPUT_DIR, 'combo_03_oauth_delegation_patterns');
    fs.mkdirSync(strictAuthDir, { recursive: true });
    fs.writeFileSync(path.join(strictAuthDir, 'auth_strict_zero_trust.py'), generateAuthPy(baseConfig, false));
    fs.writeFileSync(path.join(strictAuthDir, 'auth_permissive_adc.py'), generateAuthPy(baseConfig, true));
    fs.writeFileSync(path.join(strictAuthDir, 'standalone_tool_oauth_delegation.py'), generateToolOAuthSnippet('corp-oauth-client'));

    // 4. Starter Template: GCP Logs Reader
    const tLogsDir = path.join(OUTPUT_DIR, 'combo_04_template_gcp_logs_reader');
    fs.mkdirSync(tLogsDir, { recursive: true });
    const logsConfig: AdkAgentConfig = { ...baseConfig, ...TEMPLATES[0].config } as AdkAgentConfig;
    fs.writeFileSync(path.join(tLogsDir, 'agent.py'), generateAdkPythonCode(logsConfig));
    fs.writeFileSync(path.join(tLogsDir, 'tools.py'), generateToolsPy(logsConfig));

    // 5. Starter Template: GCP Health Monitoring (MCP Edition)
    const tHealthMcpDir = path.join(OUTPUT_DIR, 'combo_05_template_health_mcp');
    fs.mkdirSync(tHealthMcpDir, { recursive: true });
    const healthMcpConfig: AdkAgentConfig = { ...baseConfig, ...TEMPLATES[1].config } as AdkAgentConfig;
    fs.writeFileSync(path.join(tHealthMcpDir, 'agent.py'), generateAdkPythonCode(healthMcpConfig));
    fs.writeFileSync(path.join(tHealthMcpDir, 'tools.py'), generateToolsPy(healthMcpConfig));

    // 6. Starter Template: GCP Health Monitoring (Native Python API Edition)
    const tHealthApiDir = path.join(OUTPUT_DIR, 'combo_06_template_health_api');
    fs.mkdirSync(tHealthApiDir, { recursive: true });
    const healthApiConfig: AdkAgentConfig = { ...baseConfig, ...TEMPLATES[2].config } as AdkAgentConfig;
    fs.writeFileSync(path.join(tHealthApiDir, 'agent.py'), generateAdkPythonCode(healthApiConfig));
    fs.writeFileSync(path.join(tHealthApiDir, 'tools.py'), generateToolsPy(healthApiConfig));

    // 7. Starter Template: GCP BigQuery Expert (Code Execution Sub-Agent)
    const tBqDir = path.join(OUTPUT_DIR, 'combo_07_template_bigquery_code_exec');
    fs.mkdirSync(tBqDir, { recursive: true });
    const bqConfig: AdkAgentConfig = { ...baseConfig, ...TEMPLATES[3].config } as AdkAgentConfig;
    fs.writeFileSync(path.join(tBqDir, 'agent.py'), generateAdkPythonCode(bqConfig));
    fs.writeFileSync(path.join(tBqDir, 'tools.py'), generateToolsPy(bqConfig));

    // 8. Starter Template: GCP Architecture Diagram Agent (Graphviz + Thinking)
    const tArchDir = path.join(OUTPUT_DIR, 'combo_08_template_architecture_graphviz');
    fs.mkdirSync(tArchDir, { recursive: true });
    const archConfig: AdkAgentConfig = { ...baseConfig, ...TEMPLATES[4].config } as AdkAgentConfig;
    fs.writeFileSync(path.join(tArchDir, 'agent.py'), generateAdkPythonCode(archConfig));
    fs.writeFileSync(path.join(tArchDir, 'tools.py'), generateToolsPy(archConfig));

    // 9. A2A Cloud Run Microservice Bundle
    const a2aConfig: A2aConfig = {
      serviceName: 'enterprise-a2a-service',
      displayName: 'Enterprise A2A Service',
      providerOrganization: 'Acme Corp',
      model: 'gemini-2.5-flash',
      region: 'us-central1',
      memory: '2Gi',
      instruction: 'You are an autonomous A2A service responding to agent-to-agent queries.',
      allowUnauthenticated: false,
      enableCors: true,
      useGoogleSearch: true,
      tools: [
        {
          type: 'VertexAiSearchTool',
          dataStoreId: 'projects/123456789/locations/global/collections/default_collection/dataStores/fin-store',
          variableName: 'fin_store',
        },
      ],
    };
    const a2aDir = path.join(OUTPUT_DIR, 'combo_09_a2a_cloud_run_bundle');
    fs.mkdirSync(a2aDir, { recursive: true });
    fs.writeFileSync(path.join(a2aDir, 'main.py'), generateMainPy(a2aConfig));
    fs.writeFileSync(path.join(a2aDir, 'Dockerfile'), generateDockerfile(baseConfig));
    fs.writeFileSync(path.join(a2aDir, 'env.yaml'), generateA2aEnvYaml(a2aConfig, 'my-gcp-project'));
    fs.writeFileSync(path.join(a2aDir, 'requirements.txt'), generateRequirementsTxt());
    fs.writeFileSync(path.join(a2aDir, 'gcloud_deploy.sh'), generateGcloudCommand(a2aConfig, '123456789012'));

    // 10. CI/CD GitHub Actions Automation
    const cicdDir = path.join(OUTPUT_DIR, 'combo_10_cicd_github_actions');
    fs.mkdirSync(cicdDir, { recursive: true });
    fs.writeFileSync(path.join(cicdDir, 'deploy.yaml'), generateCallerGithubWorkflow(baseConfig, 'my-gcp-project'));

    console.log('Successfully generated all 10 ADK snippet combinations into', OUTPUT_DIR);
  });
});
