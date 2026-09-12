import React, { useState, useEffect } from 'react';
import { AppEngine, Config } from '../../types';
import * as api from '../../services/apiService';
import InfoTooltip from '../InfoTooltip';

declare let JSZip: any;

interface AuditLoggingModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: Config;
    engine: AppEngine;
    onUpdateSuccess: (updatedEngine: AppEngine) => void;
    projectNumber: string;
}

const AuditLoggingModal: React.FC<AuditLoggingModalProps> = ({ isOpen, onClose, config, engine, onUpdateSuccess, projectNumber }) => {
    const [step, setStep] = useState(1);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployMethod, setDeployMethod] = useState<'gcloud' | 'cloud-build'>('gcloud');
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Engine states (Observability)
    const [observabilityEnabled, setObservabilityEnabled] = useState(false);
    const [sensitiveLoggingEnabled, setSensitiveLoggingEnabled] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Cloud Build staging bucket config (needed if doing cloud build)
    const [buckets, setBuckets] = useState<any[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<string>('');
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);

    // BigQuery Log Sync states
    const [datasetId, setDatasetId] = useState('agentspace_audit_logs');
    const [isSyncing, setIsSyncing] = useState(false);
    const [writerIdentity, setWriterIdentity] = useState<string | null>(null);
    const [availableDatasets, setAvailableDatasets] = useState<any[]>([]);
    const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
    const [isCreatingNewDataset, setIsCreatingNewDataset] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setObservabilityEnabled(engine.observabilityConfig?.observabilityEnabled || false);
            setSensitiveLoggingEnabled(engine.observabilityConfig?.sensitiveLoggingEnabled || false);
            setStatus(null);
            setError(null);
            setStep(1);
        }
    }, [isOpen, engine]);

    useEffect(() => {
        if (isOpen && deployMethod === 'cloud-build') {
            const fetchBuckets = async () => {
                setIsLoadingBuckets(true);
                try {
                    const res = await api.listBuckets(config.projectId);
                    const items = res.items || [];
                    setBuckets(items);
                    if (items.length > 0) {
                        setSelectedBucket(items[0].name);
                    }
                } catch (e) {
                    console.error("Failed to fetch buckets", e);
                } finally {
                    setIsLoadingBuckets(false);
                }
            };
            fetchBuckets();
        }
    }, [isOpen, deployMethod, config.projectId]);

    useEffect(() => {
        if (isOpen && step === 4) {
            const fetchDatasets = async () => {
                setIsLoadingDatasets(true);
                try {
                    const res = await api.listBigQueryDatasets(config.projectId);
                    const items = res.datasets || [];
                    setAvailableDatasets(items);
                    if (items.length > 0) {
                        setDatasetId(items[0].datasetReference.datasetId);
                        setIsCreatingNewDataset(false);
                    } else {
                        setIsCreatingNewDataset(true);
                    }
                } catch (e) {
                    console.error("Failed to fetch BigQuery datasets", e);
                } finally {
                    setIsLoadingDatasets(false);
                }
            };
            fetchDatasets();
        }
    }, [isOpen, step, config.projectId]);

    const handleSaveEngineConfig = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const payload: any = {
                observabilityConfig: {
                    observabilityEnabled,
                    sensitiveLoggingEnabled
                }
            };
            const updated = await api.updateEngine(engine.name, payload, ['observabilityConfig'], config);
            onUpdateSuccess(updated);
            setStatus("Engine configuration updated successfully!");
        } catch (err: any) {
            setError(err.message || "Failed to update engine configuration.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSetupBigQuerySync = async () => {
        setIsSyncing(true);
        setError(null);
        setStatus(null);
        try {
            // Parse location from engine.name
            const locationMatch = engine.name.match(/locations\/([^/]+)/);
            let location = 'US';
            if (locationMatch && locationMatch[1]) {
                const match = locationMatch[1].toLowerCase();
                if (match.startsWith('us')) location = 'US';
                else if (match.startsWith('eu')) location = 'EU';
                else if (match === 'global') location = 'US'; // BigQuery doesn't support global datasets
                else location = locationMatch[1]; 
            }

            // 1. Create BigQuery dataset
            if (isCreatingNewDataset) {
                setStatus("Creating BigQuery dataset...");
                try {
                    await api.createBigQueryDataset(config.projectId, datasetId, location);
                } catch (datasetErr: any) {
                    if (datasetErr.status !== 409 && !(datasetErr.body && datasetErr.body.includes("Already Exists"))) {
                        throw datasetErr;
                    }
                    console.log("Dataset already exists, proceeding...");
                }
            }

            // 2. Create Logging Sink
            setStatus("Creating Logging Sink...");
            const sinkName = `gemini_enterprise_user_audit_logs`;
            const destination = `bigquery.googleapis.com/projects/${config.projectId}/datasets/${datasetId}`;
            const filter = `logName="projects/${config.projectId}/logs/discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity" OR logName=~"projects/${config.projectId}/logs/discoveryengine.googleapis.com%2Fgen_ai.*"`;
            
            let writerIdentity = '';
            try {
                const sinkRes = await api.createLoggingSink(config.projectId, sinkName, destination, filter);
                writerIdentity = sinkRes.writerIdentity;
                setStatus("Log sink created successfully!");
            } catch (sinkErr: any) {
                if (sinkErr.status === 409 || (sinkErr.body && sinkErr.body.includes("already exists"))) {
                    console.log("Sink already exists. Fetching existing sink identity...");
                    const existingSink = await api.getLoggingSink(config.projectId, sinkName);
                    writerIdentity = existingSink.writerIdentity;
                    setStatus("Found existing Log Sink identity!");
                } else {
                    throw sinkErr;
                }
            }
            setWriterIdentity(writerIdentity);

            // 3. Attempt dataset access update automatically
            try {
                setStatus("Configuring dataset permissions...");
                const dataset = await api.getDataset(config.projectId, datasetId);
                const currentAccess = dataset.access || [];
                
                const hasAccess = currentAccess.some((a: any) => a.userByEmail === writerIdentity.replace('serviceAccount:', ''));
                if (!hasAccess) {
                    currentAccess.push({
                        role: "WRITER",
                        userByEmail: writerIdentity.replace('serviceAccount:', '')
                    });
                    await api.updateDatasetAccess(config.projectId, datasetId, currentAccess);
                    setStatus("Log Sync setup fully automated successfully!");
                } else {
                    setStatus("Permissions already granted!");
                }
            } catch (iamErr: any) {
                console.warn("Failed to update dataset permissions automatically:", iamErr);
                setStatus("Log sink created, but automatic IAM permission configuration failed. Please grant permissions manually.");
            }
        } catch (err: any) {
            setError(err.message || "Failed to setup BigQuery log sync.");
        } finally {
            setIsSyncing(false);
        }
    };

    const pythonScript = ``; // Removed as not needed by the guide
    const cloudbuildYaml = ``;
    const gcloudScript = ``;
    const deployCommand = ``;

    const handleCloudBuildDeploy = async () => {}; // Removed

    const logsUrl = `https://console.cloud.google.com/logs/query;query=logName%3D%22projects%2F${config.projectId}%2Flogs%2Fdiscoveryengine.googleapis.com%252Fgemini_enterprise_user_activity%22%20OR%20logName%3D~%22projects%2F${config.projectId}%2Flogs%2Fdiscoveryengine.googleapis.com%252Fgen_ai.*%22?project=${config.projectId}`;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl p-6 border border-gray-700 font-sans max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-white mb-2">Usage Audit Logging Setup</h2>
                <p className="text-sm text-gray-400 mb-6">
                    As an administrator, you can turn on and monitor usage audit logging for Gemini Enterprise.
                </p>

                {/* Steps Navigation */}
                <div className="flex items-center justify-between mb-8 border-b border-gray-700 pb-4">
                    {[1, 2, 3, 4].map((s) => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`rounded-full h-8 w-8 flex items-center justify-center font-bold border ${step === s ? 'bg-blue-600 text-white border-blue-600' : step > s ? 'bg-green-600 text-white border-green-600' : 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                                {step > s ? '✓' : s}
                            </div>
                            <span className={`text-sm ${step === s ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                {s === 1 ? 'Prerequisites' : s === 2 ? 'Configure Observability' : s === 3 ? 'View Logs' : 'Sync to BQ'}
                            </span>
                            {s < 4 && <div className="h-[2px] w-12 bg-gray-700"></div>}
                        </div>
                    ))}
                </div>

                {/* Step 1: Prerequisites */}
                {step === 1 && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">1. Verify Permissions</h3>
                        <p className="text-sm text-gray-300">
                            Before configuring audit logs, ensure you have the following IAM roles:
                        </p>
                        <ul className="space-y-2 bg-gray-900/50 p-4 rounded-md border border-gray-700 text-sm text-gray-300">
                            <li className="flex items-start gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10c0-1.718-.433-3.333-1.2-4.782" />
                                </svg>
                                <div>
                                    <strong className="text-white">Discovery Engine Admin</strong> (<code>roles/discoveryengine.admin</code>)
                                    <p className="text-xs text-gray-400">Required to turn on the audit logging.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10c0-1.718-.433-3.333-1.2-4.782" />
                                </svg>
                                <div>
                                    <strong className="text-white">Logs Viewer</strong> (<code>roles/logging.viewer</code>)
                                    <p className="text-xs text-gray-400">Required to access and view logs in Cloud Logging.</p>
                                </div>
                            </li>
                        </ul>

                        <div className="bg-yellow-900/30 border border-yellow-700 p-3 rounded-md">
                            <p className="text-xs text-yellow-400">
                                <strong>Note:</strong> Sensitive data is not filtered out of the audit logs when sensitive data logging is enabled.
                            </p>
                        </div>

                        <div className="flex justify-between pt-4 border-t border-gray-700 mt-6">
                            <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Close</button>
                            <button onClick={() => setStep(2)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700">Next Step</button>
                        </div>
                    </div>
                )}

                {/* Step 2: Engine Toggle */}
                {step === 2 && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">2. Configure Observability</h3>
                        <p className="text-sm text-gray-300">
                            Enable usage audit logging by updating the app&apos;s <code>observabilityConfig</code>.
                        </p>

                        <div className="space-y-4 p-4 bg-gray-900/30 rounded-md border border-gray-700">
                            <div className="flex items-center space-x-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    id="observabilityEnabledModal"
                                    checked={observabilityEnabled}
                                    onChange={(e) => setObservabilityEnabled(e.target.checked)}
                                    className="h-5 w-5 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="observabilityEnabledModal" className="flex items-center text-sm font-medium text-gray-200 cursor-pointer">
                                    Enable Usage Audit Logging
                                    <InfoTooltip text="Captures request and response data, including prompts and grounding metadata, and stores it in Cloud Logging." />
                                </label>
                            </div>
                            
                            <div className={`flex items-center space-x-3 pl-6 transition-opacity ${observabilityEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                <input
                                    type="checkbox"
                                    id="sensitiveLoggingEnabledModal"
                                    checked={sensitiveLoggingEnabled}
                                    onChange={(e) => setSensitiveLoggingEnabled(e.target.checked)}
                                    disabled={!observabilityEnabled}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="sensitiveLoggingEnabledModal" className="flex items-center text-xs font-medium text-gray-300 cursor-pointer">
                                    Enable Sensitive Data Logging
                                    <InfoTooltip text="WARNING: Sensitive data isn't filtered out of the audit logs when this is enabled." />
                                </label>
                            </div>
                        </div>

                        <button 
                            onClick={handleSaveEngineConfig} 
                            disabled={isSaving} 
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>}
                            Apply Configuration
                        </button>

                        <div className="flex justify-between pt-4 border-t border-gray-700 mt-6">
                            <button onClick={() => setStep(1)} className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600">Back</button>
                            <button onClick={() => setStep(3)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700">Next Step</button>
                        </div>
                    </div>
                )}

                {/* Step 3: View Logs */}
                {step === 3 && (
                    <div className="space-y-4 text-center py-6">
                        <div className="flex justify-center mb-4">
                            <div className="rounded-full bg-green-900/50 p-4 border border-green-700">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 8" />
                                </svg>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-white">Configuration Applied!</h3>
                        <p className="text-sm text-gray-300 max-w-md mx-auto mb-6">
                            Audit logging settings have been updated. To view logs, use the shortcut below to open Logs Explorer with the correct query filters.
                        </p>

                        <a 
                            href={logsUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-600 to-teal-500 hover:from-green-500 hover:to-teal-400 text-white font-bold rounded-md shadow-lg gap-2 transform hover:scale-105 transition-all"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                            Access Usage Logs
                        </a>

                        <div className="flex justify-between pt-6 border-t border-gray-700 mt-8">
                            <button onClick={onClose} className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600">Finish</button>
                            <button onClick={() => setStep(4)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700">Setup Log Sync (Optional)</button>
                        </div>
                    </div>
                )}
                {/* Step 4: BigQuery Log Sync */}
                {step === 4 && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">4. BigQuery Log Sync (Optional)</h3>
                        <p className="text-sm text-gray-300">
                            Setup a Logging Sink to automatically stream audit logs to a BigQuery dataset for long-term storage and analytics.
                        </p>

                        <div className="space-y-4 p-4 bg-gray-900/30 rounded-md border border-gray-700">
                            <div>
                                <label htmlFor="datasetId" className="block text-xs font-medium text-gray-400 mb-1">
                                    BigQuery Dataset
                                </label>
                                <div className="flex items-center gap-2">
                                    {!isCreatingNewDataset ? (
                                        <>
                                            <select
                                                id="datasetIdSelect"
                                                value={datasetId}
                                                onChange={(e) => setDatasetId(e.target.value)}
                                                className="flex-1 bg-gray-700 border-gray-600 rounded text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500"
                                                disabled={isSyncing || isLoadingDatasets}
                                            >
                                                {isLoadingDatasets ? (
                                                    <option>Loading datasets...</option>
                                                ) : availableDatasets.length === 0 ? (
                                                    <option>No datasets found</option>
                                                ) : (
                                                    availableDatasets.map((ds) => (
                                                        <option key={ds.id} value={ds.datasetReference.datasetId}>
                                                            {ds.datasetReference.datasetId}
                                                        </option>
                                                    ))
                                                )}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsCreatingNewDataset(true);
                                                    setDatasetId('agentspace_audit_logs'); 
                                                }}
                                                className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm font-bold"
                                                title="Create New Dataset"
                                                disabled={isSyncing}
                                            >
                                                +
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                id="datasetId"
                                                value={datasetId}
                                                onChange={(e) => setDatasetId(e.target.value)}
                                                className="flex-1 bg-gray-700 border-gray-600 rounded text-white text-sm px-3 py-2 focus:outline-none focus:border-blue-500"
                                                placeholder="agentspace_audit_logs"
                                                disabled={isSyncing}
                                            />
                                            {availableDatasets.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsCreatingNewDataset(false);
                                                        setDatasetId(availableDatasets[0].datasetReference.datasetId);
                                                    }}
                                                    className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm font-bold"
                                                    title="Select Existing Dataset"
                                                    disabled={isSyncing}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={handleSetupBigQuerySync} 
                            disabled={isSyncing} 
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSyncing && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>}
                            Setup BigQuery Log Sync
                        </button>


                        <div className="flex justify-between pt-4 border-t border-gray-700 mt-6">
                            <button onClick={() => setStep(3)} className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600" disabled={isSyncing}>Back</button>
                            <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700" disabled={isSyncing}>Finish</button>
                        </div>
                    </div>
                )}
                {error && <div className="p-3 bg-red-900/30 text-red-300 text-xs rounded-md border border-red-800 mt-4 whitespace-pre-wrap">{error}</div>}
                {status && <div className="p-3 bg-blue-900/30 text-blue-300 text-xs rounded-md border border-blue-800 mt-4">{status}</div>}
            </div>
        </div>
    );
};

export default AuditLoggingModal;
