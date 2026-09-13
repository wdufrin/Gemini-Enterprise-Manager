// --- GitHub Rest API Extensions ---
export interface GitHubWorkflowItem {
    name: string;
    path: string;
    html_url: string;
    default_branch: string;
    repository: {
        full_name: string;
    };
}

export interface GitHubRepoItem {
    id?: number | string;
    name: string;
    full_name: string;
    html_url: string;
    description?: string;
    default_branch?: string;
    [key: string]: unknown;
}

export const createGithubRepo = async (token: string, name: string, description: string = '', isPrivate: boolean = true): Promise<{ exists?: boolean; [key: string]: unknown }> => {
    const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name,
            description,
            private: isPrivate,
            auto_init: true // Create an initial commit
        })
    });
    if (!response.ok) {
        let errorMsg = response.statusText;
        try {
            const errorBody = await response.json();
            if (errorBody && errorBody.message) {
                errorMsg = errorBody.message;
                if (errorBody.errors && errorBody.errors.length > 0 && errorBody.errors[0].message) {
                    errorMsg += `: ${errorBody.errors[0].message}`;
                    // Special case: if it already exists, don't crash
                    if (errorBody.errors[0].message.toLowerCase().includes('name already exists')) {
                        console.warn(`Repository ${name} already exists. Continuing with deployment.`);
                        return { exists: true };
                    }
                }
            }
        } catch {
            // ignore
        }
        throw new Error(`Failed to create repository: ${errorMsg}`);
    }
    
    return await response.json();
};

interface GithubErrorBody {
    message?: string;
    errors?: Array<{ message?: string }>;
}

/**
 * Turns a failed GitHub response into a message an operator can act on.
 *
 * GitHub returns 404 (not 403) for repositories a token cannot see, and 403
 * for both missing scopes and un-authorized SSO, so the raw status alone is
 * routinely misleading. We surface the hint alongside the API's own message.
 */
const describeGithubFailure = async (response: Response, action: string): Promise<string> => {
    let detail = response.statusText || 'no status text';
    try {
        const body = (await response.json()) as GithubErrorBody;
        if (body?.message) {
            detail = body.message;
            const nested = body.errors?.[0]?.message;
            if (nested) detail += `: ${nested}`;
        }
    } catch {
        // Non-JSON error body (e.g. an HTML error page from a proxy).
    }
    if (response.status === 401) {
        detail += ' (the GitHub token is invalid or expired)';
    } else if (response.status === 403) {
        detail += " (the token is likely missing the 'repo' / 'contents: write' scope, or needs SSO authorization for this organization)";
    } else if (response.status === 404) {
        detail += ' (the repository does not exist, or the token cannot see it — GitHub returns 404 rather than 403 for private repos)';
    }
    return `${action} failed (HTTP ${response.status}): ${detail}`;
};

/** Performs a GitHub API call and throws on any non-2xx response. */
const githubApiJson = async <T>(url: string, init: RequestInit, action: string): Promise<T> => {
    const response = await fetch(url, init);
    if (!response.ok) {
        throw new Error(await describeGithubFailure(response, action));
    }
    return (await response.json()) as T;
};

/**
 * A 2xx response with a missing SHA means GitHub accepted the call but did not
 * create the object we asked for. Propagating `undefined` here is what
 * previously produced silently-corrupt trees, so we stop instead.
 */
const requireSha = (value: unknown, action: string): string => {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${action} succeeded but returned no SHA; aborting push to avoid writing a corrupt tree.`);
    }
    return value;
};

export const pushToGithub = async (token: string, owner: string, repo: string, files: { path: string, content: string, encoding?: string }[], commitMessage: string): Promise<Record<string, unknown>> => {
    // Encode the path segments: owner/repo are caller-supplied and must not be
    // able to escape the intended repository via '/' or '..'.
    const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    };

    // 1. Get the current commit object (usually from main branch)
    let refResponse = await fetch(`${baseUrl}/git/refs/heads/main`, { headers });

    // Fallback to master if main doesn't exist
    if (!refResponse.ok) {
        const mainFailure = await describeGithubFailure(refResponse.clone(), "Reading branch 'main'");
        refResponse = await fetch(`${baseUrl}/git/refs/heads/master`, { headers });
        if (!refResponse.ok) {
            // Report the ORIGINAL failure too: if 'main' failed with 401/403,
            // saying "could not find main or master" sends the operator
            // chasing a branch-naming problem instead of a token problem.
            throw new Error(`Could not read 'main' or 'master' branch. ${mainFailure}`);
        }
    }
    const refData = await refResponse.json();
    const commitSha = requireSha(refData?.object?.sha, 'Resolving the branch head');
    const branchRef = refData?.ref;
    if (typeof branchRef !== 'string' || !branchRef.startsWith('refs/heads/')) {
        throw new Error(`GitHub returned an unexpected ref for the target branch: ${JSON.stringify(branchRef)}`);
    }

    // 2. Get the tree from the commit
    const commitData = await githubApiJson<{ tree?: { sha?: string } }>(
        `${baseUrl}/git/commits/${encodeURIComponent(commitSha)}`,
        { headers },
        'Reading the base commit'
    );
    const treeSha = requireSha(commitData?.tree?.sha, 'Reading the base commit tree');

    const tree: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const file of files) {
         // Create blob
         const blobData = await githubApiJson<{ sha?: string }>(
            `${baseUrl}/git/blobs`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                     content: file.content,
                     encoding: file.encoding || 'utf-8'
                })
            },
            `Uploading '${file.path}'`
         );

         tree.push({
             path: file.path,
             mode: '100644', // File
             type: 'blob',
             sha: requireSha(blobData?.sha, `Uploading '${file.path}'`)
         });
    }

    // 4. Create new tree
    const newTreeData = await githubApiJson<{ sha?: string }>(
        `${baseUrl}/git/trees`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                 base_tree: treeSha,
                 tree: tree
            })
        },
        'Creating the file tree'
    );
    const newTreeSha = requireSha(newTreeData?.sha, 'Creating the file tree');

    // 5. Create new commit
    const newCommitData = await githubApiJson<{ sha?: string }>(
        `${baseUrl}/git/commits`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                 message: commitMessage,
                 tree: newTreeSha,
                 parents: [commitSha]
            })
        },
        'Creating the commit'
    );
    const newCommitSha = requireSha(newCommitData?.sha, 'Creating the commit');

    // 6. Update reference. This is the step that actually publishes the commit;
    // previously its error body was returned to the caller as a success value.
    return await githubApiJson<Record<string, unknown>>(
        `${baseUrl}/git/${branchRef}`,
        {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                 sha: newCommitSha
            })
        },
        'Updating the branch reference'
    );
};


export const searchReusableWorkflows = async (token: string, owner: string): Promise<{ items?: GitHubWorkflowItem[]; total_count?: number }> => {
    // Search for Repositories containing "template" in their name, bypassing Code Search indexing delays
    const query = encodeURIComponent(`template in:name user:${owner}`);
    const response = await fetch(`https://api.github.com/search/repositories?q=${query}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to search workflows: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Map the repository results to mimic the structure returned by the Code Search API
    // so the frontend doesn't need to change its data extraction paths.
    if (data && data.items) {
        data.items = data.items.map((repo: GitHubRepoItem) => ({
            name: '.github/workflows/deploy.yaml',
            path: '.github/workflows/deploy.yaml',
            html_url: repo.html_url,
            default_branch: repo.default_branch || 'main',
            repository: {
                full_name: repo.full_name
            }
        }));
    }

    return data;
};

export const getUserRepositories = async (token: string, owner: string): Promise<{ items?: GitHubRepoItem[]; total_count?: number }> => {
    // Search for all repositories owned by the user/organization
    const query = encodeURIComponent(`user:${owner}`);
    const response = await fetch(`https://api.github.com/search/repositories?q=${query}&sort=updated&per_page=100`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch repositories: ${response.statusText}`);
    }

    return await response.json();
};

// --- In-Memory & Session Storage Caching Layer ---

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const MEMORY_CACHE = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

export function getCachedGithubData<T>(key: string): T | null {
    const mem = MEMORY_CACHE.get(key);
    if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
        return mem.data as T;
    }
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            const raw = window.sessionStorage.getItem(`gem_gh_${key}`);
            if (raw) {
                const parsed = JSON.parse(raw) as CacheEntry<T>;
                if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
                    MEMORY_CACHE.set(key, parsed as CacheEntry<unknown>);
                    return parsed.data;
                }
            }
        }
    } catch {
        // Ignore storage or parsing errors
    }
    return null;
}

export function setCachedGithubData<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    MEMORY_CACHE.set(key, entry as CacheEntry<unknown>);
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem(`gem_gh_${key}`, JSON.stringify(entry));
        }
    } catch {
        // Ignore quota errors
    }
}

export function getStoredGithubToken(): string | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return (
                window.localStorage.getItem('gem_github_token') ||
                window.localStorage.getItem('github_token') ||
                null
            );
        }
    } catch {
        // Ignore storage errors
    }
    return null;
}

export async function fetchWithGithubAuth(url: string, customToken?: string): Promise<Response> {
    const token = customToken || getStoredGithubToken();
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { headers });
}

export async function fetchCachedGithubJson<T>(url: string, customToken?: string): Promise<T> {
    const cached = getCachedGithubData<T>(url);
    if (cached !== null) {
        return cached;
    }
    const response = await fetchWithGithubAuth(url, customToken);
    if (!response.ok) {
        if (response.status === 403) {
            const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
            if (rateLimitRemaining === '0') {
                throw new Error(
                    'GitHub API rate limit exceeded (60 requests/hour for unauthenticated users). Please wait a few minutes or provide a GitHub token.'
                );
            }
        }
        throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as T;
    setCachedGithubData<T>(url, data);
    return data;
}

export async function fetchCachedGithubText(url: string): Promise<string> {
    const cached = getCachedGithubData<string>(url);
    if (cached !== null) {
        return cached;
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch content from ${url}: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    setCachedGithubData<string>(url, text);
    return text;
}

