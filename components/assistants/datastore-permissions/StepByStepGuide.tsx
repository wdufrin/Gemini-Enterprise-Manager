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
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-600">Beta</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Follow these 5 steps to grant an end user or group access to this Assistant while restricting them to only authorized DataStores.
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
            <span>Prerequisites: Allowlisting & User Isolation</span>
          </div>
          <ul className="list-disc pl-7 text-gray-300 space-y-1">
            <li>Project must be allowlisted under Mendel flag (<code className="text-purple-300">bogao@</code>).</li>
            <li><strong>Critical:</strong> Ensure target end users do <em>not</em> possess broad project-wide roles (<code className="text-red-300">roles/viewer</code>, <code className="text-red-300">roles/editor</code>, or <code className="text-red-300">roles/discoveryengine.admin</code>) as broad roles bypass datastore-level ACLs.</li>
          </ul>
        </div>

        {/* Step 1 */}
        <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
            <span>Create Project Custom Role (Appendix A)</span>
          </div>
          <p className="pl-7 text-gray-300">
            Ensure custom role <code className="text-blue-300">customRestrictedEndUser</code> exists with permission <code className="text-green-300">discoveryengine.locations.buildAuthorizationUrl</code>.
          </p>
          <p className="pl-7 text-gray-400 italic">
            👉 Click &quot;+ Create Custom Role in Project&quot; above if missing.
          </p>
        </div>

        {/* Step 2 */}
        <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
            <span>Grant Custom Role at Project Level (Step A1)</span>
          </div>
          <p className="pl-7 text-gray-300">
            Grant <code className="text-blue-300">projects/{projectId}/roles/customRestrictedEndUser</code> to the target email (<code className="text-yellow-300">user:alice@example.com</code> or <code className="text-yellow-300">group:finance-team@example.com</code>).
          </p>
          <p className="pl-7 text-gray-400">
            Enables user to load the web app without viewing any backend data.
          </p>
        </div>

        {/* Step 3 */}
        <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
            <span>Grant App Engine Access (Step A2)</span>
          </div>
          <p className="pl-7 text-gray-300">
            Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> on App Engine <code className="text-purple-300">{appId}</code>.
          </p>
          <p className="pl-7 text-gray-400">
            Authorizes the user to interact with this specific Assistant.
          </p>
        </div>

        {/* Step 4 */}
        <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5 md:col-span-2">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">4</span>
            <span>Grant Access ONLY to Authorized DataStores (Steps A3 & A4)</span>
          </div>
          <div className="pl-7 space-y-1.5 text-gray-300">
            <p>
              Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> strictly on the DataStores/Connectors this user is allowed to query:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-gray-300">
              <li><strong>DataConnectors:</strong> Grant on both the collection resource and each entity datastore.</li>
              <li><strong>Legacy DataStores:</strong> Grant on the datastore resource.</li>
            </ul>
            <div className="p-2.5 bg-yellow-950/40 border border-yellow-800/60 rounded text-yellow-300 mt-2">
              🔒 <strong>How restriction works:</strong> Any connected DataStore where the user is <em>not</em> explicitly granted <code className="text-yellow-200">roles/discoveryengine.agentspaceUser</code> remains completely hidden and blocked from search/grounding.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
