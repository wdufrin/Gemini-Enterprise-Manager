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
import { gapiRequest, getDiscoveryEngineUrl } from "./core";

export interface NotebookSource {
  name?: string;
  sourceId?: string;
  userContent?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Notebook {
  name: string;
  displayName?: string;
  sources?: NotebookSource[];
  createTime?: string;
  updateTime?: string;
  [key: string]: unknown;
}

export const listNotebooks = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 100,
): Promise<{ notebooks?: Notebook[]; nextPageToken?: string }> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  let url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks:listRecentlyViewed?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  return gapiRequest<{ notebooks?: Notebook[]; nextPageToken?: string }>(url, "GET", projectId);
};

export const getNotebook = async (
  config: Config,
  notebookId: string,
): Promise<Notebook> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks/${notebookId}`;
  return gapiRequest<Notebook>(url, "GET", projectId);
};

export const getNotebookSource = async (
  config: Config,
  notebookId: string,
  sourceId: string,
): Promise<NotebookSource> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks/${notebookId}/sources/${sourceId}`;
  return gapiRequest<NotebookSource>(url, "GET", projectId);
};

export const createNotebook = async (
  config: Config,
  payload: Partial<Notebook> | Record<string, unknown>,
): Promise<Notebook> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks`;
  return gapiRequest<Notebook>(url, "POST", projectId, undefined, payload);
};

export const batchCreateNotebookSources = async (
  config: Config,
  notebookId: string,
  requests: Record<string, unknown>[],
): Promise<{ userContents?: unknown[] }> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks/${notebookId}/sources:batchCreate`;
  const payload = { userContents: requests };
  return gapiRequest<{ userContents?: unknown[] }>(url, "POST", projectId, undefined, payload);
};
