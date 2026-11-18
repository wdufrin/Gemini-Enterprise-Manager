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
import { CloudRunService } from '../../types';

interface ServerListProps {
  services: CloudRunService[];
  onSelectService: (service: CloudRunService) => void;
}

const ServerList: React.FC<ServerListProps> = ({ services, onSelectService }) => {
  const isMcpServerByLabel = (service: CloudRunService): boolean => {
    if (!service.labels) {
      return false;
    }
    for (const [key, value] of Object.entries(service.labels)) {
      if (key.toLowerCase().includes('mcp') || value.toLowerCase().includes('mcp')) {
        return true;
      }
    }
    return false;
  };

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Cloud Run Services</h2>
      </div>
      {services.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No Cloud Run services found for the selected project and region. Click &quot;Scan for Services&quot; to begin.</p>
      ) : (
        <div className="gem-table-container" role="region" aria-label="Cloud Run services table" tabIndex={0}>
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">Service Name</th>
                <th scope="col" className="px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">Label Status</th>
                <th scope="col" className="gem-col-xl px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">URL</th>
                <th scope="col" className="gem-col-md px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">Region</th>
                <th scope="col" className="gem-col-lg px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">Last Updated</th>
                <th scope="col" className="gem-sticky-action-th px-3 xl:px-5 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {services.map((service) => {
                const serviceName = service.name.split('/').pop() || '';
                const isMcpByLabel = isMcpServerByLabel(service);

                return (
                  <tr key={service.name} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-3 xl:px-5 py-3 whitespace-nowrap text-sm font-medium text-white">
                      <div className="flex items-center">
                        <span className={`h-2.5 w-2.5 rounded-full mr-2.5 shrink-0 ${isMcpByLabel ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                        <button
                          type="button"
                          onClick={() => onSelectService(service)}
                          className="text-left hover:text-blue-400 transition-colors truncate max-w-[200px] xl:max-w-[280px]"
                          title={serviceName}
                        >
                          {serviceName}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 xl:px-5 py-3 whitespace-nowrap text-sm">
                      {isMcpByLabel ? (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-500 text-white">MCP Server</span>
                      ) : (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-600 text-gray-300">Not MCP</span>
                      )}
                    </td>
                    <td className="gem-col-xl px-3 xl:px-5 py-3 whitespace-nowrap text-xs xl:text-sm text-blue-400 max-w-[240px] truncate" title={service.uri}>
                      <a href={service.uri} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {service.uri}
                      </a>
                    </td>
                    <td className="gem-col-md px-3 xl:px-5 py-3 whitespace-nowrap text-xs xl:text-sm text-gray-400">{service.location}</td>
                    <td className="gem-col-lg px-3 xl:px-5 py-3 whitespace-nowrap text-xs xl:text-sm text-gray-400">
                      {new Date(service.updateTime).toLocaleString()}
                    </td>
                    <td className="gem-sticky-action-td px-3 xl:px-5 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => onSelectService(service)} className="font-semibold text-blue-400 hover:text-blue-300">
                            View
                        </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ServerList;