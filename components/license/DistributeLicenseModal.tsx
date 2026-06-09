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


import React, { useState, useEffect } from 'react';
import * as api from '../../services/apiService';
import { Config } from '../../types';
import Spinner from '../Spinner';

interface DistributeLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  billingAccountId: string;
  billingAccountLicenseConfigId: string;
  currentProjectNumber: string;
  onSuccess: () => void;
}

const DistributeLicenseModal: React.FC<DistributeLicenseModalProps> = ({ 
    isOpen, 
    onClose, 
    billingAccountId, 
    billingAccountLicenseConfigId,
    currentProjectNumber,
    onSuccess 
}) => {
    const [targetProject, setTargetProject] = useState(currentProjectNumber);
    const [location, setLocation] = useState('global');
    const [count, setCount] = useState<number | ''>(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [existingConfigs, setExistingConfigs] = useState<any[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<string>('');
    const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);

    useEffect(() => {
        const fetchConfigs = async () => {
            if (!targetProject || targetProject.length < 5) {
                setExistingConfigs([]);
                setSelectedConfigId('');
                return;
            }
            setIsLoadingConfigs(true);
            try {
                const config: Config = {
                    projectId: currentProjectNumber,
                    appLocation: location,
                    collectionId: '', appId: '', assistantId: ''
                } as any;
                const res = await api.listLicenseConfigs({ ...config, projectId: targetProject });
                const configs = res.licenseConfigs || [];
                setExistingConfigs(configs);
                
                if (configs.length > 0) {
                    const firstId = configs[0].name.split('/').pop() || '';
                    setSelectedConfigId(firstId);
                } else {
                    setSelectedConfigId('');
                }
            } catch (err) {
                console.warn("Failed to fetch license configs for target project", err);
                setExistingConfigs([]);
                setSelectedConfigId('');
            } finally {
                setIsLoadingConfigs(false);
            }
        };

        fetchConfigs();
    }, [targetProject, location, currentProjectNumber]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const config: Config = {
                projectId: currentProjectNumber, // Used for auth context
                appLocation: location,
                collectionId: '', appId: '', assistantId: ''
            } as any;

            await api.distributeLicense(billingAccountId, billingAccountLicenseConfigId, {
                projectNumber: targetProject,
                location: location,
                licenseCount: typeof count === 'number' ? count : 1,
                licenseConfigId: selectedConfigId || undefined,
            }, config);

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to distribute licenses");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 className="text-lg font-semibold text-white">Distribute Licenses</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-800 text-red-300 rounded text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Target Project Number</label>
                        <input 
                            type="text" 
                            required
                            value={targetProject}
                            onChange={(e) => setTargetProject(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g. 123456789012"
                        />
                        <p className="text-xs text-gray-500 mt-1">The project that will receive the licenses.</p>
                    </div>

                    {isLoadingConfigs && (
                        <p className="text-xs text-cyan-400 animate-pulse">Scanning destination project for existing allocations...</p>
                    )}

                    {existingConfigs.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-amber-400 mb-1">Target Allocation/Subscription</label>
                            <select
                                value={selectedConfigId}
                                onChange={(e) => setSelectedConfigId(e.target.value)}
                                className="w-full bg-gray-700 border border-amber-600/50 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                            >
                                <option value="">[ Spawn New Subscription ID ]</option>
                                {existingConfigs.map((cfg: any) => {
                                    const id = cfg.name.split('/').pop();
                                    return (
                                        <option key={id} value={id}>
                                            Append to Batch: {id} {cfg.subscriptionTier ? `(${cfg.subscriptionTier})` : ''}
                                        </option>
                                    );
                                })}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Found existing allocations. Decide to append quota or spawn a fresh batch.</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                        <select 
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="global">global</option>
                            <option value="us">us</option>
                            <option value="eu">eu</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Quantity to Add</label>
                        <input 
                            type="number" 
                            required
                            min="1"
                            value={count}
                            onChange={(e) => {
                                const val = e.target.value;
                                setCount(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
                            }}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center"
                        >
                            {isLoading ? <Spinner className="w-4 h-4 mr-2" /> : null}
                            Distribute
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DistributeLicenseModal;
