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

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UsePersistedConfigOptions<T> {
  /** Optional sanitizer / migrator function run on parsed stored value */
  migrate?: (parsed: any) => T;
  /** Storage backend: defaults to sessionStorage, can be localStorage */
  storage?: Storage;
}

/**
 * Custom hook to manage React state synchronized with sessionStorage (or localStorage).
 * Safely handles JSON parse failures, storage errors, and provides automatic cleanup.
 *
 * @param key The storage key name
 * @param initialValue Fallback initial value or initialization function
 * @param options Storage options including migration/sanitization callback and custom Storage target
 */
export function usePersistedConfig<T>(
  key: string,
  initialValue: T | (() => T),
  options?: UsePersistedConfigOptions<T>
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const storage = options?.storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
  const migrateRef = useRef(options?.migrate);
  migrateRef.current = options?.migrate;

  const readValue = useCallback((): T => {
    const fallback = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    if (!storage) return fallback;

    try {
      const raw = storage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (migrateRef.current) {
          return migrateRef.current(parsed);
        }
        return parsed as T;
      }
    } catch (e) {
      console.warn(`[usePersistedConfig] Failed to parse item "${key}" from storage:`, e);
      try {
        storage.removeItem(key);
      } catch {
        // ignore removal error
      }
    }
    return fallback;
  }, [key, initialValue, storage]);

  const [state, setStateInternal] = useState<T>(readValue);

  // If key changes dynamically, re-read from storage
  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      setStateInternal(readValue());
    }
  }, [key, readValue]);

  // Set value and persist directly
  const setValue: React.Dispatch<React.SetStateAction<T>> = useCallback(
    (action) => {
      setStateInternal((prev) => {
        const next = typeof action === 'function' ? (action as (prev: T) => T)(prev) : action;
        if (storage) {
          try {
            storage.setItem(key, JSON.stringify(next));
          } catch (e) {
            console.warn(`[usePersistedConfig] Failed to persist "${key}" to storage:`, e);
          }
        }
        return next;
      });
    },
    [key, storage]
  );

  // Clear value resets to initial fallback and clears storage item
  const clear = useCallback(() => {
    const fallback = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    setStateInternal(fallback);
    if (storage) {
      try {
        storage.removeItem(key);
      } catch (e) {
        console.warn(`[usePersistedConfig] Failed to remove "${key}" from storage:`, e);
      }
    }
  }, [key, initialValue, storage]);

  return [state, setValue, clear];
}
