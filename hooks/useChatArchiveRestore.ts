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
import * as api from '../services/apiService';
import { RestoreStatus } from '../components/backup/RestoreStatusBar';

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

  const handleRestore = async (filteredSessions: DiscoverySession[], targetUserId: string) => {
    if (filteredSessions.length === 0) return;

    setRestoreStatus({
      total: filteredSessions.length,
      processed: 0,
      success: 0,
      failed: 0,
      logs: [],
      isRestoring: true,
      isOpen: true,
      isMinimized: false,
    });

    const log = (msg: string) => {
      setRestoreStatus((prev) => ({
        ...prev,
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${msg}`],
      }));
    };

    if (config.reasoningEngineId && !config.appId) {
      log('Error: Restoring Chat History to an Agent Engine is currently unsupported by the API.');
      setRestoreStatus((prev) => ({
        ...prev,
        isRestoring: false,
        failed: filteredSessions.length,
        processed: filteredSessions.length,
      }));
      return;
    }

    log(`Starting deep restore of ${filteredSessions.length} sessions...`);

    for (const session of filteredSessions) {
      setRestoreStatus((prev) => ({ ...prev, currentSession: session.name }));
      try {
        const hydratedSession: any = { ...session };
        hydratedSession.state = 'IN_PROGRESS';
        if (!hydratedSession.startTime) {
          hydratedSession.startTime = new Date().toISOString();
        }

        if (hydratedSession.turns && hydratedSession.turns.length > 0) {
          const hydratedTurns = await Promise.all(
            hydratedSession.turns.map(async (turn: any) => {
              let answerRef = '';
              let assistantKeyToRemove = '';
              if (typeof turn.answer === 'string' && turn.answer.startsWith('projects/')) {
                answerRef = turn.answer;
              } else if (
                turn.assistAnswer &&
                typeof turn.assistAnswer === 'string' &&
                turn.assistAnswer.startsWith('projects/')
              ) {
                answerRef = turn.assistAnswer;
                assistantKeyToRemove = 'assistAnswer';
              } else {
                const assistantKey = Object.keys(turn).find((k) => k.startsWith('assist'));
                if (
                  assistantKey &&
                  typeof turn[assistantKey] === 'string' &&
                  turn[assistantKey].startsWith('projects/')
                ) {
                  answerRef = turn[assistantKey];
                  assistantKeyToRemove = assistantKey;
                }
              }

              const newTurn = { ...turn };

              if (answerRef) {
                try {
                  const result = await api.getDiscoveryAnswer(answerRef, config);
                  let text = '';
                  if (typeof result === 'string') text = result;
                  else if (result.answerText) text = result.answerText;
                  else if (result.answer_text) text = result.answer_text;
                  else if (result.steps) {
                    text = result.steps
                      .map((s) => s.description || s.thought || '')
                      .join('\n');
                  } else if (result.reply?.replyText) text = result.reply.replyText;

                  if (text) {
                    newTurn.answer = text;
                  } else {
                    newTurn.answer =
                      '[Archived Answer: Content unavailable. The original engine was likely deleted before the backup could fully hydrate the text.]';
                  }
                } catch (e) {
                  console.warn('Failed to hydrate answer', answerRef, e);
                  newTurn.answer =
                    '[Archived Answer: Content unavailable. The original engine was likely deleted before the backup could fully hydrate the text.]';
                }
              } else if (!newTurn.answer) {
                newTurn.answer = '[No Answer Recorded]';
              }

              delete newTurn.name;
              delete newTurn.queryConfig;
              delete newTurn.turnId;
              delete newTurn.createdAt;
              delete newTurn.assistToken;
              delete newTurn.assistAnswer;

              if (assistantKeyToRemove) delete newTurn[assistantKeyToRemove];
              if (newTurn.query) {
                delete newTurn.query.queryId;
              }

              return newTurn;
            }),
          );
          hydratedSession.turns = hydratedTurns;
        }

        if (targetUserId) {
          hydratedSession.userPseudoId = targetUserId;
        }

        await api.createDiscoverySession(hydratedSession, config);

        log(`Success: ${session.name.split('/').pop()}`);
        setRestoreStatus((prev) => ({ ...prev, success: prev.success + 1 }));
      } catch (err: any) {
        const msg = err.message || 'Unknown error';
        log(`Failed: ${session.name.split('/').pop()} - ${msg}`);
        setRestoreStatus((prev) => ({ ...prev, failed: prev.failed + 1 }));
      } finally {
        setRestoreStatus((prev) => ({ ...prev, processed: prev.processed + 1 }));
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    log(
      'Restore process completed. Note: Gemini Enterprise natively drops Agent Responses during manual session creation.',
    );
    setRestoreStatus((prev) => ({ ...prev, isRestoring: false, currentSession: undefined }));
  };

  return {
    restoreStatus,
    setRestoreStatus,
    handleRestore,
  };
}
