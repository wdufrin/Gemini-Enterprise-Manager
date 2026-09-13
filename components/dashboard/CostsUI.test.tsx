import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import CostsUI from './CostsUI';
import * as api from '../../services/apiService';

vi.mock('../../services/apiService', () => ({
    listBillingAccounts: vi.fn(),
    listBillingAccountLicenseConfigs: vi.fn(),
    listLicenseConfigsUsageStats: vi.fn(),
    getLicenseConfig: vi.fn(),
    getCloudMonitoringMetrics: vi.fn(),
}));

describe('CostsUI Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listBillingAccounts).mockResolvedValue({ billingAccounts: [] });
        vi.mocked(api.listBillingAccountLicenseConfigs).mockResolvedValue({ billingAccountLicenseConfigs: [] });
        vi.mocked(api.listLicenseConfigsUsageStats).mockResolvedValue({ licenseConfigUsageStats: [] });
        vi.mocked(api.getLicenseConfig).mockResolvedValue({ name: 'test' });
    });

    it('renders quota cards and displays Unavailable when metrics fail rather than masking as 0', async () => {
        // Mock getCloudMonitoringMetrics to reject for tasksAndActions, but succeed for textAnswerGen
        vi.mocked(api.getCloudMonitoringMetrics).mockImplementation(async (_proj, filter) => {
            if (filter.includes('tasks_and_actions')) {
                throw new Error('500 Internal Server Error');
            }
            return {
                timeSeries: [
                    {
                        points: [
                            {
                                value: { int64Value: '42' },
                            },
                        ],
                    },
                ],
            };
        });

        render(<CostsUI projectNumber="123456789" />);

        // Wait for metrics fetch to complete
        await waitFor(() => {
            expect(screen.getByText('Tasks and actions')).toBeInTheDocument();
        });

        // tasksAndActions was rejected, so it must display Unavailable, NOT 0
        await waitFor(() => {
            const unavailableBadges = screen.getAllByText('Unavailable');
            expect(unavailableBadges.length).toBeGreaterThan(0);
        });

        // Notice banner should inform that some metrics could not be fetched
        expect(screen.getByText(/metric\(s\) could not be fetched and are marked as Unavailable/i)).toBeInTheDocument();
    });

    it('displays numeric usage when metrics are successfully fetched', async () => {
        vi.mocked(api.getCloudMonitoringMetrics).mockResolvedValue({
            timeSeries: [
                {
                    points: [
                        {
                            value: { int64Value: '125' },
                        },
                    ],
                },
            ],
        });

        render(<CostsUI projectNumber="123456789" />);

        await waitFor(() => {
            expect(screen.getByText('Tasks and actions')).toBeInTheDocument();
        });

        await waitFor(() => {
            const usageElements = screen.getAllByText('125');
            expect(usageElements.length).toBeGreaterThan(0);
        });
    });
});
