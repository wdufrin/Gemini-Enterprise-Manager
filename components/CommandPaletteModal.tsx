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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Page } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { useGlobalDebug } from '../context/GlobalDebugContext';

export interface CommandPaletteItem {
  id: string;
  label: string;
  category: string;
  description: string;
  keywords: string[];
  action: () => void;
  badge?: string;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onNavigateRoute?: (routeWithQuery: string) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenFeedback?: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  currentPage,
  onNavigate,
  onNavigateRoute,
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenFeedback,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showCurlPreview, setShowCurlPreview } = useGlobalDebug();

  useModalA11y({
    isOpen,
    onClose,
    containerRef: modalRef,
    initialFocusRef: inputRef,
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const items: CommandPaletteItem[] = useMemo(() => {
    const goSubRoute = (routeWithQuery: string, fallbackPage: Page) => {
      if (onNavigateRoute) {
        onNavigateRoute(routeWithQuery);
      } else {
        onNavigate(fallbackPage);
      }
    };

    return [
      // 1. Apps & Agents
      {
        id: 'nav-assistant',
        label: Page.ASSISTANT,
        category: 'Apps & Agents',
        description:
          'Configure Gemini Enterprise Apps, Assistants, StreamAssist Playground, Vanity URLs, and Web Widgets',
        keywords: [
          'engines',
          'assistants',
          'apps',
          'playground',
          'chat',
          'vanity urls',
          'domains',
          'prompt chips',
          'memories',
        ],
        badge: currentPage === Page.ASSISTANT ? 'Current' : undefined,
        action: () => onNavigate(Page.ASSISTANT),
      },
      {
        id: 'nav-agents',
        label: Page.AGENTS,
        category: 'Apps & Agents',
        description:
          'Manage, register, inspect, shadow-evaluate, and bulk-update Gemini Enterprise agents',
        keywords: [
          'agents',
          'fleet',
          'catalog',
          'register',
          'deep research',
          'marketplace',
          'shadow eval',
        ],
        badge: currentPage === Page.AGENTS ? 'Current' : undefined,
        action: () => onNavigate(Page.AGENTS),
      },
      {
        id: 'nav-runtimes',
        label: Page.AGENT_ENGINES,
        category: 'Apps & Agents',
        description:
          'Inspect Vertex AI Reasoning Engines, Cloud Run services, A2A cards, and session counts',
        keywords: ['runtimes', 'reasoning engines', 'cloud run', 'dialogflow', 'a2a', 'vertex'],
        badge: currentPage === Page.AGENT_ENGINES ? 'Current' : undefined,
        action: () => onNavigate(Page.AGENT_ENGINES),
      },
      {
        id: 'nav-skills',
        label: Page.SKILLS_REGISTRY,
        category: 'Apps & Agents',
        description:
          'Browse, publish, scan, and deploy enterprise ADK agent skills and governance policies',
        keywords: ['skills', 'registry', 'instructions', 'markdown', 'github', 'scan'],
        badge: currentPage === Page.SKILLS_REGISTRY ? 'Current' : undefined,
        action: () => onNavigate(Page.SKILLS_REGISTRY),
      },
      {
        id: 'nav-architecture',
        label: Page.ARCHITECTURE,
        category: 'Apps & Agents',
        description:
          'Explore interactive resource topology graph and lineage table across Apps, Assistants, Agents, and Data Stores',
        keywords: ['architecture', 'graph', 'topology', 'diagram', 'relationships', 'lineage'],
        badge: currentPage === Page.ARCHITECTURE ? 'Current' : undefined,
        action: () => onNavigate(Page.ARCHITECTURE),
      },

      // 2. Knowledge & Integrations
      {
        id: 'nav-datastores',
        label: Page.DATA_STORES,
        category: 'Knowledge & Integrations',
        description:
          'Manage Discovery Engine Data Stores, document imports, Enterprise Connectors, and BYO MCP servers',
        keywords: ['data stores', 'rag', 'collections', 'search', 'documents', 'schema'],
        badge: currentPage === Page.DATA_STORES ? 'Current' : undefined,
        action: () => goSubRoute('/datastores?tab=datastores', Page.DATA_STORES),
      },
      {
        id: 'sub-connectors',
        label: 'Enterprise Connectors & BYO MCP',
        category: 'Knowledge & Integrations',
        description:
          'Inspect 3P SaaS Connectors, create BYO MCP servers, view GCS dead-letter logs, and configure sync alerts',
        keywords: [
          'connectors',
          'byomcp',
          'mcp',
          'dead letter',
          'sla',
          'sync alerts',
          'jira',
          'sharepoint',
          'confluence',
        ],
        badge: 'Sub-Tab',
        action: () => goSubRoute('/datastores?tab=connectors', Page.DATA_STORES),
      },

      // 3. Build & Evaluation
      {
        id: 'nav-builder',
        label: Page.AGENT_BUILDER,
        category: 'Build & Evaluation',
        description:
          'Design, scaffold, and deploy custom ADK agents to Vertex AI Agent Engine or Cloud Run',
        keywords: ['adk', 'studio', 'builder', 'deploy', 'scaffold', 'code', 'prototyper'],
        badge: currentPage === Page.AGENT_BUILDER ? 'Current' : undefined,
        action: () => onNavigate(Page.AGENT_BUILDER),
      },
      {
        id: 'nav-latency-lab',
        label: Page.LATENCY_LAB,
        category: 'Build & Evaluation',
        description:
          'Run live :streamAssist latency benchmarks, Before/After Skill A/B tests, and fan-out diagnostics',
        keywords: [
          'latency',
          'benchmark',
          'performance',
          'ttfb',
          'streamassist',
          'ab test',
          'skills',
          'fanout',
        ],
        badge: currentPage === Page.LATENCY_LAB ? 'Current' : undefined,
        action: () => onNavigate(Page.LATENCY_LAB),
      },
      {
        id: 'nav-devtools',
        label: Page.DEV_TOOLS,
        category: 'Build & Evaluation',
        description:
          'Configure singleton AI Developer Tools & Google Antigravity governance, MCP allowlists, and residency policies',
        keywords: [
          'ai developer tools',
          'devtools',
          'antigravity',
          'ide',
          'mcp policy',
          'plugins',
          'browser config',
          'residency',
        ],
        badge: currentPage === Page.DEV_TOOLS ? 'Current' : undefined,
        action: () => onNavigate(Page.DEV_TOOLS),
      },

      // 4. Security & Governance
      {
        id: 'nav-authorizations',
        label: Page.AUTHORIZATIONS,
        category: 'Security & Governance',
        description:
          'Create and manage OAuth 2.0 client authorizations and Secret Manager bindings for enterprise agents',
        keywords: [
          'oauth',
          'authorizations',
          'tokens',
          'credentials',
          'secret manager',
          'workforce pool',
          'client id',
        ],
        badge: currentPage === Page.AUTHORIZATIONS ? 'Current' : undefined,
        action: () => onNavigate(Page.AUTHORIZATIONS),
      },
      {
        id: 'nav-permissions',
        label: Page.AGENT_PERMISSIONS,
        category: 'Security & Governance',
        description:
          'Audit and export effective IAM policy bindings across all Gemini Enterprise agents',
        keywords: ['iam', 'permissions', 'roles', 'access', 'bindings', 'export', 'rbac'],
        badge: currentPage === Page.AGENT_PERMISSIONS ? 'Current' : undefined,
        action: () => onNavigate(Page.AGENT_PERMISSIONS),
      },
      {
        id: 'nav-model-armor',
        label: Page.MODEL_ARMOR,
        category: 'Security & Governance',
        description:
          'Configure Model Armor safety templates, prompt injection shields, floor settings, and live sanitization probes',
        keywords: [
          'model armor',
          'safety',
          'guardrails',
          'jailbreak',
          'pii',
          'sdp',
          'security',
          'floor settings',
          'sanitize',
        ],
        badge: currentPage === Page.MODEL_ARMOR ? 'Current' : undefined,
        action: () => onNavigate(Page.MODEL_ARMOR),
      },
      {
        id: 'nav-audit',
        label: Page.CONFIG_AUDIT,
        category: 'Security & Governance',
        description:
          'Compare environment parity drift, export Terraform (.tf), promote dev->prod agents, and inspect Cloud Audit Logs',
        keywords: [
          'config audit',
          'drift',
          'parity',
          'terraform',
          'hcl',
          'promotion',
          'compliance',
          'diagnostics',
        ],
        badge: currentPage === Page.CONFIG_AUDIT ? 'Current' : undefined,
        action: () => onNavigate(Page.CONFIG_AUDIT),
      },
      {
        id: 'sub-audit-logs',
        label: 'Cloud Audit Logs (Admin Trail)',
        category: 'Security & Governance',
        description:
          'Query real cloudaudit.googleapis.com/activity entries across Discovery Engine, Model Armor, Vertex AI, and IAM',
        keywords: ['cloud audit logs', 'admin trail', 'cloudaudit', 'activity logs', 'who changed'],
        badge: 'Sub-Tab',
        action: () => goSubRoute('/config-audit?tab=audit-logs', Page.CONFIG_AUDIT),
      },
      {
        id: 'sub-agent-promotion',
        label: 'Cross-Project Agent Promotion (dev -> prod)',
        category: 'Security & Governance',
        description:
          'Diff and promote selected agents across environments with automatic target engine path rewriting',
        keywords: ['promotion', 'dev to prod', 'cutover', 'migrate agents'],
        badge: 'Sub-Tab',
        action: () => goSubRoute('/config-audit?tab=promotion', Page.CONFIG_AUDIT),
      },

      // 5. Operations & FinOps
      {
        id: 'nav-observability',
        label: Page.OBSERVABILITY,
        category: 'Operations & FinOps',
        description:
          'Analyze BigQuery operational views, Cloud Logging traces, token usage, and user feedback',
        keywords: [
          'observability',
          'telemetry',
          'bigquery',
          'logs',
          'traces',
          'analytics',
          'metrics',
          'feedback',
        ],
        badge: currentPage === Page.OBSERVABILITY ? 'Current' : undefined,
        action: () => onNavigate(Page.OBSERVABILITY),
      },
      {
        id: 'nav-quota',
        label: Page.GE_QUOTA_USAGE,
        category: 'Operations & FinOps',
        description:
          'Monitor Cloud Monitoring quota utilization, simulate capacity, and query FinOps BigQuery Billing exports',
        keywords: ['quota', 'cost', 'pricing', 'estimator', 'limits', 'qpm'],
        badge: currentPage === Page.GE_QUOTA_USAGE ? 'Current' : undefined,
        action: () => onNavigate(Page.GE_QUOTA_USAGE),
      },
      {
        id: 'sub-finops',
        label: 'FinOps Cloud Billing Export (BigQuery)',
        category: 'Operations & FinOps',
        description:
          'Query real Month-to-Date net GCP SKU spend with dry-run byte guardrails from BigQuery billing tables',
        keywords: ['finops', 'billing export', 'mtd spend', 'sku cost', 'bigquery billing'],
        badge: 'Sub-Tab',
        action: () => goSubRoute('/quota?tab=finops', Page.GE_QUOTA_USAGE),
      },
      {
        id: 'nav-licenses',
        label: Page.LICENSE,
        category: 'Operations & FinOps',
        description:
          'Manage user license assignments, CSV bulk onboarding, billing allocations, overage policy, and auto-pruner',
        keywords: [
          'licenses',
          'seats',
          'users',
          'billing',
          'subscriptions',
          'csv bulk',
          'overage',
          'payg',
          'userstore',
        ],
        badge: currentPage === Page.LICENSE ? 'Current' : undefined,
        action: () => onNavigate(Page.LICENSE),
      },
      {
        id: 'sub-license-pruner',
        label: 'Automated License Pruner',
        category: 'Operations & FinOps',
        description:
          'Deploy scheduled Cloud Run Functions + Cloud Scheduler job to reclaim inactive Gemini Enterprise seats',
        keywords: ['pruner', 'reclaim seats', 'inactive users', 'auto pruner'],
        badge: 'Sub-Tab',
        action: () => goSubRoute('/licenses?tab=automated_pruner', Page.LICENSE),
      },
      {
        id: 'sub-vanity-urls',
        label: 'Domains & Vanity URLs (GLB / Private PSC)',
        category: 'Apps & Agents',
        description:
          'Configure custom corporate domains, Global Load Balancers, Private Service Connect, and Terraform HCL',
        keywords: ['vanity urls', 'custom domains', 'dns', 'psc', 'load balancer', 'ssl'],
        badge: 'Sub-Tab',
        action: () => goSubRoute('/assistant?tab=customize', Page.ASSISTANT),
      },
      {
        id: 'nav-backup',
        label: Page.BACKUP_RECOVERY,
        category: 'Operations & FinOps',
        description:
          'Create GCS snapshots, export/import configurations, and restore Discovery Engine & Vertex AI resources',
        keywords: ['backup', 'recovery', 'restore', 'snapshot', 'export', 'import', 'gcs', 'dr'],
        badge: currentPage === Page.BACKUP_RECOVERY ? 'Current' : undefined,
        action: () => onNavigate(Page.BACKUP_RECOVERY),
      },

      // Quick Actions
      {
        id: 'action-toggle-sidebar',
        label: isSidebarCollapsed ? 'Expand Sidebar Navigation' : 'Collapse Sidebar Navigation',
        category: 'Quick Actions',
        description: 'Toggle the left navigation rail between full labels and compact icon rail',
        keywords: ['sidebar', 'collapse', 'expand', 'navigation', 'layout'],
        action: () => onToggleSidebar(),
      },
      {
        id: 'action-toggle-curl',
        label: showCurlPreview
          ? 'Disable API Request History Recording'
          : 'Enable API Request History Recording',
        category: 'Quick Actions',
        description:
          'Toggle recording of outgoing REST requests and cURL commands in the sidebar History panel',
        keywords: ['curl', 'debug', 'history', 'api', 'requests', 'interaction details'],
        badge: showCurlPreview ? 'ON' : 'OFF',
        action: () => setShowCurlPreview(!showCurlPreview),
      },
      {
        id: 'action-open-docs',
        label: 'Open User Guide & Documentation',
        category: 'Quick Actions',
        description:
          'View in-app setup guides, architecture documentation, and troubleshooting manuals',
        keywords: ['docs', 'help', 'manual', 'user guide', 'documentation'],
        action: () => window.dispatchEvent(new CustomEvent('gem:open-user-guide')),
      },
      ...(onOpenFeedback
        ? [
            {
              id: 'action-report-feedback',
              label: 'Report Issue or Feedback',
              category: 'Quick Actions',
              description: 'Open the PII-sanitized GitHub Issue and Feedback builder',
              keywords: ['feedback', 'bug', 'issue', 'report', 'github', 'feature request'],
              action: () => onOpenFeedback(),
            },
          ]
        : []),
    ];
  }, [
    currentPage,
    isSidebarCollapsed,
    onNavigate,
    onNavigateRoute,
    onOpenFeedback,
    onToggleSidebar,
    setShowCurlPreview,
    showCurlPreview,
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items
      .map((item, index) => {
        let score = 0;
        const labelLower = item.label.toLowerCase();
        if (labelLower === q) score += 100;
        else if (labelLower.startsWith(q)) score += 75;
        else if (labelLower.includes(q)) score += 55;

        if (item.keywords.some((k) => k.toLowerCase() === q)) score += 60;
        else if (item.keywords.some((k) => k.toLowerCase().includes(q))) score += 40;

        if (item.description.toLowerCase().includes(q)) score += 20;
        if (item.category.toLowerCase().includes(q)) score += 10;

        return { item, score, index };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.item);
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const activeOption = modalRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${selectedIndex}"]`
    );
    if (activeOption && typeof activeOption.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  const activeDescendantId =
    filteredItems.length > 0 && filteredItems[selectedIndex]
      ? `cmd-palette-opt-${filteredItems[selectedIndex].id}`
      : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredItems[selectedIndex];
      if (target) {
        target.action();
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/75 backdrop-blur-sm flex items-start justify-center pt-[12vh] p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[72vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="p-3.5 border-b border-gray-800 flex items-center gap-3 bg-gray-950/60">
          <svg
            className="w-5 h-5 text-blue-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            id="command-palette-title"
            type="text"
            role="combobox"
            aria-expanded={filteredItems.length > 0}
            aria-controls="command-palette-listbox"
            aria-activedescendant={activeDescendantId}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to any page, sub-tab, or action... (e.g., DevTools, Connectors, FinOps, Audit Logs)"
            aria-label="Command Palette Search"
            className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-800 border border-gray-700 rounded shrink-0">
            ESC
          </kbd>
        </div>

        <div className="overflow-y-auto p-2 divide-y divide-gray-800/60 custom-scrollbar">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              No matching pages or actions found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div
              id="command-palette-listbox"
              role="listbox"
              aria-label="Matching pages and actions"
              className="space-y-1"
            >
              {filteredItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    id={`cmd-palette-opt-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-palette-index={idx}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => {
                      item.action();
                      onClose();
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg flex items-center justify-between gap-3 transition-colors ${
                      isSelected
                        ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                        : 'hover:bg-gray-800/70 text-gray-300 border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white truncate">
                          {item.label}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                          {item.category}
                        </span>
                        {item.badge && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/60">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{item.description}</p>
                    </div>
                    <span className="text-xs text-gray-500 font-mono shrink-0">↵</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-gray-950/80 border-t border-gray-800 flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded font-mono text-[10px] text-gray-300">
                ↑↓
              </kbd>{' '}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded font-mono text-[10px] text-gray-300">
                ↵
              </kbd>{' '}
              Select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded font-mono text-[10px] text-gray-300">
                ESC
              </kbd>{' '}
              Close
            </span>
          </div>
          <span className="font-mono text-[10px] text-gray-500">Shortcut: ⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPaletteModal;
