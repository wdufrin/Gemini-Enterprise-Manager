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

import { gapiRequest } from "./core";

export interface SecretManagerSecret {
  name: string;
  createTime?: string;
  labels?: Record<string, string>;
  replication?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ListSecretsResponse {
  secrets?: SecretManagerSecret[];
  nextPageToken?: string;
  totalSize?: number;
}

export interface SecretVersionAccessResponse {
  name?: string;
  payload?: {
    data?: string;
    dataCrc32c?: string;
  };
}

/**
 * Regex Pattern Matching validator for Secret Manager version resource paths:
 * `projects/{project}/secrets/{secret}/versions/{version|latest}`.
 * Known limits: Validates resource path segments via regular expression; does not resolve IAM or project aliases.
 */
const SECRET_VERSION_NAME_REGEX =
  /^projects\/[a-zA-Z0-9_-]+\/secrets\/[a-zA-Z0-9_-]+\/versions\/(?:latest|[0-9]+)$/;

/**
 * Safely decodes standard or URL-safe Base64 `payload.data` into a UTF-8 string in memory.
 * Rejects malformed Base64 or invalid UTF-8 byte sequences explicitly.
 */
export const decodeBase64Utf8 = (base64Data: string): string => {
  if (typeof base64Data !== "string") {
    throw new Error("Secret Manager payload.data must be a base64-encoded string.");
  }
  const compact = base64Data.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!compact) {
    return "";
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 === 1) {
    throw new Error("Malformed base64 data returned in Secret Manager payload.");
  }
  const padded = compact.padEnd(compact.length + ((4 - (compact.length % 4)) % 4), "=");

  let binary: string;
  try {
    binary = atob(padded);
  } catch (err: unknown) {
    throw new Error(
      `Failed to decode base64 Secret Manager payload: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

/**
 * Lists secrets in the target Google Cloud project via Secret Manager v1 API.
 */
export const listSecrets = async (projectId: string): Promise<SecretManagerSecret[]> => {
  const cleanProject = (projectId || "").trim();
  if (!cleanProject) {
    throw new Error("Project ID is required to list Secret Manager secrets.");
  }

  const url = `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(
    cleanProject,
  )}/secrets?pageSize=100`;
  const response = await gapiRequest<ListSecretsResponse>(url, "GET", cleanProject);
  return Array.isArray(response?.secrets) ? response.secrets : [];
};

/**
 * Accesses a Secret Manager secret version (`projects/{p}/secrets/{s}/versions/latest` or numeric version)
 * and decodes `payload.data` (Base64 -> UTF-8) strictly in memory.
 */
export const accessSecretVersion = async (
  secretVersionName: string,
  projectId: string,
): Promise<string> => {
  const cleanVersionName = (secretVersionName || "").trim().replace(/^\/+/, "");
  const cleanProject = (projectId || "").trim();

  if (!cleanProject) {
    throw new Error("Project ID is required to access a Secret Manager secret version.");
  }
  if (!SECRET_VERSION_NAME_REGEX.test(cleanVersionName)) {
    throw new Error(
      `Invalid Secret Manager version resource name: "${secretVersionName}". Expected projects/{project}/secrets/{secret}/versions/{version|latest}.`,
    );
  }

  const url = `https://secretmanager.googleapis.com/v1/${cleanVersionName}:access`;
  const response = await gapiRequest<SecretVersionAccessResponse>(url, "GET", cleanProject);
  const encodedData = response?.payload?.data;
  if (typeof encodedData !== "string" || encodedData.length === 0) {
    throw new Error(
      `Secret version "${cleanVersionName}" returned an empty or missing payload.data.`,
    );
  }

  return decodeBase64Utf8(encodedData);
};
