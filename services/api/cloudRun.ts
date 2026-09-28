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

import { Config, CloudRunService, IamPolicy } from "../../types";
import { gapiRequest, GapiError } from "./core";

export const listCloudRunServices = async (config: Config, region: string): Promise<{ services?: CloudRunService[] }> => {
  const url = `https://${region}-run.googleapis.com/v2/projects/${config.projectId}/locations/${region}/services`;
  return gapiRequest<{ services?: CloudRunService[] }>(url, "GET", config.projectId);
};

export const getCloudRunService = async (name: string, config: Config) => {
  const region = name.split("/")[3];
  const url = `https://${region}-run.googleapis.com/v2/${name}`;
  return gapiRequest<CloudRunService>(url, "GET", config.projectId);
};

export const deleteCloudRunService = async (name: string, config: Config): Promise<Record<string, unknown>> => {
  const region = name.split("/")[3];
  const url = `https://${region}-run.googleapis.com/v2/${name}`;
  return gapiRequest<Record<string, unknown>>(url, "DELETE", config.projectId);
};

export const ensureCloudRunInvokerRole = async (
  serviceName: string,
  serviceAccountEmail: string,
  quotaProjectId: string,
): Promise<void> => {
  const region = serviceName.split("/")[3] || "us-central1";
  const baseUrl = `https://${region}-run.googleapis.com/v2/${serviceName}`;
  const member = `serviceAccount:${serviceAccountEmail}`;
  const role = "roles/run.invoker";

  const policy = await gapiRequest<IamPolicy>(`${baseUrl}:getIamPolicy`, "GET", quotaProjectId);
  const bindings = policy.bindings ? [...policy.bindings] : [];
  const existingBinding = bindings.find((b) => b.role === role);

  if (existingBinding && existingBinding.members?.includes(member)) {
    return;
  }

  const updatedBindings = existingBinding
    ? bindings.map((b) =>
        b.role === role ? { ...b, members: [...(b.members || []), member] } : b,
      )
    : [...bindings, { role, members: [member] }];

  await gapiRequest<IamPolicy>(
    `${baseUrl}:setIamPolicy`,
    "POST",
    quotaProjectId,
    undefined,
    {
      policy: {
        ...policy,
        bindings: updatedBindings,
      },
    },
  );
};

export interface TriggerCloudRunServiceJobParams {
  projectId: string;
  quotaProjectId: string;
  region: string;
  jobId: string;
  serviceUrl?: string;
  serviceAccountEmail?: string;
}

export const triggerCloudRunServiceJob = async ({
  projectId,
  quotaProjectId,
  region,
  jobId,
  serviceUrl,
  serviceAccountEmail,
}: TriggerCloudRunServiceJobParams): Promise<Record<string, unknown>> => {
  const jobName = `projects/${projectId}/locations/${region}/jobs/${jobId}`;
  const runUrl = `https://cloudscheduler.googleapis.com/v1/${jobName}:run`;

  try {
    return await gapiRequest<Record<string, unknown>>(runUrl, "POST", quotaProjectId, undefined, {});
  } catch (err: unknown) {
    const isNotFound = err instanceof GapiError && err.status === 404;
    if (isNotFound && serviceUrl && serviceAccountEmail) {
      const createUrl = `https://cloudscheduler.googleapis.com/v1/projects/${projectId}/locations/${region}/jobs`;
      const schedule = jobId.includes("cleanup") ? "0 */6 * * *" : "0 4 * * *";
      await gapiRequest<Record<string, unknown>>(
        createUrl,
        "POST",
        quotaProjectId,
        undefined,
        {
          name: jobName,
          schedule,
          timeZone: "Etc/UTC",
          httpTarget: {
            uri: serviceUrl,
            httpMethod: "POST",
            oidcToken: {
              serviceAccountEmail,
            },
          },
        },
      );
      return await gapiRequest<Record<string, unknown>>(runUrl, "POST", quotaProjectId, undefined, {});
    }
    throw err;
  }
};

