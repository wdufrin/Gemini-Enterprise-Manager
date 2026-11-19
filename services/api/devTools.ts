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

import { Config, DevToolsConfig } from '../../types';
import { gapiRequest, getDiscoveryEngineUrl, DISCOVERY_API_VERSION } from './core';

/**
 * Retrieves the singleton AI Developer Tools (`DevToolsConfig`) resource for a project & location.
 * Endpoint: `GET /v1alpha/projects/{project}/locations/{location}/devToolsConfig`
 * (`google/cloud/discoveryengine/v1main/dev_tools_config_service.proto`)
 */
export const getDevToolsConfig = async (
  config: Pick<Config, 'projectId' | 'appLocation'>,
  suppressErrorLog = false,
): Promise<DevToolsConfig> => {
  const projectId = (config.projectId || '').trim();
  if (!projectId) {
    throw new Error('Project ID is required to fetch DevToolsConfig.');
  }
  const location = (config.appLocation || 'global').trim().toLowerCase();
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${location}/devToolsConfig`;
  return gapiRequest<DevToolsConfig>(
    url,
    'GET',
    projectId,
    undefined,
    undefined,
    undefined,
    suppressErrorLog,
  );
};

/**
 * Updates the singleton AI Developer Tools (`DevToolsConfig`) resource for a project & location.
 * Endpoint: `PATCH /v1alpha/projects/{project}/locations/{location}/devToolsConfig?updateMask=...`
 * (`google/cloud/discoveryengine/v1main/dev_tools_config_service.proto`)
 */
export const updateDevToolsConfig = async (
  payload: Partial<DevToolsConfig>,
  updateMask: string[],
  config: Pick<Config, 'projectId' | 'appLocation'>,
): Promise<DevToolsConfig> => {
  const projectId = (config.projectId || '').trim();
  if (!projectId) {
    throw new Error('Project ID is required to update DevToolsConfig.');
  }
  if (!Array.isArray(updateMask) || updateMask.length === 0) {
    throw new Error('updateMask must contain at least one field when updating DevToolsConfig.');
  }
  const location = (config.appLocation || 'global').trim().toLowerCase();
  const baseUrl = getDiscoveryEngineUrl(location);
  const resourceName = `projects/${projectId}/locations/${location}/devToolsConfig`;
  const maskParam = encodeURIComponent(updateMask.join(','));
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourceName}?updateMask=${maskParam}`;
  return gapiRequest<DevToolsConfig>(url, 'PATCH', projectId, undefined, {
    name: resourceName,
    ...payload,
  });
};
