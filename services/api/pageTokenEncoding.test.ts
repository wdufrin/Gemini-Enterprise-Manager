/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Regression suite for query-string encoding of `pageToken`.
 *
 * Google API continuation tokens are opaque, server-generated, base64-ish
 * strings. They routinely contain `+`, `/` and `=`, and may contain `&`.
 * Interpolating one directly into a URL means:
 *   - `+`  is decoded by the server as a SPACE  -> corrupted token -> page 2
 *          silently returns page 1, producing an INFINITE PAGINATION LOOP.
 *   - `&`  starts a new query parameter          -> parameter injection.
 *   - `=`  is tolerated but ambiguous.
 *
 * Customer blast radius of the unfixed code: any tenant with more than one
 * page of service accounts / engines / reasoning engines / authorizations /
 * sessions / workload identity pools would either hang the browser tab in a
 * `do..while (pageToken)` loop or silently truncate the list. Both were
 * possible; neither surfaced an error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from './core';
import { Config } from '../../types';

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>();
  return { ...actual, gapiRequest: vi.fn() };
});

import { listServiceAccounts, listWorkloadIdentityPools, listWorkloadIdentityProviders } from './iam';
import { listResources } from './discovery/engines';
import { listDiscoverySessions } from './discovery/operations';
import { listReasoningEngines } from './vertexReasoning';
import { listAuthorizations } from './dataStores';

const mockedGapi = core.gapiRequest as unknown as ReturnType<typeof vi.fn>;

/**
 * A realistic hostile/opaque token. Every character class here is one that
 * Google's pagination tokens actually emit or that an attacker could inject.
 */
const NASTY_TOKEN = 'AbC+d/e=f&pageSize=999999&filter=x y#frag';

const CONFIG: Config = {
  projectId: 'proj',
  projectNumber: '123',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'app',
  assistantId: 'default_assistant',
  reasoningEngineLocation: 'us-central1',
} as unknown as Config;

/** Pulls the URL passed to the first gapiRequest call. */
const capturedUrl = (): string => {
  expect(mockedGapi).toHaveBeenCalled();
  return mockedGapi.mock.calls[0][0] as string;
};

describe('pageToken query-string encoding', () => {
  beforeEach(() => {
    mockedGapi.mockReset();
    // Terminate every do..while pagination loop after exactly one iteration.
    mockedGapi.mockResolvedValue({});
  });

  const cases: Array<{ name: string; invoke: () => Promise<unknown> }> = [
    {
      name: 'iam.listServiceAccounts',
      invoke: async () => {
        // First page returns the hostile token, second page terminates.
        mockedGapi.mockReset();
        mockedGapi
          .mockResolvedValueOnce({ accounts: [], nextPageToken: NASTY_TOKEN })
          .mockResolvedValue({ accounts: [] });
        return listServiceAccounts('proj');
      },
    },
    {
      name: 'iam.listWorkloadIdentityPools',
      invoke: async () => {
        mockedGapi.mockReset();
        mockedGapi
          .mockResolvedValueOnce({ workloadIdentityPools: [], nextPageToken: NASTY_TOKEN })
          .mockResolvedValue({ workloadIdentityPools: [] });
        return listWorkloadIdentityPools('proj');
      },
    },
    {
      name: 'iam.listWorkloadIdentityProviders',
      invoke: async () => {
        mockedGapi.mockReset();
        mockedGapi
          .mockResolvedValueOnce({ workloadIdentityProviders: [], nextPageToken: NASTY_TOKEN })
          .mockResolvedValue({ workloadIdentityProviders: [] });
        return listWorkloadIdentityProviders('projects/p/locations/global/workloadIdentityPools/pool', 'proj');
      },
    },
    {
      name: 'discovery/engines.listResources',
      invoke: () => listResources('engines', CONFIG, NASTY_TOKEN),
    },
    {
      name: 'discovery/operations.listDiscoverySessions',
      invoke: () => listDiscoverySessions(CONFIG, NASTY_TOKEN),
    },
    {
      name: 'vertexReasoning.listReasoningEngines',
      invoke: () => listReasoningEngines(CONFIG, NASTY_TOKEN),
    },
    {
      name: 'dataStores.listAuthorizations',
      invoke: () => listAuthorizations(CONFIG, NASTY_TOKEN),
    },
  ];

  it.each(cases)('$name round-trips an opaque token without corrupting it', async ({ invoke }) => {
    await invoke();

    // Use the LAST call for the looping functions (that is the paged request),
    // the only call for the single-shot ones.
    const url = mockedGapi.mock.calls[mockedGapi.mock.calls.length - 1][0] as string;
    const parsed = new URL(url);

    // The token must survive a full encode -> parse round trip byte for byte.
    expect(parsed.searchParams.get('pageToken')).toBe(NASTY_TOKEN);
  });

  it.each(cases)('$name does not let a token inject extra query parameters', async ({ invoke }) => {
    await invoke();

    const url = mockedGapi.mock.calls[mockedGapi.mock.calls.length - 1][0] as string;
    const parsed = new URL(url);

    // The token embeds "&pageSize=999999&filter=x y#frag". If it were
    // interpolated raw, pageSize would be overridden and `filter` would appear.
    expect(parsed.searchParams.get('filter')).toBeNull();
    expect(parsed.searchParams.get('pageSize')).not.toBe('999999');
    // And the "#frag" must not have truncated the URL into a fragment.
    expect(parsed.hash).toBe('');
  });

  it('listResources preserves the caller-supplied pageSize alongside the token', async () => {
    // Signature: listResources(type, config, pageToken?, pageSize?, suppressErrorLog?)
    await listResources('engines', CONFIG, NASTY_TOKEN, 37);
    const parsed = new URL(capturedUrl());
    expect(parsed.searchParams.get('pageSize')).toBe('37');
    expect(parsed.searchParams.get('pageToken')).toBe(NASTY_TOKEN);
  });

  it('omits pageToken entirely when no token is supplied', async () => {
    await listReasoningEngines(CONFIG);
    expect(capturedUrl()).not.toContain('pageToken');
  });
});

/**
 * The dominant defect pattern in this codebase is PARTIAL application of a
 * correct control: `encodeURIComponent` was applied to 6 of 13 pageToken
 * sites, and two files (`dataStores.ts`, `vertexReasoning.ts`) each contained
 * both a fixed and an unfixed site. The per-function tests above cannot catch
 * a NEW paginated endpoint added tomorrow, so this scan guards the invariant
 * at the source level across the entire repository.
 */
describe('pageToken encoding invariant (repo-wide source scan)', () => {
  it('has no pageToken interpolated into a URL without encodeURIComponent', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const roots = ['services', 'components', 'hooks', 'pages', 'utils'];
    const offenders: string[] = [];

    const walk = (dir: string): string[] => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        if (!/\.(ts|tsx)$/.test(entry.name)) return [];
        if (/\.test\.tsx?$/.test(entry.name)) return [];
        return [full];
      });
    };

    for (const root of roots) {
      for (const file of walk(root)) {
        const source = fs.readFileSync(file, 'utf8');
        source.split('\n').forEach((line, i) => {
          // Matches `pageToken=${...}` inside a template literal where the
          // expression does not begin with encodeURIComponent.
          const match = /pageToken=\$\{\s*(?!encodeURIComponent)/.exec(line);
          if (match) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
      }
    }

    expect(
      offenders,
      `Unencoded pageToken interpolation found. Wrap the value in encodeURIComponent():\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('scan actually inspects a meaningful number of files (guards against a no-op scan)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
      });
    // If the walker silently returned nothing, the scan above would pass
    // vacuously. Assert it sees the real tree.
    expect(walk('services').length).toBeGreaterThan(20);
  });
});

