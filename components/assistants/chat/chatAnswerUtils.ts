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

export interface AnswerContentResult {
  type: 'text' | 'reference' | 'json' | 'none';
  content?: any;
}

export const extractTextFromResponse = (result: any): string => {
  let text = '';

  // 1. Check for "replies" array (Agent Engine / Vertex Search standard)
  if (result?.replies && Array.isArray(result.replies)) {
    for (const reply of result.replies) {
      const content = reply.groundedContent?.content;
      // Look for content WITHOUT "thought": true
      if (content && !content.thought && content.text) {
        text = content.text;
        break;
      }
    }
  }

  if (!text && result) {
    if (typeof result === 'string') {
      text = result;
    } else if (result.answerText) {
      text = result.answerText;
    } else if (result.answer_text) {
      text = result.answer_text;
    } else if (result.steps) {
      text = result.steps.map((s: any) => s.description || s.thought || '').join('\n\n');
    } else {
      // Try to find ANY string field
      const possibleKeys = ['text', 'content', 'message', 'reply'];
      for (const k of possibleKeys) {
        if (result[k] && typeof result[k] === 'string') {
          text = result[k];
          break;
        }
      }

      // Deep nested check for replyText
      if (!text && result.reply?.replyText) text = result.reply.replyText;
      if (!text && result.reply?.replytext) text = result.reply.replytext;
    }
  }

  return text;
};

export const getAnswerContent = (turn: any): AnswerContentResult => {
  if (!turn) return { type: 'none' };

  // 1. Check direct answer field (standard structure)
  const ans = turn.answer as any;
  if (ans) {
    if (typeof ans === 'string') return { type: 'text', content: ans };
    const text =
      ans.reply?.replyText ||
      ans.reply?.replytext ||
      ans.text ||
      ans.content ||
      ans.message ||
      ans.agentAnswer;
    if (text) return { type: 'text', content: text };
    return { type: 'json', content: ans };
  }

  // 2. Check for assistant key in the Turn itself
  const turnObj = turn as any;
  const assistantKey = Object.keys(turnObj).find((k) => k.startsWith('assist'));
  if (assistantKey && turnObj[assistantKey]) {
    const val = turnObj[assistantKey];
    if (typeof val === 'string') {
      if (val.startsWith('projects/')) {
        return { type: 'reference', content: val };
      }
      return { type: 'text', content: val };
    }
    const text = val.reply?.replyText || val.reply?.replytext || val.text || val.content || val.message;
    if (text) return { type: 'text', content: text };
    return { type: 'json', content: val };
  }

  return { type: 'none' };
};
