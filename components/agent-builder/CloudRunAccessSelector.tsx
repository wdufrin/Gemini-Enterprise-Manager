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
import {
  CloudRunAccessMode,
  CLOUD_RUN_ACCESS_OPTIONS,
} from '../../services/adkTemplates';

export interface CloudRunAccessSelectorProps {
  value: CloudRunAccessMode;
  onChange: (mode: CloudRunAccessMode) => void;
  /** Distinguishes the ADK and A2A radio groups on the same page. */
  groupName: string;
}

/**
 * Three-way Cloud Run access picker (remediation 2.7).
 *
 * Deliberately not a checkbox: "public vs not public" cannot express the case
 * that is actually the common one here -- a service invoked by Gemini Enterprise
 * or by another agent with a service-account token, which is neither public nor
 * behind IAP's browser sign-in.
 *
 * Pure presentation; it cannot throw, so it is safe on the render path.
 */
export const CloudRunAccessSelector: React.FC<CloudRunAccessSelectorProps> = ({
  value,
  onChange,
  groupName,
}) => (
  <div className="space-y-2">
    {CLOUD_RUN_ACCESS_OPTIONS.map((option) => {
      const selected = option.value === value;
      const selectedClasses = option.dangerous
        ? 'border-red-500 bg-red-900/20'
        : 'border-blue-500 bg-blue-900/20';
      return (
        <label
          key={option.value}
          className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
            selected
              ? selectedClasses
              : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
          }`}
        >
          <input
            type="radio"
            name={`${groupName}-cloud-run-access`}
            value={option.value}
            checked={selected}
            onChange={() => onChange(option.value)}
            className="mt-0.5 h-4 w-4 bg-gray-700 border-gray-600"
          />
          <span>
            <span
              className={`block text-sm font-medium ${
                option.dangerous && selected ? 'text-red-300' : 'text-gray-200'
              }`}
            >
              {option.label}
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">{option.summary}</span>
          </span>
        </label>
      );
    })}

    {value === 'public' && (
      <div className="bg-red-900/30 border border-red-800 rounded-md p-3 text-xs text-red-300">
        <span className="font-semibold">This service will be open to the internet.</span>{' '}
        The generated command passes <code className="font-mono">--allow-unauthenticated</code>,
        so anyone who learns the URL can invoke the agent, read whatever it can read and
        spend your model quota. Use it only for a deliberately public demo.
      </div>
    )}

    {value === 'iap' && (
      <div className="bg-yellow-900/20 border border-yellow-800 rounded-md p-3 text-xs text-yellow-200 space-y-1">
        <p className="font-semibold">IAP is not one-click. Two manual steps remain:</p>
        <p>
          1. Grant <code className="font-mono">roles/run.invoker</code> to the IAP service
          agent{' '}
          <code className="font-mono break-all">
            service-PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com
          </code>
          .
        </p>
        <p>
          2. OAuth clients cannot be created programmatically. The first time you enable IAP
          in a project that is not in an organization, you must do it in the Cloud Console
          (Security &rarr; Identity-Aware Proxy). By default IAP only admits users from your
          own organization; external users need a custom OAuth client.
        </p>
        <p className="text-yellow-300/80">
          The exact commands are repeated as comments in the generated files.
        </p>
      </div>
    )}
  </div>
);

export default CloudRunAccessSelector;
