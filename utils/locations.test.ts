/**
 * Copyright 2026 Google LLC
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

import { describe, expect, it } from 'vitest';
import {
  GEMINI_ENTERPRISE_LOCATIONS,
  GEMINI_ENTERPRISE_LOCATION_IDS,
  getLocationSpec,
  isModelSupportedInRegion,
} from './locations';

describe('locations registry & regional model checks', () => {
  it('includes core multi-regions and all 7 allowlisted GA in-country DRZ regions', () => {
    expect(GEMINI_ENTERPRISE_LOCATION_IDS).toEqual([
      'global',
      'us',
      'eu',
      'ca',
      'br',
      'europe-west2',
      'asia-northeast1',
      'sg',
      'in',
      'au',
    ]);
    expect(new Set(GEMINI_ENTERPRISE_LOCATION_IDS).size).toBe(GEMINI_ENTERPRISE_LOCATIONS.length);
  });

  it('marks Brazil (br) as not supporting Gemini Notebook per locations.md', () => {
    const br = getLocationSpec('BR');
    expect(br).toBeDefined();
    expect(br?.tier).toBe('IN_COUNTRY_DRZ');
    expect(br?.supportsNotebook).toBe(false);
    expect(br?.requiresAllowlist).toBe(true);

    expect(getLocationSpec('unknown-region')).toBeUndefined();
    expect(getLocationSpec('')).toBeUndefined();
  });

  it('enforces regional model support including Oct/Nov 2026 discontinuations and expansions', () => {
    // Gemini 4 Neon & Hydrogen: global, us, eu only
    expect(isModelSupportedInRegion('gemini-4-neon', 'global')).toBe(true);
    expect(isModelSupportedInRegion('gemini-4-neon', 'eu')).toBe(true);
    expect(isModelSupportedInRegion('gemini-4-neon', 'ca')).toBe(false);
    expect(isModelSupportedInRegion('gemini-4-hydrogen', 'br')).toBe(false);

    // Gemini 2.5 Pro discontinued in ca & asia-northeast1 on Oct 20, 2026
    expect(isModelSupportedInRegion('gemini-2.5-pro', 'us')).toBe(true);
    expect(isModelSupportedInRegion('gemini-2.5-pro', 'ca')).toBe(false);
    expect(isModelSupportedInRegion('gemini-2.5-pro', 'asia-northeast1')).toBe(false);

    // Gemini 3.8 Flash expanded to ca, asia-northeast1, europe-west2, sg
    expect(isModelSupportedInRegion('gemini-3.8-flash', 'ca')).toBe(true);
    expect(isModelSupportedInRegion('gemini-3.8-flash', 'asia-northeast1')).toBe(true);
    expect(isModelSupportedInRegion('gemini-3.8-flash', 'europe-west2')).toBe(true);
    expect(isModelSupportedInRegion('gemini-3.8-flash', 'sg')).toBe(true);
    expect(isModelSupportedInRegion('gemini-3.8-flash', 'br')).toBe(false);

    // Gemini 3 Pro Image is global-only
    expect(isModelSupportedInRegion('gemini-3-pro-image', 'global')).toBe(true);
    expect(isModelSupportedInRegion('gemini-3-pro-image', 'us')).toBe(false);

    // API-supplied regions take precedence over static table
    expect(isModelSupportedInRegion('gemini-4-neon', 'ca', ['global', 'ca'])).toBe(true);
    expect(isModelSupportedInRegion('custom-eap-model', 'br')).toBe(true);
  });
});
