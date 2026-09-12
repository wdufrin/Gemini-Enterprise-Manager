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

import React, { useState, useMemo, useCallback } from 'react';
import { CloudRunService, Config } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import ServerList from '../components/mcp-servers/ServerList';
import McpServerDetails from '../components/mcp-servers/McpServerDetails';


interface McpServersPageProps {
  projectNumber: string;
  projectId?: string;
}

const McpServersPage: React.FC<McpServersPageProps> = ({ projectNumber, projectId }) => {
  const [location, setLocation] = useState('us-central1');
  const [services, setServices] = useState<CloudRunService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'details'>('list');
  const [selectedService, setSelectedService] = useState<CloudRunService | null>(null);

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectId || projectNumber,
      // Dummy values for other required config properties
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: '',
  }), [projectNumber, projectId]);

  const handleScan = useCallback(async () => {
    if (!projectNumber) {
        setError("Project ID/Number is required to scan for services.");
        return;
    }
    setIsLoading(true);
    setError(null);
    setServices([]);
    try {
        const response = await api.listCloudRunServices(apiConfig, location);
        setServices(response.services || []);
    } catch(err: any) {
        setError(err.message || 'Failed to fetch Cloud Run services.');
        setServices([]); // Clear services on initial fetch error
    } finally {
        setIsLoading(false);
    }
  }, [apiConfig, location, projectNumber]);
  
  const handleSelectService = (service: CloudRunService) => {
    setSelectedService(service);
    setViewMode('details');
  };

  const handleBackToList = () => {
    setSelectedService(null);
    setViewMode('list');
  };

  const renderContent = () => {
    if (isLoading) {
        return <Spinner />;
    }

    if (viewMode === 'details' && selectedService) {
        return (
            <McpServerDetails
                service={selectedService}
                config={apiConfig}
                onBack={handleBackToList}
            />
        );
    }
    
    return (
        <>
            {error && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg">{error}</div>}
            <ServerList services={services} onSelectService={handleSelectService} />
        </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                    <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[42px] flex items-center">
                        {projectNumber || <span className="text-gray-500 italic">Not set (on Agents page)</span>}
                    </div>
                </div>
                <div>
                    <label htmlFor="location" className="block text-sm font-medium text-gray-400 mb-1">GCP Region</label>
                    <select
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]"
                    >
                        <option value="us-central1">us-central1</option>
                        <option value="us-east1">us-east1</option>
                        <option value="us-east4">us-east4</option>
                        <option value="us-west1">us-west1</option>
                        <option value="europe-west1">europe-west1</option>
                        <option value="europe-west2">europe-west2</option>
                        <option value="europe-west4">europe-west4</option>
                        <option value="asia-east1">asia-east1</option>
                        <option value="asia-southeast1">asia-southeast1</option>
                    </select>
                </div>
                 <div className="flex items-end">
                    <button
                        onClick={handleScan}
                        disabled={isLoading}
                        className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                    >
                    {isLoading ? 'Scanning...' : 'Scan for Services'}
                    </button>
                </div>
            </div>
        </div>
      {renderContent()}
    </div>
  );
};

export default McpServersPage;