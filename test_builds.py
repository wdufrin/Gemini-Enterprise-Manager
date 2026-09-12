import asyncio
import sys
import json

from google.auth.transport.requests import Request
from google.oauth2 import credentials
import google.auth
import requests

async def main():
    creds, project = google.auth.default()
    creds.refresh(Request())
    token = creds.token
    
    url = f"https://cloudbuild.googleapis.com/v1/projects/{project}/builds"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    res = requests.get(url, headers=headers)
    builds = res.json().get('builds', [])
    if builds:
        print(json.dumps(builds[0], indent=2))
        
        # Test fetching logs
        build_id = builds[0]['id']
        log_url = f"https://logging.googleapis.com/v2/entries:list"
        body = {
            "resourceNames": [f"projects/{project}"],
            "filter": f'resource.type="build" AND resource.labels.build_id="{build_id}"',
            "pageSize": 10
        }
        res2 = requests.post(log_url, headers=headers, json=body)
        print("LOGS:", res2.status_code)
        print(json.dumps(res2.json(), indent=2))
    else:
        print("No builds found")

if __name__ == "__main__":
    asyncio.run(main())
