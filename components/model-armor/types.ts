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

export type ScanStatus = 'ok' | 'unknown';

export interface AssistantArmorState {
  /** Full resource name, e.g. projects/p/locations/global/.../assistants/default_assistant */
  name: string;
  assistantId: string;
  userPromptTemplate: string;
  responseTemplate: string;
  /** '' means the field is absent, which the API treats as FAIL_CLOSED. */
  failureMode: string;
  customerPolicy: Record<string, unknown>;
}

export interface EngineArmorState {
  /** Full engine resource name. */
  name: string;
  engineId: string;
  displayName: string;
  location: string;
  status: ScanStatus;
  /** Populated only when status === 'unknown'. */
  error?: string;
  assistants: AssistantArmorState[];
}

export const DEFAULT_FAILURE_MODE = 'FAIL_CLOSED';

export const readArmorConfig = (value: unknown): Record<string, string> => {
  const policy = (value as { customerPolicy?: { modelArmorConfig?: Record<string, string> } } | null | undefined)
    ?.customerPolicy;
  return policy?.modelArmorConfig ?? {};
};

export type StreamingExclusionCompatibility =
  | 'NO_EXCLUSIONS'
  | 'REALTIME_AND_BUFFERED'
  | 'BUFFERED_ONLY';

export interface ParsedExclusionRuleDetail {
  filterTypes: string[];
  ruleType: 'DICTIONARY' | 'REGEX';
  matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH' | 'MATCHING_SCOPE_FULL_MATCH';
  explicitScope: string;
  words: string[];
  regexPattern?: string;
  warnings: string[];
}

export interface TemplateExclusionAnalysis {
  hasExclusionRules: boolean;
  totalRuleSets: number;
  totalRules: number;
  dictionaryRulesCount: number;
  regexRulesCount: number;
  targetedFilterTypes: string[];
  hasFullMatchScope: boolean;
  hasPartialMatchScope: boolean;
  streamingCompatibility: StreamingExclusionCompatibility;
  streamingSummary: string;
  logSanitizeOperationsEnabled: boolean;
  rules: ParsedExclusionRuleDetail[];
  warnings: string[];
  criticalIssues: string[];
}

export interface LogExclusionAndStreamingInfo {
  overriddenFilters: string[];
  skippedFilters: string[];
  skippedExecutionFilterKeys: string[];
  streamChunkProcessed: boolean;
  hasExclusionActivity: boolean;
}

const SUPPORTED_EXCLUSION_FILTER_TYPES = new Set([
  'PROMPT_INJECTION_AND_JAILBREAK',
  'RESPONSIBLE_AI',
]);

// Regex pattern matching for unconstrained wildcard patterns (e.g. .*, .+, (.*), (?:.*), [\s\S]*, .{0,}, ^.*$, (?i).*)
// Note: Uses Regex Pattern Matching for common wildcard patterns; does not parse arbitrary regex ASTs.
const UNCONSTRAINED_WILDCARD_REGEX =
  /^(?:\(\?[imsU]+\))?\^?(?:\((?:\?:)?)?(?:\.\*|\.\+|\.\{0,\}|\.\{1,\}|\[\\s\\S\][*+]|\[\\d\\D\][*+]|\[\\w\\W\][*+])\)*\$?$/;

const hasNonAsciiChars = (str: string): boolean =>
  Array.from(str).some((ch) => ch.charCodeAt(0) > 127);

interface RawTemplateLike {
  name?: string;
  filterConfig?: {
    raiSettings?: {
      raiFilters?: Array<{ filterType?: string; confidenceLevel?: string }>;
    };
    sdpSettings?: {
      basicConfig?: { filterEnforcement?: string };
      advancedConfig?: { inspectTemplate?: string; deidentifyTemplate?: string };
    };
    piAndJailbreakFilterSettings?: { filterEnforcement?: string };
    maliciousUriFilterSettings?: { filterEnforcement?: string };
    csamFilterfilterSettings?: { filterEnforcement?: string };
    filterRuleSettings?: {
      ruleSets?: Array<{
        filterTypes?: unknown[];
        rules?: Array<{
          exclusionRule?: {
            matchingScope?: string;
            dictionary?: { wordList?: { words?: unknown[] } };
            regex?: { pattern?: string };
          };
        }>;
      }>;
    };
  };
  templateMetadata?: {
    logSanitizeOperations?: boolean;
    customPromptSafetyErrorCode?: number;
    customPromptSafetyErrorMessage?: string;
    customLlmResponseSafetyErrorCode?: number;
    customLlmResponseSafetyErrorMessage?: string;
    multiLanguageDetection?: { enableMultiLanguageDetection?: boolean };
  };
}

export const analyzeTemplateExclusionRules = (
  template: RawTemplateLike | null | undefined,
): TemplateExclusionAnalysis => {
  const fc = template?.filterConfig || {};
  const tm = template?.templateMetadata || {};
  const logSanitizeOperationsEnabled = Boolean(tm.logSanitizeOperations);
  const rawRuleSets = Array.isArray(fc.filterRuleSettings?.ruleSets)
    ? fc.filterRuleSettings.ruleSets
    : [];

  const raiFilters = Array.isArray(fc.raiSettings?.raiFilters) ? fc.raiSettings.raiFilters : [];
  const activeRaiCount = raiFilters.filter(
    (f) => f?.confidenceLevel && f.confidenceLevel !== 'OFF',
  ).length;
  const jailbreakActive = fc.piAndJailbreakFilterSettings?.filterEnforcement === 'ENABLED';

  const targetedSet = new Set<string>();
  const parsedRules: ParsedExclusionRuleDetail[] = [];
  const warnings: string[] = [];
  const criticalIssues: string[] = [];

  let dictionaryRulesCount = 0;
  let regexRulesCount = 0;
  let hasFullMatchScope = false;
  let hasPartialMatchScope = false;

  if (rawRuleSets.length > 2) {
    warnings.push(
      `Template defines ${rawRuleSets.length} ruleSets, exceeding the Model Armor limit of 2 ruleSets per template (1 for PROMPT_INJECTION_AND_JAILBREAK and 1 for RESPONSIBLE_AI).`,
    );
  }

  for (const rs of rawRuleSets) {
    const filterTypes: string[] = Array.isArray(rs?.filterTypes)
      ? rs.filterTypes.filter((t: unknown): t is string => typeof t === 'string')
      : [];
    const rulesList = Array.isArray(rs?.rules) ? rs.rules : [];

    for (const ft of filterTypes) {
      targetedSet.add(ft);
      if (!SUPPORTED_EXCLUSION_FILTER_TYPES.has(ft)) {
        criticalIssues.push(
          `Exclusion ruleSet targets unsupported filterType "${ft}". Only PROMPT_INJECTION_AND_JAILBREAK and RESPONSIBLE_AI support exclusion rules (SDP and Malicious URI are not supported).`,
        );
      } else if (ft === 'PROMPT_INJECTION_AND_JAILBREAK' && !jailbreakActive) {
        warnings.push(
          'Orphaned exclusion ruleSet: targets PROMPT_INJECTION_AND_JAILBREAK, which is currently disabled on this template.',
        );
      } else if (ft === 'RESPONSIBLE_AI' && activeRaiCount === 0) {
        warnings.push(
          'Orphaned exclusion ruleSet: targets RESPONSIBLE_AI, which has no active RAI filters on this template.',
        );
      }
    }

    if (rulesList.length > 10) {
      warnings.push(
        `Rule set for [${filterTypes.join(', ') || 'unspecified'}] contains ${
          rulesList.length
        } rules, exceeding the Model Armor limit of 10 rules per ruleSet.`,
      );
    }

    for (const r of rulesList) {
      const ex = r?.exclusionRule;
      if (!ex) continue;

      const explicitScope =
        typeof ex.matchingScope === 'string' && ex.matchingScope.trim()
          ? ex.matchingScope.trim()
          : 'MATCHING_SCOPE_PARTIAL_MATCH';
      const matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH' | 'MATCHING_SCOPE_FULL_MATCH' =
        explicitScope === 'MATCHING_SCOPE_FULL_MATCH'
          ? 'MATCHING_SCOPE_FULL_MATCH'
          : 'MATCHING_SCOPE_PARTIAL_MATCH';

      if (matchingScope === 'MATCHING_SCOPE_FULL_MATCH') {
        hasFullMatchScope = true;
      } else {
        hasPartialMatchScope = true;
      }

      const ruleWarnings: string[] = [];

      if (matchingScope === 'MATCHING_SCOPE_FULL_MATCH') {
        const msg =
          'Uses MATCHING_SCOPE_FULL_MATCH, which is NOT supported in real-time streaming mode (STREAMING_MODE_REALTIME, the default for StreamSanitizeUserPrompt / StreamSanitizeModelResponse) and throws 400 INVALID_ARGUMENT unless STREAMING_MODE_BUFFERED is used.';
        ruleWarnings.push(msg);
      }

      if (ex.dictionary) {
        dictionaryRulesCount += 1;
        const words: string[] = Array.isArray(ex.dictionary?.wordList?.words)
          ? ex.dictionary.wordList.words.filter((w: unknown): w is string => typeof w === 'string')
          : [];

        if (words.length === 0) {
          ruleWarnings.push('Dictionary exclusion rule has an empty wordList.');
        } else if (words.length > 100) {
          ruleWarnings.push(
            `Dictionary wordList contains ${words.length} entries, exceeding the Model Armor limit of 100 words per wordList.`,
          );
        }

        const longWords = words.filter((w) => w.length > 200);
        if (longWords.length > 0) {
          ruleWarnings.push(
            `Dictionary wordList contains ${longWords.length} phrase(s) exceeding the 200-character limit per word.`,
          );
        }

        if (
          matchingScope === 'MATCHING_SCOPE_FULL_MATCH' &&
          words.some((w) => hasNonAsciiChars(w))
        ) {
          ruleWarnings.push(
            'Dictionary rule with MATCHING_SCOPE_FULL_MATCH contains multi-byte UTF-8 characters. Model Armor only supports single-byte UTF-8 characters for FULL_MATCH.',
          );
        }

        if (matchingScope === 'MATCHING_SCOPE_PARTIAL_MATCH') {
          const singleShortWords = words.filter(
            (w) => w.trim().length > 0 && !w.trim().includes(' ') && w.trim().length <= 8,
          );
          if (singleShortWords.length > 0) {
            ruleWarnings.push(
              `Overly broad PARTIAL_MATCH single-word exclusion (${singleShortWords
                .slice(0, 3)
                .map((w) => `"${w}"`)
                .join(
                  ', ',
                )}): any prompt or response containing this substring will override matchState to NO_MATCH_FOUND for the entire ${filterTypes.join(
                '/',
              )} filter (including all 4 RAI categories if RESPONSIBLE_AI). Prefer multi-word contextual phrases.`,
            );
          }
        }

        parsedRules.push({
          filterTypes,
          ruleType: 'DICTIONARY',
          matchingScope,
          explicitScope,
          words,
          warnings: ruleWarnings,
        });
        warnings.push(
          ...ruleWarnings.filter(
            (w) => !w.includes('MATCHING_SCOPE_FULL_MATCH, which is NOT supported'),
          ),
        );
      } else if (ex.regex) {
        regexRulesCount += 1;
        const pattern = typeof ex.regex?.pattern === 'string' ? ex.regex.pattern : '';

        if (!pattern.trim()) {
          ruleWarnings.push('Regex exclusion rule has an empty pattern.');
        } else {
          if (pattern.length > 1000) {
            ruleWarnings.push(
              `Regex pattern is ${pattern.length} characters long, exceeding the Model Armor limit of 1,000 characters.`,
            );
          }
          const trimmedPattern = pattern.trim();
          const isPartialDotWildcard =
            matchingScope === 'MATCHING_SCOPE_PARTIAL_MATCH' &&
            /^(?:\(\?[imsU]+\))?\^?\(?\.?\)?\$?$/.test(trimmedPattern) &&
            trimmedPattern.includes('.');
          if (UNCONSTRAINED_WILDCARD_REGEX.test(trimmedPattern) || isPartialDotWildcard) {
            const wildcardMsg = `Unconstrained wildcard regex "${pattern}" in [${filterTypes.join(
              ', ',
            )}] matches all inputs and completely disables the targeted safety filter.`;
            ruleWarnings.push(wildcardMsg);
            criticalIssues.push(wildcardMsg);
          }
          if (matchingScope === 'MATCHING_SCOPE_FULL_MATCH' && hasNonAsciiChars(pattern)) {
            ruleWarnings.push(
              'Regex rule with MATCHING_SCOPE_FULL_MATCH contains multi-byte UTF-8 characters. Model Armor only supports single-byte UTF-8 characters for FULL_MATCH.',
            );
          }
        }

        parsedRules.push({
          filterTypes,
          ruleType: 'REGEX',
          matchingScope,
          explicitScope,
          words: [],
          regexPattern: pattern,
          warnings: ruleWarnings,
        });
        warnings.push(
          ...ruleWarnings.filter(
            (w) =>
              !w.includes('MATCHING_SCOPE_FULL_MATCH, which is NOT supported') &&
              !w.includes('Unconstrained wildcard regex'),
          ),
        );
      }
    }
  }

  const totalRules = parsedRules.length;
  const hasExclusionRules = totalRules > 0;

  if (hasFullMatchScope) {
    criticalIssues.push(
      'Real-Time Streaming Incompatibility: Template uses MATCHING_SCOPE_FULL_MATCH exclusion rules. Calling StreamSanitizeUserPrompt or StreamSanitizeModelResponse in default real-time mode (STREAMING_MODE_REALTIME) will fail with 400 INVALID_ARGUMENT ("Invalid filter rule settings: FULL_MATCH matching scope is not supported in real-time streaming mode. Use PARTIAL_MATCH or STREAMING_MODE_BUFFERED instead.").',
    );
  }

  if (hasExclusionRules && !logSanitizeOperationsEnabled) {
    warnings.push(
      'templateMetadata.logSanitizeOperations is not enabled: Cloud Logging will not record exclusion_rule_overridden_filters or exclusion_rule_skipped_filters labels when exclusion rules override a filter verdict.',
    );
  }

  const streamingCompatibility: StreamingExclusionCompatibility = !hasExclusionRules
    ? 'NO_EXCLUSIONS'
    : hasFullMatchScope
    ? 'BUFFERED_ONLY'
    : 'REALTIME_AND_BUFFERED';

  const streamingSummary =
    streamingCompatibility === 'NO_EXCLUSIONS'
      ? 'No exclusion rules configured (supports all streaming modes).'
      : streamingCompatibility === 'REALTIME_AND_BUFFERED'
      ? 'Compatible with Real-Time (STREAMING_MODE_REALTIME) & Buffered (STREAMING_MODE_BUFFERED) streaming. In real-time streaming, excluded phrases split across chunk boundaries will not match.'
      : 'Buffered Streaming Only (STREAMING_MODE_BUFFERED): Contains MATCHING_SCOPE_FULL_MATCH rules which fail with 400 INVALID_ARGUMENT in default STREAMING_MODE_REALTIME.';

  return {
    hasExclusionRules,
    totalRuleSets: rawRuleSets.length,
    totalRules,
    dictionaryRulesCount,
    regexRulesCount,
    targetedFilterTypes: Array.from(targetedSet),
    hasFullMatchScope,
    hasPartialMatchScope,
    streamingCompatibility,
    streamingSummary,
    logSanitizeOperationsEnabled,
    rules: parsedRules,
    warnings: Array.from(new Set(warnings)),
    criticalIssues: Array.from(new Set(criticalIssues)),
  };
};

interface RawLogEntryLike {
  labels?: Record<string, string>;
  jsonPayload?: {
    sanitizationInput?: { text?: string };
    sanitizationMetadata?: { streamChunkProcessed?: boolean | string };
    sanitizationResult?: {
      sanitizationMetadata?: { streamChunkProcessed?: boolean | string };
      filterResults?: Record<string, Record<string, { matchState?: string; executionState?: string }>>;
    };
  };
  resource?: { labels?: { template_id?: string } };
}

export const extractLogExclusionAndStreamingInfo = (
  rawLog: unknown,
): LogExclusionAndStreamingInfo => {
  const log = rawLog as RawLogEntryLike | null | undefined;
  const labels = (log?.labels || {}) as Record<string, string>;
  const overriddenRaw = labels['modelarmor.googleapis.com/exclusion_rule_overridden_filters'] || '';
  const skippedRaw = labels['modelarmor.googleapis.com/exclusion_rule_skipped_filters'] || '';

  const overriddenFilters = overriddenRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const skippedFilters = skippedRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = log?.jsonPayload || {};
  const sanitizationResult = payload?.sanitizationResult || {};
  const metadata =
    sanitizationResult?.sanitizationMetadata || payload?.sanitizationMetadata || {};
  const streamChunkProcessed =
    metadata?.streamChunkProcessed === true ||
    metadata?.streamChunkProcessed === 'true';

  const skippedExecutionFilterKeys: string[] = [];
  const filterResults = sanitizationResult?.filterResults;
  if (filterResults && typeof filterResults === 'object' && !Array.isArray(filterResults)) {
    for (const [filterKey, val] of Object.entries(filterResults)) {
      if (!val || typeof val !== 'object') continue;
      for (const innerVal of Object.values(val)) {
        if (
          innerVal &&
          typeof innerVal === 'object' &&
          innerVal.executionState === 'EXECUTION_SKIPPED'
        ) {
          skippedExecutionFilterKeys.push(filterKey);
        }
      }
    }
  }

  return {
    overriddenFilters,
    skippedFilters,
    skippedExecutionFilterKeys,
    streamChunkProcessed,
    hasExclusionActivity:
      overriddenFilters.length > 0 ||
      skippedFilters.length > 0 ||
      skippedExecutionFilterKeys.length > 0,
  };
};

export const getTemplateFilters = (template: RawTemplateLike) => {
  const fc = template.filterConfig || {};
  const raiFilters = fc.raiSettings?.raiFilters || [];
  const activeRai = raiFilters.map((f) => ({
    type: f.filterType,
    level: f.confidenceLevel,
  }));
  const sdpActive =
    fc.sdpSettings?.basicConfig?.filterEnforcement === 'ENABLED' ||
    Boolean(
      fc.sdpSettings?.advancedConfig?.inspectTemplate ||
        fc.sdpSettings?.advancedConfig?.deidentifyTemplate
    );
  const jailbreakActive = fc.piAndJailbreakFilterSettings?.filterEnforcement === 'ENABLED';
  const maliciousUrisActive = fc.maliciousUriFilterSettings?.filterEnforcement === 'ENABLED';
  const exclusions = analyzeTemplateExclusionRules(template);

  return {
    rai: activeRai,
    sdp: sdpActive,
    jailbreak: jailbreakActive,
    maliciousUris: maliciousUrisActive,
    exclusions,
  };
};

export const formatConfidenceLevel = (level: string) => {
  if (level === 'LOW_AND_ABOVE') return 'Low+';
  if (level === 'MEDIUM_AND_ABOVE') return 'Med+';
  if (level === 'HIGH') return 'High';
  return level;
};

export type ExclusionRecommendationVerdict =
  | 'LIKELY_FALSE_POSITIVE'
  | 'REVIEW_REQUIRED'
  | 'HIGH_RISK_TRUE_POSITIVE'
  | 'UNSUPPORTED_FILTER';

export interface LogEntryExclusionEvaluation {
  eligibleForExclusion: boolean;
  triggeredFilterKey: string | null;
  mappedExclusionFilterType: 'PROMPT_INJECTION_AND_JAILBREAK' | 'RESPONSIBLE_AI';
  unsupportedFilterReason?: string;
  verdict: ExclusionRecommendationVerdict;
  verdictLabel: string;
  verdictSummary: string;
  sanitizedInputText: string;
  suggestedDictionaryPhrase: string;
  suggestedRegexPattern: string;
  recommendedRuleType: 'DICTIONARY' | 'REGEX';
  recommendedMatchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH' | 'MATCHING_SCOPE_FULL_MATCH';
  detectedTemplateName: string | null;
  detectedTemplateSource: string | null;
  warnings: string[];
}

// Note: Uses Regex Pattern Matching to detect explicit adversarial/jailbreak test phrases vs. benign operational phrases.
// Known limits: Evaluates lexical patterns via regular expressions; does not perform semantic intent parsing.
const ADVERSARIAL_TRUE_POSITIVE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bjailbreak(?:s|ing)?\b/i, label: 'explicit "jailbreak" terminology' },
  {
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|system|initial)\s+(?:instructions?|prompts?|rules?|directives?)\b/i,
    label: 'direct instruction-override phrase ("ignore previous instructions")',
  },
  {
    pattern: /\b(?:reveal|print|output|show|dump|repeat)\s+(?:your\s+|the\s+)?(?:system\s+prompt|hidden\s+instructions?|developer\s+prompt)\b/i,
    label: 'system prompt extraction attempt',
  },
  {
    pattern: /\b(?:do\s+anything\s+now|\bDAN\b|developer\s+mode|unrestricted\s+mode|god\s+mode)\b/i,
    label: 'persona/guardrail-bypass framing ("DAN" / "unrestricted mode")',
  },
  {
    pattern: /\b(?:bypass|disable|turn\s+off|circumvent)\s+(?:all\s+)?(?:safety|security|content|model\s+armor)?\s*(?:filters?|guardrails?|restrictions?|policies)\b/i,
    label: 'explicit safety filter bypass request',
  },
];

const BENIGN_OPERATIONAL_FALSE_POSITIVE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /\b(?:ignore|skip|disregard)\s+(?:the\s+)?(?:empty\s+rows?|blank\s+lines?|case|uppercase|lowercase|whitespace|nulls?|duplicates?|warnings?|drafts?|typos?|headers?|footers?|comments?|noise)\b/i,
    label: 'benign data/text processing instruction ("ignore case / empty rows / warnings")',
  },
  {
    pattern: /\b(?:kill|terminate|abort|stop)\s+(?:the\s+)?(?:zombie\s+|orphan(?:ed)?\s+|hung\s+|stale\s+|background\s+)?(?:process(?:es)?|pid|port|pod|container|job|thread|worker|session|task)\b/i,
    label: 'benign DevOps/SRE process lifecycle command ("kill process / pod / job")',
  },
  {
    pattern: /\b(?:bypass|override|clear|flush)\s+(?:the\s+)?(?:cdn\s+|local\s+|dns\s+|browser\s+|read\s+)?(?:cache|proxy|default\s+timeout|pagination\s+limit)\b/i,
    label: 'benign infrastructure configuration phrase ("bypass cache / timeout")',
  },
  {
    pattern: /\b(?:attack\s+surface|penetration\s+test(?:ing)?|threat\s+model(?:ing)?|vulnerability\s+scan(?:ning)?|cve-\d{4}-\d+)\b/i,
    label: 'defensive security/SecOps terminology',
  },
];

/**
 * Generates a word-boundary anchored, case-insensitive regex (`(?i)\b...\b`) from a sample phrase
 * using Regex Pattern Matching character escaping.
 */
export const buildScopedRegexFromPhrase = (phrase: string): string => {
  const trimmed = phrase.trim().slice(0, 200);
  if (!trimmed) return '';
  const escaped = trimmed
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  const startsWithWord = /^\w/.test(trimmed);
  const endsWithWord = /\w$/.test(trimmed);
  return `(?i)${startsWithWord ? '\\b' : ''}(?:${escaped})${endsWithWord ? '\\b' : ''}`;
};

export interface ExclusionRuleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const validateProposedExclusionRule = (params: {
  ruleType: 'DICTIONARY' | 'REGEX';
  matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH' | 'MATCHING_SCOPE_FULL_MATCH';
  dictionaryText: string;
  regexPattern: string;
  filterType: string;
}): ExclusionRuleValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!SUPPORTED_EXCLUSION_FILTER_TYPES.has(params.filterType)) {
    errors.push(
      `Filter type "${params.filterType}" is not supported by Model Armor exclusion rules. Only PROMPT_INJECTION_AND_JAILBREAK and RESPONSIBLE_AI are supported.`,
    );
  }

  if (params.matchingScope === 'MATCHING_SCOPE_FULL_MATCH') {
    warnings.push(
      'MATCHING_SCOPE_FULL_MATCH is incompatible with default real-time streaming (STREAMING_MODE_REALTIME) in StreamSanitizeUserPrompt / StreamSanitizeModelResponse and will return 400 INVALID_ARGUMENT unless STREAMING_MODE_BUFFERED is used.',
    );
  }

  if (params.ruleType === 'DICTIONARY') {
    const words = params.dictionaryText
      .split(/\r?\n|,/)
      .map((w) => w.trim())
      .filter(Boolean);

    if (words.length === 0) {
      errors.push('At least one non-empty dictionary word or phrase is required.');
    }
    if (words.length > 100) {
      errors.push(`Dictionary wordList has ${words.length} entries, exceeding the 100-word limit.`);
    }
    const overLong = words.filter((w) => w.length > 200);
    if (overLong.length > 0) {
      errors.push(
        `Dictionary phrase exceeds the 200-character Model Armor limit (${overLong[0].length} chars). Narrow the phrase or use a Regex rule.`,
      );
    }
    if (
      params.matchingScope === 'MATCHING_SCOPE_FULL_MATCH' &&
      words.some((w) => hasNonAsciiChars(w))
    ) {
      errors.push(
        'MATCHING_SCOPE_FULL_MATCH only supports single-byte UTF-8 (ASCII) characters. Switch to MATCHING_SCOPE_PARTIAL_MATCH or remove non-ASCII characters.',
      );
    }
    if (params.matchingScope === 'MATCHING_SCOPE_PARTIAL_MATCH') {
      const shortSingleWords = words.filter((w) => !w.includes(' ') && w.length <= 8);
      if (shortSingleWords.length > 0) {
        warnings.push(
          `Single-word partial match (${shortSingleWords.map((w) => `"${w}"`).join(', ')}) is overly broad and will bypass ${params.filterType} whenever that word appears anywhere in a prompt or response. Prefer multi-word contextual phrases.`,
        );
      }
    }
  } else {
    const pattern = params.regexPattern.trim();
    if (!pattern) {
      errors.push('Regular expression pattern cannot be empty.');
    } else {
      if (pattern.length > 1000) {
        errors.push(`Regex pattern length (${pattern.length}) exceeds the 1,000-character Model Armor limit.`);
      }
      if (UNCONSTRAINED_WILDCARD_REGEX.test(pattern)) {
        errors.push(
          `Unconstrained wildcard regex "${pattern}" matches all inputs and completely disables ${params.filterType}. Scope the regex to specific operational phrases.`,
        );
      }
      if (params.matchingScope === 'MATCHING_SCOPE_FULL_MATCH' && hasNonAsciiChars(pattern)) {
        errors.push(
          'MATCHING_SCOPE_FULL_MATCH only supports single-byte UTF-8 (ASCII) characters in regex patterns.',
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

export const evaluateLogEntryForExclusion = (
  rawLog: unknown,
  rawTemplates: unknown[] = [],
  enginesList: EngineArmorState[] = [],
): LogEntryExclusionEvaluation => {
  const log = rawLog as RawLogEntryLike | null | undefined;
  const templates = rawTemplates as RawTemplateLike[];
  const payload = log?.jsonPayload || {};
  const sanitizationResult = payload?.sanitizationResult || {};
  const filterResults = sanitizationResult?.filterResults || {};
  const sanitizedInputText =
    typeof payload?.sanitizationInput?.text === 'string' ? payload.sanitizationInput.text.trim() : '';

  // 1. Identify triggered filter
  let triggeredFilterKey: string | null = null;
  if (filterResults && typeof filterResults === 'object' && !Array.isArray(filterResults)) {
    for (const [filterName, result] of Object.entries(filterResults)) {
      if (!result || typeof result !== 'object') continue;
      const firstKey = Object.keys(result)[0];
      if (firstKey && result[firstKey]?.matchState === 'MATCH_FOUND') {
        triggeredFilterKey = filterName;
        break;
      }
    }
  }

  let eligibleForExclusion = true;
  let mappedExclusionFilterType: 'PROMPT_INJECTION_AND_JAILBREAK' | 'RESPONSIBLE_AI' =
    'PROMPT_INJECTION_AND_JAILBREAK';
  let unsupportedFilterReason: string | undefined;

  if (triggeredFilterKey === 'pi_and_jailbreak') {
    mappedExclusionFilterType = 'PROMPT_INJECTION_AND_JAILBREAK';
  } else if (triggeredFilterKey === 'rai') {
    mappedExclusionFilterType = 'RESPONSIBLE_AI';
  } else if (triggeredFilterKey === 'sdp') {
    eligibleForExclusion = false;
    unsupportedFilterReason =
      'Triggered filter "sdp" (Sensitive Data Protection) does not support Model Armor exclusion rules. Only PROMPT_INJECTION_AND_JAILBREAK and RESPONSIBLE_AI support template exclusion rules.';
  } else if (triggeredFilterKey === 'malicious_uris') {
    eligibleForExclusion = false;
    unsupportedFilterReason =
      'Triggered filter "malicious_uris" (Malicious URI Detection) does not support Model Armor exclusion rules.';
  } else if (triggeredFilterKey === 'csam') {
    eligibleForExclusion = false;
    unsupportedFilterReason =
      'CSAM safety filters cannot be bypassed or overridden by Model Armor exclusion rules.';
  }

  // 2. Resolve associated Model Armor Template from log labels or assistant correlation ID
  let detectedTemplateName: string | null = null;
  let detectedTemplateSource: string | null = null;

  const resourceTemplateId =
    log?.resource?.labels?.template_id ||
    log?.labels?.['modelarmor.googleapis.com/template_id'] ||
    '';

  if (resourceTemplateId && templates.length > 0) {
    const matched = templates.find(
      (t) => t.name === resourceTemplateId || t.name?.endsWith(`/templates/${resourceTemplateId}`),
    );
    if (matched?.name) {
      detectedTemplateName = matched.name;
      detectedTemplateSource = `Log resource label (${resourceTemplateId})`;
    }
  }

  const correlationId = log?.labels?.['modelarmor.googleapis.com/client_correlation_id'] || '';
  if (!detectedTemplateName && correlationId.startsWith('AS|') && enginesList.length > 0) {
    const parts = correlationId.split('|');
    if (parts.length > 1) {
      const pathParts = parts[1].split('/');
      const assistantIdx = pathParts.indexOf('assistants');
      if (assistantIdx > 0 && assistantIdx < pathParts.length - 1) {
        const engineId = pathParts[assistantIdx - 1];
        const assistantId = pathParts[assistantIdx + 1];
        const engine = enginesList.find((e) => e.engineId === engineId);
        const assistant = engine?.assistants.find((a) => a.assistantId === assistantId);
        const candidateTemplateRef = assistant?.userPromptTemplate || assistant?.responseTemplate || '';
        if (candidateTemplateRef) {
          const suffix = candidateTemplateRef.match(/locations\/[^/]+\/templates\/[^/]+$/)?.[0];
          const matchedTemplate = templates.find(
            (t) =>
              t.name === candidateTemplateRef ||
              (suffix && t.name?.endsWith(suffix)),
          );
          detectedTemplateName = matchedTemplate?.name || candidateTemplateRef;
          detectedTemplateSource = `${engineId} / ${assistantId}`;
        }
      }
    }
  }

  if (!detectedTemplateName && templates.length === 1 && templates[0]?.name) {
    detectedTemplateName = templates[0].name;
    detectedTemplateSource = 'Default active template in project';
  }

  // 3. Evaluate input text for adversarial risk vs. benign operational false positive
  const warnings: string[] = [];
  const suggestedDictionaryPhrase = sanitizedInputText.slice(0, 200);
  const suggestedRegexPattern = buildScopedRegexFromPhrase(sanitizedInputText);

  if (sanitizedInputText.length > 200) {
    warnings.push(
      `Sanitized input is ${sanitizedInputText.length} characters long, exceeding the 200-character limit for a single Dictionary wordList entry. Narrow the phrase to the specific triggering clause or use a Scoped Regex rule.`,
    );
  }
  if (sanitizedInputText.length > 500_000) {
    warnings.push(
      'Input exceeds the 0.5 MB (~130,000 token) Model Armor exclusion scan limit; violations beyond the first 0.5 MB will result in EXECUTION_SKIPPED.',
    );
  }
  if (mappedExclusionFilterType === 'RESPONSIBLE_AI') {
    warnings.push(
      'RESPONSIBLE_AI exclusion rules apply across all 4 RAI categories simultaneously (Hate Speech, Harassment, Sexually Explicit, Dangerous Content). Keep the excluded phrase as narrow as possible.',
    );
  }

  let verdict: ExclusionRecommendationVerdict = 'REVIEW_REQUIRED';
  let verdictLabel = 'Manual Admin Review Recommended';
  let verdictSummary =
    'Verify that this input is a legitimate business/operational false positive before adding an exclusion rule. Prefer narrowing the phrase to the specific domain clause rather than excluding broad words.';

  if (!eligibleForExclusion) {
    verdict = 'UNSUPPORTED_FILTER';
    verdictLabel = 'Filter Not Eligible for Exclusion Rules';
    verdictSummary = unsupportedFilterReason || 'This filter type does not support Model Armor exclusion rules.';
  } else {
    const adversarialMatches = ADVERSARIAL_TRUE_POSITIVE_PATTERNS.filter((item) =>
      item.pattern.test(sanitizedInputText),
    );
    const benignMatches = BENIGN_OPERATIONAL_FALSE_POSITIVE_PATTERNS.filter((item) =>
      item.pattern.test(sanitizedInputText),
    );

    if (adversarialMatches.length > 0) {
      verdict = 'HIGH_RISK_TRUE_POSITIVE';
      verdictLabel = 'High Risk: Likely True Positive / Adversarial Prompt';
      verdictSummary = `Detected ${adversarialMatches
        .map((m) => m.label)
        .join(', ')} in "${sanitizedInputText.slice(
        0,
        80,
      )}". Excluding this input will weaken ${mappedExclusionFilterType} protection and allow prompts containing this phrase to bypass blocking. Only apply to policy if this is an intentional red-team or evaluation fixture.`;
    } else if (benignMatches.length > 0) {
      verdict = 'LIKELY_FALSE_POSITIVE';
      verdictLabel = 'Likely Benign Operational False Positive';
      verdictSummary = `Matched ${benignMatches
        .map((m) => m.label)
        .join(', ')}. Recommended: apply a scoped PARTIAL_MATCH exclusion rule so legitimate operational queries are not blocked in real-time or buffered streaming.`;
    } else if (!sanitizedInputText) {
      verdict = 'REVIEW_REQUIRED';
      verdictLabel = 'No Input Text Logged — Custom Phrase Required';
      verdictSummary =
        'This log entry does not include sanitizationInput.text. Enter the specific false-positive phrase or regex pattern below to apply an exclusion rule.';
    }
  }

  return {
    eligibleForExclusion,
    triggeredFilterKey,
    mappedExclusionFilterType,
    unsupportedFilterReason,
    verdict,
    verdictLabel,
    verdictSummary,
    sanitizedInputText,
    suggestedDictionaryPhrase,
    suggestedRegexPattern,
    recommendedRuleType: sanitizedInputText.length > 200 ? 'REGEX' : 'DICTIONARY',
    recommendedMatchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
    detectedTemplateName,
    detectedTemplateSource,
    warnings,
  };
};

