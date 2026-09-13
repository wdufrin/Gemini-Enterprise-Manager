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

import { Assistant, Config } from '../../../types';

export interface AssistantDetailsFormProps {
  assistant: Assistant;
  config: Config;
  onUpdateSuccess: (updatedAssistant: Assistant) => void;
}

export interface AssistantFormData {
  displayName: string;
  styleAndFormattingInstructions: string;
  additionalSystemInstruction: string;
  webGroundingType: string;
  customerPolicy: string;
  enableEndUserAgentCreation: boolean;
  disableLocationContext: boolean;
  defaultWebGroundingToggleOff: boolean;
  vertexAiSearchToolConfig: string;
  chatHistoryRetentionDays: string;
}

export const ALL_REASONING_ENGINE_LOCATIONS = [
  'us-central1', 'us-east1', 'us-east4', 'us-west1',
  'europe-west1', 'europe-west2', 'europe-west4',
  'asia-east1', 'asia-southeast1'
];
