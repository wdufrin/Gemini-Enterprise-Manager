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

export type LocationResidencyTier = 'MULTI_REGION' | 'IN_COUNTRY_DRZ';

export interface GeminiEnterpriseLocationSpec {
  id: string;
  label: string;
  shortLabel: string;
  tier: LocationResidencyTier;
  /** Whether Gemini Notebook for business is available in this location (locations.md). */
  supportsNotebook: boolean;
  /** Whether allowlist enrollment is required for in-country DRZ provisioning. */
  requiresAllowlist: boolean;
  /** Recommended Cloud Agent Gateway regional location when binding egress gateways. */
  agentGatewayRegion?: string;
}

/**
 * Canonical Gemini Enterprise locations (multi-regions + allowlisted GA in-country DRZ regions)
 * verified against `gemini/enterprise/docs/locations` and `ModelRegistry.gcl` (Nov 2026).
 */
export const GEMINI_ENTERPRISE_LOCATIONS: readonly GeminiEnterpriseLocationSpec[] = [
  {
    id: 'global',
    label: 'global — Global Multi-Region',
    shortLabel: 'Global',
    tier: 'MULTI_REGION',
    supportsNotebook: true,
    requiresAllowlist: false,
    agentGatewayRegion: 'us-central1',
  },
  {
    id: 'us',
    label: 'us — United States Multi-Region (DRZ + MLP)',
    shortLabel: 'US Multi-Region',
    tier: 'MULTI_REGION',
    supportsNotebook: true,
    requiresAllowlist: false,
    agentGatewayRegion: 'us-central1',
  },
  {
    id: 'eu',
    label: 'eu — European Union Multi-Region (DRZ + MLP)',
    shortLabel: 'EU Multi-Region',
    tier: 'MULTI_REGION',
    supportsNotebook: true,
    requiresAllowlist: false,
    agentGatewayRegion: 'europe-west1',
  },
  {
    id: 'ca',
    label: 'ca — Canada (In-Country DRZ)',
    shortLabel: 'Canada (ca)',
    tier: 'IN_COUNTRY_DRZ',
    supportsNotebook: true,
    requiresAllowlist: true,
  },
  {
    id: 'br',
    label: 'br — Brazil (In-Country DRZ)',
    shortLabel: 'Brazil (br)',
    tier: 'IN_COUNTRY_DRZ',
    supportsNotebook: false,
    requiresAllowlist: true,
  },
  {
    id: 'europe-west2',
    label: 'europe-west2 — United Kingdom (In-Country DRZ)',
    shortLabel: 'UK (europe-west2)',
    tier: 'IN_COUNTRY_DRZ',
    supportsNotebook: true,
    requiresAllowlist: true,
  },
  {
    id: 'asia-northeast1',
    label: 'asia-northeast1 — Japan (In-Country DRZ)',
    shortLabel: 'Japan (asia-northeast1)',
    tier: 'IN_COUNTRY_DRZ',
    supportsNotebook: true,
    requiresAllowlist: true,
    agentGatewayRegion: 'asia-northeast1',
  },
  {
    id: 'sg',
    label: 'sg — Singapore (In-Country DRZ)',
    shortLabel: 'Singapore (sg)',
    tier: 'IN_COUNTRY_DRZ',
    supportsNotebook: true,
    requiresAllowlist: true,
  },
  {
    id: 'in',
    label: 'in — India (In-Country DRZ)',
    shortLabel: 'India (in)',
    tier: 'IN_COUNTRY_DRZ',
    supportsNotebook: true,
    requiresAllowlist: true,
  },
  {
    id: 'au',
    label: 'au — Australia (In-Country DRZ)',
    shortLabel: 'Australia (au)',
    tier: 'IN_COUNTRY_DRZ',
    supportsNotebook: true,
    requiresAllowlist: true,
  },
] as const;

export const GEMINI_ENTERPRISE_LOCATION_IDS: string[] = GEMINI_ENTERPRISE_LOCATIONS.map(
  (loc) => loc.id,
);

export function getLocationSpec(locationId: string): GeminiEnterpriseLocationSpec | undefined {
  const normalized = (locationId || '').trim().toLowerCase();
  return GEMINI_ENTERPRISE_LOCATIONS.find((loc) => loc.id === normalized);
}

/**
 * Static regional availability map from `ModelRegistry.gcl` (Nov 2026).
 * Used when `ResolvedModel.adminView.regions` is not returned by `GetWidgetConfig`
 * so admins receive accurate `gcp.resourceLocations` Org Policy warnings.
 */
export const MODEL_SUPPORTED_REGIONS: Record<string, readonly string[]> = {
  'gemini-4-neon': ['global', 'us', 'eu'],
  'gemini-4-hydrogen': ['global', 'us', 'eu'],
  'gemini-4-hydrogen-fast': ['global', 'us', 'eu'],
  'gemini-4-carbon': ['global', 'us', 'eu'],
  'gemini-4-argon': ['global', 'us', 'eu'],
  'gemini-3.8-flash': ['global', 'us', 'eu', 'ca', 'asia-northeast1', 'europe-west2', 'sg'],
  'gemini-3.7-flash': ['global', 'us', 'eu'],
  'gemini-3.6-flash': ['global', 'us', 'eu'],
  'gemini-3.5-flash': ['global', 'us', 'eu', 'br', 'ca', 'in', 'sg', 'asia-northeast1', 'europe-west2'],
  'gemini-3.1-pro-preview': ['global', 'us'],
  'gemini-2.5-pro': ['global', 'us', 'eu'],
  'gemini-2.5-flash': ['global', 'us', 'eu', 'au', 'ca', 'in', 'kr', 'asia-northeast1', 'europe-west2'],
  'claude-opus-5-5': ['global', 'us', 'eu'],
  'claude-sonnet-5-5': ['global', 'us', 'eu'],
  'gemini-3.1-flash-image': ['global', 'us', 'eu'],
  'gemini-3-pro-image': ['global'],
  'gemini-2.5-flash-image': ['global', 'us', 'eu'],
};

export function isModelSupportedInRegion(
  modelId: string,
  appLocation: string,
  apiRegions?: string[],
): boolean {
  const loc = (appLocation || 'global').trim().toLowerCase();
  if (Array.isArray(apiRegions) && apiRegions.length > 0) {
    return apiRegions.map((r) => r.toLowerCase()).includes(loc);
  }
  const fallbackRegions = MODEL_SUPPORTED_REGIONS[modelId];
  if (!fallbackRegions) {
    return true;
  }
  return fallbackRegions.includes(loc);
}
