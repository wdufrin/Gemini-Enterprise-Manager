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
});



