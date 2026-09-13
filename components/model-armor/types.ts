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

export const getTemplateFilters = (template: any) => {
  const fc = template.filterConfig || {};
  const raiFilters = fc.raiSettings?.raiFilters || [];
  const activeRai = raiFilters.map((f: any) => ({
    type: f.filterType,
    level: f.confidenceLevel,
  }));
  const sdpActive = fc.sdpSettings?.basicConfig?.filterEnforcement === 'ENABLED';
  const jailbreakActive = fc.piAndJailbreakFilterSettings?.filterEnforcement === 'ENABLED';
  const maliciousUrisActive = fc.maliciousUriFilterSettings?.filterEnforcement === 'ENABLED';

  return {
    rai: activeRai,
    sdp: sdpActive,
    jailbreak: jailbreakActive,
    maliciousUris: maliciousUrisActive,
  };
};

export const formatConfidenceLevel = (level: string) => {
  if (level === 'LOW_AND_ABOVE') return 'Low+';
  if (level === 'MEDIUM_AND_ABOVE') return 'Med+';
  if (level === 'HIGH') return 'High';
  return level;
};
