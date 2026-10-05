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
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenFeedback?: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  currentPage,
  onNavigate,
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

  const items: CommandPaletteItem[] = useMemo(
    () => [
      {
        id: 'nav-agents',
        label: Page.AGENTS,
        category: 'Agent Management',
        description: 'Manage, register, inspect, and test Gemini Enterprise agents and catalog templates',
        keywords: ['agents', 'catalog', 'register', 'deep research', 'marketplace'],
        badge: currentPage === Page.AGENTS ? 'Current' : undefined,
        action: () => onNavigate(Page.AGENTS),
      },
      {
        id: 'nav-skills',
        label: Page.SKILLS_REGISTRY,
        category: 'Agent Management',
        description: 'Browse, import, and validate reusable ADK agent skills and instructions',
        keywords: ['skills', 'registry', 'instructions', 'markdown', 'github'],
        badge: currentPage === Page.SKILLS_REGISTRY ? 'Current' : undefined,
        action: () => onNavigate(Page.SKILLS_REGISTRY),
      },
      {
        id: 'nav-builder',
        label: Page.AGENT_BUILDER,
        category: 'Agent Management',
        description: 'Design, configure, and deploy custom ADK agents to Vertex AI Agent Engine or Cloud Run',
        keywords: ['adk', 'studio', 'builder', 'deploy', 'scaffold', 'code'],
        badge: currentPage === Page.AGENT_BUILDER ? 'Current' : undefined,
        action: () => onNavigate(Page.AGENT_BUILDER),
      },
      {
        id: 'nav-runtimes',
        label: Page.AGENT_ENGINES,
        category: 'Agent Management',
        description: 'Inspect Vertex AI Reasoning Engines, Cloud Run services, A2A cards, and Dialogflow CX',
        keywords: ['runtimes', 'reasoning engines', 'cloud run', 'dialogflow', 'a2a', 'vertex'],
        badge: currentPage === Page.AGENT_ENGINES ? 'Current' : undefined,
        action: () => onNavigate(Page.AGENT_ENGINES),
      },
      {
        id: 'nav-datastores',
        label: Page.DATA_STORES,
        category: 'Knowledge & Resources',
        description: 'Manage Discovery Engine Data Stores, Enterprise Connectors, and BYO MCP servers',
        keywords: ['connectors', 'data stores', 'rag', 'mcp', 'collections', 'search', 'documents'],
        badge: currentPage === Page.DATA_STORES ? 'Current' : undefined,
        action: () => onNavigate(Page.DATA_STORES),
      },
      {
        id: 'nav-quota',
        label: Page.GE_QUOTA_USAGE,
        category: 'Knowledge & Resources',
        description: 'Monitor Cloud Monitoring quota utilization and estimate Gemini Enterprise & Vertex AI costs',
        keywords: ['quota', 'cost', 'pricing', 'estimator', 'limits', 'qpm'],
        badge: currentPage === Page.GE_QUOTA_USAGE ? 'Current' : undefined,
        action: () => onNavigate(Page.GE_QUOTA_USAGE),
      },
      {
        id: 'nav-assistant',
        label: Page.ASSISTANT,
        category: 'Testing & Analysis',
        description: 'Configure App Engines, Assistants, StreamAssist Playground, Vanity URLs, and Web Widgets',
        keywords: ['engines', 'assistants', 'playground', 'chat', 'vanity urls', 'domains', 'prompt chips', 'memories'],
        badge: currentPage === Page.ASSISTANT ? 'Current' : undefined,
        action: () => onNavigate(Page.ASSISTANT),
      },
      {
        id: 'nav-architecture',
        label: Page.ARCHITECTURE,
        category: 'Testing & Analysis',
        description: 'Explore interactive resource topology graph across Apps, Assistants, Agents, and Data Stores',
        keywords: ['architecture', 'graph', 'topology', 'diagram', 'relationships'],
        badge: currentPage === Page.ARCHITECTURE ? 'Current' : undefined,
        action: () => onNavigate(Page.ARCHITECTURE),
      },
      {
        id: 'nav-authorizations',
        label: Page.AUTHORIZATIONS,
        category: 'Security & Access',
        description: 'Create and manage OAuth 2.0 client authorizations for enterprise agents and tools',
        keywords: ['oauth', 'authorizations', 'tokens', 'credentials', 'security', 'client id'],
        badge: currentPage === Page.AUTHORIZATIONS ? 'Current' : undefined,
        action: () => onNavigate(Page.AUTHORIZATIONS),
      },
      {
        id: 'nav-permissions',
        label: Page.AGENT_PERMISSIONS,
        category: 'Security & Access',
        description: 'Audit and export IAM policy bindings across all Gemini Enterprise agents',
        keywords: ['iam', 'permissions', 'roles', 'access', 'bindings', 'export'],
        badge: currentPage === Page.AGENT_PERMISSIONS ? 'Current' : undefined,
        action: () => onNavigate(Page.AGENT_PERMISSIONS),
      },
      {
        id: 'nav-model-armor',
        label: Page.MODEL_ARMOR,
        category: 'Security & Access',
        description: 'Configure Model Armor safety templates, prompt injection shields, and SDP PII redaction',
        keywords: ['model armor', 'safety', 'guardrails', 'jailbreak', 'pii', 'sdp', 'security'],
        badge: currentPage === Page.MODEL_ARMOR ? 'Current' : undefined,
        action: () => onNavigate(Page.MODEL_ARMOR),
      },
      {
        id: 'nav-observability',
        label: Page.OBSERVABILITY,
        category: 'Security & Access',
        description: 'Analyze BigQuery operational views, Cloud Logging traces, token usage, and user feedback',
        keywords: ['observability', 'telemetry', 'bigquery', 'logs', 'traces', 'analytics', 'metrics', 'feedback'],
        badge: currentPage === Page.OBSERVABILITY ? 'Current' : undefined,
        action: () => onNavigate(Page.OBSERVABILITY),
      },
      {
        id: 'nav-backup',
        label: Page.BACKUP_RECOVERY,
        category: 'System',
        description: 'Create snapshots, export/import configurations, and restore Discovery Engine resources',
        keywords: ['backup', 'recovery', 'restore', 'snapshot', 'export', 'import', 'gcs'],
        badge: currentPage === Page.BACKUP_RECOVERY ? 'Current' : undefined,
        action: () => onNavigate(Page.BACKUP_RECOVERY),
      },
      {
        id: 'nav-audit',
        label: Page.CONFIG_AUDIT,
        category: 'System',
        description: 'Run automated best-practice and security compliance audits across your project',
        keywords: ['config audit', 'compliance', 'check', 'diagnostics', 'health'],
        badge: currentPage === Page.CONFIG_AUDIT ? 'Current' : undefined,
        action: () => onNavigate(Page.CONFIG_AUDIT),
      },
      {
        id: 'nav-licenses',
        label: Page.LICENSE,
        category: 'System',
        description: 'Inspect and manage Gemini Enterprise user license assignments and billing tiers',
        keywords: ['licenses', 'seats', 'users', 'billing', 'subscriptions'],
        badge: currentPage === Page.LICENSE ? 'Current' : undefined,
        action: () => onNavigate(Page.LICENSE),
      },
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
        label: showCurlPreview ? 'Disable API Request History Recording' : 'Enable API Request History Recording',
        category: 'Quick Actions',
        description: 'Toggle recording of outgoing REST requests and cURL commands in the sidebar History panel',
        keywords: ['curl', 'debug', 'history', 'api', 'requests', 'interaction details'],
        badge: showCurlPreview ? 'ON' : 'OFF',
        action: () => setShowCurlPreview(!showCurlPreview),
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
    ],
    [currentPage, isSidebarCollapsed, onNavigate, onOpenFeedback, onToggleSidebar, setShowCurlPreview, showCurlPreview]
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to any page or run an action... (e.g., Observability, Connectors, Model Armor)"
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
            <div className="space-y-1">
              {filteredItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
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
                      <div className="flex items-center gap-2">
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
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {item.description}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 font-mono shrink-0">
                      ↵
                    </span>
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
          <span className="font-mono text-[10px] text-gray-500">
            Shortcut: ⌘K / Ctrl+K
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommandPaletteModal;
