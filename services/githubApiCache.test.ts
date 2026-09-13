import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getCachedGithubData,
    setCachedGithubData,
    getStoredGithubToken,
    fetchCachedGithubJson,
    fetchCachedGithubText,
    pushToGithub
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

/**
 * Regression suite for `pushToGithub` error handling.
 *
 * Every HTTP write in this function used to be unchecked. Concretely:
 *   - a 403 on blob creation produced `{ sha: undefined }`, which was pushed
 *     into the tree array and sent to GitHub as a tree entry with no SHA;
 *   - a 403 on the final ref PATCH caused the function to RETURN GitHub's
 *     error body as if it were the success payload.
 *
 * Customer blast radius: the Agent Builder "Deploy to GitHub" flow reported
 * success and printed a repository link while zero files had been written.
 * An operator with an expired or under-scoped token had no way to tell.
 */
describe('pushToGithub — every write is checked', () => {
    const OWNER = 'acme';
    const REPO = 'agent-repo';
    const FILES = [{ path: 'main.py', content: 'print(1)' }];

    /** Builds a Response-like object good enough for the code under test. */
    const res = (status: number, body: unknown): Response => {
        const ok = status >= 200 && status < 300;
        return {
            ok,
            status,
            statusText: ok ? 'OK' : 'Forbidden',
            json: async () => body,
            clone() {
                return res(status, body);
            },
        } as unknown as Response;
    };

    /**
     * Happy-path responses in call order:
     * 0 refs/heads/main, 1 base commit, 2 blob, 3 tree, 4 commit, 5 ref PATCH
     */
    const happySequence = (): Response[] => [
        res(200, { ref: 'refs/heads/main', object: { sha: 'basecommitsha' } }),
        res(200, { tree: { sha: 'basetreesha' } }),
        res(200, { sha: 'blobsha' }),
        res(200, { sha: 'newtreesha' }),
        res(200, { sha: 'newcommitsha' }),
        res(200, { ref: 'refs/heads/main', object: { sha: 'newcommitsha' } }),
    ];

    const STEP_NAMES = [
        'branch read',
        'base commit read',
        'blob upload',
        'tree creation',
        'commit creation',
        'ref update',
    ];

    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const queue = (responses: Response[]) => {
        responses.forEach((r) => fetchMock.mockResolvedValueOnce(r));
    };

    it('completes and returns the ref payload when all six calls succeed', async () => {
        queue(happySequence());
        const result = await pushToGithub('tok', OWNER, REPO, FILES, 'msg');
        expect(fetchMock).toHaveBeenCalledTimes(6);
        expect(result).toMatchObject({ ref: 'refs/heads/main' });
    });

    // Walk the pipeline and fail exactly one step at a time. Every one of
    // these must reject. Before the fix, steps 1..5 all resolved.
    for (let failAt = 1; failAt < 6; failAt++) {
        it(`rejects when the ${STEP_NAMES[failAt]} returns 403`, async () => {
            const seq = happySequence();
            seq[failAt] = res(403, { message: 'Resource not accessible by personal access token' });
            queue(seq);

            await expect(pushToGithub('tok', OWNER, REPO, FILES, 'msg')).rejects.toThrow(
                /Resource not accessible by personal access token/
            );
        });

        it(`surfaces a scope hint when the ${STEP_NAMES[failAt]} returns 403`, async () => {
            const seq = happySequence();
            seq[failAt] = res(403, { message: 'Forbidden' });
            queue(seq);

            await expect(pushToGithub('tok', OWNER, REPO, FILES, 'msg')).rejects.toThrow(/scope/i);
        });
    }

    it('rejects rather than writing a tree entry with an undefined SHA', async () => {
        // GitHub returns 201 but omits `sha` — the exact shape that used to
        // produce `sha: undefined` inside the tree array.
        const seq = happySequence();
        seq[2] = res(201, { url: 'https://api.github.com/...' });
        queue(seq);

        await expect(pushToGithub('tok', OWNER, REPO, FILES, 'msg')).rejects.toThrow(/no SHA/i);

        // Critically: the tree-creation call must never have been made.
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not return the error body as a success value on a failed ref update', async () => {
        const seq = happySequence();
        seq[5] = res(422, { message: 'Update is not a fast forward' });
        queue(seq);

        // The old code resolved with { message: 'Update is not a fast forward' }.
        const outcome = await pushToGithub('tok', OWNER, REPO, FILES, 'msg').then(
            (value) => ({ resolved: true, value: JSON.stringify(value) }),
            (error: Error) => ({ resolved: false, value: error.message })
        );

        expect(outcome.resolved).toBe(false);
        expect(outcome.value).toMatch(/Update is not a fast forward/);
    });

    it('names the offending file when a blob upload fails', async () => {
        const seq = happySequence();
        seq[2] = res(403, { message: 'Forbidden' });
        queue(seq);

        await expect(
            pushToGithub('tok', OWNER, REPO, [{ path: 'agent/tools.py', content: 'x' }], 'msg')
        ).rejects.toThrow(/agent\/tools\.py/);
    });

    it('reports the real cause when main fails with 401, not a bogus branch error', async () => {
        // Both branch reads fail because the token is dead. The old message,
        // "Could not find 'main' or 'master' branch", sent operators looking
        // for a branch-naming problem instead of a credentials problem.
        queue([res(401, { message: 'Bad credentials' }), res(401, { message: 'Bad credentials' })]);

        await expect(pushToGithub('tok', OWNER, REPO, FILES, 'msg')).rejects.toThrow(/Bad credentials/);
    });

    it('falls back to master when main is genuinely absent', async () => {
        const seq = happySequence();
        queue([
            res(404, { message: 'Not Found' }),
            res(200, { ref: 'refs/heads/master', object: { sha: 'basecommitsha' } }),
            ...seq.slice(1, 5),
            res(200, { ref: 'refs/heads/master' }),
        ]);

        await expect(pushToGithub('tok', OWNER, REPO, FILES, 'msg')).resolves.toBeDefined();
        // The PATCH must target master, not main.
        const patchUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
        expect(patchUrl).toContain('/git/refs/heads/master');
    });

    it('rejects a malformed ref instead of building a PATCH URL from it', async () => {
        const seq = happySequence();
        seq[0] = res(200, { ref: 'refs/tags/v1', object: { sha: 'abc' } });
        queue(seq);

        await expect(pushToGithub('tok', OWNER, REPO, FILES, 'msg')).rejects.toThrow(/unexpected ref/i);
    });

    it('encodes owner and repo so they cannot escape the repository path', async () => {
        queue(happySequence());
        await pushToGithub('tok', 'acme', '../../user/repos', FILES, 'msg').catch(() => undefined);

        const firstUrl = fetchMock.mock.calls[0][0] as string;
        expect(firstUrl).not.toContain('../..');
        expect(firstUrl).toContain('%2F');
    });
});
