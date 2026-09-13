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

import { Config } from "../../types";
import { gapiRequest } from "./core";

export interface ModelArmorTemplate {
  name?: string;
  metadata?: Record<string, unknown>;
  templateMetadata?: {
    ignorePartialInvocationFailures?: boolean;
    enforcementType?: string;
    [key: string]: unknown;
  };
  filterConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export const fetchModelArmorTemplates = async (
  config: Omit<Config, "accessToken">,
): Promise<{ templates?: ModelArmorTemplate[] }> => {
  const { projectId } = config;
  const url = `https://modelarmor.googleapis.com/v1/projects/${projectId}/locations/-/templates`;
  return gapiRequest<{ templates?: ModelArmorTemplate[] }>(url, "GET", projectId);
};

export const createModelArmorTemplate = async (
  projectId: string,
  location: string,
  templateId: string,
  payload: ModelArmorTemplate,
): Promise<ModelArmorTemplate> => {
  const host =
    !location || location === "global"
      ? "modelarmor.googleapis.com"
      : `modelarmor.${location}.rep.googleapis.com`;
  const url = `https://${host}/v1/projects/${projectId}/locations/${location}/templates?templateId=${templateId}`;
  return gapiRequest<ModelArmorTemplate>(url, "POST", projectId, undefined, payload);
};
