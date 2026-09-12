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

import { useState, useRef, useEffect, useCallback } from 'react';
import { GapiError } from '../services/apiService';
import { toErrorMessage } from '../utils/errors';

export interface PartialFailure {
  id: string;
  name: string;
  resourceType?: string;
  error: GapiError | Error | string;
  status?: number;
  reason?: string;
}

export interface AsyncResourceContext {
  signal: AbortSignal;
  reportPartialFailure: (failure: PartialFailure) => void;
}

export type AsyncFetcherResult<T> =
  | T
  | {
      data: T;
      partialFailures?: PartialFailure[];
    };

export type AsyncFetcher<T, Args extends unknown[] = unknown[]> = (
  context: AsyncResourceContext,
  ...args: Args
) => Promise<AsyncFetcherResult<T>>;

export interface UseAsyncResourceOptions<T, Args extends unknown[] = unknown[]> {
  initialData?: T | null;
  immediate?: boolean;
  immediateArgs?: Args;
  onSuccess?: (data: T) => void;
  onError?: (error: GapiError | Error) => void;
}

export interface AsyncResourceReturn<T, Args extends unknown[] = unknown[]> {
  data: T | null;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
  isLoading: boolean;
  error: GapiError | Error | null;
  partialFailures: PartialFailure[];
  isPartial: boolean;
  execute: (...args: Args) => Promise<T | null>;
  retry: () => Promise<T | null>;
  reset: () => void;
  clearPartialFailures: () => void;
}

/**
 * Checks whether an error is caused by request abortion / cancellation.
 */
function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    if (err.message.toLowerCase().includes('aborted') || err.message.toLowerCase().includes('canceled')) {
      return true;
    }
  }
  return false;
}

/**
 * Shared lifecycle hook for managing asynchronous GCP resources.
 * Guarantees:
 * 1. Mounting safety: No React state updates after unmount.
 * 2. In-flight cancellation: Previous execution is aborted when re-invoked or on unmount.
 * 3. Structured error handling: Preserves GapiError status codes (403 vs 404 vs 429).
 * 4. Partial failure tracking: Distinguishes total failure from partial degradation.
 */
export function useAsyncResource<T, Args extends unknown[] = unknown[]>(
  fetcher: AsyncFetcher<T, Args>,
  options: UseAsyncResourceOptions<T, Args> = {}
): AsyncResourceReturn<T, Args> {
  const { initialData = null, immediate = false, immediateArgs, onSuccess, onError } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(immediate));
  const [error, setError] = useState<GapiError | Error | null>(null);
  const [partialFailures, setPartialFailures] = useState<PartialFailure[]>([]);

  const isMountedRef = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastArgsRef = useRef<Args | null>(immediateArgs || null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Mount tracking and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const clearPartialFailures = useCallback(() => {
    if (isMountedRef.current) {
      setPartialFailures([]);
    }
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (isMountedRef.current) {
      setData(initialData);
      setIsLoading(false);
      setError(null);
      setPartialFailures([]);
    }
  }, [initialData]);

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      // Abort any existing in-flight execution
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      lastArgsRef.current = args;

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      const accumulatedPartials: PartialFailure[] = [];

      const context: AsyncResourceContext = {
        signal: controller.signal,
        reportPartialFailure: (failure: PartialFailure) => {
          accumulatedPartials.push(failure);
          if (isMountedRef.current && !controller.signal.aborted) {
            setPartialFailures([...accumulatedPartials]);
          }
        },
      };

      try {
        const result = await fetcherRef.current(context, ...args);

        // Guard against unmount or abortion
        if (!isMountedRef.current || controller.signal.aborted) {
          return null;
        }

        let resolvedData: T;
        let resolvedPartials = accumulatedPartials;

        // Check if the result wrapped data & partialFailures
        if (
          result &&
          typeof result === 'object' &&
          'data' in result &&
          (result as { data: T; partialFailures?: PartialFailure[] }).data !== undefined
        ) {
          const wrapped = result as { data: T; partialFailures?: PartialFailure[] };
          resolvedData = wrapped.data;
          if (Array.isArray(wrapped.partialFailures)) {
            resolvedPartials = [...resolvedPartials, ...wrapped.partialFailures];
          }
        } else {
          resolvedData = result as T;
        }

        if (isMountedRef.current) {
          setData(resolvedData);
          setPartialFailures(resolvedPartials);
          setError(null);
          setIsLoading(false);
        }

        onSuccessRef.current?.(resolvedData);
        return resolvedData;
      } catch (err: unknown) {
        // If aborted or unmounted, silently exit
        if (!isMountedRef.current || isAbortError(err, controller.signal)) {
          return null;
        }

        let structuredError: GapiError | Error;
        if (err instanceof GapiError) {
          structuredError = err;
        } else if (err instanceof Error) {
          structuredError = err;
        } else {
          structuredError = new Error(toErrorMessage(err));
        }

        if (isMountedRef.current) {
          setError(structuredError);
          setIsLoading(false);
        }

        onErrorRef.current?.(structuredError);
        return null;
      } finally {
        if (isMountedRef.current && abortControllerRef.current === controller) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const retry = useCallback(async (): Promise<T | null> => {
    const argsToUse = lastArgsRef.current || ([] as unknown as Args);
    return execute(...argsToUse);
  }, [execute]);

  // Execute immediately on mount if requested
  useEffect(() => {
    if (immediate) {
      const args = immediateArgs || ([] as unknown as Args);
      void execute(...args);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data,
    setData,
    isLoading,
    error,
    partialFailures,
    isPartial: partialFailures.length > 0,
    execute,
    retry,
    reset,
    clearPartialFailures,
  };
}
