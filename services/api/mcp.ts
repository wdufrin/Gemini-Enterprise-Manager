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
import { checkServiceEnabled } from "./project";

/**
 * Reads a JSON-RPC response body from an MCP endpoint, tolerating both of the
 * framings the MCP "streamable HTTP" transport permits for a POST response.
 *
 * Google's first-party MCP endpoints currently answer with
 * `content-type: application/json; charset=UTF-8` and a plain JSON-RPC object
 * (verified 2026-09-13 against bigquery, logging, monitoring, spanner,
 * firestore, compute, container, sqladmin, bigtableadmin and
 * cloudresourcemanager). The transport nevertheless allows a server to answer
 * the identical request with `text/event-stream`, delivering the payload as
 * one or more `data:` lines. Handling both means a future transport switch
 * surfaces as a normal JSON-RPC error rather than an opaque
 * `Unexpected token 'e'` parse failure with no indication of the cause.
 */
const readMcpBody = async (res: Response): Promise<Record<string, unknown>> => {
  const text = await res.text();
  const contentType = res.headers?.get?.("content-type") ?? "";
  const isEventStream =
    contentType.includes("text/event-stream") ||
    /^\s*(?:event|data):/m.test(text);

  if (!isEventStream) {
    return JSON.parse(text) as Record<string, unknown>;
  }

  // SSE framing: take the last non-sentinel `data:` payload, which carries the
  // response to our single `tools/list` request.
  const dataPayloads = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");

  const last = dataPayloads[dataPayloads.length - 1];
  if (!last) {
    throw new Error(
      "MCP endpoint returned an event stream with no JSON-RPC payload.",
    );
  }
  return JSON.parse(last) as Record<string, unknown>;
};

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
    if (isGoogleApiEndpoint(mcpEndpointUrl)) {
      // First-party Google MCP endpoint (e.g. https://bigquery.googleapis.com/mcp).
      //
      // This deliberately does NOT use gapiRequest, and deliberately sends a
      // "simple" CORS request. Both choices are load-bearing:
      //
      //   1. gapi.client rewrites the URL to
      //      `content-<service>.googleapis.com/mcp?alt=json`. That host does
      //      not serve /mcp and returns a 404 HTML error page.
      //
      //   2. These endpoints DO return `access-control-allow-origin` on the
      //      actual POST, but they return 404 with NO CORS headers for the
      //      OPTIONS preflight. So the request must not trigger a preflight.
      //      `Authorization`, `X-Goog-User-Project`, and
      //      `Content-Type: application/json` each force one.
      //      `text/plain;charset=UTF-8` is CORS-safelisted, so none is sent.
      //
      // Sending no credentials is correct here as well as necessary:
      // `tools/list` is a public schema/discovery call that returns the same
      // tool definitions for every caller. Tool *invocation* is not performed
      // by this function. If Google ever requires auth for tools/list, this
      // will surface as a 401 rather than failing silently.
      const res = await fetch(mcpEndpointUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(
          `MCP endpoint ${mcpEndpointUrl} returned HTTP ${res.status}: ` +
            `${await res.text()}`,
        );
      }
      response = await readMcpBody(res);
    } else {
      // SECURITY (CWE-522/CWE-319): everything that is not a recognised Google
      // API endpoint is treated as untrusted and must never reach gapiRequest,
      // which would attach the GCP OAuth bearer token unconditionally.
      //
      // This check is deliberately a *reject* rather than a fall-through. The
      // previous form gated on `startsWith("https://")`, so `http://evil/mcp`
      // and the protocol-relative `//evil/mcp` both bypassed it and had the
      // token attached in cleartext.
      if (!mcpEndpointUrl.startsWith("https://")) {
        throw new Error(
          `MCP endpoint must use https:// -- refusing to send credentials ` +
            `to "${mcpEndpointUrl}".`,
        );
      }

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
      response = await readMcpBody(res);
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
