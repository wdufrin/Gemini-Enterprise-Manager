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
});

