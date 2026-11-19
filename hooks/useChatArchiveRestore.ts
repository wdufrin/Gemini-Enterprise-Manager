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

import { useState } from 'react';
import { Config, DiscoverySession } from '../types';
import { RestoreStatus } from '../components/backup/RestoreStatusBar';

/**
 * Manages restore status state for the Chat History Archive Viewer.
 *
 * Neither Vertex AI Agent Engines nor Gemini Enterprise Discovery Engine Apps
 * support faithful chat transcript import (Agent Engine exposes no session import
 * endpoint, and Discovery Engine `sessions.create` drops model responses).
 * `handleRestore` reports this limitation explicitly rather than running dead
 * or lossy mutation loops.
 */
export function useChatArchiveRestore(config: Config) {
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>({
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    logs: [],
    isRestoring: false,
    isOpen: false,
    isMinimized: false,
  });

  const handleRestore = async (filteredSessions: DiscoverySession[], _targetUserId?: string) => {
    if (filteredSessions.length === 0) return;

    const timestamp = new Date().toLocaleTimeString();
    const unsupportedMessage =
      config.reasoningEngineId && !config.appId
        ? 'Error: Restoring Chat History to an Agent Engine is unsupported by the Vertex AI Reasoning Engine API.'
        : 'Error: Restoring Chat History to Gemini Enterprise Apps is unsupported because the Discovery Engine API drops model responses during session creation. Use the Archive Viewer to inspect transcripts.';

    setRestoreStatus({
      total: filteredSessions.length,
      processed: filteredSessions.length,
      success: 0,
      failed: filteredSessions.length,
      logs: [`[${timestamp}] ${unsupportedMessage}`],
      isRestoring: false,
      isOpen: true,
      isMinimized: false,
      currentSession: undefined,
    });
  };

  return {
    restoreStatus,
    setRestoreStatus,
    handleRestore,
  };
}
