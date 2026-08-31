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

import React, { useState } from 'react';

interface UserManualModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const UserManualModal: React.FC<UserManualModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('overview');

    if (!isOpen) return null;

    const sections = [
        { id: 'overview', title: 'Overview' },
        { id: 'agents', title: 'Agent Management' },
        { id: 'skills', title: 'Skills Registry' },
        { id: 'engines', title: 'Agent Engines' },
        { id: 'builder', title: 'Builder & Catalog' },
        { id: 'dataStores', title: 'Knowledge & Data' },
        { id: 'security', title: 'Security & Governance' },
        { id: 'observability', title: 'Observability' },
        { id: 'operations', title: 'Operations' },
        { id: 'setup', title: 'Setup & Configuration' },
        { id: 'api', title: 'API Reference' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Gemini Enterprise Manager</h3>
                            <p>A comprehensive web interface to manage Google Cloud Gemini Enterprise resources. This application provides a unified console to manage Agents, Agent Engines, Data Stores, Authorizations, and more, effectively acting as a GUI for the Discovery Engine and Vertex AI APIs.</p>
                        </section>
                        <section>
                            <h4 className="text-md font-semibold text-blue-300 mb-2">Features Overview</h4>
                            <p>It is built with <strong>React</strong>, <strong>Vite</strong>, and <strong>Tailwind CSS</strong>, and communicates directly with Google Cloud APIs using the <strong>Google API JavaScript Client (<code>gapi</code>)</strong>.</p>
                        </section>
                    </div>
                );
            case 'agents':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Agent Management</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li><strong>GE Agent Manager</strong>: List, create, update, and delete agents. Supports toggling agent status (Enable/Disable).</li>
                                <li><strong>Chat Testing</strong>: Built-in chat interface to test agents and assistants with streaming responses, tool visualization, and grounding metadata inspection.</li>
                                <li><strong>Project Context</strong>: Smart header with Breadcrumbs and quick project switching (Project ID/Number).</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'skills':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Skills Registry</h3>
                            <p className="text-sm text-gray-300 mb-3">
                                Powered by Google Cloud Agent Platform (<code className="text-green-400">agentregistry.googleapis.com</code>), the Skills Registry is a centralized enterprise catalog for authoring, versioning, and deploying agent skills.
                            </p>
                            <ul className="list-disc pl-5 space-y-1.5 text-gray-300">
                                <li><strong>Package Management</strong>: Author custom skills directly or upload complete <code className="text-blue-300">.zip</code> packages containing <code className="text-purple-300">SKILL.md</code> instructions and subfiles.</li>
                                <li><strong>Immutable Version Revisions</strong>: Inspect revision history (<code className="text-yellow-300">revisions/rev-1</code>), inspect JSON specs, and review compiler output.</li>
                                <li><strong>Company Catalog Activation</strong>: Activate skills to <code className="text-green-300">STATE_ACTIVE</code> with default revisions for organization-wide discovery.</li>
                                <li><strong>1-Click GE App Deployment</strong>: Deploy skills directly into Gemini Enterprise assistant engines with <code className="text-blue-300">scope: ALL_USERS</code>, making them appear under the <strong>"From my organization"</strong> tab in Gemini Enterprise.</li>
                                <li><strong>Multi-Region Support</strong>: Seamlessly browse and publish across <code className="text-blue-300">global</code>, <code className="text-blue-300">eu</code>, and <code className="text-blue-300">us</code> locations.</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'engines':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Agent Engines & Runtimes</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li>
                                    <strong>Available Agents</strong>: Discover and manage backend runtimes:
                                    <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-400">
                                        <li><strong>Agent Engines (Vertex AI)</strong>: View active sessions, terminate sessions, and perform direct queries.</li>
                                        <li><strong>Direct Query</strong>: Test runtimes directly without going through the high-level Agent API.</li>
                                    </ul>
                                </li>
                            </ul>
                        </section>
                    </div>
                );
            case 'builder':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Builder & Catalog</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li>
                                    <strong>Agent Builder</strong>: A low-code tool to generate and deploy agents.
                                    <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-400">
                                        <li><strong>ADK Agents</strong>: Generates Python code (<code>agent.py</code>, <code>requirements.txt</code>) for Vertex AI Agent Engines. Supports <strong>Google Search</strong>, <strong>Data Store</strong>, <strong>OAuth</strong>, and <strong>BigQuery</strong> tools.</li>
                                        <li><strong>Cloud Build Integration</strong>: One-click deployment to Google Cloud.</li>
                                    </ul>
                                </li>
                                <li><strong>Agent Catalog</strong>: Browse sample agents from GitHub repositories and deploy them directly to your project.</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'dataStores':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Knowledge & Data</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li>
                                    <strong>Data Stores</strong>: Manage Vertex AI Search data stores.
                                    <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-400">
                                        <li>Create and Edit data stores with advanced parsing configuration (Digital, OCR, Layout).</li>
                                        <li><strong>Document Management</strong>: List documents and import new files directly from your computer or Google Cloud Storage (GCS).</li>
                                    </ul>
                                </li>
                                <li><strong>Assistant Configuration</strong>: Manage the default assistant's system instructions, grounding settings (Google Search), and enabled tools/actions.</li>
                            </ul>
                        </section>

                        <section className="bg-gray-900/60 p-4 rounded-lg border border-gray-700 space-y-3">
                            <div className="flex items-center gap-2">
                                <h4 className="text-md font-semibold text-blue-300">Restricting DataStores via Datastore-Level ACLs (Beta)</h4>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-600">Beta</span>
                            </div>
                            <p className="text-xs text-gray-300">
                                Restrict Gemini Enterprise end users so they only see and query specific DataStores or DataConnectors without granting project-wide privileges:
                            </p>
                            <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-300">
                                <li><strong>Allowlisting & Isolation</strong>: Ensure the project is allowlisted under Mendel (<code className="text-purple-300">bogao@</code>) and end users do not have project-wide roles like <code className="text-red-300">roles/viewer</code> or <code className="text-red-300">roles/editor</code>.</li>
                                <li><strong>Project Custom Role (Appendix A)</strong>: Create <code className="text-blue-300">customRestrictedEndUser</code> containing permission <code className="text-green-300">discoveryengine.locations.buildAuthorizationUrl</code>.</li>
                                <li><strong>Grant at Project Level (Step A1)</strong>: Assign the custom role to the user or group (<code className="text-yellow-300">user:alice@example.com</code> or <code className="text-yellow-300">group:finance-team@example.com</code>).</li>
                                <li><strong>Grant App Engine Access (Step A2)</strong>: Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> on the specific App Engine.</li>
                                <li><strong>Grant Specific DataStores (Steps A3 & A4)</strong>: Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> on only the allowed DataConnectors / DataStores. Unassigned DataStores are hidden.</li>
                                <li><strong>Audit</strong>: Use the <strong>Connected DataStores (Beta)</strong> tab in Assistant detail view to audit permissions and run live setup.</li>
                            </ol>
                        </section>
                    </div>
                );
            case 'security':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Security & Governance</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li><strong>Authorizations</strong>: Manage OAuth2 configurations for agents.</li>
                                <li>
                                    <strong>Model Armor</strong>:
                                    <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-400">
                                        <li><strong>Log Viewer</strong>: Inspect sanitization logs to see what content was blocked or modified.</li>
                                        <li><strong>Policy Generator</strong>: Create Model Armor templates to filter Hate Speech, PII, and Prompt Injection.</li>
                                    </ul>
                                </li>
                                <li><strong>IAM Policies</strong>: View and edit IAM policies for specific agents directly from the UI.</li>
                                <li><strong>Datastore-Level ACLs (Beta)</strong>: Manage fine-grained 2-tier access control for Assistant Engines, DataConnectors, and Legacy DataStores with Read-Modify-Write etag preservation.</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'observability':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Observability</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li><strong>Live Dashboard</strong>: Monitor request volume, messages by role, and messages by agent.</li>
                                <li><strong>BigQuery Integration</strong>: Queries live audit logs stored in BigQuery.</li>
                                <li><strong>Custom Labels</strong>: X-axis labels show both name and ID to identify duplicates.</li>
                                <li><strong>Name Recovery</strong>: Automatically groups logs under the real name if available.</li>
                                <li><strong>Query Tooltips</strong>: Click the question mark to view the exact BigQuery query used.</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'operations':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Operations</h3>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li><strong>Architecture Visualizer</strong>: An interactive node-graph visualizing the relationships between your Project, Engines, Assistants, Agents, Data Stores, and Backends.</li>
                                <li>
                                    <strong>Backup & Recovery</strong>:
                                    <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-400">
                                        <li>Full backup of Discovery Engine resources (Collections, Engines, Agents) to GCS.</li>
                                        <li>Granular backup/restore for specific Agents, Data Stores, or Agent Engines.</li>
                                    </ul>
                                </li>
                                <li>
                                    <strong>Licenses</strong>: Monitor user license assignments and prune inactive users.
                                    <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-400">
                                        <li><strong>Auto-Pruner</strong>: Deploy a serverless job to automatically revoke licenses for users who haven't logged in for $N days.</li>
                                    </ul>
                                </li>
                            </ul>
                        </section>
                    </div>
                );
            case 'setup':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Setup & Configuration</h3>
                            <h4 className="text-md font-semibold text-blue-300 mb-1">Prerequisites</h4>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li>A Google Cloud Project.</li>
                                <li>Required APIs enabled (Discovery Engine, Agent Registry, Vertex AI, Cloud Run, Cloud Build, Storage, Service Usage).</li>
                            </ul>
                        </section>
                        <section>
                            <h4 className="text-md font-semibold text-blue-300 mb-1">Usage Tips</h4>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li><strong>API Validation</strong>: On first load, the app checks if required APIs are enabled. Use the "Enable APIs" button to fix missing dependencies.</li>
                                <li><strong>Access Token</strong>: If you cannot use Google Sign-In, you can manually paste a token generated via <code>gcloud auth print-access-token</code>.</li>
                                <li><strong>Region Selection</strong>: Ensure you select the correct location (Global, US, EU) in the configuration bar.</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'api':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">API Reference</h3>
                            <p className="mb-2">The application communicates with several Google Cloud APIs. Below is a reference of the key resources and methods used:</p>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-md font-semibold text-blue-300 mb-2">Discovery Engine API</h4>
                            <code className="text-xs text-green-400 block mb-1">discoveryengine.googleapis.com</code>
                            <ul className="text-xs font-mono text-gray-300 space-y-1">
                                <li><strong>Engines</strong>: GET /v1alpha/projects/&#123;project&#125;/locations/&#123;location&#125;/collections/&#123;collection&#125;/engines</li>
                                <li><strong>Assistants</strong>: GET /v1alpha/projects/.../engines/&#123;engine&#125;/assistants</li>
                                <li><strong>Agents</strong>: GET /v1alpha/projects/.../assistants/&#123;assistant&#125;/agents</li>
                                <li><strong>Data Stores</strong>: GET /v1beta/projects/.../dataStores</li>
                                <li><strong>Conversations</strong>: POST /v1beta/projects/.../conversations</li>
                            </ul>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-md font-semibold text-blue-300 mb-2">Agent Registry API (Skills Platform)</h4>
                            <code className="text-xs text-green-400 block mb-1">agentregistry.googleapis.com</code>
                            <ul className="text-xs font-mono text-gray-300 space-y-1">
                                <li><strong>List Skills</strong>: GET /v1alpha/projects/&#123;project&#125;/locations/&#123;location&#125;/skills</li>
                                <li><strong>Publish Skill</strong>: POST /v1alpha/projects/&#123;project&#125;/locations/&#123;location&#125;/skills?skillId=&#123;skillId&#125;</li>
                                <li><strong>Revisions</strong>: GET /v1alpha/projects/.../skills/&#123;skill&#125;/revisions</li>
                                <li><strong>Update / Activate</strong>: PATCH /v1alpha/projects/.../skills/&#123;skill&#125;?updateMask=default_revision,target_state</li>
                                <li><strong>Delete</strong>: DELETE /v1alpha/projects/.../skills/&#123;skill&#125;</li>
                            </ul>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-md font-semibold text-blue-300 mb-2">Vertex AI API</h4>
                            <code className="text-xs text-green-400 block mb-1">aiplatform.googleapis.com</code>
                            <ul className="text-xs font-mono text-gray-300 space-y-1">
                                <li><strong>Reasoning Engines</strong>: GET /v1beta1/projects/&#123;project&#125;/locations/&#123;location&#125;/reasoningEngines</li>
                                <li><strong>Chat Completions</strong>: POST /v1beta1/projects/.../models/&#123;model&#125;:generateContent</li>
                            </ul>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-md font-semibold text-blue-300 mb-2">IAM & Service Usage</h4>
                            <ul className="text-xs font-mono text-gray-300 space-y-1">
                                <li><strong>Service Usage</strong>: GET /v1/projects/&#123;project&#125;/services</li>
                                <li><strong>IAM Permissions</strong>: POST /v1/projects/&#123;project&#125;:testIamPermissions</li>
                            </ul>
                        </section>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[100] p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-gray-700">
                <header className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        User Manual
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <nav className="w-48 bg-gray-900/30 border-r border-gray-700 p-2 overflow-y-auto hidden md:block">
                        <ul className="space-y-1">
                            {sections.map(section => (
                                <li key={section.id}>
                                    <button
                                        onClick={() => setActiveTab(section.id)}
                                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${activeTab === section.id
                                                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                                                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                            }`}
                                    >
                                        {section.title}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    {/* Content Area */}
                    <main className="flex-1 p-6 overflow-y-auto custom-scrollbar text-gray-300 leading-relaxed text-sm">
                        {renderContent()}
                    </main>
                </div>

                <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors shadow-lg">
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default UserManualModal;
