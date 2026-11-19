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

import {
  Agent,
  AgentDataConnectorRef,
  AgentDataStoreSpecs,
  AppEngine,
  Assistant,
  Authorization,
  Config,
  ConfigAuditItem,
  ConfigAuditSummary,
  CustomRole,
  DataStore,
  RegistrySkill,
} from '../types';
import * as api from './apiService';
import { generateDiscoveryProjectTerraform } from '../utils/terraformExporter';

export interface AuditProgressCallback {
  (step: string, percent: number): void;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err || 'Unknown error');
}

/**
 * Distinguishes "the resource is genuinely absent" from "we were not allowed
 * to look".
 *
 * This matters because the two are reported very differently: a 404 really is
 * drift or a missing resource, but a 403 tells us nothing about the target's
 * configuration. Reporting a permission error as DRIFT / MISSING_IN_TARGET
 * invents a finding the auditor never actually observed.
 *
 * Returns `true` only when the failure is clearly an access problem.
 */
function isAccessFailure(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string } | null;
  if (!e) return false;

  const status = e.status ?? e.code;
  if (status === 401 || status === 403) return true;

  const message = String(e.message ?? '');
  return /\b(401|403)\b|PERMISSION_DENIED|UNAUTHENTICATED|permission denied|forbidden|insufficient(?: authentication)? scopes?/i.test(
    message
  );
}

const REGIONAL_VERTEX_LOCATION_REGEX = /^[a-z]+(?:-[a-z]+)+\d+$/;

function isRegionalVertexLocation(loc?: string): boolean {
  return Boolean(loc && REGIONAL_VERTEX_LOCATION_REGEX.test(loc.trim()));
}

export function inferAgentTypeLabel(agent: Partial<Agent>): string {
  if (agent.agentType && agent.agentType.trim()) {
    return agent.agentType.trim().toUpperCase();
  }
  if (agent.adkAgentDefinition) return 'ADK';
  if (agent.a2aAgentDefinition) return 'A2A';
  if (agent.lowCodeAgentDefinition) return 'LOW_CODE';
  if (agent.workflowAgentDefinition) return 'WORKFLOW';
  if (agent.skillAgentDefinition) return 'SKILL';
  if (agent.managedAgentDefinition) return 'MANAGED';
  if (agent.noCodeAgentDefinition) return 'NO_CODE';
  return 'CUSTOM';
}

async function fetchDefaultAssistantForAudit(
  cfg: Config
): Promise<{ assistant: Assistant | null; failed: boolean; errorMessage?: string }> {
  const assistantId = cfg.assistantId || 'default_assistant';
  const assistantPath = `projects/${cfg.projectId}/locations/${cfg.appLocation}/collections/${cfg.collectionId || 'default_collection'}/engines/${cfg.appId}/assistants/${assistantId}`;

  if ('getAssistant' in api && typeof api.getAssistant === 'function') {
    try {
      const asst = await api.getAssistant(assistantPath, { ...cfg, suppressErrorLog: true });
      if (asst) {
        return { assistant: asst, failed: false };
      }
    } catch (err: unknown) {
      if (isAccessFailure(err)) {
        return { assistant: null, failed: true, errorMessage: toErrorMessage(err) };
      }
      // Fall back to listResources('assistants') below
    }
  }

  try {
    const res = await api.listResources('assistants', cfg, undefined, 50, true);
    const list = res?.assistants || [];
    const found =
      list.find((a) => a.name.endsWith(`/${assistantId}`)) || list[0] || null;
    return { assistant: found, failed: false };
  } catch (err: unknown) {
    return { assistant: null, failed: true, errorMessage: toErrorMessage(err) };
  }
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
  const extractIdpInfo = (engine?: Partial<AppEngine> | null): { type: string; cid?: string } => {
    if (!engine) return { type: 'UNKNOWN' };
    const cid = engine.widgetConfigConfigId || engine.cid || '';
    const isWif = Boolean(engine.isExternalIdp || cid || engine.name?.includes('wif'));
    return {
      type: isWif
        ? 'Workforce Identity Federation (WiF / Entra ID)'
        : 'Google Workspace / Cloud Identity',
      cid: cid || undefined,
    };
  };

  // -------------------------------------------------------------
  // Step 1: Engine & App Level Configurations + Assistants
  // -------------------------------------------------------------
  onProgress?.('Auditing Engine & App Configurations...', 15);

  let sourceEngine: AppEngine | null = null;
  let targetEngine: AppEngine | null = null;

  try {
    sourceEngine = await api.getEngine(sourceConfig.appId, sourceConfig);
  } catch (err: unknown) {
    const inaccessible = isAccessFailure(err);
    const msg = toErrorMessage(err);
    items.push({
      id: 'src-engine-inaccessible',
      category: 'Engine & IdP',
      name: `Source Engine (${sourceConfig.appId})`,
      sourceValue: inaccessible ? 'ACCESS DENIED' : 'INACCESSIBLE / NOT FOUND',
      targetValue: 'N/A',
      status: inaccessible ? 'UNKNOWN' : 'DRIFT',
      severity: 'ERROR',
      details: msg || 'Could not fetch source engine details.',
      remediation: inaccessible
        ? 'Grant the signed-in principal read access to the source engine, then re-run the audit. This check was skipped, not passed.'
        : 'Verify Source Project ID, App Location, and Engine ID permissions.',
    });
  }

  try {
    targetEngine = await api.getEngine(targetConfig.appId, targetConfig);
  } catch (err: unknown) {
    const inaccessible = isAccessFailure(err);
    const msg = toErrorMessage(err);
    items.push({
      id: 'tgt-engine-inaccessible',
      category: 'Engine & IdP',
      name: `Destination Engine (${targetConfig.appId})`,
      sourceValue: sourceEngine ? 'Accessible' : 'N/A',
      targetValue: inaccessible ? 'ACCESS DENIED' : 'INACCESSIBLE / NOT FOUND',
      status: inaccessible ? 'UNKNOWN' : 'MISSING_IN_TARGET',
      severity: 'ERROR',
      details: msg || 'Could not fetch destination engine details.',
      remediation: inaccessible
        ? 'Grant the signed-in principal read access to the destination engine, then re-run the audit. This check was skipped, not failed.'
        : 'Ensure Destination Engine is created and provisioned in the target project.',
    });
  }

  if (sourceEngine && targetEngine) {
    // 1. Solution Type
    const srcSolution = sourceEngine.solutionType || 'SOLUTION_TYPE_UNSPECIFIED';
    const tgtSolution = targetEngine.solutionType || 'SOLUTION_TYPE_UNSPECIFIED';
    const isSolutionMatch = srcSolution === tgtSolution;
    items.push({
      id: 'engine-solution-type',
      category: 'Engine & IdP',
      name: 'Engine Solution Type',
      sourceValue: srcSolution,
      targetValue: tgtSolution,
      status: isSolutionMatch ? 'MATCH' : 'DRIFT',
      severity: isSolutionMatch ? 'OK' : 'ERROR',
      details: isSolutionMatch
        ? 'Both engines use identical solution types.'
        : 'Engine solution types differ, which may cause feature incompatibility.',
      remediation: isSolutionMatch
        ? undefined
        : `Re-provision target engine with solution type: ${srcSolution}.`,
    });

    // 2. Search Tier / Features
    const srcTier = sourceEngine.searchEngineConfig?.searchTier || 'STANDARD';
    const tgtTier = targetEngine.searchEngineConfig?.searchTier || 'STANDARD';
    const isTierMatch = srcTier === tgtTier;
    items.push({
      id: 'engine-search-tier',
      category: 'Engine & IdP',
      name: 'Search Engine Tier',
      sourceValue: srcTier,
      targetValue: tgtTier,
      status: isTierMatch ? 'MATCH' : 'DRIFT',
      severity: isTierMatch ? 'OK' : 'WARNING',
      details: isTierMatch
        ? 'Search tiers match.'
        : `Search tier differs (Source: ${srcTier} vs Target: ${tgtTier}).`,
      remediation: isTierMatch
        ? undefined
        : 'Align Search Engine Tier in target settings if advanced features are required.',
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
      remediation: isIdpMatch
        ? undefined
        : 'Ensure identity mapping rules (idpMapping / domainRules) are defined in migration-config.json.',
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
        details: isCidMatch
          ? 'Widget config CIDs match.'
          : 'Widget Config ID varies between source and target engines.',
        remediation: isCidMatch
          ? undefined
          : 'Ensure target assistant widgetConfig is mapped in migration target configuration.',
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
      details: isLocationMatch
        ? `Both engines reside in '${sourceConfig.appLocation}'.`
        : `Cross-region migration (${sourceConfig.appLocation} -> ${targetConfig.appLocation}).`,
      remediation: isLocationMatch
        ? undefined
        : 'Cross-region migration may introduce cross-region network latency during one-time transfer.',
    });

    // 5. Assistant Policy (customerPolicy / Model Armor) & Grounding Flags
    onProgress?.('Auditing Assistant Policies & Grounding Flags...', 28);
    const [srcAsstRes, tgtAsstRes] = await Promise.all([
      fetchDefaultAssistantForAudit(sourceConfig),
      fetchDefaultAssistantForAudit(targetConfig),
    ]);

    if (srcAsstRes.failed || tgtAsstRes.failed) {
      items.push({
        id: 'assistant-discovery-error',
        category: 'Engine & IdP',
        name: 'Assistant Policy & Grounding Discovery',
        sourceValue: srcAsstRes.failed ? 'NOT CHECKED' : 'Accessible',
        targetValue: tgtAsstRes.failed ? 'NOT CHECKED' : 'Accessible',
        status: 'UNKNOWN',
        severity: 'WARNING',
        details: `Could not compare default_assistant settings: ${
          srcAsstRes.errorMessage || tgtAsstRes.errorMessage || 'Permission error'
        }`,
        remediation:
          'Grant discoveryengine.assistants.get on both environments and re-run the audit.',
      });
    } else if (srcAsstRes.assistant && tgtAsstRes.assistant) {
      const srcAsst = srcAsstRes.assistant;
      const tgtAsst = tgtAsstRes.assistant;

      // 5a. Model Armor & CustomerPolicy comparison
      const srcMa = srcAsst.customerPolicy?.modelArmorConfig;
      const tgtMa = tgtAsst.customerPolicy?.modelArmorConfig;
      const srcHasMa = Boolean(srcMa?.userPromptTemplate || srcMa?.responseTemplate);
      const tgtHasMa = Boolean(tgtMa?.userPromptTemplate || tgtMa?.responseTemplate);
      const srcFailureMode = srcMa?.failureMode || 'DEFAULT';
      const tgtFailureMode = tgtMa?.failureMode || 'DEFAULT';
      const srcBannedCount = srcAsst.customerPolicy?.bannedPhrases?.bannedPhrases?.length || 0;
      const tgtBannedCount = tgtAsst.customerPolicy?.bannedPhrases?.bannedPhrases?.length || 0;

      const formatPolicySummary = (
        hasMa: boolean,
        ma: typeof srcMa,
        failureMode: string,
        bannedCount: number
      ) => {
        const maLabel = hasMa
          ? `Prompt:${getResourceId(ma?.userPromptTemplate) || 'none'} | Resp:${getResourceId(ma?.responseTemplate) || 'none'} (${failureMode})`
          : 'No Model Armor';
        return bannedCount > 0 ? `${maLabel} | ${bannedCount} Banned Phrase(s)` : maLabel;
      };

      const srcPolicyLabel = formatPolicySummary(srcHasMa, srcMa, srcFailureMode, srcBannedCount);
      const tgtPolicyLabel = formatPolicySummary(tgtHasMa, tgtMa, tgtFailureMode, tgtBannedCount);

      const maTemplatesAligned =
        srcHasMa === tgtHasMa &&
        (!srcHasMa ||
          (Boolean(srcMa?.userPromptTemplate) === Boolean(tgtMa?.userPromptTemplate) &&
            Boolean(srcMa?.responseTemplate) === Boolean(tgtMa?.responseTemplate) &&
            srcFailureMode === tgtFailureMode));
      const bannedAligned = srcBannedCount === tgtBannedCount;

      if (srcHasMa && !tgtHasMa) {
        items.push({
          id: 'assistant-customer-policy',
          category: 'Engine & IdP',
          name: 'Assistant Policy: Model Armor & Safety',
          sourceValue: srcPolicyLabel,
          targetValue: tgtPolicyLabel,
          status: 'MISSING_IN_TARGET',
          severity: 'ERROR',
          details:
            'Source Assistant enforces Model Armor prompt/response sanitization, but Target Assistant has NO Model Armor template attached.',
          remediation:
            'Attach matching Model Armor userPromptTemplate and responseTemplate to the target default_assistant before cutover.',
        });
      } else {
        const isPolicyAligned = maTemplatesAligned && bannedAligned;
        items.push({
          id: 'assistant-customer-policy',
          category: 'Engine & IdP',
          name: 'Assistant Policy: Model Armor & Safety',
          sourceValue: srcPolicyLabel,
          targetValue: tgtPolicyLabel,
          status: isPolicyAligned ? 'MATCH' : 'DRIFT',
          severity: isPolicyAligned ? 'OK' : 'WARNING',
          details: isPolicyAligned
            ? 'Assistant Model Armor guardrails and banned phrase policies are aligned.'
            : 'Assistant customerPolicy (Model Armor failureMode, template coverage, or banned phrases count) differs between environments.',
          remediation: isPolicyAligned
            ? undefined
            : 'Synchronize customerPolicy.modelArmorConfig and bannedPhrases on destination default_assistant.',
        });
      }

      // 5b. Grounding flags comparison
      const formatGroundingFlags = (a: Assistant) => {
        const searchFlag = Boolean(a.googleSearchGroundingEnabled);
        const webType = a.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED';
        const toggleOff = Boolean(a.defaultWebGroundingToggleOff);
        return `GoogleSearch:${searchFlag ? 'ON' : 'OFF'} | Type:${webType} | DefaultOff:${toggleOff}`;
      };

      const srcGrounding = formatGroundingFlags(srcAsst);
      const tgtGrounding = formatGroundingFlags(tgtAsst);
      const isGroundingMatch = srcGrounding === tgtGrounding;

      items.push({
        id: 'assistant-grounding-flags',
        category: 'Engine & IdP',
        name: 'Assistant Grounding Flags',
        sourceValue: srcGrounding,
        targetValue: tgtGrounding,
        status: isGroundingMatch ? 'MATCH' : 'DRIFT',
        severity: isGroundingMatch ? 'OK' : 'WARNING',
        details: isGroundingMatch
          ? 'Assistant web & Google Search grounding settings match.'
          : 'Web / Google Search grounding configuration differs between Source and Target Assistants.',
        remediation: isGroundingMatch
          ? undefined
          : 'Align googleSearchGroundingEnabled, webGroundingType, and defaultWebGroundingToggleOff on target default_assistant.',
      });
    }
  }

  // -------------------------------------------------------------
  // Step 2: Grounding DataStores
  // -------------------------------------------------------------
  onProgress?.('Auditing Grounding DataStores...', 45);

  let sourceDataStores: DataStore[] = [];
  let targetDataStores: DataStore[] = [];
  let srcDsFetchFailed = false;
  let tgtDsFetchFailed = false;

  try {
    const srcDsRes = await api.listResources('dataStores', sourceConfig, undefined, 100, true);
    sourceDataStores = srcDsRes?.dataStores || [];
  } catch (err: unknown) {
    srcDsFetchFailed = true;
    items.push({
      id: 'src-datastores-error',
      category: 'Grounding DataStores',
      name: 'Source DataStores Discovery',
      sourceValue: 'NOT CHECKED',
      targetValue: 'N/A',
      status: 'UNKNOWN',
      severity: 'WARNING',
      details: `Could not list source DataStores: ${toErrorMessage(err)}`,
      remediation:
        'Re-run the audit with read access to the source project. Source datastores were not compared.',
    });
  }

  try {
    const tgtDsRes = await api.listResources('dataStores', targetConfig, undefined, 100, true);
    targetDataStores = tgtDsRes?.dataStores || [];
  } catch (err: unknown) {
    tgtDsFetchFailed = true;
    items.push({
      id: 'tgt-datastores-error',
      category: 'Grounding DataStores',
      name: 'Destination DataStores Discovery',
      sourceValue: 'N/A',
      targetValue: 'NOT CHECKED',
      status: 'UNKNOWN',
      severity: 'WARNING',
      details: `Could not list destination DataStores: ${toErrorMessage(err)}`,
      remediation:
        'Re-run the audit with read access to the destination project. Destination datastores were not compared.',
    });
  }

  if (!srcDsFetchFailed && !tgtDsFetchFailed) {
    const targetDsMap = new Map<string, DataStore>();
    const targetDsByName = new Map<string, DataStore>();

    targetDataStores.forEach((ds) => {
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
        details:
          'No DataStores found in source project. Agents do not depend on enterprise document grounding.',
      });
    } else {
      for (const srcDs of sourceDataStores) {
        const dsId = getResourceId(srcDs.name);
        const dsName = srcDs.displayName || dsId;
        const matchedTarget =
          targetDsMap.get(dsId) || targetDsByName.get(dsName.toLowerCase().trim());

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
              : `Map "${dsId}": "${targetDsId}" under datastoreMapping in migration-config.json.`,
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
            remediation: `Create a DataStore in the destination project with ID "${dsId}" or configure an explicit mapping in datastoreMapping.`,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Step 3: Registered Agents & Skills Registry
  // -------------------------------------------------------------
  onProgress?.('Auditing Registered Agents & Skills Registry...', 65);

  if (sourceEngine && targetEngine) {
    let sourceAgents: Agent[] = [];
    let targetAgents: Agent[] = [];
    let srcAgentsFailed = false;
    let tgtAgentsFailed = false;

    try {
      const srcAgtRes = await api.listResources('agents', sourceConfig, undefined, 100, true);
      sourceAgents = srcAgtRes?.agents || [];
    } catch (err: unknown) {
      srcAgentsFailed = true;
      items.push({
        id: 'src-agents-error',
        category: 'Skills & Tools',
        name: 'Source Registered Agents Discovery',
        sourceValue: 'NOT CHECKED',
        targetValue: 'N/A',
        status: 'UNKNOWN',
        severity: 'WARNING',
        details: `Could not list source registered agents: ${toErrorMessage(err)}`,
      });
    }

    try {
      const tgtAgtRes = await api.listResources('agents', targetConfig, undefined, 100, true);
      targetAgents = tgtAgtRes?.agents || [];
    } catch (err: unknown) {
      tgtAgentsFailed = true;
      items.push({
        id: 'tgt-agents-error',
        category: 'Skills & Tools',
        name: 'Destination Registered Agents Discovery',
        sourceValue: 'N/A',
        targetValue: 'NOT CHECKED',
        status: 'UNKNOWN',
        severity: 'WARNING',
        details: `Could not list destination registered agents: ${toErrorMessage(err)}`,
      });
    }

    if (!srcAgentsFailed && !tgtAgentsFailed) {
      const tgtAgentById = new Map<string, Agent>();
      const tgtAgentByName = new Map<string, Agent>();
      targetAgents.forEach((a) => {
        const id = getResourceId(a.name);
        if (id) tgtAgentById.set(id, a);
        if (a.displayName) {
          tgtAgentByName.set(a.displayName.toLowerCase().trim(), a);
        }
      });

      if (sourceAgents.length === 0) {
        items.push({
          id: 'no-source-agents',
          category: 'Skills & Tools',
          name: 'Registered Assistant Agents',
          sourceValue: '0 Agents',
          targetValue: `${targetAgents.length} Agents`,
          status: 'INFO',
          severity: 'OK',
          details: 'No custom or managed agents registered on source assistant.',
        });
      } else {
        for (const srcAgent of sourceAgents) {
          const agtId = getResourceId(srcAgent.name);
          const agtTitle = srcAgent.displayName || agtId;
          const srcType = inferAgentTypeLabel(srcAgent);
          const srcState = srcAgent.state || 'ENABLED';

          const matchedTgt =
            tgtAgentById.get(agtId) || tgtAgentByName.get(agtTitle.toLowerCase().trim());

          if (!matchedTgt) {
            items.push({
              id: `agent-${agtId}`,
              category: 'Skills & Tools',
              name: `Agent: ${agtTitle}`,
              sourceValue: `Type: ${srcType} | State: ${srcState}`,
              targetValue: 'MISSING IN TARGET',
              status: 'MISSING_IN_TARGET',
              severity: 'WARNING',
              details: `Registered agent "${agtTitle}" (${srcType}) is present in Source but has not been promoted to Destination.`,
              remediation: `Use the "Cross-Project Agent Promotion" tab to promote "${agtTitle}" to destination engine "${targetConfig.appId}".`,
            });
          } else {
            const tgtType = inferAgentTypeLabel(matchedTgt);
            const tgtState = matchedTgt.state || 'ENABLED';
            const isAligned = srcType === tgtType && srcState === tgtState;
            items.push({
              id: `agent-${agtId}`,
              category: 'Skills & Tools',
              name: `Agent: ${agtTitle}`,
              sourceValue: `Type: ${srcType} | State: ${srcState}`,
              targetValue: `Type: ${tgtType} | State: ${tgtState}`,
              status: isAligned ? 'MATCH' : 'DRIFT',
              severity: isAligned ? 'OK' : 'WARNING',
              details: isAligned
                ? `Registered agent "${agtTitle}" matches type (${tgtType}) and lifecycle state (${tgtState}).`
                : `Registered agent "${agtTitle}" differs between Source (${srcType}/${srcState}) and Destination (${tgtType}/${tgtState}).`,
              remediation: isAligned
                ? undefined
                : `Align agent lifecycle state or re-promote "${agtTitle}" via Cross-Project Agent Promotion.`,
            });
          }
        }
      }
    }
  }

  let sourceSkills: RegistrySkill[] = [];
  let targetSkills: RegistrySkill[] = [];
  let srcSkillsFetchFailed = false;
  let tgtSkillsFetchFailed = false;

  try {
    sourceSkills = await api.listRegistrySkills(sourceConfig);
  } catch (err: unknown) {
    srcSkillsFetchFailed = true;
    items.push({
      id: 'src-skills-error',
      category: 'Skills & Tools',
      name: 'Source Skills Discovery',
      sourceValue: 'ERROR',
      targetValue: 'N/A',
      status: 'UNKNOWN',
      severity: 'WARNING',
      details: `Could not list source skills: ${toErrorMessage(err)}`,
    });
  }

  try {
    targetSkills = await api.listRegistrySkills(targetConfig);
  } catch (err: unknown) {
    tgtSkillsFetchFailed = true;
    items.push({
      id: 'tgt-skills-error',
      category: 'Skills & Tools',
      name: 'Destination Skills Discovery',
      sourceValue: 'N/A',
      targetValue: 'ERROR',
      status: 'UNKNOWN',
      severity: 'WARNING',
      details: `Could not list destination skills: ${toErrorMessage(err)}`,
    });
  }

  if (!srcSkillsFetchFailed && !tgtSkillsFetchFailed) {
    const resolveScanPolicy = (s: RegistrySkill): string => {
      const explicit = s.scanningConfig?.policy;
      if (explicit) return explicit;
      const pub = (s.publisher || '').toLowerCase();
      if (pub.includes('cloud.google.com') || pub.includes('discoveryengine.googleapis.com')) {
        return 'GOOGLE_VERIFIED';
      }
      return 'ENABLED_BLOCKING';
    };

    const targetSkillMap = new Map<string, RegistrySkill>();
    targetSkills.forEach((s) => {
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
        details: 'No Agent Registry skills detected in source project.',
      });
    } else {
      for (const srcSkill of sourceSkills) {
        const skillId = srcSkill.skillId || srcSkill.name.split('/').pop() || srcSkill.displayName;
        const skillTitle = srcSkill.displayName || skillId;
        const matchedSkill =
          targetSkillMap.get(skillId) || targetSkillMap.get(skillTitle.toLowerCase().trim());

        if (matchedSkill) {
          const srcPolicy = resolveScanPolicy(srcSkill);
          const tgtPolicy = resolveScanPolicy(matchedSkill);
          const isPolicyMatch = srcPolicy === tgtPolicy;
          const isTargetDisabled = tgtPolicy === 'DISABLED';

          items.push({
            id: `skill-${skillId}`,
            category: 'Skills & Tools',
            name: `Skill: ${skillTitle}`,
            sourceValue: `State: ${srcSkill.state || 'ACTIVE'} | Scan: ${srcPolicy}`,
            targetValue: `State: ${matchedSkill.state || 'ACTIVE'} | Scan: ${tgtPolicy}`,
            status: !isPolicyMatch || isTargetDisabled ? 'DRIFT' : 'MATCH',
            severity: !isPolicyMatch || isTargetDisabled ? 'WARNING' : 'OK',
            details: isTargetDisabled
              ? `Destination skill "${skillTitle}" has security auto-scanning DISABLED (Source: ${srcPolicy}). New revisions will bypass LLM vulnerability & secret scanning.`
              : !isPolicyMatch
              ? `Skill exists in destination Agent Registry, but scanningConfig.policy differs (Source: ${srcPolicy} vs Target: ${tgtPolicy}).`
              : `Skill exists in destination Agent Registry with aligned scanning policy (${tgtPolicy}).`,
            remediation:
              !isPolicyMatch || isTargetDisabled
                ? `Update scanningConfig.policy on "${skillTitle}" in destination Agent Registry to "${srcPolicy === 'DISABLED' ? 'ENABLED_BLOCKING' : srcPolicy}".`
                : undefined,
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
            remediation: `Publish "${skillTitle}" to destination Agent Registry or use gemini-migrate v1.3.0 Tool Migrator.`,
          });
        }
      }
    }

    // Also flag any target-only skills that have security auto-scanning explicitly disabled
    for (const tgtSkill of targetSkills) {
      const tgtPolicy = resolveScanPolicy(tgtSkill);
      if (tgtPolicy === 'DISABLED') {
        const skillId = tgtSkill.skillId || tgtSkill.name.split('/').pop() || tgtSkill.displayName;
        const alreadyReported = items.some((it) => it.id === `skill-${skillId}`);
        if (!alreadyReported) {
          const skillTitle = tgtSkill.displayName || skillId;
          items.push({
            id: `tgt-skill-scan-disabled-${skillId}`,
            category: 'Skills & Tools',
            name: `Target Skill Auto-Scan: ${skillTitle}`,
            sourceValue: 'N/A (Target Only)',
            targetValue: 'Scan: DISABLED',
            status: 'DRIFT',
            severity: 'WARNING',
            details: `Destination skill "${skillTitle}" has automated security scanning DISABLED.`,
            remediation: `Enable ENABLED_BLOCKING scanning on "${skillTitle}" in Skills Registry or enforce custom.skillsScanningEnforcement Org Policy.`,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Step 4: Authorizations
  // -------------------------------------------------------------
  onProgress?.('Auditing Tool Authorizations...', 80);

  let sourceAuths: Authorization[] = [];
  let targetAuths: Authorization[] = [];
  let srcAuthsFetchFailed = false;
  let tgtAuthsFetchFailed = false;

  try {
    const res = await api.listAuthorizations(sourceConfig);
    sourceAuths = res?.authorizations || [];
  } catch (err: unknown) {
    srcAuthsFetchFailed = true;
    items.push({
      id: 'src-auths-error',
      category: 'Authorizations',
      name: 'Source Authorizations Discovery',
      sourceValue: 'ERROR',
      targetValue: 'N/A',
      status: 'UNKNOWN',
      severity: 'WARNING',
      details: `Could not list source authorizations: ${toErrorMessage(err)}`,
    });
  }

  try {
    const res = await api.listAuthorizations(targetConfig);
    targetAuths = res?.authorizations || [];
  } catch (err: unknown) {
    tgtAuthsFetchFailed = true;
    items.push({
      id: 'tgt-auths-error',
      category: 'Authorizations',
      name: 'Destination Authorizations Discovery',
      sourceValue: 'N/A',
      targetValue: 'ERROR',
      status: 'UNKNOWN',
      severity: 'WARNING',
      details: `Could not list destination authorizations: ${toErrorMessage(err)}`,
    });
  }

  if (!srcAuthsFetchFailed && !tgtAuthsFetchFailed && sourceAuths.length > 0) {
    const targetAuthMap = new Map<string, Authorization>();
    targetAuths.forEach((a) => {
      const id = getResourceId(a.name);
      targetAuthMap.set(id, a);
      const clientId = a.serverSideOauth2?.clientId || a.serverClientId;
      if (clientId) {
        targetAuthMap.set(clientId, a);
      }
    });

    for (const srcAuth of sourceAuths) {
      const authId = getResourceId(srcAuth.name);
      const srcClientId = srcAuth.serverSideOauth2?.clientId || srcAuth.serverClientId;
      const matchedAuth =
        targetAuthMap.get(authId) || (srcClientId ? targetAuthMap.get(srcClientId) : undefined);

      if (matchedAuth) {
        items.push({
          id: `auth-${authId}`,
          category: 'Authorizations',
          name: `Authorization: ${authId}`,
          sourceValue: 'Configured',
          targetValue: 'Configured',
          status: 'MATCH',
          severity: 'OK',
          details: 'Matching tool authorization exists in target environment.',
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
          remediation: `Provision tool authorization "${authId}" in target project before migrating connected agents.`,
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
      type LicenseStatLike = {
        usedLicenseCount?: number | string;
        assignedCount?: number | string;
        activeCount?: number | string;
      };
      const extractSeatCount = (l: LicenseStatLike) =>
        Number(l.usedLicenseCount ?? l.assignedCount ?? l.activeCount) || 0;

      const srcTotalUsed = srcLicenses.reduce(
        (acc: number, l: LicenseStatLike) => acc + extractSeatCount(l),
        0
      );
      const tgtTotalUsed = tgtLicenses.reduce(
        (acc: number, l: LicenseStatLike) => acc + extractSeatCount(l),
        0
      );
      const isMissingTargetSeats = srcTotalUsed > 0 && tgtTotalUsed === 0;

      items.push({
        id: 'license-stats-active',
        category: 'Licenses & Quotas',
        name: 'Active License Seats',
        sourceValue: `${srcTotalUsed} Assigned Users`,
        targetValue: `${tgtTotalUsed} Assigned Users`,
        status: isMissingTargetSeats ? 'DRIFT' : 'INFO',
        severity: isMissingTargetSeats ? 'WARNING' : 'OK',
        details: `Source has ${srcTotalUsed} active assigned user seats. Destination currently has ${tgtTotalUsed} seats allocated.`,
        remediation: isMissingTargetSeats
          ? `Allocate at least ${srcTotalUsed} Gemini Enterprise license seats in the destination project before user cutover.`
          : undefined,
      });
    }
  } catch (err: unknown) {
    items.push({
      id: 'license-stats-error',
      category: 'Licenses & Quotas',
      name: 'License Stats Discovery',
      sourceValue: 'ERROR',
      targetValue: 'ERROR',
      status: 'UNKNOWN',
      severity: 'WARNING',
      details: `Could not fetch license stats: ${toErrorMessage(err)}`,
    });
  }

  onProgress?.('Audit Complete.', 100);

  // -------------------------------------------------------------
  // Calculate Overall Alignment Score & Summary
  // -------------------------------------------------------------
  const totalChecks = items.length;
  const matchedCount = items.filter((i) => i.status === 'MATCH' || i.status === 'INFO').length;
  const driftCount = items.filter((i) => i.status === 'DRIFT').length;
  const missingCount = items.filter((i) => i.status === 'MISSING_IN_TARGET').length;
  const unknownCount = items.filter((i) => i.status === 'UNKNOWN').length;
  const actionableChecks = items.filter(
    (i) => i.status === 'MATCH' || i.status === 'DRIFT' || i.status === 'MISSING_IN_TARGET'
  ).length;

  // Score formula: Start at 100, deduct 15 for each missing blocker, 5 for each drift
  let score: number | null = 100 - missingCount * 15 - driftCount * 5;
  if (score < 0) score = 0;

  if (actionableChecks === 0) {
    score = null;
  } else if (!sourceEngine || !targetEngine) {
    score = 0;
  }

  return {
    overallScore: score,
    totalChecks,
    unknownCount,
    matchedCount,
    driftCount,
    missingCount,
    sourceProject: sourceConfig.projectId,
    targetProject: targetConfig.projectId,
    sourceEngine: sourceConfig.appId,
    targetEngine: targetConfig.appId,
    items,
    timestamp: new Date().toISOString(),
  };
}

export interface AgentPromotionRemapping {
  dataStoreMap?: Record<string, string>;
  connectorMap?: Record<string, string>;
  authorizationMap?: Record<string, string>;
  reasoningEngineMap?: Record<string, string>;
  targetReasoningEngineLocation?: string;
}

export interface AgentPromotionOutcome {
  sourceAgentName: string;
  displayName: string;
  action: 'CREATED' | 'UPDATED' | 'FAILED';
  targetAgentName?: string;
  error?: string;
}

function rewriteDataStoreSpecs(
  specsObj: AgentDataStoreSpecs | undefined,
  targetConfig: Config,
  dataStoreMap: Record<string, string>
): AgentDataStoreSpecs | undefined {
  if (!specsObj || !Array.isArray(specsObj.specs)) return specsObj;
  return {
    ...specsObj,
    specs: specsObj.specs.map((spec) => {
      if (!spec?.dataStore) return spec;
      const oldDsId = spec.dataStore.split('/').pop() || spec.dataStore;
      const mappedId = dataStoreMap[oldDsId] || dataStoreMap[spec.dataStore] || oldDsId;
      if (mappedId.startsWith('projects/')) {
        return { ...spec, dataStore: mappedId };
      }
      return {
        ...spec,
        dataStore: `projects/${targetConfig.projectId}/locations/${targetConfig.appLocation || 'global'}/collections/${targetConfig.collectionId || 'default_collection'}/dataStores/${mappedId}`,
      };
    }),
  };
}

function rewriteDataConnectors(
  connectors: AgentDataConnectorRef[] | undefined,
  targetConfig: Config,
  connectorMap: Record<string, string>
): AgentDataConnectorRef[] | undefined {
  if (!Array.isArray(connectors)) return connectors;
  return connectors.map((dc) => {
    if (!dc?.name) return dc;
    const match = dc.name.match(
      /^projects\/[^/]+\/locations\/[^/]+\/collections\/([^/]+)(\/.*)?$/
    );
    if (!match) {
      const mappedDirect = connectorMap[dc.name];
      return mappedDirect ? { ...dc, name: mappedDirect } : dc;
    }
    const oldCollectionId = match[1];
    const suffix = match[2] || '';
    const mappedCollectionOrFull =
      connectorMap[oldCollectionId] || connectorMap[dc.name] || oldCollectionId;
    if (mappedCollectionOrFull.startsWith('projects/')) {
      return { ...dc, name: mappedCollectionOrFull };
    }
    return {
      ...dc,
      name: `projects/${targetConfig.projectId}/locations/${targetConfig.appLocation || 'global'}/collections/${mappedCollectionOrFull}${suffix}`,
    };
  });
}

/**
 * Builds a clean, cross-project promoted Agent payload with rewritten Project, Location,
 * DataStore, Connector, Authorization, and Vertex AI Reasoning Engine resource bindings.
 */
export function buildPromotedAgentPayload(
  sourceAgent: Agent,
  targetConfig: Config,
  remapping: AgentPromotionRemapping = {}
): Partial<Agent> & Record<string, unknown> {
  const dsMap = remapping.dataStoreMap || {};
  const connMap = remapping.connectorMap || {};
  const authMap = remapping.authorizationMap || {};
  const reMap = remapping.reasoningEngineMap || {};

  const starterPrompts = (sourceAgent.starterPrompts || [])
    .map((p) => (p.text ? p.text.trim() : ''))
    .filter(Boolean)
    .map((text) => ({ text }));

  const payload: Partial<Agent> & Record<string, unknown> = {
    displayName: sourceAgent.displayName,
    description: sourceAgent.description || '',
    ...(sourceAgent.icon ? { icon: sourceAgent.icon } : {}),
    ...(starterPrompts.length > 0 ? { starterPrompts } : {}),
    ...(sourceAgent.sharingConfig ? { sharingConfig: sourceAgent.sharingConfig } : {}),
    ...(sourceAgent.observabilityConfig
      ? { observabilityConfig: { ...sourceAgent.observabilityConfig } }
      : {}),
    ...(sourceAgent.longRunningOperationsEnabled !== undefined
      ? { longRunningOperationsEnabled: sourceAgent.longRunningOperationsEnabled }
      : {}),
  };

  // Migrate both authorizationConfig and legacy authorizations into clean authorizationConfig
  const rawAuthList = [
    ...(sourceAgent.authorizationConfig?.toolAuthorizations || []),
    ...(sourceAgent.authorizations || []),
  ].filter(Boolean);

  if (rawAuthList.length > 0 || sourceAgent.authorizationConfig?.oauth2ClientId) {
    const rewrittenAuths = Array.from(new Set(rawAuthList)).map((authName) => {
      const oldId = authName.split('/').pop() || authName;
      const mapped = authMap[oldId] || authMap[authName] || oldId;
      if (mapped.startsWith('projects/')) return mapped;
      return `projects/${targetConfig.projectId}/locations/${targetConfig.appLocation || 'global'}/authorizations/${mapped}`;
    });
    payload.authorizationConfig = {
      ...(sourceAgent.authorizationConfig?.oauth2ClientId
        ? { oauth2ClientId: sourceAgent.authorizationConfig.oauth2ClientId }
        : {}),
      ...(rewrittenAuths.length > 0 ? { toolAuthorizations: rewrittenAuths } : {}),
    };
  }

  if (sourceAgent.dataStoreSpecs) {
    payload.dataStoreSpecs = rewriteDataStoreSpecs(sourceAgent.dataStoreSpecs, targetConfig, dsMap);
  }
  if (sourceAgent.dataConnectors) {
    payload.dataConnectors = rewriteDataConnectors(
      sourceAgent.dataConnectors,
      targetConfig,
      connMap
    );
  }

  const definitionKeys = Object.keys(sourceAgent).filter((k) =>
    k.toLowerCase().includes('agentdefinition')
  );

  for (const key of definitionKeys) {
    if (key === 'adkAgentDefinition' && sourceAgent.adkAgentDefinition) {
      const adkDef = sourceAgent.adkAgentDefinition;
      let rePath = adkDef.provisionedReasoningEngine?.reasoningEngine || '';
      if (rePath) {
        const parts = rePath.split('/');
        if (parts.length >= 6) {
          const oldReId = parts[parts.length - 1];
          const oldReLoc = parts[parts.length - 3];
          const mappedRe = reMap[oldReId] || reMap[rePath] || oldReId;
          if (mappedRe.startsWith('projects/')) {
            rePath = mappedRe;
          } else {
            const targetReLoc = isRegionalVertexLocation(remapping.targetReasoningEngineLocation)
              ? remapping.targetReasoningEngineLocation!.trim()
              : isRegionalVertexLocation(targetConfig.reasoningEngineLocation)
              ? targetConfig.reasoningEngineLocation!.trim()
              : oldReLoc;
            rePath = `projects/${targetConfig.projectId}/locations/${targetReLoc}/reasoningEngines/${mappedRe}`;
          }
        }
      }
      payload.adkAgentDefinition = {
        ...(adkDef.toolSettings ? { toolSettings: { ...adkDef.toolSettings } } : {}),
        ...(rePath ? { provisionedReasoningEngine: { reasoningEngine: rePath } } : {}),
      };
    } else if (key === 'lowCodeAgentDefinition' && sourceAgent.lowCodeAgentDefinition) {
      const normalized =
        'normalizeLowCodeAgentDefinitionForDeploy' in api &&
        typeof api.normalizeLowCodeAgentDefinitionForDeploy === 'function'
          ? api.normalizeLowCodeAgentDefinitionForDeploy(sourceAgent).lowCodeAgentDefinition
          : JSON.parse(JSON.stringify(sourceAgent.lowCodeAgentDefinition));

      if (Array.isArray(normalized.nodes)) {
        normalized.nodes = normalized.nodes.map((node) => {
          if (!node?.llmAgentNode) return node;
          return {
            ...node,
            llmAgentNode: {
              ...node.llmAgentNode,
              ...(node.llmAgentNode.dataStoreSpecs
                ? {
                    dataStoreSpecs: rewriteDataStoreSpecs(
                      node.llmAgentNode.dataStoreSpecs,
                      targetConfig,
                      dsMap
                    ),
                  }
                : {}),
              ...(node.llmAgentNode.dataConnectors
                ? {
                    dataConnectors: rewriteDataConnectors(
                      node.llmAgentNode.dataConnectors,
                      targetConfig,
                      connMap
                    ),
                  }
                : {}),
            },
          };
        });
      }
      payload.lowCodeAgentDefinition = normalized;
    } else {
      payload[key] = JSON.parse(
        JSON.stringify((sourceAgent as unknown as Record<string, unknown>)[key])
      );
    }
  }

  return payload;
}

/**
 * Promotes selected source agents into the destination Gemini Enterprise Engine via real
 * `api.createAgent` / `api.updateAgent` calls.
 */
export async function promoteAgentsToTarget(params: {
  agents: Agent[];
  targetConfig: Config;
  remapping?: AgentPromotionRemapping;
  updateExistingByName?: boolean;
}): Promise<AgentPromotionOutcome[]> {
  const { agents, targetConfig, remapping = {}, updateExistingByName = true } = params;
  const outcomes: AgentPromotionOutcome[] = [];

  let existingTargetAgents: Agent[] = [];
  if (updateExistingByName) {
    try {
      const res = await api.listResources('agents', targetConfig, undefined, 100, true);
      existingTargetAgents = res?.agents || [];
    } catch {
      existingTargetAgents = [];
    }
  }

  for (const srcAgent of agents) {
    const srcId = srcAgent.name.split('/').pop() || '';
    const payload = buildPromotedAgentPayload(srcAgent, targetConfig, remapping);

    const matchedExisting = updateExistingByName
      ? existingTargetAgents.find((t) => {
          const tId = t.name.split('/').pop() || '';
          return (
            tId === srcId ||
            (t.displayName &&
              srcAgent.displayName &&
              t.displayName.trim().toLowerCase() === srcAgent.displayName.trim().toLowerCase())
          );
        })
      : undefined;

    try {
      if (matchedExisting && 'updateAgent' in api && typeof api.updateAgent === 'function') {
        const updated = await api.updateAgent(matchedExisting, payload, targetConfig);
        outcomes.push({
          sourceAgentName: srcAgent.name,
          displayName: srcAgent.displayName || srcId,
          action: 'UPDATED',
          targetAgentName: updated?.name || matchedExisting.name,
        });
      } else {
        const preserveId =
          'isGoogleManagedAgent' in api &&
          typeof api.isGoogleManagedAgent === 'function' &&
          api.isGoogleManagedAgent(srcAgent)
            ? srcId
            : undefined;
        const created = await api.createAgent(payload, targetConfig, preserveId);
        outcomes.push({
          sourceAgentName: srcAgent.name,
          displayName: srcAgent.displayName || srcId,
          action: 'CREATED',
          targetAgentName: created?.name,
        });
      }
    } catch (err: unknown) {
      outcomes.push({
        sourceAgentName: srcAgent.name,
        displayName: srcAgent.displayName || srcId,
        action: 'FAILED',
        error: toErrorMessage(err),
      });
    }
  }

  return outcomes;
}

/**
 * Discovers live Engines, DataStores, Assistants, Agents, Authorizations, and Custom IAM Roles
 * from a project and exports a single HCL `.tf` configuration.
 */
export async function exportProjectTerraformSnapshot(sourceConfig: Config): Promise<string> {
  const [enginesRes, dsRes, asstRes, agtRes, authRes] = await Promise.all([
    api.listResources('engines', sourceConfig, undefined, 100, true).catch(() => ({ engines: [] })),
    api
      .listResources('dataStores', sourceConfig, undefined, 100, true)
      .catch(() => ({ dataStores: [] })),
    fetchDefaultAssistantForAudit(sourceConfig),
    sourceConfig.appId
      ? api.listResources('agents', sourceConfig, undefined, 100, true).catch(() => ({ agents: [] }))
      : Promise.resolve({ agents: [] }),
    'listAuthorizations' in api && typeof api.listAuthorizations === 'function'
      ? api.listAuthorizations(sourceConfig).catch(() => ({ authorizations: [] }))
      : Promise.resolve({ authorizations: [] }),
  ]);

  const customRoles: CustomRole[] = [];
  if ('gapiRequest' in api && typeof api.gapiRequest === 'function') {
    try {
      const rolesRes = await api.gapiRequest<{ roles?: CustomRole[] }>(
        `https://iam.googleapis.com/v1/projects/${sourceConfig.projectId}/roles?view=FULL`,
        'GET',
        sourceConfig.projectId,
        undefined,
        undefined,
        undefined,
        true
      );
      if (Array.isArray(rolesRes?.roles)) {
        customRoles.push(...rolesRes.roles.filter((r) => !r.deleted));
      }
    } catch {
      // Optional IAM custom roles discovery — proceed cleanly if caller lacks iam.roles.list
    }
  }

  return generateDiscoveryProjectTerraform({
    projectId: sourceConfig.projectId,
    location: sourceConfig.appLocation || 'global',
    collectionId: sourceConfig.collectionId || 'default_collection',
    engines: enginesRes?.engines || [],
    dataStores: dsRes?.dataStores || [],
    customRoles,
    assistants: asstRes.assistant ? [asstRes.assistant] : [],
    agents: agtRes?.agents || [],
    authorizations: authRes?.authorizations || [],
  });
}

/**
 * Generates an executive Markdown report from the audit summary.
 */
export function generateAuditMarkdown(summary: ConfigAuditSummary): string {
  const lines: string[] = [];

  const readinessPill =
    summary.overallScore === null
      ? '⚪ UNABLE TO ASSESS'
      : summary.overallScore >= 90
        ? '🟢 READY FOR CUTOVER'
        : summary.overallScore >= 70
          ? '🟡 REMEDIATION RECOMMENDED'
          : '🔴 BLOCKERS DETECTED';

  lines.push(`# 📊 Gemini Enterprise Pre-Cutover Configuration Audit`);
  lines.push(`**Generated**: \`${summary.timestamp}\`  `);
  lines.push(
    `**Source Environment**: \`${summary.sourceProject}\` (Engine: \`${summary.sourceEngine}\`)  `
  );
  lines.push(
    `**Destination Environment**: \`${summary.targetProject}\` (Engine: \`${summary.targetEngine}\`)  `
  );

  const scoreDisplay = summary.overallScore === null ? '?' : `${summary.overallScore}%`;
  lines.push(`**Readiness Status**: **${readinessPill}** (Parity Score: **${scoreDisplay}**)  `);
  lines.push('');

  lines.push(`---`);
  lines.push(`## 1. Executive Summary`);
  lines.push(`| Metric | Count | Assessment |`);
  lines.push(`| :--- | :---: | :--- |`);
  lines.push(
    `| **Total Configurations Audited** | \`${summary.totalChecks}\` | Comprehensive multi-pillar scan |`
  );
  lines.push(
    `| **✅ Identical / Compatible Matches** | \`${summary.matchedCount}\` | Ready for migration |`
  );
  lines.push(
    `| **🟡 Configuration Drift / Warnings** | \`${summary.driftCount}\` | Operational adjustments recommended |`
  );
  lines.push(
    `| **🔴 Missing in Destination** | \`${summary.missingCount}\` | Potential cutover blockers |`
  );
  if (summary.unknownCount > 0) {
    lines.push(
      `| **⚪ Unknown / Failed Checks** | \`${summary.unknownCount}\` | Manual verification required |`
    );
  }
  lines.push('');

  lines.push(`---`);
  lines.push(`## 2. Granular Audit Matrix`);
  lines.push(
    `| Pillar | Component / Asset | Source Setting | Destination Setting | Parity Status | Guidance / Remediation |`
  );
  lines.push(`| :--- | :--- | :--- | :--- | :---: | :--- |`);

  for (const item of summary.items) {
    const statusBadge =
      item.status === 'MATCH'
        ? '✅ MATCH'
        : item.status === 'DRIFT'
          ? '🟡 DRIFT'
          : item.status === 'MISSING_IN_TARGET'
            ? '🔴 MISSING'
            : item.status === 'UNKNOWN'
              ? '⚪ UNKNOWN'
              : 'ℹ️ INFO';

    const remediation = item.remediation ? `**Action:** ${item.remediation}` : item.details || 'OK';

    lines.push(
      `| \`${item.category}\` | **${item.name}** | \`${item.sourceValue ?? 'N/A'}\` | \`${item.targetValue ?? 'N/A'}\` | ${statusBadge} | ${remediation} |`
    );
  }

  lines.push('');
  lines.push(`---`);
  lines.push(`## 3. Recommended Cutover Actions`);
  if (
    summary.overallScore !== null &&
    summary.missingCount === 0 &&
    summary.driftCount === 0 &&
    summary.unknownCount === 0
  ) {
    lines.push(
      `- ✅ All configuration checks passed. The target environment is fully prepared for one-time cutover with \`gemini-migrate\`.`
    );
  } else {
    if (summary.overallScore === null || summary.unknownCount > 0) {
      lines.push(
        `- ⚪ **Resolve Unchecked / Inaccessible Resources**: ${summary.unknownCount} check(s) could not be completed due to missing permissions or unreachable endpoints. Grant read access and re-run the audit before cutover.`
      );
    }
    if (summary.missingCount > 0) {
      lines.push(
        `- 🔴 **Resolve Missing Assets**: Create or map the flagged DataStores, Policies, and Agents in destination project \`${summary.targetProject}\` prior to starting batch user transfer.`
      );
    }
    if (summary.driftCount > 0) {
      lines.push(
        `- 🟡 **Verify Drift Mappings**: Ensure \`idpMapping\` or \`datastoreMapping\` in \`migration-config.json\` accounts for differing IDs or IdP modes.`
      );
    }
  }

  return lines.join('\n');
}
