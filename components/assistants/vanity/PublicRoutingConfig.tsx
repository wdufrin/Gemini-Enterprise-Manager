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

export interface PublicRoutingConfigProps {
  automateGLB: boolean;
  setAutomateGLB: (val: boolean) => void;
  automateDNS: boolean;
  setAutomateDNS: (val: boolean) => void;
  selectedDomainOption: string;
  setSelectedDomainOption: (val: string) => void;
  customDomain: string;
  setCustomDomain: (val: string) => void;
  existingDomains: string[];
  isCustomDomainValid: boolean;
  isDeploying: boolean;
}

export const PublicRoutingConfig: React.FC<PublicRoutingConfigProps> = ({
  automateGLB,
  setAutomateGLB,
  automateDNS,
  setAutomateDNS,
  selectedDomainOption,
  setSelectedDomainOption,
  customDomain,
  setCustomDomain,
  existingDomains,
  isCustomDomainValid,
  isDeploying,
}) => {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-md p-4 space-y-4 mt-6">
      <div className="pt-2">
        <label className="flex items-center space-x-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={automateGLB}
            onChange={(e) => setAutomateGLB(e.target.checked)}
            className="form-checkbox h-5 w-5 text-blue-500 rounded border-slate-600 bg-slate-800"
          />
          <span className="text-sm font-medium text-slate-300">
            Automate Global External Load Balancer Provisioning (Required for Public Routing)
            <p className="text-xs text-slate-500 font-normal mt-1">
              Provisions an Internet NEG, Backend Service, Google-managed SSL Certificate, URL Map, HTTPS Proxy, and Forwarding Rule. Note: This creates billable GCP resources.
            </p>
          </span>
        </label>

        {automateGLB && (
          <div className="space-y-4 pl-8 border-l-2 border-slate-700 ml-2 animate-fadeIn">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={automateDNS}
                onChange={(e) => setAutomateDNS(e.target.checked)}
                className="form-checkbox h-4 w-4 text-purple-500 rounded border-slate-600 bg-slate-800"
              />
              <span className="text-sm font-medium text-slate-300">
                Automatically Configure Cloud DNS (Optional)
                <p className="text-xs text-slate-500 font-normal mt-0.5">
                  Automatically registers the A-Record if a Managed Zone exists in this project.
                </p>
              </span>
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Redirect Domain
              </label>
              <select
                value={selectedDomainOption}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDomainOption(val);
                  if (val === 'new') {
                    setCustomDomain('');
                  } else {
                    setCustomDomain(val);
                  }
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
                disabled={isDeploying}
              >
                {existingDomains.map(d => (
                  <option key={d} value={d}>Use existing: {d}</option>
                ))}
                <option value="new">+ Register new domain...</option>
              </select>

              {selectedDomainOption === 'new' && (
                <>
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="ai.yourcompany.com"
                    aria-invalid={!isCustomDomainValid}
                    className={`w-full bg-slate-900 border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 ${
                      isCustomDomainValid
                        ? 'border-slate-700 focus:ring-blue-500'
                        : 'border-red-500 focus:ring-red-500'
                    }`}
                    disabled={isDeploying}
                  />
                  {!isCustomDomainValid && (
                    <p className="mt-1 text-xs text-red-400">
                      Enter a valid domain such as ai.yourcompany.com -- only
                      lowercase letters, numbers, hyphens and dots.
                    </p>
                  )}
                </>
              )}
              {customDomain && !automateDNS && (
                <div className="mt-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded-md text-sm text-blue-200">
                  <strong>Manual Action Required:</strong> Since Cloud DNS automation is disabled, you will need to manually create an <code>A Record</code> in your domain registrar pointing <code>{customDomain}</code> to the Load Balancer IP address after deployment completes.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
