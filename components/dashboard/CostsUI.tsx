import React, { useState, useMemo, useEffect, useCallback } from 'react';
import InfoTooltip from '../InfoTooltip';
import * as api from '../../services/apiService';
import { Config, BillingAccount, BillingAccountLicenseConfig, LicenseConfig, TimeSeries } from '../../types';
import { toErrorMessage } from '../../utils/errors';

interface Props {
    projectNumber?: string;
}

interface HydratedProjectLicense extends Partial<LicenseConfig> {
    name: string;
    allocatedCount?: number;
    subscriptionTier?: string;
    displayName?: string;
}

export type GeminiEnterpriseEdition =
    | 'Standard'
    | 'Plus'
    | 'Standard Emerging Market'
    | 'EDU'
    | 'EDU Pro'
    | 'Frontline Worker'
    | 'Frontline Starter';

export interface EditionQuotaSpec {
    label: string;
    tasksAndActions: number;
    textAnswerGen: number;
    imageGen: number;
    videoGen: number;
    grounding: number;
    webGrounding: number;
    agentCreation: number;
    ideaGeneration: number;
    deepResearch: number;
    storageGiB: number;
    devToolsCreditsMonthlyUsd: number;
    supportsSingleUserLimit: boolean;
    monitoringTier: 'Standard' | 'Plus';
}

export const DEFAULT_SINGLE_USER_MULTIPLIER = 10;

export const EDITION_QUOTA_SPECS: Record<GeminiEnterpriseEdition, EditionQuotaSpec> = {
    Standard: {
        label: 'Standard',
        tasksAndActions: 160,
        textAnswerGen: 160,
        imageGen: 5,
        videoGen: 2,
        grounding: 160,
        webGrounding: 160,
        agentCreation: 1,
        ideaGeneration: 1,
        deepResearch: 3,
        storageGiB: 30,
        devToolsCreditsMonthlyUsd: 10,
        supportsSingleUserLimit: true,
        monitoringTier: 'Standard',
    },
    Plus: {
        label: 'Plus',
        tasksAndActions: 200,
        textAnswerGen: 200,
        imageGen: 10,
        videoGen: 3,
        grounding: 200,
        webGrounding: 200,
        agentCreation: 10,
        ideaGeneration: 1,
        deepResearch: 10,
        storageGiB: 75,
        devToolsCreditsMonthlyUsd: 15,
        supportsSingleUserLimit: true,
        monitoringTier: 'Plus',
    },
    'Standard Emerging Market': {
        label: 'Standard Emerging Market',
        tasksAndActions: 40,
        textAnswerGen: 40,
        imageGen: 0,
        videoGen: 0,
        grounding: 40,
        webGrounding: 40,
        agentCreation: 1,
        ideaGeneration: 1,
        deepResearch: 1,
        storageGiB: 10,
        devToolsCreditsMonthlyUsd: 0,
        supportsSingleUserLimit: true,
        monitoringTier: 'Standard',
    },
    EDU: {
        label: 'EDU',
        tasksAndActions: 40,
        textAnswerGen: 40,
        imageGen: 2,
        videoGen: 1,
        grounding: 40,
        webGrounding: 40,
        agentCreation: 1,
        ideaGeneration: 1,
        deepResearch: 1,
        storageGiB: 5,
        devToolsCreditsMonthlyUsd: 0,
        supportsSingleUserLimit: false,
        monitoringTier: 'Standard',
    },
    'EDU Pro': {
        label: 'EDU Pro',
        tasksAndActions: 200,
        textAnswerGen: 200,
        imageGen: 10,
        videoGen: 3,
        grounding: 200,
        webGrounding: 200,
        agentCreation: 10,
        ideaGeneration: 1,
        deepResearch: 10,
        storageGiB: 50,
        devToolsCreditsMonthlyUsd: 0,
        supportsSingleUserLimit: false,
        monitoringTier: 'Plus',
    },
    'Frontline Worker': {
        label: 'Frontline Worker',
        tasksAndActions: 40,
        textAnswerGen: 40,
        imageGen: 2,
        videoGen: 1,
        grounding: 40,
        webGrounding: 40,
        agentCreation: 0,
        ideaGeneration: 0,
        deepResearch: 1,
        storageGiB: 2,
        devToolsCreditsMonthlyUsd: 0,
        supportsSingleUserLimit: false,
        monitoringTier: 'Standard',
    },
    'Frontline Starter': {
        label: 'Frontline Starter',
        tasksAndActions: 20,
        textAnswerGen: 20,
        imageGen: 0,
        videoGen: 0,
        grounding: 20,
        webGrounding: 20,
        agentCreation: 0,
        ideaGeneration: 0,
        deepResearch: 0,
        storageGiB: 2,
        devToolsCreditsMonthlyUsd: 0,
        supportsSingleUserLimit: false,
        monitoringTier: 'Standard',
    },
};

export const resolveEditionFromTier = (tier?: string, configName?: string): GeminiEnterpriseEdition => {
    const normalized = (tier || '').toUpperCase().trim();
    if (normalized === 'GEMINI_ENTERPRISE_PLUS' || normalized.includes('AGENTS_ENTERPRISE_PLUS')) {
        return 'Plus';
    }
    if (normalized.includes('EDU_PRO')) {
        return 'EDU Pro';
    }
    if (normalized.includes('EDU')) {
        return 'EDU';
    }
    if (normalized.includes('EMERGING')) {
        return 'Standard Emerging Market';
    }
    if (normalized.includes('FRONTLINE_STARTER')) {
        return 'Frontline Starter';
    }
    if (normalized.includes('FRONTLINE')) {
        return 'Frontline Worker';
    }
    if (configName && configName.endsWith('internal_only_agent_space')) {
        return 'Standard';
    }
    return 'Standard';
};

export const validateSingleUserMultiplier = (
    rawInput: unknown
): { valid: boolean; value: number; error?: string } => {
    const trimmed = typeof rawInput === 'string' ? rawInput.trim() : rawInput;
    if (trimmed === '' || trimmed === null || trimmed === undefined) {
        return {
            valid: false,
            value: DEFAULT_SINGLE_USER_MULTIPLIER,
            error: 'Multiplier is required and must be a whole number of 1 or greater (defaults to 10).',
        };
    }

    const parsed = typeof trimmed === 'number' ? trimmed : Number(trimmed);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
        return {
            valid: false,
            value: DEFAULT_SINGLE_USER_MULTIPLIER,
            error: 'Multiplier must be a valid whole number of 1 or greater.',
        };
    }

    if (!Number.isInteger(parsed)) {
        return {
            valid: false,
            value: Math.max(1, Math.floor(parsed)),
            error: 'Multiplier must be a whole number (decimals are not supported).',
        };
    }

    if (parsed < 1) {
        return {
            valid: false,
            value: 1,
            error: 'Multiplier must be 1 or greater.',
        };
    }

    return { valid: true, value: parsed };
};

export interface CalculatedEditionQuotas {
    tasksAndActions: number;
    textAnswerGen: number;
    imageGen: number;
    videoGen: number;
    grounding: number;
    webGrounding: number;
    agentCreation: number;
    ideaGeneration: number;
    deepResearch: number;
    storageGiB: number;
    devToolsCreditsMonthlyUsd: number;
    devToolsCreditsWeeklyUsd: number;
    singleUserLimitActive: boolean;
    effectiveMultiplier: number;
    usersToExhaustPool: number;
    singleUserCaps: {
        tasksAndActions: number;
        textAnswerGen: number;
        imageGen: number;
        videoGen: number;
        grounding: number;
        webGrounding: number;
        agentCreation: number;
        ideaGeneration: number;
        deepResearch: number;
    } | null;
}

export const calculateEditionQuotas = (
    edition: GeminiEnterpriseEdition,
    licenses: number | '',
    singleUserLimitEnabled: boolean = false,
    singleUserMultiplierInput: unknown = DEFAULT_SINGLE_USER_MULTIPLIER
): CalculatedEditionQuotas => {
    const spec = EDITION_QUOTA_SPECS[edition] || EDITION_QUOTA_SPECS.Standard;
    const numLicenses = Math.max(0, Number(licenses) || 0);
    const { value: effectiveMultiplier } = validateSingleUserMultiplier(singleUserMultiplierInput);
    const singleUserLimitActive = Boolean(singleUserLimitEnabled && spec.supportsSingleUserLimit);

    const pooled = {
        tasksAndActions: numLicenses * spec.tasksAndActions,
        textAnswerGen: numLicenses * spec.textAnswerGen,
        imageGen: numLicenses * spec.imageGen,
        videoGen: numLicenses * spec.videoGen,
        grounding: numLicenses * spec.grounding,
        webGrounding: numLicenses * spec.webGrounding,
        agentCreation: numLicenses * spec.agentCreation,
        ideaGeneration: numLicenses * spec.ideaGeneration,
        deepResearch: numLicenses * spec.deepResearch,
        storageGiB: numLicenses * spec.storageGiB,
        devToolsCreditsMonthlyUsd: numLicenses * spec.devToolsCreditsMonthlyUsd,
        devToolsCreditsWeeklyUsd: (numLicenses * spec.devToolsCreditsMonthlyUsd) / 4,
    };

    const computeCap = (perSeat: number, pooledTotal: number): number => {
        if (perSeat <= 0) return 0;
        const rawCap = perSeat * effectiveMultiplier;
        return numLicenses > 0 ? Math.min(rawCap, pooledTotal) : rawCap;
    };

    const singleUserCaps = singleUserLimitActive
        ? {
              tasksAndActions: computeCap(spec.tasksAndActions, pooled.tasksAndActions),
              textAnswerGen: computeCap(spec.textAnswerGen, pooled.textAnswerGen),
              imageGen: computeCap(spec.imageGen, pooled.imageGen),
              videoGen: computeCap(spec.videoGen, pooled.videoGen),
              grounding: computeCap(spec.grounding, pooled.grounding),
              webGrounding: computeCap(spec.webGrounding, pooled.webGrounding),
              agentCreation: computeCap(spec.agentCreation, pooled.agentCreation),
              ideaGeneration: computeCap(spec.ideaGeneration, pooled.ideaGeneration),
              deepResearch: computeCap(spec.deepResearch, pooled.deepResearch),
          }
        : null;

    const usersToExhaustPool =
        singleUserLimitActive && numLicenses > 0
            ? Math.max(1, Math.ceil(numLicenses / effectiveMultiplier))
            : 0;

    return {
        ...pooled,
        singleUserLimitActive,
        effectiveMultiplier,
        usersToExhaustPool,
        singleUserCaps,
    };
};

interface QuotaCardProps {
    title: string;
    value: number;
    usage?: number;
    unit: string;
    tooltip?: string;
    singleUserCap?: number;
    multiplier?: number;
}

const CostsUI: React.FC<Props> = ({ projectNumber }) => {
    const [edition, setEdition] = useState<GeminiEnterpriseEdition>('Standard');
    const [licenses, setLicenses] = useState<number | ''>('');
    const [showInstructions, setShowInstructions] = useState(false);

    // Single-User Quota Limit (GA — Oct 22, 2026) state
    const [singleUserLimitEnabled, setSingleUserLimitEnabled] = useState<boolean>(false);
    const [singleUserMultiplierRaw, setSingleUserMultiplierRaw] = useState<string>(
        String(DEFAULT_SINGLE_USER_MULTIPLIER)
    );

    // API State
    const [billingAccounts, setBillingAccounts] = useState<BillingAccount[]>([]);
    const [selectedBillingAccountId, setSelectedBillingAccountId] = useState<string>('');
    const [licenseConfigs, setLicenseConfigs] = useState<BillingAccountLicenseConfig[]>([]);
    const [selectedConfigName, setSelectedConfigName] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<string>('');
    const [projectLicenses, setProjectLicenses] = useState<HydratedProjectLicense[]>([]);
    const [selectedProjectLicense, setSelectedProjectLicense] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [licenseDiscoveryWarning, setLicenseDiscoveryWarning] = useState<string | null>(null);

    // Monitoring State
    const [usageMetrics, setUsageMetrics] = useState<Record<string, number | undefined> | null>(null);
    const [, setIsFetchingMetrics] = useState(false);
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
                const res = (await api.listBillingAccounts(config)) || {};
                const accounts = res.billingAccounts || [];
                setBillingAccounts(accounts);
                
                if (accounts.length === 1) {
                     setSelectedBillingAccountId(prev => prev || accounts[0].name.split('/').pop() || '');
                }
            } catch (err: unknown) {
                console.error("Failed to fetch billing accounts:", err);
                setError(toErrorMessage(err) || "Failed to load billing accounts.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchAccounts();
    }, [projectNumber]);

    const applyConfigSelection = useCallback((configName: string, locName: string, availableConfigs: BillingAccountLicenseConfig[]) => {
        setSelectedConfigName(configName);
        setSelectedLocation(locName);
        if (!configName) return;

        const selectedConfig = availableConfigs.find(c => c.name === configName);
        if (selectedConfig) {
            setEdition(resolveEditionFromTier(selectedConfig.subscriptionTier, configName));

            // Calculate total licenses across all distributed projects
            let totalLicenses = 0;
            if (selectedConfig.licenseConfigDistributions) {
                if (locName) {
                    // Filter specifically for the selected location in the current project (matching either projectId/projectNumber or location suffix)
                    const targetKey = `projects/${projectNumber}/locations/${locName}`;
                    const locSuffix = `/locations/${locName}`;
                    const entries = Object.entries(selectedConfig.licenseConfigDistributions);
                    const exactMatches = entries.filter(([key]) => key.includes(targetKey));
                    const matchedEntries = exactMatches.length > 0
                        ? exactMatches
                        : entries.filter(([key]) => key.endsWith(locSuffix) || key.includes(`${locSuffix}/`));
                    matchedEntries.forEach(([, val]: [string, string | number]) => {
                        totalLicenses += Number(val) || 0;
                    });
                } else {
                    Object.values(selectedConfig.licenseConfigDistributions).forEach((val: string | number) => {
                        totalLicenses += Number(val) || 0;
                    });
                }
            }
            setLicenses(totalLicenses > 0 ? totalLicenses : '');
        }
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
                const config: Config = { projectId: projectNumber, appLocation: 'global', collectionId: '', appId: '', assistantId: '' };
                const res = (await api.listBillingAccountLicenseConfigs(selectedBillingAccountId, config)) || {};
                const configs = res.billingAccountLicenseConfigs || [];
                setLicenseConfigs(configs);

                if (configs.length === 1 && !selectedConfigName) {
                    applyConfigSelection(configs[0].name, '', configs);
                } else if (configs.length > 0 && selectedConfigName) {
                     // Update current selection if it still exists
                     const stillExists = configs.find(c => c.name === selectedConfigName);
                     if (stillExists) applyConfigSelection(selectedConfigName, '', configs);
                }
            } catch (err: unknown) {
                console.error("Failed to fetch license configs:", err);
                setError(toErrorMessage(err) || "Failed to load subscription profiles.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchConfigs();
    }, [projectNumber, selectedBillingAccountId, applyConfigSelection, selectedConfigName]);

    const handleConfigSelection = (configName: string, locName: string = '', availableConfigs: BillingAccountLicenseConfig[] = licenseConfigs) => {
        applyConfigSelection(configName, locName, availableConfigs);
    };

    const handleProjectLicenseSelection = (licenseName: string) => {
        setSelectedProjectLicense(licenseName);
        if (!licenseName) return;

        const selectedLicense = projectLicenses.find(l => l.name === licenseName);
        if (selectedLicense) {
            setEdition(resolveEditionFromTier(selectedLicense.subscriptionTier, selectedLicense.name));
            setLicenses(
                selectedLicense.allocatedCount !== undefined && selectedLicense.allocatedCount > 0
                    ? selectedLicense.allocatedCount
                    : ''
            );
        }
    };

    // Fetch Project Local Licenses
    useEffect(() => {
        const fetchProjectLicenses = async () => {
            if (!projectNumber) return;
            setIsLoading(true);
            setLicenseDiscoveryWarning(null);
            try {
                const locations = ['global', 'us', 'eu'];
                const discoveredLicenses: { name: string }[] = [];
                const regionalFailures: string[] = [];
                
                // 1. Query usage stats across all regions
                for (const loc of locations) {
                    try {
                        const config: Config = { projectId: projectNumber, appLocation: loc, collectionId: '', appId: '', assistantId: '' };
                        const res = (await api.listLicenseConfigsUsageStats(config)) || {};
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
                    } catch (regionErr: unknown) {
                        regionalFailures.push(`${loc}: ${toErrorMessage(regionErr, 'request failed')}`);
                    }
                }

                if (regionalFailures.length === locations.length) {
                    setLicenseDiscoveryWarning(
                        `Could not auto-discover project-local licenses across regions (${regionalFailures[0]}). Enter seat count manually or select a Cloud Billing account.`
                    );
                }
                
                // 2. Hydrate subscription tiers and total counts by calling getLicenseConfig
                const hydratedLicenses: HydratedProjectLicense[] = [];
                for (const license of discoveredLicenses) {
                     try {
                          const locMatch = license.name.match(/\/locations\/([^/]+)\//);
                          const licenseLoc = locMatch ? locMatch[1] : 'global';
                          const config: Config = { projectId: projectNumber, appLocation: licenseLoc, collectionId: '', appId: '', assistantId: '' };
                          const res = (await api.getLicenseConfig(license.name, config)) || ({} as LicenseConfig);
                          hydratedLicenses.push({
                              ...license,
                              allocatedCount: Number(res.licenseCount) || 0, // Using Total instead of Assigned
                              subscriptionTier: res.subscriptionTier || 'GEMINI_ENTERPRISE',
                              displayName: license.name.split('/').pop()
                          });
                     } catch (hydrateErr: unknown) {
                          console.warn(`Failed to hydrate license config ${license.name}:`, hydrateErr);
                          hydratedLicenses.push({
                              ...license,
                              allocatedCount: undefined,
                              subscriptionTier: undefined,
                              displayName: `${license.name.split('/').pop()} (details unavailable)`
                          });
                     }
                }
                
                setProjectLicenses(hydratedLicenses);
                
                // Auto-select if there's only one
                if (hydratedLicenses.length === 1) {
                    const first = hydratedLicenses[0];
                    setSelectedProjectLicense(prev => {
                        if (!prev) {
                            setEdition(resolveEditionFromTier(first.subscriptionTier, first.name));
                            if (first.allocatedCount && first.allocatedCount > 0) {
                                setLicenses(first.allocatedCount);
                            }
                            return first.name;
                        }
                        return prev;
                    });
                }
            } catch (err: unknown) {
                console.error("Failed to fetch project licenses:", err);
                setLicenseDiscoveryWarning(
                    `Failed to auto-discover project-local licenses: ${toErrorMessage(err)}`
                );
            } finally {
                setIsLoading(false);
            }
        };
        fetchProjectLicenses();
    }, [projectNumber]);

    const multiplierValidation = useMemo(
        () => validateSingleUserMultiplier(singleUserMultiplierRaw),
        [singleUserMultiplierRaw]
    );

    const currentEditionSpec = EDITION_QUOTA_SPECS[edition] || EDITION_QUOTA_SPECS.Standard;

    const quotas = useMemo(
        () =>
            calculateEditionQuotas(
                edition,
                licenses,
                singleUserLimitEnabled,
                singleUserMultiplierRaw
            ),
        [edition, licenses, singleUserLimitEnabled, singleUserMultiplierRaw]
    );

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

                const monitoringTier = EDITION_QUOTA_SPECS[edition]?.monitoringTier || 'Standard';
                const currentMap = monitoringTier === 'Plus' ? metricMap.Plus : metricMap.Standard;
                
                // Fetch all discovery engine usage metrics individually using Promise.allSettled
                // Note: The monitoring API strictly limits TimeSeries queries to a single metric.type per request.
                const metricEntries = Object.entries(currentMap);
                const locationFilter = selectedLocation ? ` AND resource.labels.location="${selectedLocation}"` : '';
                const promises = metricEntries.map(([key, suffix]) => {
                    const filter = `metric.type="discoveryengine.googleapis.com/quota/${suffix}/usage" AND resource.type="discoveryengine.googleapis.com/Location"${locationFilter}`;
                    return api.getCloudMonitoringMetrics(projectNumber, filter, startTime, endTime).then(res => ({ key, res: res || {} }));
                });
                
                const results = await Promise.allSettled(promises);
                
                const usages: Record<string, number | undefined> = {};
                const failedResults = results.filter(r => r.status === 'rejected');
                let hasAuthError = false;
                
                results.forEach(result => {
                    if (result.status === 'fulfilled') {
                        const { key, res } = result.value;
                        let total = 0;
                        if (res.timeSeries && res.timeSeries.length > 0) {
                            res.timeSeries.forEach((series: TimeSeries) => {
                                const points = series.points;
                                if (points && points.length > 0) {
                                    // With ALIGN_SUM 86400s, point[0] holds the aggregated 24h total for this series
                                    const point = points[0];
                                    const valObj = point.value;
                                    const val = parseInt(String(valObj?.int64Value ?? valObj?.doubleValue ?? "0"), 10);
                                    total += val;
                                }
                            });
                        }
                        usages[key] = total;
                    } else {
                        // Keep key undefined so QuotaCard displays "Unavailable" rather than 0
                        const err = result.reason as { status?: number; code?: number; message?: string } | undefined;
                        const errMsg = (err?.message || (typeof err === 'string' ? err : '')).toLowerCase();
                        if (
                            err?.status === 403 ||
                            err?.code === 403 ||
                            errMsg.includes('403') ||
                            errMsg.includes('permission') ||
                            errMsg.includes('denied') ||
                            errMsg.includes('the caller does not have permission')
                        ) {
                            hasAuthError = true;
                        }
                    }
                });

                if (hasAuthError && Object.keys(usages).length === 0) {
                    setUsageMetrics(null);
                    setMetricsError("Missing 'monitoring.timeSeries.list' permission to view live usage.");
                } else if (failedResults.length === results.length) {
                    setUsageMetrics(null);
                    setMetricsError("Failed to fetch live usage metrics from Cloud Monitoring.");
                } else {
                    setUsageMetrics(usages);
                    if (failedResults.length > 0) {
                        setMetricsError(`${failedResults.length} metric(s) could not be fetched and are marked as Unavailable.`);
                    } else {
                        setMetricsError(null);
                    }
                }
            } catch (err: unknown) {
                console.error("Failed to fetch cloud monitoring metrics", err);
                setUsageMetrics(null);
                setMetricsError("Failed to load live usage metrics from Cloud Monitoring.");
            } finally {
                setIsFetchingMetrics(false);
            }
        };
        fetchMetrics();
    }, [projectNumber, edition, selectedLocation]);

    const QuotaCard: React.FC<QuotaCardProps> = ({ title, value, usage, unit, tooltip, singleUserCap, multiplier }) => {
        const isUnavailable = usage === undefined || usage === null;
        const noLicenses = licenses === '';
        const percentage = !isUnavailable && value > 0 ? Math.min(100, Math.round((usage / value) * 100)) : 0;
        const showSingleUserCap = singleUserCap !== undefined && singleUserCap > 0 && multiplier !== undefined;
        return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex flex-col justify-between min-w-0">
            <div className="flex items-start justify-between mb-2">
                <h3 className="text-gray-300 text-sm font-semibold pr-2">{title}</h3>
                {tooltip && <InfoTooltip text={tooltip} />}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-auto">
                {isUnavailable ? (
                    <span className="text-lg font-medium text-amber-400">Unavailable</span>
                ) : (
                    <span className="text-2xl xl:text-3xl font-bold text-blue-400">{usage.toLocaleString()}</span>
                )}
                <span className="text-gray-500 text-sm font-medium whitespace-nowrap">/ {noLicenses ? '-' : value.toLocaleString()}</span>
                {unit && <span className="text-gray-400 text-xs xl:text-sm whitespace-nowrap">{unit}</span>}
            </div>
            {showSingleUserCap && (
                <div
                    data-testid="single-user-cap-badge"
                    className="mt-2.5 flex items-center justify-between gap-2 bg-indigo-950/60 border border-indigo-700/60 rounded px-2.5 py-1 text-xs text-indigo-200"
                >
                    <span>Max per user ({multiplier}x):</span>
                    <span className="font-semibold text-indigo-300">
                        {singleUserCap.toLocaleString()} {unit}
                    </span>
                </div>
            )}
            {!isUnavailable && !noLicenses && (
                <div className="mt-3 w-full bg-gray-700 rounded-full h-1.5 border border-gray-600">
                    <div 
                        className={`h-1.5 rounded-full ${percentage > 90 ? 'bg-red-500' : percentage > 75 ? 'bg-yellow-500' : 'bg-blue-500'}`} 
                        style={{ width: `${percentage}%` }}
                    ></div>
                </div>
            )}
            {isUnavailable && (
                <p className="mt-2 text-[11px] text-gray-500">Requires monitoring.timeSeries.list &amp; serviceconsumermanagement.quota.get</p>
            )}
        </div>
        );
    };

    const noLicenses = licenses === '';
    const numLicenses = Number(licenses) || 0;

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 p-5 xl:p-6 rounded-lg shadow-md border border-gray-700">
                <h2 className="text-lg font-semibold text-white mb-4">Quota Configuration</h2>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <p className="text-gray-400 text-sm max-w-2xl">
                        Calculate your pooled Gemini Enterprise quota and single-user quota limits based on your subscription tier and user licenses.
                        Actual usage can be monitored via the Usage &amp; Spending console or Google Cloud Metrics Explorer.
                    </p>
                    <button 
                        onClick={() => setShowInstructions(!showInstructions)}
                        className="text-sm bg-gray-700 hover:bg-gray-600 text-white py-1.5 px-3 rounded border border-gray-600 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        How to Check Usage &amp; Configure Limits
                    </button>
                </div>

                {showInstructions && (
                    <div className="mb-6 bg-gray-900 border border-gray-700 p-4 rounded-lg text-sm text-gray-300 space-y-3">
                        <div>
                            <p className="font-semibold text-white mb-1.5">View Usage &amp; Configure Single-User Quota Limits (GA):</p>
                            <ol className="list-decimal list-inside space-y-1.5">
                                <li>In the Google Cloud console, go to the <a href="https://console.cloud.google.com/gemini-enterprise/usage-and-spending" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Gemini Enterprise &gt; Usage &amp; Spending</a> page (or <a href="https://console.cloud.google.com/gemini-enterprise/user-license" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Manage users</a>).</li>
                                <li>Select the <strong>Usage</strong> tab and choose the <strong>location</strong> and <strong>Subscription tier</strong>.</li>
                                <li>To cap individual user consumption from the shared pool (Standard, Plus, and Standard Emerging Market), go to <strong>Feature usage &gt; Limit any single-user&apos;s quota</strong>, toggle <strong>Status</strong> to <strong>Enabled</strong>, and set a whole-number <strong>Multiplier</strong> (&ge; 1, defaults to 10).</li>
                                <li>Click <strong>Save changes</strong>.</li>
                            </ol>
                        </div>
                        <p className="text-xs text-gray-400 border-t border-gray-800 pt-2">
                            <strong>Required IAM Permissions:</strong> <code className="text-gray-300">monitoring.timeSeries.list</code> (without this, usage displays as <code className="text-gray-300">0</code>) and <code className="text-gray-300">serviceconsumermanagement.quota.get</code> (without this, quota limits display as <code className="text-gray-300">Unknown</code>).
                        </p>
                    </div>
                )}
                {error && (
                    <div className="mb-4 bg-red-900/30 border border-red-800 p-3 rounded text-red-300 text-sm">
                        {error}
                    </div>
                )}
                {licenseDiscoveryWarning && (
                    <div
                        data-testid="license-discovery-warning"
                        role="alert"
                        className="mb-4 bg-amber-900/30 border border-amber-800 p-3 rounded text-amber-200 text-sm"
                    >
                        {licenseDiscoveryWarning}
                    </div>
                )}
                {metricsError && (
                    <div className="mb-4 bg-yellow-900/30 border border-yellow-800 p-3 rounded text-yellow-300 text-sm">
                        {metricsError}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Auto-Populate Controls */}
                    
                    {/* Project-Local Licenses Dropdown */}
                    {projectLicenses.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-green-400 mb-1.5">Project-Local Licenses (Auto-fill)</label>
                            <select 
                                value={selectedProjectLicense} 
                                onChange={(e) => handleProjectLicenseSelection(e.target.value)}
                                className="w-full bg-green-900/20 border border-green-800 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 h-[38px]"
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
                                <label className="block text-sm font-medium text-blue-400 mb-1.5">Auto-fill from Cloud Billing</label>
                                <select 
                                    value={selectedBillingAccountId} 
                                    onChange={(e) => {
                                        setSelectedBillingAccountId(e.target.value);
                                        setSelectedConfigName(''); // Reset profile
                                    }}
                                    className="w-full bg-blue-900/20 border border-blue-800 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
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
                                    <label className="block text-sm font-medium text-blue-400 mb-1.5">Subscription Profile</label>
                                    <select 
                                        value={selectedConfigName} 
                                        onChange={(e) => handleConfigSelection(e.target.value, '')}
                                        className="w-full bg-blue-900/20 border border-blue-800 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                                        disabled={isLoading || licenseConfigs.length === 0}
                                    >
                                        <option value="">Select Profile (Optional)</option>
                                        {licenseConfigs.map((config) => (
                                            <option key={config.name} value={config.name}>
                                                {config.name.split('/').pop()} ({resolveEditionFromTier(config.subscriptionTier, config.name)})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            
                            {selectedConfigName && (
                                <div>
                                    <label className="block text-sm font-medium text-blue-400 mb-1.5">Project Region (Auto-fill)</label>
                                    <select 
                                        value={selectedLocation} 
                                        onChange={(e) => handleConfigSelection(selectedConfigName, e.target.value)}
                                        className="w-full bg-blue-900/20 border border-blue-800 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
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

                    <div>
                        <label htmlFor="gemini-edition-select" className="block text-sm font-medium text-gray-400 mb-1.5">Gemini Enterprise Edition</label>
                        <select
                            id="gemini-edition-select"
                            aria-label="Gemini Enterprise Edition"
                            value={edition} 
                            onChange={(e) => setEdition(e.target.value as GeminiEnterpriseEdition)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                        >
                            {Object.keys(EDITION_QUOTA_SPECS).map((edKey) => (
                                <option key={edKey} value={edKey}>
                                    {edKey}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="user-licenses-input" className="block text-sm font-medium text-gray-400 mb-1.5">Number of User Licenses</label>
                        <input
                            id="user-licenses-input"
                            aria-label="Number of User Licenses"
                            type="number" 
                            min="1"
                            value={licenses} 
                            onChange={(e) => {
                                const val = e.target.value;
                                setLicenses(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
                            }}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                        />
                    </div>
                </div>

                {/* Single-User Quota Limit (GA — Oct 22, 2026) Simulator */}
                <div className="mt-5 pt-5 border-t border-gray-700">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <input
                                id="single-user-limit-toggle"
                                data-testid="single-user-limit-toggle"
                                type="checkbox"
                                checked={singleUserLimitEnabled}
                                onChange={(e) => setSingleUserLimitEnabled(e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <div>
                                <div className="flex items-center gap-2">
                                    <label htmlFor="single-user-limit-toggle" className="text-sm font-semibold text-white cursor-pointer">
                                        Limit any single-user&apos;s quota
                                    </label>
                                    <span className="bg-blue-900/60 border border-blue-700 text-blue-300 text-[11px] font-medium px-2 py-0.5 rounded">
                                        GA
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    Caps any individual user&apos;s daily usage from the shared edition pool to <code className="text-gray-300">per_user_quota &times; multiplier</code> (defaults to 10x). Does not apply to AI developer tools.
                                </p>
                            </div>
                        </div>

                        {singleUserLimitEnabled && currentEditionSpec.supportsSingleUserLimit && (
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <label htmlFor="single-user-multiplier-input" className="text-xs font-medium text-gray-300 whitespace-nowrap">
                                        Multiplier (&ge; 1):
                                    </label>
                                    <input
                                        id="single-user-multiplier-input"
                                        data-testid="single-user-multiplier-input"
                                        aria-label="Single-User Quota Multiplier"
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={singleUserMultiplierRaw}
                                        onChange={(e) => setSingleUserMultiplierRaw(e.target.value)}
                                        className="w-24 bg-gray-700 border border-gray-600 rounded px-2.5 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {[1, 5, 10, 20].map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setSingleUserMultiplierRaw(String(preset))}
                                            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                                                quotas.effectiveMultiplier === preset && multiplierValidation.valid
                                                    ? 'bg-blue-600 border-blue-500 text-white'
                                                    : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-300'
                                            }`}
                                        >
                                            {preset}x
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {singleUserLimitEnabled && !currentEditionSpec.supportsSingleUserLimit && (
                        <div
                            data-testid="single-user-unsupported-edition-warning"
                            role="alert"
                            className="mt-3 bg-amber-900/30 border border-amber-800 p-3 rounded text-amber-200 text-xs"
                        >
                            Single-user quota limits are only supported for <strong>Standard</strong>, <strong>Plus</strong>, and <strong>Standard Emerging Market</strong> editions in Google Cloud Console. {edition} uses standard edition pooling.
                        </div>
                    )}

                    {singleUserLimitEnabled && currentEditionSpec.supportsSingleUserLimit && !multiplierValidation.valid && (
                        <div
                            data-testid="multiplier-validation-error"
                            role="alert"
                            className="mt-3 bg-red-900/30 border border-red-800 p-2.5 rounded text-red-300 text-xs"
                        >
                            {multiplierValidation.error} Using fallback multiplier of {quotas.effectiveMultiplier}x.
                        </div>
                    )}

                    {quotas.singleUserLimitActive && (
                        <div
                            data-testid="single-user-limit-summary"
                            className="mt-3 bg-indigo-950/40 border border-indigo-800/70 rounded-lg p-3 text-xs text-indigo-200 flex flex-wrap items-center justify-between gap-2"
                        >
                            <div>
                                <strong>Active Cap Formula:</strong> Per-User Daily Quota &times; <strong>{quotas.effectiveMultiplier}x</strong> (tracked independently across Assistant queries, No-code agent tools, Image generation, Video generation, and Deep Research).
                            </div>
                            {!noLicenses && numLicenses > 0 && (
                                <span className="bg-indigo-900/60 border border-indigo-700 px-2.5 py-1 rounded text-indigo-100 font-medium whitespace-nowrap">
                                    {quotas.effectiveMultiplier >= numLicenses
                                        ? `Multiplier (${quotas.effectiveMultiplier}x) ≥ seats (${numLicenses}): 1 user can consume 100% of pool`
                                        : `Min ${quotas.usersToExhaustPool} max-cap users required to exhaust daily pool`}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 p-6 rounded-lg shadow-inner">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold text-white">Gemini Enterprise Quota Usage</h2>
                    <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">Project Level ({edition})</span>
                </div>

                {/* Data & Actions Section */}
                <div className="mb-6 pb-6 border-b border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Data &amp; actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <QuotaCard 
                            title="Tasks and actions" 
                            value={quotas.tasksAndActions} 
                            usage={usageMetrics?.tasksAndActions}
                            unit="tasks / day" 
                            singleUserCap={quotas.singleUserCaps?.tasksAndActions}
                            multiplier={quotas.effectiveMultiplier}
                            tooltip="Pooled daily limit for connector actions and tool executions (160/day per Standard seat, 200/day per Plus seat). Metric: discoveryengine.googleapis.com/quota/tasks_and_actions_tier_enterprise*_regional/usage"
                        />
                    </div>
                </div>

                {/* Unified Search & Assistant Section */}
                <div className="mb-6 pb-6 border-b border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Unified search &amp; assistant</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <QuotaCard 
                            title="Text answer generation" 
                            value={quotas.textAnswerGen} 
                            usage={usageMetrics?.textAnswerGen}
                            unit="generations / day" 
                            singleUserCap={quotas.singleUserCaps?.textAnswerGen}
                            multiplier={quotas.effectiveMultiplier}
                            tooltip="Pooled daily limit for grounded assistant text answers and search summaries (160/day per Standard seat, 200/day per Plus seat). Metric: discoveryengine.googleapis.com/quota/text_answer_gen_tier_enterprise*_regional/usage"
                        />
                        <QuotaCard 
                            title="Image generation" 
                            value={quotas.imageGen} 
                            usage={usageMetrics?.imageGen}
                            unit="images / day" 
                            singleUserCap={quotas.singleUserCaps?.imageGen}
                            multiplier={quotas.effectiveMultiplier}
                            tooltip="Pooled daily limit for enterprise image generations (5/day per Standard seat, 10/day per Plus seat; overage-only on Standard Emerging Market). Metric: discoveryengine.googleapis.com/quota/image_gen_tier_enterprise*_regional/usage"
                        />
                        <QuotaCard 
                            title="Video generation" 
                            value={quotas.videoGen} 
                            usage={usageMetrics?.videoGen}
                            unit="videos / day" 
                            singleUserCap={quotas.singleUserCaps?.videoGen}
                            multiplier={quotas.effectiveMultiplier}
                            tooltip="Pooled daily limit for enterprise video generations (2/day per Standard seat, 3/day per Plus seat; overage-only on Standard Emerging Market). Metric: discoveryengine.googleapis.com/quota/video_gen_numbers_tier_enterprise*_regional/usage"
                        />
                        <QuotaCard 
                            title="Grounding with Google search" 
                            value={quotas.grounding} 
                            usage={usageMetrics?.grounding}
                            unit="queries / day" 
                            singleUserCap={quotas.singleUserCaps?.grounding}
                            multiplier={quotas.effectiveMultiplier}
                            tooltip="Pooled daily limit for queries grounded via Google Search (160/day per Standard seat, 200/day per Plus seat). Metric: discoveryengine.googleapis.com/quota/grounding_with_search_tier_enterprise*_regional/usage"
                        />
                        <QuotaCard 
                            title="Web grounding for enterprise" 
                            value={quotas.webGrounding} 
                            usage={usageMetrics?.webGrounding}
                            unit="queries / day" 
                            singleUserCap={quotas.singleUserCaps?.webGrounding}
                            multiplier={quotas.effectiveMultiplier}
                            tooltip="Pooled daily limit for enterprise web grounding queries (160/day per Standard seat, 200/day per Plus seat). Metric: discoveryengine.googleapis.com/quota/web_grounding_for_enterprise_tier_enterprise*_regional/usage"
                        />
                    </div>
                </div>

                {/* Agents Section */}
                <div className="mb-6 pb-6 border-b border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Agents</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <QuotaCard 
                            title="Idea generation" 
                            value={quotas.ideaGeneration} 
                            usage={usageMetrics?.ideaGeneration}
                            unit="ideas / day" 
                            singleUserCap={quotas.singleUserCaps?.ideaGeneration}
                            multiplier={quotas.effectiveMultiplier}
                            tooltip="Pooled daily limit for Idea Generation agent runs (1/day per Standard or Plus seat). Metric: discoveryengine.googleapis.com/quota/idea_gen_start_instance_tier_enterprise*_regional/usage"
                        />
                        <QuotaCard 
                            title="Deep research" 
                            value={quotas.deepResearch} 
                            usage={usageMetrics?.deepResearch}
                            unit="queries / day" 
                            singleUserCap={quotas.singleUserCaps?.deepResearch}
                            multiplier={quotas.effectiveMultiplier}
                            tooltip="Pooled daily limit for multi-step Deep Research agent queries (3/day per Standard seat, 10/day per Plus seat). Metric: discoveryengine.googleapis.com/quota/deep_research_query_total_tier_enterprise*_regional/usage"
                        />
                    </div>
                </div>

                {/* Calculated Edition Entitlements & Allocations Section */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">
                        Edition Entitlements &amp; Pooled Allocations (Calculated)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex flex-col justify-between">
                            <div className="flex items-start justify-between mb-2">
                                <h4 className="text-gray-300 text-sm font-semibold pr-2">No-code agent building tools (Create)</h4>
                                <InfoTooltip text="Pooled daily limit for creating custom agents in Workflow Builder or registering external/custom agents (A2A, ADK, Dialogflow) in an app (1/day per Standard seat, 10/day per Plus seat)." />
                            </div>
                            <div className="flex items-baseline gap-1.5 mt-auto">
                                <span data-testid="entitlement-agent-creation" className="text-2xl font-bold text-emerald-400">
                                    {noLicenses ? '-' : quotas.agentCreation.toLocaleString()}
                                </span>
                                <span className="text-gray-400 text-xs">agents / day ({currentEditionSpec.agentCreation}/seat)</span>
                            </div>
                            {quotas.singleUserCaps && quotas.singleUserCaps.agentCreation > 0 && (
                                <div className="mt-2.5 flex items-center justify-between gap-2 bg-indigo-950/60 border border-indigo-700/60 rounded px-2.5 py-1 text-xs text-indigo-200">
                                    <span>Max per user ({quotas.effectiveMultiplier}x):</span>
                                    <span className="font-semibold text-indigo-300">
                                        {quotas.singleUserCaps.agentCreation.toLocaleString()} agents / day
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex flex-col justify-between">
                            <div className="flex items-start justify-between mb-2">
                                <h4 className="text-gray-300 text-sm font-semibold pr-2">Storage + data indexing</h4>
                                <InfoTooltip text="Pooled across all editions per project and location (30 GiB per Standard seat, 75 GiB per Plus seat). Excess storage automatically incurs $5 per GiB/month prorated overage charges." />
                            </div>
                            <div className="flex items-baseline gap-1.5 mt-auto">
                                <span data-testid="entitlement-storage-gib" className="text-2xl font-bold text-emerald-400">
                                    {noLicenses ? '-' : quotas.storageGiB.toLocaleString()}
                                </span>
                                <span className="text-gray-400 text-xs">GiB pooled ({currentEditionSpec.storageGiB} GiB/seat)</span>
                            </div>
                            <p className="mt-2 text-[11px] text-gray-400">Shared across all editions in project/location ($5/GiB/mo overage)</p>
                        </div>

                        <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex flex-col justify-between">
                            <div className="flex items-start justify-between mb-2">
                                <h4 className="text-gray-300 text-sm font-semibold pr-2">AI developer tools credits</h4>
                                <InfoTooltip text="Bundled credits for Google Antigravity, Antigravity for IDEs, and Android Studio ($10/mo per Standard seat, $15/mo per Plus seat). Enforced on a 7-day rolling basis as a shared weekly pool (monthly value ÷ 4 × seats). Single-user quota multipliers do not apply." />
                            </div>
                            <div className="flex items-baseline gap-1.5 mt-auto">
                                <span data-testid="entitlement-devtools-weekly" className="text-2xl font-bold text-emerald-400">
                                    {noLicenses || currentEditionSpec.devToolsCreditsMonthlyUsd === 0
                                        ? '-'
                                        : `$${quotas.devToolsCreditsWeeklyUsd.toLocaleString()}`}
                                </span>
                                <span className="text-gray-400 text-xs">
                                    / 7-day pool ({noLicenses ? `$${currentEditionSpec.devToolsCreditsMonthlyUsd}/seat/mo` : `$${quotas.devToolsCreditsMonthlyUsd.toLocaleString()}/mo`})
                                </span>
                            </div>
                            <p className="mt-2 text-[11px] text-gray-400">Exempt from single-user quota multiplier; resets every 7 days</p>
                        </div>
                    </div>
                </div>
            </div>
            
             <div className="bg-blue-900/30 border border-blue-800 p-4 rounded-lg flex items-start gap-3">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
                 <div className="text-sm text-blue-200 space-y-1.5">
                    <p className="font-semibold">How Quota Pooling, Single-User Limits &amp; PAYG Overages Work</p>
                    <p>
                        <strong>Edition Quota Pooling:</strong> Users within the same edition share a combined daily quota pool per project and location (resetting daily at midnight PT; AI developer tools reset on a 7-day rolling cycle). Storage and data indexing quotas combine into a single shared pool across all editions.
                    </p>
                    <p>
                        <strong>Single-User Quota Limits (GA):</strong> By default, individual consumption is uncapped within the shared pool. Administrators can enable <em>Limit any single-user&apos;s quota</em> on the <strong>Usage &amp; Spending &gt; Usage</strong> page (supported for Standard, Plus, and Standard Emerging Market) with a whole-number multiplier (defaults to 10x) to prevent any single user from exhausting the edition&apos;s daily pool.
                    </p>
                    <p>
                        <strong>Interaction with Overages:</strong> Single-user limits apply only while the edition&apos;s subscription pool has remaining capacity. Once the edition&apos;s shared pool is depleted, if <strong>Pay-as-you-go usage above quota</strong> is enabled, all users (including those who reached their single-user cap) continue uninterrupted at pay-as-you-go rates up to your configured monthly spend limit.
                    </p>
                 </div>
             </div>
        </div>
    );
};

export default CostsUI;

