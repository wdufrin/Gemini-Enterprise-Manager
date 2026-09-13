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

export function validateBackupSchema(
  data: unknown,
  section: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Backup content is not a valid JSON object.'] };
  }
  const obj = data as Record<string, unknown>;

  if (obj.type !== section) {
    errors.push(`Invalid backup type: expected '${section}', got '${String(obj.type)}'.`);
  }

  switch (section) {
    case 'DiscoveryResources':
      if (!Array.isArray(obj.collections)) {
        errors.push("Missing or invalid 'collections' array in DiscoveryResources backup.");
      }
      break;
    case 'ReasoningEngine':
      if (!obj.engine || typeof obj.engine !== 'object') {
        errors.push("Missing or invalid 'engine' object in ReasoningEngine backup.");
      }
      break;
    case 'Assistant':
      if (!obj.assistant || typeof obj.assistant !== 'object') {
        errors.push("Missing or invalid 'assistant' object in Assistant backup.");
      } else {
        const assistant = obj.assistant as Record<string, unknown>;
        if (assistant.agents && !Array.isArray(assistant.agents)) {
          errors.push("Invalid 'agents' property in Assistant backup (must be an array).");
        }
      }
      break;
    case 'Agents':
      if (!Array.isArray(obj.agents)) {
        errors.push("Missing or invalid 'agents' array in Agents backup.");
      }
      break;
    case 'DataStores':
      if (!Array.isArray(obj.dataStores)) {
        errors.push("Missing or invalid 'dataStores' array in DataStores backup.");
      }
      break;
    case 'Authorizations':
      if (!Array.isArray(obj.authorizations)) {
        errors.push("Missing or invalid 'authorizations' array in Authorizations backup.");
      }
      break;
    case 'ChatHistory':
      if (!Array.isArray(obj.discoverySessions) && !Array.isArray(obj.reasoningSessions)) {
        errors.push(
          "ChatHistory backup must contain either 'discoverySessions' or 'reasoningSessions' array."
        );
      }
      break;
    case 'NotebookLM':
      if (!Array.isArray(obj.notebooks)) {
        errors.push("Missing or invalid 'notebooks' array in NotebookLM backup.");
      }
      break;
    default:
      break;
  }

  const checkAgents = (agents: unknown[]) => {
    agents.forEach((a, idx) => {
      if (a && typeof a === 'object') {
        const agentObj = a as Record<string, unknown>;
        if (
          'iamPolicy' in agentObj &&
          agentObj.iamPolicy !== undefined &&
          agentObj.iamPolicy !== null
        ) {
          if (typeof agentObj.iamPolicy !== 'object') {
            errors.push(`Agent at index ${idx} has invalid 'iamPolicy' (not an object).`);
          } else {
            const policy = agentObj.iamPolicy as Record<string, unknown>;
            if ('bindings' in policy && policy.bindings !== undefined && policy.bindings !== null) {
              if (!Array.isArray(policy.bindings)) {
                errors.push(
                  `Agent '${String(agentObj.displayName ?? idx)}' has invalid 'iamPolicy.bindings' (must be an array).`
                );
              } else {
                policy.bindings.forEach((binding, bIdx) => {
                  if (!binding || typeof binding !== 'object') {
                    errors.push(
                      `Agent '${String(agentObj.displayName ?? idx)}' binding ${bIdx} is not an object.`
                    );
                  } else {
                    const b = binding as Record<string, unknown>;
                    if (typeof b.role !== 'string' || !b.role.trim()) {
                      errors.push(
                        `Agent '${String(agentObj.displayName ?? idx)}' binding ${bIdx} is missing a valid 'role'.`
                      );
                    }
                    if (
                      !Array.isArray(b.members) ||
                      !b.members.every((m) => typeof m === 'string')
                    ) {
                      errors.push(
                        `Agent '${String(agentObj.displayName ?? idx)}' binding ${bIdx} has invalid 'members' (must be array of strings).`
                      );
                    }
                  }
                });
              }
            }
          }
        }
      }
    });
  };

  if (Array.isArray(obj.agents)) {
    checkAgents(obj.agents);
  }
  if (obj.assistant && typeof obj.assistant === 'object') {
    const ast = obj.assistant as Record<string, unknown>;
    if (Array.isArray(ast.agents)) {
      checkAgents(ast.agents);
    }
  }

  return { valid: errors.length === 0, errors };
}
