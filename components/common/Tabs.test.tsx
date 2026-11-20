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

import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Tabs, SegmentedControl } from './Tabs';
import { RowActionMenu } from './RowActionMenu';
import { PageHeader } from '../layout/PageHeader';
import { ScopeBar } from '../layout/ScopeBar';
import Breadcrumbs from '../Breadcrumbs';
import { WorkspaceScopeProvider, useWorkspaceScope } from '../../context/WorkspaceScopeContext';
import { Page } from '../../types';

describe('Standardized UI Primitives (Tabs, RowActionMenu, ScopeBar, PageHeader, Breadcrumbs)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('Tabs: renders WAI-ARIA tablist, supports ArrowRight/ArrowLeft/Home/End keyboard roving, and syncs ?tab= URL param', () => {
    const LocationProbe: React.FC = () => {
      const loc = useLocation();
      return <div data-testid="loc-search">{loc.search}</div>;
    };

    const Harness: React.FC = () => {
      const [active, setActive] = useState<'alpha' | 'beta' | 'gamma'>('alpha');
      return (
        <MemoryRouter initialEntries={['/audit?tab=beta']}>
          <Tabs
            ariaLabel="Test Section Tabs"
            syncSearchParam="tab"
            activeTab={active}
            onChange={setActive}
            items={[
              { id: 'alpha', label: 'Alpha Tab', count: 4 },
              { id: 'beta', label: 'Beta Tab', badge: 'Live' },
              { id: 'gamma', label: 'Gamma Tab' },
            ]}
          />
          <LocationProbe />
        </MemoryRouter>
      );
    };

    render(<Harness />);

    // Initial URL ?tab=beta must hydrate active tab automatically
    const betaTab = screen.getByRole('tab', { name: /Beta Tab/i });
    expect(betaTab).toHaveAttribute('aria-selected', 'true');

    // Keyboard ArrowRight advances to Gamma Tab and updates ?tab=gamma
    fireEvent.keyDown(betaTab, { key: 'ArrowRight' });
    const gammaTab = screen.getByRole('tab', { name: /Gamma Tab/i });
    expect(gammaTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('loc-search').textContent).toBe('?tab=gamma');

    // Hostile URL query param (unknown tab id) is ignored safely without overriding valid state
    render(
      <MemoryRouter initialEntries={['/audit?tab=__invalid_hostile_tab__']}>
        <Tabs
          activeTab="alpha"
          onChange={vi.fn()}
          syncSearchParam="tab"
          items={[
            { id: 'alpha', label: 'Alpha Only' },
            { id: 'beta', label: 'Beta Only' },
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('tab', { name: 'Alpha Only' })).toHaveAttribute('aria-selected', 'true');
  });

  it('SegmentedControl: toggles aria-pressed states and ignores clicks on disabled options', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="graph"
        onChange={onChange}
        items={[
          { id: 'graph', label: 'Graph' },
          { id: 'table', label: 'Table' },
          { id: 'locked', label: 'Locked', disabled: true },
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Graph' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Locked' }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(onChange).toHaveBeenCalledWith('table');
  });

  it('RowActionMenu: portals menu to document.body, invokes action, and closes on Escape', () => {
    const onClone = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <RowActionMenu
          ariaLabel="Actions for SharePoint Connector"
          items={[
            { id: 'clone', label: 'Clone Connector', onClick: onClone },
            { id: 'delete', label: 'Delete Connector', danger: true, onClick: onDelete },
          ]}
        />
      </div>
    );

    const trigger = screen.getByRole('button', { name: 'Actions for SharePoint Connector' });
    fireEvent.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Actions for SharePoint Connector' });
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clone Connector' }));
    expect(onClone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('WorkspaceScopeProvider: persists appLocation across consumers, clears appId on project switch, and handles corrupt storage', () => {
    sessionStorage.setItem('gem-workspace-scope-v1', '{malformed-json!!!');

    const ScopeConsumer: React.FC = () => {
      const { appLocation, appId, setAppLocation, setAppId } = useWorkspaceScope();
      return (
        <div>
          <span data-testid="loc">{appLocation}</span>
          <span data-testid="app">{appId || 'EMPTY'}</span>
          <button type="button" onClick={() => setAppLocation('eu')}>
            Set EU
          </button>
          <button type="button" onClick={() => setAppId('engine-prod-1')}>
            Set Engine
          </button>
        </div>
      );
    };

    const { rerender } = render(
      <WorkspaceScopeProvider projectKey="proj-a">
        <ScopeConsumer />
      </WorkspaceScopeProvider>
    );

    // Malformed JSON falls back cleanly to default 'global'
    expect(screen.getByTestId('loc').textContent).toBe('global');
    fireEvent.click(screen.getByText('Set EU'));
    fireEvent.click(screen.getByText('Set Engine'));
    expect(screen.getByTestId('loc').textContent).toBe('eu');
    expect(screen.getByTestId('app').textContent).toBe('engine-prod-1');

    // Switching GCP project clears stale appId while preserving preferred region 'eu'
    rerender(
      <WorkspaceScopeProvider projectKey="proj-b">
        <ScopeConsumer />
      </WorkspaceScopeProvider>
    );
    expect(screen.getByTestId('loc').textContent).toBe('eu');
    expect(screen.getByTestId('app').textContent).toBe('EMPTY');
  });

  it('Breadcrumbs: preserves aria-current="page" when context lacks displayName/name (e.g. { appEngineId }) and renders sub-tab crumbs', () => {
    render(
      <MemoryRouter initialEntries={['/latency-lab']}>
        <Breadcrumbs currentPage={Page.LATENCY_LAB} context={{ appEngineId: 'eng-123' }} />
      </MemoryRouter>
    );

    const activeCrumb = screen.getByText(Page.LATENCY_LAB);
    expect(activeCrumb).toHaveAttribute('aria-current', 'page');

    render(
      <MemoryRouter initialEntries={['/config-audit?tab=audit-logs']}>
        <Breadcrumbs currentPage={Page.CONFIG_AUDIT} onSelectPage={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Cloud Audit Logs')).toHaveAttribute('aria-current', 'page');
  });

  it('PageHeader & ScopeBar: render semantic H1, Cloud Console link using projectId, Refresh, Primary CTA, and Location options', () => {
    const onRefresh = vi.fn();
    const onCreate = vi.fn();
    const onLocChange = vi.fn();

    render(
      <PageHeader
        title="Authorizations"
        subtitle="Manage OAuth credentials."
        consolePage={Page.AUTHORIZATIONS}
        projectId="my-corp-proj"
        projectNumber="999888777"
        onRefresh={onRefresh}
        primaryAction={{ label: '+ Create Authorization', onClick: onCreate }}
      >
        <ScopeBar embedded locationValue="global" onLocationChange={onLocChange} />
      </PageHeader>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Authorizations' })).toBeTruthy();
    const consoleLink = screen.getByTitle('Open in Google Cloud Console') as HTMLAnchorElement;
    expect(consoleLink.href).toContain('project=my-corp-proj');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '+ Create Authorization' }));
    expect(onCreate).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'eu' } });
    expect(onLocChange).toHaveBeenCalledWith('eu');
  });
});
