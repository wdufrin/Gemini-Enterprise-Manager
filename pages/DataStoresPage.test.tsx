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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DataStoresPage from './DataStoresPage';
import {
  QueryHistoryList,
  getDocumentPreview,
} from '../components/datastores/query/QueryHistoryList';
import * as api from '../services/apiService';
import { DataStore, Document } from '../types';

vi.mock('../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiService')>();
  return {
    ...actual,
    gapiRequest: vi.fn(),
    listCollections: vi.fn(),
    listResources: vi.fn(),
    listDocuments: vi.fn(),
    getDataStore: vi.fn(),
  };
});

const sampleDataStore: DataStore = {
  name: 'projects/123456/locations/global/collections/default_collection/dataStores/ds-manuals-1',
  displayName: 'Technical Service Manuals',
  industryVertical: 'GENERIC',
  solutionTypes: ['SOLUTION_TYPE_SEARCH', 'SOLUTION_TYPE_CHAT'],
  contentConfig: 'CONTENT_REQUIRED',
};

let storageStore: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (k: string) => (k in storageStore ? storageStore[k] : null),
    setItem: (k: string, v: string) => {
      storageStore[k] = String(v);
    },
    removeItem: (k: string) => {
      delete storageStore[k];
    },
    clear: () => {
      storageStore = {};
    },
  },
  writable: true,
});

describe('DataStoresPage, DataStoreDetails & QueryHistoryList (F7: Module 6 Data Stores)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageStore = {};

    vi.mocked(api.listCollections).mockResolvedValue({
      collections: [
        {
          name: 'projects/123456/locations/global/collections/default_collection',
          displayName: 'default_collection',
        },
      ],
    });
    vi.mocked(api.listResources).mockResolvedValue({
      dataStores: [sampleDataStore],
    });
    vi.mocked(api.listDocuments).mockResolvedValue({
      documents: [],
    });
    vi.mocked(api.getDataStore).mockResolvedValue(sampleDataStore);
    vi.mocked(api.gapiRequest).mockResolvedValue({
      name: `${sampleDataStore.name}/schemas/default_schema`,
      structSchema: { type: 'object' },
    });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <DataStoresPage projectNumber="123456" setProjectNumber={vi.fn()} />
      </MemoryRouter>
    );

  it('renders data stores list and opens DataStoreDetails when clicking View', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Technical Service Manuals')).toBeInTheDocument();
    });

    // Click View button to open DataStoreDetails
    fireEvent.click(screen.getByRole('button', { name: /^View$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/CONTENT_REQUIRED/i)
      ).toBeInTheDocument();
    });
  });

  it('surfaces collection-discovery-warning alert banner when api.listCollections rejects with 403', async () => {
    vi.mocked(api.listCollections).mockRejectedValueOnce(
      new Error('403 PERMISSION_DENIED listing collections')
    );

    renderPage();

    const warningAlert = await screen.findByTestId('collection-discovery-warning');
    expect(warningAlert.textContent).toMatch(/403 PERMISSION_DENIED listing collections/i);
    expect(warningAlert.textContent).toMatch(/Defaulting to default_collection/i);
  });

  it('extracts derivedStructData in getDocumentPreview and toggles Raw :search Result JSON in QueryHistoryList', () => {
    const unstructuredDoc = {
      name: 'projects/123/locations/global/collections/default_collection/dataStores/ds-1/branches/0/documents/doc-99',
      id: 'doc-99',
      derivedStructData: {
        title: '2026 Powertrain Warranty Manual',
        link: 'gs://warranty-docs/powertrain-2026.pdf',
        snippets: [{ snippet: 'Powertrain coverage is 5 years or 60,000 miles.' }],
      },
    } as unknown as Document;

    const preview = getDocumentPreview(unstructuredDoc);
    expect(preview).toContain('Powertrain coverage is 5 years or 60,000 miles.');

    render(
      <QueryHistoryList
        history={[
          {
            query: 'powertrain warranty coverage',
            timestamp: new Date(),
            authMode: 'default',
            totalSize: 1,
            results: [{ id: 'doc-99', document: unstructuredDoc }],
            rawResponse: {
              results: [{ id: 'doc-99', document: unstructuredDoc }],
              totalSize: 1,
              attributionToken: 'attr-token-xyz',
            },
          },
        ]}
        isSearching={false}
        expandedResult="0-doc-99"
        toggleExpandResult={vi.fn()}
        resultsEndRef={{ current: null }}
        showCodePanel={false}
      />
    );

    expect(screen.getByText('2026 Powertrain Warranty Manual')).toBeInTheDocument();
    expect(screen.getByText('gs://warranty-docs/powertrain-2026.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-raw-search-json-0'));
    const rawPre = screen.getByTestId('raw-search-json-0');
    expect(rawPre.textContent).toContain('attr-token-xyz');
  });
});
