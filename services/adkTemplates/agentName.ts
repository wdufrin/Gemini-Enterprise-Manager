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
 * Agent-name rules for ADK Studio.
 *
 * One name is typed by the user but lands in two places with DIFFERENT and
 * partly incompatible rules, which is why this lives in one module rather than
 * being inlined at each use:
 *
 * 1. `Agent(name=...)` in the generated Python. ADK requires a valid Python
 *    identifier. Verified against google-adk 2.3.0:
 *      - "GCP_BigQuery_Orchestrator"  ACCEPTED  (uppercase is fine)
 *      - "gcp_bigquery_orchestrator"  ACCEPTED
 *      - "GCP-BigQuery-Orchestrator"  REJECTED  (hyphens are not)
 *      - "GCP BigQuery"               REJECTED  (spaces are not)
 *
 * 2. The Cloud Run service name in `gcloud run deploy`. That name becomes part
 *    of the service hostname, so it must be a lowercase DNS label -- uppercase
 *    and underscores are both invalid there.
 *
 * So the correct behaviour is to ACCEPT uppercase from the user and lowercase
 * it only when deriving the Cloud Run name. Forbidding uppercase outright
 * rejected all five shipped starter templates; lowercasing the Python
 * identifier would be a silent rewrite of the name the user chose.
 */

/** A valid Python identifier: letters, digits and underscores, not starting with a digit. */
export const ADK_AGENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Guidance shown next to the Agent Name field, and reused in error messages. */
export const ADK_AGENT_NAME_HINT =
  "Required. Must start with a letter or underscore and contain only letters, numbers, and underscores (no spaces or hyphens).";

/** True when `name` is usable as an ADK agent name. */
export const isValidAdkAgentName = (name: string | undefined | null): boolean =>
  typeof name === "string" && ADK_AGENT_NAME_PATTERN.test(name);

/**
 * Derives the Cloud Run service name from an ADK agent name.
 *
 * Lowercases and converts underscores to hyphens, e.g.
 * `GCP_BigQuery_Orchestrator` -> `gcp-bigquery-orchestrator`.
 *
 * Returns "" for an empty name so callers can treat a partially-filled form as
 * "nothing to validate yet" rather than an error.
 */
export const toCloudRunServiceName = (
  name: string | undefined | null,
): string => {
  if (!name) return "";
  return name.toLowerCase().replace(/_/g, "-");
};
