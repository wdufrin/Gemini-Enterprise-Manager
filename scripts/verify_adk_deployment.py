# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


import os
import logging
import time
from typing import List
import vertexai
from vertexai.preview import reasoning_engines

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration ---
# You can override these with environment variables
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
STAGING_BUCKET = os.getenv("STAGING_BUCKET")

if not PROJECT_ID or not STAGING_BUCKET:
    logger.error("Please set GOOGLE_CLOUD_PROJECT and STAGING_BUCKET environment variables.")
    logger.error("Example: export GOOGLE_CLOUD_PROJECT=my-project; export STAGING_BUCKET=gs://my-bucket")
    exit(1)

# --- Define a Simple ADK Agent (Echo) ---
class EchoAgent:
    def query(self, message: str) -> str:
        """Echoes the message back."""
        return f"Echo: {message}"

# --- Verification Logic ---
def main():
    logger.info("Inspecting AdkApp attributes to debug double-wrapping issue...")
    
    agent = EchoAgent()
    logging.getLogger("vertexai").setLevel(logging.WARNING) # consistency
    
    try:
        # Create an AdkApp instance locally to inspect it
        # We need to suppress the actual deployment for this check
        from vertexai.preview import reasoning_engines
        
        logger.info("Creating local AdkApp instance...")
        app = reasoning_engines.AdkApp(agent=agent, enable_tracing=False)
        
        logger.info(f"AdkApp created: {type(app)}")
        logger.info(f"hasattr(app, 'agent'): {hasattr(app, 'agent')}")
        logger.info(f"hasattr(app, '_agent'): {hasattr(app, '_agent')}")
        logger.info(f"dir(app) starts with: {[d for d in dir(app) if not d.startswith('__')][:20]}")
        
        # Check specific Pydantic fields if applicable
        if hasattr(app, 'model_fields'):
             logger.info(f"Pydantic model fields: {app.model_fields.keys()}")
             
    except Exception as e:
        logger.error(f"Failed to inspect AdkApp: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
