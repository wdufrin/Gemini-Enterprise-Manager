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

import { Agent, RegistrySkill } from '../types';
import { extractAgentOwnerHint } from '../services/api/discovery/agents';

export type SkillOriginType = 'GOOGLE_1P' | 'ORG_ADMIN' | 'USER_CREATED';
export type SkillSharingScopeType = 'ORG_WIDE' | 'PRIVATE_PERSONAL';

export interface SkillClassification {
  origin: SkillOriginType;
  originLabel: string;
  sharingScope: SkillSharingScopeType;
  sharingLabel: string;
  ownerPrincipal: string | null;
  sourceTypeLabel: string;
  isInstructionRedactedForAdmin: boolean;
}

export interface NormalizedSkillExportRecord {
  skill_id: string;
  display_name: string;
  description: string;
  catalog_type: 'APP_SKILL' | 'REGISTRY_SKILL';
  state: string;
  origin: string;
  sharing_scope: string;
  owner: string;
  source_type: string;
  instruction: string;
  gcs_uri: string;
  agent_registry_skill: string;
  publisher: string;
  default_revision: string;
  resource_name: string;
  create_time: string;
  update_time: string;
  raw_resource: Agent | RegistrySkill;
}

const OPAQUE_GAIA_HEX_REGEX = /^gaia:[0-9a-f]{16,}$/i;

/**
 * Returns true if the string is an internal Discovery Engine `gaia:<hex>` CPI hash
 * rather than a human-readable email or Workforce Identity subject.
 */
export function isOpaqueGaiaOwnerHash(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  return OPAQUE_GAIA_HEX_REGEX.test(value.trim());
}

/**
 * Normalizes an IAM principal string (such as `principal://iam.googleapis.com/users/alice@company.com`
 * or Workforce Identity `principal://iam.googleapis.com/locations/global/workforcePools/pool/subject/alice@company.com`)
 * into a concise human-readable identifier.
 */
export function parseSkillOwnerPrincipal(rawOwner?: string | null): string | null {
  if (typeof rawOwner !== 'string') return null;
  const trimmed = rawOwner.trim();
  if (!trimmed || trimmed === 'UNKNOWN' || trimmed === 'N/A') return null;

  if (trimmed.startsWith('principal://iam.googleapis.com/users/')) {
    const email = trimmed.slice('principal://iam.googleapis.com/users/'.length).trim();
    return email || null;
  }

  const wifSubjectIdx = trimmed.indexOf('/subject/');
  if (
    (trimmed.startsWith('principal://iam.googleapis.com/') ||
      trimmed.startsWith('//iam.googleapis.com/')) &&
    wifSubjectIdx !== -1
  ) {
    const subject = trimmed.slice(wifSubjectIdx + '/subject/'.length).trim();
    return subject || trimmed;
  }

  const strippedPrefix = trimmed.replace(/^(user:|serviceAccount:|group:|domain:)/i, '').trim();
  return strippedPrefix || null;
}

/**
 * Returns true if the given Discovery Engine `Agent` resource represents a Skill
 * (`agentType === 'SKILL'`, `skillAgentDefinition`, or `geminiEnterpriseSkillConfig`).
 * Does NOT match normal conversational/A2A/Data agents merely because their display name contains "skill".
 */
export function isSkillAgentResource(agent: Partial<Agent> | null | undefined): boolean {
  if (!agent || typeof agent !== 'object') return false;
  const rec = agent as Record<string, unknown>;
  if ((agent.agentType || '').toUpperCase() === 'SKILL') return true;
  if (agent.skillAgentDefinition && typeof agent.skillAgentDefinition === 'object') return true;
  if (rec.geminiEnterpriseSkillConfig && typeof rec.geminiEnterpriseSkillConfig === 'object') {
    return true;
  }
  return false;
}

/**
 * Classifies a Discovery Engine Skill (`Agent`) along two orthogonal axes:
 * 1. Origin (`GOOGLE_1P` vs `USER_CREATED` vs `ORG_ADMIN`)
 * 2. Sharing Scope (`ORG_WIDE` vs `PRIVATE_PERSONAL`)
 *
 * This prevents the bug where `state === 'ENABLED'` user-created skills were misclassified
 * as admin-created organizational skills and had their creator (`skillAgentDefinition.owner`) hidden.
 */
export function classifySkillAgent(skill: Partial<Agent> | null | undefined): SkillClassification {
  if (!skill || typeof skill !== 'object') {
    throw new Error('Cannot classify a null or non-object skill resource.');
  }

  const rec = skill as Record<string, unknown>;
  const skillDef = skill.skillAgentDefinition;
  const has1PConfig = Boolean(
    rec.geminiEnterpriseSkillConfig && typeof rec.geminiEnterpriseSkillConfig === 'object'
  );

  // Extract raw owner from skillAgentDefinition or top-level fields
  const rawSkillOwner = parseSkillOwnerPrincipal(
    skillDef?.owner ||
      ((skillDef as Record<string, unknown> | undefined)?.ownerName as string | undefined) ||
      (rec.ownerEmail as string | undefined) ||
      (rec.creatorEmail as string | undefined)
  );

  // Also check IAM policy / extractAgentOwnerHint so if rawSkillOwner is an opaque `gaia:<hex>` hash,
  // we resolve the actual user email from `skill.iamPolicy` when available.
  const iamOrHintOwner = parseSkillOwnerPrincipal(extractAgentOwnerHint(skill));

  let ownerPrincipal: string | null = rawSkillOwner;
  if (iamOrHintOwner && (!rawSkillOwner || isOpaqueGaiaOwnerHash(rawSkillOwner))) {
    ownerPrincipal = iamOrHintOwner;
  }
  if (ownerPrincipal && isOpaqueGaiaOwnerHash(ownerPrincipal)) {
    // Format opaque `gaia:9e0b5b08...` into a clean short identifier instead of overflowing hex
    ownerPrincipal = `Google Account (${ownerPrincipal.slice(0, 13)}…)`;
  }

  let origin: SkillOriginType = 'ORG_ADMIN';
  let originLabel = '🏢 Organization';
  if (has1PConfig) {
    origin = 'GOOGLE_1P';
    originLabel = '✨ Google (1P)';
  } else if (rawSkillOwner || ownerPrincipal) {
    origin = 'USER_CREATED';
    originLabel = '👤 User-Created';
  }

  const normalizedState = (skill.state || 'PRIVATE').toUpperCase();
  const isSharedScope =
    normalizedState === 'ENABLED' ||
    skill.sharingConfig?.scope === 'ALL_USERS';
  const sharingScope: SkillSharingScopeType = isSharedScope ? 'ORG_WIDE' : 'PRIVATE_PERSONAL';
  const sharingLabel = isSharedScope ? 'Shared Org-Wide' : 'Personal Scope';

  const sourceTypeLabel = has1PConfig
    ? 'Google Built-In (1P)'
    : skillDef?.agentRegistrySkill
    ? 'Agent Registry'
    : skillDef?.gcsUri
    ? 'Cloud Storage (GCS)'
    : 'Inline Instructions';

  const hasInstruction = Boolean(skillDef?.instruction && skillDef.instruction.trim().length > 0);
  const isInstructionRedactedForAdmin =
    !hasInstruction &&
    !skillDef?.gcsUri &&
    !skillDef?.agentRegistrySkill &&
    !has1PConfig &&
    normalizedState === 'PRIVATE';

  return {
    origin,
    originLabel,
    sharingScope,
    sharingLabel,
    ownerPrincipal,
    sourceTypeLabel,
    isInstructionRedactedForAdmin,
  };
}

/**
 * Normalizes an App-level `Agent` skill into a flat `NormalizedSkillExportRecord`.
 */
export function normalizeAppSkillForExport(skill: Agent): NormalizedSkillExportRecord {
  if (!skill || typeof skill !== 'object' || !skill.name) {
    throw new Error('Invalid App Skill resource: missing required "name" field.');
  }
  const classification = classifySkillAgent(skill);
  const skillId = skill.name.split('/').pop() || skill.id || skill.name;
  const skillDef = skill.skillAgentDefinition;

  return {
    skill_id: skillId,
    display_name: skill.displayName || skillId,
    description: skill.description || '',
    catalog_type: 'APP_SKILL',
    state: skill.state || 'PRIVATE',
    origin: classification.origin,
    sharing_scope: classification.sharingScope,
    owner: classification.ownerPrincipal || 'Organization Admin',
    source_type: classification.sourceTypeLabel,
    instruction: skillDef?.instruction || '',
    gcs_uri: skillDef?.gcsUri || '',
    agent_registry_skill: skillDef?.agentRegistrySkill || '',
    publisher: classification.origin === 'GOOGLE_1P' ? 'Google' : 'DiscoveryEngine',
    default_revision: skill.activeRevision || '',
    resource_name: skill.name,
    create_time: skill.createTime || '',
    update_time: skill.updateTime || '',
    raw_resource: skill,
  };
}

/**
 * Normalizes a Cloud Agent Registry `RegistrySkill` into a flat `NormalizedSkillExportRecord`.
 */
export function normalizeRegistrySkillForExport(skill: RegistrySkill): NormalizedSkillExportRecord {
  if (!skill || typeof skill !== 'object' || !skill.name) {
    throw new Error('Invalid Registry Skill resource: missing required "name" field.');
  }
  const skillId = skill.name.split('/').pop() || skill.skillId || skill.name;
  const publisher = skill.publisher ? skill.publisher.split('/').pop() || skill.publisher : 'Default';
  const instructionFromFrontmatter =
    typeof skill.frontmatter?.instruction === 'string'
      ? skill.frontmatter.instruction
      : '';

  return {
    skill_id: skillId,
    display_name: skill.displayName || skillId,
    description: skill.description || '',
    catalog_type: 'REGISTRY_SKILL',
    state: skill.state || skill.targetState || 'STATE_ACTIVE',
    origin: 'ORG_ADMIN',
    sharing_scope: skill.state === 'STATE_ACTIVE' ? 'ORG_WIDE' : 'PRIVATE_PERSONAL',
    owner: publisher,
    source_type: 'Cloud Agent Registry',
    instruction: instructionFromFrontmatter,
    gcs_uri: '',
    agent_registry_skill: skill.name,
    publisher,
    default_revision: skill.defaultRevision || '',
    resource_name: skill.name,
    create_time: skill.createTime || '',
    update_time: skill.updateTime || '',
    raw_resource: skill,
  };
}

const CSV_COLUMNS: Array<keyof Omit<NormalizedSkillExportRecord, 'raw_resource'>> = [
  'skill_id',
  'display_name',
  'description',
  'catalog_type',
  'state',
  'origin',
  'sharing_scope',
  'owner',
  'source_type',
  'instruction',
  'gcs_uri',
  'agent_registry_skill',
  'publisher',
  'default_revision',
  'resource_name',
  'create_time',
  'update_time',
];

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Formats normalized skill records into RFC 4180 CSV content.
 */
export function formatSkillsToCsv(records: NormalizedSkillExportRecord[]): string {
  if (!Array.isArray(records)) {
    throw new Error('Expected an array of skill export records for CSV serialization.');
  }
  const headerRow = CSV_COLUMNS.join(',');
  const dataRows = records.map((rec) =>
    CSV_COLUMNS.map((col) => escapeCsvCell(rec[col])).join(',')
  );
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Formats normalized skill records into pretty-printed JSON.
 */
export function formatSkillsToJson(
  records: NormalizedSkillExportRecord[],
  includeRawResource = true
): string {
  if (!Array.isArray(records)) {
    throw new Error('Expected an array of skill export records for JSON serialization.');
  }
  const output = includeRawResource
    ? records
    : records.map(({ raw_resource: _raw, ...rest }) => rest);
  return JSON.stringify(output, null, 2);
}

/**
 * Formats normalized skill records into newline-delimited JSON Lines (JSONL) for BigQuery / SIEM ingestion.
 */
export function formatSkillsToJsonl(
  records: NormalizedSkillExportRecord[],
  includeRawResource = true
): string {
  if (!Array.isArray(records)) {
    throw new Error('Expected an array of skill export records for JSONL serialization.');
  }
  return records
    .map((rec) => {
      if (includeRawResource) return JSON.stringify(rec);
      const { raw_resource: _raw, ...rest } = rec;
      return JSON.stringify(rest);
    })
    .join('\n');
}

/**
 * Formats one or more normalized skills into portable `SKILL.md` Markdown format with YAML frontmatter.
 */
export function formatSkillsToMarkdown(records: NormalizedSkillExportRecord[]): string {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('At least one skill record is required to generate SKILL.md Markdown.');
  }

  return records
    .map((rec) => {
      const trimmedInstruction = (rec.instruction || '').trim();
      // If instruction already begins with YAML frontmatter (`---\n`), preserve it directly
      if (trimmedInstruction.startsWith('---\n') || trimmedInstruction.startsWith('---\r\n')) {
        return trimmedInstruction;
      }

      const safeName = rec.skill_id.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase() || 'skill';
      const safeDesc = (rec.description || rec.display_name).replace(/\r?\n/g, ' ').trim();
      const body =
        trimmedInstruction ||
        (rec.state === 'PRIVATE'
          ? `> Note: Instructions for this PRIVATE skill (${rec.display_name}) are not exposed by the Discovery Engine API until the owner (${rec.owner}) shares the skill.`
          : `# ${rec.display_name}\n\n${rec.description || 'No inline instructions provided.'}`);

      return [
        '---',
        `name: ${safeName}`,
        `description: ${safeDesc}`,
        `state: ${rec.state}`,
        `origin: ${rec.origin}`,
        `sharing_scope: ${rec.sharing_scope}`,
        `owner: ${rec.owner}`,
        '---',
        '',
        body,
      ].join('\n');
    })
    .join('\n\n<!-- ========================================== -->\n\n');
}
