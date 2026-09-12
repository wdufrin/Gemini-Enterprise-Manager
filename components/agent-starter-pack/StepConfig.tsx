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


// We need to know what ProjectInput expects in terms of props or just duplicate the simple input logic
// For now, I'll stick to standard inputs to minimise dependencies unless I verify ProjectInput

interface StepConfigProps {
    agentName: string;
    setAgentName: (val: string) => void;
    projectId: string;
    setProjectId: (val: string) => void;
    location: string;
    setLocation: (val: string) => void;
    model: string;
    setModel: (val: string) => void;
    modelOptions: string[];
    disableModel?: boolean;
}

const StepConfig: React.FC<StepConfigProps> = ({
    agentName, setAgentName,
    projectId, setProjectId,
    location, setLocation,
    model, setModel,
    modelOptions,
    disableModel
}) => {
    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-md">
                <h3 className="text-lg font-semibold text-white mb-6 border-b border-gray-700 pb-2">Agent Configuration</h3>

                <div className="space-y-5">
                    {/* Agent Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Agent Name</label>
                        <input
                            type="text"
                            value={agentName}
                            onChange={(e) => setAgentName(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                            placeholder="my-awesome-agent (lowercase, numbers, hyphens)"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Used for folder creation and resource naming. Must start with a lowercase
                            letter and contain only lowercase letters, numbers and hyphens (no spaces
                            or underscores, 63 characters maximum).
                        </p>
                    </div>

                    {/* Project ID */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Project ID / Number</label>
                        <input
                            type="text"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                            placeholder="my-gcp-project"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Region */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Region</label>
                            <select
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            >
                                <option value="us-central1">us-central1 (Iowa)</option>
                                <option value="europe-west4">europe-west4 (Netherlands)</option>
                                <option value="asia-northeast1">asia-northeast1 (Tokyo)</option>
                            </select>
                        </div>

                        {/* Model */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
                            <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                disabled={disableModel}
                                className={`w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent ${disableModel ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {modelOptions.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            {disableModel && <p className="text-xs text-gray-500 mt-1">Model selection is determined by the sample code.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StepConfig;
