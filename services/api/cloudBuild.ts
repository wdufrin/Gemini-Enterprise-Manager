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

import { getGapiClient } from "../gapiService";
import { gapiRequest } from "./core";
import { LogEntry } from "../../types";

export interface CloudBuildOperation {
  id?: string;
  name?: string;
  metadata?: {
    build?: {
      id?: string;
      status?: string;
      logUrl?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  status?: string;
  logsBucket?: string;
  logUrl?: string;
  [key: string]: unknown;
}

export const createCloudBuild = async (projectId: string, buildConfig: Record<string, unknown>): Promise<CloudBuildOperation> => {
  console.log(
    "Submitting Cloud Build with payload:",
    JSON.stringify(buildConfig),
  );
  return gapiRequest<CloudBuildOperation>(
    `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds`,
    "POST",
    projectId,
    undefined,
    buildConfig,
    {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  );
};

export const listCloudBuilds = async (projectId: string, filter?: string): Promise<{ builds?: CloudBuildOperation[] }> => {
  let url = `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds`;
  if (filter) {
    url += `?filter=${encodeURIComponent(filter)}`;
  }
  return gapiRequest<{ builds?: CloudBuildOperation[] }>(url, "GET", projectId);
};

export const getCloudBuild = async (projectId: string, buildId: string): Promise<CloudBuildOperation> => {
  return gapiRequest<CloudBuildOperation>(
    `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds/${buildId}`,
    "GET",
    projectId,
  );
};

export const fetchBuildLogs = async (
  projectId: string,
  buildId: string,
): Promise<string[]> => {
  try {
    const build = await getCloudBuild(projectId, buildId);

    // Strategy 1: Attempt direct log access via Cloud Logging (works if Cloud Logging is enabled)
    const filter = `resource.type="build" AND resource.labels.build_id="${buildId}"`;
    const res = await gapiRequest<{ entries?: LogEntry[] }>(
      `https://logging.googleapis.com/v2/entries:list`,
      "POST",
      projectId,
      undefined,
      {
        resourceNames: [`projects/${projectId}`],
        filter: filter,
        orderBy: "timestamp asc",
        pageSize: 1000,
      },
    );

    let logs = (res.entries || []).map(
      (e: LogEntry) =>
        e.textPayload || JSON.stringify(e.jsonPayload || e.protoPayload),
    );

    if (logs.length > 0) {
      return logs;
    }

    // Strategy 2: If Cloud Logging returns nothing, fallback to the Legacy GCS bucket
    if (build.logsBucket) {
      const bucketName = build.logsBucket.replace("gs://", "");
      const objectName = `log-${buildId}.txt`;

      // Fetch media alt directly without JSON parsing wrapper
      const client = await getGapiClient();
      const token = client.getToken()?.access_token;
      const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media`;

      const gcsRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (gcsRes.ok) {
        const text = await gcsRes.text();
        logs = text.split(/\r?\n/);

        // Remove trailing empty line if it exists
        if (logs.length > 0 && logs[logs.length - 1] === "") {
          logs.pop();
        }

        // Return fallback message if completely empty file
        return logs.length > 0
          ? logs
          : ["Fetching logs from GCS... (Build is starting)"];
      } else if (gcsRes.status === 404) {
        return ["Fetching logs from GCS... (Build is starting)"];
      } else {
        return [`Failed to fetch from GCS: HTTP ${gcsRes.status}`];
      }
    }

    return ["Waiting for logs to stream..."];
  } catch (e) {
    console.warn("Failed to fetch build logs", e);
    return [`Error fetching logs: ${e}`];
  }
};
