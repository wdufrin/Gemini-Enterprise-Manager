import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ObservabilityDashboard from './ObservabilityDashboard';

describe('ObservabilityDashboard', () => {
    it('renders honest empty state and 0 KPIs by default when customData is null (never silent mock charts)', () => {
        render(
            <ObservabilityDashboard
                datasetId={undefined}
                customData={null}
                timeRange={7}
                setTimeRange={vi.fn()}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('observability-empty-state')).toBeInTheDocument();
        expect(screen.getByText(/Live BigQuery Telemetry Not Connected \/ 0 Rows Returned/i)).toBeInTheDocument();

        expect(screen.getByTestId('kpi-total-queries')).toHaveTextContent('0');
        expect(screen.getByTestId('kpi-unique-users')).toHaveTextContent('0');
        expect(screen.getByTestId('kpi-avg-messages')).toHaveTextContent('0.0');
        expect(screen.getByTestId('kpi-used-agents')).toHaveTextContent('0');

        // Must never silently render synthetic numbers or fake agent names
        expect(screen.queryByText('core_assistant')).not.toBeInTheDocument();
        expect(screen.queryByText('support_agent')).not.toBeInTheDocument();
        expect(screen.queryByText('351')).not.toBeInTheDocument();
        expect(screen.queryByText('5.2')).not.toBeInTheDocument();
    });

    it('supports explicit opt-in sample preview mode with clear banner and exit button', () => {
        const onPreviewModeChange = vi.fn();
        render(
            <ObservabilityDashboard
                datasetId="analytics_prod"
                customData={null}
                timeRange={7}
                setTimeRange={vi.fn()}
                isLoading={false}
                onPreviewModeChange={onPreviewModeChange}
            />
        );

        const previewBtn = screen.getByTestId('observability-preview-toggle');
        fireEvent.click(previewBtn);

        expect(onPreviewModeChange).toHaveBeenCalledWith(true);
        expect(screen.getByTestId('observability-simulated-banner')).toBeInTheDocument();
        expect(screen.getByText(/SIMULATED SAMPLE PREVIEW \(OPT-IN\)/i)).toBeInTheDocument();
        expect(screen.getByTestId('kpi-total-queries')).toHaveTextContent('36');

        const exitBtn = screen.getByTestId('observability-preview-exit');
        fireEvent.click(exitBtn);

        expect(onPreviewModeChange).toHaveBeenCalledWith(false);
        expect(screen.queryByTestId('observability-simulated-banner')).not.toBeInTheDocument();
        expect(screen.getByTestId('observability-empty-state')).toBeInTheDocument();
        expect(screen.getByTestId('kpi-total-queries')).toHaveTextContent('0');
    });

    it('renders live BigQuery metrics when customData has active rows and guards zero-session division', () => {
        render(
            <ObservabilityDashboard
                datasetId="analytics_prod"
                customData={{
                    totalRequests: 84,
                    totalSessions: 0,
                    uniqueUsers: 19,
                    uniqueAgents: 2,
                    volumeData: [{ time: '10:00', requests: 84, errors: 0 }],
                    agentData: [
                        { name: 'finops_assistant', id: 'ag-1', count: 50 },
                        { name: 'hr_concierge', id: 'ag-2', count: 34 },
                    ],
                    queries: {
                        summaryQuery: 'SELECT COUNT(*) FROM base_activity',
                    },
                }}
                timeRange={1}
                setTimeRange={vi.fn()}
                isLoading={false}
            />
        );

        expect(screen.queryByTestId('observability-empty-state')).not.toBeInTheDocument();
        expect(screen.getByTestId('kpi-total-queries')).toHaveTextContent('84');
        expect(screen.getByTestId('kpi-unique-users')).toHaveTextContent('19');
        expect(screen.getByTestId('kpi-avg-messages')).toHaveTextContent('0.0');
        expect(screen.getByTestId('kpi-used-agents')).toHaveTextContent('2');
    });

    it('renders observability-empty-state, Expand to 30 Days, and a single preview toggle when customData is a non-null 0-row object', () => {
        const setTimeRange = vi.fn();
        render(
            <ObservabilityDashboard
                datasetId="analytics_prod"
                customData={{
                    totalRequests: 0,
                    totalSessions: 0,
                    uniqueUsers: 0,
                    volumeData: [],
                    agentData: [],
                    queries: {},
                }}
                timeRange={7}
                setTimeRange={setTimeRange}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('observability-empty-state')).toBeInTheDocument();
        expect(screen.getByText(/Live BigQuery Telemetry Not Connected \/ 0 Rows Returned/i)).toBeInTheDocument();
        expect(screen.getByText(/No Live Telemetry Found in Current Window/i)).toBeInTheDocument();
        expect(screen.getAllByTestId('observability-preview-toggle')).toHaveLength(1);

        const expandBtn = screen.getByRole('button', { name: /Expand to 30 Days/i });
        fireEvent.click(expandBtn);
        expect(setTimeRange).toHaveBeenCalledWith(30);
    });
});
