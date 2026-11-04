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
    metadata?.streamChunkProcessed === 'true' ||
    labels['modelarmor.googleapis.com/stream_chunk_processed'] === 'true';

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

export type ExclusionMechanismStrategy = 'KEYWORD_DICTIONARY' | 'PATTERN_FORMULA_REGEX';

export interface SmartTriggerExtractionResult {
  extractedTriggerClause: string;
  wasClauseNarrowedFromFullInput: boolean;
  suggestedDictionaryPhrase: string;
  suggestedRegexPattern: string;
  ruleMechanismStrategy: ExclusionMechanismStrategy;
  recommendedRuleType: 'DICTIONARY' | 'REGEX';
  strategyTitle: string;
  strategyRationale: string;
  estimatedCoverageSummary: string;
  detectedVariableTokens: string[];
  matchedDomainCategory: string | null;
}

export interface EnterpriseExclusionFormulaPreset {
  id: string;
  label: string;
  domain: string;
  filterType: 'PROMPT_INJECTION_AND_JAILBREAK' | 'RESPONSIBLE_AI';
  ruleType: 'REGEX' | 'DICTIONARY';
  matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH';
  patternOrPhrases: string;
  description: string;
  replacesApproxExceptions: string;
}

export const ENTERPRISE_EXCLUSION_FORMULA_PRESETS: EnterpriseExclusionFormulaPreset[] = [
  {
    id: 'devops-process-lifecycle-formula',
    label: 'DevOps / SRE Process & Pod Lifecycle Formula',
    domain: 'DevOps & SRE',
    filterType: 'PROMPT_INJECTION_AND_JAILBREAK',
    ruleType: 'REGEX',
    matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
    patternOrPhrases:
      '(?i)\\b(?:kill|terminate|abort|stop|reap)\\s+(?:the\\s+)?(?:(?:zombie|orphan(?:ed)?|hung|stale|background|stuck|worker)\\s+)*(?:process(?:es)?|pid|port|pod|container|job|thread|worker|session|task)(?:\\s+#?[a-z0-9._-]+)?\\b',
    description:
      'Single parameterized Regex Formula covering all DevOps/Kubernetes process, PID, pod, and worker termination commands across arbitrary numeric IDs and pod hashes.',
    replacesApproxExceptions: 'Replaces 10,000+ PID / pod-name dictionary exceptions with 1 Regex rule',
  },
  {
    id: 'data-sql-etl-cleaning-formula',
    label: 'Data / SQL / ETL Row & Schema Cleaning Formula',
    domain: 'Data & Analytics',
    filterType: 'PROMPT_INJECTION_AND_JAILBREAK',
    ruleType: 'REGEX',
    matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
    patternOrPhrases:
      '(?i)\\b(?:ignore|skip|disregard|drop| omit)\\s+(?:all\\s+|the\\s+)?(?:empty\\s+rows?|blank\\s+lines?|case|uppercase|lowercase|whitespace|null(?:\\s+values?)?|nan|duplicates?|duplicate\\s+records?|warnings?|headers?|footers?|comments?|malformed\\s+records?)\\b',
    description:
      'Parameterized formula for benign spreadsheet, SQL, and ETL data-cleaning directives ("ignore empty rows", "skip null values", "ignore case").',
    replacesApproxExceptions: 'Consolidates 50+ data-cleaning phrasing variants into 1 Regex rule',
  },
  {
    id: 'infra-cache-proxy-bypass-formula',
    label: 'Network / CDN Cache & Timeout Override Formula',
    domain: 'Cloud Infrastructure',
    filterType: 'PROMPT_INJECTION_AND_JAILBREAK',
    ruleType: 'REGEX',
    matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
    patternOrPhrases:
      '(?i)\\b(?:bypass|override|clear|flush|invalidate)\\s+(?:the\\s+)?(?:cdn\\s+|local\\s+|dns\\s+|browser\\s+|read\\s+|edge\\s+|redis\\s+)?(?:cache|proxy|default\\s+timeout|rate\\s+limit|pagination\\s+limit)\\b',
    description:
      'Covers legitimate CDN, DNS, Redis cache-busting, and proxy configuration troubleshooting prompts without weakening safety guardrails.',
    replacesApproxExceptions: 'Consolidates 35+ cache/proxy troubleshooting phrases into 1 Regex rule',
  },
  {
    id: 'secops-cve-triage-formula',
    label: 'SecOps / Vulnerability & CVE Triage Formula',
    domain: 'Cybersecurity & SecOps',
    filterType: 'PROMPT_INJECTION_AND_JAILBREAK',
    ruleType: 'REGEX',
    matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
    patternOrPhrases:
      '(?i)\\b(?:cve-\\d{4}-\\d{4,7}|(?:remediate|patch|mitigate|triage|assess)\\s+(?:the\\s+)?(?:attack\\s+surface|vulnerability\\s+scan|penetration\\s+test\\s+finding|threat\\s+model|exploit\\s+vector))\\b',
    description:
      'Allows defensive security engineers to query any CVE identifier (CVE-YYYY-NNNN) and defensive remediation workflows without creating a rule per CVE.',
    replacesApproxExceptions: 'Replaces 250,000+ individual CVE ID exceptions with 1 Regex formula',
  },
  {
    id: 'clinical-toxicology-rai-formula',
    label: 'Healthcare / Clinical Protocol & Toxicology Formula',
    domain: 'Healthcare & Life Sciences',
    filterType: 'RESPONSIBLE_AI',
    ruleType: 'REGEX',
    matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
    patternOrPhrases:
      '(?i)\\b(?:suicide\\s+risk\\s+(?:screening|assessment|protocol)|overdose\\s+(?:reversal|management|protocol|triage)|toxicology\\s+(?:screen(?:ing)?|panel|report)|adverse\\s+drug\\s+event\\s+reporting)\\b',
    description:
      'Scoped Responsible AI formula for clinical decision support, emergency triage protocols, and pharmacovigilance documentation.',
    replacesApproxExceptions: 'Consolidates clinical protocol terminology into 1 scoped RAI rule',
  },
];

export interface LogEntryExclusionEvaluation {
  eligibleForExclusion: boolean;
  triggeredFilterKey: string | null;
  mappedExclusionFilterType: 'PROMPT_INJECTION_AND_JAILBREAK' | 'RESPONSIBLE_AI';
  unsupportedFilterReason?: string;
  verdict: ExclusionRecommendationVerdict;
  verdictLabel: string;
  verdictSummary: string;
  sanitizedInputText: string;
  extractedTriggerClause: string;
  wasClauseNarrowedFromFullInput: boolean;
  suggestedDictionaryPhrase: string;
  suggestedRegexPattern: string;
  recommendedRuleType: 'DICTIONARY' | 'REGEX';
  ruleMechanismStrategy: ExclusionMechanismStrategy;
  strategyTitle: string;
  strategyRationale: string;
  estimatedCoverageSummary: string;
  detectedVariableTokens: string[];
  matchedDomainCategory: string | null;
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

interface BenignOperationalDomainPattern {
  pattern: RegExp;
  clauseExtractor: RegExp;
  label: string;
  domainCategory: string;
  formulaPattern: string;
  preferFormulaByDefault: boolean;
  coverageExplanation: string;
}

const BENIGN_OPERATIONAL_FALSE_POSITIVE_PATTERNS: BenignOperationalDomainPattern[] = [
  {
    pattern: /\b(?:ignore|skip|disregard|drop|omit)\s+(?:all\s+|the\s+)?(?:empty\s+rows?|blank\s+lines?|case|uppercase|lowercase|whitespace|null(?:s|\s+values?)?|nan|duplicates?|duplicate\s+records?|warnings?|drafts?|typos?|headers?|footers?|comments?|noise|malformed\s+records?)\b/i,
    clauseExtractor: /\b(?:ignore|skip|disregard|drop|omit)\s+(?:all\s+|the\s+)?(?:empty\s+rows?|blank\s+lines?|case|uppercase|lowercase|whitespace|null(?:s|\s+values?)?|nan|duplicates?|duplicate\s+records?|warnings?|drafts?|typos?|headers?|footers?|comments?|noise|malformed\s+records?)(?:\s+(?:when|in|from|during)\s+[a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)?\b/i,
    label: 'benign data/text processing instruction ("ignore case / empty rows / warnings")',
    domainCategory: 'Data / SQL / Spreadsheet Processing',
    formulaPattern:
      '(?i)\\b(?:ignore|skip|disregard|drop|omit)\\s+(?:all\\s+|the\\s+)?(?:empty\\s+rows?|blank\\s+lines?|case|uppercase|lowercase|whitespace|null(?:s|\\s+values?)?|nan|duplicates?|duplicate\\s+records?|warnings?|drafts?|typos?|headers?|footers?|comments?|noise|malformed\\s+records?)\\b',
    preferFormulaByDefault: false,
    coverageExplanation:
      'Matches data-cleaning directives across spreadsheets, SQL queries, and ETL pipelines without requiring separate rules for each column or table.',
  },
  {
    pattern: /\b(?:kill|terminate|abort|stop|reap)\s+(?:the\s+)?(?:(?:zombie|orphan(?:ed)?|hung|stale|background|stuck|worker)\s+)*(?:process(?:es)?|pid|port|pod|container|job|thread|worker|session|task)\b/i,
    clauseExtractor: /\b(?:kill|terminate|abort|stop|reap)\s+(?:the\s+)?(?:(?:zombie|orphan(?:ed)?|hung|stale|background|stuck|worker)\s+)*(?:process(?:es)?|pid|port|pod|container|job|thread|worker|session|task)(?:\s+#?[a-z0-9._-]+)?\b/i,
    label: 'benign DevOps/SRE process lifecycle command ("kill process / pod / job")',
    domainCategory: 'DevOps / SRE Process & Cluster Lifecycle',
    formulaPattern:
      '(?i)\\b(?:kill|terminate|abort|stop|reap)\\s+(?:the\\s+)?(?:(?:zombie|orphan(?:ed)?|hung|stale|background|stuck|worker)\\s+)*(?:process(?:es)?|pid|port|pod|container|job|thread|worker|session|task)(?:\\s+#?[a-z0-9._-]+)?\\b',
    preferFormulaByDefault: true,
    coverageExplanation:
      '1 Regex Formula covers all PID numbers, port numbers, Kubernetes pod hashes, and worker IDs so you do not burn the 10-rule / 100-word quota on thousands of individual process IDs.',
  },
  {
    pattern: /\b(?:bypass|override|clear|flush|invalidate)\s+(?:the\s+)?(?:cdn\s+|local\s+|dns\s+|browser\s+|read\s+|edge\s+|redis\s+)?(?:cache|proxy|default\s+timeout|rate\s+limit|pagination\s+limit)\b/i,
    clauseExtractor: /\b(?:bypass|override|clear|flush|invalidate)\s+(?:the\s+)?(?:cdn\s+|local\s+|dns\s+|browser\s+|read\s+|edge\s+|redis\s+)?(?:cache|proxy|default\s+timeout|rate\s+limit|pagination\s+limit)(?:\s+(?:on|for)\s+[a-z0-9._/-]+)?\b/i,
    label: 'benign infrastructure configuration phrase ("bypass cache / timeout")',
    domainCategory: 'Cloud Network / Cache / Proxy Configuration',
    formulaPattern:
      '(?i)\\b(?:bypass|override|clear|flush|invalidate)\\s+(?:the\\s+)?(?:cdn\\s+|local\\s+|dns\\s+|browser\\s+|read\\s+|edge\\s+|redis\\s+)?(?:cache|proxy|default\\s+timeout|rate\\s+limit|pagination\\s+limit)\\b',
    preferFormulaByDefault: true,
    coverageExplanation:
      '1 Regex Formula covers CDN, DNS, Redis, browser, and local cache/timeout troubleshooting permutations in a single rule.',
  },
  {
    pattern: /\b(?:attack\s+surface|penetration\s+test(?:ing)?|threat\s+model(?:ing)?|vulnerability\s+scan(?:ning)?|cve-\d{4}-\d{4,7}|exploit\s+mitigation)\b/i,
    clauseExtractor: /\b(?:(?:remediate|patch|mitigate|triage|assess|run|evaluate)\s+(?:the\s+|a\s+)?)?(?:attack\s+surface|penetration\s+test(?:ing)?(?:\s+finding)?|threat\s+model(?:ing)?|vulnerability\s+scan(?:ning)?(?:\s+for\s+cve-\d{4}-\d{4,7})?|cve-\d{4}-\d{4,7}|exploit\s+mitigation)\b/i,
    label: 'defensive security/SecOps terminology',
    domainCategory: 'Cybersecurity / SecOps / Vulnerability Triage',
    formulaPattern:
      '(?i)\\b(?:cve-\\d{4}-\\d{4,7}|(?:remediate|patch|mitigate|triage|assess|evaluate|run)?\\s*(?:the\\s+|a\\s+)?(?:attack\\s+surface|penetration\\s+test(?:ing)?|threat\\s+model(?:ing)?|vulnerability\\s+scan(?:ning)?|exploit\\s+mitigation))\\b',
    preferFormulaByDefault: true,
    coverageExplanation:
      '1 Regex Formula matches any CVE-YYYY-NNNN identifier and defensive SecOps workflow without requiring a separate dictionary rule per CVE.',
  },
  {
    pattern: /\b(?:suicide\s+risk\s+(?:screening|assessment|protocol)|overdose\s+(?:reversal|management|protocol|triage)|toxicology\s+(?:screen(?:ing)?|panel|report)|adverse\s+drug\s+event)\b/i,
    clauseExtractor: /\b(?:perform\s+|review\s+)?(?:suicide\s+risk\s+(?:screening|assessment|protocol)|overdose\s+(?:reversal|management|protocol|triage)|toxicology\s+(?:screen(?:ing)?|panel|report)|adverse\s+drug\s+event(?:\s+reporting)?)\b/i,
    label: 'clinical/healthcare triage & toxicology terminology',
    domainCategory: 'Healthcare / Clinical / Pharmacovigilance',
    formulaPattern:
      '(?i)\\b(?:suicide\\s+risk\\s+(?:screening|assessment|protocol)|overdose\\s+(?:reversal|management|protocol|triage)|toxicology\\s+(?:screen(?:ing)?|panel|report)|adverse\\s+drug\\s+event(?:\\s+reporting)?)\\b',
    preferFormulaByDefault: false,
    coverageExplanation:
      'Scoped clinical protocol exclusion that permits legitimate medical triage and toxicology documentation.',
  },
  {
    pattern: /\b(?:harassment\s+(?:policy|training|investigation|complaint)|discrimination\s+(?:policy|claim|investigation)|workplace\s+violence\s+prevention|wrongful\s+termination\s+review)\b/i,
    clauseExtractor: /\b(?:harassment\s+(?:policy|training|investigation|complaint)|discrimination\s+(?:policy|claim|investigation)|workplace\s+violence\s+prevention|wrongful\s+termination\s+review)\b/i,
    label: 'HR/Legal workplace compliance & policy terminology',
    domainCategory: 'HR / Legal / Workplace Compliance',
    formulaPattern:
      '(?i)\\b(?:harassment\\s+(?:policy|training|investigation|complaint)|discrimination\\s+(?:policy|claim|investigation)|workplace\\s+violence\\s+prevention|wrongful\\s+termination\\s+review)\\b',
    preferFormulaByDefault: false,
    coverageExplanation:
      'Allows HR and Legal teams to query standardized compliance, anti-harassment, and investigation policy phrases.',
  },
];

// Heuristic trigger-word locator used when a prompt does not match a pre-built domain pattern
// so we still isolate the 3-8 word triggering sub-clause from a multi-sentence prompt.
const GENERIC_TRIGGER_CUE_REGEX =
  /\b(?:ignore|disregard|skip|forget|bypass|override|kill|terminate|abort|drop|delete|truncate|attack|exploit|payload|inject|injection|jailbreak|suicide|overdose|harassment|threat|weapon|toxic|vuln(?:erability)?|cve-\d{4}-\d+)\b/i;

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

/**
 * Converts a specific operational clause containing variable tokens (IDs, numbers, pod hashes, CVEs, verbs)
 * into a generalized, word-boundary anchored Regex Formula (`(?i)\b...\b`) using Regex Pattern Matching.
 * Known limits: Uses lexical token classification via regular expressions; does not perform full NLP/AST parsing.
 */
export const buildGeneralizedFormulaFromClause = (
  clause: string,
): { formula: string; detectedVariables: string[] } => {
  const trimmed = clause.trim().slice(0, 200);
  if (!trimmed) return { formula: '', detectedVariables: [] };

  const detectedVariables: string[] = [];
  const tokens = trimmed.split(/\s+/);

  const patternTokens = tokens.map((rawToken, idx) => {
    const clean = rawToken.replace(/^[,.;:!?()"']+|[,.;:!?()"']+$/g, '');
    if (!clean) {
      return rawToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 1. CVE identifiers (e.g. CVE-2025-3194)
    if (/^cve-\d{4}-\d+$/i.test(clean)) {
      detectedVariables.push(`${clean} → CVE-YYYY-NNNN`);
      return 'cve-\\d{4}-\\d{4,7}';
    }
    // 2. Issue / Ticket / Partition keys (e.g. PROJ-1234, INC-99812)
    if (/^[A-Z]{2,10}-\d+$/i.test(clean) && /\d/.test(clean)) {
      detectedVariables.push(`${clean} → Ticket/Key ID`);
      return '[a-z]{2,10}-\\d+';
    }
    // 3. UUIDs or hex hashes (8+ hex chars)
    if (/^[a-f0-9]{8,}(?:-[a-f0-9]{4,})*$/i.test(clean) && /\d/.test(clean) && /[a-f]/i.test(clean)) {
      detectedVariables.push(`${clean} → Hex/UUID`);
      return '[a-f0-9-]{8,}';
    }
    // 4. Hyphenated/underscored resource slugs containing digits or multiple segments (e.g. api-gateway-7f9b, prod-us-east1, 2026_11)
    if (/^[a-z0-9._-]+$/i.test(clean) && /[-_.]/.test(clean) && /\d/.test(clean)) {
      detectedVariables.push(`${clean} → Resource/Slug ID`);
      return '[a-z0-9._-]+';
    }
    // 5. Pure numbers, PIDs, ports, chart numbers (e.g. 49182, #88412)
    if (/^#?\d+$/.test(clean)) {
      detectedVariables.push(`${clean} → Numeric ID/Count`);
      return '#?\\d+';
    }
    // 6. Common operational verb families at the start of the clause
    if (idx === 0 || idx === 1) {
      if (/^(?:kill|terminate|abort|stop|reap)$/i.test(clean)) {
        return '(?:kill|terminate|abort|stop|reap)';
      }
      if (/^(?:ignore|skip|disregard|omit)$/i.test(clean)) {
        return '(?:ignore|skip|disregard|omit)';
      }
      if (/^(?:bypass|override|flush|clear|invalidate)$/i.test(clean)) {
        return '(?:bypass|override|flush|clear|invalidate)';
      }
    }
    // 7. Common DevOps target nouns
    if (/^(?:process|processes|pid|port|pod|container|job|worker|thread|session|task)$/i.test(clean)) {
      return '(?:process(?:es)?|pid|port|pod|container|job|worker|thread|session|task)';
    }

    return clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });

  const joined = patternTokens.join('\\s+');
  const startsWithWord = /^\w|\(\?:|^\[/.test(joined);
  const endsWithWord = /\w|\)|\]|\+$/.test(joined);
  const formula = `(?i)${startsWithWord ? '\\b' : ''}(?:${joined})${endsWithWord ? '\\b' : ''}`;
  return { formula, detectedVariables };
};

/**
 * Extracts the narrow 3-8 word triggering clause from a prompt and determines whether
 * the customer should use a Static Keyword Phrase (`DICTIONARY`) or a Parameterized Pattern Formula (`REGEX`).
 */
export const extractSmartTriggerClauseAndFormula = (
  inputText: string,
  _filterType: 'PROMPT_INJECTION_AND_JAILBREAK' | 'RESPONSIBLE_AI' = 'PROMPT_INJECTION_AND_JAILBREAK',
): SmartTriggerExtractionResult => {
  const trimmed = inputText.trim();
  if (!trimmed) {
    return {
      extractedTriggerClause: '',
      wasClauseNarrowedFromFullInput: false,
      suggestedDictionaryPhrase: '',
      suggestedRegexPattern: '',
      ruleMechanismStrategy: 'KEYWORD_DICTIONARY',
      recommendedRuleType: 'DICTIONARY',
      strategyTitle: 'Exact Keyword Phrase (DICTIONARY)',
      strategyRationale: 'Enter the specific 3–6 word operational phrase that triggered the false positive.',
      estimatedCoverageSummary: 'Matches exact phrase occurrences.',
      detectedVariableTokens: [],
      matchedDomainCategory: null,
    };
  }

  // 1. Check if the input matches one of the curated enterprise operational domain patterns
  for (const domainDef of BENIGN_OPERATIONAL_FALSE_POSITIVE_PATTERNS) {
    const clauseMatch = trimmed.match(domainDef.clauseExtractor) || trimmed.match(domainDef.pattern);
    if (clauseMatch && clauseMatch[0]) {
      const extractedClause = clauseMatch[0].trim().slice(0, 200);
      const wasNarrowed = extractedClause.length < trimmed.length;
      // Also inspect the extracted clause + immediate following token (e.g., PID/pod ID right after the noun)
      const { detectedVariables } = buildGeneralizedFormulaFromClause(extractedClause);
      const hasVariables = detectedVariables.length > 0;
      const useFormula = domainDef.preferFormulaByDefault || hasVariables || trimmed.length > 200;

      return {
        extractedTriggerClause: extractedClause,
        wasClauseNarrowedFromFullInput: wasNarrowed,
        suggestedDictionaryPhrase: extractedClause,
        suggestedRegexPattern: domainDef.formulaPattern,
        ruleMechanismStrategy: useFormula ? 'PATTERN_FORMULA_REGEX' : 'KEYWORD_DICTIONARY',
        recommendedRuleType: useFormula ? 'REGEX' : 'DICTIONARY',
        strategyTitle: useFormula
          ? 'Parameterized Pattern Formula (REGEX — Recommended)'
          : 'Canonical Keyword Phrase (DICTIONARY — Recommended)',
        strategyRationale: useFormula
          ? hasVariables
            ? `Detected dynamic tokens (${detectedVariables.join(', ')}) inside "${extractedClause}". A static Dictionary rule would only match this exact ID and require thousands of exceptions. Use a Pattern Formula (REGEX) so 1 rule covers all future IDs and verb variations within Model Armor's 10-rule limit.`
            : `"${extractedClause}" belongs to ${domainDef.domainCategory}, where engineers use interchangeable verbs and target nouns. Using 1 Pattern Formula (REGEX) prevents burning your 100-word / 10-rule quota on repetitive variations.`
          : `"${extractedClause}" is a fixed, invariant domain phrase without dynamic IDs or numbers. A Narrow Keyword Phrase (DICTIONARY) with PARTIAL_MATCH is the simplest and lowest-overhead exclusion.`,
        estimatedCoverageSummary: domainDef.coverageExplanation,
        detectedVariableTokens: detectedVariables,
        matchedDomainCategory: domainDef.domainCategory,
      };
    }
  }

  // 2. If not a pre-built domain pattern, split long inputs into clauses and isolate a 3-8 word window around the trigger cue
  let extractedClause = trimmed;
  const words = trimmed.split(/\s+/);
  if (words.length > 8) {
    // Split on sentence/clause boundaries first
    const segments = trimmed
      .split(/(?:[.!?\n;]+|\s+--\s+|\s+-\s+|\b(?:please|and\s+then|so\s+that|because)\b)/i)
      .map((s) => s.trim())
      .filter(Boolean);

    const matchingSegment = segments.find((seg) => GENERIC_TRIGGER_CUE_REGEX.test(seg)) || segments[0] || trimmed;
    const segWords = matchingSegment.split(/\s+/);
    if (segWords.length > 8) {
      const cueIdx = segWords.findIndex((w) => GENERIC_TRIGGER_CUE_REGEX.test(w));
      if (cueIdx >= 0) {
        const start = Math.max(0, cueIdx - 1);
        const end = Math.min(segWords.length, start + 7);
        extractedClause = segWords.slice(start, end).join(' ').replace(/^[,.;:!?]+|[,.;:!?]+$/g, '');
      } else {
        extractedClause = segWords.slice(0, 7).join(' ').replace(/^[,.;:!?]+|[,.;:!?]+$/g, '');
      }
    } else {
      extractedClause = matchingSegment.replace(/^[,.;:!?]+|[,.;:!?]+$/g, '');
    }
  }

  extractedClause = extractedClause.slice(0, 200);
  const wasNarrowed = extractedClause.length < trimmed.length;
  const { formula, detectedVariables } = buildGeneralizedFormulaFromClause(extractedClause);
  const hasVariables = detectedVariables.length > 0;
  const useFormula = hasVariables || trimmed.length > 200;

  return {
    extractedTriggerClause: extractedClause,
    wasClauseNarrowedFromFullInput: wasNarrowed,
    suggestedDictionaryPhrase: extractedClause,
    suggestedRegexPattern: hasVariables ? formula : buildScopedRegexFromPhrase(extractedClause),
    ruleMechanismStrategy: useFormula ? 'PATTERN_FORMULA_REGEX' : 'KEYWORD_DICTIONARY',
    recommendedRuleType: useFormula ? 'REGEX' : 'DICTIONARY',
    strategyTitle: useFormula
      ? 'Parameterized Pattern Formula (REGEX — Recommended)'
      : 'Scoped Keyword Phrase (DICTIONARY — Recommended)',
    strategyRationale: hasVariables
      ? `Isolated trigger clause "${extractedClause}" contains variable tokens (${detectedVariables.join(', ')}). Do not create static dictionary exceptions per ID/number — use the generalized Regex Formula below so 1 rule handles all parameter values.`
      : wasNarrowed
        ? `Narrowed ${trimmed.length}-character prompt down to the ${extractedClause.split(/\s+/).length}-word trigger clause "${extractedClause}". Because this phrase has no dynamic IDs or numbers, a Keyword Phrase (DICTIONARY) is recommended.`
        : `Short static phrase with no variable IDs or numbers. A Keyword Phrase (DICTIONARY) with PARTIAL_MATCH is sufficient; switch to Regex Formula only if users vary the phrasing or include numbers.`,
    estimatedCoverageSummary: hasVariables
      ? `Generalizes ${detectedVariables.length} variable token(s) into reusable regex character classes.`
      : 'Matches this exact multi-word phrase anywhere in a prompt or response.',
    detectedVariableTokens: detectedVariables,
    matchedDomainCategory: null,
  };
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

  // 3. Smart Trigger-Clause Extraction & Keyword vs. Formula Decision
  const warnings: string[] = [];
  const smartExtraction = extractSmartTriggerClauseAndFormula(
    sanitizedInputText,
    mappedExclusionFilterType,
  );

  if (sanitizedInputText.length > 200) {
    warnings.push(
      `Full sanitized input is ${sanitizedInputText.length} characters (exceeds the 200-char Dictionary limit). Isolated the ${smartExtraction.extractedTriggerClause.length}-character trigger clause "${smartExtraction.extractedTriggerClause}".`,
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

  // 4. Check live template quota utilization & streaming chunk boundary risks
  const logStreamingInfo = extractLogExclusionAndStreamingInfo(rawLog);
  if (logStreamingInfo.streamChunkProcessed) {
    warnings.push(
      'This log entry was processed in real-time streaming chunks (stream_chunk_processed=true). Keep exclusion clauses concise (3–6 words) so a phrase is less likely to split across a streaming chunk boundary.',
    );
  }

  if (detectedTemplateName) {
    const matchedTplObj = templates.find((t) => t.name === detectedTemplateName);
    const ruleSets = matchedTplObj?.filterConfig?.filterRuleSettings?.ruleSets;
    if (Array.isArray(ruleSets)) {
      const targetRs = ruleSets.find(
        (rs) => Array.isArray(rs?.filterTypes) && rs.filterTypes.includes(mappedExclusionFilterType),
      );
      const currentRulesCount = Array.isArray(targetRs?.rules) ? targetRs.rules.length : 0;
      if (currentRulesCount >= 8) {
        warnings.push(
          `Target template "${detectedTemplateName.split('/').pop()}" already uses ${currentRulesCount}/10 exclusion rules for ${mappedExclusionFilterType}. Prefer consolidating exceptions into a Regex Formula or appending to an existing Dictionary wordList.`,
        );
      }
    }
  }

  let verdict: ExclusionRecommendationVerdict = 'REVIEW_REQUIRED';
  let verdictLabel = 'Manual Admin Review Recommended';
  let verdictSummary =
    'Verify that this input is a legitimate business/operational false positive before adding an exclusion rule. Prefer narrowing the phrase to the specific domain clause rather than excluding broad words.';

  let suggestedDictionaryPhrase = smartExtraction.suggestedDictionaryPhrase;
  let suggestedRegexPattern = smartExtraction.suggestedRegexPattern;
  let recommendedRuleType = smartExtraction.recommendedRuleType;
  let ruleMechanismStrategy = smartExtraction.ruleMechanismStrategy;
  let strategyTitle = smartExtraction.strategyTitle;
  let strategyRationale = smartExtraction.strategyRationale;

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
      // For adversarial true positives, never generalize into a broader wildcard formula by default
      suggestedDictionaryPhrase = sanitizedInputText.slice(0, 200);
      suggestedRegexPattern = buildScopedRegexFromPhrase(sanitizedInputText);
      recommendedRuleType = sanitizedInputText.length > 200 ? 'REGEX' : 'DICTIONARY';
      ruleMechanismStrategy = recommendedRuleType === 'REGEX' ? 'PATTERN_FORMULA_REGEX' : 'KEYWORD_DICTIONARY';
      strategyTitle =
        recommendedRuleType === 'REGEX'
          ? 'Exact Escaped Regex (Adversarial Fixture Only)'
          : 'Exact Literal Phrase (Adversarial Fixture Only)';
      strategyRationale =
        'Because this prompt matched an adversarial/jailbreak pattern, we intentionally avoid generalizing numbers or tokens into a broader formula so production guardrails are not weakened.';
    } else if (benignMatches.length > 0) {
      verdict = 'LIKELY_FALSE_POSITIVE';
      verdictLabel = 'Likely Benign Operational False Positive';
      verdictSummary = `Matched ${benignMatches
        .map((m) => m.label)
        .join(', ')}. Isolated trigger clause "${smartExtraction.extractedTriggerClause}" (${
        smartExtraction.recommendedRuleType === 'REGEX'
          ? 'Recommended: Pattern Formula REGEX to cover all parameter variations in 1 rule'
          : 'Recommended: Scoped Keyword Phrase DICTIONARY'
      }).`;
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
    extractedTriggerClause: smartExtraction.extractedTriggerClause,
    wasClauseNarrowedFromFullInput: smartExtraction.wasClauseNarrowedFromFullInput,
    suggestedDictionaryPhrase,
    suggestedRegexPattern,
    recommendedRuleType,
    ruleMechanismStrategy,
    strategyTitle,
    strategyRationale,
    estimatedCoverageSummary: smartExtraction.estimatedCoverageSummary,
    detectedVariableTokens: smartExtraction.detectedVariableTokens,
    matchedDomainCategory: smartExtraction.matchedDomainCategory,
    recommendedMatchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
    detectedTemplateName,
    detectedTemplateSource,
    warnings,
  };
};

