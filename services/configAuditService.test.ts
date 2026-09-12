import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runConfigAudit, generateAuditMarkdown } from './configAuditService';
import * as api from './apiService';
import { Config } from '../types';

vi.mock('./apiService', () => ({
  getEngine: vi.fn(),
  listResources: vi.fn(),
  listRegistrySkills: vi.fn(),
  listAuthorizations: vi.fn(),
  listLicenseConfigsUsageStats: vi.fn(),
}));

describe('configAuditService', () => {
  const sourceConfig: Config = {
    projectId: 'source-project-100',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'default_engine',
    assistantId: 'default_assistant',
  };

  const targetConfig: Config = {
    projectId: 'target-project-200',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'default_engine',
    assistantId: 'default_assistant',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('audits matching engines and datastores cleanly', async () => {
    vi.mocked(api.getEngine).mockImplementation(async (appId, cfg) => {
      return {
        name: `projects/${cfg.projectId}/locations/${cfg.appLocation}/collections/default_collection/engines/${appId}`,
        displayName: 'Test Engine',
        solutionType: 'SOLUTION_TYPE_SEARCH_AND_ASSISTANT',
        searchEngineConfig: { searchTier: 'ENTERPRISE' },
      } as any;
    });

    vi.mocked(api.listResources).mockImplementation(async (type, cfg) => {
      if (type === 'dataStores') {
        return {
          dataStores: [
            { name: `projects/${cfg.projectId}/locations/global/collections/default_collection/dataStores/ds-kb-1`, displayName: 'Knowledge Base' }
          ]
        };
      }
      return {};
    });

    vi.mocked(api.listRegistrySkills).mockResolvedValue([]);
    vi.mocked(api.listAuthorizations).mockResolvedValue({ authorizations: [] });
    vi.mocked(api.listLicenseConfigsUsageStats).mockResolvedValue({ licenseConfigUsageStats: [] } as any);

    const progressSteps: string[] = [];
    const summary = await runConfigAudit(sourceConfig, targetConfig, (step) => {
      progressSteps.push(step);
    });

    expect(summary).toBeDefined();
    expect(summary.sourceProject).toBe('source-project-100');
    expect(summary.targetProject).toBe('target-project-200');
    expect(summary.overallScore).toBe(100);
    expect(summary.missingCount).toBe(0);
    expect(progressSteps.length).toBeGreaterThan(0);

    const dsItem = summary.items.find(i => i.name === 'DataStore: Knowledge Base');
    expect(dsItem).toBeDefined();
    expect(dsItem?.status).toBe('MATCH');

    const md = generateAuditMarkdown(summary);
    expect(md).toContain('READY FOR CUTOVER');
    expect(md).toContain('source-project-100');
    expect(md).toContain('target-project-200');
  });

  it('detects missing target DataStores and computes readiness score reduction', async () => {
    vi.mocked(api.getEngine).mockResolvedValue({
      displayName: 'Test Engine',
      solutionType: 'SOLUTION_TYPE_SEARCH_AND_ASSISTANT',
    } as any);

    vi.mocked(api.listResources).mockImplementation(async (type, cfg) => {
      if (type === 'dataStores') {
        if (cfg.projectId === 'source-project-100') {
          return {
            dataStores: [
              { name: 'projects/src/locations/global/collections/default_collection/dataStores/missing-ds', displayName: 'Missing Docs' }
            ]
          };
        } else {
          return { dataStores: [] };
        }
      }
      return {};
    });

    vi.mocked(api.listRegistrySkills).mockResolvedValue([]);
    vi.mocked(api.listAuthorizations).mockResolvedValue({ authorizations: [] });
    vi.mocked(api.listLicenseConfigsUsageStats).mockResolvedValue({ licenseConfigUsageStats: [] } as any);

    const summary = await runConfigAudit(sourceConfig, targetConfig);

    expect(summary.missingCount).toBe(1);
    expect(summary.overallScore).toBeLessThan(100);

    const missingItem = summary.items.find(i => i.id === 'ds-missing-ds');
    expect(missingItem).toBeDefined();
    expect(missingItem?.status).toBe('MISSING_IN_TARGET');
    expect(missingItem?.severity).toBe('ERROR');

    const md = generateAuditMarkdown(summary);
    expect(md).toContain('MISSING IN TARGET');
    expect(md).toContain('Missing Docs');
  });

  it('does not report success when zero meaningful checks could be executed', async () => {
    vi.mocked(api.getEngine).mockResolvedValue(null as any);
    vi.mocked(api.listResources).mockResolvedValue({ dataStores: [] });
    vi.mocked(api.listRegistrySkills).mockRejectedValue(new Error('Auth error'));
    vi.mocked(api.listAuthorizations).mockRejectedValue(new Error('Auth error'));
    vi.mocked(api.listLicenseConfigsUsageStats).mockRejectedValue(new Error('Auth error'));

    const summary = await runConfigAudit(sourceConfig, targetConfig);

    expect(summary.overallScore).toBeNull();
    expect(summary.unknownCount).toBeGreaterThan(0);
    

    const md = generateAuditMarkdown(summary);
    expect(md).toContain('UNABLE TO ASSESS');
  });
});
