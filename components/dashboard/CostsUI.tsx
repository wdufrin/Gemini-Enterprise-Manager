import React, { useState, useMemo, useEffect } from 'react';
import InfoTooltip from '../InfoTooltip';
import * as api from '../../services/apiService';
import { Config } from '../../types';

interface Props {
    projectNumber?: string;
}

const CostsUI: React.FC<Props> = ({ projectNumber }) => {
    const [edition, setEdition] = useState<'Standard' | 'Plus'>('Standard');
    const [licenses, setLicenses] = useState<number | ''>(10);
    const [showInstructions, setShowInstructions] = useState(false);

    // API State
    const [billingAccounts, setBillingAccounts] = useState<any[]>([]);
    const [selectedBillingAccountId, setSelectedBillingAccountId] = useState<string>('');
    const [licenseConfigs, setLicenseConfigs] = useState<any[]>([]);
    const [selectedConfigName, setSelectedConfigName] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<string>('');
    const [projectLicenses, setProjectLicenses] = useState<any[]>([]);
    const [selectedProjectLicense, setSelectedProjectLicense] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Monitoring State
    const [usageMetrics, setUsageMetrics] = useState<Record<string, number>>({});
    const [isFetchingMetrics, setIsFetchingMetrics] = useState(false);
    const [metricsError, setMetricsError] = useState<string | null>(null);

    // Fetch Billing Accounts
    useEffect(() => {
        const fetchAccounts = async () => {
            if (!projectNumber) return;
            setIsLoading(true);
            setError(null);
            try {
                // We use global location for listing billing accounts
                const config = { projectId: projectNumber, appLocation: 'global' } as Config;
                const res = await api.listBillingAccounts(config);
                const accounts = res.billingAccounts || [];
                setBillingAccounts(accounts);
                
                if (accounts.length === 1 && !selectedBillingAccountId) {
                     setSelectedBillingAccountId(accounts[0].name.split('/').pop());
                }
            } catch (err: any) {
                console.error("Failed to fetch billing accounts:", err);
                setError("Failed to load billing accounts.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchAccounts();
    }, [projectNumber]);

    // Fetch License Configs when Billing Account changes
    useEffect(() => {
        const fetchConfigs = async () => {
            if (!projectNumber || !selectedBillingAccountId) {
                setLicenseConfigs([]);
                return;
            }
            setIsLoading(true);
            try {
                const config = { projectId: projectNumber, appLocation: 'global' } as Config;
                const res = await api.listBillingAccountLicenseConfigs(selectedBillingAccountId, config);
                const configs = res.billingAccountLicenseConfigs || [];
                setLicenseConfigs(configs);

                if (configs.length === 1 && !selectedConfigName) {
                    handleConfigSelection(configs[0].name, '', configs);
                } else if (configs.length > 0 && selectedConfigName) {
                     // Update current selection if it still exists
                     const stillExists = configs.find(c => c.name === selectedConfigName);
                     if (stillExists) handleConfigSelection(selectedConfigName, '', configs);
                }
            } catch (err: any) {
                console.error("Failed to fetch license configs:", err);
                setError("Failed to load subscription profiles.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchConfigs();
    }, [projectNumber, selectedBillingAccountId]);

    const handleConfigSelection = (configName: string, locName: string = '', availableConfigs: any[] = licenseConfigs) => {
        setSelectedConfigName(configName);
        setSelectedLocation(locName);
        if (!configName) return;

        const selectedConfig = availableConfigs.find(c => c.name === configName);
        if (selectedConfig) {
            // Set Edition
            if (selectedConfig.subscriptionTier === 'GEMINI_ENTERPRISE_PLUS') {
                 setEdition('Plus');
            } else if (selectedConfig.subscriptionTier === 'GEMINI_ENTERPRISE') {
                 setEdition('Standard');
            } else if (selectedConfigName.endsWith('internal_only_agent_space')) {
                 setEdition('Standard'); // Fallback for the special internal ID
            }

            // Calculate total licenses across all distributed projects
            let totalLicenses = 0;
            if (selectedConfig.licenseConfigDistributions) {
                if (locName) {
                    // Filter specifically for the selected location in the current project
                    const targetKey = `projects/${projectNumber}/locations/${locName}`;
                    Object.entries(selectedConfig.licenseConfigDistributions).forEach(([key, val]: any) => {
                        if (key.includes(targetKey)) {
                            totalLicenses += Number(val) || 0;
                        }
                    });
                } else {
                    Object.values(selectedConfig.licenseConfigDistributions).forEach((val: any) => {
                        totalLicenses += Number(val) || 0;
                    });
                }
            }
            if (totalLicenses > 0) {
                 setLicenses(totalLicenses);
            }
        }
    };

    const handleProjectLicenseSelection = (licenseName: string) => {
        setSelectedProjectLicense(licenseName);
        if (!licenseName) return;

        const selectedLicense = projectLicenses.find(l => l.name === licenseName);
        if (selectedLicense) {
            if (selectedLicense.subscriptionTier === 'GEMINI_ENTERPRISE_PLUS') {
                 setEdition('Plus');
            } else {
                 setEdition('Standard');
            }
            if (selectedLicense.allocatedCount > 0) {
                 setLicenses(selectedLicense.allocatedCount);
            }
        }
    };

    // Fetch Project Local Licenses
    useEffect(() => {
        const fetchProjectLicenses = async () => {
            if (!projectNumber) return;
            setIsLoading(true);
            try {
                const locations = ['global', 'us', 'eu'];
                const discoveredLicenses: any[] = [];
                
                // 1. Query usage stats across all regions
                for (const loc of locations) {
                    try {
                        const config = { projectId: projectNumber, appLocation: loc } as Config;
                        const res = await api.listLicenseConfigsUsageStats(config);
                        if (res.licenseConfigUsageStats) {
                            for (const stat of res.licenseConfigUsageStats) {
                                if (stat.licenseConfig) {
                                    // Make sure we only add it once per name
                                    if (!discoveredLicenses.find(l => l.name === stat.licenseConfig)) {
                                        discoveredLicenses.push({ name: stat.licenseConfig });
                                    }
                                }
                            }
                        }
                    } catch (e: any) {
                        // Ignore 404s or 400s for regions that aren't provisioned
                    }
                }
                
                // 2. Hydrate subscription tiers and total counts by calling getLicenseConfig
                const hydratedLicenses = [];
                for (const license of discoveredLicenses) {
                     try {
                          const config = { projectId: projectNumber, appLocation: 'global' } as Config;
                          const res = await api.getLicenseConfig(license.name, config);
                          hydratedLicenses.push({
                              ...license,
                              allocatedCount: Number(res.licenseCount) || 0, // Using Total instead of Assigned
                              subscriptionTier: res.subscriptionTier || 'GEMINI_ENTERPRISE',
                              displayName: license.name.split('/').pop()
                          });
                     } catch (e: any) {
                          // Fallback
                          hydratedLicenses.push({
                              ...license,
                              allocatedCount: 0,
                              subscriptionTier: 'GEMINI_ENTERPRISE',
                              displayName: license.name.split('/').pop()
                          });
                     }
                }
                
                setProjectLicenses(hydratedLicenses);
                
                // Auto-select if there's only one
                if (hydratedLicenses.length === 1 && !selectedProjectLicense) {
                     handleProjectLicenseSelection(hydratedLicenses[0].name);
                }
            } catch (err: any) {
                console.error("Failed to fetch project licenses:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProjectLicenses();
    }, [projectNumber]);

    const quotas = useMemo(() => {
        const multipliers = {
            Standard: {
                tasksAndActions: 160,
                textAnswerGen: 160,
                imageGen: 5,
                videoGen: 2,
                grounding: 160,
                webGrounding: 160,
                ideaGeneration: 1,
                deepResearch: 3
            },
            Plus: {
                tasksAndActions: 200,
                textAnswerGen: 200,
                imageGen: 10,
                videoGen: 3,
                grounding: 200,
                webGrounding: 200,
                ideaGeneration: 1,
                deepResearch: 10
            }
        };

        const m = multipliers[edition];
        const numLicenses = Number(licenses) || 0;
        return {
            tasksAndActions: numLicenses * m.tasksAndActions,
            textAnswerGen: numLicenses * m.textAnswerGen,
            imageGen: numLicenses * m.imageGen,
            videoGen: numLicenses * m.videoGen,
            grounding: numLicenses * m.grounding,
            webGrounding: numLicenses * m.webGrounding,
            ideaGeneration: numLicenses * m.ideaGeneration,
            deepResearch: numLicenses * m.deepResearch
        };
    }, [edition, licenses]);

    // Fetch Live Usage Metrics
    useEffect(() => {
        const fetchMetrics = async () => {
            if (!projectNumber) return;
            setIsFetchingMetrics(true);
            setMetricsError(null);
            try {
                const endTime = new Date().toISOString();
                const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                
                const metricMap = {
                    Standard: {
                        tasksAndActions: 'tasks_and_actions_tier_enterprise_regional',
                        textAnswerGen: 'text_answer_gen_tier_enterprise_standard_regional',
                        imageGen: 'image_gen_tier_enterprise_regional',
                        videoGen: 'video_gen_numbers_tier_enterprise_regional',
                        grounding: 'grounding_with_search_tier_enterprise_regional',
                        webGrounding: 'web_grounding_for_enterprise_tier_enterprise_regional',
                        ideaGeneration: 'idea_gen_start_instance_tier_enterprise_standard_regional',
                        deepResearch: 'deep_research_query_total_tier_enterprise_standard_regional'
                    },
                    Plus: {
                        tasksAndActions: 'tasks_and_actions_tier_enterprise_plus_regional',
                        textAnswerGen: 'text_answer_gen_tier_enterprise_plus_regional',
                        imageGen: 'image_gen_tier_enterprise_plus_regional',
                        videoGen: 'video_gen_numbers_tier_enterprise_plus_regional',
                        grounding: 'grounding_with_search_tier_enterprise_plus_regional',
                        webGrounding: 'web_grounding_for_enterprise_tier_enterprise_plus_regional',
                        ideaGeneration: 'idea_gen_start_instance_tier_enterprise_regional',
                        deepResearch: 'deep_research_query_total_tier_enterprise_regional'
                    }
                };

                const currentMap = edition === 'Plus' ? metricMap.Plus : metricMap.Standard;
                
                // Fetch all discovery engine usage metrics individually using Promise.allSettled
                // Note: The monitoring API strictly limits TimeSeries queries to a single metric.type per request.
                const metricEntries = Object.entries(currentMap);
                const promises = metricEntries.map(([key, suffix]) => {
                    const filter = `metric.type="discoveryengine.googleapis.com/quota/${suffix}/usage" AND resource.type="discoveryengine.googleapis.com/Location"`;
                    return api.getCloudMonitoringMetrics(projectNumber, filter, startTime, endTime).then(res => ({ key, res }));
                });
                
                const results = await Promise.allSettled(promises);
                
                const usages: any = {
                    tasksAndActions: 0,
                    textAnswerGen: 0,
                    imageGen: 0,
                    videoGen: 0,
                    grounding: 0,
                    webGrounding: 0,
                    ideaGeneration: 0,
                    deepResearch: 0
                };
                let hasAuthError = false;
                
                results.forEach(result => {
                    if (result.status === 'fulfilled') {
                        const { key, res } = result.value;
                        if (res.timeSeries && res.timeSeries.length > 0) {
                            res.timeSeries.forEach((series: any) => {
                                const points = series.points;
                                if (points && points.length > 0) {
                                    points.forEach((point: any) => {
                                        const valObj = point.value;
                                        const val = parseInt(valObj.int64Value || valObj.doubleValue || "0", 10);
                                        usages[key] += val;
                                    });
                                }
                            });
                        }
                    } else {
                        // If one fails with 403, flag it
                        const err = result.reason;
                        if (err?.message?.includes('403') || err?.status === 403) {
                            hasAuthError = true;
                        }
                    }
                });

                setUsageMetrics(usages);
                if (hasAuthError) {
                    setMetricsError("Missing 'monitoring.timeSeries.list' permission to view live usage.");
                }
            } catch (err: any) {
                console.error("Failed to fetch cloud monitoring metrics", err);
                setMetricsError("Failed to load live usage metrics from Cloud Monitoring.");
            } finally {
                setIsFetchingMetrics(false);
            }
        };
        fetchMetrics();
    }, [projectNumber, edition]);

    const QuotaCard = ({ title, value, usage, unit, tooltip }: any) => {
        const percentage = usage !== undefined && value > 0 ? Math.min(100, Math.round((usage / value) * 100)) : 0;
        return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex flex-col justify-between">
            <div className="flex items-start justify-between mb-2">
                <h3 className="text-gray-300 text-sm font-semibold pr-2">{title}</h3>
                {tooltip && <InfoTooltip text={tooltip} />}
            </div>
            <div className="flex items-baseline gap-1 mt-auto">
                <span className="text-3xl font-bold text-blue-400">{usage !== undefined ? usage : value}</span>
                {usage !== undefined && <span className="text-gray-500 text-sm font-medium">/ {value}</span>}
                {unit && <span className="text-gray-400 text-sm ml-1">{unit}</span>}
            </div>
            {usage !== undefined && (
                <div className="mt-3 w-full bg-gray-700 rounded-full h-1.5 border border-gray-600">
                    <div 
                        className={`h-1.5 rounded-full ${percentage > 90 ? 'bg-red-500' : percentage > 75 ? 'bg-yellow-500' : 'bg-blue-500'}`} 
                        style={{ width: `${percentage}%` }}
                    ></div>
                </div>
            )}
        </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
                <h2 className="text-lg font-semibold text-white mb-4">Quota Configuration</h2>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <p className="text-gray-400 text-sm max-w-2xl">
                        Calculate your pooled Gemini Enterprise quota based on your subscription tier and user licenses.
                        Actual usage can be monitored via Google Cloud Metrics Explorer.
                    </p>
                    <button 
                        onClick={() => setShowInstructions(!showInstructions)}
                        className="text-sm bg-gray-700 hover:bg-gray-600 text-white py-1.5 px-3 rounded border border-gray-600 transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        How to Check Usage in Console
                    </button>
                </div>

                {showInstructions && (
                    <div className="mb-6 bg-gray-900 border border-gray-700 p-4 rounded-lg text-sm text-gray-300">
                        <ol className="list-decimal list-inside space-y-2">
                            <li>In the Google Cloud console, go to the <a href="https://console.cloud.google.com/gemini-enterprise/user-license" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Gemini Enterprise &gt; Manage users</a> page.</li>
                            <li>Select the <strong>Multi-region</strong> of the licenses.</li>
                            <li>Click <strong>View quota usage</strong>.</li>
                            <li>In the Gemini Enterprise Quota Usage pane that opens, select your product edition from the Subscription tier list.</li>
                        </ol>
                        <p className="mt-3 text-gray-400">The dashboard populates the quotas and shows the absolute and the percentage usage of each quota.</p>
                    </div>
                )}
                {error && (
                    <div className="mb-4 bg-red-900/30 border border-red-800 p-3 rounded text-red-300 text-sm">
                        {error}
                    </div>
                )}
                {metricsError && (
                    <div className="mb-4 bg-yellow-900/30 border border-yellow-800 p-3 rounded text-yellow-300 text-sm">
                        {metricsError}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Auto-Populate Controls */}
                    
                    {/* Project-Local Licenses Dropdown */}
                    {projectLicenses.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-green-400 mb-2">Project-Local Licenses (Auto-fill)</label>
                            <select 
                                value={selectedProjectLicense} 
                                onChange={(e) => handleProjectLicenseSelection(e.target.value)}
                                className="w-full bg-green-900/20 border border-green-800 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 h-[42px] mb-4"
                                disabled={isLoading}
                            >
                                <option value="">Select Local License</option>
                                {projectLicenses.map((license) => (
                                    <option key={license.name} value={license.name}>
                                        {license.displayName} ({license.allocatedCount} total)
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    
                    {billingAccounts.length > 0 && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-blue-400 mb-2">Auto-fill from Cloud Billing</label>
                                <select 
                                    value={selectedBillingAccountId} 
                                    onChange={(e) => {
                                        setSelectedBillingAccountId(e.target.value);
                                        setSelectedConfigName(''); // Reset profile
                                    }}
                                    className="w-full bg-blue-900/20 border border-blue-800 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[42px] mb-4"
                                    disabled={isLoading}
                                >
                                    <option value="">Select Billing Account</option>
                                    {billingAccounts.map((account) => {
                                        const id = account.name.split('/').pop();
                                        return <option key={id} value={id}>{account.displayName} ({id})</option>;
                                    })}
                                </select>
                            </div>
                            
                            {selectedBillingAccountId && (
                                <div>
                                    <label className="block text-sm font-medium text-blue-400 mb-2">Subscription Profile</label>
                                    <select 
                                        value={selectedConfigName} 
                                        onChange={(e) => handleConfigSelection(e.target.value, '')}
                                        className="w-full bg-blue-900/20 border border-blue-800 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[42px] mb-4"
                                        disabled={isLoading || licenseConfigs.length === 0}
                                    >
                                        <option value="">Select Profile (Optional)</option>
                                        {licenseConfigs.map((config) => (
                                            <option key={config.name} value={config.name}>
                                                {config.name.split('/').pop()} ({config.subscriptionTier === 'GEMINI_ENTERPRISE_PLUS' ? 'Plus' : 'Standard'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            
                            {selectedConfigName && (
                                <div>
                                    <label className="block text-sm font-medium text-blue-400 mb-2">Project Region (Auto-fill)</label>
                                    <select 
                                        value={selectedLocation} 
                                        onChange={(e) => handleConfigSelection(selectedConfigName, e.target.value)}
                                        className="w-full bg-blue-900/20 border border-blue-800 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[42px] mb-4"
                                    >
                                        <option value="">All Regions (Total Pooled)</option>
                                        <option value="global">Global</option>
                                        <option value="us">US</option>
                                        <option value="eu">EU</option>
                                    </select>
                                </div>
                            )}
                        </>
                    )}

                    <div className="md:col-span-1 border-t border-gray-700 md:border-t-0 md:border-l pt-6 md:pt-0 pl-0 md:pl-6">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Gemini Enterprise Edition</label>
                        <select 
                            value={edition} 
                            onChange={(e) => setEdition(e.target.value as 'Standard' | 'Plus')}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[42px] mb-4"
                        >
                            <option value="Standard">Standard</option>
                            <option value="Plus">Plus</option>
                        </select>
                    </div>
                    <div className="md:col-span-1 pt-0 md:pt-0 pr-0 md:pr-0 pl-0 md:pl-0">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Number of User Licenses</label>
                        <input 
                            type="number" 
                            min="1"
                            value={licenses} 
                            onChange={(e) => {
                                const val = e.target.value;
                                setLicenses(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
                            }}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[42px]"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 p-6 rounded-lg shadow-inner">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold text-white">Gemini Enterprise Quota Usage</h2>
                    <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">Project Level</span>
                </div>

                {/* Data & Actions Section */}
                <div className="mb-6 pb-6 border-b border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Data & actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <QuotaCard 
                            title="Tasks and actions" 
                            value={quotas.tasksAndActions} 
                            usage={usageMetrics.tasksAndActions}
                            unit="tasks / day" 
                        />
                    </div>
                </div>

                {/* Unified Search & Assistant Section */}
                <div className="mb-6 pb-6 border-b border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Unified search & assistant</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <QuotaCard 
                            title="Text answer generation" 
                            value={quotas.textAnswerGen} 
                            usage={usageMetrics.textAnswerGen}
                            unit="generations / day" 
                        />
                        <QuotaCard 
                            title="Image generation" 
                            value={quotas.imageGen} 
                            usage={usageMetrics.imageGen}
                            unit="images / day" 
                        />
                        <QuotaCard 
                            title="Video generation" 
                            value={quotas.videoGen} 
                            usage={usageMetrics.videoGen}
                            unit="videos / day" 
                        />
                        <QuotaCard 
                            title="Grounding with Google search" 
                            value={quotas.grounding} 
                            usage={usageMetrics.grounding}
                            unit="queries / day" 
                        />
                        <QuotaCard 
                            title="Web grounding for enterprise" 
                            value={quotas.webGrounding} 
                            usage={usageMetrics.webGrounding}
                            unit="queries / day" 
                        />
                    </div>
                </div>

                {/* Agents Section */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Agents</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <QuotaCard 
                            title="Idea generation" 
                            value={quotas.ideaGeneration} 
                            usage={usageMetrics.ideaGeneration}
                            unit="ideas / day" 
                        />
                        <QuotaCard 
                            title="Deep research" 
                            value={quotas.deepResearch} 
                            usage={usageMetrics.deepResearch}
                            unit="queries / day" 
                        />
                    </div>
                </div>
            </div>
            
             <div className="bg-blue-900/30 border border-blue-800 p-4 rounded-lg flex items-start gap-3">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
                 <div className="text-sm text-blue-200">
                    <p className="font-semibold mb-1">How Quota Pooling Works</p>
                    <p>All users in your plan share a single combined limit. For example, if your pooled quota is 1,600 Assistant queries per day, one power user could use 500 queries, leaving 1,100 queries for the remaining users. Individual usage is not capped at the per-user limit.</p>
                 </div>
             </div>
        </div>
    );
};

export default CostsUI;
