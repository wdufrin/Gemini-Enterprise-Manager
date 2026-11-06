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

    it('renders a daily latency LineChart spanning the full selected timeRange duration when Trace Latency mode is selected', () => {
        const { rerender } = render(
            <ObservabilityDashboard
                datasetId="analytics_prod"
                customData={{
                    totalRequests: 48,
                    totalSessions: 12,
                    uniqueUsers: 5,
                    uniqueAgents: 1,
                    p50LatencyMs: 1551,
                    p95LatencyMs: 7606,
                    volumeData: [{ time: '11-05 10:00', requests: 48, errors: 0 }],
                    latencyData: [
                        { date: '11-05', rawDate: new Date().toISOString().slice(0, 10), p50: 1551, p95: 7606, count: 8 }
                    ],
                    agentData: [
                        { name: 'Cosmere', id: 'cosmere_1', count: 48, p50: 1551, p95: 7606 }
                    ],
                    queries: {
                        latencyQuery: 'SELECT event_day, p50_latency_ms, p95_latency_ms FROM latency_timeseries'
                    }
                }}
                timeRange={7}
                setTimeRange={vi.fn()}
                isLoading={false}
            />
        );

        // Initially in Message Volume mode
        expect(screen.getByText('Top Agents by Message Volume')).toBeInTheDocument();

        // Switch to Trace Latency (ms) mode
        const latencyBtn = screen.getByTestId('agent-chart-mode-latency');
        fireEvent.click(latencyBtn);

        expect(screen.getByText('Agent Trace Latency Per Day (P50 / P95 ms — 7d)')).toBeInTheDocument();
        expect(screen.getByTestId('latency-duration-badge')).toHaveTextContent(/7d Daily Series/i);

        const series7dJson = screen.getByTestId('latency-series-container').getAttribute('data-series-json');
        expect(series7dJson).toBeTruthy();
        const series7d = JSON.parse(series7dJson!) as Array<{ date: string; p50: number | null; p95: number | null }>;
        expect(series7d).toHaveLength(7);
        const populated7d = series7d.filter((d) => d.p50 !== null || d.p95 !== null);
        const missing7d = series7d.filter((d) => d.p50 === null && d.p95 === null);
        expect(populated7d).toHaveLength(1);
        expect(populated7d[0].p50).toBe(1551);
        expect(populated7d[0].p95).toBe(7606);
        expect(missing7d).toHaveLength(6);

        // Expand timeRange to 30 days and verify the daily latency series spans all 30 days
        rerender(
            <ObservabilityDashboard
                datasetId="analytics_prod"
                customData={{
                    totalRequests: 48,
                    totalSessions: 12,
                    uniqueUsers: 5,
                    uniqueAgents: 1,
                    p50LatencyMs: 1551,
                    p95LatencyMs: 7606,
                    volumeData: [{ time: '2026-11-05', requests: 48, errors: 0 }],
                    latencyData: [
                        { date: '11-05', rawDate: new Date().toISOString().slice(0, 10), p50: 1551, p95: 7606, count: 8 }
                    ],
                    agentData: [
                        { name: 'Cosmere', id: 'cosmere_1', count: 48, p50: 1551, p95: 7606 }
                    ],
                    queries: {
                        latencyQuery: 'SELECT event_day, p50_latency_ms, p95_latency_ms FROM latency_timeseries'
                    }
                }}
                timeRange={30}
                setTimeRange={vi.fn()}
                isLoading={false}
            />
        );

        expect(screen.getByText('Agent Trace Latency Per Day (P50 / P95 ms — 30d)')).toBeInTheDocument();
        expect(screen.getByTestId('latency-duration-badge')).toHaveTextContent(/30d Daily Series/i);

        const series30dJson = screen.getByTestId('latency-series-container').getAttribute('data-series-json');
        const series30d = JSON.parse(series30dJson!) as Array<{ date: string; p50: number | null; p95: number | null }>;
        expect(series30d).toHaveLength(30);
        expect(series30d.filter((d) => d.p50 === null && d.p95 === null)).toHaveLength(29);
    });

    it('renders avgLatency with an explicit (avg) suffix in the Agent Activity Breakdown table and shows no-daily-latency-series when daily latencyData has no non-null points', () => {
        render(
            <ObservabilityDashboard
                datasetId="analytics_prod"
                customData={{
                    totalRequests: 12,
                    totalSessions: 4,
                    uniqueUsers: 2,
                    uniqueAgents: 1,
                    volumeData: [{ time: '10:00', requests: 12, errors: 0 }],
                    latencyData: [
                        { date: '11-05', rawDate: '2026-11-05', p50: null, p95: null, count: 0 }
                    ],
                    agentData: [
                        { name: 'Search Agent', id: 'search_app', count: 12, avgLatency: 840 }
                    ],
                    queries: {}
                }}
                timeRange={7}
                setTimeRange={vi.fn()}
                isLoading={false}
            />
        );

        expect(screen.getByText('840ms (avg)')).toBeInTheDocument();
        expect(screen.queryByText('840ms / 840ms')).not.toBeInTheDocument();

        // Switch to Trace Latency mode when only agent avgLatency exists (no daily latency points)
        fireEvent.click(screen.getByTestId('agent-chart-mode-latency'));
        expect(screen.getByTestId('no-daily-latency-series')).toBeInTheDocument();
        expect(screen.getByTestId('no-daily-latency-series')).toHaveTextContent(
            /No daily trace latency percentiles available for this window/i
        );
    });
});
