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

import { Config, DialogflowAgent } from "../../types";
import { gapiRequest } from "./core";

export const listDialogflowAgents = async (config: Config): Promise<{ agents?: DialogflowAgent[] }> => {
  const location = config.reasoningEngineLocation || "us-central1";
  const url = `https://${location}-dialogflow.googleapis.com/v3/projects/${config.projectId}/locations/${location}/agents`;
  return gapiRequest<{ agents?: DialogflowAgent[] }>(url, "GET", config.projectId);
};

export const deleteDialogflowAgent = async (name: string, config: Config): Promise<Record<string, unknown>> => {
  const location = name.split("/")[3];
  const url = `https://${location}-dialogflow.googleapis.com/v3/${name}`;
  return gapiRequest<Record<string, unknown>>(url, "DELETE", config.projectId);
};

export const detectDialogflowIntent = async (
  agentName: string,
  query: string,
  sessionId: string,
  config: Config,
  accessToken: string,
) => {
  const location = agentName.split("/")[3];
  const sessionPath = `${agentName}/sessions/${sessionId}`;
  const url = `https://${location}-dialogflow.googleapis.com/v3/${sessionPath}:detectIntent`;

  const body = {
    queryInput: {
      text: { text: query },
      languageCode: "en",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": config.projectId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Dialogflow DetectIntent Error: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};
