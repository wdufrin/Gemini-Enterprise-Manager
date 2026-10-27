import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import * as core from './core';
import {
  probeProjectEnrollment,
  getCachedProjectEnrollment,
  setCachedProjectEnrollment,
  clearCachedProjectEnrollment,
} from './project';
import {
  sanitizeAssistantUpdateForEnrollment,
  listUserMemories,
  deleteUserMemory,
} from './discovery/assistants';
import { sanitizeEngineUpdateForEnrollment } from './discovery/engines';
import { interactNotebookSource } from './notebooks';
import { ProjectEnrollmentProvider } from '../../context/ProjectEnrollmentContext';
import { FeatureManagementSection } from '../../components/assistants/form/FeatureManagementSection';
import { DiscoveredToolsSection } from '../../components/connectors/byomcp/DiscoveredToolsSection';
import { ApiValidationPanel } from '../../components/auth/ApiValidationPanel';

describe('Project Enrollment Gate Check & Allowlist Visibility Guards', () => {
  beforeEach(() => {
    clearCachedProjectEnrollment();
    vi.restoreAllMocks();
  });

  it('detects Google Internal, Trusted Tester, NotebookLM API User, and Agent Registry enrollment when internal fields and endpoints succeed', async () => {
    vi.spyOn(core, 'gapiRequest').mockImplementation(async (url: string) => {
      if (url.endsWith('/v1alpha/projects/internal-proj')) {
        return {
          name: 'projects/123456',
          experienceState: 'EXPERIENCE_STATE_ENABLED',
          documentSizeQuota: { maxDocSizeBytes: 1000 },
        } as never;
      }
      if (url.includes(':listConnectorSources')) {
        return { connectorSources: [{ dataSource: 'jira' }] } as never;
      }
      if (url.includes('/services/agentregistry.googleapis.com')) {
        return { state: 'ENABLED' } as never;
      }
      return {} as never;
    });

    const status = await probeProjectEnrollment('internal-proj');

    expect(status.projectId).toBe('internal-proj');
    expect(status.googleInternal).toBe(true);
    expect(status.trustedTester).toBe(true);
    expect(status.notebookLmApiUser).toBe(true);
    expect(status.agentRegistryEnabled).toBe(true);
    expect(status.categories).toHaveLength(4);
    expect(status.categories.every((c) => c.enrolled)).toBe(true);
    expect(getCachedProjectEnrollment('internal-proj')?.googleInternal).toBe(true);
  });

  it('gates all restricted categories to false for an external customer project where ESF strips internal fields and blocks allowlisted RPCs', async () => {
    vi.spyOn(core, 'gapiRequest').mockImplementation(async (url: string) => {
      if (url.endsWith('/v1alpha/projects/customer-proj')) {
        // ESF strips experienceState, documentSizeQuota, quotaUsageAndLimit, vpcScConfig, oauthClientId
        return {
          name: 'projects/999999',
          serviceTermsMap: {},
          configurableBillingThreshold: 100,
        } as never;
      }
      if (url.includes(':listConnectorSources')) {
        throw new Error('403 PERMISSION_DENIED: Method ListConnectorSources is restricted to TRUSTED_TESTER');
      }
      if (url.includes(':interactSources')) {
        throw new Error('403 PERMISSION_DENIED: Method InteractSources is not available for this consumer project');
      }
      if (url.includes('/services/agentregistry.googleapis.com')) {
        return { state: 'DISABLED' } as never;
      }
      return {} as never;
    });

    const status = await probeProjectEnrollment('customer-proj');

    expect(status.googleInternal).toBe(false);
    expect(status.trustedTester).toBe(false);
    expect(status.notebookLmApiUser).toBe(false);
    expect(status.agentRegistryEnabled).toBe(false);
    expect(status.categories.every((c) => !c.enrolled)).toBe(true);
  });

  it('detects NLME_API_USER enrollment when :interactSources returns 404 Notebook Not Found (passed ESF visibility filter)', async () => {
    vi.spyOn(core, 'gapiRequest').mockImplementation(async (url: string) => {
      if (url.endsWith('/v1alpha/projects/nlme-proj')) {
        return { name: 'projects/888888' } as never;
      }
      if (url.includes(':listConnectorSources')) {
        throw new Error('403 PERMISSION_DENIED: not enrolled in TRUSTED_TESTER');
      }
      if (url.includes(':interactSources')) {
        throw new Error('404 NOT_FOUND: Notebook __gem_enrollment_probe__ was not found');
      }
      if (url.includes('/services/agentregistry.googleapis.com')) {
        return { state: 'DISABLED' } as never;
      }
      return {} as never;
    });

    const status = await probeProjectEnrollment('nlme-proj');

    expect(status.googleInternal).toBe(false);
    expect(status.trustedTester).toBe(false);
    expect(status.notebookLmApiUser).toBe(true);
  });

  it('strips GOOGLE_INTERNAL and TRUSTED_TESTER fields from Assistant update payload and mask for standard customer projects', () => {
    setCachedProjectEnrollment({
      projectId: 'ext-customer',
      probedAt: Date.now(),
      googleInternal: false,
      trustedTester: false,
      notebookLmApiUser: false,
      agentRegistryEnabled: false,
      categories: [],
    });

    const { sanitizedPayload, sanitizedMask } = sanitizeAssistantUpdateForEnrollment(
      {
        displayName: 'Customer Assistant',
        enableEndUserAgentCreation: true,
        agentReasoningHidden: true,
        toolConfig: { custom: true } as never,
        vertexAiSearchToolConfig: { engine: 'test' } as never,
      } as never,
      [
        'displayName',
        'enableEndUserAgentCreation',
        'agentReasoningHidden',
        'toolConfig',
        'vertexAiSearchToolConfig',
      ],
      'ext-customer',
    );

    expect(sanitizedPayload).toEqual({
      displayName: 'Customer Assistant',
      enableEndUserAgentCreation: true,
    });
    expect(sanitizedMask).toEqual(['displayName', 'enableEndUserAgentCreation']);
  });

  it('strips GOOGLE_INTERNAL fields from Engine update payload and mask for standard customer projects', () => {
    setCachedProjectEnrollment({
      projectId: 'ext-customer',
      probedAt: Date.now(),
      googleInternal: false,
      trustedTester: true,
      notebookLmApiUser: false,
      agentRegistryEnabled: false,
      categories: [],
    });

    const { sanitizedPayload, sanitizedMask } = sanitizeEngineUpdateForEnrollment(
      {
        displayName: 'Customer Engine',
        includeCrossDomainDocuments: true,
        allowMultipleDataStoresSearchEngine: true,
        effectiveFeatures: { agentSharingFeature: 'ENABLED' },
      },
      [
        'displayName',
        'includeCrossDomainDocuments',
        'allowMultipleDataStoresSearchEngine',
        'effectiveFeatures',
      ],
      'ext-customer',
    );

    expect(sanitizedPayload).toEqual({ displayName: 'Customer Engine' });
    expect(sanitizedMask).toEqual(['displayName']);
  });

  it('explicitly rejects listUserMemories, deleteUserMemory, and interactNotebookSource when project is not enrolled', async () => {
    setCachedProjectEnrollment({
      projectId: 'ext-customer',
      probedAt: Date.now(),
      googleInternal: false,
      trustedTester: false,
      notebookLmApiUser: false,
      agentRegistryEnabled: false,
      categories: [],
    });

    const config = {
      projectId: 'ext-customer',
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: 'engine-1',
      assistantId: 'default_assistant',
    };

    await expect(listUserMemories(config)).rejects.toThrow(/restricted to GOOGLE_INTERNAL/);
    await expect(
      deleteUserMemory(
        'projects/ext-customer/locations/global/collections/default_collection/engines/engine-1/memories/mem-1',
        config,
      ),
    ).rejects.toThrow(/restricted to GOOGLE_INTERNAL/);
    await expect(
      interactNotebookSource(config, 'nb-1', 'src-1', 'summarize'),
    ).rejects.toThrow(/restricted to GOOGLE_INTERNAL, NLME_API_USER, or SPARK_PREVIEW/);
  });

  it('hides Advanced Configuration (vertexAiSearchToolConfig) for standard customer projects and shows it for Trusted Tester / Google Internal projects', () => {
    const standardEnrollment = {
      projectId: 'std-proj',
      probedAt: Date.now(),
      googleInternal: false,
      trustedTester: false,
      notebookLmApiUser: false,
      agentRegistryEnabled: false,
      categories: [],
    };

    const { rerender } = render(
      <ProjectEnrollmentProvider
        projectId="std-proj"
        projectNumber="111"
        isGapiReady={true}
        initialEnrollment={standardEnrollment}
      >
        <FeatureManagementSection
          enableEndUserAgentCreation={false}
          disableLocationContext={false}
          defaultWebGroundingToggleOff={false}
          vertexAiSearchToolConfig="{}"
          handleChange={() => {}}
        />
      </ProjectEnrollmentProvider>,
    );

    expect(screen.queryByText(/Advanced Configuration/i)).toBeNull();

    const trustedEnrollment = {
      ...standardEnrollment,
      trustedTester: true,
    };

    rerender(
      <ProjectEnrollmentProvider
        projectId="std-proj"
        projectNumber="111"
        isGapiReady={true}
        initialEnrollment={trustedEnrollment}
      >
        <FeatureManagementSection
          enableEndUserAgentCreation={false}
          disableLocationContext={false}
          defaultWebGroundingToggleOff={false}
          vertexAiSearchToolConfig="{}"
          handleChange={() => {}}
        />
      </ProjectEnrollmentProvider>,
    );

    expect(screen.getByText(/Advanced Configuration \(Trusted Tester\)/i)).toBeTruthy();
  });

  it('renders the Feature Gates tab and category cards in ApiValidationPanel and switches discovery badge in DiscoveredToolsSection', () => {
    const customerEnrollment = {
      projectId: 'cust-proj',
      probedAt: Date.now(),
      googleInternal: false,
      trustedTester: false,
      notebookLmApiUser: false,
      agentRegistryEnabled: true,
      categories: [
        {
          id: 'GOOGLE_INTERNAL' as const,
          label: 'Google Internal (GOOGLE_INTERNAL)',
          visibilityLabel: 'GOOGLE_INTERNAL',
          enrolled: false,
          reason: 'Hidden for external customer project.',
          affectedFeatures: ['Engine User Memories'],
        },
      ],
    };

    render(
      <ProjectEnrollmentProvider
        projectId="cust-proj"
        projectNumber="222"
        isGapiReady={true}
        initialEnrollment={customerEnrollment}
      >
        <ApiValidationPanel
          projectNumber="222"
          apiValidationResult={null}
          serviceAgentValidation={null}
          userPermissionsValidation={null}
          projectEnrollment={customerEnrollment}
          isGrantingServiceAgent={false}
          serviceAgentActionFeedback={null}
          onGrantServiceAgent={() => {}}
          apisToEnable={new Set()}
          onToggleApiToEnable={() => {}}
          onToggleAllApisToEnable={() => {}}
          isApiEnablingLoading={false}
          onEnableApis={() => {}}
        />
        <DiscoveredToolsSection
          instanceUri="https://mcp.example.com/mcp"
          setInstanceUri={() => {}}
          isTestingConnectivity={false}
          connectivityResult={null}
          onTestConnectivity={() => {}}
          isRefreshingTools={false}
          refreshToolsSuccess={false}
          refreshToolsError={null}
          onRefreshTools={() => {}}
          dynamicTools={[]}
          onToggleTool={() => {}}
          onToggleAllTools={() => {}}
        />
      </ProjectEnrollmentProvider>,
    );

    expect(screen.getByText(/Standard Customer Project/i)).toBeTruthy();
    expect(screen.getByText(/Discovery: Direct MCP \(dynamic_tools\)/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Feature Gates' }));
    expect(screen.getByText('Hidden / Gated')).toBeTruthy();
  });
});
