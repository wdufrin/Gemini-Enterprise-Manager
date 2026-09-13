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
import {
  isGoogleApiEndpoint,
  mayReceiveGoogleCredentials,
} from "../urlSecurity";
import { gapiRequest } from "./core";
import { checkServiceEnabled } from "./project";

export const listMcpTools = async (
  projectId: string,
  mcpEndpointUrl: string,
): Promise<Record<string, unknown>[]> => {
  try {
    const payload = {
      jsonrpc: "2.0",
      id: 0,
      method: "tools/list",
    };

    let response: Record<string, unknown>;
    if (
      mcpEndpointUrl.startsWith("https://") &&
      !isGoogleApiEndpoint(mcpEndpointUrl)
    ) {
      // Custom endpoint, use fetch to avoid gapi CORS/handling issues.
      //
      // SECURITY: do not leak the GCP OAuth bearer token to external endpoints.
      const isTrustedGoogleHost = mayReceiveGoogleCredentials(mcpEndpointUrl);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (isTrustedGoogleHost) {
        const client = await getGapiClient();
        const token = client.getToken()?.access_token;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        if (projectId) {
          headers["X-Goog-User-Project"] = projectId;
        }
      }

      const res = await fetch(mcpEndpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${await res.text()}`);
      }
      response = await res.json();
    } else {
      // Google API or relative path, use gapiRequest
      response = await gapiRequest<Record<string, unknown>>(
        mcpEndpointUrl,
        "POST",
        projectId,
        undefined, // params
        payload,
        { "X-Goog-User-Project": projectId },
      );
    }

    // Detailed logging of the JSON-RPC response body
    const resultObj = response?.result as Record<string, unknown> | undefined;
    const resultTools = resultObj?.tools;
    console.log(`[listMcpTools] Raw response from ${mcpEndpointUrl}:`, {
      fullResponse: response,
      hasResult: !!response?.result,
      hasError: !!response?.error,
      toolsCount: Array.isArray(resultTools) ? resultTools.length : 0,
    });

    const tools = (response?.result as Record<string, unknown> | undefined)?.tools || response?.tools;
    if (Array.isArray(tools)) {
      return tools as Record<string, unknown>[];
    }

    console.warn(
      `[listMcpTools] ${mcpEndpointUrl} returned no tools. JSON-RPC Error:`,
      response?.error,
    );
    return [];
  } catch (e: unknown) {
    console.error(
      `[listMcpTools] FAILED to fetch tools from ${mcpEndpointUrl}. Project: ${projectId}. Error Details:`,
      e,
    );
    throw e;
  }
};

export const checkMcpCompliance = async (
  projectId: string,
  serviceName: string,
): Promise<boolean> => {
  try {
    return await checkServiceEnabled(projectId, serviceName);
  } catch (e) {
    console.warn(`Failed to check MCP compliance for ${serviceName}:`, e);
    return false;
  }
};
