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

import { CitationMappings, CitationRolePointers } from '../../../types';
import { CitationMappingRuleItem } from './types';

export const VALID_CITATION_ROLES = new Set(['items', 'uri', 'title', 'snippet', 'id']);
export const MAX_CITATION_MAPPING_ENTRIES = 101; // 100 named tools + "" default entry
export const MAX_JSON_POINTER_LENGTH = 512;
export const AUTO_ITEMS_FIELDS = ['results', 'items', 'documents', 'content'] as const;
export const AUTO_SNIPPET_FIELDS = ['snippet', 'text', 'description', 'summary'] as const;

export interface PointerValidationResult {
  valid: boolean;
  error?: string;
}

export interface CitationValidationIssue {
  severity: 'error' | 'warning';
  toolName: string;
  role?: 'items' | 'uri' | 'title' | 'snippet' | 'id' | 'toolName';
  message: string;
}

export interface PreviewCitationChip {
  index: number;
  uri: string | null;
  title: string;
  snippet: string | null;
  id: string | null;
  hasValidChip: boolean;
  missingUriReason?: string;
  rawItem: Record<string, unknown>;
}

export interface EffectivePointerInfo {
  pointer: string | undefined;
  source: 'tool' | 'default' | 'auto';
}

export interface CitationPreviewResult {
  ok: boolean;
  parseError?: string;
  wrapperType: 'direct_json' | 'mcp_text_json' | 'mcp_unstructured_text' | 'mcp_structured_content';
  wrapperNote?: string;
  toolCovered: boolean;
  uncoveredReason?: string;
  effectivePointers: {
    items: EffectivePointerInfo;
    uri: EffectivePointerInfo;
    title: EffectivePointerInfo;
    snippet: EffectivePointerInfo;
    id: EffectivePointerInfo;
  };
  itemsFound: boolean;
  itemsSourceDescription: string;
  chips: PreviewCitationChip[];
  fallbackTriggered: boolean;
  fallbackReason?: string;
}

/**
 * Validates an RFC 6901 JSON Pointer according to Discovery Engine citation_mappings rules:
 * - Empty string ("") is valid (refers to root of JSON document or item)
 * - Non-empty pointer must start with "/"
 * - Maximum length is 512 characters
 * - "~" must only appear in valid escape sequences "~0" (for "~") or "~1" (for "/")
 */
export function validateJsonPointer(pointer: string): PointerValidationResult {
  if (pointer === '') {
    return { valid: true };
  }
  if (pointer.length > MAX_JSON_POINTER_LENGTH) {
    return {
      valid: false,
      error: `Exceeds the maximum pointer length of ${MAX_JSON_POINTER_LENGTH} characters (${pointer.length}).`,
    };
  }
  if (!pointer.startsWith('/')) {
    return {
      valid: false,
      error: 'Is not a valid RFC 6901 JSON Pointer: nonempty pointers must start with "/".',
    };
  }
  if (/~(?![01])/.test(pointer)) {
    return {
      valid: false,
      error: 'Is not a valid RFC 6901 JSON Pointer: "~" must be escaped as "~0" (for "~") or "~1" (for "/").',
    };
  }
  return { valid: true };
}

/**
 * Evaluates an RFC 6901 JSON Pointer against a parsed JSON value.
 */
export function evaluateJsonPointer(
  doc: unknown,
  pointer: string
): { found: boolean; value: unknown } {
  if (pointer === '') {
    return { found: doc !== undefined, value: doc };
  }
  const validation = validateJsonPointer(pointer);
  if (!validation.valid) {
    return { found: false, value: undefined };
  }

  const tokens = pointer
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = doc;
  for (const token of tokens) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { found: false, value: undefined };
    }
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(token)) {
        return { found: false, value: undefined };
      }
      const idx = Number(token);
      if (idx < 0 || idx >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[idx];
    } else {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, token)) {
        return { found: false, value: undefined };
      }
      current = record[token];
    }
  }

  return { found: current !== undefined, value: current };
}

/**
 * Validates the UI list of CitationMappingRuleItem entries and returns errors & warnings.
 */
export function validateCitationMappings(
  rules: CitationMappingRuleItem[]
): CitationValidationIssue[] {
  const issues: CitationValidationIssue[] = [];

  if (rules.length > MAX_CITATION_MAPPING_ENTRIES) {
    issues.push({
      severity: 'error',
      toolName: '',
      message: `citation_mappings declares ${rules.length} tools, more than the supported maximum of ${MAX_CITATION_MAPPING_ENTRIES} (100 named tools plus the "" default entry).`,
    });
  }

  const seenTools = new Set<string>();
  const defaultRule = rules.find((r) => r.toolName === '');
  const namedRules = rules.filter((r) => r.toolName !== '');
  const defaultHasUri = Boolean(defaultRule && defaultRule.uri.trim().length > 0);

  for (const rule of rules) {
    const key = rule.toolName;
    const label = key === '' ? 'Default ("")' : key;

    if (seenTools.has(key)) {
      issues.push({
        severity: 'error',
        toolName: key,
        role: 'toolName',
        message: `Duplicate entry for tool "${label}". Each tool key in citation_mappings must be unique.`,
      });
    }
    seenTools.add(key);

    if (key !== '' && (key.includes('/') || key.includes(':'))) {
      issues.push({
        severity: 'warning',
        toolName: key,
        role: 'toolName',
        message: `Tool "${key}" contains a "/" or ":" character. Use bare tool names as declared by the MCP server without a server or connector prefix.`,
      });
    }

    // Validate items pointer if provided
    if (!rule.itemsIsRoot && rule.items.trim() !== '') {
      const res = validateJsonPointer(rule.items.trim());
      if (!res.valid) {
        issues.push({
          severity: 'error',
          toolName: key,
          role: 'items',
          message: `Role "items" on tool "${label}": ${res.error}`,
        });
      }
    }

    // Validate item-relative role pointers
    const itemRoles: Array<'uri' | 'title' | 'snippet' | 'id'> = ['uri', 'title', 'snippet', 'id'];
    const effectiveItemsPrefix =
      rule.itemsIsRoot
        ? ''
        : rule.items.trim() || (defaultRule && !defaultRule.itemsIsRoot ? defaultRule.items.trim() : '');

    for (const role of itemRoles) {
      const rawVal = rule[role].trim();
      if (rawVal !== '') {
        const res = validateJsonPointer(rawVal);
        if (!res.valid) {
          issues.push({
            severity: 'error',
            toolName: key,
            role,
            message: `Role "${role}" on tool "${label}": ${res.error}`,
          });
        } else if (
          effectiveItemsPrefix &&
          effectiveItemsPrefix !== '/' &&
          (rawVal.startsWith(`${effectiveItemsPrefix}/`) || rawVal === effectiveItemsPrefix)
        ) {
          issues.push({
            severity: 'warning',
            toolName: key,
            role,
            message: `Role "${role}" ("${rawVal}") starts with the items pointer ("${effectiveItemsPrefix}"). Item pointers are evaluated relative to each individual item (e.g. use "/link" instead of "${effectiveItemsPrefix}/0/link").`,
          });
        }
      }
    }

    // Check uri requirement
    const ownUri = rule.uri.trim();
    if (key === '') {
      // A default entry ("") is exempt from the uri requirement ONLY when named tool entries are also present
      if (namedRules.length === 0 && !ownUri) {
        issues.push({
          severity: 'error',
          toolName: key,
          role: 'uri',
          message: 'Entry for default tool "" declares no "uri" role. When no named tools are present, the default entry must specify a "uri" pointer.',
        });
      }
    } else {
      if (!ownUri && !defaultHasUri) {
        issues.push({
          severity: 'error',
          toolName: key,
          role: 'uri',
          message: `Entry for tool "${key}" declares no "uri" role, and no default ("") "uri" pointer is configured. Every covered tool must provide a "uri".`,
        });
      }
    }
  }

  return issues;
}

/**
 * Validates a raw untrusted JSON value intended for actionConfig.actionParams.citation_mappings.
 * Used for validating Raw JSON Editor input and API payloads.
 */
export function validateRawCitationMappingsObject(raw: unknown): CitationValidationIssue[] {
  const issues: CitationValidationIssue[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push({
      severity: 'error',
      toolName: '',
      message: 'citation_mappings must be an object mapping each tool name to its citation field pointers.',
    });
    return issues;
  }

  const obj = raw as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    // Empty object {} is valid and removes all citation mappings
    return issues;
  }

  if (entries.length > MAX_CITATION_MAPPING_ENTRIES) {
    issues.push({
      severity: 'error',
      toolName: '',
      message: `citation_mappings declares ${entries.length} tools, more than the supported maximum of ${MAX_CITATION_MAPPING_ENTRIES}.`,
    });
  }

  const defaultEntry =
    obj[''] && typeof obj[''] === 'object' && !Array.isArray(obj[''])
      ? (obj[''] as Record<string, unknown>)
      : undefined;
  const defaultHasUri = typeof defaultEntry?.uri === 'string' && defaultEntry.uri.trim() !== '';
  const hasNamedTools = entries.some(([k]) => k !== '');

  for (const [toolName, toolVal] of entries) {
    if (toolVal === null || typeof toolVal !== 'object' || Array.isArray(toolVal)) {
      issues.push({
        severity: 'error',
        toolName,
        message: `Entry for tool "${toolName}" must be an object mapping citation role to JSON Pointer.`,
      });
      continue;
    }

    const roleMap = toolVal as Record<string, unknown>;
    for (const [role, pointerVal] of Object.entries(roleMap)) {
      if (!VALID_CITATION_ROLES.has(role)) {
        issues.push({
          severity: 'error',
          toolName,
          message: `Entry for tool "${toolName}" has unknown citation role "${role}". Valid roles are items, uri, title, snippet, and id.`,
        });
        continue;
      }
      if (typeof pointerVal !== 'string') {
        issues.push({
          severity: 'error',
          toolName,
          role: role as 'items' | 'uri' | 'title' | 'snippet' | 'id',
          message: `Role "${role}" on tool "${toolName}" must be a string JSON Pointer.`,
        });
        continue;
      }
      const ptrCheck = validateJsonPointer(pointerVal);
      if (!ptrCheck.valid) {
        issues.push({
          severity: 'error',
          toolName,
          role: role as 'items' | 'uri' | 'title' | 'snippet' | 'id',
          message: `Role "${role}" on tool "${toolName}": ${ptrCheck.error}`,
        });
      }
    }

    const ownUri = typeof roleMap.uri === 'string' && roleMap.uri.trim() !== '';
    if (toolName === '') {
      if (!hasNamedTools && !ownUri) {
        issues.push({
          severity: 'error',
          toolName: '',
          role: 'uri',
          message: 'Entry for tool "" declares no "uri" role.',
        });
      }
    } else if (!ownUri && !defaultHasUri) {
      issues.push({
        severity: 'error',
        toolName,
        role: 'uri',
        message: `Entry for tool "${toolName}" declares no "uri" role.`,
      });
    }
  }

  return issues;
}

/**
 * Converts an API citation_mappings object into UI CitationMappingRuleItem array.
 */
export function parseCitationMappingsFromApi(
  rawMappings: unknown
): CitationMappingRuleItem[] {
  if (!rawMappings || typeof rawMappings !== 'object' || Array.isArray(rawMappings)) {
    return [];
  }
  const rules: CitationMappingRuleItem[] = [];
  const entries = Object.entries(rawMappings as Record<string, unknown>);

  // Sort so default ("") appears first if present
  entries.sort(([a], [b]) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

  for (const [toolName, val] of entries) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const roleObj = val as CitationRolePointers;
    const hasExplicitEmptyItems =
      Object.prototype.hasOwnProperty.call(roleObj, 'items') && roleObj.items === '';

    rules.push({
      toolName,
      items: typeof roleObj.items === 'string' ? roleObj.items : '',
      itemsIsRoot: hasExplicitEmptyItems,
      uri: typeof roleObj.uri === 'string' ? roleObj.uri : '',
      title: typeof roleObj.title === 'string' ? roleObj.title : '',
      snippet: typeof roleObj.snippet === 'string' ? roleObj.snippet : '',
      id: typeof roleObj.id === 'string' ? roleObj.id : '',
    });
  }

  return rules;
}

/**
 * Converts UI CitationMappingRuleItem array into the API CitationMappings payload object.
 */
export function serializeCitationMappingsToApi(
  rules: CitationMappingRuleItem[]
): CitationMappings {
  const result: CitationMappings = {};
  for (const rule of rules) {
    const key = rule.toolName;
    const entry: CitationRolePointers = {};

    if (rule.itemsIsRoot) {
      entry.items = '';
    } else if (rule.items.trim() !== '') {
      entry.items = rule.items.trim();
    }

    if (rule.uri.trim() !== '') {
      entry.uri = rule.uri.trim();
    }
    if (rule.title.trim() !== '') {
      entry.title = rule.title.trim();
    }
    if (rule.snippet.trim() !== '') {
      entry.snippet = rule.snippet.trim();
    }
    if (rule.id.trim() !== '') {
      entry.id = rule.id.trim();
    }

    result[key] = entry;
  }
  return result;
}

/**
 * Simulates Gemini Enterprise's MCP citation extraction pipeline for a given tool response JSON.
 */
export function previewCitationExtraction(
  rawResponseJson: string,
  toolName: string,
  rules: CitationMappingRuleItem[]
): CitationPreviewResult {
  const emptyPointers = {
    items: { pointer: undefined, source: 'auto' as const },
    uri: { pointer: undefined, source: 'auto' as const },
    title: { pointer: undefined, source: 'auto' as const },
    snippet: { pointer: undefined, source: 'auto' as const },
    id: { pointer: undefined, source: 'auto' as const },
  };

  let parsedRoot: unknown;
  try {
    parsedRoot = JSON.parse(rawResponseJson);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      parseError: `Invalid JSON in sample tool response: ${msg}`,
      wrapperType: 'direct_json',
      toolCovered: false,
      effectivePointers: emptyPointers,
      itemsFound: false,
      itemsSourceDescription: '',
      chips: [],
      fallbackTriggered: false,
    };
  }

  // 1. Check MCP response wrapper handling
  let evaluationDoc: unknown = parsedRoot;
  let wrapperType: CitationPreviewResult['wrapperType'] = 'direct_json';
  let wrapperNote: string | undefined;

  if (parsedRoot && typeof parsedRoot === 'object' && !Array.isArray(parsedRoot)) {
    const rootObj = parsedRoot as Record<string, unknown>;
    if (
      Array.isArray(rootObj.content) &&
      rootObj.content.length > 0 &&
      rootObj.content[0] &&
      typeof rootObj.content[0] === 'object' &&
      (rootObj.content[0] as Record<string, unknown>).type === 'text' &&
      typeof (rootObj.content[0] as Record<string, unknown>).text === 'string' &&
      rootObj.structuredContent === undefined
    ) {
      const innerText = (rootObj.content[0] as Record<string, unknown>).text as string;
      try {
        evaluationDoc = JSON.parse(innerText);
        wrapperType = 'mcp_text_json';
        wrapperNote =
          'Detected MCP content[0].text wrapper containing serialized JSON. Gemini Enterprise decodes this inner JSON first before evaluating pointers.';
      } catch {
        wrapperType = 'mcp_unstructured_text';
        return {
          ok: true,
          wrapperType,
          wrapperNote:
            'Tool returned unstructured plain text inside content[0].text. JSON Pointers cannot evaluate plain text, so citation_mappings will not extract citation chips.',
          toolCovered: false,
          effectivePointers: emptyPointers,
          itemsFound: false,
          itemsSourceDescription: 'Unstructured plain text',
          chips: [],
          fallbackTriggered: true,
          fallbackReason: 'Tool output in content[0].text is not valid serialized JSON.',
        };
      }
    } else if (rootObj.structuredContent && typeof rootObj.structuredContent === 'object') {
      wrapperType = 'mcp_structured_content';
      wrapperNote =
        'Detected MCP structuredContent response. Pointers address the top-level MCP result object (unless items is "" and structuredContent.result is an object).';
    }
  }

  // 2. Resolve tool rule + default ("") inheritance
  const defaultRule = rules.find((r) => r.toolName === '');
  const namedRule = toolName !== '' ? rules.find((r) => r.toolName === toolName) : undefined;

  if (!namedRule && !defaultRule) {
    return {
      ok: true,
      wrapperType,
      wrapperNote,
      toolCovered: false,
      uncoveredReason: `Tool "${toolName || '(unnamed)'}" has no named mapping entry and no default ("") entry is configured.`,
      effectivePointers: emptyPointers,
      itemsFound: false,
      itemsSourceDescription: '',
      chips: [],
      fallbackTriggered: true,
      fallbackReason: 'Tool is not covered by citation_mappings.',
    };
  }

  const resolveItemsPointer = (): EffectivePointerInfo => {
    if (namedRule) {
      if (namedRule.itemsIsRoot) return { pointer: '', source: 'tool' };
      if (namedRule.items.trim() !== '') return { pointer: namedRule.items.trim(), source: 'tool' };
    }
    if (defaultRule) {
      if (defaultRule.itemsIsRoot) return { pointer: '', source: 'default' };
      if (defaultRule.items.trim() !== '') return { pointer: defaultRule.items.trim(), source: 'default' };
    }
    return { pointer: undefined, source: 'auto' };
  };

  const resolveItemRolePointer = (role: 'uri' | 'title' | 'snippet' | 'id'): EffectivePointerInfo => {
    if (namedRule && namedRule[role].trim() !== '') {
      return { pointer: namedRule[role].trim(), source: 'tool' };
    }
    if (defaultRule && defaultRule[role].trim() !== '') {
      return { pointer: defaultRule[role].trim(), source: 'default' };
    }
    return { pointer: undefined, source: 'auto' };
  };

  const effectivePointers = {
    items: resolveItemsPointer(),
    uri: resolveItemRolePointer('uri'),
    title: resolveItemRolePointer('title'),
    snippet: resolveItemRolePointer('snippet'),
    id: resolveItemRolePointer('id'),
  };

  // 3. Locate items list or single object
  let rawItemsList: unknown[] = [];
  let itemsFound = false;
  let itemsSourceDescription = '';

  if (effectivePointers.items.pointer !== undefined) {
    const ptr = effectivePointers.items.pointer;
    // Special rule from Gemini Enterprise docs:
    // "When items is "" and structuredContent.result is an object, the item pointers (uri, title, snippet, and id)
    // resolve against structuredContent.result itself."
    if (
      ptr === '' &&
      evaluationDoc &&
      typeof evaluationDoc === 'object' &&
      !Array.isArray(evaluationDoc) &&
      (evaluationDoc as Record<string, unknown>).structuredContent &&
      typeof (evaluationDoc as Record<string, unknown>).structuredContent === 'object'
    ) {
      const sc = (evaluationDoc as Record<string, unknown>).structuredContent as Record<string, unknown>;
      if (sc.result && typeof sc.result === 'object' && !Array.isArray(sc.result)) {
        rawItemsList = [sc.result];
        itemsFound = true;
        itemsSourceDescription = 'Resolved single object via items="" -> /structuredContent/result';
      }
    }

    if (!itemsFound) {
      const evalRes = evaluateJsonPointer(evaluationDoc, ptr);
      if (evalRes.found && evalRes.value !== null && evalRes.value !== undefined) {
        if (Array.isArray(evalRes.value)) {
          rawItemsList = evalRes.value;
          itemsFound = true;
          itemsSourceDescription = `Resolved ${rawItemsList.length} item(s) at pointer "${ptr || '"" (root)'}"`;
        } else if (typeof evalRes.value === 'object') {
          rawItemsList = [evalRes.value];
          itemsFound = true;
          itemsSourceDescription = `Resolved single object item at pointer "${ptr || '"" (root)'}"`;
        }
      } else {
        itemsSourceDescription = `Pointer "${ptr}" did not match any array or object in the response.`;
      }
    }
  } else {
    // Auto-detect common field names: results, items, documents, content
    if (evaluationDoc && typeof evaluationDoc === 'object' && !Array.isArray(evaluationDoc)) {
      const rec = evaluationDoc as Record<string, unknown>;
      for (const field of AUTO_ITEMS_FIELDS) {
        if (Array.isArray(rec[field])) {
          rawItemsList = rec[field] as unknown[];
          itemsFound = true;
          itemsSourceDescription = `Auto-detected ${rawItemsList.length} item(s) from common field "/${field}"`;
          break;
        }
      }
    } else if (Array.isArray(evaluationDoc)) {
      rawItemsList = evaluationDoc;
      itemsFound = true;
      itemsSourceDescription = `Auto-detected ${rawItemsList.length} item(s) from root array`;
    }
    if (!itemsFound) {
      itemsSourceDescription =
        'Could not auto-detect items list under common fields (/results, /items, /documents, /content). Specify an "items" pointer.';
    }
  }

  // 4. Extract citation fields from each item
  const chips: PreviewCitationChip[] = [];
  for (let i = 0; i < rawItemsList.length; i++) {
    const item = rawItemsList[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const itemRecord = item as Record<string, unknown>;

    // URI
    let uriVal: string | null = null;
    let missingUriReason: string | undefined;
    if (effectivePointers.uri.pointer) {
      const res = evaluateJsonPointer(itemRecord, effectivePointers.uri.pointer);
      if (res.found && res.value !== null && res.value !== undefined && String(res.value).trim() !== '') {
        uriVal = String(res.value).trim();
      } else {
        missingUriReason = `Pointer "${effectivePointers.uri.pointer}" did not match a non-empty value on item #${i + 1}.`;
      }
    } else {
      missingUriReason = 'No "uri" pointer is configured for this tool.';
    }

    // Title (defaults to "Untitled" if omitted or missed)
    let titleVal = 'Untitled';
    if (effectivePointers.title.pointer) {
      const res = evaluateJsonPointer(itemRecord, effectivePointers.title.pointer);
      if (res.found && res.value !== null && res.value !== undefined && String(res.value).trim() !== '') {
        titleVal = String(res.value).trim();
      }
    }

    // Snippet (auto-falls back to snippet, text, description, summary if omitted or missed)
    let snippetVal: string | null = null;
    if (effectivePointers.snippet.pointer) {
      const res = evaluateJsonPointer(itemRecord, effectivePointers.snippet.pointer);
      if (res.found && res.value !== null && res.value !== undefined && String(res.value).trim() !== '') {
        snippetVal = String(res.value).trim();
      }
    }
    if (snippetVal === null) {
      for (const fallbackField of AUTO_SNIPPET_FIELDS) {
        const candidate = itemRecord[fallbackField];
        if (typeof candidate === 'string' && candidate.trim() !== '') {
          snippetVal = candidate.trim();
          break;
        }
      }
    }

    // ID (defaults to uri if omitted or missed)
    let idVal: string | null = uriVal;
    if (effectivePointers.id.pointer) {
      const res = evaluateJsonPointer(itemRecord, effectivePointers.id.pointer);
      if (res.found && res.value !== null && res.value !== undefined && String(res.value).trim() !== '') {
        idVal = String(res.value).trim();
      }
    }

    chips.push({
      index: i,
      uri: uriVal,
      title: titleVal,
      snippet: snippetVal,
      id: idVal,
      hasValidChip: Boolean(uriVal),
      missingUriReason,
      rawItem: itemRecord,
    });
  }

  const validChipsCount = chips.filter((c) => c.hasValidChip).length;
  const fallbackTriggered = !itemsFound || validChipsCount === 0;
  const fallbackReason = !itemsFound
    ? 'No items matched the items pointer — Gemini Enterprise will fall back to automatic response handling.'
    : validChipsCount === 0
      ? 'No result item resolved a valid "uri" — Gemini Enterprise will fall back to automatic response handling.'
      : undefined;

  return {
    ok: true,
    wrapperType,
    wrapperNote,
    toolCovered: true,
    effectivePointers,
    itemsFound,
    itemsSourceDescription,
    chips,
    fallbackTriggered,
    fallbackReason,
  };
}

export interface SampleMcpResponsePreset {
  id: string;
  label: string;
  description: string;
  recommendedRule: Omit<CitationMappingRuleItem, 'toolName'>;
  sampleJson: string;
}

export const SAMPLE_MCP_RESPONSE_PRESETS: SampleMcpResponsePreset[] = [
  {
    id: 'standard_results',
    label: 'Standard Results List (/results)',
    description: 'JSON object with a /results array containing link, name, summary, and doc_id',
    recommendedRule: {
      items: '/results',
      itemsIsRoot: false,
      uri: '/link',
      title: '/name',
      snippet: '/summary',
      id: '/doc_id',
    },
    sampleJson: JSON.stringify(
      {
        results: [
          {
            doc_id: 'kb-1042',
            name: 'Global Expense Policy 2026',
            link: 'https://intranet.cymbal.com/kb/1042',
            summary: 'Business travel meals are reimbursed up to 60 USD per day with itemized receipts.',
          },
          {
            doc_id: 'kb-2088',
            name: 'Corporate Card Guidelines',
            link: 'https://intranet.cymbal.com/kb/2088',
            summary: 'Submit expense reports within 30 days of statement closing.',
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'mcp_text_wrapper',
    label: 'MCP Text Content Wrapper',
    description: 'Standard MCP content[0].text wrapper containing serialized JSON string',
    recommendedRule: {
      items: '/results',
      itemsIsRoot: false,
      uri: '/link',
      title: '/name',
      snippet: '/summary',
      id: '/doc_id',
    },
    sampleJson: JSON.stringify(
      {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [
                {
                  doc_id: 'INC-9401',
                  name: 'P1 Outage Postmortem: Auth Gateway',
                  link: 'https://servicenow.cymbal.com/incidents/INC-9401',
                  summary: 'Root cause traced to expired mTLS leaf certificate on regional proxy.',
                },
              ],
            }),
          },
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'mcp_structured_content',
    label: 'MCP structuredContent (/structuredContent/results)',
    description: 'MCP response returning structuredContent with nested items',
    recommendedRule: {
      items: '/structuredContent/results',
      itemsIsRoot: false,
      uri: '/url',
      title: '/title',
      snippet: '/description',
      id: '/id',
    },
    sampleJson: JSON.stringify(
      {
        structuredContent: {
          results: [
            {
              id: 'JIRA-4510',
              title: 'Implement RFC 6901 Citation Mappings UI',
              url: 'https://jira.cymbal.com/browse/JIRA-4510',
              description: 'Add visual pointer mapping and live citation chip previewer for BYOMCP connectors.',
            },
          ],
        },
      },
      null,
      2
    ),
  },
  {
    id: 'single_object_root',
    label: 'Single Document Object (items: "")',
    description: 'Tool that returns a single document object directly at root instead of a list',
    recommendedRule: {
      items: '',
      itemsIsRoot: true,
      uri: '/link',
      title: '/name',
      snippet: '/summary',
      id: '/doc_id',
    },
    sampleJson: JSON.stringify(
      {
        doc_id: 'kb-1042',
        name: 'Global Expense Policy 2026',
        link: 'https://intranet.cymbal.com/kb/1042',
        summary: 'Single document lookup response with direct top-level fields.',
      },
      null,
      2
    ),
  },
];
