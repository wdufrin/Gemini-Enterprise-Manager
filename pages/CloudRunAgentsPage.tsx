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


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CloudRunService, Config, EnvVar } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal';
import CloudConsoleButton from '../components/CloudConsoleButton';

interface CloudRunAgentsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const CodeBlock: React.FC<{ content: string; onCopy: () => void; copyText: string; title: string; }> = ({ content, onCopy, copyText, title }) => (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="flex justify-between items-center p-2 bg-gray-900/50">
            <span className="text-sm font-semibold text-gray-300">{title}</span>
            <button
                onClick={onCopy}
                className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500"
            >
                {copyText}
            </button>
        </div>
        <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
            <code>{content}</code>
        </pre>
    </div>
);

// --- Analysis Logic ---

interface AgentAnalysis {
    isAgent: boolean;
    isA2a: boolean;
    confidence: 'High' | 'Medium' | 'Low' | 'None';
    reasons: string[];
    score: number;
    agentName?: string;
    agentDescription?: string;
    model?: string;
}

interface AiAnalysisResult {
    isAgent: boolean;
    confidence: 'High' | 'Medium' | 'Low';
    summary: string;
    detectedFramework?: string;
    detectedName?: string;
    isA2a?: boolean;
    timestamp: number;
}

const analyzeService = (service: CloudRunService): AgentAnalysis => {
    let score = 0;
    const reasons: string[] = [];
    const envVars = service.template?.containers?.[0]?.env || [];
    const labels = service.labels || {};
    
    const getEnv = (name: string) => envVars.find(e => e.name === name)?.value;

    const agentName = getEnv('AGENT_DISPLAY_NAME');
    const agentDesc = getEnv('AGENT_DESCRIPTION');
    const model = getEnv('MODEL');
    const agentUrl = getEnv('AGENT_URL');
    const providerOrg = getEnv('PROVIDER_ORGANIZATION');
    const vertexAi = getEnv('GOOGLE_GENAI_USE_VERTEXAI');

    // A2A Specific Checks
    // If it has AGENT_URL (self-discovery) or PROVIDER_ORGANIZATION, it's likely an A2A agent.
    const isA2a = !!(agentUrl || providerOrg || service.name.toLowerCase().includes('a2a'));

    // Heuristics
    if (agentName) { score += 3; reasons.push("Has AGENT_DISPLAY_NAME environment variable"); }
    if (agentUrl) { score += 2; reasons.push("Has AGENT_URL environment variable (Self-discovery)"); }
    if (agentDesc) { score += 1; reasons.push("Has AGENT_DESCRIPTION environment variable"); }
    if (model) { score += 1.5; reasons.push(`Configures AI Model: ${model}`); }
    if (vertexAi) { score += 1; reasons.push("Uses Vertex AI backend"); }
    
    if (labels['agent-type']) { score += 2; reasons.push(`Has label agent-type=${labels['agent-type']}`); }
    
    // Weak signals
    if (service.name.toLowerCase().includes('agent')) { score += 0.5; reasons.push("Service name contains 'agent'"); }
    if (isA2a) { score += 1; reasons.push("Detected as A2A Agent Protocol"); }

    let confidence: AgentAnalysis['confidence'] = 'None';
    if (score >= 3) confidence = 'High';
    else if (score >= 1.5) confidence = 'Medium';
    else if (score > 0) confidence = 'Low';

    return {
        isAgent: score >= 1.5, // Threshold for considering it an agent
        isA2a,
        confidence,
        reasons,
        score,
        agentName,
        agentDescription: agentDesc,
        model
    };
};

const CloudRunAgentsPage: React.FC<CloudRunAgentsPageProps> = ({ projectNumber, setProjectNumber }) => {
    // Configuration
    const [region, setRegion] = useState('us-central1');
    const [services, setServices] = useState<CloudRunService[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Filtering
    const [filterAgentsOnly, setFilterAgentsOnly] = useState(false);
    
    // Testing State
    const [selectedService, setSelectedService] = useState<CloudRunService | null>(null);
    const [activeTab, setActiveTab] = useState<'test' | 'config'>('test');
    
    const [prompt, setPrompt] = useState('Hello, tell me about yourself.');
    const [isSending, setIsSending] = useState(false);
    const [response, setResponse] = useState<any | null>(null);
    const [testError, setTestError] = useState<string | null>(null);
    const [curlCopyStatus, setCurlCopyStatus] = useState('');

    // Deletion State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [serviceToDelete, setServiceToDelete] = useState<CloudRunService | null>(null);

    // AI Analysis State
    const [analysisCache, setAnalysisCache] = useState<Record<string, AiAnalysisResult>>({});
    const [analyzingServices, setAnalyzingServices] = useState<Set<string>>(new Set());
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
        projectId: projectNumber,
        appLocation: 'global',
        collectionId: '',
        appId: '',
        assistantId: '',
    }), [projectNumber]);

    const performAiAnalysis = useCallback(async (service: CloudRunService) => {
        if (!projectNumber) return;
        
        setAnalyzingServices(prev => new Set(prev).add(service.name));
        setAnalysisError(null);

        try {
            const envVars = service.template?.containers?.[0]?.env || [];
            const envString = JSON.stringify(envVars.reduce((acc: any, curr) => {
                acc[curr.name] = curr.value || 'SECRET';
                return acc;
            }, {}));

            const prompt = `You are an expert system analyzer. Analyze this Google Cloud Run service configuration to identify if it is acting as an AI Agent.
            
            Service Name: ${service.name}
            Image: ${service.template?.containers?.[0]?.image}
            Environment Variables: ${envString}
            Labels: ${JSON.stringify(service.labels || {})}
            
            Criteria for AI Agent (If ANY of these are true, isAgent should be true):
            - Uses Large Language Models (LLMs) or Generative AI.
            - Uses frameworks like LangChain, Firebase Genkit, or Vertex AI.
            - Has environment variables indicating model configuration (e.g., MODEL, OPENAI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI).
            - Exposes endpoints like /invoke, /chat, or /.well-known/agent.json (A2A protocol).
            
            Respond with a JSON object (no markdown, just the object):
            {
                "isAgent": boolean,
                "confidence": "High" | "Medium" | "Low",
                "summary": "A brief 1-sentence reasoning.",
                "detectedFramework": "e.g. LangChain, Vertex AI, or Unknown",
                "detectedName": "Display name if found or inferred",
                "isA2a": boolean
            }`;

            // Use Gemini 2.5 Flash for speed and reliability
            const resultText = await api.generateVertexContent(apiConfig, prompt, 'gemini-2.5-flash');
            
            // Robust JSON parsing
            const jsonStart = resultText.indexOf('{');
            const jsonEnd = resultText.lastIndexOf('}');
            if (jsonStart === -1 || jsonEnd === -1) {
                 throw new Error("Response did not contain a valid JSON object.");
            }
            const jsonStr = resultText.substring(jsonStart, jsonEnd + 1);
            const result: AiAnalysisResult = JSON.parse(jsonStr);
            result.timestamp = Date.now();

            setAnalysisCache(prev => ({ ...prev, [service.name]: result }));
        } catch (err: any) {
            console.error(`Analysis failed for ${service.name}:`, err);
            // Don't set global error to avoid blocking UI, just log or maybe set local error state if needed
        } finally {
            setAnalyzingServices(prev => {
                const next = new Set(prev);
                next.delete(service.name);
                return next;
            });
        }
    }, [projectNumber, apiConfig]);

    const assessAllServices = useCallback(async (servicesToScan: CloudRunService[]) => {
        // We only scan in batches to avoid rate limits
        const BATCH_SIZE = 5;
        // Reset cache for found services implies we want fresh data
        // For simplicity, we just overwrite as we go.
        
        for (let i = 0; i < servicesToScan.length; i += BATCH_SIZE) {
            const batch = servicesToScan.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(s => performAiAnalysis(s)));
        }
    }, [performAiAnalysis]);

    // Fetch Services
    const fetchServices = useCallback(async (runAiAnalysis: boolean = false) => {
        if (!projectNumber) return;
        setIsLoading(true);
        setError(null);
        setServices([]);
        setSelectedService(null);
        
        if (runAiAnalysis) {
            // Clear cache on full scan to ensure freshness as requested
            setAnalysisCache({}); 
        }
        
        try {
            const res = await api.listCloudRunServices(apiConfig, region);
            const fetchedServices = res.services || [];
            setServices(fetchedServices);
            
            if (!fetchedServices || fetchedServices.length === 0) {
                setError(`No services found in ${region}.`);
            } else {
                if (runAiAnalysis) {
                    // Trigger AI Assessment only if requested
                    assessAllServices(fetchedServices);
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to list services.');
        } finally {
            setIsLoading(false);
        }
    }, [projectNumber, apiConfig, region, assessAllServices]);

    useEffect(() => {
        if (projectNumber) fetchServices(false);
    }, [projectNumber, fetchServices]);


    // Filter Logic
    const displayedServices = useMemo(() => {
        if (!filterAgentsOnly) return services;
        return services.filter(s => {
            const cached = analysisCache[s.name];
            if (cached) return cached.isAgent;
            return analyzeService(s).isAgent;
        });
    }, [services, filterAgentsOnly, analysisCache]);

    // Current Analysis for Details View
    const currentAnalysis = selectedService ? analysisCache[selectedService.name] : null;
    const heuristicAnalysis = selectedService ? analyzeService(selectedService) : null;

    // Handle Sending Request
    const handleSend = async () => {
        if (!selectedService) return;
        
        setIsSending(true);
        setTestError(null);
        setResponse(null);

        try {
            let url = selectedService.uri;
            let payload: any = { prompt: prompt };
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };

            // Prefer AI analysis if available, else heuristic
            const isA2a = currentAnalysis ? currentAnalysis.isA2a : heuristicAnalysis?.isA2a;

            if (isA2a) {
                url = `${selectedService.uri.replace(/\/$/, '')}/invoke`;
                payload = {
                    jsonrpc: "2.0",
                    method: "chat",
                    params: { message: { role: "user", parts: [{ text: prompt }] } },
                    id: crypto.randomUUID()
                };
            }
            
            const res = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (res.redirected || res.status === 401 || res.status === 403) {
                 throw new Error(`Auth Error (IAP/IAM): Service returned status ${res.status}. If this service is protected by IAP or requires IAM authentication, browser requests will fail.`);
            }

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text}`);
            }

            const data = await res.json();

            if (isA2a) {
                if (data.error) throw new Error(`A2A Error: ${data.error.message || JSON.stringify(data.error)}`);
                const text = data.result?.message?.parts?.[0]?.text;
                setResponse(text ? { response: text, raw: data } : data);
            } else {
                setResponse(data);
            }

        } catch (err: any) {
            let msg = err.message || 'Request failed.';
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                msg = 'Network Error: This is likely a CORS (Cross-Origin Resource Sharing) issue. The browser blocked the request because the service did not return the required CORS headers.';
            }
            setTestError(msg);
        } finally {
            setIsSending(false);
        }
    };

    const getCurlCommand = () => {
        if (!selectedService) return '';
        const cleanPrompt = prompt.replace(/'/g, "'\\''");
        const baseAuth = '-H "Authorization: Bearer $(gcloud auth print-identity-token)"';
        const isA2a = currentAnalysis ? currentAnalysis.isA2a : heuristicAnalysis?.isA2a;
        
        if (isA2a) {
            const url = `${selectedService.uri.replace(/\/$/, '')}/invoke`;
            const jsonRpc = JSON.stringify({
                jsonrpc: "2.0",
                method: "chat",
                params: { message: { role: "user", parts: [{ text: prompt }] } },
                id: "1"
            }, null, 0);
             const escapedJson = jsonRpc.replace(/'/g, "'\\''");
             return `curl -X POST ${baseAuth} -H "Content-Type: application/json" -d '${escapedJson}' "${url}"`;
        }
        
        return `curl -X POST ${baseAuth} -H "Content-Type: application/json" -d '{"prompt": "${cleanPrompt}"}' "${selectedService.uri}"`;
    };

    const handleCopyCurl = () => {
        const cmd = getCurlCommand();
        if (!cmd) return;
        navigator.clipboard.writeText(cmd).then(() => {
            setCurlCopyStatus('Copied!');
            setTimeout(() => setCurlCopyStatus(''), 2000);
        });
    };

    const requestDelete = (service: CloudRunService) => {
        setServiceToDelete(service);
        setIsDeleteModalOpen(true);
    };

    const handleDeleteService = async () => {
        if (!serviceToDelete) return;
        setIsDeleting(true);
        setError(null);
        try {
            await api.deleteCloudRunService(serviceToDelete.name, apiConfig);
            setIsDeleteModalOpen(false);
            setServiceToDelete(null);
            setSelectedService(null);
            // Refresh list without full analysis
            fetchServices(false);
        } catch (err: any) {
            setError(`Failed to delete service: ${err.message}`);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6 flex flex-col h-full">
            {/* Header / Config */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md shrink-0">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-semibold text-white">Cloud Run Agents</h2>
                    <CloudConsoleButton url={`https://console.cloud.google.com/run?project=${projectNumber}`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Region</label>
                        <select 
                            value={region} 
                            onChange={(e) => setRegion(e.target.value)} 
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white w-full h-[42px]"
                        >
                            <option value="us-central1">us-central1</option>
                            <option value="us-east1">us-east1</option>
                            <option value="europe-west1">europe-west1</option>
                            <option value="asia-east1">asia-east1</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => fetchServices(true)} 
                            disabled={isLoading || !projectNumber}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                        >
                            {isLoading ? 'Scanning...' : 'Scan Services'}
                        </button>
                    </div>
                </div>
            </div>

            {error && <div className="p-4 bg-red-900/30 text-red-300 text-sm rounded-lg border border-red-800">{error}</div>}

            {/* Main Content Area */}
            <div className="flex flex-1 gap-6 min-h-0 overflow-hidden">
                
                {/* List Panel */}
                <div className="w-1/3 bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                        <h3 className="text-md font-semibold text-white">Services ({displayedServices.length})</h3>
                        <label className="flex items-center cursor-pointer text-xs text-gray-400 hover:text-white">
                            <input 
                                type="checkbox" 
                                checked={filterAgentsOnly} 
                                onChange={(e) => setFilterAgentsOnly(e.target.checked)} 
                                className="mr-2 h-3.5 w-3.5 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                            />
                            Agents Only
                        </label>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {displayedServices.length === 0 && !isLoading && <p className="text-sm text-gray-500 text-center mt-4">No services found.</p>}
                        {displayedServices.map(service => {
                            const cached = analysisCache[service.name];
                            const isAnalyzing = analyzingServices.has(service.name);
                            const heuristic = analyzeService(service);
                            
                            const isAgent = cached ? cached.isAgent : heuristic.isAgent;
                            const isA2a = cached ? cached.isA2a : heuristic.isA2a;
                            const confidence = cached ? cached.confidence : heuristic.confidence;

                            return (
                                <div 
                                    key={service.name}
                                    onClick={() => { setSelectedService(service); setResponse(null); setTestError(null); setActiveTab('test'); }}
                                    className={`p-3 rounded-md cursor-pointer border transition-colors ${selectedService?.name === service.name ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-700/30 border-transparent hover:bg-gray-700'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="text-sm font-bold text-white truncate max-w-[70%]">{service.name.split('/').pop()}</p>
                                        <div className="flex items-center gap-1">
                                            {isAnalyzing && <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-400"></div>}
                                            {isAgent && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${confidence === 'High' ? 'bg-green-900 text-green-300 border border-green-700' : 'bg-blue-900 text-blue-300 border border-blue-700'}`}>
                                                    {isA2a ? 'A2A' : 'AGENT'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">{service.uri}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Detail Panel */}
                <div className="flex-1 bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden">
                    {selectedService ? (
                        <>
                            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                                <h3 className="text-md font-semibold text-white">
                                    Service: <span className="text-blue-400">{selectedService.name.split('/').pop()}</span>
                                </h3>
                                <div className="flex items-center gap-2">
                                    <div className="flex space-x-1 bg-gray-900 p-1 rounded-lg">
                                        <button 
                                            onClick={() => setActiveTab('test')}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'test' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            Test Agent
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('config')}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'config' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                        >
                                            Service Config
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => requestDelete(selectedService)}
                                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded-md transition-colors"
                                        title="Delete Service"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Gemini Analysis Card */}
                            <div className="px-6 pt-4">
                                <div className="bg-gradient-to-r from-gray-800 to-gray-900 border border-teal-900/50 p-4 rounded-lg shadow-inner min-h-[100px] flex flex-col justify-center">
                                    <div className="flex items-center mb-2 justify-between">
                                        <div className="flex items-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-teal-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                            <h4 className="text-sm font-bold text-teal-400 uppercase tracking-wider">Agent Intelligence (Gemini AI)</h4>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <span className="text-[10px] text-gray-500">{currentAnalysis ? "Verdict: " : ""}</span>
                                            {currentAnalysis && (
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${currentAnalysis.isAgent ? 'bg-green-900 text-green-300 border-green-700' : 'bg-gray-800 text-gray-400 border-gray-600'}`}>
                                                    {currentAnalysis.isAgent ? 'Likely Agent' : 'Not an Agent'}
                                                </span>
                                            )}
                                            {currentAnalysis && (
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${currentAnalysis.confidence === 'High' ? 'bg-green-900 text-green-300' : currentAnalysis.confidence === 'Medium' ? 'bg-yellow-900 text-yellow-300' : 'bg-gray-700 text-gray-300'}`}>
                                                    {currentAnalysis.confidence} Confidence
                                                </span>
                                            )}
                                            <button 
                                                onClick={() => performAiAnalysis(selectedService)}
                                                disabled={analyzingServices.has(selectedService.name)}
                                                className="ml-2 text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600"
                                            >
                                                {analyzingServices.has(selectedService.name) ? 'Analyzing...' : 'Re-assess'}
                                            </button>
                                        </div>
                                    </div>

                                    {analyzingServices.has(selectedService.name) ? (
                                        <div className="flex items-center text-sm text-gray-400">
                                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-teal-400 mr-3"></div>
                                            Analyzing configuration with Gemini AI...
                                        </div>
                                    ) : currentAnalysis ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                {currentAnalysis.detectedName && (
                                                    <div>
                                                        <span className="text-gray-500 block text-xs">Detected Name</span>
                                                        <span className="text-white font-medium">{currentAnalysis.detectedName}</span>
                                                    </div>
                                                )}
                                                {currentAnalysis.detectedFramework && (
                                                    <div>
                                                        <span className="text-gray-500 block text-xs">Framework</span>
                                                        <span className="text-white font-medium">{currentAnalysis.detectedFramework}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-2">
                                                <span className="text-gray-500 block text-xs">Analysis Summary</span>
                                                <p className="text-gray-300 text-xs mt-0.5">{currentAnalysis.summary}</p>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-xs text-gray-500 italic">Analysis pending or not run. Click Re-assess to force run.</p>
                                    )}
                                    {analysisError && <div className="text-xs text-red-400 mt-2">Error: {analysisError}</div>}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {activeTab === 'test' && (
                                    <>
                                        {/* Input */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Prompt</label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    value={prompt} 
                                                    onChange={(e) => setPrompt(e.target.value)} 
                                                    className="flex-1 bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-blue-500"
                                                    placeholder="Enter message..."
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                                />
                                                <button 
                                                    onClick={handleSend} 
                                                    disabled={isSending}
                                                    className="px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600"
                                                >
                                                    {isSending ? 'Sending...' : 'Send'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Response Area */}
                                        {response && (
                                            <div className="bg-gray-900 p-4 rounded-md border border-gray-700">
                                                <h4 className="text-xs font-bold text-green-400 mb-2 uppercase">Response</h4>
                                                <div className="text-sm text-gray-200 whitespace-pre-wrap font-sans">
                                                    {response.response || JSON.stringify(response, null, 2)}
                                                </div>
                                            </div>
                                        )}

                                        {/* Error Handling */}
                                        {testError && (
                                            <div className="bg-red-900/20 p-4 rounded-md border border-red-800">
                                                <h4 className="text-sm font-bold text-red-400 mb-2">Request Failed</h4>
                                                <p className="text-xs text-red-200 mb-3">{testError}</p>
                                                
                                                {(testError.includes("CORS") || testError.includes("Auth Error")) && (
                                                    <div className="bg-black/40 p-3 rounded text-xs">
                                                        <p className="text-gray-400 mb-2">
                                                            <strong>Workaround:</strong> The browser request failed (likely due to CORS or IAP). 
                                                            You can test it from your terminal using cURL with an Identity Token:
                                                        </p>
                                                        <CodeBlock 
                                                            title="cURL Command (with Identity Token)" 
                                                            content={getCurlCommand()} 
                                                            onCopy={handleCopyCurl} 
                                                            copyText={curlCopyStatus || 'Copy'} 
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {activeTab === 'config' && (
                                    <div>
                                        <h4 className="text-sm font-bold text-white mb-3">Service Configuration (JSON)</h4>
                                        <div className="bg-gray-900 p-4 rounded-md border border-gray-700 overflow-auto">
                                            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                                                {JSON.stringify(selectedService, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 flex-col">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <p>Select a service from the list to view details.</p>
                        </div>
                    )}
                </div>
            </div>

            {serviceToDelete && (
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={handleDeleteService}
                    title="Delete Cloud Run Service"
                    confirmText="Delete"
                    isConfirming={isDeleting}
                >
                    <p>Are you sure you want to permanently delete this Cloud Run service?</p>
                    <div className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600">
                        <p className="font-bold text-white">{serviceToDelete.name.split('/').pop()}</p>
                        <p className="text-xs font-mono text-gray-400 mt-1">{serviceToDelete.uri}</p>
                    </div>
                    <p className="mt-4 text-sm text-yellow-300">This action cannot be undone.</p>
                </ConfirmationModal>
            )}
        </div>
    );
};

export default CloudRunAgentsPage;
