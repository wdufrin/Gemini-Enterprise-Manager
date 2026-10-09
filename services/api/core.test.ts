/**
 * Copyright 2026 Google LLC
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

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  gapiRequest,
  setDebugLogger,
  DebugLogPayload,
  GapiError,
} from './core';
import { getGapiClient } from '../gapiService';
import { REDACTED } from '../redaction';
import { GlobalDebugProvider, useGlobalDebug } from '../../context/GlobalDebugContext';
import CurlDetailsModal from '../../components/CurlDetailsModal';
import ProjectEngineSelector from '../../components/common/ProjectEngineSelector';
import * as apiService from '../apiService';

vi.mock('../gapiService', () => ({
  getGapiClient: vi.fn(),
}));

describe('F3: Global Request-vs-Response API Telemetry & Selector Error Surfacing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDebugLogger(null);
  });

  afterEach(() => {
    setDebugLogger(null);
    vi.restoreAllMocks();
  });

  describe('gapiRequest telemetry capture', () => {
    it('captures HTTP status, durationMs, redacted request body, and redacted responseBody on 200 OK', async () => {
      vi.mocked(getGapiClient).mockResolvedValue({
        getToken: () => ({ access_token: 'mock-access-token' }),
        request: vi.fn().mockResolvedValue({
          status: 200,
          result: {
            name: 'projects/p1/locations/global/authorizations/auth-1',
            serverSideOauth2: {
              clientId: 'client-123',
              clientSecret: 'GOCSPX-live-response-secret',
            },
          },
        }),
      } as unknown as Awaited<ReturnType<typeof getGapiClient>>);

      const capturedLogs: DebugLogPayload[] = [];
      setDebugLogger((log) => capturedLogs.push(log));

      const requestPayload = {
        serverSideOauth2: {
          clientId: 'client-123',
          clientSecret: 'GOCSPX-outbound-secret',
        },
      };

      const result = await gapiRequest<{ name: string }>(
        'https://discoveryengine.googleapis.com/v1alpha/projects/p1/locations/global/authorizations',
        'POST',
        'p1',
        undefined,
        requestPayload
      );

      expect(result.name).toBe('projects/p1/locations/global/authorizations/auth-1');
      expect(capturedLogs).toHaveLength(1);

      const entry = capturedLogs[0];
      expect(entry.method).toBe('POST');
      expect(entry.status).toBe(200);
      expect(typeof entry.durationMs).toBe('number');
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(entry.errorMessage).toBeUndefined();

      // Verify both request body and response body secrets were redacted
      expect(entry.curlCommand).not.toContain('GOCSPX-outbound-secret');
      expect(entry.curlCommand).toContain(REDACTED);
      const loggedResponse = entry.responseBody as {
        serverSideOauth2: { clientSecret: string };
      };
      expect(loggedResponse.serverSideOauth2.clientSecret).toBe(REDACTED);
    });

    it('captures error status, durationMs, errorMessage, and redacted error payload on 403 PERMISSION_DENIED and throws GapiError', async () => {
      vi.mocked(getGapiClient).mockResolvedValue({
        getToken: () => ({ access_token: 'mock-access-token' }),
        request: vi.fn().mockRejectedValue({
          status: 403,
          result: {
            error: {
              code: 403,
              status: 'PERMISSION_DENIED',
              message: 'Caller does not have discoveryengine.agents.list permission',
              details: [{ detail: 'IAM check failed on project p1' }],
            },
          },
        }),
      } as unknown as Awaited<ReturnType<typeof getGapiClient>>);

      const capturedLogs: DebugLogPayload[] = [];
      setDebugLogger((log) => capturedLogs.push(log));

      await expect(
        gapiRequest(
          'https://discoveryengine.googleapis.com/v1alpha/projects/p1/locations/global/agents',
          'GET',
          'p1',
          undefined,
          undefined,
          undefined,
          true
        )
      ).rejects.toThrow(GapiError);

      expect(capturedLogs).toHaveLength(1);
      const entry = capturedLogs[0];
      expect(entry.status).toBe(403);
      expect(typeof entry.durationMs).toBe('number');
      expect(entry.errorMessage).toContain(
        'Caller does not have discoveryengine.agents.list permission'
      );
      expect(entry.errorMessage).toContain('IAM check failed on project p1');
      expect(entry.responseBody).toBeDefined();
    });
  });

  describe('GlobalDebugProvider ring buffer & CurlDetailsModal side-by-side inspection', () => {
    it('records API history in a 50-item ring buffer even when showCurlPreview is false', async () => {
      let requestCounter = 0;
      vi.mocked(getGapiClient).mockResolvedValue({
        getToken: () => ({ access_token: 'mock-access-token' }),
        request: vi.fn().mockImplementation(async () => {
          requestCounter += 1;
          return {
            status: 200,
            result: { callIndex: requestCounter },
          };
        }),
      } as unknown as Awaited<ReturnType<typeof getGapiClient>>);

      let latestContextValue: ReturnType<typeof useGlobalDebug> | undefined;
      const Consumer: React.FC = () => {
        latestContextValue = useGlobalDebug();
        return React.createElement(
          'div',
          { 'data-testid': 'history-count' },
          String(latestContextValue.apiHistory.length)
        );
      };

      render(
        React.createElement(GlobalDebugProvider, null, React.createElement(Consumer))
      );

      expect(latestContextValue?.showCurlPreview).toBe(false);

      // Issue 55 requests to verify 50-item ring buffer cap while showCurlPreview is false
      await act(async () => {
        for (let i = 1; i <= 55; i++) {
          await gapiRequest(`https://discoveryengine.googleapis.com/v1alpha/items/${i}`, 'GET');
        }
      });

      await waitFor(() => {
        expect(latestContextValue?.apiHistory.length).toBe(50);
      });

      // Most recent call (#55) should be first in the ring buffer
      expect(latestContextValue?.apiHistory[0].url).toContain('/items/55');
      expect(latestContextValue?.apiHistory[0].status).toBe(200);
      expect(latestContextValue?.apiHistory[0].responseBody).toEqual({ callIndex: 55 });
    });

    it('renders Outbound Request and Live Backend Response side-by-side in CurlDetailsModal', () => {
      render(
        React.createElement(CurlDetailsModal, {
          isOpen: true,
          onClose: vi.fn(),
          curlCommand: 'curl -X POST "https://discoveryengine.googleapis.com/v1alpha/engines"',
          title: 'Create Engine Interaction',
          method: 'POST',
          url: 'https://discoveryengine.googleapis.com/v1alpha/engines',
          requestBody: { displayName: 'Midwest Dealer Assistant' },
          status: 200,
          durationMs: 142,
          responseBody: {
            name: 'projects/p1/locations/global/collections/default_collection/engines/eng-1',
            solutionType: 'SOLUTION_TYPE_CHAT',
          },
        })
      );

      expect(screen.getByTestId('curl-modal-telemetry-bar')).toBeInTheDocument();
      expect(screen.getByTestId('curl-modal-status-badge')).toHaveTextContent('HTTP 200');
      expect(screen.getByTestId('curl-modal-latency-badge')).toHaveTextContent('142 ms');
      expect(screen.getByTestId('curl-modal-request-pane')).toBeInTheDocument();
      expect(screen.getByTestId('curl-modal-response-pane')).toBeInTheDocument();
      expect(screen.getByTestId('curl-modal-request-body')).toHaveTextContent(
        'Midwest Dealer Assistant'
      );
      expect(screen.getByTestId('curl-modal-response-json')).toHaveTextContent(
        'SOLUTION_TYPE_CHAT'
      );
    });

    it('renders Backend API Error banner in CurlDetailsModal when request failed with 403', () => {
      render(
        React.createElement(CurlDetailsModal, {
          isOpen: true,
          onClose: vi.fn(),
          curlCommand: 'curl -X GET "https://discoveryengine.googleapis.com/v1alpha/engines"',
          method: 'GET',
          url: 'https://discoveryengine.googleapis.com/v1alpha/engines',
          status: 403,
          durationMs: 58,
          errorMessage: '403 PERMISSION_DENIED: Discovery Engine API has not been used in project',
          responseBody: { error: { code: 403, status: 'PERMISSION_DENIED' } },
        })
      );

      expect(screen.getByTestId('curl-modal-status-badge')).toHaveTextContent('HTTP 403');
      expect(screen.getByTestId('curl-modal-error-banner')).toHaveTextContent(
        '403 PERMISSION_DENIED: Discovery Engine API has not been used in project'
      );
    });
  });

  describe('ProjectEngineSelector error surfacing', () => {
    it('surfaces an inline alert (project-engine-selector-error) when listing engines fails while keeping manual input editable', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(apiService, 'listResources').mockRejectedValue(
        new Error('403 PERMISSION_DENIED: Discovery Engine API disabled on project demo-proj')
      );

      const handleChange = vi.fn();
      render(
        React.createElement(ProjectEngineSelector, {
          title: 'Target Environment',
          value: { project: 'demo-proj', location: 'global', engine: 'default_engine' },
          onChange: handleChange,
        })
      );

      const alertEl = await screen.findByTestId('project-engine-selector-error');
      expect(alertEl).toBeInTheDocument();
      expect(alertEl).toHaveAttribute('role', 'alert');
      expect(alertEl).toHaveTextContent(
        '403 PERMISSION_DENIED: Discovery Engine API disabled on project demo-proj'
      );

      // Manual App ID input remains usable
      const manualInput = screen.getByPlaceholderText('default_engine');
      fireEvent.change(manualInput, { target: { value: 'custom-engine-id' } });
      expect(handleChange).toHaveBeenCalledWith({
        project: 'demo-proj',
        location: 'global',
        engine: 'custom-engine-id',
      });
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
