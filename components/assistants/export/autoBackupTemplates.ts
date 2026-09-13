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

import { Config } from '../../../types';

export const generatePythonScript = (
  config: Config,
  datasetId: string,
  baseTableId: string,
): string => `import functions_framework
import json
import traceback
import urllib.request
import urllib.error
from datetime import datetime
import google.auth
import google.auth.transport.requests

@functions_framework.http
def auto_backup_metrics(request):
    try:
        credentials, project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        
        PROJECT_ID = "${config.projectId}"
        LOCATION = "${config.appLocation}"
        COLLECTION_ID = "${config.collectionId}"
        APP_ID = "${config.appId}"
        DATASET_ID = "${datasetId || 'YOUR_DATASET_ID'}"
        BASE_TABLE_ID = "${baseTableId || 'metrics_backup'}"
        
        current_date = datetime.utcnow()
        table_id = f"{BASE_TABLE_ID}_{current_date.strftime('%Y_%m')}"
        
        base_url = f"https://{LOCATION}-discoveryengine.googleapis.com" if LOCATION != "global" else "https://discoveryengine.googleapis.com"
        url = f"{base_url}/v1alpha/projects/{PROJECT_ID}/locations/{LOCATION}/collections/{COLLECTION_ID}/engines/{APP_ID}/analytics:exportMetrics"
        
        payload = {
            "outputConfig": {
                "bigqueryDestination": {
                    "datasetId": DATASET_ID,
                    "tableId": table_id
                }
            }
        }
        
        req = urllib.request.Request(
            url, 
            data=json.dumps(payload).encode('utf-8'),
            headers={
                "Authorization": f"Bearer {credentials.token}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            return (f"Export initiated to {DATASET_ID}.{table_id}. Operation: {result.get('name')}", 200)

    except urllib.error.HTTPError as e:
        error_msg = e.read().decode()
        return (f"HTTPError: {e.code} {e.reason}: {error_msg}", 500)
    except Exception as e:
        return (f"Exception: {str(e)}\\n{traceback.format_exc()}", 500)
`;

export const generateRequirementsTxt = (): string => `functions-framework==3.*
google-auth==2.*
requests==2.*`;

export const generateDeploySh = (backupDay: number): string => `#!/bin/bash
set -e
echo "Deploying Auto-Backup Cloud Function to \${REGION}..."
gcloud functions deploy auto-backup-metrics \\
  --runtime python311 \\
  --trigger-http \\
  --entry-point auto_backup_metrics \\
  --region \${REGION} \\
  --project \${PROJECT_ID} \\
  --source .

COMPUTE_SA="\${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "Granting invoker role to Compute Engine default Service Account: \${COMPUTE_SA}"

gcloud functions add-iam-policy-binding auto-backup-metrics \\
  --region \${REGION} \\
  --project \${PROJECT_ID} \\
  --member="serviceAccount:\${COMPUTE_SA}" \\
  --role="roles/cloudfunctions.invoker" || true

gcloud run services add-iam-policy-binding auto-backup-metrics \\
  --region \${REGION} \\
  --project \${PROJECT_ID} \\
  --member="serviceAccount:\${COMPUTE_SA}" \\
  --role="roles/run.invoker" || true

echo "Creating Cloud Scheduler Job..."
if gcloud scheduler jobs describe trigger-auto-backup --location \${REGION} --project \${PROJECT_ID} > /dev/null 2>&1; then
  echo "Job exists. Updating..."
  gcloud scheduler jobs update http trigger-auto-backup \\
    --location \${REGION} \\
    --project \${PROJECT_ID} \\
    --schedule="0 0 ${backupDay} * *" \\
    --uri="https://\${REGION}-\${PROJECT_ID}.cloudfunctions.net/auto-backup-metrics" \\
    --http-method=POST \\
    --oidc-service-account-email=\${COMPUTE_SA}
else
  gcloud scheduler jobs create http trigger-auto-backup \\
    --location \${REGION} \\
    --project \${PROJECT_ID} \\
    --schedule="0 0 ${backupDay} * *" \\
    --uri="https://\${REGION}-\${PROJECT_ID}.cloudfunctions.net/auto-backup-metrics" \\
    --http-method=POST \\
    --oidc-service-account-email=\${COMPUTE_SA}
fi
echo "Done."
`;

export const generateCloudbuildYaml = (
  cfLocation: string,
  projectId: string,
  backupDay: number,
): string => `steps:
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - gcloud
      - functions
      - deploy
      - auto-backup-metrics
      - --runtime=python311
      - --trigger-http
      - --entry-point=auto_backup_metrics
      - --region=${cfLocation}
      - --project=${projectId}
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - gcloud
      - scheduler
      - jobs
      - create
      - http
      - trigger-auto-backup
      - --schedule=0 0 ${backupDay} * *
      - --uri=https://${cfLocation}-${projectId}.cloudfunctions.net/auto-backup-metrics
      - --http-method=POST
      - --location=${cfLocation}
      - --project=${projectId}
options:
  logging: CLOUD_LOGGING_ONLY`;

export const generateDeployCommand = (
  deployMethod: 'gcloud' | 'cloud-build',
  cfLocation: string,
  projectId: string,
  backupDay: number,
): string => {
  return deployMethod === 'cloud-build'
    ? `gcloud builds submit . --config cloudbuild.yaml --project ${projectId}`
    : `gcloud functions deploy auto-backup-metrics \\
  --runtime python311 \\
  --trigger-http \\
  --entry-point auto_backup_metrics \\
  --region ${cfLocation} \\
  --project ${projectId}

gcloud scheduler jobs create http trigger-auto-backup \\
  --schedule "0 0 ${backupDay} * *" \\
  --uri "https://${cfLocation}-${projectId}.cloudfunctions.net/auto-backup-metrics" \\
  --http-method POST \\
  --location ${cfLocation} \\
  --project ${projectId}`;
};

export const generateGrantPermissionsCommand = (
  projectId: string,
  projectNumber: string,
): string => {
  const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
  return `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/resourcemanager.projectIamAdmin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/cloudfunctions.developer"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/cloudscheduler.admin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountUser"`;
};
