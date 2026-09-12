import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ObservabilityPage from './ObservabilityPage';
import { runBigQueryQuery, gapiRequest, listLoggingSinks, listBigQueryTables } from '../services/apiService';

vi.mock('../services/apiService', () => ({
    runBigQueryQuery: vi.fn(),
    gapiRequest: vi.fn(),
    listLoggingSinks: vi.fn(),
    listBigQueryTables: vi.fn()
}));

vi.mock('../components/dashboard/ObservabilityDashboard', () => ({
    default: ({ customData }: any) => (
        <div data-testid="dashboard">
            Total Requests: {customData?.totalRequests ?? 'Loading...'}
        </div>
    )
}));

vi.mock('../components/dashboard/operational/OperationalAnalyticsDashboard', () => ({
    OperationalAnalyticsDashboard: () => <div />
}));

vi.mock('../components/CloudConsoleButton', () => ({
    default: () => <button>Console</button>
}));

import { ToastProvider } from '../context/ToastContext';

describe('ObservabilityPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup initial fetches
        (listLoggingSinks as any).mockResolvedValue({
            sinks: [{ name: 'test-sink', destination: 'bigquery.googleapis.com/projects/test/datasets/my_dataset' }]
        });
        (listBigQueryTables as any).mockResolvedValue({
            tables: [{ tableReference: { tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity' } }]
        });
    });

    it('polls BigQuery when jobComplete is false', async () => {
        (runBigQueryQuery as any).mockResolvedValue({
            jobComplete: false,
            jobReference: { jobId: 'job-123', location: 'US' }
        });

        (gapiRequest as any).mockResolvedValue({
            jobComplete: true,
            rows: [
                { f: [{ v: 'summary' }, { v: '42' }, { v: '5' }, { v: '2' }] }
            ]
        });

        render(
            <ToastProvider>
                <ObservabilityPage projectNumber="123" projectId="test-proj" />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('dashboard')).toHaveTextContent('Total Requests: 42');
        }, { timeout: 3000 });
        
        expect(runBigQueryQuery).toHaveBeenCalledTimes(1);
        expect(gapiRequest).toHaveBeenCalledTimes(1);
        expect(gapiRequest).toHaveBeenCalledWith(
            'https://bigquery.googleapis.com/bigquery/v2/projects/test-proj/queries/job-123?location=US',
            'GET',
            'test-proj',
            undefined,
            undefined,
            undefined,
            true
        );
    });
});
