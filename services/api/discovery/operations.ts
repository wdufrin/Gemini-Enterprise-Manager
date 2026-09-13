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

import { Config, DiscoverySession, Operation, DiscoveryAnswer } from "../../../types";
import {
  gapiRequest,
  getDiscoveryEngineUrl,
  DISCOVERY_API_VERSION,
  DISCOVERY_API_BETA,
} from "../core";
import { toErrorMessage } from "../../../utils/errors";

export const getDiscoveryOperation = async <T = Record<string, unknown>>(
  name: string,
  config: Config,
  apiVersion: string = DISCOVERY_API_VERSION,
): Promise<Operation<T>> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<Operation<T>>(
    `${baseUrl}/${apiVersion}/${name}`,
    "GET",
    config.projectId,
  );
};

export const pollDiscoveryOperation = async <T = Record<string, unknown>>(
  operation: Operation<T>,
  config: Config,
  apiVersion: string = DISCOVERY_API_BETA,
  maxAttempts: number = 30,
  delayMs: number = 2000,
): Promise<Operation<T>> => {
  if (!operation || !operation.name) {
    return operation;
  }
  if (operation.done) {
    if (operation.error) {
      throw new Error(
        operation.error.message ||
          `Operation failed with code ${operation.error.code}`,
      );
    }
    return operation;
  }

  let currentOp = operation;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      currentOp = await getDiscoveryOperation<T>(operation.name, config, apiVersion);
      if (currentOp.done) {
        if (currentOp.error) {
          throw new Error(
            currentOp.error.message ||
              `Operation failed with code ${currentOp.error.code}`,
          );
        }
        return currentOp;
      }
    } catch (err: unknown) {
      const msg = toErrorMessage(err);
      if (msg && msg.includes("Operation failed")) {
        throw err;
      }
      console.warn("Polling operation encountered transient error, will retry:", err);
    }
  }
  return currentOp;
};

export const listOperations = async <T = Record<string, unknown>>(
  config: Config,
  filter?: string,
): Promise<{ operations?: Operation<T>[]; nextPageToken?: string }> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  let url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${config.projectId}/locations/${config.appLocation}/operations`;
  if (filter) {
    url += `?filter=${encodeURIComponent(filter)}`;
  }
  return gapiRequest<{ operations?: Operation<T>[]; nextPageToken?: string }>(url, "GET", config.projectId);
};

export const listDiscoverySessions = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 50,
  suppressErrorLog?: boolean,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || "default_collection"}/engines/${config.appId}/sessions?pageSize=${pageSize}`;
  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }
  return gapiRequest<{ sessions: DiscoverySession[]; nextPageToken?: string }>(
    url,
    "GET",
    config.projectId,
    undefined,
    undefined,
    undefined,
    suppressErrorLog,
  );
};

export const getDiscoveryAnswer = async (name: string, config: Config): Promise<DiscoveryAnswer> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`;
  return gapiRequest<DiscoveryAnswer>(url, "GET", config.projectId);
};

export const createDiscoverySession = async (
  session: DiscoverySession,
  config: Config,
  accessToken?: string,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || "default_collection"}/engines/${config.appId}/sessions`;

  const finalUrl = url;
  const cleanPayload: Record<string, unknown> = {};
  if (session.userPseudoId) {
    cleanPayload.user_pseudo_id = session.userPseudoId;
  }
  if (session.turns) cleanPayload.turns = session.turns;

  if (session.state) cleanPayload.state = session.state;
  if (session.startTime) cleanPayload.startTime = session.startTime;

  if (accessToken) {
    const response = await fetch(finalUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Goog-User-Project": config.projectId,
      },
      body: JSON.stringify(cleanPayload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create session: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
    return response.json() as Promise<DiscoverySession>;
  }

  return gapiRequest<DiscoverySession>(
    finalUrl,
    "POST",
    config.projectId,
    undefined,
    cleanPayload,
  );
};

export const getDiscoverySession = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`;
  return gapiRequest<DiscoverySession>(url, "GET", config.projectId);
};
