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
import InfoTooltip from '../../InfoTooltip';
import { FormField, tooltipTexts } from './duplicateFieldUtils';

interface DuplicateStepCredentialsProps {
  dataSource?: string;
  isAtlassian: boolean;
  isMicrosoft: boolean;
  formFields: FormField[];
  fieldValues: Record<string, any>;
  onFieldChange: (fieldKey: string, value: string | boolean) => void;
}

export const DuplicateStepCredentials: React.FC<DuplicateStepCredentialsProps> = ({
  dataSource,
  isAtlassian,
  isMicrosoft,
  formFields,
  fieldValues,
  onFieldChange,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex justify-between items-center">
        <h3 className="text-md font-semibold text-white">
          Step 3: Connector Credentials & Settings
        </h3>
        <span className="text-[10px] font-bold uppercase bg-gray-800 text-indigo-400 border border-gray-700 px-2 py-0.5 rounded">
          Type: {dataSource}
        </span>
      </div>
      <p className="text-xs text-gray-400">
        Because credentials are redacted by Google Cloud APIs, you must
        re-enter the secrets and configure target variables to provision
        the connector in the new environment.
      </p>

      {/* Specific SaaS Credentials tips */}
      {isAtlassian && (
        <div className="bg-blue-950/40 border border-blue-900/60 p-3 rounded-lg text-xs text-blue-200 space-y-1">
          <div className="font-bold flex items-center gap-1 text-blue-300">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Jira/Confluence Clone Notes:
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              Enable the <strong>offline_access</strong> scope in your Atlassian Developer Console to request a refresh token.
            </li>
            <li>
              The <strong>Instance ID (Cloud ID)</strong> is site-specific. Ensure the target environment site matches this ID.
            </li>
          </ul>
        </div>
      )}

      {isMicrosoft && (
        <div className="bg-blue-950/40 border border-blue-900/60 p-3 rounded-lg text-xs text-blue-200 space-y-1">
          <div className="font-bold flex items-center gap-1 text-blue-300">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Microsoft Graph Connector Notes:
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              A Microsoft Tenant ID is required. If deploying to another Entra tenant, specify its Tenant ID.
            </li>
            <li>
              Ensure the Azure AD Application registration allows access from the target GCP Project service accounts.
            </li>
          </ul>
        </div>
      )}

      <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
        {formFields.length === 0 ? (
          <p className="text-sm italic text-gray-500">
            No configurable parameters found. Click Next to continue.
          </p>
        ) : (
          formFields.map((field) => {
            const valueKey = `${field.location}.${field.key}`;
            const currentVal = fieldValues[valueKey] ?? '';

            return (
              <div key={valueKey} className="border-b border-gray-800 pb-3">
                <div className="flex justify-between items-baseline mb-1">
                  <label className="text-sm font-semibold text-gray-300 flex items-center">
                    {field.label}
                    {field.required && (
                      <span className="text-red-400 ml-1 font-bold">*</span>
                    )}
                    {tooltipTexts[field.key] && (
                      <InfoTooltip text={tooltipTexts[field.key]} />
                    )}
                  </label>
                  <span className="text-[10px] text-gray-500 font-mono">
                    ({field.location}.{field.key})
                  </span>
                </div>

                {field.type === 'textarea' ? (
                  <textarea
                    value={currentVal}
                    onChange={(e) => onFieldChange(valueKey, e.target.value)}
                    placeholder={`Enter ${field.label}`}
                    className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 w-full h-20 font-mono focus:ring-blue-500"
                    required={field.required}
                  />
                ) : field.type === 'password' ? (
                  <input
                    type="password"
                    value={currentVal}
                    onChange={(e) => onFieldChange(valueKey, e.target.value)}
                    placeholder={`Enter ${field.label}`}
                    className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 w-full focus:ring-blue-500"
                    required={field.required}
                  />
                ) : field.type === 'checkbox' ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={!!currentVal}
                      onChange={(e) => onFieldChange(valueKey, e.target.checked)}
                      className="rounded bg-gray-850 border-gray-750 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">Enabled</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={currentVal}
                    onChange={(e) => onFieldChange(valueKey, e.target.value)}
                    placeholder={`Enter ${field.label}`}
                    className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 w-full focus:ring-blue-500"
                    required={field.required}
                  />
                )}
                {field.description && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    {field.description}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
