/**
 * Copyright 2026 Google LLC
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

import { Agent, IamPolicy } from '../types';

/**
 * Maximum concurrent background metadata enrichment RPCs (e.g., per-agent
 * `:getIamPolicy`, `:getView`, or runtime session counts). Kept strictly below
 * `globalApiLimiter` (6) so foreground user navigation and mutations always have
 * dedicated capacity and never queue behind background hydration bursts, while
 * protecting customer GCP project per-minute API quotas.
 */
export const DEFAULT_BACKGROUND_CONCURRENCY = 2;

export const AGENT_METADATA_TTL_MS = 120_000; // 2 minutes
export const PROJECT_AGENTS_USAGE_TTL_MS = 90_000; // 90 seconds

export interface QuotaLimitedMapOptions {
  /** Optional AbortSignal to cancel remaining queued items on unmount or filter change. */
  signal?: AbortSignal;
  /**
   * Optional predicate inspected on rejected items; when it returns true (e.g.
   * `429 RESOURCE_EXHAUSTED` or `401 UNAUTHENTICATED`), remaining queued items
   * are skipped immediately to avoid hammering customer project quotas.
   */
  shouldShortCircuit?: (error: unknown) => boolean;
}

export interface QuotaLimitedItemOutcome<R> {
  status: 'fulfilled' | 'rejected' | 'skipped';
  value?: R;
  reason?: unknown;
}

export function isQuotaOrAuthExhaustedError(error: unknown): boolean {
  if (!error) return false;
  const candidate = error as { status?: number; code?: string | number; message?: string };
  if (candidate.status === 429 || candidate.status === 401) {
    return true;
  }
  if (
    candidate.code === 429 ||
    candidate.code === 'RESOURCE_EXHAUSTED' ||
    candidate.code === 'UNAUTHENTICATED'
  ) {
    return true;
  }
  const msg =
    typeof candidate.message === 'string'
      ? candidate.message
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    /\b429\b/.test(msg) ||
    /RESOURCE_EXHAUSTED/i.test(msg) ||
    /quota exceeded/i.test(msg) ||
    /rate limit/i.test(msg)
  );
}

/**
 * Executes `worker` across `items` with a strict concurrency cap, abort-signal
 * cancellation BEFORE dispatching queued requests, and optional quota/auth
 * circuit-breaking so background hydration never floods customer GCP projects.
 */
export async function mapWithQuotaLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options?: QuotaLimitedMapOptions
): Promise<{ outcomes: QuotaLimitedItemOutcome<R>[]; shortCircuited: boolean }> {
  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const outcomes: QuotaLimitedItemOutcome<R>[] = items.map(() => ({ status: 'skipped' }));
  let nextIndex = 0;
  let shortCircuited = false;
  const signal = options?.signal;
  const shouldShortCircuit = options?.shouldShortCircuit ?? isQuotaOrAuthExhaustedError;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      if (signal?.aborted || shortCircuited) {
        return;
      }
      const current = nextIndex++;
      if (current >= items.length) {
        return;
      }
      try {
        const value = await worker(items[current], current);
        outcomes[current] = { status: 'fulfilled', value };
      } catch (reason: unknown) {
        outcomes[current] = { status: 'rejected', reason };
        if (shouldShortCircuit(reason)) {
          shortCircuited = true;
          return;
        }
      }
    }
  };

  const workerCount = Math.min(safeConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return { outcomes, shortCircuited };
}

interface CachedEntry<V> {
  value: V;
  expiresAt: number;
}

const agentViewCache = new Map<string, CachedEntry<{ agentType?: string; agentOrigin?: string }>>();
const agentIamPolicyCache = new Map<string, CachedEntry<IamPolicy>>();

export function getCachedAgentView(
  agentName: string
): { agentType?: string; agentOrigin?: string } | undefined {
  const entry = agentViewCache.get(agentName);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    agentViewCache.delete(agentName);
    return undefined;
  }
  return entry.value;
}

export function setCachedAgentView(
  agentName: string,
  view: { agentType?: string; agentOrigin?: string },
  ttlMs: number = AGENT_METADATA_TTL_MS
): void {
  agentViewCache.set(agentName, {
    value: view,
    expiresAt: Date.now() + ttlMs,
  });
}

export function getCachedAgentIamPolicy(agentName: string): IamPolicy | undefined {
  const entry = agentIamPolicyCache.get(agentName);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    agentIamPolicyCache.delete(agentName);
    return undefined;
  }
  return entry.value;
}

export function setCachedAgentIamPolicy(
  agentName: string,
  policy: IamPolicy,
  ttlMs: number = AGENT_METADATA_TTL_MS
): void {
  agentIamPolicyCache.set(agentName, {
    value: policy,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateAgentMetadataCache(agentName?: string): void {
  if (agentName) {
    agentViewCache.delete(agentName);
    agentIamPolicyCache.delete(agentName);
    return;
  }
  agentViewCache.clear();
  agentIamPolicyCache.clear();
}

export interface ProjectAgentsUsageSnapshot {
  agents: Agent[];
  warnings: string[];
}

const projectAgentsCache = new Map<string, CachedEntry<ProjectAgentsUsageSnapshot>>();
const inFlightProjectAgents = new Map<string, Promise<ProjectAgentsUsageSnapshot>>();

export function invalidateProjectAgentsUsageCache(projectId?: string): void {
  if (projectId) {
    projectAgentsCache.delete(projectId);
    inFlightProjectAgents.delete(projectId);
    return;
  }
  projectAgentsCache.clear();
  inFlightProjectAgents.clear();
}

export async function getOrLoadProjectAgentsUsage(
  projectId: string,
  loader: () => Promise<ProjectAgentsUsageSnapshot>,
  options?: { forceRefresh?: boolean; ttlMs?: number }
): Promise<ProjectAgentsUsageSnapshot> {
  const key = projectId.trim();
  const ttlMs = options?.ttlMs ?? PROJECT_AGENTS_USAGE_TTL_MS;

  if (!options?.forceRefresh) {
    const cached = projectAgentsCache.get(key);
    if (cached && Date.now() <= cached.expiresAt) {
      return cached.value;
    }
    const existing = inFlightProjectAgents.get(key);
    if (existing) {
      return existing;
    }
  } else {
    projectAgentsCache.delete(key);
  }

  const promise = loader()
    .then((snapshot) => {
      // Only cache clean, non-empty snapshots so transient permission warnings or empty mock runs never persist stale state
      if (snapshot.agents.length > 0 && snapshot.warnings.length === 0) {
        projectAgentsCache.set(key, {
          value: snapshot,
          expiresAt: Date.now() + ttlMs,
        });
      }
      return snapshot;
    })
    .finally(() => {
      inFlightProjectAgents.delete(key);
    });

  inFlightProjectAgents.set(key, promise);
  return promise;
}
