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

import React from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { Page } from '../types';

interface BreadcrumbsProps {
  currentPage: Page;
  context?: unknown;
  onSelectPage?: (page: Page) => void;
}

const SUB_TAB_LABELS: Record<string, string> = {
  // Connectors & Data Stores
  connectors: 'Enterprise Connectors',
  datastores: 'Data Stores',
  // GE Agent Manager
  list: 'Registered Agents',
  'bulk-datasources': 'Bulk Update',
  // Engines & Assistants
  overview: 'Overview',
  agents: 'Agents',
  skills: 'Skills',
  memories: 'User Memories',
  connected_datastores: 'Connected DataStores',
  notebooks: 'Notebooks',
  history: 'History',
  customize: 'Domains & Vanity URLs',
  // ADK Studio
  adk: 'ADK Agent (Engine)',
  a2a: 'A2A Function (Cloud Run)',
  // Latency Lab
  benchmark: 'Latency Benchmark',
  'skill-ab': 'Skill A/B Lab',
  'fan-out': 'Fan-Out Inspector',
  // AI Developer Tools
  core: 'Agents & IDE',
  governance: 'Browser & Plugins',
  mcp: 'MCP Policy',
  models: 'Models & Residency',
  // Model Armor
  logs: 'Activity Logs',
  policies: 'Policy Configuration',
  floor_and_tester: 'Floor Settings & Live Tester',
  // App Config Audit
  parity: 'Drift & Parity Audit',
  promotion: 'Agent Promotion (dev -> prod)',
  'audit-logs': 'Cloud Audit Logs',
  // Observability
  live: 'Live Activity',
  operational: 'Operational Analytics',
  policy: 'Telemetry Governance',
  // Quota & FinOps
  quota: 'Quota Simulator',
  finops: 'FinOps Cloud Billing',
  // Licenses
  user_licenses: 'User Assignments',
  allocations: 'Allocation Management',
  user_store_policy: 'Auto-Licensing & Overage',
  group_assignments: 'Group Assignments',
  automated_pruner: 'Automated License Pruner',
  // Authorizations
  credentials: 'OAuth Credentials',
  'wif-validator': 'Workforce Pool Validator',
};

const RouterSearchReader: React.FC<{ onSearch: (search: string) => void }> = ({ onSearch }) => {
  const loc = useLocation();
  React.useEffect(() => {
    onSearch(loc.search);
  }, [loc.search, onSearch]);
  return null;
};

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ currentPage, context, onSelectPage }) => {
  const inRouter = useInRouterContext();
  const [search, setSearch] = React.useState('');

  let detailLabel = '';
  if (context && typeof context === 'object') {
    const ctx = context as { displayName?: string; name?: string };
    if (ctx.displayName) {
      detailLabel = ctx.displayName;
    } else if (ctx.name) {
      detailLabel = ctx.name.split('/').pop() || '';
    }
  }

  let subTabLabel = '';
  if (search) {
    const params = new URLSearchParams(search);
    const rawTab = params.get('tab');
    if (rawTab && SUB_TAB_LABELS[rawTab]) {
      subTabLabel = SUB_TAB_LABELS[rawTab];
    }
  }

  const trailingCrumb = detailLabel || subTabLabel;
  const hasTrailing = Boolean(trailingCrumb);

  const items: Array<{ label: string; active: boolean; onClick?: () => void }> = [
    { label: 'Control Plane', active: false },
    {
      label: currentPage,
      active: !hasTrailing,
      onClick: hasTrailing && onSelectPage ? () => onSelectPage(currentPage) : undefined,
    },
  ];

  if (hasTrailing) {
    items.push({ label: trailingCrumb, active: true });
  }

  return (
    <nav className="flex min-w-0 overflow-hidden" aria-label="Breadcrumb">
      {inRouter && <RouterSearchReader onSearch={setSearch} />}
      <ol className="inline-flex items-center space-x-1 md:space-x-1.5 min-w-0">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="inline-flex items-center min-w-0">
            {index > 0 && (
              <svg
                className="w-4 h-4 text-gray-500 mx-0.5 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                title={`Return to ${item.label}`}
                className="inline-block truncate max-w-[140px] sm:max-w-[180px] lg:max-w-[220px] text-xs sm:text-sm font-medium text-gray-400 hover:text-white transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {item.label}
              </button>
            ) : (
              <span
                title={item.label}
                aria-current={item.active ? 'page' : undefined}
                className={`inline-block truncate max-w-[140px] sm:max-w-[180px] lg:max-w-[240px] xl:max-w-[300px] text-xs sm:text-sm font-medium ${
                  item.active ? 'text-white font-semibold' : 'text-gray-400'
                }`}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
