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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useArchitectureScanner } from './useArchitectureScanner';
import * as api from '../services/apiService';

vi.mock('../services/apiService', () => ({
  listAuthorizations: vi.fn(),
  listReasoningEngines: vi.fn(),
  listCloudRunServices: vi.fn(),
  listResources: vi.fn(),
  getEngine: vi.fn(),
  getAgentView: vi.fn(),
  getDataStore: vi.fn(),
}));

describe('useArchitectureScanner hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default empty state', () => {
    const { result } = renderHook(() => useArchitectureScanner(''));
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
    expect(result.current.logs).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it('sets error when scanning without projectNumber', async () => {
    const { result } = renderHook(() => useArchitectureScanner(''));

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.error).toContain('Project ID/Number is required');
    expect(result.current.isLoading).toBe(false);
  });

  it('scans architecture and populates nodes and edges', async () => {
    (api.listAuthorizations as any).mockResolvedValue({
      authorizations: [{ name: 'projects/123/locations/global/authorizations/auth-1' }],
    });
    (api.listReasoningEngines as any).mockResolvedValue({ reasoningEngines: [] });
    (api.listCloudRunServices as any).mockResolvedValue({ services: [] });
    (api.listResources as any).mockImplementation((type: string) => {
      if (type === 'dataStores') return Promise.resolve({ dataStores: [] });
      if (type === 'engines') return Promise.resolve({ engines: [] });
      return Promise.resolve({});
    });

    const { result } = renderHook(() => useArchitectureScanner('123'));

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.nodes.length).toBeGreaterThan(0);
    // At least Project node, Authorization node, and Location nodes
    expect(result.current.nodes.some((n) => n.id === 'projects/123')).toBe(true);
    expect(result.current.nodes.some((n) => n.id === 'projects/123/locations/global/authorizations/auth-1')).toBe(true);
  });

  it('cancels scan when cancelScan is called', async () => {
    const { result } = renderHook(() => useArchitectureScanner('123'));

    act(() => {
      result.current.cancelScan();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.logs.some((l) => l.includes('cancelled'))).toBe(true);
  });
});
