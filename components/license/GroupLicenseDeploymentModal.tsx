import React, { useState, useEffect } from 'react';
import { Config, GcsBucket } from '../../types';
import * as api from '../../services/apiService';
import mainPyTemplate from './main.py.template?raw';

declare var JSZip: any;

interface GroupLicenseDeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectNumber: string;
  currentConfig: { appLocation: string; userStoreId: string; };
  apiLicenseConfigs: any[];
  editConfig?: any;
  onBuildTriggered?: (buildId: string) => void;
}

const generateMainPy = () => {
    return mainPyTemplate;
};

const generateDeploySh = (
    projectId: string, 
    location: string, 
    userStoreId: string, 
    region: string,
    configGcsUri: string,
    selectedTier: string,
    impersonatedUser: string,
    projectNumber: string
) => {
    let content = "set -e\n";
    content += "PROJECT_ID=\"" + projectId + "\"\n";
    content += "REGION=\"" + region + "\"\n";
    content += "CONFIG_GCS_URI=\"" + configGcsUri + "\"\n";
    content += "SERVICE_NAME_ADDER=\"group-licensing-adder-" + location + "\"\n";
    content += "SERVICE_NAME_CLEANUP=\"group-licensing-cleanup-" + location + "\"\n";
    content += "JOB_NAME_ADDER=\"trigger-group-licensing-adder-" + location + "\"\n";
    content += "JOB_NAME_CLEANUP=\"trigger-group-licensing-cleanup-" + location + "\"\n";
    content += "LOCATION=\"" + location + "\"\n";
    content += "USER_STORE_ID=\"" + userStoreId + "\"\n";
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
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/discoveryengine.admin\" --condition=None\n";
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/logging.logWriter\" --condition=None\n";
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/storage.objectViewer\" --condition=None\n";

    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/serviceusage.serviceUsageConsumer\" --condition=None\n\n";
    
    content += "echo \"Deploying Cloud Run Service (Adder): $SERVICE_NAME_ADDER...\"\n";
    content += "gcloud run deploy $SERVICE_NAME_ADDER \\\n";
    content += "    --source . \\\n";
    content += "    --project $PROJECT_ID \\\n";
    content += "    --region $REGION \\\n";
    content += "    --no-allow-unauthenticated \\\n";
    content += "    --service-account $SA_EMAIL \\\n";
    content += "    --labels=\"ge-region=" + location + ",ge-sku=" + selectedTier + ",job-type=adder\" \\\n";
    content += "    --set-env-vars=\"GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$LOCATION,USER_STORE_ID=$USER_STORE_ID,CONFIG_GCS_URI=" + configGcsUri + ",JOB_TYPE=adder,PROJECT_NUMBER=" + projectNumber + "\"\n\n";
    
    content += "IMAGE_URI=$(gcloud run services describe $SERVICE_NAME_ADDER --project $PROJECT_ID --region $REGION --format='value(spec.template.spec.containers[0].image)')\n\n";
    content += "echo \"Deploying Cloud Run Service (Cleanup) using image $IMAGE_URI...\"\n";
    content += "gcloud run deploy $SERVICE_NAME_CLEANUP \\\n";
    content += "    --image $IMAGE_URI \\\n";
    content += "    --project $PROJECT_ID \\\n";
    content += "    --region $REGION \\\n";
    content += "    --no-allow-unauthenticated \\\n";
    content += "    --service-account $SA_EMAIL \\\n";
    content += "    --labels=\"ge-region=" + location + ",ge-sku=" + selectedTier + ",job-type=cleanup\" \\\n";
    content += "    --set-env-vars=\"GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$LOCATION,USER_STORE_ID=$USER_STORE_ID,CONFIG_GCS_URI=" + configGcsUri + ",JOB_TYPE=cleanup,PROJECT_NUMBER=" + projectNumber + "\"\n\n";
    
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
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "else\n";
    content += "    gcloud scheduler jobs create http $JOB_NAME_ADDER \\\n";
    content += "        --location $REGION \\\n";
    content += "        --project $PROJECT_ID \\\n";
    content += "        --schedule=\"0 4 * * *\" \\\n";
    content += "        --uri=\"$SERVICE_URL_ADDER\" \\\n";
    content += "        --http-method=POST \\\n";
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
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "else\n";
    content += "    gcloud scheduler jobs create http $JOB_NAME_CLEANUP \\\n";
    content += "        --location $REGION \\\n";
    content += "        --project $PROJECT_ID \\\n";
    content += "        --schedule=\"0 */6 * * *\" \\\n";
    content += "        --uri=\"$SERVICE_URL_CLEANUP\" \\\n";
    content += "        --http-method=POST \\\n";
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "fi\n\n";
    
    content += "echo \"✅ Deployment Complete!\"\n";
    return content;
};

const GroupLicenseDeploymentModal: React.FC<GroupLicenseDeploymentModalProps> = ({ isOpen, onClose, projectNumber, currentConfig, apiLicenseConfigs, editConfig, onBuildTriggered }) => {
    const [config, setConfig] = useState({
        projectId: projectNumber,
        runRegion: 'us-central1',
        appLocation: currentConfig.appLocation || 'global',
        userStoreId: currentConfig.userStoreId || 'default_user_store',
        secretName: 'group-licensing-config'
    });
    
    const [groupsInput, setGroupsInput] = useState('');
    const [selectedTier, setSelectedTier] = useState(() => {
        if (apiLicenseConfigs.length > 0) {
            const name = apiLicenseConfigs[0].name;
            return name.split('/').pop() || 'SUBSCRIPTION_TIER_ENTERPRISE';
        }
        return 'SUBSCRIPTION_TIER_ENTERPRISE';
    });
    
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [appLocation, setAppLocation] = useState(currentConfig.appLocation || 'global');
    const [modalLicenseConfigs, setModalLicenseConfigs] = useState<any[]>(apiLicenseConfigs);
    const [isLoadingLicenses, setIsLoadingLicenses] = useState(false);
    const [activeTab, setActiveTab] = useState<'deploy' | 'main' | 'requirements' | 'permissions'>('deploy');
    const [copySuccess, setCopySuccess] = useState('');
    const [isResolvingId, setIsResolvingId] = useState(false);

    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<string>('');
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);
    
    useEffect(() => {
        if (isOpen) {
            if (editConfig) {
                const projects = editConfig.projects || {};
                const projConfig = projects[config.projectId] || [];
                if (projConfig.length > 0) {
                    const ent = projConfig[0];
                    setSelectedTier(ent.subscription_tier || 'SUBSCRIPTION_TIER_ENTERPRISE');
                    setGroupsInput((ent.groups || []).join(', '));
                    setAppLocation(ent.location || 'global');
                }
            }
            setConfig(prev => ({
                ...prev,
                appLocation: currentConfig.appLocation || 'global',
                userStoreId: currentConfig.userStoreId || 'default_user_store'
            }));
            
            if (projectNumber) {
                setIsResolvingId(true);
                api.getProject(projectNumber)
                    .then(details => {
                        if (details.projectId) {
                            setConfig(prev => ({ ...prev, projectId: details.projectId }));
                        }
                    })
                    .catch(err => console.warn("Failed to auto-resolve project ID:", err))
                    .finally(() => setIsResolvingId(false));
            }
        }
    }, [isOpen, currentConfig, projectNumber, config.projectId, editConfig]);

    useEffect(() => {
        const fetchConfigs = async () => {
            setIsLoadingLicenses(true);
            try {
                const configForApi: Config = {
                    projectId: config.projectId,
                    appLocation: appLocation,
                    collectionId: '', appId: '', assistantId: ''
                } as any;
                const res = await api.listLicenseConfigs(configForApi);
                const activeConfigs = (res.licenseConfigs || []).filter((cfg: any) => cfg.state === 'ACTIVE');
                setModalLicenseConfigs(activeConfigs);
                
                if (activeConfigs.length > 0) {
                    setSelectedTier(activeConfigs[0].name.split('/').pop() || 'SUBSCRIPTION_TIER_ENTERPRISE');
                } else {
                    setSelectedTier('SUBSCRIPTION_TIER_ENTERPRISE');
                }
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
    }, [isOpen, appLocation, config.projectId]);

    useEffect(() => {
        if (!isOpen || !config.projectId) return;
        
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
    }, [isOpen, config.projectId]);

    const handleCopy = (content: string) => {
        navigator.clipboard.writeText(content).then(() => {
            setCopySuccess('Copied!');
            setTimeout(() => setCopySuccess(''), 2000);
        });
    };

    const groups = groupsInput.split(',').map(g => g.trim()).filter(Boolean);
    const entitlementsConfig = {
        "billing_account_id": "YOUR_BILLING_ACCOUNT_ID",
        "projects": {
            [config.projectId]: [
                {
                    "subscription_tier": selectedTier,
                    "location": appLocation,
                    "groups": groups
                }
            ]
        }
    };
    const configJson = JSON.stringify(entitlementsConfig);
    const configGcsUri = "gs://" + selectedBucket + "/config/entitlements.json";

    const mainPy = generateMainPy();
    const deploySh = generateDeploySh(
        config.projectId, 
        appLocation, 
        config.userStoreId, 
        config.runRegion,
        configGcsUri,
        selectedTier,
        "",
        projectNumber
    );
    const requirementsTxt = "Flask==3.0.0\ngunicorn==22.0.0\ngoogle-auth>=2.22.0\nrequests>=2.31.0";
    const dockerfile = "FROM python:3.10-slim\nENV PYTHONUNBUFFERED True\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nCMD [\"gunicorn\", \"--bind\", \"0.0.0.0:8080\", \"--workers\", \"1\", \"--threads\", \"8\", \"--timeout\", \"0\", \"main:app\"]";

    const handleDownload = async () => {
        const zip = new JSZip();
        zip.file('main.py', mainPy);
        zip.file('deploy.sh', deploySh);
        zip.file('requirements.txt', requirementsTxt);
        zip.file('Dockerfile', dockerfile);
        
        // Generate a sample entitlements.json based on inputs
        const groups = groupsInput.split(',').map(g => g.trim()).filter(Boolean);
        const sampleEntitlements = {
            "billing_account_id": "YOUR_BILLING_ACCOUNT_ID",
            "projects": {
                [config.projectId]: [
                    {
                        "subscription_tier": selectedTier,
                        "location": config.appLocation,
                        "groups": groups
                    }
                ]
            }
        };
        zip.file('entitlements.json.sample', JSON.stringify(sampleEntitlements, null, 2));

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
            const configBlob = new Blob([configJson], { type: 'application/json' });
            const configFile = new File([configBlob], "entitlements.json", { type: "application/json" });
            await api.uploadFileToGcs(selectedBucket, "config/entitlements.json", configFile, config.projectId);

            const zip = new JSZip();
            zip.file('main.py', mainPy);
            zip.file('deploy.sh', deploySh);
            zip.file('requirements.txt', requirementsTxt);
            zip.file('Dockerfile', dockerfile);
            
            const blob = await zip.generateAsync({ type: 'blob' });
            const file = new File([blob], "source.zip", { type: "application/zip" });
            const sourceObjectName = "source/group-licensing-" + Date.now() + ".zip";

            await api.uploadFileToGcs(selectedBucket, sourceObjectName, file, config.projectId);

            const buildConfig = {
                source: {
                    storageSource: {
                        bucket: selectedBucket,
                        object: sourceObjectName
                    }
                },
                steps: [
                    {
                        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                        entrypoint: 'bash',
                        args: ['deploy.sh'],
                        env: ["GOOGLE_CLOUD_PROJECT=" + config.projectId]
                    }
                ],
                timeout: "600s"
            };

            const buildOp = await api.createCloudBuild(config.projectId, buildConfig);
            const buildId = buildOp.metadata?.build?.id;

            if (onBuildTriggered && buildId) {
                onBuildTriggered(buildId);
            }
            
            onClose();

        } catch (err: any) {
            setDeployError(err.message || "Failed to trigger Cloud Build.");
        } finally {
            setIsDeploying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Setup Group Licensing Job</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isDeploying}>&times;</button>
                </header>
                
                <main className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
                    {/* Left Config */}
                    <div className="space-y-4">
                        <div className="bg-blue-900/30 border border-blue-700 p-3 rounded-md text-sm text-blue-200 space-y-2">
                            <p>This tool generates a deployment package to run the group licensing logic on Google Cloud Run Services.</p>
                            <p><strong>Note:</strong> The deployment script will attempt to create a service account named <code>license-grouper-sa</code>. If your organization requires service accounts to be created via an external process, please create it manually with the following roles: <code>Discovery Engine Admin</code>, <code>Logs Writer</code>, and <code>Storage Object Viewer</code> (on the GCS bucket used).</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Project ID (String) {isResolvingId && <span className="animate-pulse">...</span>}</label>
                            <input type="text" value={config.projectId} onChange={(e) => setConfig({...config, projectId: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" placeholder="my-project-id" disabled={isDeploying} />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm font-medium text-gray-400">Run Region</label>
                                <select value={config.runRegion} onChange={(e) => setConfig({...config, runRegion: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isDeploying}>
                                    <option>us-central1</option><option>us-east1</option><option>europe-west1</option><option>asia-east1</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Secret Name</label>
                                <input type="text" value={config.secretName} onChange={(e) => setConfig({...config, secretName: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" placeholder="group-licensing-config" disabled={isDeploying} />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">App Location / Region</label>
                            <select value={appLocation} onChange={(e) => setAppLocation(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white mb-3" disabled={isDeploying}>
                                <option value="global">global</option>
                                <option value="us">us</option>
                                <option value="eu">eu</option>
                            </select>
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
                        
                        <div>
                            <button 
                                onClick={() => setShowAdvanced(!showAdvanced)} 
                                className="text-sm font-semibold text-gray-400 hover:text-white flex items-center mb-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className={"h-4 w-4 mr-1 transition-transform " + (showAdvanced ? 'rotate-90' : '')} viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                                Advanced Settings
                            </button>
                            {showAdvanced && (
                                <div className="bg-gray-700/30 p-3 rounded-md border border-gray-600 space-y-3">
                                     <p className="text-xs text-gray-400">You will need to manually create the secret in Secret Manager with the name specified above and the configuration JSON as content.</p>
                                </div>
                            )}
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

                        {deployError && <p className="text-red-400 text-sm">{deployError}</p>}

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
                                            <li className="list-none ml-4"><code className="bg-gray-700 px-1 rounded">license-grouper-sa@ancient-sandbox-322523.iam.gserviceaccount.com</code></li>
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
