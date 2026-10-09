import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
            tables: [
                { tableReference: { tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity' }, type: 'TABLE' },
                { tableReference: { tableId: 'v_admin_feedback_review' }, type: 'VIEW' }
            ]
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

    it('auto-collapses the dataset tables and views list by default and expands on toggle', async () => {
        (runBigQueryQuery as any).mockResolvedValue({
            jobComplete: true,
            rows: [
                { f: [{ v: 'summary' }, { v: '10' }, { v: '2' }, { v: '1' }] }
            ]
        });

        render(
            <ToastProvider>
                <ObservabilityPage projectNumber="123" projectId="test-proj" />
            </ToastProvider>
        );

        const expandButton = await screen.findByRole('button', { name: /Show 2 Tables & Views/i });
        expect(expandButton).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByText('2 total (1 table, 1 view)')).toBeInTheDocument();

        // Collapsed by default: individual table/view rows are not rendered
        expect(screen.queryByText('v_admin_feedback_review')).not.toBeInTheDocument();
        expect(screen.queryByText('discoveryengine_googleapis_com_gemini_enterprise_user_activity')).not.toBeInTheDocument();

        // Expand on click
        fireEvent.click(expandButton);
        expect(screen.getByRole('button', { name: /Hide Tables & Views/i })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('v_admin_feedback_review')).toBeInTheDocument();
        expect(screen.getByText('discoveryengine_googleapis_com_gemini_enterprise_user_activity')).toBeInTheDocument();
        expect(screen.getByText('View')).toBeInTheDocument();
        expect(screen.getByText('Partitioned')).toBeInTheDocument();

        // Collapse again
        fireEvent.click(screen.getByRole('button', { name: /Hide Tables & Views/i }));
        expect(screen.queryByText('v_admin_feedback_review')).not.toBeInTheDocument();
    });

    it('renders the Policy & Telemetry Governance inline tab and switches internal policy sub-tabs', async () => {
        (runBigQueryQuery as any).mockResolvedValue({
            jobComplete: true,
            rows: [
                { f: [{ v: 'summary' }, { v: '10' }, { v: '2' }, { v: '1' }] }
            ]
        });

        render(
            <ToastProvider>
                <ObservabilityPage projectNumber="123" projectId="test-proj" />
            </ToastProvider>
        );

        const policyTab = await screen.findByRole('tab', { name: /Policy & Telemetry Governance/i });
        expect(policyTab).toHaveAttribute('aria-selected', 'false');

        fireEvent.click(policyTab);
        expect(policyTab).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('Agent Observability Policy & Telemetry Governance')).toBeInTheDocument();

        const eventarcSubTab = screen.getByRole('tab', { name: /Option 1: Eventarc Auto-Enabler/i });
        expect(eventarcSubTab).toHaveAttribute('aria-selected', 'false');

        fireEvent.click(eventarcSubTab);
        expect(eventarcSubTab).toHaveAttribute('aria-selected', 'true');
    });

    it('surfaces explicit BigQuery query error banner when runBigQueryQuery fails', async () => {
        (runBigQueryQuery as any).mockRejectedValue(
            new Error('403 Access Denied: User lacks bigquery.jobs.create permission')
        );

        render(
            <ToastProvider>
                <ObservabilityPage projectNumber="123" projectId="test-proj" />
            </ToastProvider>
        );

        expect(await screen.findByText(/403 Access Denied: User lacks bigquery\.jobs\.create permission/i)).toBeInTheDocument();
    });
});
