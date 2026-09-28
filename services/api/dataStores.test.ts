import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as core from './core';
import {
    signInWithOidcPopup,
    listDocuments,
    checkDataStoreAclDetails,
    checkDataStoreAclSupport,
    getDataStoreIamPolicy,
    setDataStoreIamPolicy,
    getDiscoveryProjectConfig,
    updateDataStoreAccessControlConfig,
} from './dataStores';
import { Config } from '../../types';

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>();
  return {
    ...actual,
    gapiRequest: vi.fn(),
  };
});

describe('dataStores OIDC Auth Flow', () => {
    let originalOpen: typeof window.open;

    beforeEach(() => {
        vi.useFakeTimers();
        originalOpen = window.open;
    });

    afterEach(() => {
        vi.useRealTimers();
        window.open = originalOpen;
    });

    // Helper to encode a JWT payload in Base64URL (with - and _ and without padding)
    const createBase64UrlJwt = (payload: Record<string, unknown>): string => {
        const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        const body = btoa(JSON.stringify(payload))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        return `${header}.${body}.signature`;
    };

    it('rejects with Nonce mismatch when token nonce does not match generated nonce', async () => {
        const fakeToken = createBase64UrlJwt({
            email: 'user@example.com',
            nonce: 'attacker_nonce_123',
        });

        // Mock popup window object
        const mockPopup = {
            closed: false,
            close: vi.fn(),
            location: {
                href: 'http://localhost:3000/callback#id_token=' + fakeToken + '&state=',
                hash: '#id_token=' + fakeToken + '&state=',
            },
        } as unknown as Window;

        window.open = vi.fn().mockImplementation((url: string) => {
            const parsedUrl = new URL(url);
            const state = parsedUrl.searchParams.get('state');
            // Inject the matching state in the redirect hash, but token has wrong nonce
            mockPopup.location.href = `http://localhost:3000/callback#id_token=${fakeToken}&state=${state}`;
            mockPopup.location.hash = `#id_token=${fakeToken}&state=${state}`;
            return mockPopup;
        });

        const authPromise = signInWithOidcPopup(
            'https://idp.example.com/auth',
            'client_123',
            'http://localhost:3000/callback'
        );

        // Advance timer to trigger interval
        vi.advanceTimersByTime(600);

        await expect(authPromise).rejects.toThrow(/Nonce mismatch/i);
    });

    it('successfully decodes Base64URL JWT payload and resolves email when nonce matches', async () => {
        let capturedNonce: string | null = null;
        const mockPopup = {
            closed: false,
            close: vi.fn(),
            location: {
                href: '',
                hash: '',
            },
        } as unknown as Window;

        window.open = vi.fn().mockImplementation((url: string) => {
            const parsedUrl = new URL(url);
            capturedNonce = parsedUrl.searchParams.get('nonce');
            const state = parsedUrl.searchParams.get('state');

            const validToken = createBase64UrlJwt({
                email: 'analyst@enterprise.com',
                nonce: capturedNonce,
            });

            mockPopup.location.href = `http://localhost:3000/callback#id_token=${validToken}&state=${state}`;
            mockPopup.location.hash = `#id_token=${validToken}&state=${state}`;
            return mockPopup;
        });

        const authPromise = signInWithOidcPopup(
            'https://idp.example.com/auth',
            'client_123',
            'http://localhost:3000/callback'
        );

        vi.advanceTimersByTime(600);

        const result = await authPromise;
        expect(result.email).toBe('analyst@enterprise.com');
        expect(result.idToken).toBeDefined();
    });
});

describe('dataStores listDocuments pagination and ACL checks', () => {
    const mockConfig: Config = {
        projectId: 'test-project-123',
        appLocation: 'global',
        collectionId: 'default_collection',
        appId: '',
        assistantId: '',
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('listDocuments', () => {
        it('appends default pageSize to URL when not specified', async () => {
            vi.mocked(core.gapiRequest).mockResolvedValueOnce({ documents: [] });

            await listDocuments('projects/test-project-123/locations/global/collections/default_collection/dataStores/ds-1', mockConfig);

            expect(core.gapiRequest).toHaveBeenCalledWith(
                expect.stringContaining('pageSize=100'),
                'GET',
                'test-project-123'
            );
        });

        it('passes custom pageSize and pageToken to URL', async () => {
            vi.mocked(core.gapiRequest).mockResolvedValueOnce({ documents: [], nextPageToken: 'next-token-abc' });

            await listDocuments(
                'projects/test-project-123/locations/global/collections/default_collection/dataStores/ds-1',
                mockConfig,
                50,
                'page-token-xyz'
            );

            expect(core.gapiRequest).toHaveBeenCalledWith(
                expect.stringContaining('pageSize=50&pageToken=page-token-xyz'),
                'GET',
                'test-project-123'
            );
        });
    });

    describe('checkDataStoreAclDetails & checkDataStoreAclSupport', () => {
        it('returns supported: true when IAM policy response has bindings or etag', async () => {
            vi.mocked(core.gapiRequest).mockResolvedValueOnce({ etag: 'etag-123', bindings: [] });

            const details = await checkDataStoreAclDetails(mockConfig, 'ds-1');
            expect(details.supported).toBe(true);
            expect(details.permissionDenied).toBe(false);

            vi.mocked(core.gapiRequest).mockResolvedValueOnce({ etag: 'etag-123', bindings: [] });
            const supported = await checkDataStoreAclSupport(mockConfig, 'ds-1');
            expect(supported).toBe(true);
        });

        it('identifies 403 Forbidden as permissionDenied without claiming unsupported', async () => {
            vi.mocked(core.gapiRequest).mockRejectedValueOnce(new Error('403 Forbidden: Caller lacks permissions'));

            const details = await checkDataStoreAclDetails(mockConfig, 'ds-1');
            expect(details.supported).toBe(false);
            expect(details.permissionDenied).toBe(true);
            expect(details.reason).toContain('403');

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            vi.mocked(core.gapiRequest).mockRejectedValueOnce(new Error('Permission denied on resource'));
            const supported = await checkDataStoreAclSupport(mockConfig, 'ds-1');
            expect(supported).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Access denied (403) checking ACL policy'));
            warnSpy.mockRestore();
        });

        it('returns supported: false, permissionDenied: false on 404 Not Found', async () => {
            vi.mocked(core.gapiRequest).mockRejectedValueOnce(new Error('404 Not Found'));

            const details = await checkDataStoreAclDetails(mockConfig, 'ds-1');
            expect(details.supported).toBe(false);
            expect(details.permissionDenied).toBe(false);
        });
    });

    describe('v1 DataStore IAM Policy & Self-Service Project Opt-In', () => {
        it('calls GA /v1/ endpoint for getDataStoreIamPolicy and setDataStoreIamPolicy', async () => {
            vi.mocked(core.gapiRequest).mockResolvedValueOnce({ etag: 'e1', bindings: [] });
            await getDataStoreIamPolicy('ds-alpha', mockConfig);
            expect(core.gapiRequest).toHaveBeenCalledWith(
                'https://discoveryengine.googleapis.com/v1/projects/test-project-123/locations/global/collections/default_collection/dataStores/ds-alpha:getIamPolicy',
                'GET',
                'test-project-123'
            );

            const regionalConfig: Config = { ...mockConfig, appLocation: 'eu' };
            const policyPayload = {
                etag: 'e1',
                bindings: [{ role: 'roles/discoveryengine.agentspaceUser', members: ['user:alice@example.com'] }],
            };
            vi.mocked(core.gapiRequest).mockResolvedValueOnce(policyPayload);
            await setDataStoreIamPolicy('ds-eu', policyPayload, regionalConfig);
            expect(core.gapiRequest).toHaveBeenCalledWith(
                'https://eu-discoveryengine.googleapis.com/v1/projects/test-project-123/locations/eu/collections/default_collection/dataStores/ds-eu:setIamPolicy',
                'POST',
                'test-project-123',
                undefined,
                { policy: policyPayload }
            );
        });

        it('reads and updates project-level dataStoreAccessControlEnabled via v1alpha/projects/{projectId}', async () => {
            vi.mocked(core.gapiRequest).mockResolvedValueOnce({
                name: 'projects/test-project-123',
                customerProvidedConfig: {
                    resourceAccessControlConfig: {
                        dataStoreAccessControlEnabled: false,
                    },
                },
            });

            const projConfig = await getDiscoveryProjectConfig('test-project-123', 'global');
            expect(projConfig.customerProvidedConfig?.resourceAccessControlConfig?.dataStoreAccessControlEnabled).toBe(false);
            expect(core.gapiRequest).toHaveBeenCalledWith(
                'https://discoveryengine.googleapis.com/v1alpha/projects/test-project-123',
                'GET',
                'test-project-123',
                undefined,
                undefined,
                undefined,
                true
            );

            vi.mocked(core.gapiRequest).mockResolvedValueOnce({
                name: 'projects/test-project-123',
                customerProvidedConfig: {
                    resourceAccessControlConfig: {
                        dataStoreAccessControlEnabled: true,
                    },
                },
            });

            const updated = await updateDataStoreAccessControlConfig('test-project-123', true, 'us');
            expect(updated.customerProvidedConfig?.resourceAccessControlConfig?.dataStoreAccessControlEnabled).toBe(true);
            expect(core.gapiRequest).toHaveBeenCalledWith(
                'https://us-discoveryengine.googleapis.com/v1alpha/projects/test-project-123?updateMask=customerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled',
                'PATCH',
                'test-project-123',
                undefined,
                {
                    customerProvidedConfig: {
                        resourceAccessControlConfig: {
                            dataStoreAccessControlEnabled: true,
                        },
                    },
                }
            );
        });

        it('propagates 403 PERMISSION_DENIED errors when caller cannot update project access control config', async () => {
            vi.mocked(core.gapiRequest).mockRejectedValueOnce(
                new Error('403 PERMISSION_DENIED: Permission discoveryengine.projects.update denied on resource projects/test-project-123')
            );

            await expect(
                updateDataStoreAccessControlConfig('test-project-123', true, 'global')
            ).rejects.toThrow(/discoveryengine\.projects\.update denied/i);
        });
    });
});


