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
  Operation,
  ReasoningEngine,
  ReasoningEngineSession,
} from "../../types";
import { getGapiClient } from "../gapiService";
import { parseJsonStream } from "../streamParser";
import { gapiRequest, getDiscoveryEngineUrl } from "./core";

export const getVertexAiOperation = async <T = ReasoningEngine>(name: string, config: Config): Promise<Operation<T>> => {
  const parts = name.split("/");
  const locIndex = parts.indexOf("locations");
  const location =
    locIndex !== -1 && parts.length > locIndex + 1
      ? parts[locIndex + 1]
      : config.reasoningEngineLocation || "us-central1";

  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
  return gapiRequest<Operation<T>>(url, "GET", config.projectId);
};

export const listReasoningEngines = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 200,
) => {
  const location = config.reasoningEngineLocation || "us-central1";
  let url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/reasoningEngines?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  return gapiRequest<{
    reasoningEngines: ReasoningEngine[];
    nextPageToken?: string;
  }>(url, "GET", config.projectId);
};

export const listAllReasoningEngines = async (
  config: Config,
): Promise<ReasoningEngine[]> => {
  const allEngines: ReasoningEngine[] = [];
  let pageToken: string | undefined;
  do {
    const res = await listReasoningEngines(config, pageToken, 100);
    if (res.reasoningEngines) {
      allEngines.push(...res.reasoningEngines);
    }
    pageToken = res.nextPageToken;
  } while (pageToken);
  return allEngines;
};

export const getReasoningEngine = async (name: string, config: Config) => {
  const location = name.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
  return gapiRequest<ReasoningEngine>(url, "GET", config.projectId);
};

export const createReasoningEngine = async (config: Config, payload: Partial<ReasoningEngine> | Record<string, unknown>): Promise<Operation<ReasoningEngine>> => {
  const location = config.reasoningEngineLocation || "us-central1";
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/reasoningEngines`;
  return gapiRequest<Operation<ReasoningEngine>>(url, "POST", config.projectId, undefined, payload);
};

export const deleteReasoningEngine = async (name: string, config: Config) => {
  const location = name.split("/")[3];
  // IMPORTANT: Added force=true to automatically handle child resources (sessions) as requested by the API error message.
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}?force=true`;
  return gapiRequest(url, "DELETE", config.projectId);
};

export const getReasoningEngineSession = async (
  name: string,
  config: Config,
) => {
  const location = name.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
  return gapiRequest<ReasoningEngineSession>(url, "GET", config.projectId);
};

export const listReasoningEngineSessions = async (
  engineName: string,
  config: Config,
  pageToken?: string,
  pageSize: number = 100,
) => {
  const location = engineName.split("/")[3];
  let url = `https://${location}-aiplatform.googleapis.com/v1beta1/${engineName}/sessions?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  return gapiRequest<{ sessions: { name: string }[]; nextPageToken?: string }>(
    url,
    "GET",
    config.projectId,
  );
};

export const listAllReasoningEngineSessions = async (
  engineName: string,
  config: Config,
): Promise<{ name: string }[]> => {
  const allSessions: { name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await listReasoningEngineSessions(engineName, config, pageToken, 100);
    if (res.sessions) {
      allSessions.push(...res.sessions);
    }
    pageToken = res.nextPageToken;
  } while (pageToken);
  return allSessions;
};

export const deleteReasoningEngineSession = async (
  sessionName: string,
  config: Config,
) => {
  const location = sessionName.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${sessionName}`;
  return gapiRequest(url, "DELETE", config.projectId);
};

export const fetchReasoningEngineAgentCard = async (
  name: string,
  config: Config,
): Promise<Record<string, unknown>> => {
  const location = name.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}/a2a/v1/card`;
  return gapiRequest<Record<string, unknown>>(url, "GET", config.projectId);
};

export interface StreamChatChunk {
  sessionInfo?: { session?: string };
  answer?: {
    state?: string;
    diagnosticInfo?: Record<string, unknown>;
    assistSkippedReasons?: string[];
    replies?: Array<{
      content?: { text?: string; thought?: boolean; [key: string]: unknown };
      groundedContent?: {
        content?: { text?: string; thought?: boolean; [key: string]: unknown };
        textGroundingMetadata?: { references?: unknown[]; [key: string]: unknown };
        [key: string]: unknown;
      };
      [key: string]: unknown;
    }>;
  };
  [key: string]: unknown;
}

export interface ReasoningEngineQueryChunk {
  content?: {
    parts?: Array<{ text?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const streamChat = async (
  agentName: string | null,
  query: string,
  sessionId: string | null,
  config: Config,
  accessToken: string,
  onChunk: (chunk: StreamChatChunk) => void,
  toolsSpec?: unknown,
) => {
  const { projectId, appLocation, collectionId, appId, assistantId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}:streamAssist`;

  const body: { query: { text: string }; toolsSpec?: unknown; session?: string } = {
    query: { text: query },
    toolsSpec: toolsSpec,
  };
  if (sessionId) {
    body.session = sessionId;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": projectId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Chat API Failed", {
      status: response.status,
      statusText: response.statusText,
      url,
      body,
      errorText,
    });
    throw new Error(
      `Chat API Error: ${response.status} ${response.statusText} - ${errorText.substring(0, 500)}...`,
    );
  }

  if (!response.body) return;
  await parseJsonStream(response.body, onChunk as (chunk: unknown) => void);
};

export const streamQueryReasoningEngine = async (
  engineName: string,
  query: string,
  userId: string,
  config: Config,
  accessToken: string,
  onChunk: (chunk: ReasoningEngineQueryChunk) => void,
) => {
  const { projectId } = config;
  const location = engineName.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${engineName}:streamQuery`;

  const body = {
    input: {
      message: query,
      user_id: userId,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": projectId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Reasoning Engine Stream API Error: ${response.status} - ${errorText}`,
    );
  }

  if (!response.body) return;
  await parseJsonStream(response.body, onChunk);
};

export const generateVertexContent = async (
  config: Config,
  prompt: string,
  model: string = "gemini-2.5-flash",
  maxOutputTokens: number = 2048,
) => {
  const location = "us-central1";
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/publishers/google/models/${model}:streamGenerateContent`;

  const client = await getGapiClient();
  const token = client.getToken()?.access_token || "";

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Vertex AI Error: ${response.status} - ${await response.text()}`,
    );
  }

  if (!response.body) return "";

  interface GenerateContentResponse {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  }

  let fullText = "";
  await parseJsonStream<GenerateContentResponse>(response.body, (json) => {
    const part = json.candidates?.[0]?.content?.parts?.[0];
    if (part?.text) fullText += part.text;
  });
  return fullText;
};
