import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CostsUI, {
  validateSingleUserMultiplier,
  calculateEditionQuotas,
  resolveEditionFromTier,
  DEFAULT_SINGLE_USER_MULTIPLIER,
} from './CostsUI';
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

  it('calculates pooled quotas from Standard/Plus multipliers and renders tooltips on all QuotaCards', async () => {
    mockedApi.getCloudMonitoringMetrics.mockResolvedValue({
      timeSeries: [
        {
          points: [{ value: { int64Value: '420' } }],
        },
      ],
    } as never);

    const { container } = render(<GEQuotaUsagePage projectNumber="glm-prod-123" />);

    const licenseInput = screen.getByRole('spinbutton', { name: /Number of User Licenses/i });
    fireEvent.change(licenseInput, { target: { value: '10' } });

    await waitFor(() => {
      expect(screen.getAllByText('/ 1,600').length).toBeGreaterThanOrEqual(4);
      expect(screen.getByTestId('entitlement-agent-creation')).toHaveTextContent('10');
      expect(screen.getByTestId('entitlement-storage-gib')).toHaveTextContent('300');
      expect(screen.getByTestId('entitlement-devtools-weekly')).toHaveTextContent('$25');
    });

    const editionSelect = screen.getByDisplayValue('Standard');
    fireEvent.change(editionSelect, { target: { value: 'Plus' } });

    await waitFor(() => {
      expect(screen.getAllByText('/ 2,000').length).toBeGreaterThanOrEqual(4);
      expect(screen.getByTestId('entitlement-agent-creation')).toHaveTextContent('100');
      expect(screen.getByTestId('entitlement-storage-gib')).toHaveTextContent('750');
      expect(screen.getByTestId('entitlement-devtools-weekly')).toHaveTextContent('$37.5');
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

  it('calculates single-user quota caps when enabled and updates dynamically with multiplier changes', async () => {
    render(<CostsUI projectNumber="glm-prod-123" />);
    await waitFor(() => expect(mockedApi.listBillingAccounts).toHaveBeenCalled());

    const licenseInput = screen.getByLabelText(/Number of User Licenses/i);
    fireEvent.change(licenseInput, { target: { value: '100' } });

    // Initially single-user limit badges are not rendered
    expect(screen.queryByTestId('single-user-cap-badge')).not.toBeInTheDocument();

    // Enable Single-User Quota Limit (defaults to 10x)
    const toggle = screen.getByTestId('single-user-limit-toggle');
    fireEvent.click(toggle);

    const multiplierInput = screen.getByTestId('single-user-multiplier-input') as HTMLInputElement;
    expect(multiplierInput.value).toBe('10');

    // On Standard with 100 seats and 10x multiplier:
    // Assistant queries per-user cap = 160 * 10 = 1,600 generations / day
    // Image generation per-user cap = 5 * 10 = 50 images / day
    // Min users to exhaust pool = 100 / 10 = 10
    expect(screen.getByTestId('single-user-limit-summary')).toHaveTextContent(
      /Min 10 max-cap users required to exhaust daily pool/i
    );
    const capBadges = screen.getAllByTestId('single-user-cap-badge');
    expect(capBadges.length).toBe(8);
    expect(capBadges.some((el) => el.textContent?.includes('1,600 generations / day'))).toBe(true);
    expect(capBadges.some((el) => el.textContent?.includes('50 images / day'))).toBe(true);

    // Change multiplier to 5x
    fireEvent.change(multiplierInput, { target: { value: '5' } });
    expect(screen.getByTestId('single-user-limit-summary')).toHaveTextContent(
      /Min 20 max-cap users required to exhaust daily pool/i
    );
    expect(
      screen.getAllByTestId('single-user-cap-badge').some((el) => el.textContent?.includes('800 generations / day'))
    ).toBe(true);
  });

  it('rejects malformed or hostile multiplier inputs (0, negative, float, NaN, empty) with explicit validation errors', () => {
    expect(validateSingleUserMultiplier(10)).toEqual({ valid: true, value: 10 });
    expect(validateSingleUserMultiplier('1')).toEqual({ valid: true, value: 1 });

    // Negative and zero inputs
    const zeroResult = validateSingleUserMultiplier(0);
    expect(zeroResult.valid).toBe(false);
    expect(zeroResult.value).toBe(1);
    expect(zeroResult.error).toMatch(/1 or greater/i);

    const negResult = validateSingleUserMultiplier('-5');
    expect(negResult.valid).toBe(false);
    expect(negResult.value).toBe(1);
    expect(negResult.error).toMatch(/1 or greater/i);

    // Float / decimal inputs
    const floatResult = validateSingleUserMultiplier('2.5');
    expect(floatResult.valid).toBe(false);
    expect(floatResult.value).toBe(2);
    expect(floatResult.error).toMatch(/whole number/i);

    // Non-numeric / NaN / Infinity / empty inputs
    for (const hostile of ['', '   ', 'abc', NaN, Infinity, -Infinity, null, undefined]) {
      const res = validateSingleUserMultiplier(hostile);
      expect(res.valid).toBe(false);
      expect(res.value).toBe(DEFAULT_SINGLE_USER_MULTIPLIER);
      expect(res.error).toBeDefined();
    }
  });

  it('surfaces multiplier validation error alert in the UI and warns when edition does not support single-user limits', async () => {
    render(<CostsUI projectNumber="glm-prod-123" />);
    await waitFor(() => expect(mockedApi.listBillingAccounts).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('single-user-limit-toggle'));
    const multiplierInput = screen.getByTestId('single-user-multiplier-input');

    // Enter invalid 0 multiplier
    fireEvent.change(multiplierInput, { target: { value: '0' } });
    const validationAlert = screen.getByTestId('multiplier-validation-error');
    expect(validationAlert).toHaveTextContent(/Multiplier must be 1 or greater/i);

    // Enter decimal 3.5 multiplier
    fireEvent.change(multiplierInput, { target: { value: '3.5' } });
    expect(screen.getByTestId('multiplier-validation-error')).toHaveTextContent(
      /whole number \(decimals are not supported\)/i
    );

    // Switch edition to Frontline Worker (does not support single-user quota limits)
    const editionSelect = screen.getByLabelText(/Gemini Enterprise Edition/i);
    fireEvent.change(editionSelect, { target: { value: 'Frontline Worker' } });

    await waitFor(() => {
      expect(screen.getByTestId('single-user-unsupported-edition-warning')).toHaveTextContent(
        /only supported for Standard, Plus, and Standard Emerging Market/i
      );
    });
    expect(screen.queryByTestId('single-user-cap-badge')).not.toBeInTheDocument();
  });

  it('caps single-user quota at the total edition pool when multiplier exceeds seat count and resolves all edition tiers', () => {
    // 5 Standard seats (800 total Assistant queries/day) with 10x multiplier (1,600 raw cap) -> capped at 800
    const capped = calculateEditionQuotas('Standard', 5, true, 10);
    expect(capped.textAnswerGen).toBe(800);
    expect(capped.singleUserCaps?.textAnswerGen).toBe(800);
    expect(capped.usersToExhaustPool).toBe(1);

    // Standard Emerging Market has 0 base image/video quota (overage-only)
    const emerging = calculateEditionQuotas('Standard Emerging Market', 20, true, 5);
    expect(emerging.textAnswerGen).toBe(800);
    expect(emerging.singleUserCaps?.textAnswerGen).toBe(200);
    expect(emerging.imageGen).toBe(0);
    expect(emerging.singleUserCaps?.imageGen).toBe(0);

    // Tier string resolution
    expect(resolveEditionFromTier('GEMINI_ENTERPRISE_PLUS')).toBe('Plus');
    expect(resolveEditionFromTier('GEMINI_ENTERPRISE_EMERGING')).toBe('Standard Emerging Market');
    expect(resolveEditionFromTier('GEMINI_ENTERPRISE_EDU_PRO')).toBe('EDU Pro');
    expect(resolveEditionFromTier('GEMINI_ENTERPRISE_EDU')).toBe('EDU');
    expect(resolveEditionFromTier('GEMINI_ENTERPRISE_FRONTLINE_STARTER')).toBe('Frontline Starter');
    expect(resolveEditionFromTier('GEMINI_ENTERPRISE_FRONTLINE_WORKER')).toBe('Frontline Worker');
    expect(resolveEditionFromTier('GEMINI_ENTERPRISE')).toBe('Standard');
  });
});
