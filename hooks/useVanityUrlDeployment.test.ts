import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVanityUrlDeployment } from './useVanityUrlDeployment';
import { AppEngine, Config } from '../types';
import * as api from '../services/apiService';

vi.mock('../services/apiService', () => ({
    getProject: vi.fn(),
    createCloudBuild: vi.fn(),
    listVpcNetworks: vi.fn(),
    listVpcSubnets: vi.fn(),
    listGlobalForwardingRules: vi.fn(),
    listManagedSslCertificates: vi.fn(),
    getEngine: vi.fn(),
}));

describe('useVanityUrlDeployment Hook', () => {
    const mockEngine: AppEngine & { widgetConfigConfigId: string } = {
        name: 'projects/123/locations/global/collections/default_collection/engines/test-engine',
        displayName: 'Test Engine',
        widgetConfigConfigId: 'cid_test_widget_123',
    };

    const mockConfig: Config = {
        projectId: 'test-project',
        appLocation: 'global',
        collectionId: 'default_collection',
        appId: 'default_app',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getProject).mockResolvedValue({ projectId: 'test-project', projectNumber: '123456' });
        vi.mocked(api.listVpcNetworks).mockResolvedValue({ items: [] });
        vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });
        vi.mocked(api.listGlobalForwardingRules).mockResolvedValue({ items: [] });
        vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
        vi.mocked(api.getEngine).mockResolvedValue(mockEngine);
    });

    it('initializes with automateGLB set to true and invalid customDomain until user enters a valid domain', () => {
        const { result } = renderHook(() =>
            useVanityUrlDeployment(mockEngine, mockConfig, '123456')
        );

        expect(result.current.automateGLB).toBe(true);
        expect(result.current.customDomain).toBe('');
        // An empty custom domain must NOT be marked valid for deployment
        expect(result.current.isCustomDomainValid).toBe(false);

        // When a valid hostname is entered, isCustomDomainValid becomes true
        act(() => {
            result.current.setCustomDomain('ai.company.com');
        });
        expect(result.current.isCustomDomainValid).toBe(true);

        // Invalid hostname
        act(() => {
            result.current.setCustomDomain('invalid domain with spaces');
        });
        expect(result.current.isCustomDomainValid).toBe(false);
    });

    it('rejects deployment if steps are empty rather than sending empty buildConfig to Cloud Build', async () => {
        const { result } = renderHook(() =>
            useVanityUrlDeployment(mockEngine, mockConfig, '123456')
        );

        // Turn off automateGLB and keep customDomain empty
        act(() => {
            result.current.setAutomateGLB(false);
            result.current.setCustomDomain('');
        });

        await act(async () => {
            await result.current.handleDeploy();
        });

        expect(result.current.error).toMatch(/No deployment steps generated/i);
        expect(api.createCloudBuild).not.toHaveBeenCalled();
    });

    it('submits valid build configuration when domain and GLB are configured', async () => {
        vi.mocked(api.createCloudBuild).mockResolvedValue({
            metadata: { build: { id: 'build-xyz-789' } },
        });

        const { result } = renderHook(() =>
            useVanityUrlDeployment(mockEngine, mockConfig, '123456')
        );

        act(() => {
            result.current.setAutomateGLB(true);
            result.current.setCustomDomain('assistant.example.com');
        });

        await act(async () => {
            await result.current.handleDeploy();
        });

        expect(api.createCloudBuild).toHaveBeenCalledTimes(1);
        expect(result.current.buildId).toBe('build-xyz-789');
        expect(result.current.error).toBeNull();
    });
});
