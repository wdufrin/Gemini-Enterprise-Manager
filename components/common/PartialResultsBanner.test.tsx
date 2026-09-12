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
import { render, screen, fireEvent } from '@testing-library/react';
import { PartialResultsBanner } from './PartialResultsBanner';
import { PartialFailure } from '../../hooks/useAsyncResource';

describe('PartialResultsBanner', () => {
  const sampleFailures: PartialFailure[] = [
    {
      id: 'store-1',
      name: 'Engineering Docs',
      resourceType: 'DATASTORE',
      status: 403,
      reason: 'Caller lacks discoveryengine.dataStores.get permission',
      error: '403 Forbidden',
    },
    {
      id: 'store-2',
      name: 'HR Internal',
      resourceType: 'DATASTORE',
      status: 404,
      reason: 'Resource does not exist',
      error: '404 Not Found',
    },
  ];

  it('renders nothing if partialFailures is empty', () => {
    const { container } = render(<PartialResultsBanner partialFailures={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner message with count and default resource name', () => {
    render(<PartialResultsBanner partialFailures={sampleFailures} />);

    expect(screen.getByText('2 resources could not be loaded')).toBeInTheDocument();
  });

  it('renders custom resource name and total count when specified', () => {
    render(
      <PartialResultsBanner
        partialFailures={sampleFailures}
        resourceName="datastores"
        totalCount={10}
      />
    );

    expect(screen.getByText('2 of 10 datastores could not be loaded')).toBeInTheDocument();
  });

  it('toggles detail section when Show details is clicked', () => {
    render(<PartialResultsBanner partialFailures={sampleFailures} />);

    expect(screen.queryByText('Engineering Docs')).not.toBeInTheDocument();

    const toggleBtn = screen.getByRole('button', { name: /show details/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Engineering Docs')).toBeInTheDocument();
    expect(screen.getByText('403 Permission Denied')).toBeInTheDocument();
    expect(screen.getByText('HR Internal')).toBeInTheDocument();
    expect(screen.getByText('404 Not Found')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /hide details/i }));
    expect(screen.queryByText('Engineering Docs')).not.toBeInTheDocument();
  });

  it('triggers onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<PartialResultsBanner partialFailures={sampleFailures} onRetry={onRetry} />);

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables retry button when isRetrying is true', () => {
    const onRetry = vi.fn();
    render(
      <PartialResultsBanner
        partialFailures={sampleFailures}
        onRetry={onRetry}
        isRetrying={true}
      />
    );

    const retryBtn = screen.getByRole('button', { name: /retrying/i });
    expect(retryBtn).toBeDisabled();

    fireEvent.click(retryBtn);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <PartialResultsBanner
        partialFailures={sampleFailures}
        onDismiss={onDismiss}
      />
    );

    const dismissBtn = screen.getByRole('button', { name: /dismiss warning/i });
    fireEvent.click(dismissBtn);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
