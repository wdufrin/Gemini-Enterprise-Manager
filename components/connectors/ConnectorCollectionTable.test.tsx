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
import { ConnectorCollectionTable } from './ConnectorCollectionTable';
import { Collection } from '../../types';
import { ValidationResult } from './connectorDiagnostics';

const COLLECTIONS: Collection[] = [
  {
    name: 'projects/123/locations/global/collections/jira-prod',
    displayName: 'Jira Production',
  },
  {
    name: 'projects/123/locations/global/collections/confluence-kb',
    displayName: 'Confluence KB',
  },
  {
    name: 'projects/123/locations/global/collections/default_collection',
    displayName: 'Default Collection',
  },
];

const VALIDATION_RESULTS: Record<string, ValidationResult> = {
  'projects/123/locations/global/collections/jira-prod': {
    status: 'success',
    message: 'Connector healthy',
  },
  'projects/123/locations/global/collections/confluence-kb': {
    status: 'error',
    message: 'Sync failed',
  },
  'projects/123/locations/global/collections/default_collection': {
    status: 'n/a',
    message: 'Not applicable',
  },
};

describe('ConnectorCollectionTable', () => {
  const createProps = () => ({
    collections: COLLECTIONS,
    validationResults: VALIDATION_RESULTS,
    editingId: null,
    setEditingId: vi.fn(),
    editName: '',
    setEditName: vi.fn(),
    isSavingName: false,
    onSaveName: vi.fn(),
    getAssociatedApps: (name: string) => (name.endsWith('jira-prod') ? ['Support App'] : []),
    onCheckDataConnector: vi.fn(),
    onOpenDetails: vi.fn(),
    onSelectResult: vi.fn(),
    onDuplicateConnector: vi.fn(),
    onRequestDelete: vi.fn(),
  });

  it('filters collections by search query and diagnostic status', () => {
    render(<ConnectorCollectionTable {...createProps()} />);

    const searchInput = screen.getByLabelText('Search collections');
    fireEvent.change(searchInput, { target: { value: 'Support App' } });
    expect(screen.getByText('Jira Production')).toBeTruthy();
    expect(screen.queryByText('Confluence KB')).toBeNull();

    // Clear search and filter by FAIL status
    fireEvent.change(searchInput, { target: { value: '' } });
    const statusSelect = screen.getByLabelText('Filter collections by diagnostic status');
    fireEvent.change(statusSelect, { target: { value: 'error' } });

    expect(screen.getByText('Confluence KB')).toBeTruthy();
    expect(screen.queryByText('Jira Production')).toBeNull();
  });

  it('renders empty state for unmatched filter and disables N/A status pill button', () => {
    const props = createProps();
    render(<ConnectorCollectionTable {...props} />);

    const naBtn = screen.getByRole('button', { name: 'N/A' }) as HTMLButtonElement;
    expect(naBtn.disabled).toBe(true);
    fireEvent.click(naBtn);
    expect(props.onSelectResult).not.toHaveBeenCalled();

    const passBtn = screen.getByRole('button', { name: 'PASS' });
    fireEvent.click(passBtn);
    expect(props.onSelectResult).toHaveBeenCalledTimes(1);

    const searchInput = screen.getByLabelText('Search collections');
    fireEvent.change(searchInput, { target: { value: 'nonexistent_collection_xyz' } });
    expect(screen.getByText('No collections match your filter criteria.')).toBeTruthy();
  });

  it('renders Unverified (API Warning) instead of None for custom collections when associationWarning is present', () => {
    const props = createProps();
    render(
      <ConnectorCollectionTable
        {...props}
        associationWarning="Could not verify Associated Apps for collections: Engines lookup failed (403 Forbidden)."
      />
    );

    // Confluence KB has no matched apps and is not default_collection -> should render Unverified (API Warning)
    const unverifiedBadge = screen.getByTestId('connector-assoc-unverified-confluence-kb');
    expect(unverifiedBadge.textContent).toContain('Unverified (API Warning)');

    // default_collection still renders None when empty
    expect(screen.getByText('None')).toBeTruthy();
  });
});
