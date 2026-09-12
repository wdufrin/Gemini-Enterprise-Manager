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

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncResource, PartialFailure } from './useAsyncResource';
import { GapiError } from '../services/apiService';

describe('useAsyncResource', () => {
  it('initializes with default values when immediate is false', () => {
    const fetcher = vi.fn().mockResolvedValue(['item1', 'item2']);
    const { result } = renderHook(() => useAsyncResource(fetcher));

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.partialFailures).toEqual([]);
    expect(result.current.isPartial).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('initializes with initialData when provided', () => {
    const fetcher = vi.fn().mockResolvedValue(['item1']);
    const { result } = renderHook(() =>
      useAsyncResource(fetcher, { initialData: ['initial'] })
    );

    expect(result.current.data).toEqual(['initial']);
    expect(result.current.isLoading).toBe(false);
  });

  it('successfully fetches data and updates state', async () => {
    const onSuccess = vi.fn();
    const fetcher = vi.fn().mockImplementation(async ({ signal }, query: string) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return [`result for ${query}`];
    });

    const { result } = renderHook(() =>
      useAsyncResource(fetcher, { onSuccess })
    );

    let res: string[] | null = null;
    await act(async () => {
      res = await result.current.execute('search-term');
    });

    expect(res).toEqual(['result for search-term']);
    expect(result.current.data).toEqual(['result for search-term']);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(onSuccess).toHaveBeenCalledWith(['result for search-term']);
  });

  it('captures structured GapiError with status code intact', async () => {
    const onError = vi.fn();
    const gapiErr = new GapiError('Permission denied', 403, 'PERMISSION_DENIED');
    const fetcher = vi.fn().mockRejectedValue(gapiErr);

    const { result } = renderHook(() =>
      useAsyncResource(fetcher, { onError })
    );

    let res: unknown = 'sentinel';
    await act(async () => {
      res = await result.current.execute();
    });

    expect(res).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(gapiErr);
    expect((result.current.error as GapiError).status).toBe(403);
    expect(onError).toHaveBeenCalledWith(gapiErr);
  });

  it('converts unknown error thrown into standard Error', async () => {
    const fetcher = vi.fn().mockRejectedValue('Something broke horribly');

    const { result } = renderHook(() => useAsyncResource(fetcher));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Something broke horribly');
  });

  it('ignores AbortError and does not set error state', async () => {
    const onError = vi.fn();
    const abortErr = new DOMException('The user aborted a request.', 'AbortError');
    const fetcher = vi.fn().mockRejectedValue(abortErr);

    const { result } = renderHook(() =>
      useAsyncResource(fetcher, { onError })
    );

    await act(async () => {
      const res = await result.current.execute();
      expect(res).toBeNull();
    });

    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('aborts previous request when execute is called again', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn().mockImplementation(async ({ signal }) => {
      signals.push(signal);
      return new Promise((resolve) => setTimeout(() => resolve('done'), 50));
    });

    const { result } = renderHook(() => useAsyncResource(fetcher));

    act(() => {
      void result.current.execute();
    });

    expect(signals.length).toBe(1);
    expect(signals[0].aborted).toBe(false);

    act(() => {
      void result.current.execute();
    });

    expect(signals.length).toBe(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('safely handles unmounting during in-flight request', async () => {
    let capturedSignal: AbortSignal | null = null;
    const fetcher = vi.fn().mockImplementation(async ({ signal }) => {
      capturedSignal = signal;
      return new Promise((resolve) => setTimeout(() => resolve('done'), 100));
    });

    const { result, unmount } = renderHook(() => useAsyncResource(fetcher));

    act(() => {
      void result.current.execute();
    });

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('collects partial failures reported via context.reportPartialFailure', async () => {
    const failure: PartialFailure = {
      id: 'store-1',
      name: 'HR Datastore',
      status: 403,
      reason: 'User lacks permissions',
      error: '403 Forbidden',
    };

    const fetcher = vi.fn().mockImplementation(async ({ reportPartialFailure }) => {
      reportPartialFailure(failure);
      return ['store-2'];
    });

    const { result } = renderHook(() => useAsyncResource(fetcher));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toEqual(['store-2']);
    expect(result.current.partialFailures).toEqual([failure]);
    expect(result.current.isPartial).toBe(true);

    act(() => {
      result.current.clearPartialFailures();
    });

    expect(result.current.partialFailures).toEqual([]);
    expect(result.current.isPartial).toBe(false);
  });

  it('supports returning { data, partialFailures } from fetcher', async () => {
    const failure: PartialFailure = {
      id: 'engine-x',
      name: 'Engine X',
      status: 404,
      reason: 'Not found',
      error: 'Not found',
    };

    const fetcher = vi.fn().mockResolvedValue({
      data: [{ id: 'engine-1' }],
      partialFailures: [failure],
    });

    const { result } = renderHook(() => useAsyncResource(fetcher));

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toEqual([{ id: 'engine-1' }]);
    expect(result.current.partialFailures).toEqual([failure]);
    expect(result.current.isPartial).toBe(true);
  });

  it('retry re-runs execute with the previous arguments', async () => {
    const fetcher = vi.fn().mockImplementation(async (_ctx, arg1: string, arg2: number) => {
      return `${arg1}-${arg2}`;
    });

    const { result } = renderHook(() => useAsyncResource(fetcher));

    await act(async () => {
      await result.current.execute('prefix', 42);
    });

    expect(result.current.data).toBe('prefix-42');
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retry();
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(expect.anything(), 'prefix', 42);
  });

  it('reset restores initial state and aborts active request', async () => {
    let capturedSignal: AbortSignal | null = null;
    const fetcher = vi.fn().mockImplementation(async ({ signal }) => {
      capturedSignal = signal;
      return new Promise((resolve) => setTimeout(() => resolve('done'), 100));
    });

    const { result } = renderHook(() =>
      useAsyncResource(fetcher, { initialData: 'init' })
    );

    act(() => {
      void result.current.execute();
    });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBe('init');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('executes immediately on mount if immediate is true', async () => {
    const fetcher = vi.fn().mockImplementation(async (_ctx, projectId: string) => {
      return `loaded-${projectId}`;
    });

    const { result } = renderHook(() =>
      useAsyncResource(fetcher, {
        immediate: true,
        immediateArgs: ['my-project'],
      })
    );

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toBe('loaded-my-project');
    expect(result.current.isLoading).toBe(false);
    expect(fetcher).toHaveBeenCalledWith(expect.anything(), 'my-project');
  });
});
