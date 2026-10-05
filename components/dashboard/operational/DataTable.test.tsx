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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataTable, ColumnDef } from './DataTable';

const COLUMNS: ColumnDef[] = [
  { key: 'agent_name', header: 'Agent Name', type: 'text' },
  { key: 'latency_ms', header: 'Latency (ms)', type: 'mono' },
];

const SAMPLE_ROWS = [
  { id: '1', agent_name: 'Bravo Agent', latency_ms: 250 },
  { id: '2', agent_name: 'Alpha Agent', latency_ms: 900 },
  { id: '3', agent_name: 'Charlie Agent', latency_ms: 50 },
];

describe('DataTable', () => {
  it('sorts rows ascending, descending, and resets on column header click', () => {
    render(<DataTable title="Telemetry Log" columns={COLUMNS} data={SAMPLE_ROWS} />);

    const latencySortBtn = screen.getByRole('button', { name: /Latency \(ms\)/i });

    // Click 1: ascending numeric sort (50, 250, 900)
    fireEvent.click(latencySortBtn);
    let bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows[0].textContent).toContain('Charlie Agent');
    expect(bodyRows[2].textContent).toContain('Alpha Agent');

    // Click 2: descending numeric sort (900, 250, 50)
    fireEvent.click(latencySortBtn);
    bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows[0].textContent).toContain('Alpha Agent');
    expect(bodyRows[2].textContent).toContain('Charlie Agent');

    // Click 3: reset to original order (Bravo, Alpha, Charlie)
    fireEvent.click(latencySortBtn);
    bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows[0].textContent).toContain('Bravo Agent');
  });

  it('resets pagination to page 1 when data prop changes', () => {
    const manyRows = Array.from({ length: 20 }, (_, i) => ({
      id: `r-${i}`,
      agent_name: `Agent ${i + 1}`,
      latency_ms: i * 10,
    }));

    const { rerender } = render(
      <DataTable title="Paginated View" columns={COLUMNS} data={manyRows} pageSize={10} />
    );

    fireEvent.click(screen.getByTitle('Next page'));
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();

    // Switch to a smaller dataset (simulating view change)
    rerender(
      <DataTable title="Paginated View" columns={COLUMNS} data={SAMPLE_ROWS} pageSize={10} />
    );
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  });

  it('prefixes exported CSV filename with simulated_ when isSimulated is true', () => {
    const createObjectURLSpy = vi.fn(() => 'blob:mock-csv');
    const revokeObjectURLSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLSpy, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLSpy, writable: true });

    let capturedDownload = '';
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          capturedDownload = (el as HTMLAnchorElement).download;
        });
      }
      return el;
    });

    render(
      <DataTable
        title="User Activity Records"
        columns={COLUMNS}
        data={SAMPLE_ROWS}
        isSimulated={true}
      />
    );

    expect(screen.getByText('Simulated Data')).toBeTruthy();
    const exportBtn = screen.getByRole('button', { name: /Export Simulated CSV/i });
    fireEvent.click(exportBtn);

    expect(capturedDownload).toMatch(/^simulated_user_activity_records_\d{4}-\d{2}-\d{2}\.csv$/);
    createElementSpy.mockRestore();
  });
});
