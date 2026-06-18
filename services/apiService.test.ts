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


import { describe, it, expect, vi } from 'vitest';
import { streamChat, createDiscoverySession } from './apiService';

// Mock gapi
vi.mock('./gapiService', () => ({
  getGapiClient: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

describe('apiService', () => {
  describe('streamChat', () => {
    it('should parse line-delimited JSON chunks correctly', async () => {
      const mockChunks = [
        '{"answer": {"replies": [{"groundedContent": {"content": {"text": "Hello"}}}]}}\n',
        '{"answer": {"replies": [{"groundedContent": {"content": {"text": " World"}}}]}}\n'
      ];

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          mockChunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
          controller.close();
        }
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        body: stream
      });

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, { projectId: 'p', appLocation: 'l', collectionId: 'c', appId: 'a', assistantId: 'as' } as any, 'token', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, JSON.parse(mockChunks[0]));
      expect(onChunk).toHaveBeenNthCalledWith(2, JSON.parse(mockChunks[1]));
    });

    it('should handle partial chunks (split across network packets)', async () => {
      const complexJson = JSON.stringify({ answer: { replies: [{ groundedContent: { content: { text: "Complete" } } }] } }) + '\n';
      // Split the JSON string into two parts
      const part1 = complexJson.substring(0, 10);
      const part2 = complexJson.substring(10);

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(part1));
          // minimal delay to simulate network
          setTimeout(() => {
            controller.enqueue(encoder.encode(part2));
            controller.close();
          }, 10);
        }
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        body: stream
      });

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, { projectId: 'p', appLocation: 'l', collectionId: 'c', appId: 'a', assistantId: 'as' } as any, 'token', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledWith(JSON.parse(complexJson));
    });

    it('should handle multiple JSONs in a single chunk', async () => {
      const chunk1 = '{"text": "A"}\n{"text": "B"}\n';

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(chunk1));
          controller.close();
        }
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        body: stream
      });

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, { projectId: 'p', appLocation: 'l', collectionId: 'c', appId: 'a', assistantId: 'as' } as any, 'token', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenCalledWith({ text: "A" });
      expect(onChunk).toHaveBeenCalledWith({ text: "B" });
    });

    it('should handle pretty-printed JSON split across chunks', async () => {
      const prettyJson = JSON.stringify({ answer: { replies: [{ groundedContent: { content: { text: "Complete" } } }] } }, null, 2);
      // Split every 5 chars to simulate heavily fragmented stream
      const chunks = prettyJson.match(/.{1,5}/g) || [];

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          chunks.forEach(c => controller.enqueue(encoder.encode(c)));
          controller.close();
        }
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        body: stream
      });

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, { projectId: 'p', appLocation: 'l', collectionId: 'c', appId: 'a', assistantId: 'as' } as any, 'token', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledWith(JSON.parse(prettyJson));
    });

    it('should ignore braces inside strings', async () => {
      const jsonWithBraces = JSON.stringify({ text: "This has { braces } inside" });

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(jsonWithBraces));
          controller.close();
        }
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        body: stream
      });

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, { projectId: 'p', appLocation: 'l', collectionId: 'c', appId: 'a', assistantId: 'as' } as any, 'token', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledWith(JSON.parse(jsonWithBraces));
    });

    it('should handle escaped quotes inside strings', async () => {
      const jsonWithEscapedQuotes = JSON.stringify({ text: "This has \"quoted\" text" });

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(jsonWithEscapedQuotes));
          controller.close();
        }
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        body: stream
      });

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, { projectId: 'p', appLocation: 'l', collectionId: 'c', appId: 'a', assistantId: 'as' } as any, 'token', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledWith(JSON.parse(jsonWithEscapedQuotes));
    });
  });

  describe('createDiscoverySession', () => {
    it('should use fetch when accessToken is provided', async () => {
      (global.fetch as any).mockClear();
      const mockSession = { name: 'projects/p/locations/l/collections/c/engines/a/sessions/s' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockSession
      });

      const result = await createDiscoverySession(
        { userPseudoId: 'test@example.com' },
        { projectId: 'p', appLocation: 'l', collectionId: 'c', appId: 'a' } as any,
        'custom-token'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://l-discoveryengine.googleapis.com/v1alpha/projects/p/locations/l/collections/c/engines/a/sessions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer custom-token',
            'X-Goog-User-Project': 'p'
          })
        })
      );
      expect(result).toEqual(mockSession);
    });
  });
});
