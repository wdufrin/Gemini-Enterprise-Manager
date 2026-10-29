import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OperationalAnalyticsDashboard } from './OperationalAnalyticsDashboard';
import * as apiService from '../../../services/apiService';

vi.mock('../../../services/apiService', () => ({
    runBigQueryQuery: vi.fn(),
    listLoggingSinks: vi.fn(),
    listBigQueryTables: vi.fn()
}));

describe('OperationalAnalyticsDashboard', () => {
    const mockTables = [
        { tableReference: { tableId: 'v_consolidated_user_activity' } },
        { tableReference: { tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' } }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        window.location.hash = '';
        sessionStorage.clear();
        (apiService.runBigQueryQuery as any).mockResolvedValue({ rows: [] });
    });

    it('renders KPI summary cards and category filters', () => {
        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        expect(screen.getByText('Extended Operational Analytics')).toBeInTheDocument();
        expect(screen.getByText('Total Interactions')).toBeInTheDocument();
        expect(screen.getByText('Telemetry Events')).toBeInTheDocument();
        expect(screen.getByText('Active Connectors')).toBeInTheDocument();

        expect(screen.getByText('All Analytics Views')).toBeInTheDocument();
        expect(screen.getByText('GenAI Telemetry & Tokens')).toBeInTheDocument();
        expect(screen.getByText('Connector Usage')).toBeInTheDocument();
    });

    it('shows Live View for installed views and MOCK for missing views', () => {
        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        // v_consolidated_user_activity is in mockTables -> Live View
        const liveBadges = screen.getAllByText('Live View');
        expect(liveBadges.length).toBeGreaterThanOrEqual(1);

        // v_gemini_genai_telemetry is not in mockTables -> MOCK
        const mockBadges = screen.getAllByText('MOCK');
        expect(mockBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('calls runBigQueryQuery when Add View to BigQuery is clicked', async () => {
        (apiService.runBigQueryQuery as any).mockResolvedValueOnce({ kind: 'bigquery#queryResponse' });
        const onRefreshTables = vi.fn().mockResolvedValue(undefined);

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
                onRefreshTables={onRefreshTables}
            />
        );

        // Find an "Add View to BigQuery" button
        const addButtons = screen.getAllByRole('button', { name: /Add View to BigQuery/i });
        expect(addButtons.length).toBeGreaterThanOrEqual(1);

        fireEvent.click(addButtons[0]);

        await waitFor(() => {
            expect(apiService.runBigQueryQuery).toHaveBeenCalledWith(
                'test-project',
                expect.stringContaining('CREATE OR REPLACE VIEW `test-project.test_dataset.')
            );
            expect(onRefreshTables).toHaveBeenCalled();
        });
    });

    it('calls runBigQueryQuery to drop view after confirmation', async () => {
        (apiService.runBigQueryQuery as any).mockResolvedValueOnce({ kind: 'bigquery#queryResponse' });
        const onRefreshTables = vi.fn().mockResolvedValue(undefined);

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
                onRefreshTables={onRefreshTables}
            />
        );

        // Click Drop View on the installed view
        const dropButton = screen.getByRole('button', { name: /Drop View/i });
        fireEvent.click(dropButton);

        // Confirm button "Yes"
        const confirmYes = screen.getByRole('button', { name: 'Yes' });
        fireEvent.click(confirmYes);

        await waitFor(() => {
            expect(apiService.runBigQueryQuery).toHaveBeenCalledWith(
                'test-project',
                'DROP VIEW IF EXISTS `test-project.test_dataset.v_consolidated_user_activity`;'
            );
            expect(onRefreshTables).toHaveBeenCalled();
            expect(screen.getByText(/Successfully dropped view/i)).toBeInTheDocument();
            expect(screen.queryByText(/schema errors in BigQuery/i)).not.toBeInTheDocument();
            expect(screen.queryByText('VIEW ERROR')).not.toBeInTheDocument();
        });
    });

    it('filters charts when category pill is selected', () => {
        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        // Filter to Connector Usage
        fireEvent.click(screen.getByText('Connector Usage'));

        expect(screen.getByText('Connector Usage (Rolling 30 Days)')).toBeInTheDocument();
        expect(screen.queryByText('GenAI Telemetry & Token Consumption')).not.toBeInTheDocument();
    });

    it('displays EmptyChartState for live views that have 0 records instead of mock data', async () => {
        (apiService.runBigQueryQuery as any).mockResolvedValue({ rows: [] });

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('No interaction records found')).toBeInTheDocument();
            expect(screen.getByText('The live view is connected in BigQuery, but returned 0 events.')).toBeInTheDocument();
        });
    });

    it('navigates to dedicated GenAI Telemetry view, renders DataTable, and opens DetailDrawer on row click', async () => {
        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        // Select GenAI Telemetry from top-bar unified view selector
        const viewSelect = screen.getByRole('combobox', { name: /Select Operational View/i });
        fireEvent.change(viewSelect, { target: { value: 'v_gemini_genai_telemetry' } });

        // Expect to see the dedicated view with Tool Calls Populated KPI and DataTable
        expect(screen.getByText('Tool Calls Populated')).toBeInTheDocument();
        expect(screen.getByText('GenAI Telemetry & Tool Invocations Records')).toBeInTheDocument();
        expect(screen.getByText('Back to Global Overview')).toBeInTheDocument();

        // Search input is rendered in DataTable
        expect(screen.getByPlaceholderText(/Search rows/i)).toBeInTheDocument();

        // Find and click a table row to open DetailDrawer
        const promptCells = await screen.findAllByText(/What is Mr. Whiskers Stage Name\?/i);
        expect(promptCells.length).toBeGreaterThan(0);
        fireEvent.click(promptCells[0]);

        // Detail drawer should open with Copy JSON button
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Copy JSON/i })).toBeInTheDocument();
            expect(screen.getByText(/Deep inspection of row attributes & payloads/i)).toBeInTheDocument();
        });

        // Click Back to Global Overview
        fireEvent.click(screen.getByText('Back to Global Overview'));
        expect(screen.getByText('Extended Operational Analytics')).toBeInTheDocument();
        expect(screen.getByText('Total Interactions')).toBeInTheDocument();
    });

    it('switches to v_admin_feedback_review view cleanly without corrupting the router hash', async () => {
        window.location.hash = '#/observability';
        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        const viewSelect = screen.getByRole('combobox', { name: /Select Operational View/i });
        fireEvent.change(viewSelect, { target: { value: 'v_admin_feedback_review' } });

        expect(screen.getByText('Admin Feedback Review Records')).toBeInTheDocument();
        expect(window.location.hash).not.toBe('#v_admin_feedback_review');
        expect(window.location.hash).toBe('#/observability?view=v_admin_feedback_review');
        expect(sessionStorage.getItem('agentspace-observability-view')).toBe('v_admin_feedback_review');
    });

    it('generates view DDLs without trailing _* when tables are time-partitioned or no _YYYYMMDD fragments exist, and uses _* only when date-sharded fragments exist', async () => {
        const { OPERATIONAL_VIEWS, resolveSinkTable, USER_ACTIVITY_TABLE } = await import('./analyticsData');

        // 1. Brand-new log sink (no fragments yet) or time-partitioned table -> NO trailing _*
        const partitionedTables = new Set([USER_ACTIVITY_TABLE]);
        const partitionedResolved = resolveSinkTable('g7372485-eap-dev-154850-a0', 'gesynclogs', USER_ACTIVITY_TABLE, partitionedTables);
        expect(partitionedResolved.isWildcard).toBe(false);
        expect(partitionedResolved.tableRef).toBe('`g7372485-eap-dev-154850-a0.gesynclogs.discoveryengine_googleapis_com_gemini_enterprise_user_activity`');

        const emptyTables = new Set<string>();
        const emptyResolved = resolveSinkTable('g7372485-eap-dev-154850-a0', 'gesynclogs', USER_ACTIVITY_TABLE, emptyTables);
        expect(emptyResolved.isWildcard).toBe(false);
        expect(emptyResolved.tableRef).not.toContain('_*');

        // Verify all non-rollup views generate DDL without trailing _* when no fragments exist
        for (const view of Object.values(OPERATIONAL_VIEWS)) {
            const ddl = view.getDdl('g7372485-eap-dev-154850-a0', 'gesynclogs', partitionedTables);
            expect(ddl).not.toContain('discoveryengine_googleapis_com_gemini_enterprise_user_activity_*');
            expect(ddl).not.toContain('discoveryengine_googleapis_com_gen_ai_user_message_*');
            expect(ddl).not.toContain('discoveryengine_googleapis_com_gen_ai_choice_*');
            expect(ddl).not.toContain('discoveryengine_googleapis_com_gen_ai_client_inference_operation_details_*');
            expect(ddl).not.toContain('_TABLE_SUFFIX');
        }

        // 2. Legacy date-sharded sink tables -> uses _* and _TABLE_SUFFIX
        const shardedTables = new Set([`${USER_ACTIVITY_TABLE}_20260801`]);
        const shardedResolved = resolveSinkTable('g7372485-eap-dev-154850-a0', 'gesynclogs', USER_ACTIVITY_TABLE, shardedTables);
        expect(shardedResolved.isWildcard).toBe(true);
        expect(shardedResolved.tableRef).toBe('`g7372485-eap-dev-154850-a0.gesynclogs.discoveryengine_googleapis_com_gemini_enterprise_user_activity_*`');

        const activityView = OPERATIONAL_VIEWS['v_consolidated_user_activity'];
        const shardedActivityDdl = activityView.getDdl('g7372485-eap-dev-154850-a0', 'gesynclogs', shardedTables);
        expect(shardedActivityDdl).toContain('`g7372485-eap-dev-154850-a0.gesynclogs.discoveryengine_googleapis_com_gemini_enterprise_user_activity_*`');

        const shardedMessageTables = new Set(['discoveryengine_googleapis_com_gen_ai_user_message_20260801']);
        const messagesView = OPERATIONAL_VIEWS['v_consolidated_user_messages'];
        const shardedMessagesDdl = messagesView.getDdl('g7372485-eap-dev-154850-a0', 'gesynclogs', shardedMessageTables);
        expect(shardedMessagesDdl).toContain('`g7372485-eap-dev-154850-a0.gesynclogs.discoveryengine_googleapis_com_gen_ai_user_message_*`');
        expect(shardedMessagesDdl).toContain('_TABLE_SUFFIX AS table_date');
    });

    it('falls back to toggling wildcard and empty schema-compatible view DDL when BigQuery reports "does not match any table" or "Not found: Table"', async () => {
        const onRefreshTables = vi.fn().mockResolvedValue(undefined);
        // Simulate first query failing with wildcard error, second query failing with table not found (brand-new sink with 0 logs), third query succeeding with empty view DDL
        (apiService.runBigQueryQuery as any)
            .mockRejectedValueOnce(new Error('g7372485-eap-dev-154850-a0:gesynclogs.discoveryengine_googleapis_com_gen_ai_user_message_* does not match any table.'))
            .mockRejectedValueOnce(new Error('Not found: Table g7372485-eap-dev-154850-a0:gesynclogs.discoveryengine_googleapis_com_gen_ai_user_message was not found'))
            .mockResolvedValue({ kind: 'bigquery#queryResponse', rows: [] });

        render(
            <OperationalAnalyticsDashboard
                projectId="g7372485-eap-dev-154850-a0"
                projectNumber="123456"
                datasetId="gesynclogs"
                tables={[]}
                onRefreshTables={onRefreshTables}
            />
        );

        const addButtons = screen.getAllByRole('button', { name: /Add View to BigQuery/i });
        fireEvent.click(addButtons[0]);

        await waitFor(() => {
            const createViewCalls = (apiService.runBigQueryQuery as any).mock.calls.filter(
                (call: [string, string]) => call[1].includes('CREATE OR REPLACE VIEW')
            );
            expect(createViewCalls.length).toBe(3);
            expect(createViewCalls[2][1]).toContain('FROM (SELECT 1) WHERE FALSE');
            expect(onRefreshTables).toHaveBeenCalled();
            expect(screen.getByText(/Successfully created view/i)).toBeInTheDocument();
        });
    });

    it('displays active query progress banner while BigQuery view queries are running', async () => {
        let resolveQuery: ((val: unknown) => void) | null = null;
        (apiService.runBigQueryQuery as any).mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveQuery = resolve;
                })
        );

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        expect(await screen.findByTestId('operational-query-progress-banner')).toBeInTheDocument();
        expect(screen.getByTestId('operational-query-running-badge')).toHaveTextContent(/Running Queries/i);

        // Resolve queries and verify banner disappears
        (apiService.runBigQueryQuery as any).mockResolvedValue({ rows: [] });
        if (resolveQuery) {
            (resolveQuery as (val: unknown) => void)({ rows: [] });
        }

        await waitFor(() => {
            expect(screen.queryByTestId('operational-query-progress-banner')).not.toBeInTheDocument();
        });
    });

    it('validates schemas and views and reports healthy status when all required columns and views pass', async () => {
        (apiService.runBigQueryQuery as any).mockImplementation(async (_proj: string, sql: string) => {
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return {
                    rows: [
                        { f: [{ v: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' }, { v: 'timestamp' }, { v: 'TIMESTAMP' }] },
                        { f: [{ v: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' }, { v: 'jsonPayload' }, { v: 'RECORD' }] },
                        { f: [{ v: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' }, { v: 'trace' }, { v: 'STRING' }] },
                        { f: [{ v: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' }, { v: 'insertId' }, { v: 'STRING' }] }
                    ]
                };
            }
            if (sql.includes('INFORMATION_SCHEMA.VIEWS')) {
                return {
                    rows: [
                        {
                            f: [
                                { v: 'v_consolidated_user_activity' },
                                { v: 'SELECT * FROM `test-project.test_dataset.discoveryengine_googleapis_com_gemini_enterprise_user_activity_*`' }
                            ]
                        }
                    ]
                };
            }
            return { rows: [] };
        });

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        const validateBtn = screen.getByRole('button', { name: /Validate Schemas & Views/i });
        fireEvent.click(validateBtn);

        const report = await screen.findByTestId('schema-validation-report');
        expect(report).toHaveTextContent('All Schemas & Views Healthy');
        expect(report).toHaveTextContent(/Checked 1 base table\(s\) & 1 deployed view\(s\)/i);
    });

    it('detects missing base table columns, stale WHERE FALSE placeholder views, and broken view schemas during validation', async () => {
        (apiService.runBigQueryQuery as any).mockImplementation(async (_proj: string, sql: string) => {
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
                // Missing jsonPayload and trace columns
                return {
                    rows: [
                        { f: [{ v: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' }, { v: 'timestamp' }, { v: 'TIMESTAMP' }] },
                        { f: [{ v: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' }, { v: 'insertId' }, { v: 'STRING' }] }
                    ]
                };
            }
            if (sql.includes('INFORMATION_SCHEMA.VIEWS')) {
                return {
                    rows: [
                        {
                            f: [
                                { v: 'v_consolidated_user_activity' },
                                { v: 'SELECT CAST(NULL AS TIMESTAMP) AS event_time FROM (SELECT 1) WHERE FALSE' }
                            ]
                        }
                    ]
                };
            }
            if (sql.includes('LIMIT 0')) {
                return {
                    error: { message: 'Unrecognized name: legacy_field at [1:15]' }
                };
            }
            return { rows: [] };
        });

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        const validateBtn = screen.getByRole('button', { name: /Validate Schemas & Views/i });
        fireEvent.click(validateBtn);

        const report = await screen.findByTestId('schema-validation-report');
        expect(report).toHaveTextContent('3 Issue(s) Detected');
        expect(report).toHaveTextContent(/missing expected Cloud Logging column\(s\): jsonPayload, trace/i);
        expect(report).toHaveTextContent(/still bound to an empty placeholder stub/i);
        expect(report).toHaveTextContent(/Unrecognized name: legacy_field/i);
        expect(screen.getAllByRole('button', { name: /Repair \/ Upgrade View/i }).length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to projectNumber when projectId is empty so queries still execute', async () => {
        render(
            <OperationalAnalyticsDashboard
                projectId=""
                projectNumber="987654321"
                datasetId="test_dataset"
                tables={mockTables}
            />
        );

        await waitFor(() => {
            expect(apiService.runBigQueryQuery).toHaveBeenCalledWith(
                '987654321',
                expect.stringContaining('`987654321.test_dataset.v_consolidated_user_activity`'),
                true
            );
        });
    });

    it('toggles from Views mode to Main Tables mode and pulls overview metrics directly from raw Cloud Logging sink tables without views installed', async () => {
        const rawSinkTablesOnly = [
            { tableReference: { tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' } },
            { tableReference: { tableId: 'discoveryengine_googleapis_com_gen_ai_user_message_20260801' } },
            { tableReference: { tableId: 'discoveryengine_googleapis_com_gen_ai_choice_20260801' } },
            { tableReference: { tableId: 'discoveryengine_googleapis_com_gen_ai_client_inference_operation_details_20260801' } }
        ];

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={rawSinkTablesOnly}
            />
        );

        // Initially in Views mode with zero v_* views installed -> all sections show MOCK and Add View buttons are visible
        expect(screen.getAllByText('MOCK').length).toBeGreaterThanOrEqual(5);
        expect(screen.getAllByRole('button', { name: /Add View to BigQuery/i }).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByRole('button', { name: /Validate Schemas & Views/i })).toBeInTheDocument();
        expect(apiService.runBigQueryQuery).not.toHaveBeenCalled();

        // Click the toggle switch in the header
        const toggleSwitch = screen.getByTestId('datasource-mode-toggle');
        expect(toggleSwitch).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(toggleSwitch);

        expect(toggleSwitch).toHaveAttribute('aria-checked', 'true');
        expect(sessionStorage.getItem('agentspace-observability-source-mode')).toBe('tables');

        // Verify that Create/Drop/Validate View buttons are hidden in Main Tables mode
        expect(screen.queryByRole('button', { name: /Add View to BigQuery/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Drop View/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Validate Schemas & Views/i })).not.toBeInTheDocument();

        // Verify that Live Main Table badges appear and BigQuery queries run directly against the sink tables
        await waitFor(() => {
            const liveTableBadges = screen.getAllByTestId('live-main-table-badge');
            expect(liveTableBadges.length).toBeGreaterThanOrEqual(5);
            expect(apiService.runBigQueryQuery).toHaveBeenCalled();
        });

        const executedQueries = (apiService.runBigQueryQuery as any).mock.calls.map(
            (call: [string, string]) => call[1]
        );
        expect(executedQueries.length).toBeGreaterThanOrEqual(5);
        // None of the queries should execute CREATE VIEW or query uninstalled `v_*` views
        for (const sql of executedQueries) {
            expect(sql).not.toContain('CREATE OR REPLACE VIEW');
            expect(sql).not.toContain('`test-project.test_dataset.v_');
        }
        expect(
            executedQueries.some((sql: string) =>
                sql.includes('`test-project.test_dataset.discoveryengine_googleapis_com_gemini_enterprise_user_activity_*`')
            )
        ).toBe(true);
        expect(
            executedQueries.some((sql: string) =>
                sql.includes('`test-project.test_dataset.discoveryengine_googleapis_com_gen_ai_client_inference_operation_details_*`')
            )
        ).toBe(true);
    });

    it('queries v_user_connector_usage_30d in Main Tables mode by inlining v_user_connector_usage over the base user activity table and renders live rows', async () => {
        const rawSinkTablesOnly = [
            { tableReference: { tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' } }
        ];

        (apiService.runBigQueryQuery as any).mockImplementation(async (_proj: string, sql: string) => {
            if (sql.includes('LIMIT 100')) {
                return {
                    schema: {
                        fields: [
                            { name: 'user_email' },
                            { name: 'connector_name' },
                            { name: 'connector_type' },
                            { name: 'usage_count' },
                            { name: 'tools_used' },
                            { name: 'first_used_at' },
                            { name: 'last_used_at' }
                        ]
                    },
                    rows: [
                        {
                            f: [
                                { v: 'alice@example.com' },
                                { v: 'jira_enterprise_prod' },
                                { v: 'Search Data Source' },
                                { v: '42' },
                                { v: 'jira_search_tool' },
                                { v: '2026-08-01T00:00:00Z' },
                                { v: '2026-08-15T12:30:00Z' }
                            ]
                        }
                    ]
                };
            }
            return { rows: [] };
        });

        sessionStorage.setItem('agentspace-observability-source-mode', 'tables');

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={rawSinkTablesOnly}
            />
        );

        const viewSelect = screen.getByRole('combobox', { name: /Select Operational View/i });
        fireEvent.change(viewSelect, { target: { value: 'v_user_connector_usage_30d' } });

        // Wait for live row from the main table query to render in the DataTable
        expect(await screen.findByText('alice@example.com')).toBeInTheDocument();
        expect(screen.getAllByText('jira_enterprise_prod').length).toBeGreaterThanOrEqual(1);

        // Ensure Add View / Drop View buttons are hidden in the individual view detail header as well
        expect(screen.queryByRole('button', { name: /Add View to BigQuery/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Drop View/i })).not.toBeInTheDocument();

        // Confirm the SQL inlined v_user_connector_usage directly from the base sink table without referencing `v_user_connector_usage` view
        const rowQueryCall = (apiService.runBigQueryQuery as any).mock.calls.find(
            (call: [string, string]) => call[1].includes('LIMIT 100')
        );
        expect(rowQueryCall).toBeDefined();
        expect(rowQueryCall[1]).toContain(
            '`test-project.test_dataset.discoveryengine_googleapis_com_gemini_enterprise_user_activity_*`'
        );
        expect(rowQueryCall[1]).not.toContain('`test-project.test_dataset.v_user_connector_usage`');
        expect(rowQueryCall[1]).not.toContain('`test-project.test_dataset.v_user_connector_usage_30d`');
    });

    it('switches to Main Tables mode when clicking "Query Main Tables Directly" on an uninstalled view banner', async () => {
        const rawSinkTablesOnly = [
            { tableReference: { tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' } }
        ];

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={rawSinkTablesOnly}
            />
        );

        const shortcutButtons = screen.getAllByTestId('switch-to-main-tables-btn');
        expect(shortcutButtons.length).toBeGreaterThanOrEqual(1);

        fireEvent.click(shortcutButtons[0]);

        await waitFor(() => {
            expect(sessionStorage.getItem('agentspace-observability-source-mode')).toBe('tables');
            expect(screen.getAllByTestId('live-main-table-badge').length).toBeGreaterThanOrEqual(1);
            expect(apiService.runBigQueryQuery).toHaveBeenCalled();
        });
    });

    it('surfaces QUERY ERROR and error details when a direct main table query fails in BigQuery without swallowing the error or showing view repair buttons', async () => {
        const rawSinkTablesOnly = [
            { tableReference: { tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801' } }
        ];

        (apiService.runBigQueryQuery as any).mockRejectedValue(
            new Error('Access Denied: Table test-project:test_dataset.discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801: User does not have bigquery.tables.getData permission.')
        );

        sessionStorage.setItem('agentspace-observability-source-mode', 'tables');

        render(
            <OperationalAnalyticsDashboard
                projectId="test-project"
                projectNumber="123456"
                datasetId="test_dataset"
                tables={rawSinkTablesOnly}
            />
        );

        await waitFor(() => {
            expect(screen.getAllByText('QUERY ERROR').length).toBeGreaterThanOrEqual(1);
            expect(
                screen.getAllByText(/User does not have bigquery\.tables\.getData permission/i).length
            ).toBeGreaterThanOrEqual(1);
        });

        // View repair/recreate buttons and banners should be hidden in Main Tables mode
        expect(screen.queryByRole('button', { name: /Repair All Views/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Recreate View/i })).not.toBeInTheDocument();
    });
});

