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

import { describe, it, expect } from 'vitest';
import {
  parseSkillOwnerPrincipal,
  isSkillAgentResource,
  isSkillPreinstalledForAll,
  classifySkillAgent,
  normalizeAppSkillForExport,
  normalizeRegistrySkillForExport,
  formatSkillsToCsv,
  formatSkillsToJson,
  formatSkillsToJsonl,
  formatSkillsToMarkdown,
  parseSkillMarkdown,
  buildSkillMarkdownDocument,
  sanitizeSkillDescription,
  validateSkillDescription,
  MAX_SKILL_DESCRIPTION_LENGTH,
} from './skillExportUtils';
import { Agent, RegistrySkill } from '../types';

describe('skillExportUtils', () => {
  describe('parseSkillOwnerPrincipal', () => {
    it('strips standard Google IAM user principal prefix', () => {
      expect(
        parseSkillOwnerPrincipal('principal://iam.googleapis.com/users/alice@company.com')
      ).toBe('alice@company.com');
    });

    it('extracts subject from Workforce Identity Federation (WIF) principal', () => {
      expect(
        parseSkillOwnerPrincipal(
          'principal://iam.googleapis.com/locations/global/workforcePools/corp-pool/subject/bob@idp.example.com'
        )
      ).toBe('bob@idp.example.com');
    });

    it('returns null for empty, whitespace, UNKNOWN, or non-string inputs (negative tests)', () => {
      expect(parseSkillOwnerPrincipal(undefined)).toBeNull();
      expect(parseSkillOwnerPrincipal(null)).toBeNull();
      expect(parseSkillOwnerPrincipal('   ')).toBeNull();
      expect(parseSkillOwnerPrincipal('UNKNOWN')).toBeNull();
      expect(parseSkillOwnerPrincipal('N/A')).toBeNull();
    });
  });

  describe('isSkillAgentResource', () => {
    it('returns true for agents with skillAgentDefinition or agentType SKILL', () => {
      expect(
        isSkillAgentResource({
          name: 'projects/p/locations/global/agents/s1',
          displayName: 'Query Helper',
          skillAgentDefinition: { instruction: 'Run SQL' },
        })
      ).toBe(true);
      expect(
        isSkillAgentResource({
          name: 'projects/p/locations/global/agents/s2',
          displayName: '1P Skill',
          agentType: 'SKILL',
        })
      ).toBe(true);
    });

    it('rejects standard conversational/A2A agents whose displayName happens to contain "skill" (negative test)', () => {
      expect(
        isSkillAgentResource({
          name: 'projects/p/locations/global/agents/a2a-coach',
          displayName: 'Employee Skill Matrix Coach',
          agentType: 'A2A',
        })
      ).toBe(false);
      expect(isSkillAgentResource(null)).toBe(false);
      expect(isSkillAgentResource(undefined)).toBe(false);
    });
  });

  describe('classifySkillAgent', () => {
    it('preserves USER_CREATED origin and owner principal even when skill is ENABLED org-wide', () => {
      const sharedUserSkill: Agent = {
        name: 'projects/123/locations/global/agents/shared-user-skill',
        displayName: 'Shared Team Formatter',
        state: 'ENABLED',
        sharingConfig: { scope: 'ALL_USERS' },
        skillAgentDefinition: {
          owner: 'principal://iam.googleapis.com/users/creator@company.com',
          instruction: '# Team Formatter',
        },
      };

      const res = classifySkillAgent(sharedUserSkill);
      expect(res.origin).toBe('USER_CREATED');
      expect(res.originLabel).toBe('👤 User-Created');
      expect(res.sharingScope).toBe('ORG_WIDE');
      expect(res.sharingLabel).toBe('Shared Org-Wide');
      expect(res.ownerPrincipal).toBe('creator@company.com');
      expect(res.isInstructionRedactedForAdmin).toBe(false);
    });

    it('detects Google 1P skills via geminiEnterpriseSkillConfig', () => {
      const google1pSkill = {
        name: 'projects/123/locations/global/agents/google-1p-skill',
        displayName: 'Google Workspace Summarizer',
        state: 'ENABLED',
        geminiEnterpriseSkillConfig: { skillId: 'workspace-summary' },
      } as unknown as Agent;

      const res = classifySkillAgent(google1pSkill);
      expect(res.origin).toBe('GOOGLE_1P');
      expect(res.originLabel).toBe('✨ Google (1P)');
      expect(res.sharingScope).toBe('ORG_WIDE');
    });

    it('marks PRIVATE user skills without instruction as redacted for admin inspection', () => {
      const privateRedactedSkill: Agent = {
        name: 'projects/123/locations/global/agents/priv-1',
        displayName: 'Secret Draft Skill',
        state: 'PRIVATE',
        skillAgentDefinition: {
          owner: 'principal://iam.googleapis.com/users/dev@company.com',
          // instruction omitted by backend for unshared PRIVATE skill
        },
      };

      const res = classifySkillAgent(privateRedactedSkill);
      expect(res.origin).toBe('USER_CREATED');
      expect(res.sharingScope).toBe('PRIVATE_PERSONAL');
      expect(res.isInstructionRedactedForAdmin).toBe(true);
    });

    it('resolves IAM policy email over opaque gaia:<hex> hash and formats raw gaia:<hex> hashes cleanly', () => {
      const skillWithGaiaAndIam: Agent = {
        name: 'projects/123/locations/global/agents/gaia-skill-1',
        displayName: 'Bill Fun Skill',
        state: 'PRIVATE',
        skillAgentDefinition: {
          owner: 'gaia:9e0b5b085d22ef88a123456789abcdef',
          instruction: '# Fun Skill',
        },
        iamPolicy: {
          bindings: [
            {
              role: 'roles/discoveryengine.agentOwner',
              members: ['user:admin@wdufrin.altostrat.com'],
            },
          ],
        },
      };

      const resolved = classifySkillAgent(skillWithGaiaAndIam);
      expect(resolved.origin).toBe('USER_CREATED');
      expect(resolved.ownerPrincipal).toBe('admin@wdufrin.altostrat.com');

      const skillWithRawGaiaOnly: Agent = {
        name: 'projects/123/locations/global/agents/gaia-skill-2',
        displayName: 'Unresolved Gaia Skill',
        state: 'PRIVATE',
        skillAgentDefinition: {
          owner: 'gaia:9e0b5b085d22ef88a123456789abcdef',
          instruction: '# Fun Skill',
        },
      };

      const fallback = classifySkillAgent(skillWithRawGaiaOnly);
      expect(fallback.origin).toBe('USER_CREATED');
      expect(fallback.ownerPrincipal).toBe('Google Account (gaia:9e0b5b08…)');
    });

    it('throws an explicit error when passed null or invalid input (negative test)', () => {
      expect(() => classifySkillAgent(null)).toThrow(
        /Cannot classify a null or non-object skill resource/
      );
    });
  });

  describe('Export Serialization (CSV, JSON, JSONL, SKILL.md)', () => {
    const sampleAppSkill: Agent = {
      name: 'projects/123/locations/global/collections/default_collection/engines/eng/assistants/default_assistant/agents/fin-skill',
      displayName: 'GAAP "Revenue" Checker',
      description: 'Validates quarterly revenue, margins, and quotes.',
      state: 'SUSPENDED',
      skillAgentDefinition: {
        owner: 'principal://iam.googleapis.com/users/cfo@company.com',
        instruction: '# Revenue Rules\nVerify ASC 606 compliance.',
      },
    };

    const sampleRegistrySkill: RegistrySkill = {
      name: 'projects/123/locations/global/skills/sec-audit',
      displayName: 'IAM Security Auditor',
      description: 'Scans IAM bindings for 0.0.0.0/0 or allUsers.',
      skillId: 'urn:skill:security:sec-audit',
      publisher: 'projects/123/publishers/security-team',
      state: 'STATE_ACTIVE',
      defaultRevision: 'projects/123/locations/global/skills/sec-audit/revisions/1',
    };

    it('normalizes and exports CSV with proper RFC 4180 quote escaping', () => {
      const rec1 = normalizeAppSkillForExport(sampleAppSkill);
      const rec2 = normalizeRegistrySkillForExport(sampleRegistrySkill);
      const csv = formatSkillsToCsv([rec1, rec2]);

      const lines = csv.split('\n');
      // 1 header line + row 1 (contains 1 embedded newline inside quoted instruction) + row 2 = 4 physical lines
      expect(lines.length).toBe(4);
      expect(lines[0]).toContain('skill_id,display_name,description,catalog_type,state,origin');
      // Verify embedded double quotes in display_name are escaped as ""
      expect(csv).toContain('"GAAP ""Revenue"" Checker"');
      expect(csv).toContain('"SUSPENDED"');
      expect(csv).toContain('"cfo@company.com"');
      expect(csv).toContain('"REGISTRY_SKILL"');
      expect(csv).toContain('"security-team"');
    });

    it('serializes JSON and JSONL with and without raw_resource', () => {
      const rec = normalizeAppSkillForExport(sampleAppSkill);
      const jsonWithoutRaw = JSON.parse(formatSkillsToJson([rec], false));
      expect(jsonWithoutRaw[0].skill_id).toBe('fin-skill');
      expect(jsonWithoutRaw[0].raw_resource).toBeUndefined();

      const jsonlLines = formatSkillsToJsonl([rec], true).split('\n');
      expect(jsonlLines).toHaveLength(1);
      const parsedLine = JSON.parse(jsonlLines[0]);
      expect(parsedLine.raw_resource.name).toBe(sampleAppSkill.name);
    });

    it('generates valid SKILL.md Markdown with YAML frontmatter', () => {
      const rec = normalizeAppSkillForExport(sampleAppSkill);
      const md = formatSkillsToMarkdown([rec]);
      expect(md).toContain('---\nname: fin-skill');
      expect(md).toContain('state: SUSPENDED');
      expect(md).toContain('owner: cfo@company.com');
      expect(md).toContain('# Revenue Rules\nVerify ASC 606 compliance.');
    });

    it('rejects malformed or missing skill objects during normalization and markdown export (negative tests)', () => {
      expect(() => normalizeAppSkillForExport({} as Agent)).toThrow(
        /Invalid App Skill resource: missing required "name" field/
      );
      expect(() => normalizeRegistrySkillForExport({} as RegistrySkill)).toThrow(
        /Invalid Registry Skill resource: missing required "name" field/
      );
      expect(() => formatSkillsToMarkdown([])).toThrow(
        /At least one skill record is required to generate SKILL\.md Markdown/
      );
      expect(() => formatSkillsToCsv(null as unknown as [])).toThrow(
        /Expected an array of skill export records/
      );
    });
  });

  describe('parseSkillMarkdown & buildSkillMarkdownDocument', () => {
    it('parses SKILL.md YAML frontmatter and extracts name, description, and Markdown body', () => {
      const raw = [
        '---',
        'name: global-router-skill',
        'display_name: "Global Router Skill"',
        'description: Route HR and Finance queries to single datastore.',
        '---',
        '',
        '# Global Routing Rules',
        '1. Never query more than 1 datastore per turn.',
      ].join('\n');

      const parsed = parseSkillMarkdown(raw);
      expect(parsed.hasFrontmatter).toBe(true);
      expect(parsed.name).toBe('global-router-skill');
      expect(parsed.displayName).toBe('Global Router Skill');
      expect(parsed.description).toBe('Route HR and Finance queries to single datastore.');
      expect(parsed.body).toBe('# Global Routing Rules\n1. Never query more than 1 datastore per turn.');

      const rebuilt = buildSkillMarkdownDocument({
        name: 'Updated Name!',
        description: 'Updated trigger description.',
        body: raw,
      });
      expect(rebuilt).toContain('name: updated-name');
      expect(rebuilt).toContain('description: Updated trigger description.');
      expect(rebuilt).toContain('# Global Routing Rules');
    });

    it('rejects malformed unclosed YAML frontmatter and non-string inputs (negative tests)', () => {
      const unclosedFrontmatter = '---\nname: broken-skill\ndescription: missing closing dashes\n# Body';
      expect(() => parseSkillMarkdown(unclosedFrontmatter)).toThrow(
        /Malformed SKILL\.md YAML frontmatter: opening "---" delimiter is missing a closing "---" delimiter/
      );
      expect(() => parseSkillMarkdown(null as unknown as string)).toThrow(
        /Expected a string when parsing SKILL\.md Markdown content/
      );
    });

    it('sanitizes and truncates 3160-character Skill descriptions to <= 1024 Unicode characters and validates length limits', () => {
      const sentence =
        'Routes enterprise queries across connected DataStores and BYOMCP tool servers with strict single-source selection. ';
      const oversizedDescription = sentence.repeat(30); // ~3,450 Unicode characters (> 3160)
      expect(Array.from(oversizedDescription).length).toBeGreaterThan(3160);

      // Negative validation check on raw oversized description
      const validationErr = validateSkillDescription(oversizedDescription);
      expect(validationErr).toMatch(/must be at most 1024 Unicode characters/i);

      // Sanitization must truncate cleanly to <= 1024 Unicode characters
      const sanitized = sanitizeSkillDescription(oversizedDescription);
      expect(Array.from(sanitized).length).toBeLessThanOrEqual(MAX_SKILL_DESCRIPTION_LENGTH);
      expect(sanitized.endsWith('.')).toBe(true);
      expect(validateSkillDescription(sanitized)).toBeNull();
    });
  });

  describe('isSkillPreinstalledForAll', () => {
    it('returns true only when defaultAgentUserData.installed is true and disabled is not true', () => {
      expect(
        isSkillPreinstalledForAll({
          defaultAgentUserData: { installed: true, disabled: false },
        })
      ).toBe(true);
      expect(
        isSkillPreinstalledForAll({
          defaultAgentUserData: { installed: true },
        })
      ).toBe(true);
    });

    it('returns false when disabled is true, installed is false, or data is missing (negative tests)', () => {
      expect(
        isSkillPreinstalledForAll({
          defaultAgentUserData: { installed: true, disabled: true },
        })
      ).toBe(false);
      expect(
        isSkillPreinstalledForAll({
          defaultAgentUserData: { installed: false, disabled: false },
        })
      ).toBe(false);
      expect(isSkillPreinstalledForAll({ defaultAgentUserData: null })).toBe(false);
      expect(isSkillPreinstalledForAll({})).toBe(false);
      expect(isSkillPreinstalledForAll(null)).toBe(false);
      expect(isSkillPreinstalledForAll(undefined)).toBe(false);
    });
  });
});

