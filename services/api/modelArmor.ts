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

export interface GeminiExclusionSynthesisResult {
  extractedTriggerClause: string;
  recommendedRuleType: "DICTIONARY" | "REGEX";
  suggestedDictionaryPhrase: string;
  suggestedRegexFormula: string;
  strategyTitle: string;
  strategyRationale: string;
  isAdversarialTruePositive: boolean;
}

const GEMINI_WILDCARD_GUARD_REGEX =
  /^(?:\(\?[imsU]+\))?\^?(?:\((?:\?:)?)?(?:\.\*|\.\+|\.\{0,\}|\.\{1,\}|\[\\s\\S\][*+]|\[\\d\\D\][*+]|\[\\w\\W\][*+])\)*\$?$/;

/**
 * Uses Vertex AI Gemini (`gemini-2.5-flash`) to analyze a blocked Model Armor prompt,
 * isolate the narrow 3–7 word triggering clause, decide between a Static Keyword Phrase (`DICTIONARY`)
 * vs. a Parameterized Pattern Formula (`REGEX`), and synthesize a quota-efficient exclusion rule.
 */
export const synthesizeExclusionRuleWithGemini = async (
  projectId: string,
  params: {
    inputText: string;
    filterType: "PROMPT_INJECTION_AND_JAILBREAK" | "RESPONSIBLE_AI";
    currentVerdict?: string;
  },
): Promise<GeminiExclusionSynthesisResult> => {
  const cleanProject = projectId.trim();
  if (!cleanProject) {
    throw new Error("A valid GCP projectId is required to synthesize Model Armor exclusions with Vertex AI Gemini.");
  }
  const cleanInput = params.inputText.trim();
  if (!cleanInput) {
    throw new Error("Cannot synthesize an exclusion rule from an empty sanitizationInput.text.");
  }

  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    cleanProject,
  )}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`;

  const systemInstruction = [
    "You are a Google Cloud Model Armor Principal Security Architect.",
    "Enterprises have strict Model Armor template limits: max 2 ruleSets per template, max 10 rules per ruleSet, and max 100 words per dictionary.wordList (each <= 200 chars; regex <= 1000 chars).",
    "Customers cannot create 10,000 individual dictionary exceptions for every PID, pod name, ticket number, CVE ID, or phrasing variation.",
    "Given a blocked prompt and triggered filterType, you must:",
    "1. Isolate the narrowest 3-7 word triggering sub-clause (`extractedTriggerClause`) that caused the false positive, stripping away surrounding conversational text.",
    "2. Decide whether the customer should use `DICTIONARY` (Static Keyword Phrase) or `REGEX` (Parameterized Pattern Formula):",
    "   - Choose `REGEX` whenever the clause has variable IDs, numbers, PIDs, ports, pod hashes, CVE IDs, ticket numbers, or interchangeable operational verbs/nouns so 1 Regex Formula covers thousands of variations.",
    "   - Choose `DICTIONARY` only when the trigger is a fixed, invariant multi-word canonical phrase with zero dynamic parameters.",
    "3. Produce both a concise `suggestedDictionaryPhrase` (3-7 words, <= 200 chars, never a single generic word) and a word-boundary anchored case-insensitive `suggestedRegexFormula` starting with `(?i)\\b` and ending with `\\b`. Never output unconstrained wildcards like `.*` or `.+`.",
    "Return strict JSON matching the requested schema.",
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      triggeredFilterType: params.filterType,
      currentHeuristicVerdict: params.currentVerdict || "REVIEW_REQUIRED",
      sanitizedInputText: cleanInput.slice(0, 4000),
    },
    null,
    2,
  );

  const response = await gapiRequest<{
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  }>(endpoint, "POST", cleanProject, undefined, {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        required: [
          "extractedTriggerClause",
          "recommendedRuleType",
          "suggestedDictionaryPhrase",
          "suggestedRegexFormula",
          "strategyTitle",
          "strategyRationale",
          "isAdversarialTruePositive",
        ],
        properties: {
          extractedTriggerClause: { type: "STRING" },
          recommendedRuleType: { type: "STRING", enum: ["DICTIONARY", "REGEX"] },
          suggestedDictionaryPhrase: { type: "STRING" },
          suggestedRegexFormula: { type: "STRING" },
          strategyTitle: { type: "STRING" },
          strategyRationale: { type: "STRING" },
          isAdversarialTruePositive: { type: "BOOLEAN" },
        },
      },
    },
  });

  const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  if (!rawText) {
    throw new Error("Vertex AI Gemini returned an empty exclusion analysis response.");
  }

  let parsed: Partial<GeminiExclusionSynthesisResult>;
  try {
    parsed = JSON.parse(rawText) as Partial<GeminiExclusionSynthesisResult>;
  } catch (err) {
    throw new Error(
      `Failed to parse Vertex AI Gemini exclusion JSON response: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const extractedTriggerClause = (parsed.extractedTriggerClause || "").trim().slice(0, 200);
  const suggestedDictionaryPhrase = (parsed.suggestedDictionaryPhrase || extractedTriggerClause)
    .trim()
    .slice(0, 200);
  const suggestedRegexFormula = (parsed.suggestedRegexFormula || "").trim().slice(0, 1000);

  if (!suggestedDictionaryPhrase || !suggestedRegexFormula) {
    throw new Error("Vertex AI Gemini response omitted required dictionary phrase or regex formula.");
  }

  if (GEMINI_WILDCARD_GUARD_REGEX.test(suggestedRegexFormula)) {
    throw new Error(
      `Rejected unsafe wildcard regex "${suggestedRegexFormula}" synthesized by Gemini.`,
    );
  }

  return {
    extractedTriggerClause: extractedTriggerClause || suggestedDictionaryPhrase,
    recommendedRuleType: parsed.recommendedRuleType === "REGEX" ? "REGEX" : "DICTIONARY",
    suggestedDictionaryPhrase,
    suggestedRegexFormula,
    strategyTitle:
      (parsed.strategyTitle || "").trim() ||
      (parsed.recommendedRuleType === "REGEX"
        ? "Parameterized Pattern Formula (REGEX — Gemini Recommended)"
        : "Canonical Keyword Phrase (DICTIONARY — Gemini Recommended)"),
    strategyRationale:
      (parsed.strategyRationale || "").trim() ||
      "Tailored by Vertex AI Gemini to minimize Model Armor rule quota consumption.",
    isAdversarialTruePositive: Boolean(parsed.isAdversarialTruePositive),
  };
};



