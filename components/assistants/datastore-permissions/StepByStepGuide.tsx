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
import { AGENTSPACE_RESTRICTED_USER_ROLE, NOTEBOOK_LM_USER_ROLE } from './types';

interface StepByStepGuideProps {
  projectId: string;
  appId: string;
  onClose: () => void;
}

export const StepByStepGuide: React.FC<StepByStepGuideProps> = ({
  projectId,
  appId,
  onClose,
}) => {
  return (
    <div className="bg-gray-800 rounded-xl border border-purple-700/60 shadow-lg p-6 space-y-5 animate-fade-in">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-900/40 border border-purple-600/50 flex items-center justify-center text-purple-300 font-bold text-sm">
            📘
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Step-by-Step Guide: How to Restrict a DataStore in Gemini Enterprise
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-900/60 text-green-300 border border-green-600">GA</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Follow these steps to grant an end user, delegated admin, or group access to this Assistant while restricting them to only authorized DataStores.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 text-xs px-2.5 py-1 bg-gray-750 hover:bg-gray-700 rounded border border-gray-600 transition-colors"
        >
          ✕ Close Guide
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Step 0 */}
        <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">0</span>
            <span>Prerequisites: Enable Resource Access Control &amp; User Isolation</span>
          </div>
          <ul className="list-disc pl-7 text-gray-300 space-y-1">
            <li>
              Enable <strong>Resource Access Control</strong> in <strong>Gemini Enterprise → Settings → Resource access control</strong> (<code className="text-purple-300">dataStoreAccessControlEnabled = true</code>) using the toggle below or via <code className="text-blue-300">PATCH /v1alpha/projects/{projectId}</code>.
            </li>
            <li>
              <strong>Critical:</strong> Ensure target end users do <em>not</em> possess broad project-wide roles (<code className="text-red-300">roles/viewer</code>, <code className="text-red-300">roles/editor</code>, <code className="text-red-300">roles/discoveryengine.admin</code>, or <code className="text-red-300">roles/discoveryengine.agentspaceUser</code>) at the project level, as broad project roles bypass DataStore-level ACLs.
            </li>
          </ul>
        </div>

        {/* Step 1 */}
        <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
            <span>Grant Predefined Baseline Roles at Project Level (Steps 1a &amp; 1b)</span>
          </div>
          <p className="pl-7 text-gray-300">
            Grant predefined <code className="text-blue-300">{AGENTSPACE_RESTRICTED_USER_ROLE}</code> and <code className="text-purple-300">{NOTEBOOK_LM_USER_ROLE}</code> on project <code className="text-gray-200">{projectId}</code> to the target principal (<code className="text-yellow-300">user:alice@example.com</code> or <code className="text-yellow-300">group:finance-team@example.com</code>).
          </p>
          <p className="pl-7 text-gray-400 italic">
            ✓ Standard Google Cloud IAM roles — provides baseline UI, OAuth connector authorization, and NotebookLM access without broad search access.
          </p>
        </div>

        {/* Step 2 */}
        <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
            <span>Grant App Engine Access (Step 2)</span>
          </div>
          <p className="pl-7 text-gray-300">
            Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> (or <code className="text-purple-300">agentspaceAdmin</code> / <code className="text-purple-300">agentspaceViewer</code>) on App Engine <code className="text-purple-300">{appId}</code>.
          </p>
          <p className="pl-7 text-gray-400">
            Authorizes the user or group to access and query this specific Assistant.
          </p>
        </div>

        {/* Step 3 */}
        <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
            <span>Grant Access ONLY to Authorized DataStores (Steps 3 & 4 — GA v1 API)</span>
          </div>
          <div className="pl-7 space-y-1.5 text-gray-300">
            <p>
              Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> (or <code className="text-purple-300">agentspaceAdmin</code> / <code className="text-purple-300">agentspaceViewer</code>) strictly on the DataStores/Connectors this principal is allowed to access:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-gray-300">
              <li><strong>DataConnectors (with entities):</strong> Grant on <em>both</em> the collection resource (<code className="text-purple-300">/v1/.../collections/{'{CONNECTOR_ID}'}:setIamPolicy</code>) and each child entity datastore (<code className="text-purple-300">/v1/.../collections/default_collection/dataStores/{'{ENTITY_ID}'}:setIamPolicy</code>).</li>
              <li><strong>Standalone / Legacy DataStores:</strong> Grant on the datastore resource (<code className="text-purple-300">/v1/.../collections/default_collection/dataStores/{'{DATASTORE_ID}'}:setIamPolicy</code>).</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
