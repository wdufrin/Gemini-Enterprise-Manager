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

/**
 * Top-level Engine update-mask fields whose proto definition carries
 * `(google.api.field_visibility).restriction = "GOOGLE_INTERNAL"`
 * (google3 google/cloud/discoveryengine/v1main/engine.proto).
 *
 * Projects that are not enrolled in the GOOGLE_INTERNAL visibility label cannot
 * write these fields. Kept dependency-free so both the API layer and UI hooks can import it.
 */
export const GOOGLE_INTERNAL_ENGINE_UPDATE_FIELDS: readonly string[] = [
  "includeCrossDomainDocuments",
  "allowMultipleDataStoresSearchEngine",
  "effectiveFeatures",
  "personalizationConfig",
  "agentCreationConfig",
  "agentControlConfig",
  "globalFeatureToggleState",
  "adminEmailNotificationsConfig",
];

const toSnakeCase = (field: string): string =>
  field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Returns true when an update-mask entry (camelCase or snake_case) targets a GOOGLE_INTERNAL field. */
export const isGoogleInternalEngineField = (maskField: string): boolean => {
  const topLevel = maskField.split(".")[0];
  return GOOGLE_INTERNAL_ENGINE_UPDATE_FIELDS.some(
    (f) => f === topLevel || toSnakeCase(f) === topLevel,
  );
};
