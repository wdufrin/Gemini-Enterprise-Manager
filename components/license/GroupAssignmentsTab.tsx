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
import { CloudRunServiceItem, LicenseConfig } from './types';

interface GroupAssignmentsTabProps {
  isServicesLoading: boolean;
  servicesError: string | null;
  groupServices: CloudRunServiceItem[];
  lastRunTimes: Record<string, string>;
  apiLicenseConfigs: LicenseConfig[];
  onNewAssignment: () => void;
  onRunService: (serviceUrl?: string) => void;
  onEditService: (service: CloudRunServiceItem) => void;
  onDeleteService: (serviceName: string) => void;
}

export const GroupAssignmentsTab: React.FC<GroupAssignmentsTabProps> = ({
  isServicesLoading,
  servicesError,
  groupServices,
  lastRunTimes,
  apiLicenseConfigs,
  onNewAssignment,
  onRunService,
  onEditService,
  onDeleteService,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Group License Assignments</h3>
            <p className="text-gray-400 text-sm">
              Configure and deploy services to automate license assignment based on group membership.
            </p>
          </div>
          <button
            onClick={onNewAssignment}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 flex items-center"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Assignment
          </button>
        </div>

        {isServicesLoading ? (
          <div className="text-center p-4">
            <Spinner /> Loading services...
          </div>
        ) : servicesError ? (
          <div className="text-red-400 text-center p-4">{servicesError}</div>
        ) : groupServices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700 bg-gray-900 rounded-lg overflow-hidden">
              <thead className="bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Service Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Run Region
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    GE Region
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Subscription ID
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Job Type
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Last Run
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {groupServices.map((service, idx) => {
                  const name = service.name || '';
                  const parts = name.split('/');
                  const id = parts[parts.length - 1];
                  const runRegion = parts[3] || 'N/A';
                  const labels = service.labels || {};
                  const geRegion = labels['ge-region'] || 'N/A';
                  const geSku = labels['ge-sku'] || 'N/A';
                  const jobType = labels['job-type'] || 'N/A';
                  const lastRun = lastRunTimes[id] ? new Date(lastRunTimes[id]).toLocaleString() : 'N/A';

                  const matchConfig = apiLicenseConfigs.find((c) => c.name.split('/').pop() === geSku);
                  const expDate =
                    matchConfig && matchConfig.endDate && matchConfig.endDate.year
                      ? `${matchConfig.endDate.year}-${String(matchConfig.endDate.month || 1).padStart(2, '0')}-${String(
                          matchConfig.endDate.day || 1
                        ).padStart(2, '0')}`
                      : '';

                  return (
                    <tr key={service.name || idx} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{runRegion}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{geRegion}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {geSku} {expDate ? `(Exp: ${expDate})` : ''}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{jobType}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{lastRun}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => onRunService(service.status?.url)}
                          className="text-green-400 hover:text-green-300 mr-4"
                        >
                          Run
                        </button>
                        <button
                          onClick={() => onEditService(service)}
                          className="text-blue-400 hover:text-blue-300 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteService(name)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-center p-8 bg-gray-800 rounded-lg">
            No group licensing services found.
          </div>
        )}
      </div>
    </div>
  );
};
