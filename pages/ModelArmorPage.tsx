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


import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Config, LogEntry } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import ProjectInput from '../components/ProjectInput';
import CloudConsoleButton from '../components/CloudConsoleButton';

// --- Icons ---

const ShieldIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);

const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
    </svg>
);

// --- Sub-Components ---

const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
    const isBlocked = verdict === 'BLOCKED' || verdict === 'MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK';
    const isAllowed = verdict === 'ALLOWED';
    
    let colorClass = 'bg-gray-700 text-gray-300 border-gray-600';
    let icon = null;

    if (isBlocked) {
        colorClass = 'bg-red-900/50 text-red-200 border-red-800';
        icon = (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
        );
    } else if (isAllowed) {
        colorClass = 'bg-green-900/50 text-green-200 border-green-800';
        icon = (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
        );
    }

    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center ${colorClass}`}>
            {icon}
            {verdict}
        </span>
    );
};

const getTriggeredFilter = (filterResults: any): { name: string, confidence?: string } | null => {
    if (!filterResults) return null;
    for (const filterName in filterResults) {
        const result = filterResults[filterName];
        const filterResultKey = Object.keys(result)[0];
        if (result[filterResultKey]?.matchState === 'MATCH_FOUND') {
            return {
                name: filterName,
                confidence: result[filterResultKey]?.confidenceLevel,
            };
        }
    }
    return null;
}

const parseAssistantFromCorrelationId = (correlationId: string): string => {
    if (!correlationId || !correlationId.startsWith('AS|')) {
        return 'N/A';
    }
    try {
        const parts = correlationId.split('|');
        if (parts.length > 1 && parts[1].startsWith('projects/')) {
            const path = parts[1];
            const pathParts = path.split('/');
            const assistantIndex = pathParts.indexOf('assistants');
            if (assistantIndex > 0 && assistantIndex < pathParts.length - 1) {
                const engineId = pathParts[assistantIndex - 1];
                const assistantId = pathParts[assistantIndex + 1];
                return `${engineId} / ${assistantId}`;
            }
            return path;
        }
    } catch (e) {
        // Fallthrough
    }
    return 'N/A';
};

const LogEntryCard: React.FC<{ log: LogEntry }> = ({ log }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    const payload = log.jsonPayload;
    const sanitizationResult = payload?.sanitizationResult;
    const triggeredFilter = getTriggeredFilter(sanitizationResult?.filterResults);
    
    const correlationId = log.labels?.['modelarmor.googleapis.com/client_correlation_id'] || '';
    const sourceAssistant = parseAssistantFromCorrelationId(correlationId);

    const verdict = sanitizationResult?.sanitizationVerdict || 'N/A';

    return (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-sm transition-all hover:border-gray-600">
            {/* Header */}
            <div className="p-4 bg-gray-800 border-b border-gray-700/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400 bg-gray-900 px-2 py-1 rounded border border-gray-700">
                        {new Date(log.receiveTimestamp).toLocaleString()}
                    </span>
                    <span className="text-sm font-medium text-white" title={correlationId}>{sourceAssistant}</span>
                </div>
                <div className="flex items-center gap-3">
                    <VerdictBadge verdict={verdict} />
                    <button className="text-gray-500 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
            
            {/* Body */}
            <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    {/* Triggered Filter Info */}
                    {triggeredFilter && (
                        <div className="bg-red-900/10 border border-red-900/30 rounded-md p-3">
                            <p className="text-xs font-bold text-red-300 uppercase mb-1">Triggered Filter</p>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-white font-medium">{triggeredFilter.name}</span>
                                {triggeredFilter.confidence && (
                                    <span className="text-xs text-red-200 bg-red-900/40 px-2 py-0.5 rounded">
                                        Confidence: {triggeredFilter.confidence}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Explanation */}
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Reason</p>
                        <p className="text-sm text-gray-300 bg-gray-900/50 p-2 rounded border border-gray-700/50">
                            {sanitizationResult?.sanitizationVerdictReason || 'No detailed reason provided.'}
                        </p>
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Sanitized Input</p>
                    <div className="bg-gray-900 p-3 rounded-md border border-gray-700/50 max-h-32 overflow-y-auto text-sm text-gray-300 font-mono whitespace-pre-wrap break-all">
                        {payload?.sanitizationInput?.text || <span className="text-gray-600 italic">No input text available</span>}
                    </div>
                </div>
            </div>

            {/* JSON Expandable */}
            {isExpanded && (
                <div className="bg-black p-4 border-t border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase">Raw Log Payload</h4>
                        <button 
                            className="text-xs text-blue-400 hover:text-white"
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(log.jsonPayload, null, 2)); }}
                        >
                            Copy JSON
                        </button>
                    </div>
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-96">
                        {JSON.stringify(log.jsonPayload, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};

// --- Policy Generator Component ---

interface PolicyGeneratorProps {
    projectId: string;
    engines: any[];
}

const PolicyGenerator: React.FC<PolicyGeneratorProps> = ({ projectId, engines }) => {
    const [policyName, setPolicyName] = useState('my-safety-policy-input');
    const [config, setConfig] = useState({
        pii: true,
        hateSpeech: 'HIGH',
        harassment: 'HIGH',
        sexuallyExplicit: 'HIGH',
        dangerousContent: 'HIGH',
        jailbreak: true,
        maliciousUris: false,
    });
    const [selectedEngineIndex, setSelectedEngineIndex] = useState(-1);
    const [policyType, setPolicyType] = useState<'input' | 'output' | 'both'>('input');
    const [copySuccess, setCopySuccess] = useState('');
    const [copyAttachSuccess, setCopyAttachSuccess] = useState('');

    const toggle = (key: 'pii' | 'jailbreak' | 'maliciousUris') => setConfig(prev => ({ ...prev, [key]: !prev[key] }));

    const toggleRai = (key: 'hateSpeech' | 'harassment' | 'sexuallyExplicit' | 'dangerousContent') => {
        setConfig(prev => ({
            ...prev,
            [key]: prev[key] === 'OFF' ? 'HIGH' : 'OFF'
        }));
    };

    const changeRaiLevel = (key: 'hateSpeech' | 'harassment' | 'sexuallyExplicit' | 'dangerousContent', val: string) => {
        setConfig(prev => ({
            ...prev,
            [key]: val
        }));
    };

    const applyPreset = (preset: 'bp_input' | 'bp_output' | 'strict') => {
        if (preset === 'bp_input') {
            setConfig({
                pii: true,
                hateSpeech: 'HIGH',
                harassment: 'HIGH',
                sexuallyExplicit: 'HIGH',
                dangerousContent: 'HIGH',
                jailbreak: true,
                maliciousUris: false,
            });
            setPolicyName('my-safety-policy-input');
            setPolicyType('input');
        } else if (preset === 'bp_output') {
            setConfig({
                pii: true,
                hateSpeech: 'HIGH',
                harassment: 'HIGH',
                sexuallyExplicit: 'HIGH',
                dangerousContent: 'HIGH',
                jailbreak: false,
                maliciousUris: true,
            });
            setPolicyName('my-safety-policy-output');
            setPolicyType('output');
        } else if (preset === 'strict') {
            setConfig({
                pii: true,
                hateSpeech: 'LOW_AND_ABOVE',
                harassment: 'LOW_AND_ABOVE',
                sexuallyExplicit: 'LOW_AND_ABOVE',
                dangerousContent: 'LOW_AND_ABOVE',
                jailbreak: true,
                maliciousUris: true,
            });
            setPolicyName('my-safety-policy-strict');
            setPolicyType('both');
        }
    };

    const generatedJson = useMemo(() => {
        const filters: any[] = [];
        
        if (config.pii) {
            filters.push({
                "infoType": "PHONE_NUMBER",
                "filterConfig": { "replaceWithInfoTypeConfig": {} }
            });
            filters.push({
                "infoType": "EMAIL_ADDRESS",
                "filterConfig": { "replaceWithInfoTypeConfig": {} }
            });
        }
        
        const raiFilters: any[] = [];
        if (config.hateSpeech !== 'OFF') raiFilters.push({ "filterType": "HATE_SPEECH", "confidenceLevel": config.hateSpeech });
        if (config.harassment !== 'OFF') raiFilters.push({ "filterType": "HARASSMENT", "confidenceLevel": config.harassment });
        if (config.sexuallyExplicit !== 'OFF') raiFilters.push({ "filterType": "SEXUALLY_EXPLICIT", "confidenceLevel": config.sexuallyExplicit });
        if (config.dangerousContent !== 'OFF') raiFilters.push({ "filterType": "DANGEROUS_CONTENT", "confidenceLevel": config.dangerousContent });

        return {
            "template": {
                "filterConfig": {
                    "raiSettings": {
                        "raiFilters": raiFilters
                    },
                    "sdpSettings": {
                        "sdpFilters": filters
                    },
                    "piAndJailbreakFilterSettings": {
                        "filterEnforcement": config.jailbreak ? "ENABLED" : "DISABLED",
                        "confidenceLevel": "MEDIUM_AND_ABOVE"
                    },
                    "maliciousUriFilterSettings": {
                        "filterEnforcement": config.maliciousUris ? "ENABLED" : "DISABLED"
                    }
                }
            }
        };
    }, [config]);

    const generatedCommand = `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(generatedJson)}' \\
  "https://modelarmor.googleapis.com/v1/projects/${projectId}/locations/global/templates?templateId=${policyName}"`;

    const attachCommand = useMemo(() => {
        if (selectedEngineIndex < 0 || !engines[selectedEngineIndex]) return '';
        const eng = engines[selectedEngineIndex];
        const engineId = eng.name.split("/").pop();
        const loc = eng.location;
        const templateResourceName = `projects/${projectId}/locations/global/templates/${policyName}`;
        
        const modelArmorConfig: any = {};
        if (policyType === 'input' || policyType === 'both') {
            modelArmorConfig.userPromptTemplate = templateResourceName;
        }
        if (policyType === 'output' || policyType === 'both') {
            modelArmorConfig.responseTemplate = templateResourceName;
        }
        
        const payload = {
            customerPolicy: {
                modelArmorConfig
            }
        };
        
        return `curl -X PATCH \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}' \\
  "https://${loc === 'global' ? '' : loc + '-'}discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${loc}/collections/default_collection/engines/${engineId}/assistants/default_assistant?updateMask=customerPolicy"`;
    }, [selectedEngineIndex, engines, policyName, projectId, policyType]);

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedCommand);
        setCopySuccess('Copied!');
        setTimeout(() => setCopySuccess(''), 2000);
    };

    const handleCopyAttach = () => {
        navigator.clipboard.writeText(attachCommand);
        setCopyAttachSuccess('Copied!');
        setTimeout(() => setCopyAttachSuccess(''), 2000);
    };

    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
            <div className="p-6 border-b border-gray-700 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h3 className="text-lg font-bold text-white">Policy Template Generator</h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Design a Model Armor template to filter harmful content and redact sensitive data.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider mr-2">Presets:</span>
                    <button 
                        onClick={() => applyPreset('bp_input')}
                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 text-xs font-semibold rounded text-gray-200 border border-gray-650"
                        title="Decoupled input template: Jailbreak protection and PII redaction"
                    >
                        Best Practice: Input Filter
                    </button>
                    <button 
                        onClick={() => applyPreset('bp_output')}
                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 text-xs font-semibold rounded text-gray-200 border border-gray-650"
                        title="Decoupled output template: Malicious URI and PII redaction"
                    >
                        Best Practice: Output Filter
                    </button>
                    <button 
                        onClick={() => applyPreset('strict')}
                        className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-850/60 text-xs font-semibold rounded text-indigo-200 border border-indigo-800"
                        title="Strict Hardened: Low threshold safety filters"
                    >
                        Strict Compliance
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2">
                {/* Left: Configuration Form */}
                <div className="p-6 space-y-6 bg-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Template ID</label>
                            <input 
                                type="text" 
                                value={policyName} 
                                onChange={(e) => setPolicyName(e.target.value)} 
                                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-blue-500"
                            />
                        </div>

                        {engines.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Target App to Associate</label>
                                <select
                                    value={selectedEngineIndex}
                                    onChange={(e) => setSelectedEngineIndex(Number(e.target.value))}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-blue-500"
                                >
                                    <option value={-1}>-- Do not generate attach command --</option>
                                    {engines.map((eng, idx) => (
                                        <option key={eng.name} value={idx}>
                                            {eng.displayName || eng.name.split("/").pop()} ({eng.location})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {selectedEngineIndex >= 0 && (
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Bind Template As</label>
                                <div className="flex gap-6 items-center bg-gray-900/40 p-3 rounded-lg border border-gray-700/60 w-fit">
                                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300 hover:text-white select-none">
                                        <input 
                                            type="radio" 
                                            name="policyType" 
                                            checked={policyType === 'input'} 
                                            onChange={() => setPolicyType('input')}
                                            className="bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                        />
                                        Input Filter (User Prompt)
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300 hover:text-white select-none">
                                        <input 
                                            type="radio" 
                                            name="policyType" 
                                            checked={policyType === 'output'} 
                                            onChange={() => setPolicyType('output')}
                                            className="bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                        />
                                        Output Filter (Model Response)
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300 hover:text-white select-none">
                                        <input 
                                            type="radio" 
                                            name="policyType" 
                                            checked={policyType === 'both'} 
                                            onChange={() => setPolicyType('both')}
                                            className="bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                        />
                                        Both (Prompt & Response)
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Responsible AI Filters</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {['hateSpeech', 'harassment', 'sexuallyExplicit', 'dangerousContent'].map((key) => {
                                const filterKey = key as 'hateSpeech' | 'harassment' | 'sexuallyExplicit' | 'dangerousContent';
                                const isEnabled = config[filterKey] !== 'OFF';
                                return (
                                    <div key={key} className="flex items-center justify-between p-3 bg-gray-700/20 rounded-lg border border-gray-700 hover:bg-gray-700/30 transition-colors">
                                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={isEnabled} 
                                                onChange={() => toggleRai(filterKey)}
                                                className="w-4 h-4 rounded bg-gray-800 border-gray-500 text-blue-500 focus:ring-blue-500"
                                            />
                                            <span className="text-sm font-medium text-gray-300 capitalize">
                                                {key.replace(/([A-Z])/g, ' $1').trim()}
                                            </span>
                                        </label>
                                        
                                        {isEnabled && (
                                            <select
                                                value={config[filterKey]}
                                                onChange={(e) => changeRaiLevel(filterKey, e.target.value)}
                                                className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-blue-500"
                                            >
                                                <option value="LOW_AND_ABOVE">Low & above</option>
                                                <option value="MEDIUM_AND_ABOVE">Medium & above</option>
                                                <option value="HIGH">High only</option>
                                            </select>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-700">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Data Protection & Security</h4>
                        <div className="space-y-3">
                            <label className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700/50">
                                <div>
                                    <span className="block text-sm font-medium text-white">Sensitive Data Protection (PII)</span>
                                    <span className="text-xs text-gray-400">Redact Email & Phone numbers</span>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={config.pii} 
                                    onChange={() => toggle('pii')}
                                    className="w-5 h-5 rounded bg-gray-800 border-gray-500 text-blue-500 focus:ring-blue-500"
                                />
                            </label>
                            <label className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700/50">
                                <div>
                                    <span className="block text-sm font-medium text-white">Prompt Injection Defense</span>
                                    <span className="text-xs text-gray-400">Block jailbreak attempts and system prompt overrides</span>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={config.jailbreak} 
                                    onChange={() => toggle('jailbreak')}
                                    className="w-5 h-5 rounded bg-gray-800 border-gray-500 text-blue-500 focus:ring-blue-500"
                                />
                            </label>
                             <label className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700/50">
                                <div>
                                    <span className="block text-sm font-medium text-white">Malicious URI Filter</span>
                                    <span className="text-xs text-gray-400">Block known malicious URLs</span>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={config.maliciousUris} 
                                    onChange={() => toggle('maliciousUris')}
                                    className="w-5 h-5 rounded bg-gray-800 border-gray-500 text-blue-500 focus:ring-blue-500"
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Right: Code Preview Panel */}
                <div className="bg-black p-6 border-l border-gray-700 flex flex-col justify-between overflow-y-auto max-h-[600px] custom-scrollbar">
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-semibold text-gray-300">1. Create Safety Template Command</h4>
                                <button 
                                    onClick={handleCopy}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors"
                                >
                                    <CopyIcon />
                                    {copySuccess || 'Copy Command'}
                                </button>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 font-mono text-xs text-green-400 leading-relaxed whitespace-pre-wrap break-all">
                                {generatedCommand}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                Run this command in your terminal to create the template. Once created, attach it to your Agent Engine or Chat App.
                            </p>
                        </div>

                        {attachCommand && (
                            <div className="pt-6 border-t border-gray-800">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-sm font-semibold text-gray-300">2. Attach Policy to Selected App</h4>
                                    <button 
                                        onClick={handleCopyAttach}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-md transition-colors"
                                    >
                                        <CopyIcon />
                                        {copyAttachSuccess || 'Copy Attach Command'}
                                    </button>
                                </div>
                                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 font-mono text-xs text-green-400 leading-relaxed whitespace-pre-wrap break-all">
                                    {attachCommand}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    Run this command in your terminal to associate the template with your app's assistant config.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


const getTemplateFilters = (template: any) => {
    const fc = template.filterConfig || {};
    const raiFilters = fc.raiSettings?.raiFilters || [];
    const activeRai = raiFilters.map((f: any) => ({
        type: f.filterType,
        level: f.confidenceLevel
    }));
    const sdpActive = fc.sdpSettings?.basicConfig?.filterEnforcement === "ENABLED";
    const jailbreakActive = fc.piAndJailbreakFilterSettings?.filterEnforcement === "ENABLED";
    const maliciousUrisActive = fc.maliciousUriFilterSettings?.filterEnforcement === "ENABLED";

    return {
        rai: activeRai,
        sdp: sdpActive,
        jailbreak: jailbreakActive,
        maliciousUris: maliciousUrisActive
    };
};

const formatConfidenceLevel = (level: string) => {
    if (level === "LOW_AND_ABOVE") return "Low+";
    if (level === "MEDIUM_AND_ABOVE") return "Med+";
    if (level === "HIGH") return "High";
    return level;
};

interface ActivePoliciesViewerProps {
    templates: any[];
    associations: Record<string, string[]>;
    isLoading: boolean;
    error: string | null;
    onRefresh: () => void;
    onClone: (template: any) => void;
}

const ActivePoliciesViewer: React.FC<ActivePoliciesViewerProps> = ({ templates, associations, isLoading, error, onRefresh, onClone }) => {
    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                <div>
                    <h3 className="text-lg font-bold text-white">Active Protection Policies</h3>
                    <p className="text-sm text-gray-400 mt-0.5">Existing Model Armor templates registered in the project.</p>
                </div>
                <button
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="px-3.5 py-1.5 bg-gray-700 hover:bg-gray-650 text-gray-200 text-xs font-semibold rounded border border-gray-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                    {isLoading && <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                    Refresh List
                </button>
            </div>

            {error && <div className="text-sm text-red-400 p-3 bg-red-950/20 rounded border border-red-900/50">{error}</div>}

            {isLoading && templates.length === 0 ? (
                <div className="flex items-center justify-center p-12"><Spinner /></div>
            ) : templates.length === 0 ? (
                <div className="text-center p-8 text-gray-500 bg-gray-900/30 rounded border border-gray-800">
                    No active Model Armor templates found in this project.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                                <th className="pb-3 pl-3">Template ID</th>
                                <th className="pb-3">Security Features</th>
                                <th className="pb-3">RAI Filters</th>
                                <th className="pb-3">Associated Apps</th>
                                <th className="pb-3 pr-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-sm text-gray-300">
                            {templates.map((temp) => {
                                const templateId = temp.name.split("/").pop();
                                const location = temp.name.split("/")[3];
                                const filters = getTemplateFilters(temp);
                                const apps = associations[temp.name] || [];
                                
                                return (
                                    <tr key={temp.name} className="hover:bg-gray-800/20 transition-colors">
                                        <td className="py-4 pl-3 max-w-[200px] truncate">
                                            <div className="font-mono font-semibold text-white truncate" title={templateId}>{templateId}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5">{location}</div>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {filters.jailbreak && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-200 border border-blue-800/60">
                                                        Jailbreak Defense
                                                    </span>
                                                )}
                                                {filters.maliciousUris && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-200 border border-purple-800/60">
                                                        Malicious URI
                                                    </span>
                                                )}
                                                {filters.sdp && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-900/60 text-teal-200 border border-teal-800/60">
                                                        PII Redaction
                                                    </span>
                                                )}
                                                {!filters.jailbreak && !filters.maliciousUris && !filters.sdp && (
                                                    <span className="text-xs text-gray-500 italic">None</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {filters.rai.length > 0 ? (
                                                    filters.rai.map((r: { type: string, level: string }) => (
                                                        <span key={r.type} className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/60 text-green-200 border border-green-800/60 flex items-center gap-1.5">
                                                            <span className="capitalize">{r.type.toLowerCase().replace("_", " ")}</span>
                                                            <span className="text-green-300 font-mono text-[9px] bg-black/40 px-1 rounded border border-green-800/40">
                                                                {formatConfidenceLevel(r.level)}
                                                            </span>
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-gray-500 italic">None</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            {apps.length > 0 ? (
                                                <div className="space-y-1">
                                                    {apps.map((app: string) => (
                                                        <span key={app} className="block text-xs bg-gray-900/60 px-2 py-1 rounded text-gray-300 border border-gray-800">
                                                            {app}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-gray-700/60 text-gray-400 border border-gray-650">
                                                    Unused
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-4 pr-3 text-right">
                                            <button
                                                onClick={() => onClone(temp)}
                                                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-xs font-semibold rounded text-white border border-gray-650 flex items-center justify-center gap-1 ml-auto transition-colors"
                                                title="Clone this template to another location or project"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                                </svg>
                                                Clone
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

// --- Clone Template Modal ---

interface CloneTemplateModalProps {
    template: any;
    currentProjectId: string;
    onClose: () => void;
    onSuccess: () => void;
}

const CloneTemplateModal: React.FC<CloneTemplateModalProps> = ({ template, currentProjectId, onClose, onSuccess }) => {
    const sourceTemplateId = template.name.split("/").pop();
    const sourceLocation = template.name.split("/")[3];

    const [targetProjectId, setTargetProjectId] = useState(currentProjectId);
    const [targetLocation, setTargetLocation] = useState(sourceLocation);
    const [targetTemplateId, setTargetTemplateId] = useState(`${sourceTemplateId}-clone`);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetProjectId.trim() || !targetTemplateId.trim()) {
            setError("Project ID and New Template ID are required.");
            return;
        }
        
        setIsSubmitting(true);
        setError(null);

        try {
            const payload = {
                filterConfig: template.filterConfig,
                templateMetadata: template.templateMetadata
            };
            
            await api.createModelArmorTemplate(
                targetProjectId.trim(),
                targetLocation,
                targetTemplateId.trim(),
                payload
            );
            
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Failed to clone template.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-fade-in-up">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/80">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                        </svg>
                        Clone Protection Policy
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-950/20 rounded border border-red-900/50 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="p-3.5 bg-gray-900/40 border border-gray-700/60 rounded-lg space-y-1.5 text-xs">
                        <div className="text-gray-500 font-semibold uppercase tracking-wider">Source Template</div>
                        <div className="text-gray-300 font-mono"><span className="text-gray-400">ID:</span> {sourceTemplateId}</div>
                        <div className="text-gray-300 font-mono"><span className="text-gray-400">Location:</span> {sourceLocation}</div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Target GCP Project ID</label>
                        <input 
                            type="text" 
                            value={targetProjectId} 
                            onChange={(e) => setTargetProjectId(e.target.value)}
                            placeholder="GCP Project ID or Project Number"
                            className="w-full bg-gray-900 border border-gray-650 rounded px-3 py-2 text-white text-sm focus:ring-blue-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Target Location</label>
                            <select
                                value={targetLocation}
                                onChange={(e) => setTargetLocation(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-650 rounded px-3 py-2 text-white text-sm focus:ring-blue-500"
                            >
                                <option value="global">global</option>
                                <option value="us">us</option>
                                <option value="eu">eu</option>
                                <option value="us-central1">us-central1</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1.5">New Template ID</label>
                            <input 
                                type="text" 
                                value={targetTemplateId} 
                                onChange={(e) => setTargetTemplateId(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-650 rounded px-3 py-2 text-white text-sm focus:ring-blue-500 font-mono"
                            />
                        </div>
                        <div className="col-span-2">
                            <p className="text-[10px] text-gray-500 italic mt-0.5 leading-relaxed">
                                Note: Location availability depends on the target project's Google Cloud Organization Resource Location Policies (e.g. some projects restrict template writes to the "global" location).
                            </p>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-700 flex justify-end gap-3">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-650 text-gray-200 text-sm font-semibold rounded"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                            {isSubmitting && <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                            Clone Template
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Main Page Component ---

const ModelArmorPage: React.FC<{ projectNumber: string; setProjectNumber: (projectNumber: string) => void; }> = ({ projectNumber, setProjectNumber }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);
  const [daysFilter, setDaysFilter] = useState(7);
  const [activeTab, setActiveTab] = useState<'logs' | 'policies'>('logs');

  // Policies and Associations state
  const [templates, setTemplates] = useState<any[]>([]);
  const [associations, setAssociations] = useState<Record<string, string[]>>({});
  const [enginesList, setEnginesList] = useState<any[]>([]);
  const [isPoliciesLoading, setIsPoliciesLoading] = useState(false);
  const [policiesError, setPoliciesError] = useState<string | null>(null);
  const [cloningTemplate, setCloningTemplate] = useState<any | null>(null);

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectNumber,
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: '',
  }), [projectNumber]);

  const fetchPoliciesAndAssociations = useCallback(async () => {
    if (!projectNumber) return;
    setIsPoliciesLoading(true);
    setPoliciesError(null);
    try {
      // 1. Fetch templates
      const templatesRes = await api.fetchModelArmorTemplates(apiConfig);
      const fetchedTemplates = templatesRes.templates || [];
      setTemplates(fetchedTemplates);

      // 2. Fetch engines across all discovery locations
      const newAssociations: Record<string, string[]> = {};
      const allFetchedEngines: any[] = [];

      for (const loc of ["global", "us", "eu"]) {
        try {
          const locConfig = { ...apiConfig, appLocation: loc };
          const enginesRes = await api.listResources("engines", { ...locConfig, appId: "" });
          const engines = enginesRes.engines || [];
          
          for (const engine of engines) {
            allFetchedEngines.push({ ...engine, location: loc });
            const engineId = engine.name.split("/").pop();
            if (!engineId) continue;
            
            try {
              const assistantsRes = await api.listResources("assistants", { ...locConfig, appId: engineId });
              const assistants = assistantsRes.assistants || [];
              
              for (const assistant of assistants) {
                const assistantId = assistant.name.split("/").pop();
                const config = assistant.customerPolicy?.modelArmorConfig;
                if (config) {
                  const userPrompt = config.userPromptTemplate;
                  const responseTemp = config.responseTemplate;
                  
                  const appLabel = `${engine.displayName || engineId} (${loc.toUpperCase()} / Assistant: ${assistantId})`;
                  
                  if (userPrompt) {
                    newAssociations[userPrompt] = newAssociations[userPrompt] || [];
                    if (!newAssociations[userPrompt].includes(appLabel)) {
                      newAssociations[userPrompt].push(appLabel);
                    }
                  }
                  if (responseTemp) {
                    newAssociations[responseTemp] = newAssociations[responseTemp] || [];
                    if (!newAssociations[responseTemp].includes(appLabel)) {
                      newAssociations[responseTemp].push(appLabel);
                    }
                  }
                }
              }
            } catch (err) {
              console.warn(`Failed to fetch assistants for engine ${engineId} in ${loc}`, err);
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch engines in location ${loc}`, err);
        }
      }
      setEnginesList(allFetchedEngines);
      setAssociations(newAssociations);
    } catch (err: any) {
      setPoliciesError(err.message || "Failed to fetch policies and associations.");
    } finally {
      setIsPoliciesLoading(false);
    }
  }, [apiConfig, projectNumber]);

  useEffect(() => {
    if (activeTab === 'policies' && projectNumber) {
      fetchPoliciesAndAssociations();
    }
  }, [activeTab, projectNumber, fetchPoliciesAndAssociations]);
  
  const handleFetchLogs = useCallback(async () => {
    if (!projectNumber) {
        setError("Project ID is required to fetch logs.");
        return;
    }
    
    setIsLoading(true);
    setError(null);
    setLogs([]);

    const filters = [];
    if (filterBlockedOnly) {
        filters.push(`(jsonPayload.sanitizationResult.sanitizationVerdict="BLOCKED" OR jsonPayload.sanitizationResult.sanitizationVerdict="MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK")`);
    }
    if (filterText.trim()) {
        filters.push(`(${filterText.trim()})`);
    }
    
    // Add date range filter
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysFilter);
    filters.push(`timestamp >= "${cutoffDate.toISOString()}"`);

    const combinedCustomFilter = filters.join(' AND ');

    try {
      const response = await api.fetchViolationLogs(apiConfig, combinedCustomFilter);
      setLogs(response.entries || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch violation logs.');
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, filterText, projectNumber, filterBlockedOnly, daysFilter]);

  const cloudConsoleUrl = useMemo(() => {
    const filters = [`resource.type="modelarmor.googleapis.com/SanitizeOperation"`];
    if (filterBlockedOnly) {
        filters.push(`(jsonPayload.sanitizationResult.sanitizationVerdict="BLOCKED" OR jsonPayload.sanitizationResult.sanitizationVerdict="MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK")`);
    }
    if (filterText.trim()) {
        filters.push(`(${filterText.trim()})`);
    }
    
    const combinedQuery = filters.join('\n');
    const encodedQuery = encodeURIComponent(combinedQuery);
    
    // Convert days to ISO 8601 duration
    const durationStr = `P${daysFilter}D`;
    
    return `https://console.cloud.google.com/logs/query;query=${encodedQuery};duration=${durationStr}?referrer=search&project=${projectNumber}`;
  }, [filterBlockedOnly, filterText, daysFilter, projectNumber]);
  
  const renderContent = () => {
    if (!projectNumber) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-lg border border-gray-700 border-dashed mt-4">
                <ShieldIcon />
                <p className="text-gray-400 mt-2">Please set your Project ID to view logs.</p>
            </div>
        );
    }
    
    if (isLoading) return <div className="mt-8"><Spinner /></div>;

    return (
        <div className="mt-6 space-y-4">
            {logs.length > 0 ? (
                logs.map((log, index) => <LogEntryCard key={`${log.logName}-${log.receiveTimestamp}-${index}`} log={log} />)
            ) : (
                <div className="text-center text-gray-400 mt-8 p-12 bg-gray-800 rounded-lg border border-gray-700">
                    <ShieldIcon />
                    <h3 className="text-lg font-semibold text-white mt-2">No Logs Found</h3>
                    <p className="max-w-md mx-auto mt-1 text-sm">
                        No violation logs matched your criteria. Try adjusting your filters or ensure Model Armor is active on your resources.
                    </p>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="space-y-4">
        {/* Header & Main Controls */}
        <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 border-b border-gray-700 pb-4">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <ShieldIcon />
                            Model Armor Manager
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">Monitor content safety violations and configure protection policies.</p>
                    </div>
                </div>
                <div className="w-full md:w-auto">
                    <CloudConsoleButton url={cloudConsoleUrl} />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-700 mb-4">
                <button 
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'logs' ? 'text-blue-400 border-blue-400' : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'}`}
                >
                    Activity Logs
                </button>
                <button 
                    onClick={() => setActiveTab('policies')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'policies' ? 'text-blue-400 border-blue-400' : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'}`}
                >
                    Policy Configuration
                </button>
            </div>

            {/* Filters Row (Only for Logs) */}
            {activeTab === 'logs' && (
                <>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-gray-400 mb-1">Search Filters</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <SearchIcon />
                                </div>
                                <input
                                    type="text"
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                    placeholder='e.g. jsonPayload.sanitizationResult.verdict="BLOCKED"'
                                    className="pl-10 block w-full bg-gray-900 border border-gray-600 rounded-md py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 h-[38px]"
                                />
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-4 w-full md:w-auto">
                             <div className="flex flex-col min-w-[140px]">
                                <label className="block text-xs font-medium text-gray-400 mb-1">Time Range</label>
                                <select
                                    value={daysFilter}
                                    onChange={(e) => setDaysFilter(Number(e.target.value))}
                                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 h-[38px]"
                                >
                                    <option value={1}>Last 24 Hours</option>
                                    <option value={3}>Last 3 Days</option>
                                    <option value={7}>Last 7 Days</option>
                                    <option value={30}>Last 30 Days</option>
                                </select>
                            </div>

                            <div className="flex items-center h-[38px] mt-auto">
                                 <label className="flex items-center cursor-pointer gap-2 px-3 py-2 bg-gray-700/50 rounded-md border border-gray-600 hover:bg-gray-700 transition-colors h-full">
                                    <input 
                                        type="checkbox" 
                                        checked={filterBlockedOnly} 
                                        onChange={() => setFilterBlockedOnly(!filterBlockedOnly)} 
                                        className="w-4 h-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500 bg-gray-800"
                                    />
                                    <span className="text-sm text-gray-300 select-none">Blocked Only</span>
                                </label>
                            </div>

                            <button 
                                onClick={handleFetchLogs} 
                                disabled={isLoading || !projectNumber}
                                className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg transition-all h-[38px] flex items-center justify-center min-w-[100px]"
                            >
                                {isLoading ? (
                                    <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                ) : 'Fetch Logs'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center gap-2 text-xs text-gray-500">
                        <InfoIcon />
                        <span>Querying: <code className="bg-gray-900 px-1 py-0.5 rounded text-gray-400 border border-gray-700">resource.type="modelarmor.googleapis.com/SanitizeOperation"</code></span>
                    </div>
                </>
            )}
        </div>

        {/* Content Area */}
        <div>
            {error && activeTab === 'logs' && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg border border-red-800/50">{error}</div>}
            
            {activeTab === 'logs' && renderContent()}
            
            {activeTab === 'policies' && (
                <div className="space-y-6 animate-fade-in-up">
                    <ActivePoliciesViewer
                        templates={templates}
                        associations={associations}
                        isLoading={isPoliciesLoading}
                        error={policiesError}
                        onRefresh={fetchPoliciesAndAssociations}
                        onClone={setCloningTemplate}
                    />
                    <PolicyGenerator 
                        projectId={projectNumber || '[YOUR_PROJECT_ID]'} 
                        engines={enginesList}
                    />
                    {cloningTemplate && (
                        <CloneTemplateModal
                            template={cloningTemplate}
                            currentProjectId={projectNumber || ''}
                            onClose={() => setCloningTemplate(null)}
                            onSuccess={() => {
                                setCloningTemplate(null);
                                fetchPoliciesAndAssociations();
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default ModelArmorPage;
