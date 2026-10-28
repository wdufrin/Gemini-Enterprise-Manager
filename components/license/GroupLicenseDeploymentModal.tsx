import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { Config, GcsBucket, LicenseConfig, GroupLicensingEditConfig } from '../../types';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
    assertValidBucketPath,
    assertValidGcpResourceName,
    assertValidOpaqueId,
    assertValidProjectIdentifier,
} from '../../services/shellSafety';
import mainPyTemplate from './main.py.template?raw';

interface GroupLicenseDeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectNumber: string;
  currentConfig: { appLocation: string; userStoreId: string; };
  apiLicenseConfigs: LicenseConfig[];
  editConfig?: GroupLicensingEditConfig | null;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

const generateMainPy = () => {
    return mainPyTemplate;
};

const ALLOWED_APP_LOCATIONS = new Set(['global', 'us', 'eu']);
const GROUP_EMAIL_PATTERN = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const sanitizeCloudRunLabelValue = (value: string): string => {
    const cleaned = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 63);
    return cleaned || 'default';
};

export const generateDeploySh = (
    projectId: string, 
    location: string, 
    userStoreId: string, 
    region: string,
    configGcsUri: string,
    selectedTier: string,
    impersonatedUser: string,
    projectNumber: string
) => {
    const trimmedProjectId = projectId.trim();
    const trimmedLocation = location.trim();
    const trimmedUserStoreId = userStoreId.trim();
    const trimmedRegion = region.trim();
    const trimmedConfigGcsUri = configGcsUri.trim();
    const trimmedTier = selectedTier.trim();
    const trimmedProjectNumber = projectNumber.trim();
    const safeSkuLabel = sanitizeCloudRunLabelValue(trimmedTier);
    const bucketName = trimmedConfigGcsUri.replace(/^gs:\/\//i, '').split('/')[0];

    let content = "set -e\n";
    content += "PROJECT_ID=\"" + trimmedProjectId + "\"\n";
    content += "REGION=\"" + trimmedRegion + "\"\n";
    content += "CONFIG_GCS_URI=\"" + trimmedConfigGcsUri + "\"\n";
    content += "SERVICE_NAME_ADDER=\"group-licensing-adder-" + trimmedLocation + "\"\n";
    content += "SERVICE_NAME_CLEANUP=\"group-licensing-cleanup-" + trimmedLocation + "\"\n";
    content += "JOB_NAME_ADDER=\"trigger-group-licensing-adder-" + trimmedLocation + "\"\n";
    content += "JOB_NAME_CLEANUP=\"trigger-group-licensing-cleanup-" + trimmedLocation + "\"\n";
    content += "LOCATION=\"" + trimmedLocation + "\"\n";
    content += "USER_STORE_ID=\"" + trimmedUserStoreId + "\"\n";
    content += "SA_NAME=\"license-grouper-sa\"\n\n";
    
    content += "echo \"Checking if Service Account $SA_NAME exists...\"\n";
    content += "FOUND_SA_EMAIL=$(gcloud iam service-accounts list --project \"$PROJECT_ID\" --filter=\"email:$SA_NAME@\" --format=\"value(email)\" | head -n 1)\n\n";
    
    content += "if [ -n \"$FOUND_SA_EMAIL\" ]; then\n";
    content += "  echo \"✅ Service Account found: $FOUND_SA_EMAIL. Skipping creation.\"\n";
    content += "  SA_EMAIL=$FOUND_SA_EMAIL\n";
    content += "else\n";
    content += "  echo \"Creating Service Account $SA_NAME...\"\n";
    content += "  gcloud iam service-accounts create $SA_NAME --project $PROJECT_ID --display-name \"License Grouper Service Account\"\n";
    content += "  sleep 10\n";
    content += "  SA_EMAIL=$(gcloud iam service-accounts list --project \"$PROJECT_ID\" --filter=\"email:$SA_NAME@\" --format=\"value(email)\" | head -n 1)\n";
    content += "fi\n\n";
    
    content += "echo \"Using Service Account Email: $SA_EMAIL\"\n\n";
    
    content += "echo \"Granting IAM permissions...\"\n";
    content += "# Grant Discovery Engine Editor permission (required to list/update user licenses).\n";
    content += "# Security Tip: In production, create and assign a custom IAM role containing only\n";
    content += "# 'discoveryengine.userLicenses.list' and 'discoveryengine.userLicenses.update' instead.\n";
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/discoveryengine.editor\" --condition=None\n";
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/logging.logWriter\" --condition=None\n";
    if (bucketName) {
        content += "gcloud storage buckets add-iam-policy-binding gs://" + bucketName + " --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/storage.objectViewer\"\n";
    }
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/serviceusage.serviceUsageConsumer\" --condition=None\n\n";
    
    content += "echo \"Deploying Cloud Run Service (Adder): $SERVICE_NAME_ADDER...\"\n";
    content += "gcloud run deploy $SERVICE_NAME_ADDER \\\n";
    content += "    --source . \\\n";
    content += "    --project $PROJECT_ID \\\n";
    content += "    --region $REGION \\\n";
    content += "    --no-allow-unauthenticated \\\n";
    content += "    --service-account $SA_EMAIL \\\n";
    content += "    --timeout=540 \\\n";
    content += "    --labels=\"ge-region=" + trimmedLocation + ",ge-sku=" + safeSkuLabel + ",job-type=adder\" \\\n";
    content += "    --set-env-vars=\"GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$LOCATION,USER_STORE_ID=$USER_STORE_ID,CONFIG_GCS_URI=" + trimmedConfigGcsUri + ",SUBSCRIPTION_TIER=" + trimmedTier + ",JOB_TYPE=adder,PROJECT_NUMBER=" + trimmedProjectNumber + "\"\n\n";
    
    content += "IMAGE_URI=$(gcloud run services describe $SERVICE_NAME_ADDER --project $PROJECT_ID --region $REGION --format='value(spec.template.spec.containers[0].image)')\n\n";
    content += "echo \"Deploying Cloud Run Service (Cleanup) using image $IMAGE_URI...\"\n";
    content += "gcloud run deploy $SERVICE_NAME_CLEANUP \\\n";
    content += "    --image $IMAGE_URI \\\n";
    content += "    --project $PROJECT_ID \\\n";
    content += "    --region $REGION \\\n";
    content += "    --no-allow-unauthenticated \\\n";
    content += "    --service-account $SA_EMAIL \\\n";
    content += "    --timeout=540 \\\n";
    content += "    --labels=\"ge-region=" + trimmedLocation + ",ge-sku=" + safeSkuLabel + ",job-type=cleanup\" \\\n";
    content += "    --set-env-vars=\"GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$LOCATION,USER_STORE_ID=$USER_STORE_ID,CONFIG_GCS_URI=" + trimmedConfigGcsUri + ",SUBSCRIPTION_TIER=" + trimmedTier + ",JOB_TYPE=cleanup,PROJECT_NUMBER=" + trimmedProjectNumber + "\"\n\n";
    
    content += "echo \"Granting Invoker permission to Service Account on Cloud Run services...\"\n";
    content += "gcloud run services add-iam-policy-binding $SERVICE_NAME_ADDER \\\n";
    content += "    --member=\"serviceAccount:$SA_EMAIL\" \\\n";
    content += "    --role=\"roles/run.invoker\" \\\n";
    content += "    --region $REGION \\\n";
    content += "    --project $PROJECT_ID\n\n";
    content += "gcloud run services add-iam-policy-binding $SERVICE_NAME_CLEANUP \\\n";
    content += "    --member=\"serviceAccount:$SA_EMAIL\" \\\n";
    content += "    --role=\"roles/run.invoker\" \\\n";
    content += "    --region $REGION \\\n";
    content += "    --project $PROJECT_ID\n\n";

    content += "SERVICE_URL_ADDER=$(gcloud run services describe $SERVICE_NAME_ADDER --project $PROJECT_ID --region $REGION --format='value(status.url)')\n";
    content += "SERVICE_URL_CLEANUP=$(gcloud run services describe $SERVICE_NAME_CLEANUP --project $PROJECT_ID --region $REGION --format='value(status.url)')\n\n";
    
    content += "echo \"Creating/Updating Cloud Scheduler Job for Adder...\"\n";
    content += "if gcloud scheduler jobs describe $JOB_NAME_ADDER --location $REGION --project $PROJECT_ID > /dev/null 2>&1; then\n";
    content += "    gcloud scheduler jobs update http $JOB_NAME_ADDER \\\n";
    content += "        --location $REGION \\\n";
    content += "        --project $PROJECT_ID \\\n";
    content += "        --schedule=\"0 4 * * *\" \\\n";
    content += "        --uri=\"$SERVICE_URL_ADDER\" \\\n";
    content += "        --http-method=POST \\\n";
    content += "        --attempt-deadline=540s \\\n";
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "else\n";
    content += "    gcloud scheduler jobs create http $JOB_NAME_ADDER \\\n";
    content += "        --location $REGION \\\n";
    content += "        --project $PROJECT_ID \\\n";
    content += "        --schedule=\"0 4 * * *\" \\\n";
    content += "        --uri=\"$SERVICE_URL_ADDER\" \\\n";
    content += "        --http-method=POST \\\n";
    content += "        --attempt-deadline=540s \\\n";
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "fi\n\n";
    
    content += "echo \"Creating/Updating Cloud Scheduler Job for Cleanup...\"\n";
    content += "if gcloud scheduler jobs describe $JOB_NAME_CLEANUP --location $REGION --project $PROJECT_ID > /dev/null 2>&1; then\n";
    content += "    gcloud scheduler jobs update http $JOB_NAME_CLEANUP \\\n";
    content += "        --location $REGION \\\n";
    content += "        --project $PROJECT_ID \\\n";
    content += "        --schedule=\"0 */6 * * *\" \\\n";
    content += "        --uri=\"$SERVICE_URL_CLEANUP\" \\\n";
    content += "        --http-method=POST \\\n";
    content += "        --attempt-deadline=540s \\\n";
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "else\n";
    content += "    gcloud scheduler jobs create http $JOB_NAME_CLEANUP \\\n";
    content += "        --location $REGION \\\n";
    content += "        --project $PROJECT_ID \\\n";
    content += "        --schedule=\"0 */6 * * *\" \\\n";
    content += "        --uri=\"$SERVICE_URL_CLEANUP\" \\\n";
    content += "        --http-method=POST \\\n";
    content += "        --attempt-deadline=540s \\\n";
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "fi\n\n";
    
    content += "echo \"✅ Deployment Complete!\"\n";
    return content;
};

const GroupLicenseDeploymentModal: React.FC<GroupLicenseDeploymentModalProps> = ({ isOpen, onClose, projectNumber, currentConfig, apiLicenseConfigs, editConfig, onBuildTriggered }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [config, setConfig] = useState({
        projectId: projectNumber,
        runRegion: 'us-central1',
        appLocation: currentConfig.appLocation || 'global',
        userStoreId: currentConfig.userStoreId || 'default_user_store',
    });
    const [resolvedProjectNumber, setResolvedProjectNumber] = useState(projectNumber);

    const [groupsInput, setGroupsInput] = useState('');
    const [selectedTier, setSelectedTier] = useState(() => {
        if (apiLicenseConfigs.length > 0) {
            const name = apiLicenseConfigs[0].name;
            return name.split('/').pop() || 'SUBSCRIPTION_TIER_ENTERPRISE';
        }
        return 'SUBSCRIPTION_TIER_ENTERPRISE';
    });

    const [appLocation, setAppLocation] = useState(
        ALLOWED_APP_LOCATIONS.has(currentConfig.appLocation) ? currentConfig.appLocation : 'global'
    );
    const [modalLicenseConfigs, setModalLicenseConfigs] = useState<LicenseConfig[]>(apiLicenseConfigs);
    const [isLoadingLicenses, setIsLoadingLicenses] = useState(false);
    const [activeTab, setActiveTab] = useState<'deploy' | 'main' | 'requirements' | 'permissions'>('deploy');
    const [copySuccess, setCopySuccess] = useState('');
    const [isResolvingId, setIsResolvingId] = useState(false);

    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<string>('');
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);

    useModalA11y({
        isOpen,
        onClose,
        containerRef,
        preventClose: isDeploying,
    });
    
    useEffect(() => {
        if (!isOpen) return;
        setDeployError(null);
        setResolvedProjectNumber(projectNumber);

        const safeDefaultLocation = ALLOWED_APP_LOCATIONS.has(currentConfig.appLocation)
            ? currentConfig.appLocation
            : 'global';

        if (editConfig) {
            const meta = editConfig._editMeta;
            const projects = editConfig.projects || {};
            const candidateEntries =
                (meta?.projectId && projects[meta.projectId]) ||
                projects[projectNumber] ||
                Object.values(projects)[0] ||
                [];

            const matchedEnt =
                candidateEntries.find((e) => {
                    const matchesLoc = !meta?.location || !e.location || e.location === meta.location;
                    const matchesSku =
                        !meta?.sku ||
                        !e.subscription_tier ||
                        e.subscription_tier === meta.sku ||
                        sanitizeCloudRunLabelValue(e.subscription_tier) === sanitizeCloudRunLabelValue(meta.sku);
                    return matchesLoc && matchesSku;
                }) || candidateEntries[0];

            const rawLocation = matchedEnt?.location || meta?.location || safeDefaultLocation;
            if (!ALLOWED_APP_LOCATIONS.has(rawLocation)) {
                setDeployError(`Untrusted location "${rawLocation}" in configuration was reset to "global".`);
            }
            const validatedLocation = ALLOWED_APP_LOCATIONS.has(rawLocation) ? rawLocation : 'global';

            setAppLocation(validatedLocation);
            if (matchedEnt?.subscription_tier) {
                setSelectedTier(matchedEnt.subscription_tier);
            } else if (meta?.sku) {
                setSelectedTier(meta.sku);
            }
            setGroupsInput(((matchedEnt?.groups || []) as string[]).join(', '));

            setConfig((prev) => ({
                ...prev,
                projectId: meta?.projectId || prev.projectId || projectNumber,
                runRegion: meta?.runRegion || prev.runRegion || 'us-central1',
                appLocation: validatedLocation,
                userStoreId: meta?.userStoreId || currentConfig.userStoreId || 'default_user_store',
            }));

            if (meta?.bucket) {
                setSelectedBucket(meta.bucket);
            }
        } else {
            setGroupsInput('');
            setAppLocation(safeDefaultLocation);
            setConfig((prev) => ({
                ...prev,
                projectId: projectNumber,
                runRegion: 'us-central1',
                appLocation: safeDefaultLocation,
                userStoreId: currentConfig.userStoreId || 'default_user_store',
            }));
        }

        if (projectNumber) {
            setIsResolvingId(true);
            api.getProject(projectNumber)
                .then((details) => {
                    if (details.projectNumber) {
                        setResolvedProjectNumber(String(details.projectNumber));
                    }
                    if (details.projectId) {
                        setConfig((prev) => ({ ...prev, projectId: details.projectId }));
                        if (editConfig?.projects?.[details.projectId]) {
                            const meta = editConfig._editMeta;
                            const entries = editConfig.projects[details.projectId];
                            const matched =
                                entries.find((e) => {
                                    const matchesLoc = !meta?.location || !e.location || e.location === meta.location;
                                    const matchesSku =
                                        !meta?.sku ||
                                        !e.subscription_tier ||
                                        e.subscription_tier === meta.sku ||
                                        sanitizeCloudRunLabelValue(e.subscription_tier) === sanitizeCloudRunLabelValue(meta.sku);
                                    return matchesLoc && matchesSku;
                                }) || entries[0];
                            if (matched) {
                                if (matched.subscription_tier) setSelectedTier(matched.subscription_tier);
                                if (matched.groups) setGroupsInput(matched.groups.join(', '));
                                if (matched.location && ALLOWED_APP_LOCATIONS.has(matched.location)) {
                                    setAppLocation(matched.location);
                                }
                            }
                        }
                    }
                })
                .catch((err) => console.warn('Failed to auto-resolve project ID:', err))
                .finally(() => setIsResolvingId(false));
        }
    }, [isOpen, currentConfig.appLocation, currentConfig.userStoreId, projectNumber, editConfig]);

    useEffect(() => {
        const fetchConfigs = async () => {
            if (!ALLOWED_APP_LOCATIONS.has(appLocation)) {
                setModalLicenseConfigs([]);
                return;
            }
            setIsLoadingLicenses(true);
            try {
                const configForApi: Config = {
                    projectId: config.projectId,
                    appLocation: appLocation,
                    collectionId: '', appId: '', assistantId: ''
                };
                const res = await api.listLicenseConfigs(configForApi);
                const activeConfigs = (res.licenseConfigs || []).filter((cfg: LicenseConfig) => cfg.state === 'ACTIVE');
                setModalLicenseConfigs(activeConfigs);
                
                // Preserve selectedTier if we are in Edit mode or if current selectedTier is already valid
                setSelectedTier((prevTier) => {
                    if (editConfig && prevTier) {
                        const matchingCfg = activeConfigs.find((cfg: LicenseConfig) => {
                            const id = cfg.name.split('/').pop() || '';
                            return id === prevTier || sanitizeCloudRunLabelValue(id) === sanitizeCloudRunLabelValue(prevTier);
                        });
                        return matchingCfg ? (matchingCfg.name.split('/').pop() || prevTier) : prevTier;
                    }
                    if (activeConfigs.length > 0) {
                        const alreadyInList = activeConfigs.some((cfg: LicenseConfig) => cfg.name.split('/').pop() === prevTier);
                        if (alreadyInList) return prevTier;
                        return activeConfigs[0].name.split('/').pop() || 'SUBSCRIPTION_TIER_ENTERPRISE';
                    }
                    return prevTier || 'SUBSCRIPTION_TIER_ENTERPRISE';
                });
            } catch (e) {
                console.error("Failed to fetch license configs in modal", e);
                setModalLicenseConfigs([]);
            } finally {
                setIsLoadingLicenses(false);
            }
        };
        
        if (isOpen && config.projectId) {
            fetchConfigs();
        }
    }, [isOpen, appLocation, config.projectId, editConfig]);

    useEffect(() => {
        if (!isOpen || !config.projectId) return;
        
        const fetchBuckets = async () => {
            setIsLoadingBuckets(true);
            try {
                const res = await api.listBuckets(config.projectId);
                const items = res.items || [];
                setBuckets(items);
                const preferredBucket = editConfig?._editMeta?.bucket;
                if (preferredBucket && items.some((b) => b.name === preferredBucket)) {
                    setSelectedBucket(preferredBucket);
                } else if (items.length > 0) {
                    setSelectedBucket((prev) => (prev && items.some((b) => b.name === prev) ? prev : items[0].name));
                }
            } catch (e: unknown) {
                console.error("Failed to fetch buckets", e);
                setDeployError(`Failed to list GCS buckets: ${toErrorMessage(e)}`);
            } finally {
                setIsLoadingBuckets(false);
            }
        };
        fetchBuckets();
    }, [isOpen, config.projectId, editConfig]);

    const handleCopy = (content: string) => {
        if (activeTab === 'deploy') {
            try {
                validateDeploymentInputs();
            } catch (err: unknown) {
                setDeployError(toErrorMessage(err, 'Invalid deployment configuration.'));
                return;
            }
        }
        navigator.clipboard.writeText(content).then(() => {
            setCopySuccess('Copied!');
            setTimeout(() => setCopySuccess(''), 2000);
        }).catch((err: unknown) => {
            setDeployError(`Failed to copy to clipboard: ${toErrorMessage(err)}`);
        });
    };

    const groups = groupsInput.split(',').map(g => g.trim()).filter(Boolean);
    const resolvedBillingAccountId = editConfig?.billing_account_id || "YOUR_BILLING_ACCOUNT_ID";
    const effectiveProjectNumber = (resolvedProjectNumber || projectNumber).trim();

    const buildEntitlementsConfig = (baseProjects: Record<string, Array<{ subscription_tier?: string; groups?: string[]; location?: string }>>) => {
        const targetProjectKey = config.projectId.trim();
        const existingProjectEntries = (baseProjects[targetProjectKey] || []).filter(
            (entry) => !(
                (entry.subscription_tier === selectedTier ||
                    sanitizeCloudRunLabelValue(entry.subscription_tier || '') === sanitizeCloudRunLabelValue(selectedTier)) &&
                (entry.location || 'global') === appLocation
            )
        );
        const updatedProjects: Record<string, Array<{ subscription_tier?: string; groups?: string[]; location?: string }>> = {
            ...baseProjects,
            [targetProjectKey]: [
                ...existingProjectEntries,
                {
                    "subscription_tier": selectedTier.trim(),
                    "location": appLocation,
                    "groups": groups
                }
            ]
        };
        // Keep numeric projectNumber key in sync if present in baseProjects
        if (effectiveProjectNumber && effectiveProjectNumber !== targetProjectKey && baseProjects[effectiveProjectNumber]) {
            const existingNumEntries = baseProjects[effectiveProjectNumber].filter(
                (entry) => !(
                    (entry.subscription_tier === selectedTier ||
                        sanitizeCloudRunLabelValue(entry.subscription_tier || '') === sanitizeCloudRunLabelValue(selectedTier)) &&
                    (entry.location || 'global') === appLocation
                )
            );
            updatedProjects[effectiveProjectNumber] = [
                ...existingNumEntries,
                {
                    "subscription_tier": selectedTier.trim(),
                    "location": appLocation,
                    "groups": groups
                }
            ];
        }
        return {
            "billing_account_id": resolvedBillingAccountId,
            "projects": updatedProjects
        };
    };

    const entitlementsConfig = buildEntitlementsConfig(editConfig?.projects || {});
    const configGcsUri = "gs://" + selectedBucket.trim() + "/config/entitlements.json";

    const mainPy = generateMainPy();
    const deploySh = generateDeploySh(
        config.projectId, 
        appLocation, 
        config.userStoreId, 
        config.runRegion,
        configGcsUri,
        selectedTier,
        "",
        effectiveProjectNumber
    );
    const requirementsTxt = "Flask==3.0.0\ngunicorn==22.0.0\ngoogle-auth>=2.22.0\nrequests>=2.31.0";
    const dockerfile = "FROM python:3.11-slim\nENV PYTHONUNBUFFERED True\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nCMD [\"gunicorn\", \"--bind\", \"0.0.0.0:8080\", \"--workers\", \"1\", \"--threads\", \"8\", \"--timeout\", \"0\", \"main:app\"]";

    /**
     * SECURITY (F-01 & P0-2): allowlist-validates every user- or API-supplied value that
     * generateDeploySh() concatenates into the generated deploy.sh, as well as the
     * Google Group emails written to entitlements.json.
     */
    const validateDeploymentInputs = () => {
        const validProjectId = assertValidProjectIdentifier(config.projectId, 'Project ID');
        const validRunRegion = assertValidGcpResourceName(config.runRegion, 'Run region');
        const validAppLocation = assertValidGcpResourceName(appLocation, 'App location');
        if (!ALLOWED_APP_LOCATIONS.has(validAppLocation)) {
            throw new Error(`App location must be one of: global, us, eu (got "${appLocation}").`);
        }
        const validUserStoreId = assertValidOpaqueId(config.userStoreId, 'User Store ID');
        const validSelectedTier = assertValidOpaqueId(selectedTier, 'Subscription tier');

        const validProjectNumber = effectiveProjectNumber
            ? assertValidOpaqueId(effectiveProjectNumber, 'Project number')
            : '';

        const validConfigGcsUri = assertValidBucketPath(configGcsUri, 'Config GCS URI');

        if (groups.length === 0) {
            throw new Error('At least one Google Group email is required.');
        }
        for (const groupEmail of groups) {
            if (!GROUP_EMAIL_PATTERN.test(groupEmail)) {
                throw new Error(
                    `Invalid Google Group email: "${groupEmail}". Expected a valid email address such as "team@example.com".`
                );
            }
        }

        return {
            validProjectId,
            validRunRegion,
            validAppLocation,
            validUserStoreId,
            validSelectedTier,
            validProjectNumber,
            validConfigGcsUri,
        };
    };

    const handleDownload = async () => {
        let validated;
        try {
            validated = validateDeploymentInputs();
        } catch (err: unknown) {
            setDeployError(toErrorMessage(err, 'Invalid deployment configuration.'));
            return;
        }
        setDeployError(null);

        const validatedDeploySh = generateDeploySh(
            validated.validProjectId,
            validated.validAppLocation,
            validated.validUserStoreId,
            validated.validRunRegion,
            validated.validConfigGcsUri,
            validated.validSelectedTier,
            "",
            validated.validProjectNumber
        );

        const zip = new JSZip();
        zip.file('main.py', mainPy);
        zip.file('deploy.sh', validatedDeploySh);
        zip.file('requirements.txt', requirementsTxt);
        zip.file('Dockerfile', dockerfile);
        zip.file('entitlements.json.sample', JSON.stringify(entitlementsConfig, null, 2));

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "group-licensing-source.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleCloudBuildDeploy = async () => {
        if (!selectedBucket) {
            setDeployError("Please select a bucket for staging.");
            return;
        }
        setIsDeploying(true);
        setDeployError(null);

        try {
            const validated = validateDeploymentInputs();

            // P0-2 Fix: In "+ New Assignment" mode, merge with any existing config/entitlements.json
            // in GCS so existing group assignments are never silently overwritten.
            let baseProjects = editConfig?.projects || {};
            if (!editConfig) {
                try {
                    const existingRaw = await api.getGcsObjectContent(
                        selectedBucket.trim(),
                        "config/entitlements.json",
                        validated.validProjectId
                    );
                    if (existingRaw) {
                        const parsed = JSON.parse(existingRaw);
                        if (parsed && typeof parsed.projects === 'object' && parsed.projects !== null) {
                            baseProjects = parsed.projects;
                        }
                    }
                } catch {
                    // Object does not exist yet in GCS on first deployment; safe to start fresh.
                }
            }

            const mergedEntitlements = buildEntitlementsConfig(baseProjects);
            const mergedConfigJson = JSON.stringify(mergedEntitlements, null, 2);

            const validatedDeploySh = generateDeploySh(
                validated.validProjectId,
                validated.validAppLocation,
                validated.validUserStoreId,
                validated.validRunRegion,
                validated.validConfigGcsUri,
                validated.validSelectedTier,
                "",
                validated.validProjectNumber
            );

            const zip = new JSZip();
            zip.file('main.py', mainPy);
            zip.file('deploy.sh', validatedDeploySh);
            zip.file('requirements.txt', requirementsTxt);
            zip.file('Dockerfile', dockerfile);
            
            const blob = await zip.generateAsync({ type: 'blob' });
            const file = new File([blob], "source.zip", { type: "application/zip" });
            const sourceObjectName = "source/group-licensing-" + Date.now() + ".zip";

            // Upload source.zip FIRST so if staging fails, live config/entitlements.json is untouched
            await api.uploadFileToGcs(selectedBucket.trim(), sourceObjectName, file, validated.validProjectId);

            const configBlob = new Blob([mergedConfigJson], { type: 'application/json' });
            const configFile = new File([configBlob], "entitlements.json", { type: "application/json" });
            await api.uploadFileToGcs(selectedBucket.trim(), "config/entitlements.json", configFile, validated.validProjectId);

            const buildConfig = {
                source: {
                    storageSource: {
                        bucket: selectedBucket.trim(),
                        object: sourceObjectName
                    }
                },
                steps: [
                    {
                        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                        entrypoint: 'bash',
                        args: ['deploy.sh'],
                        env: ["GOOGLE_CLOUD_PROJECT=" + validated.validProjectId]
                    }
                ],
                timeout: "600s"
            };

            const buildOp = await api.createCloudBuild(validated.validProjectId, buildConfig);
            const buildId = buildOp.metadata?.build?.id;

            if (onBuildTriggered && buildId) {
                onBuildTriggered(buildId, validated.validProjectId);
            }
            
            onClose();

        } catch (err: unknown) {
            setDeployError(toErrorMessage(err, "Failed to trigger Cloud Build."));
        } finally {
            setIsDeploying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-licensing-modal-title"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isDeploying) onClose();
            }}
        >
            <div
                ref={containerRef}
                tabIndex={-1}
                className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 id="group-licensing-modal-title" className="text-xl font-bold text-white">Setup Group Licensing Job</h2>
                    <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-white" disabled={isDeploying}>&times;</button>
                </header>
                
                <main className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
                    {/* Left Config */}
                    <div className="space-y-4">
                        <div className="bg-blue-900/30 border border-blue-700 p-3 rounded-md text-sm text-blue-200 space-y-2">
                            <p>This tool generates a deployment package to run the group licensing logic on Google Cloud Run Services.</p>
                            <p><strong>Note:</strong> The deployment script will attempt to create a service account named <code>license-grouper-sa</code>. If your organization requires service accounts to be created via an external process, please create it manually with the following roles: <code>Discovery Engine Editor</code>, <code>Logs Writer</code>, and <code>Storage Object Viewer</code> (on the GCS bucket used).</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Project ID (String) {isResolvingId && <span className="animate-pulse">...</span>}</label>
                            <input type="text" value={config.projectId} onChange={(e) => setConfig({...config, projectId: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" placeholder="my-project-id" disabled={isDeploying} />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm font-medium text-gray-400">Run Region</label>
                                <select value={config.runRegion} onChange={(e) => setConfig({...config, runRegion: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isDeploying}>
                                    <option value="us-central1">us-central1</option>
                                    <option value="us-east1">us-east1</option>
                                    <option value="europe-west1">europe-west1</option>
                                    <option value="asia-east1">asia-east1</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">App Location / Region</label>
                                <select value={appLocation} onChange={(e) => setAppLocation(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isDeploying}>
                                    <option value="global">global</option>
                                    <option value="us">us</option>
                                    <option value="eu">eu</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Subscription Tier / SKU {isLoadingLicenses && <span className="animate-pulse text-xs text-blue-400"> (Loading...)</span>}</label>
                            <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isDeploying || isLoadingLicenses}>
                                {modalLicenseConfigs.length > 0 ? (
                                    modalLicenseConfigs.map(cfg => {
                                        const id = cfg.name.split('/').pop();
                                        const exp = cfg.endDate && cfg.endDate.year 
                                            ? `${cfg.endDate.year}-${String(cfg.endDate.month || 1).padStart(2, '0')}-${String(cfg.endDate.day || 1).padStart(2, '0')}` 
                                            : '';
                                        const optionText = cfg.displayName 
                                            ? `${cfg.displayName} (Exp: ${exp || 'None'})` 
                                            : `${id} (Exp: ${exp || 'None'})`;
                                        return (
                                            <option key={cfg.name} value={id}>
                                                {optionText}
                                            </option>
                                        );
                                    })
                                ) : (
                                    <>
                                        <option>SUBSCRIPTION_TIER_ENTERPRISE</option>
                                        <option>SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT</option>
                                        <option>SUBSCRIPTION_TIER_SEARCH</option>
                                        <option>SUBSCRIPTION_TIER_NOTEBOOK_LM</option>
                                    </>
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Groups (Comma separated emails)</label>
                            <input type="text" value={groupsInput} onChange={(e) => setGroupsInput(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" placeholder="group1@example.com, group2@example.com" disabled={isDeploying} />
                        </div>

                        <div className="pt-4 border-t border-gray-700">
                            <h3 className="text-sm font-semibold text-white mb-2">Cloud Build Staging Bucket</h3>
                            <div className="flex gap-2">
                                <select 
                                    value={selectedBucket} 
                                    onChange={(e) => setSelectedBucket(e.target.value)} 
                                    className="w-full bg-gray-700 border-gray-600 rounded-md p-2 text-sm text-white"
                                    disabled={isLoadingBuckets || isDeploying}
                                >
                                    {buckets.length === 0 && <option value="">{isLoadingBuckets ? 'Loading...' : 'No buckets found'}</option>}
                                    {buckets.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {deployError && <p className="text-red-400 text-sm" role="alert">{deployError}</p>}

                        <div className="flex gap-4 pt-2">
                            <button 
                                onClick={handleCloudBuildDeploy} 
                                disabled={isDeploying || !selectedBucket}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeploying ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                        Deploying...
                                    </>
                                ) : 'Deploy Job'}
                            </button>
                            <button 
                                onClick={handleDownload} 
                                disabled={isDeploying}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg border border-gray-600 disabled:opacity-50"
                            >
                                Download .zip
                            </button>
                        </div>
                    </div>

                    {/* Right Code */}
                    <div className="flex flex-col h-[500px] bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                        <div className="flex bg-gray-800 border-b border-gray-700">
                            <button onClick={() => setActiveTab('deploy')} className={"px-4 py-2 text-xs font-medium " + (activeTab === 'deploy' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>deploy.sh</button>
                            <button onClick={() => setActiveTab('main')} className={"px-4 py-2 text-xs font-medium " + (activeTab === 'main' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>main.py</button>
                            <button onClick={() => setActiveTab('requirements')} className={"px-4 py-2 text-xs font-medium " + (activeTab === 'requirements' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>requirements.txt</button>
                            <button onClick={() => setActiveTab('permissions')} className={"px-4 py-2 text-xs font-medium " + (activeTab === 'permissions' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>Permissions Guide</button>
                            <div className="flex-1"></div>
                            <button 
                                onClick={() => handleCopy(activeTab === 'deploy' ? deploySh : activeTab === 'main' ? mainPy : requirementsTxt)} 
                                className={"px-3 text-xs text-blue-400 hover:text-white " + (activeTab === 'permissions' ? 'invisible' : '')}
                            >
                                {copySuccess || 'Copy'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            {activeTab === 'permissions' ? (
                                <div className="text-sm text-gray-300 space-y-4">
                                    <h3 className="text-lg font-semibold text-white">Google Workspace Permissions Guide</h3>
                                    <p>To allow this script to read your Google Groups, you must grant it access in Google Workspace. Follow these steps:</p>
                                    
                                    <div className="space-y-3">
                                        <h4 className="font-medium text-blue-300">Step 1: Create a Google Group</h4>
                                        <ul className="list-disc list-inside ml-4 space-y-1">
                                            <li>Go to the **Google Workspace Admin Console** (admin.google.com).</li>
                                            <li>Navigate to **Directory** -&gt; **Groups** and create a new group (e.g., <code>license-automation@yourdomain.com</code>).</li>
                                            <li><strong>Important:</strong> In the group settings, make sure to enable <strong>Allow external members</strong>.</li>
                                        </ul>

                                        <h4 className="font-medium text-blue-300">Step 2: Add the Service Account to the Group</h4>
                                        <ul className="list-disc list-inside ml-4 space-y-1">
                                            <li>Add the following service account email as a member of your new group:</li>
                                            <li className="list-none ml-4"><code className="bg-gray-700 px-1 rounded">{`license-grouper-sa@${config.projectId || 'my-project-123456'}.iam.gserviceaccount.com`}</code></li>
                                            <li>(Workspace will consider it an external member, which is why Step 1 is required).</li>
                                        </ul>

                                        <h4 className="font-medium text-blue-300">Step 3: Grant the Role to the Group</h4>
                                        <ul className="list-disc list-inside ml-4 space-y-1">
                                            <li>In the Workspace Admin Console, navigate to **Account** -&gt; **Admin roles**.</li>
                                            <li>Find or create the **Groups Reader** role.</li>
                                            <li>Assign that role to the **Group** you created in Step 1 (not the service account directly).</li>
                                        </ul>
                                    </div>
                                    
                                    <p className="text-xs text-gray-500 mt-4">This workaround allows the service account to inherit the necessary directory permissions without requiring Organization-level IAM changes or private key files.</p>
                                </div>
                            ) : (
                                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                                    {activeTab === 'deploy' ? deploySh : activeTab === 'main' ? mainPy : requirementsTxt}
                                </pre>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default GroupLicenseDeploymentModal;
