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

export const extractTextFromTailwindDoc = (doc: any): string => {
  if (!doc) return "";
  if (typeof doc === "string") return doc;
  let text = "";
  if (typeof doc.text === "string" && doc.text.trim()) {
    text += doc.text;
  } else if (typeof doc.content === "string" && doc.content.trim()) {
    text += doc.content;
  }
  if (Array.isArray(doc.chunks)) {
    for (const chunk of doc.chunks) {
      if (typeof chunk === "string") text += chunk + "\n";
      else if (chunk && typeof chunk === "object") {
        const chunkText = chunk.text || chunk.content || chunk.rawText || chunk.markdown || "";
        if (typeof chunkText === "string" && chunkText) text += chunkText + "\n";
        else if (chunk.body || chunk.paragraph) text += extractTextFromTailwindDoc(chunk) + "\n";
      }
    }
  }
  const blockList =
    doc.body?.content ||
    doc.sections ||
    doc.blocks ||
    (Array.isArray(doc.content) ? doc.content : undefined);
  if (Array.isArray(blockList)) {
    for (const block of blockList) {
      if (typeof block === "string") text += block + "\n";
      else if (block?.paragraph?.elements) {
        for (const el of block.paragraph.elements) {
          if (el.textRun?.content) text += el.textRun.content;
        }
      } else if (typeof block?.codeBlock?.content === "string") {
        text += block.codeBlock.content + "\n";
      } else if (typeof block?.code_block?.content === "string") {
        text += block.code_block.content + "\n";
      } else if (block?.table?.tableRows || block?.table?.table_rows) {
        const rows = block.table.tableRows || block.table.table_rows || [];
        for (const row of rows) {
          const cells = row?.tableCells || row?.table_cells || [];
          const cellTexts = cells
            .map((c: any) => extractTextFromTailwindDoc({ content: c?.content }))
            .filter(Boolean);
          if (cellTexts.length > 0) text += cellTexts.join(" | ") + "\n";
        }
      } else if (typeof block?.text === "string") {
        text += block.text + "\n";
      } else if (typeof block?.content === "string") {
        text += block.content + "\n";
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
