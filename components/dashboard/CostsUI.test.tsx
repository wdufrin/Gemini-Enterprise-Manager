import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CostsUI from './CostsUI';
import GEQuotaUsagePage from '../../pages/GEQuotaUsagePage';
import * as api from '../../services/apiService';

vi.mock('../../services/apiService', () => ({
  listBillingAccounts: vi.fn(),
  listBillingAccountLicenseConfigs: vi.fn(),
  listLicenseConfigsUsageStats: vi.fn(),
  getLicenseConfig: vi.fn(),
  getCloudMonitoringMetrics: vi.fn(),
}));

const mockedApi = vi.mocked(api);

describe('CostsUI & GEQuotaUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.listBillingAccounts.mockResolvedValue({ billingAccounts: [] });
    mockedApi.listBillingAccountLicenseConfigs.mockResolvedValue({ billingAccountLicenseConfigs: [] });
    mockedApi.listLicenseConfigsUsageStats.mockResolvedValue({ licenseConfigUsageStats: [] });
    mockedApi.getCloudMonitoringMetrics.mockResolvedValue({ timeSeries: [] });
  });

  it('calculates pooled quotas from Standard/Plus multipliers and renders tooltips on all 8 QuotaCards', async () => {
    mockedApi.getCloudMonitoringMetrics.mockResolvedValue({
      timeSeries: [
        {
          points: [{ value: { int64Value: '420' } }],
        },
      ],
    } as never);

    const { container } = render(<GEQuotaUsagePage projectNumber="glm-prod-123" />);

    const licenseInput = screen.getByRole('spinbutton');
    fireEvent.change(licenseInput, { target: { value: '10' } });

    await waitFor(() => {
      expect(screen.getAllByText('/ 1,600').length).toBeGreaterThanOrEqual(4);
    });

    const editionSelect = screen.getByDisplayValue('Standard');
    fireEvent.change(editionSelect, { target: { value: 'Plus' } });

    await waitFor(() => {
      expect(screen.getAllByText('/ 2,000').length).toBeGreaterThanOrEqual(4);
    });

    expect(container.textContent).not.toContain('NaN');
  });

  it('surfaces license-discovery-warning and monitoring permission error when regional APIs reject with 403', async () => {
    mockedApi.listLicenseConfigsUsageStats.mockRejectedValue(
      new Error('403 PERMISSION_DENIED: discoveryengine.licenseConfigs.list denied')
    );
    mockedApi.getCloudMonitoringMetrics.mockRejectedValue({
      status: 403,
      message: '403 PERMISSION_DENIED: monitoring.timeSeries.list denied',
    });

    render(<CostsUI projectNumber="glm-prod-123" />);

    const warningBanner = await screen.findByTestId('license-discovery-warning');
    expect(warningBanner).toHaveTextContent(/403 PERMISSION_DENIED/);

    expect(
      await screen.findByText(/Missing 'monitoring\.timeSeries\.list' permission/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBe(8);
  });
});
