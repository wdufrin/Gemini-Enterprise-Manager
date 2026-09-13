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

import { Config, CloudRunService } from "../../types";
import { gapiRequest } from "./core";

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
