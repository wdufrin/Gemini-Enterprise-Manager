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

import {
  Config,
  RegistrySkill,
  RegistrySkillRevision,
  ListRegistrySkillsResponse,
  ListRegistrySkillRevisionsResponse,
} from "../../types";
import { gapiRequest } from "./core";

export const AGENT_REGISTRY_BASE_URL = "https://agentregistry.googleapis.com";
export const AGENT_REGISTRY_API_VERSION = "v1alpha";

export const listRegistrySkills = async (config: Config): Promise<RegistrySkill[]> => {
  const { projectId, appLocation = "global" } = config;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/projects/${projectId}/locations/${appLocation}/skills`;
  const response = await gapiRequest<ListRegistrySkillsResponse>(
    url,
    "GET",
    projectId,
  );
  return response.skills || [];
};

export const getRegistrySkill = async (name: string, config: Config): Promise<RegistrySkill> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}`;
  return gapiRequest<RegistrySkill>(url, "GET", projectId);
};

export const createRegistrySkill = async (
  payload: Partial<RegistrySkill>,
  config: Config,
  skillId?: string,
): Promise<RegistrySkill> => {
  const { projectId, appLocation = "global" } = config;
  const queryParam = skillId ? `?skillId=${encodeURIComponent(skillId)}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/projects/${projectId}/locations/${appLocation}/skills${queryParam}`;
  return gapiRequest<RegistrySkill>(url, "POST", projectId, undefined, payload);
};

export const updateRegistrySkill = async (
  name: string,
  payload: Partial<RegistrySkill>,
  updateMask: string[],
  config: Config,
): Promise<RegistrySkill> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const mask = updateMask.length > 0 ? `?updateMask=${updateMask.join(",")}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}${mask}`;
  return gapiRequest<RegistrySkill>(url, "PATCH", projectId, undefined, payload);
};

export const deleteRegistrySkill = async (name: string, config: Config): Promise<Record<string, unknown>> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}`;
  return gapiRequest<Record<string, unknown>>(url, "DELETE", projectId);
};

export const listRegistrySkillRevisions = async (
  skillName: string,
  config: Config,
): Promise<RegistrySkillRevision[]> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = skillName.startsWith("projects/")
    ? skillName
    : `projects/${projectId}/locations/${appLocation}/skills/${skillName}`;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}/revisions`;
  const response = await gapiRequest<ListRegistrySkillRevisionsResponse>(
    url,
    "GET",
    projectId,
  );
  return response.skillRevisions || [];
};

export const createRegistrySkillRevision = async (
  skillName: string,
  payload: Partial<RegistrySkillRevision> | Record<string, unknown>,
  config: Config,
  revisionId?: string,
): Promise<RegistrySkillRevision> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = skillName.startsWith("projects/")
    ? skillName
    : `projects/${projectId}/locations/${appLocation}/skills/${skillName}`;
  const queryParam = revisionId ? `?skillRevisionId=${encodeURIComponent(revisionId)}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}/revisions${queryParam}`;
  return gapiRequest<RegistrySkillRevision>(url, "POST", projectId, undefined, payload);
};
