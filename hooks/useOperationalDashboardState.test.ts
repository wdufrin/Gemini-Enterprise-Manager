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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOperationalDashboardState } from './useOperationalDashboardState';
import { OPERATIONAL_VIEWS } from '../components/dashboard/operational/analyticsData';
import * as apiService from '../services/apiService';

vi.mock('../services/apiService', () => ({
    runBigQueryQuery: vi.fn(),
    gapiRequest: vi.fn(),
}));

const MOCK_TABLES = [
    { tableReference: { datasetId: 'test_dataset', tableId: 'v_consolidated_user_activity' } },
    { tableReference: { datasetId: 'test_dataset', tableId: 'v_admin_feedback_review' } },
    {
        tableReference: {
            datasetId: 'test_dataset',
            tableId: 'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801',
        },
    },
];

describe('useOperationalDashboardState hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.location.hash = '#/observability';
        sessionStorage.clear();
        vi.mocked(apiService.runBigQueryQuery).mockResolvedValue({
            jobComplete: true,
            rows: [],
        });
    });

    it('initializes with default overview state and detects installed dataset views', async () => {
        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: MOCK_TABLES,
            })
        );

        expect(result.current.activeViewId).toBe('overview');
        expect(result.current.selectedCategory).toBe('all');
        expect(result.current.installedViews.has('v_consolidated_user_activity')).toBe(true);
        expect(result.current.installedViews.has('v_admin_feedback_review')).toBe(true);
        expect(result.current.brokenViews.size).toBe(0);

        await waitFor(() => {
            expect(result.current.liveDataLoading).toBe(false);
        });
    });

    it('transitions activeViewId via handleViewChange and maps BigQuery rows in fetchViewRows', async () => {
        vi.mocked(apiService.runBigQueryQuery).mockImplementation(async (_proj: string, sql: string) => {
            if (sql.includes('v_admin_feedback_review')) {
                return {
                    jobComplete: true,
                    schema: {
                        fields: [
                            { name: 'event_time', type: 'TIMESTAMP' },
                            { name: 'agent_name', type: 'STRING' },
                            { name: 'feedback', type: 'STRING' },
                        ],
                    },
                    rows: [
                        {
                            f: [
                                { v: '2026-08-01T12:00:00Z' },
                                { v: 'warranty_triage_agent' },
                                { v: 'THUMBS_UP' },
                            ],
                        },
                    ],
                };
            }
            return { jobComplete: true, rows: [] };
        });

        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: MOCK_TABLES,
            })
        );

        act(() => {
            result.current.handleViewChange('v_admin_feedback_review');
        });

        expect(result.current.activeViewId).toBe('v_admin_feedback_review');
        expect(window.location.hash).toBe('#/observability?view=v_admin_feedback_review');
        expect(sessionStorage.getItem('agentspace-observability-view')).toBe('v_admin_feedback_review');

        await waitFor(() => {
            expect(result.current.rowsLoading['v_admin_feedback_review']).toBe(false);
            expect(result.current.viewRows['v_admin_feedback_review']).toEqual([
                {
                    event_time: '2026-08-01T12:00:00Z',
                    agent_name: 'warranty_triage_agent',
                    feedback: 'THUMBS_UP',
                },
            ]);
        });
    });

    it('records formatted error message in brokenViews and resets viewRows to [] when fetchViewRows fails', async () => {
        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: MOCK_TABLES,
            })
        );

        await waitFor(() => {
            expect(result.current.liveDataLoading).toBe(false);
        });

        vi.mocked(apiService.runBigQueryQuery).mockRejectedValueOnce(
            new Error('403 Access Denied: User lacks bigquery.tables.getData on v_admin_feedback_review')
        );

        await act(async () => {
            await result.current.fetchViewRows('v_admin_feedback_review');
        });

        expect(result.current.brokenViews.get('v_admin_feedback_review')).toBe(
            '403 Access Denied: User lacks bigquery.tables.getData on v_admin_feedback_review'
        );
        expect(result.current.viewRows['v_admin_feedback_review']).toEqual([]);
        expect(result.current.rowsLoading['v_admin_feedback_review']).toBe(false);
    });

    it('automatically self-heals a stale BigQuery view when querying fails with leaf column STRING schema mismatch', async () => {
        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: MOCK_TABLES,
            })
        );

        await waitFor(() => {
            expect(result.current.liveDataLoading).toBe(false);
        });

        let viewRecreated = false;
        vi.mocked(apiService.runBigQueryQuery).mockImplementation(async (_proj: string, sql: string) => {
            if (sql.includes('CREATE OR REPLACE VIEW') && sql.includes('v_admin_feedback_review')) {
                viewRecreated = true;
                return { jobComplete: true, rows: [] };
            }
            if (!sql.includes('CREATE OR REPLACE VIEW') && sql.includes('v_admin_feedback_review')) {
                if (!viewRecreated) {
                    throw new Error(
                        "Cannot resolve field 'parts' inside leaf column 'jsonPayload.request.query' of type STRING at [1:15]"
                    );
                }
                return {
                    jobComplete: true,
                    schema: {
                        fields: [
                            { name: 'feedback_time', type: 'TIMESTAMP' },
                            { name: 'prompt', type: 'STRING' },
                            { name: 'feedback_type', type: 'STRING' },
                        ],
                    },
                    rows: [
                        {
                            f: [
                                { v: '2026-08-01T14:22:00Z' },
                                { v: 'How do I reset my corporate VPN?' },
                                { v: 'THUMBS_DOWN' },
                            ],
                        },
                    ],
                };
            }
            return { jobComplete: true, rows: [] };
        });

        await act(async () => {
            await result.current.fetchViewRows('v_admin_feedback_review');
        });

        expect(viewRecreated).toBe(true);
        expect(result.current.brokenViews.has('v_admin_feedback_review')).toBe(false);
        expect(result.current.viewRows['v_admin_feedback_review']).toEqual([
            {
                feedback_time: '2026-08-01T14:22:00Z',
                prompt: 'How do I reset my corporate VPN?',
                feedback_type: 'THUMBS_DOWN',
            },
        ]);
    });

    it('surfaces original schema error in brokenViews without looping when auto-repair CREATE OR REPLACE VIEW is rejected', async () => {
        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: MOCK_TABLES,
            })
        );

        await waitFor(() => {
            expect(result.current.liveDataLoading).toBe(false);
        });

        let createAttempts = 0;
        vi.mocked(apiService.runBigQueryQuery).mockImplementation(async (_proj: string, sql: string) => {
            if (sql.includes('CREATE OR REPLACE VIEW') && sql.includes('v_admin_feedback_review')) {
                createAttempts++;
                throw new Error('403 Access Denied: Dataset test_dataset: Permission bigquery.tables.create denied');
            }
            if (!sql.includes('CREATE OR REPLACE VIEW') && sql.includes('v_admin_feedback_review')) {
                throw new Error(
                    "Cannot resolve field 'parts' inside leaf column 'jsonPayload.request.query' of type STRING"
                );
            }
            return { jobComplete: true, rows: [] };
        });

        await act(async () => {
            await result.current.fetchViewRows('v_admin_feedback_review');
        });

        expect(createAttempts).toBe(1);
        expect(result.current.brokenViews.get('v_admin_feedback_review')).toBe(
            "Cannot resolve field 'parts' inside leaf column 'jsonPayload.request.query' of type STRING"
        );
        expect(result.current.viewRows['v_admin_feedback_review']).toEqual([]);
    });

    it('generates view DDLs free of raw jsonPayload/json_payload dot-access and resilient to scalar STRING request.query', () => {
        const sinkTables = new Set([
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801',
            'discoveryengine_googleapis_com_gen_ai_telemetry_20260801',
        ]);
        const allLogsTables = new Set(['_AllLogs']);

        for (const [viewId, viewDef] of Object.entries(OPERATIONAL_VIEWS)) {
            const sinkDdl = viewDef.getDdl('test-project', 'test_dataset', sinkTables);
            const allLogsDdl = viewDef.getDdl('test-project', 'test_dataset', allLogsTables);

            // Never use direct struct dot-traversal on jsonPayload or json_payload
            expect(sinkDdl, `${viewId} sink DDL should not use jsonPayload dot access`).not.toMatch(
                /\bjsonPayload\./
            );
            expect(allLogsDdl, `${viewId} _AllLogs DDL should not use json_payload dot access`).not.toMatch(
                /\bjson_payload\./
            );
        }

        for (const viewId of ['v_admin_feedback_review', 'v_agent_feedback_detailed', 'v_gemini_assist_activity']) {
            const sinkDdl = OPERATIONAL_VIEWS[viewId].getDdl('test-project', 'test_dataset', sinkTables);
            const allLogsDdl = OPERATIONAL_VIEWS[viewId].getDdl('test-project', 'test_dataset', allLogsTables);

            // Must extract scalar STRING fallback $.request.query when request.query is a leaf STRING column
            expect(sinkDdl).toContain("JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.query')");
            expect(allLogsDdl).toContain("JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.query')");
        }
    });

    it('creates and drops operational views while updating installedViews and actionMessage', async () => {
        const onRefreshTables = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: MOCK_TABLES,
                onRefreshTables,
            })
        );

        await act(async () => {
            await result.current.handleCreateView('v_gemini_genai_telemetry');
        });

        expect(result.current.installedViews.has('v_gemini_genai_telemetry')).toBe(true);
        expect(result.current.actionMessage?.type).toBe('success');
        expect(onRefreshTables).toHaveBeenCalledTimes(1);

        await act(async () => {
            await result.current.handleDropView('v_consolidated_user_activity');
        });

        expect(result.current.installedViews.has('v_consolidated_user_activity')).toBe(false);
        expect(result.current.actionMessage?.type).toBe('success');
        expect(onRefreshTables).toHaveBeenCalledTimes(2);
    });

    it('generates per-shard UNION ALL with PARSE_JSON(TO_JSON_STRING(jsonPayload)) instead of wildcard _* when multiple date-sharded sink tables exist', () => {
        const multiShardTables = new Set([
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260831',
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260912',
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity_20261020',
        ]);

        for (const viewId of ['v_agent_feedback', 'v_admin_feedback_review', 'v_agent_feedback_detailed']) {
            const ddl = OPERATIONAL_VIEWS[viewId].getDdl('test-project', 'test_dataset', multiShardTables);
            expect(ddl).not.toContain('discoveryengine_googleapis_com_gemini_enterprise_user_activity_*');
            expect(ddl).toContain('PARSE_JSON(TO_JSON_STRING(jsonPayload)) AS jsonPayload');
            expect(ddl).toContain('UNION ALL');
            expect(ddl).toContain('discoveryengine_googleapis_com_gemini_enterprise_user_activity_20261020');
            expect(ddl).toContain('discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260912');
            expect(ddl).toContain('discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260831');
        }
    });

    it('rejects view creation when runBigQueryQuery returns an embedded error object in the response payload', async () => {
        vi.mocked(apiService.runBigQueryQuery).mockImplementation(async (_proj: string, sql: string) => {
            if (sql.includes('CREATE OR REPLACE VIEW')) {
                return {
                    error: {
                        code: 400,
                        message: "Cannot resolve field 'parts' inside leaf column 'jsonPayload.request.query' of type STRING",
                    },
                };
            }
            return { jobComplete: true, rows: [] };
        });

        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: MOCK_TABLES,
            })
        );

        await act(async () => {
            await result.current.handleCreateView('v_agent_feedback');
        });

        expect(result.current.installedViews.has('v_agent_feedback')).toBe(false);
        expect(result.current.actionMessage?.type).toBe('error');
        expect(result.current.actionMessage?.text).toContain("Cannot resolve field 'parts'");
    });

    it('restricts trace_duration_ms quantiles to is_final_step IS TRUE and falls back to legacyQueryTokens and COUNT(1) connector queries when legacy views lack newer columns', async () => {
        const legacyViewTables = [
            { tableReference: { datasetId: 'test_dataset', tableId: 'v_gemini_genai_telemetry' } },
            { tableReference: { datasetId: 'test_dataset', tableId: 'v_user_connector_usage_30d' } },
        ];

        const executedSqls: string[] = [];
        vi.mocked(apiService.runBigQueryQuery).mockImplementation(async (_proj: string, sql: string) => {
            executedSqls.push(sql);
            if (sql.includes('v_gemini_genai_telemetry') && sql.includes('step_latency_ms')) {
                throw new Error('Unrecognized name: step_latency_ms at [5:18]');
            }
            if (sql.includes('v_gemini_genai_telemetry')) {
                return {
                    jobComplete: true,
                    rows: [
                        {
                            f: [
                                { v: 'Cosmere' },
                                { v: '14000' },
                                { v: '3200' },
                                { v: '22' },
                            ],
                        },
                    ],
                };
            }
            if (sql.includes('v_user_connector_usage_30d') && sql.includes('SUM(usage_count)')) {
                throw new Error('Unrecognized name: usage_count at [3:15]');
            }
            if (sql.includes('v_user_connector_usage_30d') && sql.includes('GROUP BY connector_name')) {
                return {
                    jobComplete: true,
                    rows: [
                        {
                            f: [{ v: 'jira_cloud' }, { v: '18' }, { v: '4' }],
                        },
                    ],
                };
            }
            if (sql.includes('v_user_connector_usage_30d') && sql.includes('GROUP BY user_email')) {
                return {
                    jobComplete: true,
                    rows: [
                        {
                            f: [{ v: 'eng@example.com' }, { v: '12' }, { v: '2' }],
                        },
                    ],
                };
            }
            return { jobComplete: true, rows: [] };
        });

        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: legacyViewTables,
            })
        );

        await waitFor(() => {
            expect(result.current.liveDataLoading).toBe(false);
        });

        // Verify primary queryTokens SQL restricted trace_duration_ms quantiles to is_final_step IS TRUE (R2-4)
        const primaryTokensQuery = executedSqls.find(
            (q) => q.includes('v_gemini_genai_telemetry') && q.includes('step_latency_ms')
        );
        expect(primaryTokensQuery).toBeDefined();
        expect(primaryTokensQuery).toContain(
            'IF(is_final_step IS TRUE AND trace_duration_ms > 0 AND trace_duration_ms < 600000, trace_duration_ms, NULL)'
        );

        // Verify legacyQueryTokens fallback populated genaiTokens and totalTelemetry
        expect(result.current.liveData.genaiTokens).toEqual([
            {
                agent: 'Cosmere',
                inputTokens: 14000,
                outputTokens: 3200,
                calls: 22,
                avgStepLatencyMs: undefined,
                p50LatencyMs: undefined,
                p95LatencyMs: undefined,
            },
        ]);
        expect(result.current.totalTelemetry).toBe(22);

        // Verify COUNT(1) connector fallback populated connectorUsage and topConnectorUsers
        expect(result.current.liveData.connectorUsage).toEqual([
            { connector: 'jira_cloud', calls: 18 },
        ]);
        expect(result.current.liveData.topConnectorUsers).toEqual([
            { user: 'eng@example.com', calls: 12 },
        ]);
    });

    it('applies a 30-day lookback filter to every overview query', async () => {
        const allViewTables = [
            'v_consolidated_user_activity',
            'v_gemini_genai_telemetry',
            'v_consolidated_ai_choices',
            'v_agent_feedback',
        ].map((tableId) => ({ tableReference: { datasetId: 'test_dataset', tableId } }));

        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: allViewTables,
            })
        );

        await waitFor(() => {
            expect(result.current.liveDataLoading).toBe(false);
        });

        const sqls = vi.mocked(apiService.runBigQueryQuery).mock.calls.map((c) => c[1]);
        const lookback = 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)';
        const overviewQueries = sqls.filter((q) => !q.includes('CREATE OR REPLACE VIEW'));
        // 2 user activity + 2 telemetry + 1 choices + 1 feedback
        expect(overviewQueries).toHaveLength(6);
        for (const q of overviewQueries) {
            expect(q, q).toContain(lookback);
        }
        expect(overviewQueries.filter((q) => q.includes(`event_time >= ${lookback}`))).toHaveLength(3);
        expect(overviewQueries.filter((q) => q.includes(`timestamp >= ${lookback}`))).toHaveLength(3);
    });

    it('runs independent overview tasks concurrently but never more than OPERATIONAL_QUERY_CONCURRENCY at once, and isolates a failing task', async () => {
        const { OPERATIONAL_QUERY_CONCURRENCY } = await import('./useOperationalDashboardState');
        const allViewTables = [
            'v_consolidated_user_activity',
            'v_gemini_genai_telemetry',
            'v_consolidated_ai_choices',
            'v_agent_feedback',
        ].map((tableId) => ({ tableReference: { datasetId: 'test_dataset', tableId } }));

        let inFlight = 0;
        let maxInFlight = 0;
        vi.mocked(apiService.runBigQueryQuery).mockImplementation(async (_p: string, sql: string) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 20));
            inFlight--;
            if (sql.includes('v_consolidated_ai_choices')) {
                throw new Error('403 Access Denied on v_consolidated_ai_choices');
            }
            return { jobComplete: true, rows: [] };
        });

        const { result } = renderHook(() =>
            useOperationalDashboardState({
                projectId: 'test-project',
                projectNumber: '123456',
                datasetId: 'test_dataset',
                tables: allViewTables,
            })
        );

        await waitFor(() => {
            expect(result.current.liveDataLoading).toBe(false);
        });

        expect(maxInFlight).toBeGreaterThan(1);
        expect(maxInFlight).toBeLessThanOrEqual(OPERATIONAL_QUERY_CONCURRENCY);
        expect(result.current.brokenViews.get('v_consolidated_ai_choices')).toBe(
            '403 Access Denied on v_consolidated_ai_choices'
        );
        expect(result.current.brokenViews.has('v_agent_feedback')).toBe(false);
        expect(result.current.queryProgress.completed).toBe(4);
        expect(result.current.queryProgress.total).toBe(4);
    });

    it('still resets broken views and re-queries the new dataset when datasetId changes after mount', async () => {
        vi.mocked(apiService.runBigQueryQuery).mockImplementation(async (_p: string, sql: string) => {
            if (sql.includes('old_dataset')) throw new Error('403 Access Denied on old_dataset');
            return { jobComplete: true, rows: [] };
        });
        // Stable references per dataset, as the page supplies from state.
        const tablesByDataset: Record<string, Array<{ tableReference: { datasetId: string; tableId: string } }>> = {
            old_dataset: [{ tableReference: { datasetId: 'old_dataset', tableId: 'v_consolidated_user_activity' } }],
            new_dataset: [{ tableReference: { datasetId: 'new_dataset', tableId: 'v_consolidated_user_activity' } }],
        };
        const tablesFor = (ds: string) => tablesByDataset[ds];

        const { result, rerender } = renderHook(
            ({ ds }: { ds: string }) =>
                useOperationalDashboardState({
                    projectId: 'test-project',
                    projectNumber: '123456',
                    datasetId: ds,
                    tables: tablesFor(ds),
                }),
            { initialProps: { ds: 'old_dataset' } }
        );

        await waitFor(() => {
            expect(result.current.brokenViews.get('v_consolidated_user_activity')).toBe('403 Access Denied on old_dataset');
        });

        rerender({ ds: 'new_dataset' });

        await waitFor(() => {
            expect(result.current.brokenViews.size).toBe(0);
            expect(
                vi.mocked(apiService.runBigQueryQuery).mock.calls.some((c) => c[1].includes('`test-project.new_dataset.'))
            ).toBe(true);
        });
    });

    it('generates v_consolidated_user_activity DDL that serializes the payload once per row and dedupes on (insertId, timestamp)', () => {
        const sinkDdl = OPERATIONAL_VIEWS['v_consolidated_user_activity'].getDdl(
            'test-project',
            'test_dataset',
            new Set(['discoveryengine_googleapis_com_gemini_enterprise_user_activity'])
        );
        expect(sinkDdl.match(/TO_JSON_STRING\(/g)).toHaveLength(1);
        expect(sinkDdl).toContain('PARTITION BY insertId, timestamp');
        expect(sinkDdl).not.toContain('PARTITION BY insertId ORDER BY');

        const allLogsDdl = OPERATIONAL_VIEWS['v_consolidated_user_activity'].getDdl(
            'test-project',
            'test_dataset',
            new Set(['_AllLogs'])
        );
        expect(allLogsDdl.match(/TO_JSON_STRING\(/g)).toHaveLength(1);
        expect(allLogsDdl).toContain('PARTITION BY insert_id, timestamp');
        expect(allLogsDdl).toContain("WHERE log_name LIKE '%gemini_enterprise_user_activity%'");
    });
});

