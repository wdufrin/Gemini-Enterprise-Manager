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
import { getCachedProjectEnrollment } from "./project";

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

export const interactNotebookSource = async (
  config: Config,
  notebookId: string,
  sourceId: string,
  userQuery: string,
): Promise<string> => {
  const { projectId, appLocation } = config;
  const enrollment = getCachedProjectEnrollment(projectId);
  if (enrollment && !enrollment.notebookLmApiUser && !enrollment.googleInternal) {
    throw new Error(
      "NotebookService.InteractSources (:interactSources) is restricted to GOOGLE_INTERNAL, NLME_API_USER, or SPARK_PREVIEW projects.",
    );
  }
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks/${notebookId}:interactSources`;
  const payload = {
    inputSources: [{ sourceId: { id: sourceId } }],
    freeFormAction: { userQuery },
  };
  const res = await gapiRequest<{ response?: { response?: string } }>(
    url,
    "POST",
    projectId,
    undefined,
    payload,
  );
  let cleaned = (res?.response?.response || "").trim();
  cleaned = cleaned.replace(/^\*\*Excerpts from\s+["']?.*?["']?\*\*\s*\n+/i, "");
  cleaned = cleaned.replace(/^Excerpts from\s+["']?.*?["']?:?\s*\n+/i, "");
  cleaned = cleaned.replace(/(\S)[ \t]+\[\d+(?:\s*,\s*\d+)*\](?!\()/g, "$1");
  return cleaned.trim();
};

export const extractTextFromTailwindDoc = (doc: unknown): string => {
  if (!doc) return "";
  if (typeof doc === "string") return doc;
  if (typeof doc !== "object") return "";
  const d = doc as Record<string, unknown>;
  let text = "";
  if (typeof d.text === "string" && d.text.trim()) {
    text += d.text;
  } else if (typeof d.content === "string" && d.content.trim()) {
    text += d.content;
  }
  if (Array.isArray(d.chunks)) {
    for (const chunk of d.chunks as unknown[]) {
      if (typeof chunk === "string") text += chunk + "\n";
      else if (chunk && typeof chunk === "object") {
        const c = chunk as Record<string, unknown>;
        const chunkText = c.text || c.content || c.rawText || c.markdown || "";
        if (typeof chunkText === "string" && chunkText) text += chunkText + "\n";
        else if (c.body || c.paragraph) text += extractTextFromTailwindDoc(c) + "\n";
      }
    }
  }
  const bodyObj = d.body as Record<string, unknown> | undefined;
  const blockList =
    bodyObj?.content ||
    d.sections ||
    d.blocks ||
    (Array.isArray(d.content) ? d.content : undefined);
  if (Array.isArray(blockList)) {
    for (const rawBlock of blockList as unknown[]) {
      if (typeof rawBlock === "string") text += rawBlock + "\n";
      else if (rawBlock && typeof rawBlock === "object") {
        const block = rawBlock as Record<string, unknown>;
        const paragraph = block.paragraph as { elements?: Array<{ textRun?: { content?: string } }> } | undefined;
        const codeBlock = (block.codeBlock || block.code_block) as { content?: string } | undefined;
        const table = block.table as {
          tableRows?: Array<{ tableCells?: Array<{ content?: unknown }>; table_cells?: Array<{ content?: unknown }> }>;
          table_rows?: Array<{ tableCells?: Array<{ content?: unknown }>; table_cells?: Array<{ content?: unknown }> }>;
        } | undefined;
        if (paragraph?.elements) {
          for (const el of paragraph.elements) {
            if (el.textRun?.content) text += el.textRun.content;
          }
        } else if (typeof codeBlock?.content === "string") {
          text += codeBlock.content + "\n";
        } else if (table?.tableRows || table?.table_rows) {
          const rows = table.tableRows || table.table_rows || [];
          for (const row of rows) {
            const cells = row?.tableCells || row?.table_cells || [];
            const cellTexts = cells
              .map((c: { content?: unknown }) => extractTextFromTailwindDoc({ content: c?.content }))
              .filter(Boolean);
            if (cellTexts.length > 0) text += cellTexts.join(" | ") + "\n";
          }
        } else if (typeof block.text === "string") {
          text += block.text + "\n";
        } else if (typeof block.content === "string") {
          text += block.content + "\n";
        }
      }
    }
  }
  return text.trim();
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
