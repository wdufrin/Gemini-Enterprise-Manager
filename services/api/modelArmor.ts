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

import { Config } from "../../types";
import { gapiRequest } from "./core";

export type ModelArmorMatchingScope =
  | "MATCHING_SCOPE_PARTIAL_MATCH"
  | "MATCHING_SCOPE_FULL_MATCH"
  | "MATCHING_SCOPE_UNSPECIFIED"
  | string;

export type ModelArmorExclusionFilterType =
  | "PROMPT_INJECTION_AND_JAILBREAK"
  | "RESPONSIBLE_AI"
  | string;

export interface ModelArmorExclusionRule {
  dictionary?: {
    wordList?: {
      words?: string[];
    };
  };
  regex?: {
    pattern?: string;
  };
  matchingScope?: ModelArmorMatchingScope;
}

export interface ModelArmorFilterRule {
  exclusionRule?: ModelArmorExclusionRule;
}

export interface ModelArmorFilterRuleSet {
  filterTypes?: ModelArmorExclusionFilterType[];
  rules?: ModelArmorFilterRule[];
}

export interface ModelArmorFilterRuleSettings {
  ruleSets?: ModelArmorFilterRuleSet[];
}

export interface ModelArmorTemplate {
  name?: string;
  metadata?: Record<string, unknown>;
  templateMetadata?: {
    ignorePartialInvocationFailures?: boolean;
    enforcementType?: string;
    logSanitizeOperations?: boolean;
    dataResidencyCompliant?: boolean;
    [key: string]: unknown;
  };
  filterConfig?: {
    filterRuleSettings?: ModelArmorFilterRuleSettings;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const fetchModelArmorTemplates = async (
  config: Omit<Config, "accessToken">,
): Promise<{ templates?: ModelArmorTemplate[] }> => {
  const { projectId } = config;
  const url = `https://modelarmor.googleapis.com/v1/projects/${projectId}/locations/-/templates`;
  return gapiRequest<{ templates?: ModelArmorTemplate[] }>(url, "GET", projectId);
};

export const createModelArmorTemplate = async (
  projectId: string,
  location: string,
  templateId: string,
  payload: ModelArmorTemplate,
): Promise<ModelArmorTemplate> => {
  const host =
    !location || location === "global"
      ? "modelarmor.googleapis.com"
      : `modelarmor.${location}.rep.googleapis.com`;
  const url = `https://${host}/v1/projects/${projectId}/locations/${location}/templates?templateId=${templateId}`;
  return gapiRequest<ModelArmorTemplate>(url, "POST", projectId, undefined, payload);
};

export interface ApplyExclusionRuleInput {
  filterType: ModelArmorExclusionFilterType;
  exclusionRule: ModelArmorExclusionRule;
  enableLogSanitizeOperations?: boolean;
  enforceDataResidencyCompliance?: boolean;
}

/**
 * Merges a new exclusion rule into an existing template's `filterConfig.filterRuleSettings`
 * without dropping existing ruleSets or rules (per Model Armor PATCH requirements).
 */
export const mergeExclusionRuleIntoSettings = (
  existingSettings: ModelArmorFilterRuleSettings | undefined,
  filterType: ModelArmorExclusionFilterType,
  newExclusionRule: ModelArmorExclusionRule,
): ModelArmorFilterRuleSettings => {
  const existingRuleSets: ModelArmorFilterRuleSet[] = Array.isArray(existingSettings?.ruleSets)
    ? existingSettings!.ruleSets!.map((rs) => ({
        filterTypes: Array.isArray(rs.filterTypes) ? [...rs.filterTypes] : [],
        rules: Array.isArray(rs.rules)
          ? rs.rules.map((r) => ({
              exclusionRule: r.exclusionRule
                ? {
                    ...r.exclusionRule,
                    dictionary: r.exclusionRule.dictionary
                      ? {
                          wordList: {
                            words: Array.isArray(r.exclusionRule.dictionary.wordList?.words)
                              ? [...r.exclusionRule.dictionary.wordList!.words!]
                              : [],
                          },
                        }
                      : undefined,
                    regex: r.exclusionRule.regex ? { ...r.exclusionRule.regex } : undefined,
                  }
                : undefined,
            }))
          : [],
      }))
    : [];

  const targetScope = newExclusionRule.matchingScope || "MATCHING_SCOPE_PARTIAL_MATCH";

  // Find a ruleSet whose filterTypes is specifically [filterType] or includes filterType
  let targetRuleSet = existingRuleSets.find(
    (rs) => Array.isArray(rs.filterTypes) && rs.filterTypes.length === 1 && rs.filterTypes[0] === filterType,
  );
  if (!targetRuleSet) {
    targetRuleSet = existingRuleSets.find(
      (rs) => Array.isArray(rs.filterTypes) && rs.filterTypes.includes(filterType),
    );
  }

  if (!targetRuleSet) {
    targetRuleSet = {
      filterTypes: [filterType],
      rules: [],
    };
    existingRuleSets.push(targetRuleSet);
  }

  const rules = targetRuleSet.rules || [];
  targetRuleSet.rules = rules;

  if (newExclusionRule.dictionary?.wordList?.words) {
    const newWords = newExclusionRule.dictionary.wordList.words
      .map((w) => w.trim())
      .filter(Boolean);

    // Check if there is an existing dictionary rule with the same matchingScope that has room (< 100 words)
    const existingDictRule = rules.find(
      (r) =>
        r.exclusionRule?.dictionary?.wordList?.words &&
        (r.exclusionRule.matchingScope || "MATCHING_SCOPE_PARTIAL_MATCH") === targetScope &&
        r.exclusionRule.dictionary.wordList.words.length + newWords.length <= 100,
    );

    if (existingDictRule && existingDictRule.exclusionRule?.dictionary?.wordList) {
      const currentWords = existingDictRule.exclusionRule.dictionary.wordList.words || [];
      for (const word of newWords) {
        if (!currentWords.includes(word)) {
          currentWords.push(word);
        }
      }
      existingDictRule.exclusionRule.dictionary.wordList.words = currentWords;
    } else {
      rules.push({
        exclusionRule: {
          dictionary: {
            wordList: {
              words: Array.from(new Set(newWords)),
            },
          },
          matchingScope: targetScope,
        },
      });
    }
  } else if (newExclusionRule.regex?.pattern) {
    const pattern = newExclusionRule.regex.pattern.trim();
    const alreadyExists = rules.some(
      (r) =>
        r.exclusionRule?.regex?.pattern === pattern &&
        (r.exclusionRule.matchingScope || "MATCHING_SCOPE_PARTIAL_MATCH") === targetScope,
    );
    if (!alreadyExists) {
      rules.push({
        exclusionRule: {
          regex: { pattern },
          matchingScope: targetScope,
        },
      });
    }
  }

  return {
    ruleSets: existingRuleSets,
  };
};

export const updateModelArmorTemplateExclusionRules = async (
  projectId: string,
  template: ModelArmorTemplate,
  input: ApplyExclusionRuleInput,
): Promise<ModelArmorTemplate> => {
  if (!template.name) {
    throw new Error("Template resource name is required to update exclusion rules.");
  }

  const parts = template.name.split("/");
  const locIdx = parts.indexOf("locations");
  const location = locIdx >= 0 && locIdx + 1 < parts.length ? parts[locIdx + 1] : "global";

  const host =
    !location || location === "global"
      ? "modelarmor.googleapis.com"
      : `modelarmor.${location}.rep.googleapis.com`;

  const mergedRuleSettings = mergeExclusionRuleIntoSettings(
    template.filterConfig?.filterRuleSettings,
    input.filterType,
    input.exclusionRule,
  );

  const updateMaskPaths = ["filterConfig.filterRuleSettings"];
  const updatedMetadata: Record<string, unknown> = {
    ...template.templateMetadata,
  };
  let includeTemplateMetadata = false;

  // Always include templateMetadata.dataResidencyCompliant=true by default in both payload and updateMask.
  // In proto3, omitting dataResidencyCompliant deserializes as false on the request proto, which triggers
  // Org Policy constraint `constraints/modelarmor.managed.requireTemplateDataResidencyCompliance`.
  const shouldEnforceDataResidency = input.enforceDataResidencyCompliance ?? true;
  if (shouldEnforceDataResidency) {
    updateMaskPaths.push("templateMetadata.dataResidencyCompliant");
    updatedMetadata.dataResidencyCompliant = true;
    includeTemplateMetadata = true;
  }

  if (input.enableLogSanitizeOperations) {
    updateMaskPaths.push("templateMetadata.logSanitizeOperations");
    updatedMetadata.logSanitizeOperations = true;
    includeTemplateMetadata = true;
  }

  const payload: ModelArmorTemplate = {
    filterConfig: {
      ...template.filterConfig,
      filterRuleSettings: mergedRuleSettings,
    },
    ...(includeTemplateMetadata ? { templateMetadata: updatedMetadata } : {}),
  };

  const updateMask = updateMaskPaths.join(",");
  const url = `https://${host}/v1/${template.name}?updateMask=${updateMask}`;
  return gapiRequest<ModelArmorTemplate>(url, "PATCH", projectId, undefined, payload);
};


