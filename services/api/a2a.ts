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

import { Agent, Config } from "../../types";
import {
  mayReceiveGoogleCredentials,
  buildValidatedUrl,
} from "../urlSecurity";
import { createAgent } from "./discoveryEngine";

export const registerA2aAgent = async (
  config: Config,
  agentId: string,
  payload: Partial<Agent> | Record<string, unknown>,
) => {
  return createAgent(payload as Agent, config, agentId);
};

export const fetchA2aAgentCard = async (
  serviceUrl: string,
  accessToken: string,
) => {
  const url = buildValidatedUrl(serviceUrl, "/.well-known/agent.json");
  if (!url) {
    throw new Error(
      `A2A Discovery Error: invalid or non-HTTPS URL: ${serviceUrl}`,
    );
  }
  // SECURITY: only attach the Google bearer token to Google-hosted origins.
  // Other hosts are still reachable -- self-hosted A2A agents are a legitimate
  // case -- they simply do not receive the user's cloud-platform credentials.
  const sendCredentials = mayReceiveGoogleCredentials(url);
  const headers: Record<string, string> = {};
  if (sendCredentials) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    if (!sendCredentials && (response.status === 401 || response.status === 403)) {
      throw new Error(
        `A2A Discovery Error: ${response.status}. Google credentials are not sent to ` +
          `non-Google hosts, so this endpoint must accept unauthenticated discovery ` +
          `or be hosted on *.run.app / *.cloudfunctions.net / *.googleapis.com.`,
      );
    }
    throw new Error(
      `A2A Discovery Error: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};

export const invokeA2aAgent = async (
  serviceUrl: string,
  prompt: string,
  accessToken: string,
) => {
  const url = buildValidatedUrl(serviceUrl, "/invoke");
  if (!url) {
    throw new Error(
      `A2A Invocation Error: invalid or non-HTTPS URL: ${serviceUrl}`,
    );
  }
  // SECURITY: see fetchA2aAgentCard. Same trust boundary, same reasoning.
  const sendCredentials = mayReceiveGoogleCredentials(url);

  // SECURITY: the access token is deliberately NOT included in `params.state`.
  // It previously appeared there as both `AUTH_ID` and `gcp_access_token`,
  // putting a live cloud-platform credential into a JSON-RPC payload that the
  // receiving agent may log, persist, or echo back.
  const body = {
    jsonrpc: "2.0",
    method: "chat",
    params: {
      message: { role: "user", parts: [{ text: prompt }] },
      state: {},
    },
    id: "1",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sendCredentials) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (!sendCredentials && (response.status === 401 || response.status === 403)) {
      throw new Error(
        `A2A Invocation Error: ${response.status}. Google credentials are not sent to ` +
          `non-Google hosts. Deploy the agent to *.run.app (or another Google-hosted ` +
          `origin) if it needs to authenticate with your Google identity.`,
      );
    }
    throw new Error(
      `A2A Invocation Error: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};
