#!/usr/bin/env node
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

/**
 * Developer Maintenance CLI:
 * Offline synchronizer for Connector Pre-Flight Checklists against official Google Cloud Knowledge Base.
 * 
 * Usage:
 *   npm run sync-checklists [VENDOR_ID] [--project=<PROJECT_ID>] [--all]
 *   
 * Examples:
 *   npm run sync-checklists JIRA
 *   npm run sync-checklists CONFLUENCE
 *   npm run sync-checklists --all
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    help: false,
    timeoutMs: 45000,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg.startsWith('--project=')) {
      options.projectId = arg.split('=')[1];
    } else if (arg.startsWith('--timeout=')) {
      options.timeoutMs = parseInt(arg.split('=')[1], 10) * 1000;
    } else if (!arg.startsWith('--')) {
      options.vendorId = arg.toUpperCase();
    }
  }

  return options;
}

function getGcloudAccessToken() {
  try {
    return execSync('gcloud auth print-access-token', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function getGcloudProject() {
  try {
    return execSync('gcloud config get-value project', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function loadRegistryMetadata() {
  const registryPath = path.resolve('components/connectors/checklist/checklistRegistry.ts');
  const registryContent = fs.readFileSync(registryPath, 'utf-8');

  // Match key: { ... vendorDisplayName: "...", documentationUrl: "..." }
  const vendorMatches = [...registryContent.matchAll(/([A-Z0-9_]+):\s*\{[\s\S]*?vendorDisplayName:\s*['"]([^'"]+)['"][\s\S]*?documentationUrl:\s*['"]([^'"]+)['"]/g)];
  const vendorMap = new Map();
  for (const match of vendorMatches) {
    vendorMap.set(match[1], {
      vendorId: match[1],
      displayName: match[2],
      docUrl: match[3],
    });
  }
  return vendorMap;
}

async function queryDocSyncWithVertex(vendorId, vendorDisplayName, docUrl, projectId, token, timeoutMs) {
  const location = 'us-central1';
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-2.5-flash:generateContent`;
  
  const targetDocUrl = docUrl || 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/introduction-to-connectors-and-data-stores';

  const prompt = `You are a Google Cloud enterprise architect reviewing official documentation for Gemini Enterprise / Vertex AI Search Connectors.
Target Connector: "${vendorDisplayName}" (Vendor ID: ${vendorId}).
Official Reference Documentation: ${targetDocUrl}

Inspect official Google Cloud documentation for "${vendorDisplayName}" data store and assistant connector setup.
Identify:
1. Required service agent roles and IAM bindings.
2. Third-party OAuth scopes required for Search/Ingestion (read) AND Assistant Actions (write/execution).
3. OAuth redirect URIs (e.g., https://vertexaisearch.cloud.google.com/oauth-redirect).
4. Network, firewall, egress, and domain allowlist requirements.
5. Entity types, metadata, and security trimming prerequisites.

Return a JSON object conforming to this schema:
{
  "vendorId": "${vendorId}",
  "vendorDisplayName": "${vendorDisplayName}",
  "documentationUrl": "${targetDocUrl}",
  "supportsActions": true,
  "sections": [
    {
      "id": "step_id",
      "title": "Step Title",
      "stepNumber": 1,
      "description": "Step summary",
      "items": [
        {
          "id": "item_id",
          "label": "Short label",
          "subLabel": "Detailed instructions",
          "badge": "Required",
          "appliesToMode": "ALL",
          "isActionRequirement": false,
          "codeSnippet": "Scope or URI if applicable"
        }
      ]
    }
  ]
}

Return ONLY raw JSON inside markdown code fence.`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { temperature: 0.1 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': projectId,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vertex AI HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) {
    throw new Error('No candidate content returned from Vertex AI.');
  }

  const fenceMatch = candidateText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || candidateText.match(/(\{[\s\S]*\})/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : candidateText.trim();
  return JSON.parse(jsonStr);
}

async function main() {
  console.log('================================================================');
  console.log('  Gemini Enterprise Manager - Connector Checklist Offline Sync  ');
  console.log('================================================================\n');

  const options = parseArgs();
  const vendorMap = loadRegistryMetadata();

  if (options.help) {
    console.log('Usage:');
    console.log('  npm run sync-checklists [VENDOR_ID] [--project=<ID>] [--all] [--timeout=<SEC>]\n');
    console.log('Available Vendors in Registry (' + vendorMap.size + '):');
    console.log('  ' + Array.from(vendorMap.keys()).join(', '));
    process.exit(0);
  }

  const token = getGcloudAccessToken();
  const projectId = options.projectId || process.env.PROJECT_ID || getGcloudProject();

  if (!token || !projectId) {
    console.error('⚠️  Authentication missing:');
    if (!token) console.error('   - No gcloud access token found. Run `gcloud auth login` or `gcloud auth application-default login`.');
    if (!projectId) console.error('   - No GCP Project ID found. Pass `--project=<ID>` or set `gcloud config set project <ID>`.');
    console.log('\nAvailable bundled vendors in registry (' + vendorMap.size + '):');
    console.log(Array.from(vendorMap.keys()).join(', '));
    process.exit(1);
  }

  console.log(`✓ Authenticated via gcloud.`);
  console.log(`✓ GCP Project: ${projectId}`);
  console.log(`✓ Request timeout: ${options.timeoutMs / 1000}s`);

  const targetVendors = options.all
    ? Array.from(vendorMap.keys())
    : options.vendorId
    ? [options.vendorId]
    : ['JIRA'];

  console.log(`✓ Target vendors (${targetVendors.length}): ${targetVendors.join(', ')}\n`);

  const outDir = path.resolve('scripts/out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const vId of targetVendors) {
    const meta = vendorMap.get(vId) || { displayName: vId, docUrl: '' };
    console.log(`--- Syncing [${vId}]: ${meta.displayName} ---`);
    console.log(`Documentation URL: ${meta.docUrl || 'N/A'}`);

    try {
      const startTime = Date.now();
      const liveResult = await queryDocSyncWithVertex(vId, meta.displayName, meta.docUrl, projectId, token, options.timeoutMs);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const sectionCount = liveResult.sections?.length || 0;
      const itemCount = liveResult.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0;

      console.log(`✓ Retrieved documentation structure in ${elapsed}s:`);
      console.log(`  - Sections: ${sectionCount}`);
      console.log(`  - Total Checklist Items: ${itemCount}`);
      console.log(`  - Supports Actions: ${liveResult.supportsActions}`);
      
      const outFile = path.join(outDir, `${vId.toLowerCase()}_synced.json`);
      fs.writeFileSync(outFile, JSON.stringify(liveResult, null, 2), 'utf-8');
      console.log(`✓ Saved synced definition to: scripts/out/${vId.toLowerCase()}_synced.json`);
    } catch (err) {
      console.error(`✕ Error syncing ${vId}:`, err.message);
    }
    console.log('');
  }

  console.log('✓ Checklist offline sync complete.');
  console.log('Maintainers can inspect scripts/out/*.json to review proposed doc updates before committing.');
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
