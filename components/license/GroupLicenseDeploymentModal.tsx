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
  onConfigSaved?: () => void;
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
    content += "# Grant Discovery Engine Editor permission (lists/updates user licenses, reads license configs and\n";
    content += "# seat usage, and polls batch-update operations).\n";
    content += "# Security Tip: In production, create and assign a custom IAM role containing only\n";
    content += "# 'discoveryengine.userStores.listUserLicenses', 'discoveryengine.userStores.batchUpdateUserLicenses',\n";
    content += "# 'discoveryengine.licenseConfigs.get' and 'discoveryengine.operations.get' instead.\n";
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/discoveryengine.editor\" --condition=None\n";
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/logging.logWriter\" --condition=None\n";
    if (bucketName) {
        content += "gcloud storage buckets add-iam-policy-binding gs://" + bucketName + " --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/storage.objectViewer\"\n";
    }
    content += "gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:$SA_EMAIL\" --role=\"roles/serviceusage.serviceUsageConsumer\" --condition=None\n\n";

    // One instance handling one request at a time, so two runs can never overlap; 30-minute request timeout.
    const runServiceFlags =
        "    --timeout=1800 \\\n" +
        "    --max-instances=1 \\\n" +
        "    --concurrency=1 \\\n";
    // Cleanup safety thresholds read by main.py; change them on the cleanup service to allow larger revocations.
    const cleanupSafetyEnvVars = ",MAX_REVOCATION_PERCENT=5,MIN_REVOCATION_ALLOWANCE=50";
    // 1800s is the Cloud Scheduler maximum for HTTP targets and matches the Cloud Run timeout. Runs are
    // idempotent, so a failed attempt is retried twice, at least 10 minutes apart.
    const schedulerRetryFlags =
        "        --attempt-deadline=1800s \\\n" +
        "        --max-retry-attempts=2 \\\n" +
        "        --min-backoff=600s \\\n";

    content += "echo \"Deploying Cloud Run Service (Adder): $SERVICE_NAME_ADDER...\"\n";
    content += "gcloud run deploy $SERVICE_NAME_ADDER \\\n";
    content += "    --source . \\\n";
    content += "    --project $PROJECT_ID \\\n";
    content += "    --region $REGION \\\n";
    content += "    --no-allow-unauthenticated \\\n";
    content += "    --service-account $SA_EMAIL \\\n";
    content += runServiceFlags;
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
    content += runServiceFlags;
    content += "    --labels=\"ge-region=" + trimmedLocation + ",ge-sku=" + safeSkuLabel + ",job-type=cleanup\" \\\n";
    content += "    --set-env-vars=\"GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$LOCATION,USER_STORE_ID=$USER_STORE_ID,CONFIG_GCS_URI=" + trimmedConfigGcsUri + ",SUBSCRIPTION_TIER=" + trimmedTier + ",JOB_TYPE=cleanup,PROJECT_NUMBER=" + trimmedProjectNumber + cleanupSafetyEnvVars + "\"\n\n";
    
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
    content += schedulerRetryFlags;
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "else\n";
    content += "    gcloud scheduler jobs create http $JOB_NAME_ADDER \\\n";
    content += "        --location $REGION \\\n";
    content += "        --project $PROJECT_ID \\\n";
    content += "        --schedule=\"0 4 * * *\" \\\n";
    content += "        --uri=\"$SERVICE_URL_ADDER\" \\\n";
    content += "        --http-method=POST \\\n";
    content += schedulerRetryFlags;
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
    content += schedulerRetryFlags;
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "else\n";
    content += "    gcloud scheduler jobs create http $JOB_NAME_CLEANUP \\\n";
    content += "        --location $REGION \\\n";
    content += "        --project $PROJECT_ID \\\n";
    content += "        --schedule=\"0 */6 * * *\" \\\n";
    content += "        --uri=\"$SERVICE_URL_CLEANUP\" \\\n";
    content += "        --http-method=POST \\\n";
    content += schedulerRetryFlags;
    content += "        --oidc-service-account-email=$SA_EMAIL\n";
    content += "fi\n\n";
    
    content += "echo \"✅ Deployment Complete!\"\n";
    return content;
};

export const generateManualSetupMarkdown = (params: {
    projectId: string;
    projectNumber: string;
    location: string;
    userStoreId: string;
    region: string;
    configGcsUri: string;
    selectedTier: string;
}) => {
    const projectId = params.projectId.trim() || 'YOUR_PROJECT_ID';
    const projectNumber = params.projectNumber.trim() || 'YOUR_PROJECT_NUMBER';
    const location = params.location.trim() || 'global';
    const userStoreId = params.userStoreId.trim() || 'default_user_store';
    const region = params.region.trim() || 'us-central1';
    const configGcsUri = params.configGcsUri.trim() || 'gs://YOUR_BUCKET/config/entitlements.json';
    const selectedTier = params.selectedTier.trim() || 'SUBSCRIPTION_TIER_ENTERPRISE';
    const safeSkuLabel = sanitizeCloudRunLabelValue(selectedTier);
    const bucketName = configGcsUri.replace(/^gs:\/\//i, '').split('/')[0] || 'YOUR_BUCKET';
    const saEmail = `license-grouper-sa@${projectId}.iam.gserviceaccount.com`;
    const adderService = `group-licensing-adder-${location}`;
    const cleanupService = `group-licensing-cleanup-${location}`;
    const adderJob = `trigger-group-licensing-adder-${location}`;
    const cleanupJob = `trigger-group-licensing-cleanup-${location}`;

    return `# Manual Group Licensing Setup Guide (No Cloud Build Required)

Use this step-by-step guide when your organization restricts **Cloud Build** or when you prefer to configure everything directly in the **Google Cloud Console** or via **gcloud CLI / local Docker**.

---

## Step 1: Download the Package & Upload \`entitlements.json\` to Cloud Storage

1. Click **Download .zip** to download \`group-licensing-source.zip\` and unzip it locally:
   - \`main.py\` — Group licensing Adder & Cleanup Flask/Cloud Run function
   - \`requirements.txt\` — Python dependencies (\`Flask\`, \`gunicorn\`, \`functions-framework\`, \`google-auth\`, \`requests\`)
   - \`Dockerfile\` — Container build definition (for Docker / CLI deployment)
   - \`entitlements.json\` — Group-to-Subscription Tier mapping
   - \`deploy.sh\` — Automated CLI deployment script
2. Upload \`entitlements.json\` to your GCS bucket at \`${configGcsUri}\`:
   - **Option A (In this Modal):** Click **Update Groups in GCS** to upload \`config/entitlements.json\` directly from your browser.
   - **Option B (Google Cloud Console):** Open **Cloud Storage > Buckets > \`${bucketName}\`**, create or open the \`config/\` folder, and upload \`entitlements.json\`.
   - **Option C (gcloud CLI):**
\`\`\`bash
gcloud storage cp entitlements.json ${configGcsUri} --project="${projectId}"
\`\`\`

---

## Step 2: Create the Service Account & Grant IAM + Google Workspace Permissions

### 2A. Google Cloud IAM Setup
Create a service account named \`license-grouper-sa\` (\`${saEmail}\`) and grant it minimum required roles:

- **Google Cloud Console:**
  1. Go to **IAM & Admin > Service Accounts > + Create Service Account**.
  2. Set **Service account ID** to \`license-grouper-sa\` and click **Create and Continue**.
  3. Grant the following **Project roles**:
     - \`Discovery Engine Editor\` (\`roles/discoveryengine.editor\`)
     - \`Logs Writer\` (\`roles/logging.logWriter\`)
     - \`Service Usage Consumer\` (\`roles/serviceusage.serviceUsageConsumer\`)
  4. Go to **Cloud Storage > Buckets > \`${bucketName}\` > Permissions > + Grant Access**:
     - Principal: \`${saEmail}\`
     - Role: \`Storage Object Viewer\` (\`roles/storage.objectViewer\`)

- **Or via gcloud CLI:**
\`\`\`bash
PROJECT_ID="${projectId}"
SA_EMAIL="${saEmail}"

gcloud iam service-accounts create license-grouper-sa \\
  --project "$PROJECT_ID" \\
  --display-name "License Grouper Service Account"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \\
  --member="serviceAccount:$SA_EMAIL" --role="roles/discoveryengine.editor" --condition=None
gcloud projects add-iam-policy-binding "$PROJECT_ID" \\
  --member="serviceAccount:$SA_EMAIL" --role="roles/logging.logWriter" --condition=None
gcloud projects add-iam-policy-binding "$PROJECT_ID" \\
  --member="serviceAccount:$SA_EMAIL" --role="roles/serviceusage.serviceUsageConsumer" --condition=None
gcloud storage buckets add-iam-policy-binding "gs://${bucketName}" \\
  --member="serviceAccount:$SA_EMAIL" --role="roles/storage.objectViewer"
\`\`\`

### 2B. Google Workspace Directory Reader Setup (Required to List Group Members)
1. Open the **Google Workspace Admin Console** (\`admin.google.com\`) > **Directory > Groups**.
2. Create an administrative group (e.g., \`license-automation@yourdomain.com\`) and enable **Allow external members** in Group Settings.
3. Add \`${saEmail}\` as a **Member** of that group.
4. Go to **Account > Admin roles > Groups Reader** and assign the **Groups Reader** role to the group created in Step 2.

---

## Step 3: Deploy the Two Cloud Run Functions / Services (\`adder\` & \`cleanup\`)

Choose **Option 3A (Google Cloud Console Inline Function Editor)** OR **Option 3B (Local Docker + CLI without Cloud Build)**:

### Option 3A: Google Cloud Console (Inline Function Editor — "Write a function")
1. Open **Cloud Run** in the Google Cloud Console (\`console.cloud.google.com/run\`) and click **Write a function**.
2. Configure the **Adder** function with these exact settings:
   - **Service name:** \`${adderService}\` *(must start with \`group-licensing-\` so Gemini Enterprise Manager discovers it)*
   - **Region:** \`${region}\`
   - **Runtime:** \`Python 3.11\` (or \`Python 3.12\`)
   - **Authentication:** Select **Require authentication**
   - Expand **Container(s), Volumes, Networking, Security**:
     - **General > Request timeout:** \`1800\` seconds
     - **Scaling > Maximum number of instances:** \`1\` (and **Maximum concurrent requests per instance:** \`1\`)
     - **Security > Service account:** \`${saEmail}\`
     - **Labels** (optional but recommended):
       - \`ge-region\` = \`${location}\`
       - \`ge-sku\` = \`${safeSkuLabel}\`
       - \`job-type\` = \`adder\`
     - **Variables & Secrets > Environment Variables:**
       - \`GOOGLE_CLOUD_PROJECT\` = \`${projectId}\`
       - \`PROJECT_NUMBER\` = \`${projectNumber}\`
       - \`LOCATION\` = \`${location}\`
       - \`USER_STORE_ID\` = \`${userStoreId}\`
       - \`CONFIG_GCS_URI\` = \`${configGcsUri}\`
       - \`SUBSCRIPTION_TIER\` = \`${selectedTier}\`
       - \`JOB_TYPE\` = \`adder\`
3. Click **Create** to open the inline code editor:
   - Set **Function entry point** to: \`handle_trigger\`
   - Paste the contents of \`main.py\` into \`main.py\`.
   - Paste the contents of \`requirements.txt\` into \`requirements.txt\`.
   - Click **Save and redeploy**.
4. Repeat Steps 1–3 to create the **Cleanup (Revoker)** function:
   - **Service name:** \`${cleanupService}\`
   - Use the exact same settings and code, except change:
     - Environment variable \`JOB_TYPE\` = \`cleanup\`
     - Environment variable \`MAX_REVOCATION_PERCENT\` = \`5\`
     - Environment variable \`MIN_REVOCATION_ALLOWANCE\` = \`50\`
     - Label \`job-type\` = \`cleanup\`
5. **Grant Cloud Run Invoker (\`roles/run.invoker\`):**
   - In Cloud Run, select \`${adderService}\` and \`${cleanupService}\` > **Security / Permissions > + Grant Access**:
   - Add principal \`${saEmail}\` with role **Cloud Run Invoker** (\`roles/run.invoker\`).

---

### Option 3B: Local Docker + gcloud CLI (Zero Cloud Build Required)
If \`gcloud run deploy --source .\` is blocked because Cloud Build is disabled in your project, build and push the container image locally using Docker and Artifact Registry:

\`\`\`bash
unzip group-licensing-source.zip -d group-licensing && cd group-licensing

PROJECT_ID="${projectId}"
PROJECT_NUMBER="${projectNumber}"
REGION="${region}"
LOCATION="${location}"
USER_STORE_ID="${userStoreId}"
CONFIG_GCS_URI="${configGcsUri}"
SUBSCRIPTION_TIER="${selectedTier}"
SA_EMAIL="${saEmail}"

# 1. Create an Artifact Registry Docker repository (once) & authenticate Docker
gcloud artifacts repositories create group-licensing-repo \\
  --repository-format=docker --location="$REGION" --project="$PROJECT_ID" || true
gcloud auth configure-docker "$REGION-docker.pkg.dev"

# 2. Build & push container locally (bypasses Cloud Build completely)
IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/group-licensing-repo/group-licensing:latest"
docker build -t "$IMAGE_URI" .
docker push "$IMAGE_URI"

# 3. Deploy Adder Service from pre-built image
gcloud run deploy "${adderService}" \\
  --image="$IMAGE_URI" \\
  --project="$PROJECT_ID" \\
  --region="$REGION" \\
  --no-allow-unauthenticated \\
  --service-account="$SA_EMAIL" \\
  --timeout=1800 --max-instances=1 --concurrency=1 \\
  --labels="ge-region=$LOCATION,ge-sku=${safeSkuLabel},job-type=adder" \\
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$LOCATION,USER_STORE_ID=$USER_STORE_ID,CONFIG_GCS_URI=$CONFIG_GCS_URI,SUBSCRIPTION_TIER=$SUBSCRIPTION_TIER,JOB_TYPE=adder,PROJECT_NUMBER=$PROJECT_NUMBER"

# 4. Deploy Cleanup Service from pre-built image
gcloud run deploy "${cleanupService}" \\
  --image="$IMAGE_URI" \\
  --project="$PROJECT_ID" \\
  --region="$REGION" \\
  --no-allow-unauthenticated \\
  --service-account="$SA_EMAIL" \\
  --timeout=1800 --max-instances=1 --concurrency=1 \\
  --labels="ge-region=$LOCATION,ge-sku=${safeSkuLabel},job-type=cleanup" \\
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$LOCATION,USER_STORE_ID=$USER_STORE_ID,CONFIG_GCS_URI=$CONFIG_GCS_URI,SUBSCRIPTION_TIER=$SUBSCRIPTION_TIER,JOB_TYPE=cleanup,PROJECT_NUMBER=$PROJECT_NUMBER,MAX_REVOCATION_PERCENT=5,MIN_REVOCATION_ALLOWANCE=50"

# 5. Grant Cloud Run Invoker permission to the service account
gcloud run services add-iam-policy-binding "${adderService}" \\
  --member="serviceAccount:$SA_EMAIL" --role="roles/run.invoker" --region="$REGION" --project="$PROJECT_ID"
gcloud run services add-iam-policy-binding "${cleanupService}" \\
  --member="serviceAccount:$SA_EMAIL" --role="roles/run.invoker" --region="$REGION" --project="$PROJECT_ID"
\`\`\`

---

## Step 4: Create Cloud Scheduler Jobs (Console or CLI)

### 4A. In Google Cloud Console (\`console.cloud.google.com/cloudscheduler\`)
1. Click **Create Job** for the **Adder** schedule:
   - **Name:** \`${adderJob}\`
   - **Region:** \`${region}\`
   - **Frequency:** \`0 4 * * *\` *(daily at 4:00 AM)*
   - **Target type:** \`HTTP\`
   - **URL:** Copy the Cloud Run URL of \`${adderService}\`
   - **HTTP method:** \`POST\`
   - **Auth header:** Select \`Add OIDC token\`
   - **Service account:** \`${saEmail}\`
   - **Attempt deadline:** \`1800s\` *(Max retry attempts: \`2\`, Min backoff: \`600s\`)*
2. Click **Create Job** for the **Cleanup** schedule:
   - **Name:** \`${cleanupJob}\`
   - **Region:** \`${region}\`
   - **Frequency:** \`0 */6 * * *\` *(every 6 hours)*
   - **Target type:** \`HTTP\`, **HTTP method:** \`POST\`, **URL:** Cloud Run URL of \`${cleanupService}\`
   - **Auth header:** \`Add OIDC token\` with \`${saEmail}\`, **Attempt deadline:** \`1800s\`

### 4B. Or via gcloud CLI
\`\`\`bash
SERVICE_URL_ADDER=$(gcloud run services describe "${adderService}" --project "${projectId}" --region "${region}" --format='value(status.url)')
SERVICE_URL_CLEANUP=$(gcloud run services describe "${cleanupService}" --project "${projectId}" --region "${region}" --format='value(status.url)')

gcloud scheduler jobs create http "${adderJob}" \\
  --location="${region}" --project="${projectId}" \\
  --schedule="0 4 * * *" --uri="$SERVICE_URL_ADDER" --http-method=POST \\
  --attempt-deadline=1800s --max-retry-attempts=2 --min-backoff=600s \\
  --oidc-service-account-email="${saEmail}"

gcloud scheduler jobs create http "${cleanupJob}" \\
  --location="${region}" --project="${projectId}" \\
  --schedule="0 */6 * * *" --uri="$SERVICE_URL_CLEANUP" --http-method=POST \\
  --attempt-deadline=1800s --max-retry-attempts=2 --min-backoff=600s \\
  --oidc-service-account-email="${saEmail}"
\`\`\`

---

## Step 5: Test & Verify in Gemini Enterprise Manager
- Return to **Gemini Enterprise Manager > Licenses > Group License Assignments**: both \`${adderService}\` and \`${cleanupService}\` will automatically appear in the table.
- Click **Run** to trigger an immediate sync, and click **Report** to inspect resolved group member counts, assigned/revoked user principals, and safety guard checks.
- **Dry-Run Preview:** To preview changes without modifying licenses, send \`{"dryRun": true}\` in the HTTP POST body when testing in Cloud Run.`;
};

const GroupLicenseDeploymentModal: React.FC<GroupLicenseDeploymentModalProps> = ({ isOpen, onClose, projectNumber, currentConfig, apiLicenseConfigs, editConfig, onBuildTriggered, onConfigSaved }) => {
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
    const [activeTab, setActiveTab] = useState<'manual-guide' | 'deploy' | 'entitlements' | 'main' | 'requirements' | 'permissions'>('manual-guide');
    const [copySuccess, setCopySuccess] = useState('');
    const [isResolvingId, setIsResolvingId] = useState(false);

    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<string>('');
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);

    useModalA11y({
        isOpen,
        onClose,
        containerRef,
        preventClose: isDeploying || isSavingConfig,
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

    const buildEntitlementsConfig = (
        baseProjects: Record<string, Array<{ subscription_tier?: string; groups?: string[]; location?: string }>>,
        billingAccountId: string = resolvedBillingAccountId
    ) => {
        const targetProjectKey = config.projectId.trim();
        const combinedExisting = [
            ...(baseProjects[targetProjectKey] || []),
            ...(effectiveProjectNumber && effectiveProjectNumber !== targetProjectKey
                ? (baseProjects[effectiveProjectNumber] || [])
                : []),
        ];
        const seenOtherLocKeys = new Set<string>();
        const otherLocationEntries = combinedExisting.filter((entry) => {
            const entryLoc = entry.location || 'global';
            if (entryLoc === appLocation) {
                return false;
            }
            const dedupeKey = `${entryLoc}::${(entry.subscription_tier || '').trim()}`;
            if (seenOtherLocKeys.has(dedupeKey)) {
                return false;
            }
            seenOtherLocKeys.add(dedupeKey);
            return true;
        });

        const cleanProjectEntries = [
            ...otherLocationEntries,
            {
                "subscription_tier": selectedTier.trim(),
                "location": appLocation,
                "groups": groups
            }
        ];

        const updatedProjects: Record<string, Array<{ subscription_tier?: string; groups?: string[]; location?: string }>> = {
            ...baseProjects,
            [targetProjectKey]: cleanProjectEntries,
        };
        // Keep numeric projectNumber key in sync with the exact same clean entries if present in baseProjects
        if (effectiveProjectNumber && effectiveProjectNumber !== targetProjectKey && baseProjects[effectiveProjectNumber]) {
            updatedProjects[effectiveProjectNumber] = cleanProjectEntries;
        }
        return {
            "billing_account_id": billingAccountId,
            "projects": updatedProjects
        };
    };

    const entitlementsConfig = buildEntitlementsConfig(editConfig?.projects || {});
    const entitlementsJson = JSON.stringify(entitlementsConfig, null, 2);
    const configGcsUri = "gs://" + (selectedBucket.trim() || "YOUR_BUCKET") + "/config/entitlements.json";

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
    const requirementsTxt = "Flask==3.0.0\ngunicorn==22.0.0\nfunctions-framework>=3.5.0\ngoogle-auth>=2.22.0\nrequests>=2.31.0";
    const dockerfile = "FROM python:3.11-slim\nENV PYTHONUNBUFFERED True\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nCMD [\"gunicorn\", \"--bind\", \"0.0.0.0:8080\", \"--workers\", \"1\", \"--threads\", \"8\", \"--timeout\", \"0\", \"main:app\"]";
    const manualSetupMd = generateManualSetupMarkdown({
        projectId: config.projectId,
        projectNumber: effectiveProjectNumber,
        location: appLocation,
        userStoreId: config.userStoreId,
        region: config.runRegion,
        configGcsUri,
        selectedTier,
    });

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

        const validConfigGcsUri = assertValidBucketPath(
            "gs://" + selectedBucket.trim() + "/config/entitlements.json",
            'Config GCS URI'
        );

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

    const loadMergedEntitlementsJson = async (validProjectId: string): Promise<string> => {
        let baseProjects = editConfig?.projects || {};
        let billingAccountId = resolvedBillingAccountId;
        if (!editConfig) {
            try {
                const existingRaw = await api.getGcsObjectContent(
                    selectedBucket.trim(),
                    "config/entitlements.json",
                    validProjectId
                );
                if (existingRaw) {
                    const parsed = JSON.parse(existingRaw);
                    if (parsed && typeof parsed.projects === 'object' && parsed.projects !== null) {
                        baseProjects = parsed.projects;
                    }
                    if (parsed && typeof parsed.billing_account_id === 'string' && parsed.billing_account_id.trim()) {
                        billingAccountId = parsed.billing_account_id.trim();
                    }
                }
            } catch {
                // Object does not exist yet in GCS on first deployment; safe to start fresh.
            }
        }
        const mergedEntitlements = buildEntitlementsConfig(baseProjects, billingAccountId);
        return JSON.stringify(mergedEntitlements, null, 2);
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
        const validatedManualGuide = generateManualSetupMarkdown({
            projectId: validated.validProjectId,
            projectNumber: validated.validProjectNumber,
            location: validated.validAppLocation,
            userStoreId: validated.validUserStoreId,
            region: validated.validRunRegion,
            configGcsUri: validated.validConfigGcsUri,
            selectedTier: validated.validSelectedTier,
        });

        const zip = new JSZip();
        zip.file('main.py', mainPy);
        zip.file('deploy.sh', validatedDeploySh);
        zip.file('requirements.txt', requirementsTxt);
        zip.file('Dockerfile', dockerfile);
        zip.file('entitlements.json', entitlementsJson);
        zip.file('entitlements.json.sample', entitlementsJson);
        zip.file('README-MANUAL-SETUP.md', validatedManualGuide);

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "group-licensing-source.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleSaveConfigOnly = async () => {
        if (!selectedBucket) {
            setDeployError("Please select a bucket for staging.");
            return;
        }
        setIsSavingConfig(true);
        setDeployError(null);

        try {
            const validated = validateDeploymentInputs();
            const mergedConfigJson = await loadMergedEntitlementsJson(validated.validProjectId);
            const configBlob = new Blob([mergedConfigJson], { type: 'application/json' });
            const configFile = new File([configBlob], "entitlements.json", { type: "application/json" });
            await api.uploadFileToGcs(selectedBucket.trim(), "config/entitlements.json", configFile, validated.validProjectId);
            onConfigSaved?.();
            onClose();
        } catch (err: unknown) {
            setDeployError(toErrorMessage(err, "Failed to update entitlements.json in GCS."));
        } finally {
            setIsSavingConfig(false);
        }
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
            const mergedConfigJson = await loadMergedEntitlementsJson(validated.validProjectId);

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
            onConfigSaved?.();
            onClose();

        } catch (err: unknown) {
            setDeployError(toErrorMessage(err, "Failed to trigger Cloud Build."));
        } finally {
            setIsDeploying(false);
        }
    };

    const isBusy = isDeploying || isSavingConfig;

    const activePreviewContent =
        activeTab === 'manual-guide'
            ? manualSetupMd
            : activeTab === 'deploy'
              ? deploySh
              : activeTab === 'entitlements'
                ? entitlementsJson
                : activeTab === 'main'
                  ? mainPy
                  : requirementsTxt;

    if (!isOpen) return null;

    const saEmailDisplay = `license-grouper-sa@${config.projectId || 'my-project-123456'}.iam.gserviceaccount.com`;
    const adderServiceName = `group-licensing-adder-${appLocation}`;
    const cleanupServiceName = `group-licensing-cleanup-${appLocation}`;
    const safeSkuLabelDisplay = sanitizeCloudRunLabelValue(selectedTier);

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-licensing-modal-title"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isBusy) onClose();
            }}
        >
            <div
                ref={containerRef}
                tabIndex={-1}
                className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 id="group-licensing-modal-title" className="text-xl font-bold text-white">Setup Group Licensing Job</h2>
                    <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-white" disabled={isBusy}>&times;</button>
                </header>
                
                <main className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto">
                    {/* Left Config */}
                    <div className="space-y-4 lg:col-span-5">
                        <div className="bg-blue-900/30 border border-blue-700 p-3 rounded-md text-sm text-blue-200 space-y-2">
                            <p>This tool generates a deployment package to run the group licensing logic on Google Cloud Run Functions / Services.</p>
                            <p><strong>Can&apos;t use Cloud Build?</strong> Fill out the fields below, click <strong>Download .zip</strong>, and follow the step-by-step <button type="button" onClick={() => setActiveTab('manual-guide')} className="underline font-semibold text-blue-300 hover:text-white">Manual Setup Guide (Console &amp; CLI)</button> on the right.</p>
                            <p><strong>Safety:</strong> The cleanup job makes no changes if a configured group returns 0 members or if it would revoke more than 50 licenses or 5% of managed licenses, whichever is larger (adjust with <code>MIN_REVOCATION_ALLOWANCE</code> / <code>MAX_REVOCATION_PERCENT</code> on the cleanup service). POST <code>{`{"dryRun": true}`}</code> to either service to preview changes without applying them.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Project ID (String) {isResolvingId && <span className="animate-pulse">...</span>}</label>
                            <input type="text" value={config.projectId} onChange={(e) => setConfig({...config, projectId: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" placeholder="my-project-id" disabled={isBusy} />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm font-medium text-gray-400">Run Region</label>
                                <select value={config.runRegion} onChange={(e) => setConfig({...config, runRegion: e.target.value})} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isBusy}>
                                    <option value="us-central1">us-central1</option>
                                    <option value="us-east1">us-east1</option>
                                    <option value="europe-west1">europe-west1</option>
                                    <option value="asia-east1">asia-east1</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">App Location / Region</label>
                                <select value={appLocation} onChange={(e) => setAppLocation(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isBusy}>
                                    <option value="global">global</option>
                                    <option value="us">us</option>
                                    <option value="eu">eu</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Subscription Tier / SKU {isLoadingLicenses && <span className="animate-pulse text-xs text-blue-400"> (Loading...)</span>}</label>
                            <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" disabled={isBusy || isLoadingLicenses}>
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
                            <input type="text" value={groupsInput} onChange={(e) => setGroupsInput(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white" placeholder="group1@example.com, group2@example.com" disabled={isBusy} />
                        </div>

                        <div className="pt-4 border-t border-gray-700">
                            <h3 className="text-sm font-semibold text-white mb-1">Cloud Storage Bucket (for <code>config/entitlements.json</code>)</h3>
                            <p className="text-xs text-gray-400 mb-2">Used to store <code>config/entitlements.json</code> (and for staging if using Cloud Build).</p>
                            <div className="flex gap-2">
                                <select 
                                    value={selectedBucket} 
                                    onChange={(e) => setSelectedBucket(e.target.value)} 
                                    className="w-full bg-gray-700 border-gray-600 rounded-md p-2 text-sm text-white"
                                    disabled={isLoadingBuckets || isBusy}
                                >
                                    {buckets.length === 0 && <option value="">{isLoadingBuckets ? 'Loading...' : 'No buckets found'}</option>}
                                    {buckets.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {deployError && <p className="text-red-400 text-sm" role="alert">{deployError}</p>}

                        <div className="flex flex-wrap gap-3 pt-2">
                            <button 
                                onClick={handleDownload} 
                                disabled={isBusy}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow flex items-center justify-center gap-2 disabled:opacity-50"
                                title="Downloads main.py, requirements.txt, Dockerfile, entitlements.json, deploy.sh, and README-MANUAL-SETUP.md"
                            >
                                Download .zip
                            </button>
                            <button
                                onClick={handleSaveConfigOnly}
                                disabled={isBusy || !selectedBucket}
                                title="Directly updates config/entitlements.json in GCS without rebuilding the Cloud Run container"
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSavingConfig ? 'Saving...' : 'Update Groups in GCS'}
                            </button>
                            <button 
                                onClick={handleCloudBuildDeploy} 
                                disabled={isBusy || !selectedBucket}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeploying ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                        Deploying...
                                    </>
                                ) : 'Deploy Job'}
                            </button>
                        </div>
                    </div>

                    {/* Right Code & Manual Setup Guide */}
                    <div className="flex flex-col h-[560px] bg-gray-900 rounded-lg overflow-hidden border border-gray-700 lg:col-span-7">
                        <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto">
                            <button onClick={() => setActiveTab('manual-guide')} className={"px-3 py-2 text-xs font-semibold whitespace-nowrap " + (activeTab === 'manual-guide' ? 'bg-blue-600 text-white' : 'text-blue-300 hover:text-white')}>Manual Setup Guide</button>
                            <button onClick={() => setActiveTab('deploy')} className={"px-3 py-2 text-xs font-medium whitespace-nowrap " + (activeTab === 'deploy' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>deploy.sh</button>
                            <button onClick={() => setActiveTab('entitlements')} className={"px-3 py-2 text-xs font-medium whitespace-nowrap " + (activeTab === 'entitlements' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>entitlements.json</button>
                            <button onClick={() => setActiveTab('main')} className={"px-3 py-2 text-xs font-medium whitespace-nowrap " + (activeTab === 'main' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>main.py</button>
                            <button onClick={() => setActiveTab('requirements')} className={"px-3 py-2 text-xs font-medium whitespace-nowrap " + (activeTab === 'requirements' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>requirements.txt</button>
                            <button onClick={() => setActiveTab('permissions')} className={"px-3 py-2 text-xs font-medium whitespace-nowrap " + (activeTab === 'permissions' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}>Workspace Permissions</button>
                            <div className="flex-1"></div>
                            <button 
                                onClick={() => handleCopy(activePreviewContent)} 
                                className={"px-3 text-xs text-blue-400 hover:text-white whitespace-nowrap " + (activeTab === 'permissions' ? 'invisible' : '')}
                            >
                                {copySuccess || (activeTab === 'manual-guide' ? 'Copy Guide (.md)' : 'Copy')}
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            {activeTab === 'manual-guide' ? (
                                <div className="text-sm text-gray-300 space-y-5" data-testid="group-licensing-manual-guide">
                                    <div className="border-b border-gray-700 pb-3">
                                        <h3 className="text-base font-bold text-white">Manual Cloud Run Function &amp; CLI Setup (No Cloud Build Required)</h3>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Follow these steps if Cloud Build is disabled or restricted in your environment. All values below automatically reflect the settings on the left.
                                        </p>
                                    </div>

                                    {/* Step 1 */}
                                    <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-3.5 space-y-2">
                                        <h4 className="font-semibold text-blue-300">Step 1: Download the Package &amp; Upload <code>entitlements.json</code></h4>
                                        <ol className="list-decimal list-inside text-xs space-y-1.5 text-gray-300">
                                            <li>Fill out the Project ID, Regions, Subscription Tier, Groups, and Bucket on the left, then click <strong>Download .zip</strong> to get <code>group-licensing-source.zip</code> (contains <code>main.py</code>, <code>requirements.txt</code>, <code>Dockerfile</code>, <code>entitlements.json</code>, <code>deploy.sh</code>, and <code>README-MANUAL-SETUP.md</code>).</li>
                                            <li>Upload <code>entitlements.json</code> to your Cloud Storage bucket at <code className="bg-gray-900 px-1.5 py-0.5 rounded text-blue-200">{configGcsUri}</code>:
                                                <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-gray-400">
                                                    <li><strong>From this modal:</strong> Click <strong>Update Groups in GCS</strong> on the left.</li>
                                                    <li><strong>In Cloud Console:</strong> Go to <strong>Cloud Storage &rarr; Buckets &rarr; {selectedBucket || 'YOUR_BUCKET'}</strong>, create folder <code>config</code>, and upload <code>entitlements.json</code>.</li>
                                                    <li><strong>Via CLI:</strong> <code className="bg-gray-900 px-1 rounded text-gray-200">{`gcloud storage cp entitlements.json ${configGcsUri} --project="${config.projectId || 'YOUR_PROJECT_ID'}"`}</code></li>
                                                </ul>
                                            </li>
                                        </ol>
                                    </div>

                                    {/* Step 2 */}
                                    <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-3.5 space-y-2">
                                        <h4 className="font-semibold text-blue-300">Step 2: Create Service Account &amp; Grant IAM + Workspace Roles</h4>
                                        <ol className="list-decimal list-inside text-xs space-y-1.5 text-gray-300">
                                            <li>In <strong>IAM &amp; Admin &rarr; Service Accounts</strong>, create service account <code className="bg-gray-900 px-1.5 py-0.5 rounded text-emerald-300">{saEmailDisplay}</code>.</li>
                                            <li>Grant it the following <strong>Project IAM roles</strong>:
                                                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-gray-400">
                                                    <li><code>Discovery Engine Editor</code> (<code>roles/discoveryengine.editor</code>)</li>
                                                    <li><code>Logs Writer</code> (<code>roles/logging.logWriter</code>)</li>
                                                    <li><code>Service Usage Consumer</code> (<code>roles/serviceusage.serviceUsageConsumer</code>)</li>
                                                </ul>
                                            </li>
                                            <li>On GCS bucket <code>{selectedBucket || 'YOUR_BUCKET'}</code>, grant <code>{saEmailDisplay}</code> the role <code>Storage Object Viewer</code> (<code>roles/storage.objectViewer</code>).</li>
                                            <li>In <strong>Google Workspace Admin Console</strong> (<code>admin.google.com</code>), grant <code>{saEmailDisplay}</code> the <strong>Groups Reader</strong> admin role via an external-enabled security group (see the <button type="button" onClick={() => setActiveTab('permissions')} className="underline text-blue-400 hover:text-white">Workspace Permissions</button> tab).</li>
                                        </ol>
                                    </div>

                                    {/* Step 3A: Console Inline Function Editor */}
                                    <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-3.5 space-y-2.5">
                                        <h4 className="font-semibold text-blue-300">Step 3A: Create Cloud Run Functions in Google Cloud Console (Inline Editor)</h4>
                                        <p className="text-xs text-gray-400">
                                            Go to <strong>Cloud Run &rarr; Write a function</strong> in the Google Cloud Console to create two functions (one for <strong>Adder</strong> and one for <strong>Cleanup</strong>):
                                        </p>
                                        <ul className="list-disc list-inside text-xs space-y-1 text-gray-300">
                                            <li><strong>Adder Service Name:</strong> <code className="bg-gray-900 px-1.5 py-0.5 rounded text-white">{adderServiceName}</code> &nbsp;|&nbsp; <strong>Cleanup Service Name:</strong> <code className="bg-gray-900 px-1.5 py-0.5 rounded text-white">{cleanupServiceName}</code></li>
                                            <li><strong>Region:</strong> <code>{config.runRegion}</code> &nbsp;|&nbsp; <strong>Runtime:</strong> <code>Python 3.11</code> (or <code>3.12</code>) &nbsp;|&nbsp; <strong>Entry point:</strong> <code className="bg-gray-900 px-1.5 py-0.5 rounded text-amber-300">handle_trigger</code></li>
                                            <li><strong>Authentication:</strong> Select <strong>Require authentication</strong></li>
                                            <li><strong>Container / Scaling / Security:</strong> Request timeout = <code>1800</code> sec, Max instances = <code>1</code>, Max concurrent requests per instance = <code>1</code>, Service account = <code>{saEmailDisplay}</code></li>
                                            <li><strong>Labels:</strong> <code>{`ge-region=${appLocation}`}</code>, <code>{`ge-sku=${safeSkuLabelDisplay}`}</code>, and <code>job-type=adder</code> (or <code>cleanup</code>)</li>
                                        </ul>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-xs border border-gray-700 rounded overflow-hidden">
                                                <thead className="bg-gray-900 text-gray-300">
                                                    <tr>
                                                        <th className="px-2.5 py-1.5 text-left font-semibold">Environment Variable</th>
                                                        <th className="px-2.5 py-1.5 text-left font-semibold">Adder Value</th>
                                                        <th className="px-2.5 py-1.5 text-left font-semibold">Cleanup Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-700 bg-gray-950/60 font-mono text-[11px]">
                                                    <tr><td className="px-2.5 py-1 text-blue-300">GOOGLE_CLOUD_PROJECT</td><td className="px-2.5 py-1" colSpan={2}>{config.projectId || 'YOUR_PROJECT_ID'}</td></tr>
                                                    <tr><td className="px-2.5 py-1 text-blue-300">PROJECT_NUMBER</td><td className="px-2.5 py-1" colSpan={2}>{effectiveProjectNumber || 'YOUR_PROJECT_NUMBER'}</td></tr>
                                                    <tr><td className="px-2.5 py-1 text-blue-300">LOCATION</td><td className="px-2.5 py-1" colSpan={2}>{appLocation}</td></tr>
                                                    <tr><td className="px-2.5 py-1 text-blue-300">USER_STORE_ID</td><td className="px-2.5 py-1" colSpan={2}>{config.userStoreId}</td></tr>
                                                    <tr><td className="px-2.5 py-1 text-blue-300">CONFIG_GCS_URI</td><td className="px-2.5 py-1" colSpan={2}>{configGcsUri}</td></tr>
                                                    <tr><td className="px-2.5 py-1 text-blue-300">SUBSCRIPTION_TIER</td><td className="px-2.5 py-1" colSpan={2}>{selectedTier}</td></tr>
                                                    <tr><td className="px-2.5 py-1 text-amber-300">JOB_TYPE</td><td className="px-2.5 py-1 text-emerald-300">adder</td><td className="px-2.5 py-1 text-amber-300">cleanup</td></tr>
                                                    <tr><td className="px-2.5 py-1 text-gray-400">MAX_REVOCATION_PERCENT</td><td className="px-2.5 py-1 text-gray-500">—</td><td className="px-2.5 py-1">5</td></tr>
                                                    <tr><td className="px-2.5 py-1 text-gray-400">MIN_REVOCATION_ALLOWANCE</td><td className="px-2.5 py-1 text-gray-500">—</td><td className="px-2.5 py-1">50</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <p className="text-xs text-gray-300">
                                            In the inline code editor, paste <code>main.py</code> and <code>requirements.txt</code>, set entry point to <code>handle_trigger</code>, and click <strong>Save and redeploy</strong>. Then open the <strong>Security / Permissions</strong> tab on both services and grant <code>{saEmailDisplay}</code> the <strong>Cloud Run Invoker</strong> (<code>roles/run.invoker</code>) role.
                                        </p>
                                    </div>

                                    {/* Step 3B: CLI / Local Docker */}
                                    <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-3.5 space-y-2">
                                        <h4 className="font-semibold text-blue-300">Step 3B: Or Deploy via CLI / Local Docker (Without Cloud Build)</h4>
                                        <p className="text-xs text-gray-300">
                                            <strong>Option 1 (Standard CLI):</strong> Unzip <code>group-licensing-source.zip</code> and run <code>chmod +x deploy.sh &amp;&amp; ./deploy.sh</code> from your terminal.
                                        </p>
                                        <p className="text-xs text-gray-300">
                                            <strong>Option 2 (Local Docker + Artifact Registry — Zero Cloud Build):</strong> Build the container locally and deploy with <code>--image</code> so Cloud Build is never invoked:
                                        </p>
                                        <pre className="p-2.5 bg-gray-950 border border-gray-700 rounded text-[11px] text-gray-300 font-mono overflow-x-auto whitespace-pre">{`gcloud artifacts repositories create group-licensing-repo \\
  --repository-format=docker --location="${config.runRegion}" --project="${config.projectId || 'YOUR_PROJECT_ID'}" || true
gcloud auth configure-docker "${config.runRegion}-docker.pkg.dev"

IMAGE_URI="${config.runRegion}-docker.pkg.dev/${config.projectId || 'YOUR_PROJECT_ID'}/group-licensing-repo/group-licensing:latest"
docker build -t "$IMAGE_URI" . && docker push "$IMAGE_URI"

gcloud run deploy "${adderServiceName}" --image="$IMAGE_URI" --project="${config.projectId || 'YOUR_PROJECT_ID'}" --region="${config.runRegion}" \\
  --no-allow-unauthenticated --service-account="${saEmailDisplay}" --timeout=1800 --max-instances=1 --concurrency=1 \\
  --labels="ge-region=${appLocation},ge-sku=${safeSkuLabelDisplay},job-type=adder" \\
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${config.projectId || 'YOUR_PROJECT_ID'},LOCATION=${appLocation},USER_STORE_ID=${config.userStoreId},CONFIG_GCS_URI=${configGcsUri},SUBSCRIPTION_TIER=${selectedTier},JOB_TYPE=adder,PROJECT_NUMBER=${effectiveProjectNumber}"

gcloud run deploy "${cleanupServiceName}" --image="$IMAGE_URI" --project="${config.projectId || 'YOUR_PROJECT_ID'}" --region="${config.runRegion}" \\
  --no-allow-unauthenticated --service-account="${saEmailDisplay}" --timeout=1800 --max-instances=1 --concurrency=1 \\
  --labels="ge-region=${appLocation},ge-sku=${safeSkuLabelDisplay},job-type=cleanup" \\
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${config.projectId || 'YOUR_PROJECT_ID'},LOCATION=${appLocation},USER_STORE_ID=${config.userStoreId},CONFIG_GCS_URI=${configGcsUri},SUBSCRIPTION_TIER=${selectedTier},JOB_TYPE=cleanup,PROJECT_NUMBER=${effectiveProjectNumber},MAX_REVOCATION_PERCENT=5,MIN_REVOCATION_ALLOWANCE=50"`}</pre>
                                    </div>

                                    {/* Step 4: Cloud Scheduler */}
                                    <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-3.5 space-y-2">
                                        <h4 className="font-semibold text-blue-300">Step 4: Create Cloud Scheduler HTTP Jobs &amp; Verify</h4>
                                        <p className="text-xs text-gray-300">
                                            In <strong>Cloud Scheduler</strong> (region <code>{config.runRegion}</code>), create two HTTP POST jobs using OIDC authentication with service account <code>{saEmailDisplay}</code> and attempt deadline <code>1800s</code>:
                                        </p>
                                        <ul className="list-disc list-inside text-xs space-y-1 text-gray-300">
                                            <li><code>{`trigger-${adderServiceName}`}</code> &rarr; Schedule: <code>0 4 * * *</code> (daily at 04:00) &rarr; URL of <code>{adderServiceName}</code></li>
                                            <li><code>{`trigger-${cleanupServiceName}`}</code> &rarr; Schedule: <code>0 */6 * * *</code> (every 6 hours) &rarr; URL of <code>{cleanupServiceName}</code></li>
                                        </ul>
                                        <p className="text-xs text-emerald-300">
                                            Once deployed, close this dialog and refresh <strong>Group License Assignments</strong> — your services will appear automatically and can be triggered or inspected via <strong>Run</strong> and <strong>Report</strong>.
                                        </p>
                                    </div>
                                </div>
                            ) : activeTab === 'permissions' ? (
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
                                            <li className="list-none ml-4"><code className="bg-gray-700 px-1 rounded">{saEmailDisplay}</code></li>
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
                                    {activePreviewContent}
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
