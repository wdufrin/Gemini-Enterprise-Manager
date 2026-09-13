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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedConfig } from './usePersistedConfig';

describe('usePersistedConfig hook', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('initializes with fallback value when storage is empty', () => {
    const { result } = renderHook(() =>
      usePersistedConfig('testKey', { count: 1 })
    );

    const [value] = result.current;
    expect(value).toEqual({ count: 1 });
  });

  it('initializes from sessionStorage if value exists', () => {
    sessionStorage.setItem('testKey', JSON.stringify({ count: 42 }));

    const { result } = renderHook(() =>
      usePersistedConfig('testKey', { count: 1 })
    );

    const [value] = result.current;
    expect(value).toEqual({ count: 42 });
  });

  it('runs migration/sanitizer function if provided', () => {
    sessionStorage.setItem(
      'testKey',
      JSON.stringify({ legacyField: 'old', count: 5 })
    );

    const migrate = (parsed: any) => ({
      count: parsed.count,
      upgraded: true,
    });

    const { result } = renderHook(() =>
      usePersistedConfig('testKey', { count: 0, upgraded: false }, { migrate })
    );

    const [value] = result.current;
    expect(value).toEqual({ count: 5, upgraded: true });
  });

  it('recovers gracefully from corrupt JSON in storage', () => {
    sessionStorage.setItem('testKey', 'not-valid-json{{{');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() =>
      usePersistedConfig('testKey', { safe: true })
    );

    const [value] = result.current;
    expect(value).toEqual({ safe: true });
    expect(warnSpy).toHaveBeenCalled();
    expect(sessionStorage.getItem('testKey')).toBeNull();
  });

  it('updates state and persists to storage on setValue', () => {
    const { result } = renderHook(() =>
      usePersistedConfig('testKey', { name: 'initial' })
    );

    act(() => {
      const [, setValue] = result.current;
      setValue({ name: 'updated' });
    });

    const [value] = result.current;
    expect(value).toEqual({ name: 'updated' });
    expect(JSON.parse(sessionStorage.getItem('testKey')!)).toEqual({ name: 'updated' });
  });

  it('supports functional updater in setValue', () => {
    const { result } = renderHook(() =>
      usePersistedConfig('counter', 10)
    );

    act(() => {
      const [, setValue] = result.current;
      setValue(prev => prev + 5);
    });

    const [value] = result.current;
    expect(value).toBe(15);
    expect(JSON.parse(sessionStorage.getItem('counter')!)).toBe(15);
  });

  it('clears value and removes from storage on clear()', () => {
    sessionStorage.setItem('testKey', JSON.stringify({ item: 'stored' }));

    const { result } = renderHook(() =>
      usePersistedConfig('testKey', { item: 'default' })
    );

    act(() => {
      const [, , clear] = result.current;
      clear();
    });

    const [value] = result.current;
    expect(value).toEqual({ item: 'default' });
    expect(sessionStorage.getItem('testKey')).toBeNull();
  });

  it('handles storage errors without throwing when storage.setItem fails', () => {
    const mockStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn().mockImplementation(() => {
        throw new Error('QuotaExceededError');
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() =>
      usePersistedConfig('testKey', { data: 'val' }, { storage: mockStorage })
    );

    act(() => {
      const [, setValue] = result.current;
      setValue({ data: 'new-val' });
    });

    const [value] = result.current;
    expect(value).toEqual({ data: 'new-val' });
    expect(warnSpy).toHaveBeenCalled();
  });
});
