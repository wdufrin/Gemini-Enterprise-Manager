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

import React, { useState, useMemo } from 'react';
import { Config } from '../../types';
import {
  detectConnectorVendor,
  getChecklistDefinition,
  getAllVendors,
} from './checklist/checklistRegistry';
import { DynamicConnectorVerification } from './checklist/DynamicConnectorVerification';

interface ConnectorVerificationTabProps {
  connector: any;
  config?: Config;
  activeVendors?: string[];
}

export type DataMode = 'INGESTION' | 'FEDERATED';

const CATEGORY_ORDER = [
  'Google First-Party & MCP',
  'Enterprise Platforms',
  'Productivity & Tasks',
  'Customer Support & CRM',
  'Universal Fallback',
];

const ConnectorVerificationTab: React.FC<ConnectorVerificationTabProps> = ({
  connector,
  config = {} as Config,
  activeVendors = [],
}) => {
  // Intelligent vendor detection (supports GCP People, Drive, BYOMCP, SaaS connectors)
  const initialType = useMemo(() => detectConnectorVendor(connector), [connector]);
  const [activeType, setActiveType] = useState<string>(initialType);
  const [dataMode, setDataMode] = useState<DataMode>('INGESTION');
  const [hideUnused, setHideUnused] = useState<boolean>(true);

  const checklistDef = useMemo(() => getChecklistDefinition(activeType), [activeType]);
  const allVendors = useMemo(() => getAllVendors(), []);

  // Compute used vendors (currently inspected + currently selected + any passed active collection vendors)
  const usedVendorIds = useMemo(() => {
    const ids = new Set<string>();
    if (initialType) ids.add(initialType);
    if (activeType) ids.add(activeType);
    if (activeVendors && Array.isArray(activeVendors)) {
      activeVendors.forEach((v) => ids.add(v));
    }
    return ids;
  }, [initialType, activeType, activeVendors]);

  // Filtered vendors based on hideUnused toggle
  const displayedVendors = useMemo(() => {
    if (!hideUnused) return allVendors;
    const filtered = allVendors.filter((v) => usedVendorIds.has(v.id));
    return filtered.length > 0 ? filtered : allVendors.filter((v) => v.id === activeType);
  }, [hideUnused, allVendors, usedVendorIds, activeType]);

  // Group displayed vendors by category
  const vendorGroups = useMemo(() => {
    const groups: Record<string, typeof displayedVendors> = {};
    for (const vendor of displayedVendors) {
      const cat = vendor.category || 'Universal Fallback';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(vendor);
    }
    return groups;
  }, [displayedVendors]);

  const orderedCategories = useMemo(() => {
    const presentCategories = Object.keys(vendorGroups);
    return [
      ...CATEGORY_ORDER.filter((c) => presentCategories.includes(c)),
      ...presentCategories.filter((c) => !CATEGORY_ORDER.includes(c)),
    ];
  }, [vendorGroups]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-900/50 p-3 rounded-lg border border-gray-700 gap-3">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-300">Connector Validation & Readiness Checklist</span>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Hide Unused Connectors Toggle */}
          <label
            className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white cursor-pointer select-none bg-gray-800/90 px-2.5 py-1.5 rounded border border-gray-700 hover:border-gray-500 transition-colors"
            title="When checked, only shows connectors active in this project. Uncheck to show all 35+ connectors."
          >
            <input
              type="checkbox"
              checked={hideUnused}
              onChange={(e) => setHideUnused(e.target.checked)}
              data-testid="hide-unused-checkbox"
              className="rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5"
            />
            <span className="font-medium">Hide unused</span>
          </label>

          {/* Data Mode Toggle */}
          {checklistDef.supportsDataModeToggle && (
            <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-gray-600">
              <button
                type="button"
                onClick={() => setDataMode('INGESTION')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  dataMode === 'INGESTION' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Ingestion
              </button>
              <button
                type="button"
                onClick={() => setDataMode('FEDERATED')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  dataMode === 'FEDERATED' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Federated
              </button>
            </div>
          )}

          {/* Dynamic Vendor Selector */}
          <select
            value={activeType}
            onChange={(e) => setActiveType(e.target.value)}
            data-testid="connector-vendor-select"
            className="bg-gray-800 text-white text-xs border border-gray-600 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-500 hover:border-blue-400 transition-colors cursor-pointer max-w-xs"
          >
            {orderedCategories.length <= 1 ? (
              (vendorGroups[orderedCategories[0]] || []).map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))
            ) : (
              orderedCategories.map((category) => (
                <optgroup key={category} label={category} className="bg-gray-900 text-gray-400 font-semibold">
                  {vendorGroups[category].map((vendor) => (
                    <option key={vendor.id} value={vendor.id} className="bg-gray-800 text-white font-normal">
                      {vendor.name}
                    </option>
                  ))}
                </optgroup>
              ))
            )}
          </select>
        </div>
      </div>

      {checklistDef.supportsDataModeToggle && (
        <div
          className={`p-1.5 rounded border-l-4 ${
            dataMode === 'INGESTION' ? 'border-blue-500 bg-blue-500/10' : 'border-purple-500 bg-purple-500/10'
          }`}
        >
          <p className="text-xs text-gray-300 px-2 py-0.5">
            Showing prerequisites for <strong>{dataMode === 'INGESTION' ? 'Data Ingestion' : 'Federated Search'}</strong> mode.
            {dataMode === 'INGESTION' ? ' (Data is crawled and indexed in Vertex AI Search)' : ' (Live real-time federated querying)'}
          </p>
        </div>
      )}

      {/* Dynamic Checklist Verification Engine */}
      <DynamicConnectorVerification
        connector={connector}
        checklistDef={checklistDef}
        dataMode={dataMode}
        config={config}
      />

      {/* Diagnostics Section */}
      <div className="mt-8 pt-6 border-t border-gray-700">
        <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider flex items-center">
          <svg className="w-4 h-4 mr-2 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Diagnostics & Troubleshooting
        </h3>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white">Cloud Logging</h4>
              <p className="text-xs text-gray-400 mt-1">
                Check for authentication failures, permission denied errors, or internal connector sync issues.
              </p>
            </div>
            <a
              href={`https://console.cloud.google.com/logs/query;query=(resource.type%3D%22vertex_ai_search_connector%22%20AND%20resource.labels.connector_id%3D%22${connector.name?.split('/').pop()}%22)%20OR%20(jsonPayload.connectorRunPayload.dataConnector%3D%22${connector.name}%22)%20AND%20severity%3E%3DERROR?project=${connector.name?.split('/')[1] || config.projectId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded transition-colors border border-gray-600"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Connector Errors
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectorVerificationTab;
