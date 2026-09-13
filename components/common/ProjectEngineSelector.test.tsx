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

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectEngineSelector from './ProjectEngineSelector';
import * as api from '../../services/apiService';

vi.mock('../../services/apiService', () => ({
  listResources: vi.fn(),
}));

describe('ProjectEngineSelector component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, inputs, and calls onChange when project changes', () => {
    (api.listResources as any).mockResolvedValue({ engines: [] });
    const handleChange = vi.fn();

    render(
      <ProjectEngineSelector
        title="Source Environment (Baseline)"
        subtitle="Baseline Config"
        badgeColor="blue"
        value={{ project: 'test-proj', location: 'global', engine: 'default_engine' }}
        onChange={handleChange}
      />
    );

    expect(screen.getByText('Source Environment (Baseline)')).toBeDefined();
    expect(screen.getByText('Baseline Config')).toBeDefined();

    const input = screen.getByPlaceholderText('e.g. my-project or 123456789');
    expect((input as HTMLInputElement).value).toBe('test-proj');

    fireEvent.change(input, { target: { value: 'new-project' } });
    expect(handleChange).toHaveBeenCalledWith({
      project: 'new-project',
      location: 'global',
      engine: 'default_engine',
    });
  });

  it('fetches engines and allows selecting an engine from the list', async () => {
    (api.listResources as any).mockResolvedValue({
      engines: [
        { name: 'projects/123/locations/global/collections/default_collection/engines/engine-1', displayName: 'First Engine' },
        { name: 'projects/123/locations/global/collections/default_collection/engines/engine-2', displayName: 'Second Engine' },
      ],
    });
    const handleChange = vi.fn();

    render(
      <ProjectEngineSelector
        title="Destination Environment"
        badgeColor="emerald"
        value={{ project: '123', location: 'global', engine: 'engine-1' }}
        onChange={handleChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('First Engine (engine-1)')).toBeDefined();
    });

    expect(screen.getByText('Second Engine (engine-2)')).toBeDefined();
  });

  it('toggles to manual input mode when Enter manually is clicked', async () => {
    (api.listResources as any).mockResolvedValue({
      engines: [
        { name: 'projects/123/locations/global/collections/default_collection/engines/engine-1', displayName: 'First Engine' },
      ],
    });
    const handleChange = vi.fn();

    render(
      <ProjectEngineSelector
        title="Test Env"
        value={{ project: '123', location: 'global', engine: 'engine-1' }}
        onChange={handleChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Enter manually')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Enter manually'));

    // Now input is displayed instead of select
    expect(screen.getByPlaceholderText('default_engine')).toBeDefined();
    expect(screen.getByText('Select from list')).toBeDefined();
  });
});
