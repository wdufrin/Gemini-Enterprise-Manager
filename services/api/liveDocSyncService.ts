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

import { Config } from '../../types';
import {
  ConnectorChecklistDefinition,
  ChecklistSectionDefinition,
  ChecklistItemDefinition,
} from '../../components/connectors/checklist/types';
import { gapiRequest } from './core';

const CACHE_PREFIX = 'gem_live_checklist_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedChecklist {
  definition: ConnectorChecklistDefinition;
  timestamp: number;
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

/**
 * Fetches and synchronizes live documentation checklists using Vertex AI Gemini grounding.
 * Falls back gracefully to bundled baseline if offline, unauthenticated, or on error.
 */
export async function syncLiveDocChecklist(
  baselineDef: ConnectorChecklistDefinition,
  config: Config,
  forceRefresh: boolean = false
): Promise<ConnectorChecklistDefinition> {
  const vendorId = baselineDef.vendorId;
  const cacheKey = `${CACHE_PREFIX}${vendorId}`;

  // 1. Check local cache unless forceRefresh requested
  if (!forceRefresh && typeof window !== 'undefined' && window.localStorage) {
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached: CachedChecklist = JSON.parse(cachedRaw);
        const age = Date.now() - cached.timestamp;
        if (age < CACHE_TTL_MS && cached.definition) {
          return {
            ...cached.definition,
            syncSource: 'CACHED',
          };
        }
      }
    } catch (e) {
      console.warn('[liveDocSyncService] Failed to read from cache', e);
    }
  }

  // 2. Validate prerequisites for Vertex AI API call
  if (!config.projectId) {
    return {
      ...baselineDef,
      syncSource: 'BUNDLED',
    };
  }

  try {
    const location = config.reasoningEngineLocation || config.appLocation || 'us-central1';
    const validLoc = location === 'global' ? 'us-central1' : location;

    const docTarget = baselineDef.documentationUrl || 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/introduction-to-connectors-and-data-stores';
    const prompt = `You are a Google Cloud enterprise architect. Query and analyze the official Google Cloud documentation for "${baselineDef.vendorDisplayName}" in Gemini Enterprise / Vertex AI Search (${docTarget}).
    
Identify all mandatory administrative setup steps, OAuth scopes, redirect URIs, service account roles, and firewall/ingress requirements needed by an enterprise administrator.

Respond ONLY with a valid JSON object wrapped inside a \`\`\`json markdown block, strictly matching this schema:
{
  "sections": [
    {
      "id": "string",
      "title": "string",
      "stepNumber": 1,
      "description": "string",
      "items": [
        {
          "id": "string",
          "label": "string",
          "subLabel": "string",
          "badge": "Required" | "Optional" | "Recommended",
          "codeSnippet": "string or empty",
          "appliesToMode": "ALL" | "INGESTION" | "FEDERATED"
        }
      ]
    }
  ]
}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      tools: [
        {
          googleSearch: {},
        },
      ],
      generationConfig: {
        temperature: 0.1,
      },
    };

    // Candidate Gemini models (gemini-2.5-flash as default, falling back to gemini-2.5-pro)
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-pro'];
    let response: GenerateContentResponse | null = null;
    let lastError: unknown = null;

    for (const model of modelsToTry) {
      try {
        const url = `https://${validLoc}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${validLoc}/publishers/google/models/${model}:generateContent`;
        response = await gapiRequest<GenerateContentResponse>(
          url,
          'POST',
          config.projectId,
          undefined,
          requestBody,
          undefined,
          true // suppress automatic error toast to allow clean fallback
        );
        if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw lastError || new Error('No candidate content received from Vertex AI.');
    }

    // Extract JSON block from response text (handling markdown fences or leading/trailing commentary)
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/);
    const cleanedJson = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
    const parsedData = JSON.parse(cleanedJson);

    if (!parsedData.sections || !Array.isArray(parsedData.sections)) {
      throw new Error('Parsed response missing "sections" array.');
    }

    // Merge parsed sections with baseline (preserving automated probes)
    const mergedDefinition = mergeLiveSectionsWithBaseline(baselineDef, parsedData.sections);

    // Save to local storage cache
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const toCache: CachedChecklist = {
          definition: mergedDefinition,
          timestamp: Date.now(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(toCache));
      } catch (e) {
        console.warn('[liveDocSyncService] Failed to cache live checklist', e);
      }
    }

    return mergedDefinition;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[liveDocSyncService] Live doc sync failed for ${baselineDef.vendorId}:`, errorMsg);
    return {
      ...baselineDef,
      syncSource: 'BUNDLED',
    };
  }
}

/**
 * Merges newly discovered sections/items with baseline definitions,
 * preserving any automated probes from baseline and highlighting newly added items.
 */
export function mergeLiveSectionsWithBaseline(
  baseline: ConnectorChecklistDefinition,
  liveSections: ChecklistSectionDefinition[]
): ConnectorChecklistDefinition {
  const existingProbesById = new Map<string, ChecklistItemDefinition['automatedProbe']>();
  baseline.sections.forEach((sec) => {
    sec.items.forEach((it) => {
      if (it.automatedProbe) {
        existingProbesById.set(it.id, it.automatedProbe);
      }
    });
  });

  const mergedSections: ChecklistSectionDefinition[] = liveSections.map((sec, sIdx) => ({
    id: sec.id || `live_sec_${sIdx + 1}`,
    title: sec.title || `Setup Step ${sIdx + 1}`,
    stepNumber: sec.stepNumber || sIdx + 1,
    description: sec.description || '',
    items: (sec.items || []).map((it, iIdx) => {
      const itemId = it.id || `live_item_${sIdx + 1}_${iIdx + 1}`;
      const existingProbe = existingProbesById.get(itemId);
      const isNewItem = !baseline.sections.some((s) => s.items.some((bItem) => bItem.id === itemId));

      return {
        id: itemId,
        label: it.label || 'Configuration Step',
        subLabel: it.subLabel,
        description: it.description,
        badge: it.badge || (isNewItem ? 'Live KB Verified' : 'Required'),
        appliesToMode: it.appliesToMode || 'ALL',
        codeSnippet: it.codeSnippet || undefined,
        automatedProbe: existingProbe,
        isLiveDocUpdate: isNewItem,
      };
    }),
  }));

  return {
    ...baseline,
    sections: mergedSections.length > 0 ? mergedSections : baseline.sections,
    syncSource: 'LIVE_KB',
    lastSyncedAt: new Date().toISOString(),
  };
}

/**
 * Clears cached live checklist definitions from localStorage.
 */
export function clearLiveChecklistCache(vendorId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (vendorId) {
    localStorage.removeItem(`${CACHE_PREFIX}${vendorId}`);
  } else {
    try {
      const allKeys: string[] = [];
      const len = localStorage.length || 0;
      for (let i = 0; i < len; i++) {
        const k = localStorage.key(i);
        if (k) allKeys.push(k);
      }
      // Also check Object.keys for Node/Polyfill environments
      Object.keys(localStorage).forEach((k) => {
        if (!allKeys.includes(k)) allKeys.push(k);
      });

      allKeys
        .filter((key) => key.startsWith(CACHE_PREFIX))
        .forEach((key) => localStorage.removeItem(key));
    } catch (e) {
      console.warn('[liveDocSyncService] Error clearing live checklist cache', e);
    }
  }
}
