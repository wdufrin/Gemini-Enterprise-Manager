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

import { Agent, Config } from '../../../types';

export interface AgentFormProps {
  config: Config;
  onSuccess: () => void;
  onCancel: () => void;
  agentToEdit?: Agent | null;
}

export type AgentType = 'reasoning_engine' | 'a2a';

export interface AgentFormData {
  displayName: string;
  description: string;
  agentId: string;
  iconUri: string;
  createdBy: string;
  additionalInfo: string;
  reasoningEngineLocation: string;
  reasoningEngineId: string;
  authIds: string[];
  starterPrompts: string[];
  a2aUrl: string;
  a2aOrg: string;
}

export const getCompatibleReasoningEngineLocation = (appLocation: string): string => {
  switch (appLocation) {
    case 'us':
    case 'global':
      return 'us-central1';
    case 'eu':
      return 'europe-west1';
    default:
      return 'us-central1';
  }
};
