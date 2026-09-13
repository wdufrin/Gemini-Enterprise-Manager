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

export interface PrivateRoutingConfigProps {
  isDeploying: boolean;
  selectedNetworkOption: string;
  setSelectedNetworkOption: (val: string) => void;
  vpcNetwork: string;
  setVpcNetwork: (val: string) => void;
  networksList: string[];
  selectedSubnetOption: string;
  setSelectedSubnetOption: (val: string) => void;
  vpcSubnet: string;
  setVpcSubnet: (val: string) => void;
  subnetsList: string[];
  autoAllocatePscIp: boolean;
  setAutoAllocatePscIp: (val: boolean) => void;
  customPscIp: string;
  setCustomPscIp: (val: string) => void;
  useVpcScBundle: boolean;
  setUseVpcScBundle: (val: boolean) => void;
  automatePrivateDns: boolean;
  setAutomatePrivateDns: (val: boolean) => void;
  selectedDomainOption: string;
  setSelectedDomainOption: (val: string) => void;
  customDomain: string;
  setCustomDomain: (val: string) => void;
  existingDomains: string[];
  isCustomDomainValid: boolean;
}

export const PrivateRoutingConfig: React.FC<PrivateRoutingConfigProps> = ({
  isDeploying,
  selectedNetworkOption,
  setSelectedNetworkOption,
  vpcNetwork,
  setVpcNetwork,
  networksList,
  selectedSubnetOption,
  setSelectedSubnetOption,
  vpcSubnet,
  setVpcSubnet,
  subnetsList,
  autoAllocatePscIp,
  setAutoAllocatePscIp,
  customPscIp,
  setCustomPscIp,
  useVpcScBundle,
  setUseVpcScBundle,
  automatePrivateDns,
  setAutomatePrivateDns,
  selectedDomainOption,
  setSelectedDomainOption,
  customDomain,
  setCustomDomain,
  existingDomains,
  isCustomDomainValid,
}) => {
  return (
    <div className="bg-gray-900 border border-purple-900/40 rounded-md p-4 space-y-4 mt-6">
      <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">
        Private VPC & PSC Routing Configuration
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">VPC Network</label>
          <select
            value={selectedNetworkOption}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedNetworkOption(val);
              if (val !== 'custom') {
                setVpcNetwork(val);
              } else {
                setVpcNetwork('');
              }
            }}
            className="w-full bg-slate-850 border border-slate-750 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none mb-1.5"
            disabled={isDeploying}
          >
            {networksList.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
            <option value="custom">+ Custom network...</option>
          </select>
          {selectedNetworkOption === 'custom' && (
            <input
              type="text"
              value={vpcNetwork}
              onChange={(e) => setVpcNetwork(e.target.value)}
              placeholder="Enter network name"
              className="w-full bg-slate-805 border border-slate-750 rounded-md px-2 py-1 text-xs text-white focus:outline-none"
              disabled={isDeploying}
            />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">VPC Subnet (for LB)</label>
          <select
            value={selectedSubnetOption}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedSubnetOption(val);
              if (val !== 'custom') {
                setVpcSubnet(val);
              } else {
                setVpcSubnet('');
              }
            }}
            className="w-full bg-slate-850 border border-slate-750 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none mb-1.5"
            disabled={isDeploying}
          >
            {subnetsList.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
            <option value="custom">+ Custom subnet...</option>
          </select>
          {selectedSubnetOption === 'custom' && (
            <input
              type="text"
              value={vpcSubnet}
              onChange={(e) => setVpcSubnet(e.target.value)}
              placeholder="Enter subnet name"
              className="w-full bg-slate-805 border border-slate-750 rounded-md px-2 py-1 text-xs text-white focus:outline-none"
              disabled={isDeploying}
            />
          )}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoAllocatePscIp}
            onChange={(e) => setAutoAllocatePscIp(e.target.checked)}
            className="form-checkbox h-4 w-4 text-purple-550 rounded border-slate-600 bg-slate-800"
            disabled={isDeploying}
          />
          <span className="text-xs font-medium text-slate-300 font-sans">
            Auto-Allocate PSC Endpoint IP Address
          </span>
        </label>

        {!autoAllocatePscIp && (
          <div className="pl-6 animate-fadeIn">
            <label className="block text-xs font-medium text-slate-400 mb-1">Custom PSC Static IP</label>
            <input
              type="text"
              value={customPscIp}
              onChange={(e) => setCustomPscIp(e.target.value)}
              placeholder="10.0.0.100"
              className="w-full bg-slate-800 border border-slate-750 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              disabled={isDeploying}
            />
          </div>
        )}

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useVpcScBundle}
            onChange={(e) => setUseVpcScBundle(e.target.checked)}
            className="form-checkbox h-4 w-4 text-purple-550 rounded border-slate-600 bg-slate-800"
            disabled={isDeploying}
          />
          <span className="text-xs font-medium text-slate-300">
            Use VPC-SC Data Protection Bundle
            <InfoTooltip text="Check this only if the target project is protected by a strict VPC Service Controls perimeter and you require the vpc-sc bundle." />
          </span>
        </label>

        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={automatePrivateDns}
            onChange={(e) => setAutomatePrivateDns(e.target.checked)}
            className="form-checkbox h-4 w-4 text-purple-550 rounded border-slate-600 bg-slate-800"
            disabled={isDeploying}
          />
          <span className="text-xs font-medium text-slate-300 font-sans">
            Automate Private DNS Zones Configuration
          </span>
        </label>
      </div>

      <div className="pt-2 border-t border-slate-800">
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Custom Redirect Domain (Optional Private Redirect)
          <InfoTooltip text="Choose an existing domain or register a new one to set up an Internal HTTP Redirect Load Balancer in the VPC." />
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
          className="w-full bg-slate-850 border border-slate-750 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none mb-2"
          disabled={isDeploying}
        >
          {existingDomains.map((d) => (
            <option key={d} value={d}>
              Use existing: {d}
            </option>
          ))}
          <option value="new">+ Register new domain...</option>
        </select>

        {selectedDomainOption === 'new' && (
          <>
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="gemini.mycompany.com"
              aria-invalid={!isCustomDomainValid}
              className={`w-full bg-slate-800 border rounded-md px-3 py-1.5 text-xs text-white focus:outline-none ${
                isCustomDomainValid ? 'border-slate-750' : 'border-red-500'
              }`}
              disabled={isDeploying}
            />
            {!isCustomDomainValid && (
              <p className="mt-1 text-xs text-red-400">
                Enter a valid domain such as gemini.mycompany.com.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
