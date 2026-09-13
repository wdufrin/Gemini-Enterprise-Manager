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

export type FilterMap = Record<string, string[]>;

export interface EntityFilterMap {
  inclusion: FilterMap;
  exclusion: FilterMap;
}

// Helper to sanitize and normalize filter maps
export const cleanFilterMap = (map: FilterMap): FilterMap => {
  const result: FilterMap = {};
  Object.entries(map || {}).forEach(([key, values]) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    const cleanValues = (Array.isArray(values) ? values : [values])
      .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
      .filter((v) => v.length > 0);
    if (cleanValues.length > 0) {
      result[trimmedKey] = Array.from(new Set(cleanValues));
    }
  });
  return result;
};

// Count total filter values across all keys in a map
export const countFilterRules = (map?: unknown): number => {
  if (!map || typeof map !== 'object') return 0;
  return Object.values(map as Record<string, unknown>).reduce<number>((acc: number, curr: unknown) => acc + (Array.isArray(curr) ? curr.length : 0), 0);
};

// Deep compare two filter maps
export const areFilterMapsEqual = (a: FilterMap, b: FilterMap): boolean => {
  const cleanA = cleanFilterMap(a);
  const cleanB = cleanFilterMap(b);
  const keysA = Object.keys(cleanA).sort();
  const keysB = Object.keys(cleanB).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (key !== keysB[i]) return false;
    const valsA = (cleanA[key] || []).slice().sort();
    const valsB = (cleanB[key] || []).slice().sort();
    if (valsA.length !== valsB.length) return false;
    for (let j = 0; j < valsA.length; j++) {
      if (valsA[j] !== valsB[j]) return false;
    }
  }
  return true;
};
