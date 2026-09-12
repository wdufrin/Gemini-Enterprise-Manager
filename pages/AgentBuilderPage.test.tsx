import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AgentBuilderPage, {
  generateA2aEnvYaml,
  generateAdkEnvFile,
  generateGithubWorkflow,
  generateCallerGithubWorkflow,
  A2aConfig,
  AdkAgentConfig
} from './AgentBuilderPage';
import {
  isValidAdkAgentName,
  toCloudRunServiceName,
  ADK_AGENT_NAME_HINT,
} from '../services/adkTemplates/agentName';
import { TEMPLATES } from '../services/adkTemplates/starterTemplates';

// Mock apiService
vi.mock('../services/apiService', () => ({
  listResources: vi.fn().mockResolvedValue({ collections: [], engines: [], dataStores: [] }),
  listServiceAccounts: vi.fn().mockResolvedValue([]),
  listWorkloadIdentityPools: vi.fn().mockResolvedValue([]),
  listWorkloadIdentityProviders: vi.fn().mockResolvedValue([]),
  getServiceAccountIamPolicy: vi.fn().mockResolvedValue({}),
  getProject: vi.fn().mockResolvedValue({ projectNumber: '123456789' }),
  listCloudRunServices: vi.fn().mockResolvedValue([]),
  listBuckets: vi.fn().mockResolvedValue([]),
  listAuthorizations: vi.fn().mockResolvedValue([]),
  listMcpTools: vi.fn().mockResolvedValue([]),
  listCloudBuilds: vi.fn().mockResolvedValue([]),
}));

describe('AgentBuilderPage - Helper Functions', () => {
  describe('generateA2aEnvYaml', () => {
    const baseA2aConfig: A2aConfig = {
      serviceName: 'test-service',
      displayName: 'Test Service',
      providerOrganization: 'test-org',
      model: 'gemini-2.5-flash',
      region: 'us-central1',
      memory: '512Mi',
      instruction: 'hello',
      cloudRunAccess: 'authenticated',
      enableCors: true,
      useGoogleSearch: false,
      tools: [],
    };

    it('should map model location to "global" if Gemini 3', () => {
      const config = { ...baseA2aConfig, model: 'gemini-3.5-flash', region: 'us-central1' };
      const output = generateA2aEnvYaml(config, 'my-project');
      expect(output).toContain('GOOGLE_CLOUD_LOCATION: "global"');
      expect(output).toContain('DEPLOYMENT_LOCATION: "us-central1"');
    });

    it('should fallback to actual region if model is not Gemini 3', () => {
      const config = { ...baseA2aConfig, model: 'gemini-2.5-flash', region: 'us-central1' };
      const output = generateA2aEnvYaml(config, 'my-project');
      expect(output).toContain('GOOGLE_CLOUD_LOCATION: "us-central1"');
      expect(output).toContain('DEPLOYMENT_LOCATION: "us-central1"');
    });
  });

  describe('generateAdkEnvFile', () => {
    const baseAdkConfig = {
      adkVersion: '2.2',
      name: 'test-agent',
      description: 'Test Description',
      model: 'gemini-2.5-flash',
      instruction: 'hello',
      tools: [],
      useGoogleSearch: false,
      enableOAuth: false,
      authId: '',
      allowAdcFallback: true,
      enableDiscoveryApi: false,
      discoveryConfig: {
        projectId: '',
        location: '',
        collection: '',
        engineId: '',
        dataStoreIds: '',
      },
      enableThinking: false,
      thinkingLevel: 'HIGH',
      thinkingBudget: 1024,
      enableTelemetry: false,
      enableMessageLogging: false,
    } as unknown as AdkAgentConfig;

    it('should map model location to "global" if Gemini 3', () => {
      const config = { ...baseAdkConfig, model: 'gemini-3.5-flash' };
      const output = generateAdkEnvFile(config, '123456789', 'us-central1', 'gs://my-staging-bucket');
      expect(output).toContain('GOOGLE_CLOUD_LOCATION="global"');
      expect(output).toContain('DEPLOYMENT_LOCATION="us-central1"');
    });

    it('should fallback to actual location if model is not Gemini 3', () => {
      const config = { ...baseAdkConfig, model: 'gemini-2.5-flash' };
      const output = generateAdkEnvFile(config, '123456789', 'us-central1', 'gs://my-staging-bucket');
      expect(output).toContain('GOOGLE_CLOUD_LOCATION="us-central1"');
      expect(output).toContain('DEPLOYMENT_LOCATION="us-central1"');
    });

    it('should always append ADK_DISABLE_JSON_SCHEMA_FOR_FUNC_DECL="1"', () => {
      const output = generateAdkEnvFile(baseAdkConfig, '123456789', 'us-central1', 'gs://my-staging-bucket');
      expect(output).toContain('ADK_DISABLE_JSON_SCHEMA_FOR_FUNC_DECL="1"');
    });

    it('should emit THINKING_LEVEL="HIGH" for Gemini 3 models when thinking is enabled', () => {
      const config = {
        ...baseAdkConfig,
        model: 'gemini-3.8-flash',
        enableThinking: true,
        thinkingLevel: 'HIGH',
      };
      const output = generateAdkEnvFile(config, '123456789', 'us-central1', 'gs://my-staging-bucket');
      expect(output).toContain('THINKING_LEVEL="HIGH"');
      expect(output).not.toContain('THINKING_BUDGET=');
    });

    it('should emit THINKING_BUDGET="2048" for Gemini 2.5 models when thinking is enabled', () => {
      const config = {
        ...baseAdkConfig,
        model: 'gemini-2.5-flash',
        enableThinking: true,
        thinkingBudget: 2048,
      };
      const output = generateAdkEnvFile(config, '123456789', 'us-central1', 'gs://my-staging-bucket');
      expect(output).toContain('THINKING_BUDGET="2048"');
      expect(output).not.toContain('THINKING_LEVEL=');
    });
  });

  describe('generateGithubWorkflow', () => {
    it('should generate a valid Github Actions reusable workflow template', () => {
      const config = {
        name: 'test-agent',
      } as unknown as AdkAgentConfig;
      const output = generateGithubWorkflow(config);
      expect(output).toContain('name: Deploy Agent (Reusable Template)');
      expect(output).toContain('uv run adk eval');
    });
  });

  describe('generateCallerGithubWorkflow', () => {
    it('should generate a caller template pointing to the correct shared workflow path', () => {
      const config = {
        githubServiceAccount: 'custom-deployer@project.iam.gserviceaccount.com',
      } as unknown as AdkAgentConfig;
      const output = generateCallerGithubWorkflow(config, 'my-org/my-repo/.github/workflows/deploy.yml@main', 'gemini-app-123');
      expect(output).toContain('uses: my-org/my-repo/.github/workflows/deploy.yml@main');
      expect(output).toContain('custom-deployer@project.iam.gserviceaccount.com');
      expect(output).toContain('gemini_app_id: "gemini-app-123"');
    });
  });

  describe('AgentBuilderPage Rendering Tests', () => {
    it('renders the AgentBuilderPage and checks that preview model options are available', async () => {
      render(
        <AgentBuilderPage
          projectNumber="123456789"
          setProjectNumber={() => {}}
        />
      );

      // Verify page is rendered by finding tabs or headings
      expect(screen.getByText('1. Configure Agent')).toBeDefined();

      // Check model options in the document (contains preview options)
      const options = screen.getAllByRole('option');
      const optionValues = options.map(o => (o as HTMLOptionElement).value);

      expect(optionValues).toContain('gemini-3.1-pro-preview');
      expect(optionValues).toContain('gemini-3-flash-preview');
      expect(optionValues).toContain('gemini-3.5-flash');
    });

    it('does not contain the ADK 2.2 option in the version selector', async () => {
      render(
        <AgentBuilderPage
          projectNumber="123456789"
          setProjectNumber={() => {}}
        />
      );

      const options = screen.getAllByRole('option');
      const optionValues = options.map(o => (o as HTMLOptionElement).value);

      expect(optionValues).not.toContain('2.2');
    });

    it('displays an error message for invalid agent names', async () => {
      const { container } = render(
        <AgentBuilderPage
          projectNumber="123456789"
          setProjectNumber={() => {}}
        />
      );

      // Find the name input
      const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement;
      expect(nameInput).toBeDefined();

      // Ensure error is shown when empty (initial state is empty)
      expect(screen.getByText(ADK_AGENT_NAME_HINT)).toBeDefined();

      // Hyphens are genuinely invalid: ADK requires a Python identifier.
      act(() => {
        fireEvent.change(nameInput, { target: { value: 'Invalid-Name' } });
      });
      expect(screen.getByText(ADK_AGENT_NAME_HINT)).toBeDefined();

      // Type a valid name
      act(() => {
        fireEvent.change(nameInput, { target: { value: 'valid_name' } });
      });
      expect(screen.queryByText(ADK_AGENT_NAME_HINT)).toBeNull();

      // REGRESSION: uppercase is valid. ADK accepts any Python identifier, and
      // every shipped starter template uses names like GCP_BigQuery_Orchestrator.
      // A previous lowercase-only rule rejected all five of them.
      act(() => {
        fireEvent.change(nameInput, { target: { value: 'GCP_BigQuery_Orchestrator' } });
      });
      expect(screen.queryByText(ADK_AGENT_NAME_HINT)).toBeNull();
    });

    /**
     * Remediation 2.7. The generated Makefile used to hardcode
     * `--allow-unauthenticated`, so the builder shipped world-callable agents
     * with no way to say otherwise. The picker must exist, must start on the
     * locked-down option, and must shout when the user picks public.
     */
    it('defaults Cloud Run access to authenticated and warns on public', () => {
      const { container } = render(
        <AgentBuilderPage
          projectNumber="123456789"
          setProjectNumber={() => {}}
        />
      );

      const radios = Array.from(
        container.querySelectorAll('input[name="adk-cloud-run-access"]')
      ) as HTMLInputElement[];
      expect(radios.length).toBe(3);

      const checked = radios.filter((r) => r.checked).map((r) => r.value);
      expect(checked).toEqual(['authenticated']);

      // No warning banner until the user opts in.
      expect(screen.queryByText(/open to the internet/i)).toBeNull();

      const publicRadio = radios.find((r) => r.value === 'public');
      act(() => {
        fireEvent.click(publicRadio as HTMLInputElement);
      });
      expect(screen.getByText(/open to the internet/i)).toBeDefined();
    });

    it('surfaces the IAP caveats instead of pretending IAP is one-click', () => {
      const { container } = render(
        <AgentBuilderPage
          projectNumber="123456789"
          setProjectNumber={() => {}}
        />
      );

      const iapRadio = container.querySelector(
        'input[name="adk-cloud-run-access"][value="iap"]'
      ) as HTMLInputElement;
      act(() => {
        fireEvent.click(iapRadio);
      });

      expect(
        screen.getByText(/service-PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com/)
      ).toBeDefined();
      expect(
        screen.getByText(/OAuth clients cannot be created programmatically/)
      ).toBeDefined();
    });

    it('renders Thinking Level selector for Gemini 3 and Thinking Budget for Gemini 2', () => {
      const { container } = render(
        <AgentBuilderPage
          projectNumber="123456789"
          setProjectNumber={() => {}}
        />
      );

      // Enable thinking
      const thinkingCheckbox = container.querySelector('input[name="enableThinking"]') as HTMLInputElement;
      expect(thinkingCheckbox).toBeDefined();
      act(() => {
        fireEvent.click(thinkingCheckbox);
      });

      // Default model in initial state is gemini-2.5-flash -> should show Budget input
      expect(container.querySelector('input[name="thinkingBudget"]')).toBeDefined();
      expect(container.querySelector('select[name="thinkingLevel"]')).toBeNull();

      // Switch model to Gemini 3.8 Flash
      const modelSelect = container.querySelector('select[name="model"]') as HTMLSelectElement;
      act(() => {
        fireEvent.change(modelSelect, { target: { value: 'gemini-3.8-flash' } });
      });

      // Should now show Thinking Level selector and hide Budget input
      expect(container.querySelector('select[name="thinkingLevel"]')).toBeDefined();
      expect(container.querySelector('input[name="thinkingBudget"]')).toBeNull();
    });
  });

  // The bug this guards against shipped because the validation rule and the
  // starter templates were written independently and never checked against
  // each other. Every template the product ships must satisfy the product's
  // own validation.
  //
  // NOTE: `t.name` is the human-readable label ("GCP Logs Reader", with
  // spaces). The agent name that reaches ADK is `t.config.name`.
  describe('starter templates satisfy agent-name validation', () => {
    it('has at least one template (guards against an empty import)', () => {
      expect(TEMPLATES.length).toBeGreaterThan(0);
    });

    it.each(TEMPLATES.map((t) => [t.id, t.config.name] as const))(
      'template %s defines an agent name',
      (_id, agentName) => {
        expect(agentName).toBeTruthy();
      },
    );

    it.each(TEMPLATES.map((t) => [t.id, t.config.name] as const))(
      'template %s has a valid ADK agent name',
      (_id, agentName) => {
        expect(isValidAdkAgentName(agentName)).toBe(true);
      },
    );

    it.each(TEMPLATES.map((t) => [t.id, t.config.name] as const))(
      'template %s yields a valid Cloud Run service name',
      (_id, agentName) => {
        const serviceName = toCloudRunServiceName(agentName);
        // Cloud Run service names are DNS labels: lowercase alphanumerics and
        // hyphens, starting with a letter, 63 characters maximum.
        expect(serviceName).toMatch(/^[a-z]([-a-z0-9]*[a-z0-9])?$/);
        expect(serviceName.length).toBeLessThanOrEqual(63);
      },
    );
  });
});
