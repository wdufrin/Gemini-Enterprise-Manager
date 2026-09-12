/**
 * Copyright 2025 Google LLC
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
import { validateBackupSchema } from './BackupPage';

describe('validateBackupSchema', () => {
  it('rejects null or non-object payloads', () => {
    expect(validateBackupSchema(null, 'Agents').valid).toBe(false);
    expect(validateBackupSchema('string data', 'Agents').valid).toBe(false);
    expect(validateBackupSchema(123, 'Agents').valid).toBe(false);
  });

  it('rejects payload with mismatched backup type', () => {
    const data = { type: 'DataStores', agents: [] };
    const result = validateBackupSchema(data, 'Agents');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("expected 'Agents'"))).toBe(true);
  });

  it('validates DiscoveryResources backup structure', () => {
    expect(validateBackupSchema({ type: 'DiscoveryResources' }, 'DiscoveryResources').valid).toBe(false);
    expect(
      validateBackupSchema({ type: 'DiscoveryResources', collections: [] }, 'DiscoveryResources').valid
    ).toBe(true);
  });

  it('validates ReasoningEngine backup structure', () => {
    expect(validateBackupSchema({ type: 'ReasoningEngine' }, 'ReasoningEngine').valid).toBe(false);
    expect(
      validateBackupSchema({ type: 'ReasoningEngine', engine: { displayName: 'Engine1' } }, 'ReasoningEngine').valid
    ).toBe(true);
  });

  it('validates Assistant and nested agents structure', () => {
    expect(validateBackupSchema({ type: 'Assistant' }, 'Assistant').valid).toBe(false);
    expect(
      validateBackupSchema({ type: 'Assistant', assistant: { agents: 'invalid' } }, 'Assistant').valid
    ).toBe(false);
    expect(
      validateBackupSchema({ type: 'Assistant', assistant: { agents: [] } }, 'Assistant').valid
    ).toBe(true);
  });

  it('validates Agents backup and IAM policy bindings integrity', () => {
    // Valid agent with valid IAM bindings
    const validData = {
      type: 'Agents',
      agents: [
        {
          displayName: 'ResearchAgent',
          iamPolicy: {
            bindings: [
              {
                role: 'roles/discoveryengine.editor',
                members: ['user:alice@example.com'],
              },
            ],
          },
        },
      ],
    };
    expect(validateBackupSchema(validData, 'Agents').valid).toBe(true);

    // Corrupted IAM binding: missing role
    const invalidRole = {
      type: 'Agents',
      agents: [
        {
          displayName: 'ResearchAgent',
          iamPolicy: {
            bindings: [{ members: ['user:alice@example.com'] }],
          },
        },
      ],
    };
    const invalidRoleRes = validateBackupSchema(invalidRole, 'Agents');
    expect(invalidRoleRes.valid).toBe(false);
    expect(invalidRoleRes.errors.some(e => e.includes("missing a valid 'role'"))).toBe(true);

    // Corrupted IAM binding: members is not an array of strings
    const invalidMembers = {
      type: 'Agents',
      agents: [
        {
          displayName: 'ResearchAgent',
          iamPolicy: {
            bindings: [{ role: 'roles/editor', members: 'not-an-array' }],
          },
        },
      ],
    };
    const invalidMembersRes = validateBackupSchema(invalidMembers, 'Agents');
    expect(invalidMembersRes.valid).toBe(false);
    expect(invalidMembersRes.errors.some(e => e.includes("must be array of strings"))).toBe(true);
  });

  it('validates DataStores, Authorizations, and NotebookLM backup structures', () => {
    expect(validateBackupSchema({ type: 'DataStores', dataStores: [] }, 'DataStores').valid).toBe(true);
    expect(validateBackupSchema({ type: 'Authorizations', authorizations: [] }, 'Authorizations').valid).toBe(true);
    expect(validateBackupSchema({ type: 'NotebookLM', notebooks: [] }, 'NotebookLM').valid).toBe(true);
  });
});
