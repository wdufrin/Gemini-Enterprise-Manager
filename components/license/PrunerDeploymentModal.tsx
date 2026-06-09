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
import { Config, GcsBucket } from '../../types';
import * as api from '../../services/apiService';

declare var JSZip: any;

interface PrunerDeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectNumber: string;
  currentConfig: { appLocation: string; userStoreId: string; };
  onBuildTriggered?: (buildId: string) => void;
}

const generateMainPy = (pruneDays: number, location: string, userStoreId: string) => `
import os
import json
import time
import traceback
import hashlib
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify
import google.auth
from google.auth.transport.requests import AuthorizedSession

print("Container starting...") 

app = Flask(__name__)

# Configuration defaults
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT")
LOCATION = os.environ.get("LOCATION", "${location}") 
USER_STORE_ID = os.environ.get("USER_STORE_ID", "${userStoreId}")
PRUNE_DAYS = int(os.environ.get("PRUNE_DAYS", ${pruneDays}))

def list_all_licenses(session, base_url, parent):
    """Helper to fetch all licenses with pagination"""
    all_licenses = []
    next_page_token = None
    
    while True:
        list_url = f"{base_url}/{parent}/userLicenses?pageSize=1000"
        if next_page_token:
            list_url += f"&pageToken={next_page_token}"
        
        resp = session.get(list_url)
        
        if resp.status_code != 200:
            raise Exception(f"Failed to list licenses: {resp.text}")
            
        data = resp.json()
        licenses_page = data.get("userLicenses", [])
        all_licenses.extend(licenses_page)
        
        next_page_token = data.get("nextPageToken")
        if not next_page_token:
            break
    return all_licenses

@app.route("/", methods=["POST"])
def prune_licenses():
    print(f"Starting prune job. Project: {PROJECT_ID}, Location: {LOCATION}, Store: {USER_STORE_ID}, Days: {PRUNE_DAYS}")
    
    if not PROJECT_ID:
        print("ERROR: GOOGLE_CLOUD_PROJECT environment variable is missing.")
        return jsonify({"status": "error", "message": "GOOGLE_CLOUD_PROJECT environment variable is missing."}), 500

    try:
        # 1. Setup Authenticated Session
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        credentials, project = google.auth.default(scopes=scopes)
        authed_session = AuthorizedSession(credentials)
        authed_session.headers.update({"X-Goog-User-Project": str(PROJECT_ID)})
        
        # Base URLs - Using v1
        v1_base = "https://discoveryengine.googleapis.com/v1"
        if LOCATION != "global":
            v1_base = f"https://{LOCATION}-discoveryengine.googleapis.com/v1"
            
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}/userStores/{USER_STORE_ID}"
        print(f"Scanning licenses in: {parent}")

        # 2. List ALL licenses
        try:
            all_licenses = list_all_licenses(authed_session, v1_base, parent)
        except Exception as e:
            print(str(e))
            return jsonify({"status": "error", "message": str(e)}), 500
        
        print(f"Total licenses found in store: {len(all_licenses)}")
        
        if not all_licenses:
            return jsonify({"status": "success", "message": "Store is empty"}), 200

        # 3. Identify Inactive Users
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=PRUNE_DAYS)
        licenses_to_delete = []
        
        for lic in all_licenses:
            user_principal = lic.get("userPrincipal")
            last_login = lic.get("lastLoginTime")
            resource_name = lic.get("name")
            
            if not user_principal:
                continue

            should_prune = False
            
            if last_login:
                try:
                    # Robust parsing for Google API timestamps
                    dt_str = last_login.replace('Z', '+00:00')
                    if '.' in dt_str:
                        head, tail = dt_str.split('.', 1)
                        if '+' in tail:
                            frac, tz = tail.split('+', 1)
                            dt_str = f"{head}.{frac[:6]}+{tz}"
                        elif '-' in tail: 
                             frac, tz = tail.split('-', 1)
                             dt_str = f"{head}.{frac[:6]}-{tz}"
                        else:
                             dt_str = f"{head}.{tail[:6]}"

                    login_dt = datetime.fromisoformat(dt_str)
                    
                    if login_dt < cutoff_date:
                        print(f"Marking for prune: {user_principal} (Last login: {last_login})")
                        should_prune = True
                    else:
                        print(f"Keeping: {user_principal} (Last login: {last_login})")
                except ValueError as ve:
                    print(f"Warning: Could not parse date for {user_principal}. Keeping.")
            else:
                print(f"Keeping: {user_principal} (No last login time)")
            
            if should_prune:
                licenses_to_delete.append({
                    "userPrincipal": user_principal,
                    "name": resource_name
                })

        if not licenses_to_delete:
            print("No inactive licenses found.")
            return jsonify({
                "status": "success",
                "message": "No inactive licenses found.",
                "deleted_count": 0
            }), 200

        print(f"Found {len(licenses_to_delete)} inactive licenses to delete.")

        # 4. Perform Batch Update (Replicating Frontend Logic)
        # Using batchUpdateUserLicenses allows us to update the state of multiple users at once.
        # By sending the list of users to prune with empty license configs (implied by updateMask),
        # we effectively revoke their licenses.
        
        batch_url = f"{v1_base}/{parent}:batchUpdateUserLicenses"
        
        inactive_principals = [item["userPrincipal"] for item in licenses_to_delete]
        
        payload = {
            "inlineSource": {
                "userLicenses": [{"userPrincipal": p} for p in inactive_principals],
                "updateMask": {
                    "paths": ["userPrincipal", "licenseConfig"]
                }
            },
            # WARNING: This parameter is set to match the frontend application behavior.
            "deleteUnassignedUserLicenses": True 
        }
        
        print(f"Sending batch update to {batch_url}...")
        
        resp = authed_session.post(batch_url, json=payload)
        
        if resp.status_code != 200:
            print(f"❌ Batch update failed: {resp.status_code} - {resp.text}")
            return jsonify({
                "status": "error", 
                "message": f"Batch update failed with status {resp.status_code}", 
                "details": resp.text
            }), 500
            
        print(f"✅ Batch update request successful. Response: {resp.text}")
        
        return jsonify({
            "status": "success",
            "message": f"Pruning initiated for {len(inactive_principals)} users via batch update.",
            "count": len(inactive_principals),
            "operation": resp.json().get("name")
        }), 200

    except Exception as e:
        print(f"FATAL ERROR: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e), "trace": traceback.format_exc()}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
`;

const generateDeploySh = (
    projectId: string, 
    location: string, 
    userStoreId: string, 
    days: number, 
    region: string, 
    customSaEmail?: string, 
    skipProjectIam: boolean = false
) => {
    let saSetupBlock = '';
    if (customSaEmail) {
        saSetupBlock = `
# Using manually configured Service Account
SA_EMAIL="${customSaEmail}"
echo "Using provided Service Account: $SA_EMAIL"
`;
    } else {
        saSetupBlock = `
# 1. Setup Service Account
echo "Checking if Service Account \${SA_NAME} exists..."
FOUND_SA_EMAIL=$(gcloud iam service-accounts list --project "$PROJECT_ID" --filter="email:\${SA_NAME}@" --format="value(email)" | head -n 1)

if [ -n "$FOUND_SA_EMAIL" ]; then
  echo "✅ Service Account found: $FOUND_SA_EMAIL. Skipping creation."
  SA_EMAIL=$FOUND_SA_EMAIL
else
  echo "Creating Service Account \${SA_NAME}..."
  gcloud iam service-accounts create $SA_NAME --project $PROJECT_ID --display-name "License Pruner Service Account"
  
  echo "Waiting 30s for Service Account propagation..."
  sleep 30
  
  SA_EMAIL=$(gcloud iam service-accounts list --project "$PROJECT_ID" --filter="email:\${SA_NAME}@" --format="value(email)" | head -n 1)
fi

if [ -z "$SA_EMAIL" ]; then
  echo "⚠️  Could not dynamically resolve SA email. Constructing it manually..."
  SA_EMAIL="\${SA_NAME}@\${PROJECT_ID}.iam.gserviceaccount.com"
fi
echo "Using Service Account Email: $SA_EMAIL"
`;
    }

    let iamBlock = '';
    if (skipProjectIam && customSaEmail) {
        iamBlock = `
echo "Skipping project-level IAM bindings (verified in UI)..."
`;
    } else {
        iamBlock = `
# 3. Grant Permissions
echo "Granting IAM permissions..."

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/discoveryengine.admin" --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/logging.logWriter" --condition=None

# Grant Service Usage Consumer role to allow quota attribution via X-Goog-User-Project header
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/serviceusage.serviceUsageConsumer" --condition=None

echo "Waiting 30s for IAM policy propagation..."
sleep 30
`;
    }

    return `
#!/bin/bash
set -e

# Configuration
PROJECT_ID="${projectId}"
REGION="${region}" # Cloud Run Region
SA_NAME="license-pruner-sa"

# App Config
APP_LOCATION="${location}" # Discovery Engine Location
USER_STORE_ID="${userStoreId}"
PRUNE_DAYS="${days}"

# Namespaced Resources
SERVICE_NAME="prune-licenses-\${APP_LOCATION}"
JOB_NAME="prune-licenses-\${APP_LOCATION}-daily"

# --- Pre-flight Check ---
if [[ "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  echo "⚠️  WARNING: PROJECT_ID '$PROJECT_ID' appears to be a Project Number."
  echo "   'gcloud run deploy' requires the Project ID string (e.g., 'my-project-id')."
  echo "   The script will proceed, but it may fail."
  echo ""
fi

${saSetupBlock}

${iamBlock}

# 4. Deploy Cloud Run Service
echo "Deploying Cloud Run Service: $SERVICE_NAME..."
# Explicitly set GOOGLE_CLOUD_PROJECT to ensure the python script can access it reliably
gcloud run deploy $SERVICE_NAME \
    --source . \
    --project $PROJECT_ID \
    --region $REGION \
    --service-account $SA_EMAIL \
    --no-allow-unauthenticated \
    --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$APP_LOCATION,USER_STORE_ID=$USER_STORE_ID,PRUNE_DAYS=$PRUNE_DAYS"

# 5. Grant Invoker Permission
echo "Granting Invoker permission to Service Account..."
gcloud run services add-iam-policy-binding $SERVICE_NAME \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/run.invoker" \
    --region $REGION \
    --project $PROJECT_ID

# 6. Create Cloud Scheduler Job
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --project $PROJECT_ID --region $REGION --format='value(status.url)')

echo "Creating/Updating Cloud Scheduler Job: $JOB_NAME targeting $SERVICE_URL..."

if gcloud scheduler jobs describe $JOB_NAME --location $REGION --project $PROJECT_ID > /dev/null 2>&1; then
    gcloud scheduler jobs update http $JOB_NAME \
        --location $REGION \
        --project $PROJECT_ID \
        --schedule="0 3 * * *" \
        --uri="$SERVICE_URL" \
        --http-method=POST \
        --oidc-service-account-email=$SA_EMAIL
else
    gcloud scheduler jobs create http $JOB_NAME \
        --location $REGION \
        --project $PROJECT_ID \
        --schedule="0 3 * * *" \
        --uri="$SERVICE_URL" \
        --http-method=POST \
        --oidc-service-account-email=$SA_EMAIL
fi

echo "✅ Deployment Complete!"
echo "You can manually trigger the job via:"
echo "gcloud scheduler jobs run $JOB_NAME --location $REGION --project $PROJECT_ID"
`;
};

const PrunerDeploymentModal: React.FC<PrunerDeploymentModalProps> = ({ isOpen, onClose, projectNumber, currentConfig, onBuildTriggered }) => {
    const [config, setConfig] = useState({
        projectId: projectNumber, // Actually needs String ID for gcloud, usually
        runRegion: 'us-central1',
        appLocation: currentConfig.appLocation || 'global',
        userStoreId: currentConfig.userStoreId || 'default_user_store',
        pruneDays: 30 as number | ''
    });
    
    // Advanced State
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [customSaEmail, setCustomSaEmail] = useState('');
    const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
    const [permissionCheckResult, setPermissionCheckResult] = useState<{ status: 'success' | 'error' | null, message: string }>({ status: null, message: '' });
    const [skipIamInScript, setSkipIamInScript] = useState(false);
    
    const [activeTab, setActiveTab] = useState<'deploy' | 'main' | 'requirements'>('deploy');
    const [copySuccess, setCopySuccess] = useState('');
    const [isResolvingId, setIsResolvingId] = useState(false);

    // GCS & Deployment State
    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<string>('');
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);
    
    // Safety check for permissions
    const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(true);
    const [hasGrantedPermissions, setHasGrantedPermissions] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setConfig(prev => ({
                ...prev,
                appLocation: currentConfig.appLocation || 'global',
                userStoreId: currentConfig.userStoreId || 'default_user_store'
            }));
            
            // Try to resolve Project Number to Project ID string automatically
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
    }, [isOpen, currentConfig, projectNumber]);

    // Fetch Buckets when Project ID is available
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
    
    const handleCheckPermissions = async () => {
        if (!customSaEmail || !config.projectId) return;
        setIsCheckingPermissions(true);
        setPermissionCheckResult({ status: null, message: '' });
        setSkipIamInScript(false);

        const REQUIRED_ROLES = [
            'roles/discoveryengine.admin',
            'roles/logging.logWriter',
            'roles/serviceusage.serviceUsageConsumer'
        ];

        try {
            const result = await api.checkServiceAccountPermissions(config.projectId, customSaEmail, REQUIRED_ROLES);
            if (result.hasAll) {
                setPermissionCheckResult({ status: 'success', message: 'All required permissions are present.' });
                setSkipIamInScript(true);
            } else {
                setPermissionCheckResult({ 
                    status: 'error', 
                    message: `Missing roles: ${result.missing.join(', ')}. The deployment script will attempt to grant them.` 
                });
                setSkipIamInScript(false);
            }
        } catch (err: any) {
            setPermissionCheckResult({ status: 'error', message: `Check failed: ${err.message}` });
            setSkipIamInScript(false);
        } finally {
            setIsCheckingPermissions(false);
        }
    };

    const pruneDaysVal = typeof config.pruneDays === 'number' ? config.pruneDays : 30;
    const mainPy = generateMainPy(pruneDaysVal, config.appLocation, config.userStoreId);
    const deploySh = generateDeploySh(
        config.projectId, 
        config.appLocation, 
        config.userStoreId, 
        pruneDaysVal, 
        config.runRegion, 
        customSaEmail.trim() || undefined,
        skipIamInScript
    );
    const requirementsTxt = `Flask==3.0.0\ngunicorn==22.0.0\ngoogle-auth>=2.22.0\nrequests>=2.31.0`;
    const dockerfile = `FROM python:3.10-slim\nENV PYTHONUNBUFFERED True\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nCMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "main:app"]`;

    const handleDownload = async () => {
        const zip = new JSZip();
        zip.file('main.py', mainPy);
        zip.file('deploy.sh', deploySh);
        zip.file('requirements.txt', requirementsTxt);
        zip.file('Dockerfile', dockerfile);
        zip.file('README.md', '# License Pruner\n\nRun `./deploy.sh` to deploy to Cloud Run and schedule the job.');

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `license-pruner-source.zip`;
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
            // 1. Prepare Zip
            const zip = new JSZip();
            zip.file('main.py', mainPy);
            zip.file('deploy.sh', deploySh);
            zip.file('requirements.txt', requirementsTxt);
            zip.file('Dockerfile', dockerfile);
            
            const blob = await zip.generateAsync({ type: 'blob' });
            const file = new File([blob], "source.zip", { type: "application/zip" });
            const sourceObjectName = `source/license-pruner-${Date.now()}.zip`;

            // 2. Upload to GCS
            await api.uploadFileToGcs(selectedBucket, sourceObjectName, file, config.projectId);

            // 3. Trigger Cloud Build
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
                        env: [`GOOGLE_CLOUD_PROJECT=${config.projectId}`]
                    }
                ],
                timeout: "600s"
            };

            const buildOp = await api.createCloudBuild(config.projectId, buildConfig);
            const buildId = buildOp.metadata?.build?.id;

            if (onBuildTriggered && buildId) {
                onBuildTriggered(buildId);
            }
            
            // Close modal after successful trigger
            onClose();

        } catch (err: any) {
            setDeployError(err.message || "Failed to trigger Cloud Build.");
        } finally {
            setIsDeploying(false);
        }
    };

    const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
    const grantPermissionsCommand = `gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/resourcemanager.projectIamAdmin"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountAdmin"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/cloudscheduler.admin"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${config.projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/serviceusage.serviceUsageConsumer"`;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Setup Automated Pruner</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isDeploying}>&times;</button>
                </header>
                
                <main className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
                    {/* Left Config */}
                    <div className="space-y-4">
                        <div className="bg-blue-900/30 border border-blue-700 p-3 rounded-md text-sm text-blue-200">
                            This tool generates a deployment package to run the pruning logic on Google Cloud Run, scheduled via Cloud Scheduler. 
                            <br/><br/>
                            <strong>Note:</strong> The deployment is specific to the selected location (<strong>{config.appLocation}</strong>). To prune multiple regions, run this setup for each location.
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Project ID (String) {isResolvingId && <span className="animate-pulse">...</span>}</label>
                            <input type="text" value={config.projectId} onChange={(e) => setConfig({...config, projectId: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" placeholder="my-project-id" disabled={isDeploying} />
                            {/^\d+$/.test(config.projectId) && <p className="text-xs text-yellow-400 mt-1">Warning: Enter the string Project ID (e.g., 'my-app'), not the number, for gcloud scripts.</p>}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm font-medium text-gray-400">Run Region</label>
                                <select value={config.runRegion} onChange={(e) => setConfig({...config, runRegion: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isDeploying}>
                                    <option>us-central1</option><option>us-east1</option><option>europe-west1</option><option>asia-east1</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Prune After (Days)</label>
                                <input 
                                    type="number" 
                                    value={config.pruneDays} 
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setConfig({...config, pruneDays: val === '' ? '' : Math.max(1, parseInt(val, 10) || 1)});
                                    }} 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" 
                                    disabled={isDeploying} 
                                    min="1"
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-400">User Store ID</label>
                            <input type="text" value={config.userStoreId} onChange={(e) => setConfig({...config, userStoreId: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isDeploying} />
                        </div>
                        
                        {/* Advanced Settings */}
                        <div>
                            <button 
                                onClick={() => setShowAdvanced(!showAdvanced)} 
                                className="text-sm font-semibold text-gray-400 hover:text-white flex items-center mb-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                                Advanced Settings
                            </button>
                            {showAdvanced && (
                                <div className="bg-gray-700/30 p-3 rounded-md border border-gray-600 space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Use Existing Service Account Email</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                value={customSaEmail} 
                                                onChange={(e) => setCustomSaEmail(e.target.value)} 
                                                placeholder="my-sa@project.iam.gserviceaccount.com"
                                                className="w-full bg-gray-700 border border-gray-500 rounded-md p-1.5 text-xs text-white" 
                                                disabled={isDeploying}
                                            />
                                            <button 
                                                onClick={handleCheckPermissions}
                                                disabled={isCheckingPermissions || !customSaEmail || isDeploying}
                                                className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                                            >
                                                {isCheckingPermissions ? 'Checking...' : 'Check Permissions'}
                                            </button>
                                        </div>
                                        {permissionCheckResult.status && (
                                            <p className={`text-xs mt-1 ${permissionCheckResult.status === 'success' ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {permissionCheckResult.message}
                                            </p>
                                        )}
                                        <p className="text-[10px] text-gray-500 mt-1">If specified, the script will use this SA instead of creating a new one.</p>
                                    </div>
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

                        {/* Permissions Warning */}
                        <div className="bg-orange-900/30 border border-orange-700 p-4 rounded-md">
                            <button 
                                onClick={() => setIsPermissionsExpanded(!isPermissionsExpanded)}
                                className="flex items-center justify-between w-full text-left"
                            >
                                <span className="text-sm font-bold text-orange-200 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    REQUIRED: Grant Cloud Build Permissions
                                </span>
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-orange-200 transition-transform ${isPermissionsExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                            {isPermissionsExpanded && (
                                <div className="mt-3">
                                    <p className="text-xs text-orange-100 mb-2">
                                        The Cloud Build service account (<code>{cloudBuildSa}</code>) does not have permission to create Scheduler jobs or Cloud Run services by default.
                                    </p>
                                    <p className="text-xs text-orange-100 mb-2 font-semibold">
                                        You MUST run these commands in your Cloud Shell or local terminal before deploying, otherwise the build will fail with PERMISSION_DENIED.
                                    </p>
                                    <div className="bg-black/50 p-2 rounded border border-orange-800 relative group">
                                            <pre className="text-[10px] text-orange-50 whitespace-pre-wrap font-mono">
                                            {grantPermissionsCommand}
                                        </pre>
                                        <button
                                            onClick={() => handleCopy(grantPermissionsCommand)}
                                            className="absolute top-2 right-2 px-2 py-1 bg-orange-900/80 hover:bg-orange-800 text-orange-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                    <div className="mt-3 flex items-start gap-2">
                                        <input 
                                            type="checkbox" 
                                            id="confirm-perms"
                                            checked={hasGrantedPermissions} 
                                            onChange={(e) => setHasGrantedPermissions(e.target.checked)}
                                            className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 shrink-0"
                                        />
                                        <label htmlFor="confirm-perms" className="text-xs text-gray-300 cursor-pointer select-none">
                                            I have run the above commands to grant the necessary permissions.
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>

                        {deployError && <p className="text-red-400 text-sm">{deployError}</p>}

                        <div className="flex gap-4 pt-2">
                            <button 
                                onClick={handleCloudBuildDeploy} 
                                disabled={isDeploying || !selectedBucket || !hasGrantedPermissions}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeploying ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                        Deploying...
                                    </>
                                ) : 'Deploy with Cloud Build'}
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
                            <button onClick={() => setActiveTab('deploy')} className={`px-4 py-2 text-xs font-medium ${activeTab === 'deploy' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>deploy.sh</button>
                            <button onClick={() => setActiveTab('main')} className={`px-4 py-2 text-xs font-medium ${activeTab === 'main' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>main.py</button>
                            <button onClick={() => setActiveTab('requirements')} className={`px-4 py-2 text-xs font-medium ${activeTab === 'requirements' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>requirements.txt</button>
                            <div className="flex-1"></div>
                            <button onClick={() => handleCopy(activeTab === 'deploy' ? deploySh : activeTab === 'main' ? mainPy : requirementsTxt)} className="px-3 text-xs text-blue-400 hover:text-white">{copySuccess || 'Copy'}</button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                                {activeTab === 'deploy' ? deploySh : activeTab === 'main' ? mainPy : requirementsTxt}
                            </pre>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default PrunerDeploymentModal;
