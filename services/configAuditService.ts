/**
 * Copyright 2026 Google LLC
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

import { Config, ConfigAuditItem, ConfigAuditSummary, AppEngine, DataStore, RegistrySkill, Authorization } from '../types';
import * as api from './apiService';

export interface AuditProgressCallback {
  (step: string, percent: number): void;
}

export async function runConfigAudit(
  sourceConfig: Config,
  targetConfig: Config,
  onProgress?: AuditProgressCallback
): Promise<ConfigAuditSummary> {
  const items: ConfigAuditItem[] = [];

  // Helper to safely extract resource ID
  const getResourceId = (resourceName?: string): string => {
    if (!resourceName) return '';
    return resourceName.split('/').pop() || resourceName;
  };

  // Helper to extract clean CID / IdP details
  const extractIdpInfo = (engine: any): { type: string; cid?: string } => {
    if (!engine) return { type: 'UNKNOWN' };
    const cid = engine.widgetConfigConfigId || engine.commonConfig?.companyName || engine.cid || '';
    const isWif = engine.isExternalIdp || !!cid || engine.name?.includes('wif');
    return {
      type: isWif ? 'Workforce Identity Federation (WiF / Entra ID)' : 'Google Workspace / Cloud Identity',
      cid: cid || undefined
    };
  };

  // -------------------------------------------------------------
  // Step 1: Engine & App Level Configurations
  // -------------------------------------------------------------
  onProgress?.('Auditing Engine & App Configurations...', 15);

  let sourceEngine: AppEngine | null = null;
  let targetEngine: AppEngine | null = null;

  try {
    sourceEngine = await api.getEngine(sourceConfig.appId, sourceConfig);
  } catch (err: any) {
    items.push({
      id: 'src-engine-inaccessible',
      category: 'Engine & IdP',
      name: `Source Engine (${sourceConfig.appId})`,
      sourceValue: 'INACCESSIBLE / NOT FOUND',
      targetValue: 'N/A',
      status: 'DRIFT',
      severity: 'ERROR',
      details: err.message || 'Could not fetch source engine details.',
      remediation: 'Verify Source Project ID, App Location, and Engine ID permissions.'
    });
  }

  try {
    targetEngine = await api.getEngine(targetConfig.appId, targetConfig);
  } catch (err: any) {
    items.push({
      id: 'tgt-engine-inaccessible',
      category: 'Engine & IdP',
      name: `Destination Engine (${targetConfig.appId})`,
      sourceValue: sourceEngine ? 'Accessible' : 'N/A',
      targetValue: 'INACCESSIBLE / NOT FOUND',
      status: 'MISSING_IN_TARGET',
      severity: 'ERROR',
      details: err.message || 'Could not fetch destination engine details.',
      remediation: 'Ensure Destination Engine is created and provisioned in the target project.'
    });
  }

  if (sourceEngine && targetEngine) {
    // 1. Solution Type
    const srcSolution = (sourceEngine as any).solutionType || 'SOLUTION_TYPE_UNSPECIFIED';
    const tgtSolution = (targetEngine as any).solutionType || 'SOLUTION_TYPE_UNSPECIFIED';
    const isSolutionMatch = srcSolution === tgtSolution;
    items.push({
      id: 'engine-solution-type',
      category: 'Engine & IdP',
      name: 'Engine Solution Type',
      sourceValue: srcSolution,
      targetValue: tgtSolution,
      status: isSolutionMatch ? 'MATCH' : 'DRIFT',
      severity: isSolutionMatch ? 'OK' : 'ERROR',
      details: isSolutionMatch ? 'Both engines use identical solution types.' : 'Engine solution types differ, which may cause feature incompatibility.',
      remediation: isSolutionMatch ? undefined : `Re-provision target engine with solution type: ${srcSolution}.`
    });

    // 2. Search Tier / Features
    const srcTier = (sourceEngine as any).searchEngineConfig?.searchTier || 'STANDARD';
    const tgtTier = (targetEngine as any).searchEngineConfig?.searchTier || 'STANDARD';
    const isTierMatch = srcTier === tgtTier;
    items.push({
      id: 'engine-search-tier',
      category: 'Engine & IdP',
      name: 'Search Engine Tier',
      sourceValue: srcTier,
      targetValue: tgtTier,
      status: isTierMatch ? 'MATCH' : 'DRIFT',
      severity: isTierMatch ? 'OK' : 'WARNING',
      details: isTierMatch ? 'Search tiers match.' : `Search tier differs (Source: ${srcTier} vs Target: ${tgtTier}).`,
      remediation: isTierMatch ? undefined : 'Align Search Engine Tier in target settings if advanced features are required.'
    });

    // 3. IdP & CID
    const srcIdp = extractIdpInfo(sourceEngine);
    const tgtIdp = extractIdpInfo(targetEngine);
    const isIdpMatch = srcIdp.type === tgtIdp.type;
    items.push({
      id: 'engine-idp-mode',
      category: 'Engine & IdP',
      name: 'Identity Provider (IdP) Mode',
      sourceValue: srcIdp.type,
      targetValue: tgtIdp.type,
      status: isIdpMatch ? 'MATCH' : 'DRIFT',
      severity: isIdpMatch ? 'OK' : 'WARNING',
      details: isIdpMatch 
        ? `Both environments use ${srcIdp.type}.` 
        : `IdP migration mode active: Migrating from ${srcIdp.type} to ${tgtIdp.type}.`,
      remediation: isIdpMatch ? undefined : 'Ensure identity mapping rules (idpMapping / domainRules) are defined in migration-config.json.'
    });

    if (srcIdp.cid || tgtIdp.cid) {
      const isCidMatch = srcIdp.cid === tgtIdp.cid;
      items.push({
        id: 'engine-widget-cid',
        category: 'Engine & IdP',
        name: 'Workforce Widget Config ID (CID)',
        sourceValue: srcIdp.cid || '(None)',
        targetValue: tgtIdp.cid || '(None)',
        status: isCidMatch ? 'MATCH' : 'DRIFT',
        severity: isCidMatch ? 'OK' : 'WARNING',
        details: isCidMatch ? 'Widget config CIDs match.' : 'Widget Config ID varies between source and target engines.',
        remediation: isCidMatch ? undefined : 'Ensure target assistant widgetConfig is mapped in migration target configuration.'
      });
    }

    // 4. Region Proximity
    const isLocationMatch = sourceConfig.appLocation === targetConfig.appLocation;
    items.push({
      id: 'location-alignment',
      category: 'Engine & IdP',
      name: 'Geographic Location',
      sourceValue: sourceConfig.appLocation,
      targetValue: targetConfig.appLocation,
      status: isLocationMatch ? 'MATCH' : 'DRIFT',
      severity: isLocationMatch ? 'OK' : 'WARNING',
      details: isLocationMatch ? `Both engines reside in '${sourceConfig.appLocation}'.` : `Cross-region migration (${sourceConfig.appLocation} -> ${targetConfig.appLocation}).`,
      remediation: isLocationMatch ? undefined : 'Cross-region migration may introduce cross-region network latency during one-time transfer.'
    });
  }

  // -------------------------------------------------------------
  // Step 2: Grounding DataStores
  // -------------------------------------------------------------
  onProgress?.('Auditing Grounding DataStores...', 40);

  let sourceDataStores: DataStore[] = [];
  let targetDataStores: DataStore[] = [];

  try {
    const srcDsRes = await api.listResources('dataStores', sourceConfig, undefined, 100, true);
    sourceDataStores = srcDsRes?.dataStores || [];
  } catch (err: any) {
    items.push({
      id: 'src-datastores-error',
      category: 'Grounding DataStores',
      name: 'Source DataStores Discovery',
      sourceValue: 'ERROR',
      targetValue: 'N/A',
      status: 'DRIFT',
      severity: 'WARNING',
      details: `Could not list source DataStores: ${err.message}`
    });
  }

  try {
    const tgtDsRes = await api.listResources('dataStores', targetConfig, undefined, 100, true);
    targetDataStores = tgtDsRes?.dataStores || [];
  } catch (err: any) {
    items.push({
      id: 'tgt-datastores-error',
      category: 'Grounding DataStores',
      name: 'Destination DataStores Discovery',
      sourceValue: 'N/A',
      targetValue: 'ERROR',
      status: 'DRIFT',
      severity: 'WARNING',
      details: `Could not list destination DataStores: ${err.message}`
    });
  }

  const targetDsMap = new Map<string, DataStore>();
  const targetDsByName = new Map<string, DataStore>();

  targetDataStores.forEach(ds => {
    const id = getResourceId(ds.name);
    targetDsMap.set(id, ds);
    if (ds.displayName) {
      targetDsByName.set(ds.displayName.toLowerCase().trim(), ds);
    }
  });

  if (sourceDataStores.length === 0) {
    items.push({
      id: 'no-source-datastores',
      category: 'Grounding DataStores',
      name: 'DataStores Baseline',
      sourceValue: '0 DataStores',
      targetValue: `${targetDataStores.length} DataStores`,
      status: 'INFO',
      severity: 'OK',
      details: 'No DataStores found in source project. Agents do not depend on enterprise document grounding.'
    });
  } else {
    for (const srcDs of sourceDataStores) {
      const dsId = getResourceId(srcDs.name);
      const dsName = srcDs.displayName || dsId;
      const matchedTarget = targetDsMap.get(dsId) || targetDsByName.get(dsName.toLowerCase().trim());

      if (matchedTarget) {
        const targetDsId = getResourceId(matchedTarget.name);
        const isExactId = dsId === targetDsId;
        items.push({
          id: `ds-${dsId}`,
          category: 'Grounding DataStores',
          name: `DataStore: ${dsName}`,
          sourceValue: `ID: ${dsId}`,
          targetValue: `ID: ${targetDsId}`,
          status: isExactId ? 'MATCH' : 'DRIFT',
          severity: isExactId ? 'OK' : 'WARNING',
          details: isExactId
            ? `Exact DataStore ID match found in target project.`
            : `Matched by display name, but target ID differs (${dsId} -> ${targetDsId}).`,
          remediation: isExactId
            ? undefined
            : `Map "${dsId}": "${targetDsId}" under datastoreMapping in migration-config.json.`
        });
      } else {
        items.push({
          id: `ds-${dsId}`,
          category: 'Grounding DataStores',
          name: `DataStore: ${dsName}`,
          sourceValue: `ID: ${dsId}`,
          targetValue: 'MISSING IN TARGET',
          status: 'MISSING_IN_TARGET',
          severity: 'ERROR',
          details: `Source DataStore "${dsName}" (${dsId}) does not exist in the destination environment. Agents referencing this DataStore will fail or skip grounding.`,
          remediation: `Create a DataStore in the destination project with ID "${dsId}" or configure an explicit mapping in datastoreMapping.`
        });
      }
    }
  }

  // -------------------------------------------------------------
  // Step 3: Skills & Custom Tools
  // -------------------------------------------------------------
  onProgress?.('Auditing Skills Registry & Custom Tools...', 65);

  let sourceSkills: RegistrySkill[] = [];
  let targetSkills: RegistrySkill[] = [];

  try {
    sourceSkills = await api.listRegistrySkills(sourceConfig);
  } catch (err: any) {
    // Many environments do not have Agent Registry enabled, which is fine
  }

  try {
    targetSkills = await api.listRegistrySkills(targetConfig);
  } catch (err: any) {
    // Graceful fallback
  }

  const targetSkillMap = new Map<string, RegistrySkill>();
  targetSkills.forEach(s => {
    const id = s.skillId || s.name.split('/').pop() || s.displayName;
    targetSkillMap.set(id, s);
    if (s.displayName) {
      targetSkillMap.set(s.displayName.toLowerCase().trim(), s);
    }
  });

  if (sourceSkills.length === 0) {
    items.push({
      id: 'no-source-skills',
      category: 'Skills & Tools',
      name: 'Agent Registry Skills',
      sourceValue: '0 Skills',
      targetValue: `${targetSkills.length} Skills`,
      status: 'INFO',
      severity: 'OK',
      details: 'No Agent Registry skills detected in source project.'
    });
  } else {
    for (const srcSkill of sourceSkills) {
      const skillId = srcSkill.skillId || srcSkill.name.split('/').pop() || srcSkill.displayName;
      const skillTitle = srcSkill.displayName || skillId;
      const matchedSkill = targetSkillMap.get(skillId) || targetSkillMap.get(skillTitle.toLowerCase().trim());

      if (matchedSkill) {
        items.push({
          id: `skill-${skillId}`,
          category: 'Skills & Tools',
          name: `Skill: ${skillTitle}`,
          sourceValue: `State: ${srcSkill.state || 'ACTIVE'}`,
          targetValue: `State: ${matchedSkill.state || 'ACTIVE'}`,
          status: 'MATCH',
          severity: 'OK',
          details: 'Skill exists in destination Agent Registry.'
        });
      } else {
        items.push({
          id: `skill-${skillId}`,
          category: 'Skills & Tools',
          name: `Skill: ${skillTitle}`,
          sourceValue: `ID: ${skillId}`,
          targetValue: 'MISSING IN TARGET',
          status: 'MISSING_IN_TARGET',
          severity: 'WARNING',
          details: `Source skill "${skillTitle}" is not registered in destination. Agents requiring this skill must have it published to target.`,
          remediation: `Publish "${skillTitle}" to destination Agent Registry or use gemini-migrate v1.3.0 Tool Migrator.`
        });
      }
    }
  }

  // -------------------------------------------------------------
  // Step 4: Authorizations
  // -------------------------------------------------------------
  onProgress?.('Auditing Tool Authorizations...', 80);

  let sourceAuths: Authorization[] = [];
  let targetAuths: Authorization[] = [];

  try {
    sourceAuths = await api.listAuthorizations(sourceConfig);
  } catch (err: any) {
    // Authorizations endpoint may return 404 or empty if none exist
  }

  try {
    targetAuths = await api.listAuthorizations(targetConfig);
  } catch (err: any) {
    // Graceful fallback
  }

  const targetAuthMap = new Map<string, Authorization>();
  targetAuths.forEach(a => {
    const id = getResourceId(a.name);
    targetAuthMap.set(id, a);
    if (a.serverClientId) {
      targetAuthMap.set(a.serverClientId, a);
    }
  });

  if (sourceAuths.length > 0) {
    for (const srcAuth of sourceAuths) {
      const authId = getResourceId(srcAuth.name);
      const matchedAuth = targetAuthMap.get(authId) || (srcAuth.serverClientId ? targetAuthMap.get(srcAuth.serverClientId) : undefined);

      if (matchedAuth) {
        items.push({
          id: `auth-${authId}`,
          category: 'Authorizations',
          name: `Authorization: ${authId}`,
          sourceValue: 'Configured',
          targetValue: 'Configured',
          status: 'MATCH',
          severity: 'OK',
          details: 'Matching tool authorization exists in target environment.'
        });
      } else {
        items.push({
          id: `auth-${authId}`,
          category: 'Authorizations',
          name: `Authorization: ${authId}`,
          sourceValue: 'Configured',
          targetValue: 'MISSING IN TARGET',
          status: 'MISSING_IN_TARGET',
          severity: 'WARNING',
          details: `Authorization "${authId}" is missing in the destination project. Third-party tools relying on this authorization will need to be re-authorized.`,
          remediation: `Provision tool authorization "${authId}" in target project before migrating connected agents.`
        });
      }
    }
  }

  // -------------------------------------------------------------
  // Step 5: License & Subscription Pools
  // -------------------------------------------------------------
  onProgress?.('Auditing License & Subscription Pools...', 95);

  try {
    const srcLicenseStats = await api.listLicenseConfigsUsageStats(sourceConfig);
    const tgtLicenseStats = await api.listLicenseConfigsUsageStats(targetConfig);

    const srcLicenses = srcLicenseStats?.licenseConfigUsageStats || [];
    const tgtLicenses = tgtLicenseStats?.licenseConfigUsageStats || [];

    if (srcLicenses.length > 0 || tgtLicenses.length > 0) {
      const srcTotalUsed = srcLicenses.reduce((acc: number, l: any) => acc + (Number(l.usedLicenseCount) || 0), 0);
      const tgtTotalUsed = tgtLicenses.reduce((acc: number, l: any) => acc + (Number(l.usedLicenseCount) || 0), 0);

      items.push({
        id: 'license-stats-active',
        category: 'Licenses & Quotas',
        name: 'Active License Seats',
        sourceValue: `${srcTotalUsed} Assigned Users`,
        targetValue: `${tgtTotalUsed} Assigned Users`,
        status: 'INFO',
        severity: 'OK',
        details: `Source has ${srcTotalUsed} active assigned user seats. Destination currently has ${tgtTotalUsed} seats allocated.`
      });
    }
  } catch (err: any) {
    // License stats are project-level and may fail if caller lacks roles/discoveryengine.admin
  }

  onProgress?.('Audit Complete.', 100);

  // -------------------------------------------------------------
  // Calculate Overall Alignment Score & Summary
  // -------------------------------------------------------------
  const totalChecks = items.length;
  const matchedCount = items.filter(i => i.status === 'MATCH' || i.status === 'INFO').length;
  const driftCount = items.filter(i => i.status === 'DRIFT').length;
  const missingCount = items.filter(i => i.status === 'MISSING_IN_TARGET').length;

  // Score formula: Start at 100, deduct 15 for each missing blocker, 5 for each drift
  let score = 100 - (missingCount * 15) - (driftCount * 5);
  if (score < 0) score = 0;
  if (totalChecks === 0) score = 100;

  return {
    overallScore: score,
    totalChecks,
    matchedCount,
    driftCount,
    missingCount,
    sourceProject: sourceConfig.projectId,
    targetProject: targetConfig.projectId,
    sourceEngine: sourceConfig.appId,
    targetEngine: targetConfig.appId,
    items,
    timestamp: new Date().toISOString()
  };
}

/**
 * Generates an executive Markdown report from the audit summary.
 */
export function generateAuditMarkdown(summary: ConfigAuditSummary): string {
  const lines: string[] = [];

  const readinessPill = summary.overallScore >= 90
    ? '🟢 READY FOR CUTOVER'
    : summary.overallScore >= 70
    ? '🟡 REMEDIATION RECOMMENDED'
    : '🔴 BLOCKERS DETECTED';

  lines.push(`# 📊 Gemini Enterprise Pre-Cutover Configuration Audit`);
  lines.push(`**Generated**: \`${summary.timestamp}\`  `);
  lines.push(`**Source Environment**: \`${summary.sourceProject}\` (Engine: \`${summary.sourceEngine}\`)  `);
  lines.push(`**Destination Environment**: \`${summary.targetProject}\` (Engine: \`${summary.targetEngine}\`)  `);
  lines.push(`**Readiness Status**: **${readinessPill}** (Parity Score: **${summary.overallScore}%**)  `);
  lines.push('');

  lines.push(`---`);
  lines.push(`## 1. Executive Summary`);
  lines.push(`| Metric | Count | Assessment |`);
  lines.push(`| :--- | :---: | :--- |`);
  lines.push(`| **Total Configurations Audited** | \`${summary.totalChecks}\` | Comprehensive 5-pillar scan |`);
  lines.push(`| **✅ Identical / Compatible Matches** | \`${summary.matchedCount}\` | Ready for migration |`);
  lines.push(`| **🟡 Configuration Drift / Warnings** | \`${summary.driftCount}\` | Operational adjustments recommended |`);
  lines.push(`| **🔴 Missing in Destination** | \`${summary.missingCount}\` | Potential cutover blockers |`);
  lines.push('');

  lines.push(`---`);
  lines.push(`## 2. Granular Audit Matrix`);
  lines.push(`| Pillar | Component / Asset | Source Setting | Destination Setting | Parity Status | Guidance / Remediation |`);
  lines.push(`| :--- | :--- | :--- | :--- | :---: | :--- |`);

  for (const item of summary.items) {
    const statusBadge = item.status === 'MATCH'
      ? '✅ MATCH'
      : item.status === 'DRIFT'
      ? '🟡 DRIFT'
      : item.status === 'MISSING_IN_TARGET'
      ? '🔴 MISSING'
      : 'ℹ️ INFO';

    const remediation = item.remediation ? `**Action:** ${item.remediation}` : item.details || 'OK';

    lines.push(
      `| \`${item.category}\` | **${item.name}** | \`${item.sourceValue ?? 'N/A'}\` | \`${item.targetValue ?? 'N/A'}\` | ${statusBadge} | ${remediation} |`
    );
  }

  lines.push('');
  lines.push(`---`);
  lines.push(`## 3. Recommended Cutover Actions`);
  if (summary.missingCount === 0 && summary.driftCount === 0) {
    lines.push(`- ✅ All configuration checks passed. The target environment is fully prepared for one-time cutover with \`gemini-migrate\`.`);
  } else {
    if (summary.missingCount > 0) {
      lines.push(`- 🔴 **Resolve Missing Assets**: Create or map the flagged DataStores and Tools in destination project \`${summary.targetProject}\` prior to starting batch user transfer.`);
    }
    if (summary.driftCount > 0) {
      lines.push(`- 🟡 **Verify Drift Mappings**: Ensure \`idpMapping\` or \`datastoreMapping\` in \`migration-config.json\` accounts for differing IDs or IdP modes.`);
    }
  }

  return lines.join('\n');
}
