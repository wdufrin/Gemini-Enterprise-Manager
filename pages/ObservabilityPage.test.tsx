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
    default: ({
        customData,
        setTimeRange
    }: {
        customData?: {
            totalRequests?: number | string;
            p50LatencyMs?: number;
            p95LatencyMs?: number;
            volumeData?: Array<{ time: string; requests: number }>;
            latencyData?: Array<{ date: string; rawDate?: string; p50: number | null; p95: number | null }>;
            agentData?: Array<{ name: string; count: number; avgLatency?: number; p50?: number; p95?: number }>;
        };
        setTimeRange?: (days: number) => void;
    }) => (
        <div data-testid="dashboard">
            <button type="button" data-testid="set-range-7d" onClick={() => setTimeRange?.(7)}>7d</button>
            <span>Total Requests: {customData?.totalRequests ?? 'Loading...'}</span>
            {customData?.p50LatencyMs !== undefined && (
                <span data-testid="summary-p50">P50: {customData.p50LatencyMs}ms</span>
            )}
            {customData?.p95LatencyMs !== undefined && (
                <span data-testid="summary-p95">P95: {customData.p95LatencyMs}ms</span>
            )}
            {customData?.volumeData && (
                <span data-testid="volume-order">
                    {customData.volumeData.map((v) => v.time).join(',')}
                </span>
            )}
            {customData?.latencyData && (
                <span data-testid="latency-days-count">
                    Days:{customData.latencyData.length}
                </span>
            )}
            {customData?.latencyData?.map((d) => (
                <span key={d.rawDate || d.date} data-testid={`latency-day-${d.rawDate || d.date}`}>
                    {d.date}:{d.p50}:{d.p95}
                </span>
            ))}
            {customData?.agentData?.map((a) => (
                <span key={a.name} data-testid={`agent-${a.name}`}>
                    {a.name}:{a.count}:{a.avgLatency ?? 'none'}:{a.p50 ?? 'none'}:{a.p95 ?? 'none'}
                </span>
            ))}
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
        vi.mocked(listLoggingSinks).mockResolvedValue({
            sinks: [{ name: 'test-sink', destination: 'bigquery.googleapis.com/projects/test/datasets/my_dataset' }]
        });
        vi.mocked(listBigQueryTables).mockResolvedValue({
            tables: [
                { tableReference: { projectId: 'test-proj', datasetId: 'my_dataset', tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity' }, type: 'TABLE' },
                { tableReference: { projectId: 'test-proj', datasetId: 'my_dataset', tableId: 'v_admin_feedback_review' }, type: 'VIEW' }
            ]
        });
    });

    it('polls BigQuery when jobComplete is false', async () => {
        vi.mocked(runBigQueryQuery).mockResolvedValue({
            jobComplete: false,
            jobReference: { projectId: 'test-proj', jobId: 'job-123', location: 'US' }
        });

        vi.mocked(gapiRequest).mockResolvedValue({
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
        vi.mocked(runBigQueryQuery).mockResolvedValue({
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
        vi.mocked(runBigQueryQuery).mockResolvedValue({
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
        vi.mocked(runBigQueryQuery).mockRejectedValue(
            new Error('403 Access Denied: User lacks bigquery.jobs.create permission')
        );

        render(
            <ToastProvider>
                <ObservabilityPage projectNumber="123" projectId="test-proj" />
            </ToastProvider>
        );

        expect(await screen.findByText(/403 Access Denied: User lacks bigquery\.jobs\.create permission/i)).toBeInTheDocument();
    });

    it('queries trace_latencies & latency_timeseries, builds a full daily latency spine spanning timeRange, sorts volumeData chronologically, and ignores malformed rows', async () => {
        const todayIso = new Date().toISOString().slice(0, 10);

        vi.mocked(listBigQueryTables).mockResolvedValue({
            tables: [
                {
                    tableReference: {
                        projectId: 'test-proj',
                        datasetId: 'my_dataset',
                        tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity'
                    },
                    type: 'TABLE'
                },
                {
                    tableReference: {
                        projectId: 'test-proj',
                        datasetId: 'my_dataset',
                        tableId: 'discoveryengine_googleapis_com_gen_ai_client_inference_operation_details'
                    },
                    type: 'TABLE'
                }
            ]
        });

        vi.mocked(runBigQueryQuery).mockResolvedValue({
            jobComplete: true,
            rows: [
                {
                    f: [
                        { v: 'summary' },
                        { v: '120' },
                        { v: '30' },
                        { v: '12' },
                        { v: '1450' },
                        { v: '4800' },
                        { v: null }
                    ]
                },
                {
                    // Scrambled volume timestamps that must be sorted chronologically
                    f: [{ v: 'volume' }, { v: '11-05 22:00' }, { v: '4' }]
                },
                {
                    f: [{ v: 'volume' }, { v: '10-30 14:00' }, { v: '1' }]
                },
                {
                    f: [{ v: 'volume' }, { v: '11-04 06:00' }, { v: '2' }]
                },
                {
                    f: [
                        { v: 'latency_daily' },
                        { v: todayIso },
                        { v: '1551' },
                        { v: '7606' },
                        { v: '8' }
                    ]
                },
                {
                    // Adversarial latency_daily rows with invalid date or non-numeric latencies
                    f: [
                        { v: 'latency_daily' },
                        { v: 'NOT_A_DATE' },
                        { v: '999' },
                        { v: '1999' },
                        { v: '2' }
                    ]
                },
                {
                    f: [
                        { v: 'latency_daily' },
                        { v: '2026-10-31' },
                        { v: 'NaN_VAL' },
                        { v: '' },
                        { v: null }
                    ]
                },
                {
                    f: [
                        { v: 'agent' },
                        { v: 'Cosmere' },
                        { v: '85' },
                        { v: 'cosmere_id' },
                        { v: '1620' },
                        { v: '1400' },
                        { v: '4500' }
                    ]
                },
                {
                    // Adversarial row with non-numeric / null latency values
                    f: [
                        { v: 'agent' },
                        { v: 'SearchAgent' },
                        { v: '35' },
                        { v: 'search_id' },
                        { v: 'NOT_A_NUMBER' },
                        { v: '' },
                        { v: null }
                    ]
                }
            ]
        });

        render(
            <ToastProvider>
                <ObservabilityPage projectNumber="123" projectId="test-proj" />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('dashboard')).toHaveTextContent('Total Requests: 120');
        });

        expect(screen.getByTestId('summary-p50')).toHaveTextContent('P50: 1450ms');
        expect(screen.getByTestId('summary-p95')).toHaveTextContent('P95: 4800ms');
        expect(screen.getByTestId('volume-order')).toHaveTextContent('10-30 14:00,11-04 06:00,11-05 22:00');
        expect(screen.getByTestId(`latency-day-${todayIso}`)).toHaveTextContent(`${todayIso.slice(5)}:1551:7606`);
        expect(screen.queryByTestId('latency-day-NOT_A_DATE')).not.toBeInTheDocument();
        expect(screen.queryByTestId('latency-day-2026-10-31')).not.toBeInTheDocument();
        expect(screen.getByTestId('agent-Cosmere')).toHaveTextContent('Cosmere:85:1620:1400:4500');
        expect(screen.getByTestId('agent-SearchAgent')).toHaveTextContent('SearchAgent:35:none:none:none');

        const executedSql = vi.mocked(runBigQueryQuery).mock.calls[0]?.[1] || '';
        expect(executedSql).toContain('trace_latencies AS');
        expect(executedSql).toContain('MAX(IF(is_end_span, event_time, NULL))');
        expect(executedSql).toContain('ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW');
        expect(executedSql).toContain('latency_timeseries AS');
        expect(executedSql).toContain("SELECT 'latency_daily' as metric_type");
        expect(executedSql).toContain('discoveryengine_googleapis_com_gen_ai_client_inference_operation_details');
        expect(executedSql).toContain('distinct_agent_traces AS');
        expect(executedSql).toContain('APPROX_QUANTILES(latency_ms, 100)[OFFSET(95)]');
        expect(executedSql).not.toContain("method_name IN ('StreamAssist', 'Assist', 'Search', 'WriteUserEvent')");
    });

    it('builds a 7-day latencyData spine with null quantiles for missing days and preserves partial quantiles when BigQuery returns sparse latency_daily rows', async () => {
        const today = new Date();
        const todayIso = today.toISOString().slice(0, 10);
        const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
        const twoDaysAgoIso = twoDaysAgo.toISOString().slice(0, 10);
        const fourDaysAgo = new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000);
        const fourDaysAgoIso = fourDaysAgo.toISOString().slice(0, 10);

        vi.mocked(runBigQueryQuery).mockResolvedValue({
            jobComplete: true,
            rows: [
                {
                    f: [
                        { v: 'summary' },
                        { v: '25' },
                        { v: '10' },
                        { v: '4' },
                        { v: '1200' },
                        { v: '3400' },
                        { v: null }
                    ]
                },
                {
                    f: [
                        { v: 'latency_daily' },
                        { v: todayIso },
                        { v: '1551' },
                        { v: '7606' },
                        { v: '8' }
                    ]
                },
                {
                    // Partial quantile row: p50 present, p95 null
                    f: [
                        { v: 'latency_daily' },
                        { v: twoDaysAgoIso },
                        { v: '920' },
                        { v: null },
                        { v: '1' }
                    ]
                }
            ]
        });

        render(
            <ToastProvider>
                <ObservabilityPage projectNumber="123" projectId="test-proj" />
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('dashboard')).toHaveTextContent('Total Requests: 25');
        });

        fireEvent.click(screen.getByTestId('set-range-7d'));

        await waitFor(() => {
            expect(screen.getByTestId('latency-days-count')).toHaveTextContent('Days:7');
        });
        expect(screen.getByTestId(`latency-day-${todayIso}`)).toHaveTextContent(`${todayIso.slice(5)}:1551:7606`);
        expect(screen.getByTestId(`latency-day-${twoDaysAgoIso}`)).toHaveTextContent(`${twoDaysAgoIso.slice(5)}:920:`);
        expect(screen.getByTestId(`latency-day-${fourDaysAgoIso}`)).toHaveTextContent(`${fourDaysAgoIso.slice(5)}::`);
    });

    it('surfaces BigQuery result.error payloads when runBigQueryQuery resolves with an embedded error', async () => {
        vi.mocked(runBigQueryQuery).mockResolvedValue({
            error: { message: 'Unrecognized name: invalid_column at [12:5]' }
        } as unknown as Awaited<ReturnType<typeof runBigQueryQuery>>);

        render(
            <ToastProvider>
                <ObservabilityPage projectNumber="123" projectId="test-proj" />
            </ToastProvider>
        );

        expect(await screen.findByText(/Unrecognized name: invalid_column/i)).toBeInTheDocument();
    });

    describe('High-Scale Acceleration', () => {
        const UA_TABLE = 'discoveryengine_googleapis_com_gemini_enterprise_user_activity';
        const ACCEL = 'gem_accel_user_activity';
        const tableEntry = (tableId: string) => ({
            tableReference: { projectId: 'test-proj', datasetId: 'my_dataset', tableId },
            type: 'TABLE'
        });
        const summaryRow = { f: [{ v: 'summary' }, { v: '77' }, { v: '5' }, { v: '3' }] };

        it('reads activity ONLY from the acceleration table (no raw-log JSON) and caps latency spans at the watermark', async () => {
            const watermark = new Date(Date.now() - 3 * 3600 * 1000);
            vi.mocked(listBigQueryTables).mockResolvedValue({ tables: [tableEntry(UA_TABLE), tableEntry(ACCEL)] });
            vi.mocked(runBigQueryQuery).mockImplementation(async (_p: string, sql: string) => {
                if (sql.startsWith('SELECT MAX(event_time) AS watermark')) {
                    return { rows: [{ f: [{ v: String(watermark.getTime() / 1000) }] }] };
                }
                return { jobComplete: true, rows: [summaryRow] };
            });

            render(
                <ToastProvider>
                    <ObservabilityPage projectNumber="123" projectId="test-proj" />
                </ToastProvider>
            );

            await waitFor(() => {
                expect(screen.getByTestId('dashboard')).toHaveTextContent('Total Requests: 77');
            });
            const mainSql = vi.mocked(runBigQueryQuery).mock.calls.map((c) => c[1]).find((q) => q.includes('summary_metrics'))!;
            expect(mainSql).toContain(`FROM \`test-proj.my_dataset.${ACCEL}\``);
            expect(mainSql).not.toContain(`\`test-proj.my_dataset.${UA_TABLE}\``);
            expect(mainSql).not.toContain('raw_activity');
            expect(mainSql).not.toContain('TO_JSON_STRING(jsonPayload)');
            expect(screen.getByTestId('acceleration-status-badge')).toHaveTextContent('ON');
            expect(screen.getByTestId('acceleration-freshness')).toHaveTextContent(
                `Charts show events through ${watermark.toISOString().slice(0, 16).replace('T', ' ')} UTC (last refresh)`
            );
            expect(screen.queryByTestId('acceleration-window-warning')).not.toBeInTheDocument();
        });

        it('caps AI inference latency spans at the watermark and warns when the selected window starts after the last refresh', async () => {
            const INF_TABLE = 'discoveryengine_googleapis_com_gen_ai_client_inference_operation_details';
            const staleWatermark = new Date(Date.now() - 3 * 86400 * 1000);
            vi.mocked(listBigQueryTables).mockResolvedValue({
                tables: [tableEntry(UA_TABLE), tableEntry(INF_TABLE), tableEntry(ACCEL)]
            });
            vi.mocked(runBigQueryQuery).mockImplementation(async (_p: string, sql: string) => {
                if (sql.startsWith('SELECT MAX(event_time) AS watermark')) {
                    return { rows: [{ f: [{ v: String(staleWatermark.getTime() / 1000) }] }] };
                }
                return { jobComplete: true, rows: [summaryRow] };
            });

            render(
                <ToastProvider>
                    <ObservabilityPage projectNumber="123" projectId="test-proj" />
                </ToastProvider>
            );

            expect(await screen.findByTestId('acceleration-window-warning')).toHaveTextContent(
                /selected time range starts after the last refresh/
            );
            const mainSql = vi.mocked(runBigQueryQuery).mock.calls.map((c) => c[1]).find((q) => q.includes('summary_metrics'))!;
            expect(mainSql).toContain(`\`test-proj.my_dataset.${INF_TABLE}\``);
            expect(mainSql).toContain(`AND timestamp <= TIMESTAMP('${staleWatermark.toISOString()}')`);
            expect(mainSql).not.toContain(`\`test-proj.my_dataset.${UA_TABLE}\``);
        });

        it('shows the watermark error and falls back to raw logs when the acceleration table cannot be read', async () => {
            vi.mocked(listBigQueryTables).mockResolvedValue({ tables: [tableEntry(UA_TABLE), tableEntry(ACCEL)] });
            vi.mocked(runBigQueryQuery).mockImplementation(async (_p: string, sql: string) => {
                if (sql.startsWith('SELECT MAX(event_time) AS watermark')) {
                    return { error: { message: 'Access Denied: Table gem_accel_user_activity' } };
                }
                return { jobComplete: true, rows: [summaryRow] };
            });

            render(
                <ToastProvider>
                    <ObservabilityPage projectNumber="123" projectId="test-proj" />
                </ToastProvider>
            );

            expect(await screen.findByTestId('acceleration-error')).toHaveTextContent(
                /Access Denied: Table gem_accel_user_activity.*showing data from raw logs instead/
            );
            await waitFor(() => {
                expect(screen.getByTestId('dashboard')).toHaveTextContent('Total Requests: 77');
            });
            const mainSql = vi.mocked(runBigQueryQuery).mock.calls.map((c) => c[1]).find((q) => q.includes('summary_metrics'))!;
            expect(mainSql).not.toContain(ACCEL);
            expect(mainSql).toContain(`\`test-proj.my_dataset.${UA_TABLE}\``);
        });

        it('runs exactly one MERGE per Refresh press even when clicked twice, then re-queries the dashboard', async () => {
            const watermark = new Date(Date.now() - 3 * 3600 * 1000);
            let releaseMerge: (() => void) | null = null;
            vi.mocked(listBigQueryTables).mockResolvedValue({ tables: [tableEntry(UA_TABLE), tableEntry(ACCEL)] });
            vi.mocked(runBigQueryQuery).mockImplementation(async (_p: string, sql: string) => {
                if (sql.startsWith('SELECT MAX(event_time) AS watermark')) {
                    return { rows: [{ f: [{ v: String(watermark.getTime() / 1000) }] }] };
                }
                if (sql.startsWith('MERGE')) {
                    await new Promise<void>((resolve) => {
                        releaseMerge = resolve;
                    });
                    return { numDmlAffectedRows: '42' };
                }
                return { jobComplete: true, rows: [summaryRow] };
            });

            render(
                <ToastProvider>
                    <ObservabilityPage projectNumber="123" projectId="test-proj" />
                </ToastProvider>
            );
            await waitFor(() => {
                expect(screen.getByTestId('dashboard')).toHaveTextContent('Total Requests: 77');
            });
            const mainQueriesBefore = vi.mocked(runBigQueryQuery).mock.calls.filter((c) => c[1].includes('summary_metrics')).length;

            const refreshBtn = screen.getByTestId('acceleration-refresh-btn');
            fireEvent.click(refreshBtn);
            fireEvent.click(refreshBtn);

            await waitFor(() => expect(releaseMerge).not.toBeNull());
            expect(screen.getByTestId('acceleration-refresh-btn')).toBeDisabled();
            expect(screen.getByTestId('acceleration-refresh-btn')).toHaveTextContent('Refreshing…');
            (releaseMerge as unknown as () => void)();

            expect(await screen.findByTestId('acceleration-last-result')).toHaveTextContent('Last refresh added 42 event(s).');
            const merges = vi.mocked(runBigQueryQuery).mock.calls.filter((c) => c[1].startsWith('MERGE'));
            expect(merges).toHaveLength(1);
            expect(merges[0][1]).toContain(`\`test-proj.my_dataset.${UA_TABLE}\``);
            await waitFor(() => {
                expect(
                    vi.mocked(runBigQueryQuery).mock.calls.filter((c) => c[1].includes('summary_metrics')).length
                ).toBeGreaterThan(mainQueriesBefore);
            });
        });

        it('Enable creates the table, backfills, and reloads the table list; it never runs without a click', async () => {
            vi.mocked(listBigQueryTables).mockResolvedValue({ tables: [tableEntry(UA_TABLE)] });
            vi.mocked(runBigQueryQuery).mockImplementation(async (_p: string, sql: string) => {
                if (sql.startsWith('SELECT MAX(event_time) AS watermark')) return { rows: [{ f: [{ v: null }] }] };
                if (sql.startsWith('MERGE')) return { numDmlAffectedRows: '9' };
                if (sql.startsWith('CREATE TABLE')) return {};
                return { jobComplete: true, rows: [summaryRow] };
            });

            render(
                <ToastProvider>
                    <ObservabilityPage projectNumber="123" projectId="test-proj" />
                </ToastProvider>
            );
            await waitFor(() => {
                expect(screen.getByTestId('dashboard')).toHaveTextContent('Total Requests: 77');
            });
            expect(screen.getByTestId('acceleration-status-badge')).toHaveTextContent('OFF');
            const sqlsBefore = vi.mocked(runBigQueryQuery).mock.calls.map((c) => c[1]);
            expect(sqlsBefore.some((q) => q.startsWith('CREATE TABLE') || q.startsWith('MERGE') || q.includes(ACCEL))).toBe(false);

            const listCallsBefore = vi.mocked(listBigQueryTables).mock.calls.length;
            fireEvent.click(screen.getByTestId('acceleration-enable-btn'));

            expect(await screen.findByTestId('acceleration-last-result')).toHaveTextContent('Last refresh added 9 event(s).');
            const sqls = vi.mocked(runBigQueryQuery).mock.calls.map((c) => c[1]);
            expect(sqls.filter((q) => q.startsWith('CREATE TABLE IF NOT EXISTS'))).toHaveLength(1);
            expect(sqls.filter((q) => q.startsWith('MERGE'))).toHaveLength(1);
            expect(vi.mocked(listBigQueryTables).mock.calls.length).toBeGreaterThan(listCallsBefore);
        });

        it('shows a failed Refresh error and re-enables the button', async () => {
            vi.mocked(listBigQueryTables).mockResolvedValue({ tables: [tableEntry(UA_TABLE), tableEntry(ACCEL)] });
            vi.mocked(runBigQueryQuery).mockImplementation(async (_p: string, sql: string) => {
                if (sql.startsWith('SELECT MAX(event_time) AS watermark')) {
                    return { rows: [{ f: [{ v: String((Date.now() - 3600_000) / 1000) }] }] };
                }
                if (sql.startsWith('MERGE')) return { error: { message: 'Access Denied: bigquery.tables.updateData' } };
                return { jobComplete: true, rows: [summaryRow] };
            });

            render(
                <ToastProvider>
                    <ObservabilityPage projectNumber="123" projectId="test-proj" />
                </ToastProvider>
            );
            await waitFor(() => {
                expect(screen.getByTestId('dashboard')).toHaveTextContent('Total Requests: 77');
            });
            fireEvent.click(screen.getByTestId('acceleration-refresh-btn'));

            expect(await screen.findByTestId('acceleration-error')).toHaveTextContent(
                'Refreshing acceleration table failed: Access Denied: bigquery.tables.updateData'
            );
            expect(screen.getByTestId('acceleration-refresh-btn')).not.toBeDisabled();
            expect(screen.queryByTestId('acceleration-last-result')).not.toBeInTheDocument();
        });
    });
});
