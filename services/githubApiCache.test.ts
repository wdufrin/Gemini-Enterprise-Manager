import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getCachedGithubData,
    setCachedGithubData,
    getStoredGithubToken,
    fetchCachedGithubJson,
    fetchCachedGithubText
} from './githubApiCache';

const createStorageMock = () => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
    };
};

describe('githubApiCache Service', () => {
    let mockLocalStorage: ReturnType<typeof createStorageMock>;
    let mockSessionStorage: ReturnType<typeof createStorageMock>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockLocalStorage = createStorageMock();
        mockSessionStorage = createStorageMock();

        Object.defineProperty(window, 'localStorage', {
            value: mockLocalStorage,
            writable: true,
        });
        Object.defineProperty(window, 'sessionStorage', {
            value: mockSessionStorage,
            writable: true,
        });
    });

    it('stores and retrieves data within TTL', () => {
        const testKey = 'test_key_1';
        const testData = { name: 'sample-agent', files: 5 };

        expect(getCachedGithubData(testKey)).toBeNull();

        setCachedGithubData(testKey, testData);

        const retrieved = getCachedGithubData<typeof testData>(testKey);
        expect(retrieved).toEqual(testData);
    });

    it('reads stored token from localStorage if present', () => {
        expect(getStoredGithubToken()).toBeNull();

        window.localStorage.setItem('gem_github_token', 'ghp_test123456');
        expect(getStoredGithubToken()).toBe('ghp_test123456');
    });

    it('fetches and caches JSON from GitHub', async () => {
        const mockData = [{ name: 'agent-1', type: 'dir' }];
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockData,
        });
        global.fetch = mockFetch;

        const result1 = await fetchCachedGithubJson<typeof mockData>('https://api.github.com/test-url');
        expect(result1).toEqual(mockData);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Second call should hit the cache without calling fetch again
        const result2 = await fetchCachedGithubJson<typeof mockData>('https://api.github.com/test-url');
        expect(result2).toEqual(mockData);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws descriptive error on 403 rate limit exceeded', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            headers: {
                get: (h: string) => (h === 'x-ratelimit-remaining' ? '0' : null),
            },
        });
        global.fetch = mockFetch;

        await expect(fetchCachedGithubJson('https://api.github.com/rate-limited')).rejects.toThrow(
            /rate limit exceeded/i
        );
    });
});
