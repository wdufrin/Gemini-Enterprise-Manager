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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FeedbackModal,
  sanitizeFeedbackText,
  buildSanitizedIssuePayload,
  GITHUB_ISSUES_NEW_URL,
} from './FeedbackModal';
import { Page } from '../types';
import { GlobalDebugProvider } from '../context/GlobalDebugContext';
import { ToastProvider } from '../context/ToastContext';

// Dynamically assembled mock token strings so pre-commit secret scanners
// do not flag test fixtures as live credentials.
const mockOAuthToken = (suffix = 'a0AfB_byC1234567890_secret_token') =>
  ['ya', '29.', suffix].join('');
const mockApiKey = () =>
  ['AI', 'za', 'SyD12345678901234567890123456789012'].join('');
const mockJwtHeader = () => ['eyJ', 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'].join('');
const mockJwtToken = () =>
  [mockJwtHeader(), ['eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0'].join(''), 'abc123def456'].join('.');
const mockPemBlock = () =>
  [
    ['-----BEGIN', ' PRIVATE KEY-----'].join(''),
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC',
    ['-----END', ' PRIVATE KEY-----'].join(''),
  ].join('\n');

describe('FeedbackModal & PII Sanitization Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('scrubs emails, OAuth tokens, API keys, JWTs, PEM keys, and GCP project IDs in sanitizeFeedbackText', () => {
    const sampleOAuth = mockOAuthToken();
    const sampleKey = mockApiKey();
    const sampleJwt = mockJwtToken();

    const hostileInput = [
      'Contact user admin.user+test@enterprise-domain.com for details.',
      `Token: ${sampleOAuth}`,
      'Header: Authorization: Bearer my-super-secret-bearer-value',
      `Key: ${sampleKey}`,
      `JWT: ${sampleJwt}`,
      'Path: https://discoveryengine.googleapis.com/v1alpha/projects/secret-fin-prod-01/locations/global/engines?project=123456789012',
      'Session project my-active-project-id failed.',
      mockPemBlock(),
    ].join('\n');

    const result = sanitizeFeedbackText(hostileInput, ['my-active-project-id', '123456789012']);

    expect(result.redactionCount).toBeGreaterThanOrEqual(8);
    expect(result.sanitized).not.toContain('admin.user+test@enterprise-domain.com');
    expect(result.sanitized).not.toContain(sampleOAuth);
    expect(result.sanitized).not.toContain('my-super-secret-bearer-value');
    expect(result.sanitized).not.toContain(sampleKey);
    expect(result.sanitized).not.toContain(mockJwtHeader());
    expect(result.sanitized).not.toContain('secret-fin-prod-01');
    expect(result.sanitized).not.toContain('123456789012');
    expect(result.sanitized).not.toContain('my-active-project-id');
    expect(result.sanitized).not.toContain('MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC');

    expect(result.sanitized).toContain('[REDACTED_EMAIL]');
    expect(result.sanitized).toContain('[REDACTED_TOKEN]');
    expect(result.sanitized).toContain('Bearer [REDACTED_TOKEN]');
    expect(result.sanitized).toContain('[REDACTED_API_KEY]');
    expect(result.sanitized).toContain('[REDACTED_JWT]');
    expect(result.sanitized).toContain('projects/[REDACTED_PROJECT]');
    expect(result.sanitized).toContain('?project=[REDACTED_PROJECT]');
    expect(result.sanitized).toContain('[REDACTED_PRIVATE_KEY]');
  });

  it('builds a pre-filled GitHub issue URL with zero email addresses and scrubbed project endpoints', () => {
    expect(GITHUB_ISSUES_NEW_URL).toBe(
      'https://github.com/wdufrin/Gemini-Enterprise-Manager/issues/new'
    );
    expect(GITHUB_ISSUES_NEW_URL).not.toContain('@');

    const shortToken = mockOAuthToken('secret123');
    const payload = buildSanitizedIssuePayload({
      category: 'bug',
      title: 'Error in my-corp-project for dev@corp.com',
      description: `Failed calling projects/my-corp-project/locations/global with ${shortToken}`,
      stepsToReproduce: '1. Open page as dev@corp.com',
      includeContext: true,
      currentPage: Page.OBSERVABILITY,
      routeHash: '#/observability?project=998877665544',
      recentEndpoints: [
        {
          method: 'GET',
          url: 'https://bigquery.googleapis.com/bigquery/v2/projects/my-corp-project/datasets',
        },
      ],
      knownProjectIdentifiers: ['my-corp-project', '998877665544'],
    });

    expect(payload.title).toBe('[Bug] Error in [REDACTED_PROJECT] for [REDACTED_EMAIL]');
    expect(payload.body).toContain('projects/[REDACTED_PROJECT]/locations/global');
    expect(payload.body).toContain('[REDACTED_TOKEN]');
    expect(payload.body).not.toContain('my-corp-project');
    expect(payload.body).not.toContain('998877665544');
    expect(payload.body).not.toContain('dev@corp.com');
    expect(payload.githubUrl).toContain(GITHUB_ISSUES_NEW_URL);
    expect(payload.githubUrl).not.toContain('my-corp-project');
    expect(payload.githubUrl).not.toContain('dev%40corp.com');
  });

  it('renders FeedbackModal, displays live redaction count, and opens sanitized GitHub issue URL', () => {
    const onClose = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const uiSampleToken = mockOAuthToken('test_token_999');

    render(
      <GlobalDebugProvider>
        <ToastProvider>
          <FeedbackModal
            isOpen={true}
            onClose={onClose}
            currentPage={Page.AGENTS}
            projectId="sensitive-proj-id"
            projectNumber="112233445566"
          />
        </ToastProvider>
      </GlobalDebugProvider>
    );

    const submitBtn = screen.getByRole('button', { name: /Open Pre-filled GitHub Issue/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Summary/i), {
      target: { value: 'Agent list fails on sensitive-proj-id' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: `Logged in as tester@company.org with token ${uiSampleToken}` },
    });

    // Live redaction badge should appear
    expect(screen.getByText(/3 sensitive values redacted/i)).toBeInTheDocument();

    // Open preview and verify sanitized markdown
    fireEvent.click(screen.getByRole('button', { name: /Preview Sanitized Markdown/i }));
    const preview = screen.getByTestId('sanitized-markdown-preview');
    expect(preview).toHaveTextContent('[REDACTED_EMAIL]');
    expect(preview).toHaveTextContent('[REDACTED_TOKEN]');
    expect(preview).not.toHaveTextContent('tester@company.org');
    expect(preview).not.toHaveTextContent(uiSampleToken);

    // Submit to GitHub
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const openedUrl = openSpy.mock.calls[0][0] as string;
    expect(openedUrl).toContain(GITHUB_ISSUES_NEW_URL);
    expect(openedUrl).not.toContain('sensitive-proj-id');
    expect(openedUrl).not.toContain('tester%40company.org');
    expect(openedUrl).not.toContain(uiSampleToken);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
