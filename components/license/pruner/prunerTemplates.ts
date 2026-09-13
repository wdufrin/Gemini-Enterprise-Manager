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

export const generateMainPy = (
  pruneDays: number,
  location: string,
  userStoreId: string,
): string => `
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
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}/userStores/{USER_STORE_ID}"
        
        print(f"Listing licenses from: {v1_base}/{parent}/userLicenses")
        
        # 2. Fetch all current licenses
        all_licenses = list_all_licenses(authed_session, v1_base, parent)
        print(f"Successfully retrieved {len(all_licenses)} total licenses.")
        
        # 3. Identify Inactive Licenses
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=PRUNE_DAYS)
        print(f"Cutoff Date for Inactivity (Prune if lastLogin < this): {cutoff_date.isoformat()}")
        
        licenses_to_delete = []
        for lic in all_licenses:
            user_principal = lic.get("userPrincipal")
            resource_name = lic.get("name")
            last_login = lic.get("lastLoginTime")
            
            should_prune = False
            if last_login:
                try:
                    clean_login = last_login.rstrip("Z")
                    login_dt = datetime.fromisoformat(clean_login).replace(tzinfo=timezone.utc)
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

        # 4. Perform Batch Update
        batch_url = f"{v1_base}/{parent}:batchUpdateUserLicenses"
        inactive_principals = [item["userPrincipal"] for item in licenses_to_delete]
        
        payload = {
            "inlineSource": {
                "userLicenses": [{"userPrincipal": p} for p in inactive_principals],
                "updateMask": {
                    "paths": ["userPrincipal", "licenseConfig"]
                }
            },
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

export const generateDeploySh = (
  projectId: string,
  location: string,
  userStoreId: string,
  days: number,
  region: string,
  customSaEmail?: string,
  skipProjectIam: boolean = false,
): string => {
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

gcloud projects add-iam-policy-binding $PROJECT_ID \\
    --member="serviceAccount:$SA_EMAIL" \\
    --role="roles/discoveryengine.editor" --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \\
    --member="serviceAccount:$SA_EMAIL" \\
    --role="roles/logging.logWriter" --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \\
    --member="serviceAccount:$SA_EMAIL" \\
    --role="roles/serviceusage.serviceUsageConsumer" --condition=None

echo "Waiting 30s for IAM policy propagation..."
sleep 30
`;
  }

  return `#!/bin/bash
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
gcloud run deploy $SERVICE_NAME \\
    --source . \\
    --project $PROJECT_ID \\
    --region $REGION \\
    --service-account $SA_EMAIL \\
    --no-allow-unauthenticated \\
    --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,LOCATION=$APP_LOCATION,USER_STORE_ID=$USER_STORE_ID,PRUNE_DAYS=$PRUNE_DAYS"

# 5. Grant Invoker Permission
echo "Granting Invoker permission to Service Account..."
gcloud run services add-iam-policy-binding $SERVICE_NAME \\
    --member="serviceAccount:$SA_EMAIL" \\
    --role="roles/run.invoker" \\
    --region $REGION \\
    --project $PROJECT_ID

# 6. Create Cloud Scheduler Job
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --project $PROJECT_ID --region $REGION --format='value(status.url)')

echo "Creating/Updating Cloud Scheduler Job: $JOB_NAME targeting $SERVICE_URL..."

if gcloud scheduler jobs describe $JOB_NAME --location $REGION --project $PROJECT_ID > /dev/null 2>&1; then
    gcloud scheduler jobs update http $JOB_NAME \\
        --location $REGION \\
        --project $PROJECT_ID \\
        --schedule="0 3 * * *" \\
        --uri="$SERVICE_URL" \\
        --http-method=POST \\
        --oidc-service-account-email=$SA_EMAIL
else
    gcloud scheduler jobs create http $JOB_NAME \\
        --location $REGION \\
        --project $PROJECT_ID \\
        --schedule="0 3 * * *" \\
        --uri="$SERVICE_URL" \\
        --http-method=POST \\
        --oidc-service-account-email=$SA_EMAIL
fi

echo "✅ Deployment Complete!"
echo "You can manually trigger the job via:"
echo "gcloud scheduler jobs run $JOB_NAME --location $REGION --project $PROJECT_ID"
`;
};

export const requirementsTxt = `Flask==3.0.0
gunicorn==22.0.0
google-auth>=2.22.0
requests>=2.31.0`;

export const dockerfile = `FROM python:3.11-slim
ENV PYTHONUNBUFFERED True
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "main:app"]`;
