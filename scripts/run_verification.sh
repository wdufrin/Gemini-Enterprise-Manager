#!/bin/bash
set -e

# 1. Setup Virtual Environment
if [ ! -d "venv_verify" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv_verify
fi

source venv_verify/bin/activate

# 2. Install Dependencies
echo "Installing dependencies..."
pip install -q --upgrade pip
pip install -q "google-cloud-aiplatform[adk,agent_engines]>=1.75.0" "python-dotenv"

# 3. Run Verification Script
echo "Running verification script..."
# Ensure GOOGLE_CLOUD_PROJECT is set
if [ -z "$GOOGLE_CLOUD_PROJECT" ]; then
    echo "Error: GOOGLE_CLOUD_PROJECT environment variable is not set."
    echo "Please export it: export GOOGLE_CLOUD_PROJECT=your-project-id"
    exit 1
fi

if [ -z "$STAGING_BUCKET" ]; then
    echo "Error: STAGING_BUCKET environment variable is not set."
    echo "Please export it: export STAGING_BUCKET=gs://your-bucket-name"
    exit 1
fi

python3 scripts/verify_adk_deployment.py
