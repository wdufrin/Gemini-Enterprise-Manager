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
 * Deterministic Connector Checklist Catalog Validator & Matrix Generator (Zero LLM).
 *
 * Validates all human-editable JSON catalog files in:
 *   components/connectors/checklist/catalog/*.json
 * against the schema rules in:
 *   components/connectors/checklist/catalog/checklist.schema.json
 * and generates a Markdown reference matrix at:
 *   docs/CONNECTOR_VALIDATION_CATALOG.md
 *
 * Usage:
 *   node scripts/syncChecklists.mjs [--check-only]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(ROOT_DIR, 'components/connectors/checklist/catalog');
const DOCS_OUTPUT = path.join(ROOT_DIR, 'docs/CONNECTOR_VALIDATION_CATALOG.md');

const CATALOG_FILES = [
  'google-cloud-workspace.json',
  'microsoft-enterprise.json',
  'atlassian-devtools.json',
  'crm-itsm-erp.json',
  'collaboration-productivity.json',
];

const VALID_BADGES = new Set([
  'Required',
  'Optional',
  'Recommended',
  'Automated',
  'Live KB Verified',
]);

const VALID_MODES = new Set(['ALL', 'INGESTION', 'FEDERATED', 'ACTIONS']);
const VALID_PROBES = new Set([
  'IAM_PERMISSION_CHECK',
  'MCP_CONNECTIVITY',
  'CONNECTOR_STATUS',
  'OAUTH_CONFIG_VALIDITY',
]);

function validateCatalogs() {
  const errors = [];
  const allConnectors = [];
  const seenVendorIds = new Set();

  for (const filename of CATALOG_FILES) {
    const filePath = path.join(CATALOG_DIR, filename);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing catalog file: ${filePath}`);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      errors.push(`Invalid JSON in ${filename}: ${err.message}`);
      continue;
    }

    if (!Array.isArray(parsed.connectors) || parsed.connectors.length === 0) {
      errors.push(`${filename}: "connectors" must be a non-empty array.`);
      continue;
    }

    for (const conn of parsed.connectors) {
      const prefix = `${filename} -> ${conn.vendorId || 'UNKNOWN'}`;
      if (!conn.vendorId || !/^[A-Z0-9_]+$/.test(conn.vendorId)) {
        errors.push(`${prefix}: Invalid or missing vendorId.`);
      }
      if (seenVendorIds.has(conn.vendorId)) {
        errors.push(`${prefix}: Duplicate vendorId "${conn.vendorId}" across catalogs.`);
      }
      seenVendorIds.add(conn.vendorId);

      if (!conn.vendorDisplayName) {
        errors.push(`${prefix}: Missing vendorDisplayName.`);
      }
      if (!conn.category) {
        errors.push(`${prefix}: Missing category.`);
      }
      if (!conn.detectionPatterns || !Array.isArray(conn.detectionPatterns.dataSources)) {
        errors.push(`${prefix}: Missing detectionPatterns.dataSources array.`);
      }
      if (!conn.documentationUrl || !conn.documentationUrl.startsWith('http')) {
        errors.push(`${prefix}: Invalid or missing documentationUrl.`);
      }
      if (!Array.isArray(conn.sections) || conn.sections.length === 0) {
        errors.push(`${prefix}: Must contain at least 1 section.`);
        continue;
      }

      const itemIds = new Set();
      let probeCount = 0;

      for (const sec of conn.sections) {
        if (!sec.id || !sec.title || typeof sec.stepNumber !== 'number') {
          errors.push(`${prefix}: Section "${sec.id}" missing id, title, or numeric stepNumber.`);
        }
        if (!Array.isArray(sec.items) || sec.items.length === 0) {
          errors.push(`${prefix}: Section "${sec.id}" has no items.`);
          continue;
        }
        for (const item of sec.items) {
          if (!item.id || !item.label) {
            errors.push(`${prefix} (${sec.id}): Item missing id or label.`);
          }
          if (itemIds.has(item.id)) {
            errors.push(`${prefix}: Duplicate item id "${item.id}".`);
          }
          itemIds.add(item.id);

          if (item.badge && !VALID_BADGES.has(item.badge)) {
            errors.push(`${prefix} (${item.id}): Invalid badge "${item.badge}".`);
          }
          if (item.appliesToMode && !VALID_MODES.has(item.appliesToMode)) {
            errors.push(`${prefix} (${item.id}): Invalid appliesToMode "${item.appliesToMode}".`);
          }
          if (item.automatedProbe) {
            probeCount++;
            if (!VALID_PROBES.has(item.automatedProbe.type)) {
              errors.push(
                `${prefix} (${item.id}): Invalid automatedProbe.type "${item.automatedProbe.type}".`
              );
            }
          }
        }
      }

      if (probeCount === 0) {
        errors.push(`${prefix}: Must define at least 1 automatedProbe.`);
      }

      allConnectors.push({
        ...conn,
        sourceFile: filename,
        totalItems: itemIds.size,
        probeCount,
      });
    }
  }

  return { errors, allConnectors };
}

function generateMarkdownCatalog(allConnectors) {
  const totalCheckboxes = allConnectors.reduce((acc, c) => acc + c.totalItems, 0);
  const totalProbes = allConnectors.reduce((acc, c) => acc + c.probeCount, 0);

  const lines = [
    '# Gemini Enterprise Connector Validation Catalog',
    '',
    '> **Deterministic Source of Truth (Zero LLM Generation)**',
    '> All connector checklists and automated probes are maintained in human-editable JSON catalog files under `components/connectors/checklist/catalog/*.json` and validated against `components/connectors/checklist/catalog/checklist.schema.json`.',
    '',
    `- **Total Connectors**: ${allConnectors.length}`,
    `- **Total Validation Checkboxes**: ${totalCheckboxes}`,
    `- **Total Automated Diagnostic Probes**: ${totalProbes}`,
    '',
    '## Connector Summary Matrix',
    '',
    '| Vendor ID | Display Name | Category | Catalog File | Data Sources | Modes | Checkboxes | Automated Probes | Official Docs |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |',
  ];

  for (const c of allConnectors) {
    const modes = ['Ingestion'];
    if (c.supportsDataModeToggle) modes.push('Federated');
    if (c.supportsActions) modes.push('Actions');
    const ds = (c.detectionPatterns?.dataSources || []).slice(0, 4).map((d) => `\`${d}\``).join(', ') || 'Fallback';
    lines.push(
      `| \`${c.vendorId}\` | **${c.vendorDisplayName}** | ${c.category} | \`${c.sourceFile}\` | ${ds} | ${modes.join(', ')} | ${c.totalItems} | ${c.probeCount} | [Docs](${c.documentationUrl}) |`
    );
  }

  lines.push('');
  lines.push('## How to Update or Add a Connector Checklist');
  lines.push('');
  lines.push('1. Open the corresponding domain file in `components/connectors/checklist/catalog/`:');
  for (const f of CATALOG_FILES) {
    lines.push(`   - \`components/connectors/checklist/catalog/${f}\``);
  }
  lines.push('2. Add or update the connector entry following `checklist.schema.json`.');
  lines.push('3. Run `node scripts/syncChecklists.mjs` to validate the schema and regenerate this reference table.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const checkOnly = process.argv.includes('--check-only');
  const { errors, allConnectors } = validateCatalogs();

  if (errors.length > 0) {
    console.error(`❌ Checklist Catalog Validation Failed (${errors.length} errors):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ Validated ${allConnectors.length} connectors across ${CATALOG_FILES.length} deterministic JSON catalog files.`
  );

  if (!checkOnly) {
    const md = generateMarkdownCatalog(allConnectors);
    fs.writeFileSync(DOCS_OUTPUT, md, 'utf8');
    console.log(`📄 Generated Markdown reference catalog at ${DOCS_OUTPUT}`);
  }
}

main();
