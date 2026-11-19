/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrLoadProjectAgentsUsage,
  invalidateProjectAgentsUsageCache,
  isQuotaOrAuthExhaustedError,
  mapWithQuotaLimit,
} from './quotaGuard';

describe('quotaGuard — GCP Quota Protection & Background Hydration Limiter', () => {
  beforeEach(() => {
    invalidateProjectAgentsUsageCache();
  });

  it('caps concurrent execution strictly to the configured limit', async () => {
    let active = 0;
    let peakActive = 0;
    const items = Array.from({ length: 8 }, (_, idx) => idx);

    const { outcomes, shortCircuited } = await mapWithQuotaLimit(
      items,
      2,
      async (item) => {
        active += 1;
        peakActive = Math.max(peakActive, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
        return item * 10;
      },
    );

    expect(peakActive).toBeLessThanOrEqual(2);
    expect(shortCircuited).toBe(false);
    expect(outcomes.map((o) => o.value)).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
  });

  it('short-circuits remaining queued items immediately when a 429 RESOURCE_EXHAUSTED error occurs', async () => {
    const invoked: number[] = [];
    const items = [0, 1, 2, 3, 4, 5, 6];

    const { outcomes, shortCircuited } = await mapWithQuotaLimit(
      items,
      1,
      async (item) => {
        invoked.push(item);
        if (item === 1) {
          const err = Object.assign(new Error('429 RESOURCE_EXHAUSTED: Read requests per minute exceeded'), {
            status: 429,
            code: 'RESOURCE_EXHAUSTED',
          });
          throw err;
        }
        return `ok-${item}`;
      },
    );

    expect(shortCircuited).toBe(true);
    // Items 2..6 must NEVER be dispatched to Google Cloud once item 1 hits 429
    expect(invoked).toEqual([0, 1]);
    expect(outcomes[0]).toEqual({ status: 'fulfilled', value: 'ok-0' });
    expect(outcomes[1].status).toBe('rejected');
    expect(outcomes.slice(2).every((o) => o.status === 'skipped')).toBe(true);
  });

  it('cancels queued items before dispatch when AbortSignal is aborted', async () => {
    const controller = new AbortController();
    const invoked: number[] = [];

    const { outcomes } = await mapWithQuotaLimit(
      [0, 1, 2, 3, 4],
      1,
      async (item) => {
        invoked.push(item);
        if (item === 1) {
          controller.abort();
        }
        return item;
      },
      { signal: controller.signal },
    );

    expect(invoked).toEqual([0, 1]);
    expect(outcomes.slice(2).every((o) => o.status === 'skipped')).toBe(true);
  });

  it('deduplicates concurrent project agent scans and avoids caching warning-tainted or empty snapshots', async () => {
    expect(isQuotaOrAuthExhaustedError({ status: 429, message: 'Quota exceeded' })).toBe(true);
    expect(isQuotaOrAuthExhaustedError(new Error('403 Permission denied on single agent'))).toBe(false);

    // 1. Warning-tainted result must NOT be cached
    const flakyLoader = vi
      .fn()
      .mockResolvedValueOnce({
        agents: [{ name: 'ag-1', displayName: 'Agent 1' }],
        warnings: ['EU region 403'],
      })
      .mockResolvedValue({
        agents: [{ name: 'ag-1', displayName: 'Agent 1' }],
        warnings: [],
      });

    const first = await getOrLoadProjectAgentsUsage('proj-1', flakyLoader);
    expect(first.warnings).toEqual(['EU region 403']);

    // Next call re-runs loader because first had warnings, and deduplicates parallel callers
    const [secondA, secondB] = await Promise.all([
      getOrLoadProjectAgentsUsage('proj-1', flakyLoader),
      getOrLoadProjectAgentsUsage('proj-1', flakyLoader),
    ]);
    expect(flakyLoader).toHaveBeenCalledTimes(2);
    expect(secondA.agents).toHaveLength(1);
    expect(secondB.agents).toHaveLength(1);

    // Subsequent call hits clean cache without invoking loader again
    await getOrLoadProjectAgentsUsage('proj-1', flakyLoader);
    expect(flakyLoader).toHaveBeenCalledTimes(2);
  });
});
