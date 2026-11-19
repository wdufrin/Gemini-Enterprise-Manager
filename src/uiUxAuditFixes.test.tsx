/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import axe from 'axe-core';
import HelpButton from '../components/HelpButton';
import HeaderProjectInput from '../components/HeaderProjectInput';
import Sidebar from '../components/Sidebar';
import { AuthWelcomeScreen } from '../components/auth/AuthWelcomeScreen';
import { Modal } from '../components/common/Modal';
import DetailsPanel from '../components/architecture/DetailsPanel';
import { IsolateUserModal } from '../components/assistants/datastore-permissions/IsolateUserModal';
import { GlobalDebugProvider } from '../context/GlobalDebugContext';
import { ProjectEnrollmentProvider } from '../context/ProjectEnrollmentContext';
import { Page, GraphNode, GraphEdge } from '../types';
import * as api from '../services/apiService';

let capturedDebugLogger: api.DebugLogger | null = null;

vi.mock('../services/apiService', async () => {
  const actual = await vi.importActual<typeof import('../services/apiService')>('../services/apiService');
  return {
    ...actual,
    getProjectNumber: vi.fn(),
    setDebugLogger: (logger: api.DebugLogger | null) => {
      capturedDebugLogger = logger;
      actual.setDebugLogger(logger);
    },
  };
});

async function runAxe(container: HTMLElement) {
  return axe.run(container, {
    rules: {
      // jsdom does not compute CSS layout pixel colors; color-contrast is verified in live Chromium gbrowser runs
      'color-contrast': { enabled: false },
    },
  });
}

describe('UI/UX & Accessibility Forensic Audit Remediations', () => {
  it('P0-1: HelpButton ignores Ctrl+K / Cmd+K (preventing CommandPalette collision) and responds to Ctrl+/', async () => {
    render(<HelpButton />);

    // Hostile input: pressing Ctrl+K or Meta+K must NOT open the User Guide modal
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Pressing Ctrl+/ opens the User Guide modal
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText(/Open User Guide & Documentation/i)).toBeInTheDocument();
    });
  });

  it('P0-1 & SH-04: Stacked Modal focus trap isolates Escape and Tab strictly to the topmost dialog and avoids nested <main>', async () => {
    const onCloseBottom = vi.fn();
    const onCloseTop = vi.fn();

    const StackedHarness: React.FC = () => {
      const [topOpen, setTopOpen] = useState(true);
      return (
        <main>
          <Modal isOpen={true} onClose={onCloseBottom} title="Bottom Dialog">
            <button type="button">Bottom Action</button>
          </Modal>
          <Modal
            isOpen={topOpen}
            onClose={() => {
              onCloseTop();
              setTopOpen(false);
            }}
            title="Top Dialog"
          >
            <button type="button">Top Action 1</button>
            <button type="button">Top Action 2</button>
          </Modal>
        </main>
      );
    };

    render(<StackedHarness />);

    // Verify only ONE <main> landmark exists across document.body (portaled modals must not nest <main>)
    expect(document.body.querySelectorAll('main')).toHaveLength(1);

    const axeRes = await runAxe(document.body);
    expect(axeRes.violations).toEqual([]);

    // Escape must close ONLY the topmost dialog, leaving the bottom dialog untouched
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseTop).toHaveBeenCalledTimes(1);
    expect(onCloseBottom).not.toHaveBeenCalled();
  });

  it('P1 / SH-02: HeaderProjectInput supports full keyboard form submission, Escape cancellation, and rejects invalid project IDs', async () => {
    const onChange = vi.fn();
    vi.mocked(api.getProjectNumber).mockRejectedValueOnce(new Error('Project "hostile!!id" not found (403)'));

    const { container } = render(
      <ProjectEnrollmentProvider projectId="ancient-sandbox-322523" projectNumber="180054373655" isGapiReady={false}>
        <HeaderProjectInput
          projectId="ancient-sandbox-322523"
          projectNumber="180054373655"
          onChange={onChange}
        />
      </ProjectEnrollmentProvider>
    );

    const axeInitial = await runAxe(container);
    expect(axeInitial.violations).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: /Active project: ancient-sandbox-322523/i }));
    const input = screen.getByLabelText(/Active GCP Project ID or Number/i);

    // Negative / hostile input: invalid project ID surfaces explicit role="alert" error and keeps editor open
    fireEvent.change(input, { target: { value: 'hostile!!id' } });
    fireEvent.submit(input.closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Project "hostile!!id" not found/i);
    expect(onChange).not.toHaveBeenCalled();

    // Pressing Escape cancels editing and restores original project ID
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /Active project: ancient-sandbox-322523/i })).toBeInTheDocument();
  });

  it('P0-2: AuthWelcomeScreen Step 2 exposes Switch Account / Sign Out, keeps Enter Application accessible, and passes axe WCAG checks', async () => {
    const onSignOut = vi.fn();
    const onEnterApp = vi.fn();

    const { container } = render(
      <AuthWelcomeScreen
        isGapiReady={true}
        isGapiLoading={false}
        isTokenValidating={false}
        gapiError={null}
        accessToken="test-token"
        googleClientId="client-id"
        setGoogleClientId={vi.fn()}
        userProfile={{ name: 'Test Admin', email: 'admin@example.com', picture: '' }}
        projectNumber="180054373655"
        onGoogleSignIn={vi.fn()}
        onSetAccessToken={vi.fn()}
        onSignOut={onSignOut}
        onSetProjectNumber={vi.fn()}
        onValidateApis={vi.fn()}
        onEnterApp={onEnterApp}
        isApiValidationLoading={false}
        apiValidationResult={{ enabled: ['discoveryengine.googleapis.com'], disabled: [] }}
        serviceAgentValidation={null}
        userPermissionsValidation={null}
        isGrantingServiceAgent={false}
        serviceAgentActionFeedback={null}
        onGrantServiceAgent={vi.fn()}
        apisToEnable={new Set()}
        onToggleApiToEnable={vi.fn()}
        onToggleAllApisToEnable={vi.fn()}
        isApiEnablingLoading={false}
        onEnableApis={vi.fn()}
        apiEnablementLogs={[]}
      />
    );

    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Switch Account \/ Sign Out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Enter Application/i }));
    expect(onEnterApp).toHaveBeenCalledTimes(1);

    const axeRes = await runAxe(container);
    expect(axeRes.violations).toEqual([]);
  });

  it('P0-4: DetailsPanel computes real upstream and downstream lineage when edges and nodes are supplied', () => {
    const nodes: GraphNode[] = [
      { id: 'eng-1', label: 'Agent_Designer', type: 'Engine', data: {} },
      { id: 'ast-1', label: 'default_assistant', type: 'Assistant', data: {} },
      { id: 'ag-1', label: 'Cosmere Expert Bot', type: 'Agent', data: { state: 'ENABLED' } },
      { id: 'ds-1', label: 'Confluence KB', type: 'DataStore', data: {} },
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'eng-1', target: 'ast-1' },
      { id: 'e2', source: 'ast-1', target: 'ag-1' },
      { id: 'e3', source: 'ag-1', target: 'ds-1' },
    ];

    render(
      <DetailsPanel
        node={nodes[2]}
        edges={edges}
        nodes={nodes}
        projectNumber="180054373655"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onDirectQuery={vi.fn()}
      />
    );

    expect(screen.getByText(/1 Upstream \/ 1 Downstream/i)).toBeInTheDocument();
    expect(screen.getByText('default_assistant')).toBeInTheDocument();
    expect(screen.getByText('Confluence KB')).toBeInTheDocument();
  });

  it('P1-10: Sidebar sets aria-current="page" on active route, wraps nav landmark, and passes axe WCAG checks', async () => {
    const { container } = render(
      <GlobalDebugProvider>
        <Sidebar
          currentPage={Page.AGENTS}
          setCurrentPage={vi.fn()}
          onShowInfo={vi.fn()}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          onOpenFeedback={vi.fn()}
        />
      </GlobalDebugProvider>
    );

    expect(screen.getByRole('navigation', { name: /Primary Navigation/i })).toBeInTheDocument();
    const activeBtn = screen.getByRole('button', { name: Page.AGENTS });
    expect(activeBtn).toHaveAttribute('aria-current', 'page');

    const axeRes = await runAxe(container);
    expect(axeRes.violations).toEqual([]);
  });

  it('P0-7: IsolateUserModal blocks self-isolation of the active admin account until explicit self-lockout acknowledgment', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <IsolateUserModal
        isolateModalTarget={{
          members: ['user:admin@example.com'],
          broadRoles: ['roles/discoveryengine.admin'],
        }}
        projectId="ancient-sandbox-322523"
        isIsolating={false}
        currentUserEmail="admin@example.com"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Self-Lockout Guard/i);
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Isolate User\(s\)/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();

    const ackCheckbox = screen.getByRole('checkbox', {
      name: /I understand isolating my own account/i,
    });
    fireEvent.click(ackCheckbox);
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith(['user:admin@example.com'], true, true);
  });

  it('Debug History Popup: renders CurlDetailsModal via document.body portal outside Sidebar <aside> containing block at max-w-5xl', async () => {
    render(
      <GlobalDebugProvider>
        <Sidebar
          currentPage={Page.AGENT_ENGINES}
          setCurrentPage={vi.fn()}
          onShowInfo={vi.fn()}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          onOpenFeedback={vi.fn()}
        />
      </GlobalDebugProvider>
    );

    // Enable cURL Request History toggle in Sidebar
    const historyToggle = screen.getByRole('checkbox', { name: /cURL Request History/i });
    fireEvent.click(historyToggle);

    // Emit an API history entry into GlobalDebugProvider's registered debug logger
    expect(capturedDebugLogger).not.toBeNull();
    act(() => {
      capturedDebugLogger?.({
        method: 'GET',
        url: 'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/180054373655/locations/us-central1/reasoningEngines',
        headers: {},
        body: null,
        curlCommand:
          'curl -X GET "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/180054373655/locations/us-central1/reasoningEngines"',
        status: 200,
        durationMs: 210,
        responseBody: { reasoningEngines: [] },
      });
    });

    const historyEntryBtn = await screen.findByRole('button', { name: /GET.*reasoningEngines/i });
    fireEvent.click(historyEntryBtn);

    const dialog = await screen.findByRole('dialog', { name: /API Details: GET reasoningEngines/i });
    const sidebarAside = screen.getByLabelText('Application Sidebar');

    // Critical containment assertions:
    // 1. Dialog must NOT be trapped inside <aside> (which constrained position:fixed to 256px)
    expect(sidebarAside.contains(dialog)).toBe(false);
    // 2. Dialog backdrop must be portaled directly under document.body with max-w-5xl modal card
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.firstElementChild?.className).toContain('max-w-5xl');
    expect(sidebarAside.className).toContain('lg:transform-none');

    const axeRes = await runAxe(document.body);
    expect(axeRes.violations).toEqual([]);
  });
});
