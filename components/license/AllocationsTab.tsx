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
import Spinner from '../Spinner';
import { BillingAccount, BillingAccountLicenseConfig } from './types';
import { DistributeModalData, RetractModalData } from '../../types';

interface AllocationsTabProps {
  projectNumber: string;
  billingAccountId: string;
  setBillingAccountId: (id: string) => void;
  availableBillingAccounts: BillingAccount[];
  isBillingAccountsLoading: boolean;
  hasBillingPermission: boolean | null;
  setHasBillingPermission: (perm: boolean | null) => void;
  isBillingLoading: boolean;
  billingConfigs: BillingAccountLicenseConfig[];
  setBillingConfigs: (configs: BillingAccountLicenseConfig[]) => void;
  projectNames: Record<string, string>;
  fetchBillingConfigs: () => void;
  setDistributeModalProps: (props: DistributeModalData) => void;
  setRetractModalProps: (props: RetractModalData) => void;
}

export const AllocationsTab: React.FC<AllocationsTabProps> = ({
  projectNumber,
  billingAccountId,
  setBillingAccountId,
  availableBillingAccounts,
  isBillingAccountsLoading,
  hasBillingPermission,
  setHasBillingPermission,
  isBillingLoading,
  billingConfigs,
  setBillingConfigs,
  projectNames,
  fetchBillingConfigs,
  setDistributeModalProps,
  setRetractModalProps,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Manage License Allocations</h3>
        <div className="flex gap-4 items-end">
          <div className="flex-grow">
            <label htmlFor="billing-account-select" className="block text-sm font-medium text-gray-400 mb-1">Billing Account</label>
            {isBillingAccountsLoading ? (
              <div className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-400 h-[42px] flex items-center">
                <Spinner className="w-4 h-4 mr-2" /> Loading accounts...
              </div>
            ) : (
              <select
                id="billing-account-select"
                aria-label="Billing Account"
                value={billingAccountId}
                onChange={(e) => {
                  setBillingAccountId(e.target.value);
                  setHasBillingPermission(null);
                  setBillingConfigs([]);
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[42px]"
              >
                <option value="">-- Select Billing Account --</option>
                {availableBillingAccounts.map((account) => {
                  const id = account.name.split('/').pop();
                  return (
                    <option key={account.name} value={id}>
                      {account.displayName} ({id})
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <div className="flex items-center gap-3">
            {hasBillingPermission === true && (
              <div className="flex items-center text-green-400" title="Permissions Verified">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {hasBillingPermission === false && (
              <div className="flex items-center text-red-500" title="Permission Denied">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
            <button
              onClick={fetchBillingConfigs}
              disabled={isBillingLoading || !billingAccountId || hasBillingPermission === false}
              className="px-6 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed h-[42px]"
            >
              {isBillingLoading ? 'Loading...' : 'Load Configs'}
            </button>
          </div>
        </div>

        {hasBillingPermission === false && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-800 rounded-lg">
            <h4 className="text-red-400 font-semibold mb-2 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Permission Required
            </h4>
            <p className="text-sm text-gray-300">
              You do not have the required <code className="text-red-300 bg-red-900/40 px-1 rounded">billing.accounts.get</code> permission for this Billing Account.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              To manage license allocations, please ask a Billing Account Administrator to grant your account the{' '}
              <strong>Billing Account Viewer</strong> (or higher) role on this specific account in the Google Cloud Console.
            </p>
          </div>
        )}
      </div>

      {billingConfigs.length > 0 ? (
        <div className="space-y-4">
          {billingConfigs.map((config) => (
            <div key={config.name} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="p-4 bg-gray-750 border-b border-gray-700 flex justify-between items-start">
                <div>
                  <h4 className="text-md font-bold text-white mb-1">{config.displayName || 'Billing Account Config'}</h4>
                  <p className="text-xs text-gray-400 font-mono mb-2">{config.name}</p>
                  <div className="flex gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                      Total Licenses: {config.licenseCount}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-800">
                      {config.subscriptionTier}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setDistributeModalProps({
                      billingAccountId,
                      billingAccountLicenseConfigId: config.name.split('/').pop() || '',
                      currentProjectNumber: projectNumber,
                    })
                  }
                  className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold rounded flex items-center"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Distribute
                </button>
              </div>

              <div className="p-4 bg-gray-900/30">
                <h5 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Project Allocations</h5>
                {config.licenseConfigDistributions && Object.keys(config.licenseConfigDistributions).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-800/50">
                        <tr>
                          <th className="px-4 py-2">Project</th>
                          <th className="px-4 py-2">Location</th>
                          <th className="px-4 py-2">Allocated</th>
                          <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {Object.entries(config.licenseConfigDistributions).map(([resourceKey, count]: [string, string | number]) => {
                          const project = resourceKey.includes('projects/')
                            ? resourceKey.split('projects/')[1].split('/')[0]
                            : 'N/A';
                          const loc = resourceKey.includes('/locations/')
                            ? resourceKey.split('/locations/')[1].split('/')[0]
                            : 'N/A';

                          return (
                            <tr key={resourceKey} className="hover:bg-gray-800/50">
                              <td className="px-4 py-2 text-white font-mono">
                                {projectNames[project] ? `${projectNames[project]} (${project})` : project}
                              </td>
                              <td className="px-4 py-2 text-gray-400">{loc}</td>
                              <td className="px-4 py-2 text-white font-bold">{count}</td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  onClick={() =>
                                    setRetractModalProps({
                                      billingAccountId,
                                      billingAccountLicenseConfigId: config.name.split('/').pop() || '',
                                      licenseConfigName: resourceKey,
                                      allocatedCount: typeof count === 'number' ? count : parseInt(count, 10) || 0,
                                      currentProjectNumber: projectNumber,
                                    })
                                  }
                                  className="text-red-400 hover:text-red-300 text-xs underline"
                                >
                                  Retract
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic px-2">No licenses distributed yet.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !isBillingLoading &&
        billingAccountId && (
          <div className="text-center p-8 bg-gray-800 rounded-lg border border-gray-700 text-gray-400">
            No configs found for this billing account.
          </div>
        )
      )}
    </div>
  );
};
