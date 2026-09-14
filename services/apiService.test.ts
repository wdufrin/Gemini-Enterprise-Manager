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
import {
  streamChat,
  createDiscoverySession,
  listMcpTools,
  fetchConnectorLogs,
  listAssistants,
  pollDiscoveryOperation,
  GapiError,
  createConcurrencyLimiter,
  onAuthExpired,
  notifyAuthExpired,
  resetAuthExpiredCooldown
} from './apiService';
import { getGapiClient, GapiClient } from './gapiService';
import { Config } from '../types';

// Mock gapi
vi.mock('./gapiService', () => ({
  getGapiClient: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();
const mockFetch = vi.mocked(global.fetch);

const testConfig: Config = {
  projectId: 'p',
  appLocation: 'l',
  collectionId: 'c',
  appId: 'a',
  assistantId: 'as',
} as unknown as Config;

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

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream
      } as Response);

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, testConfig, 'token', onChunk);

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

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream
      } as Response);

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, testConfig, 'token', onChunk);

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

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream
      } as Response);

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, testConfig, 'token', onChunk);

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

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream
      } as Response);

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, testConfig, 'token', onChunk);

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

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream
      } as Response);

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, testConfig, 'token', onChunk);

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

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream
      } as Response);

      const onChunk = vi.fn();
      await streamChat(null, 'test', null, testConfig, 'token', onChunk);

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledWith(JSON.parse(jsonWithEscapedQuotes));
    });
  });

  describe('createDiscoverySession', () => {
    it('should use fetch when accessToken is provided', async () => {
      mockFetch.mockClear();
      const mockSession = { name: 'projects/p/locations/l/collections/c/engines/a/sessions/s' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSession
      } as Response);

      const result = await createDiscoverySession(
        { name: '', userPseudoId: 'test@example.com' },
        testConfig,
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

  describe('listMcpTools', () => {
    /**
     * Builds a real `Response`. The production reader inspects `content-type`
     * and consumes the body with `text()` so it can distinguish JSON from SSE
     * framing; an `{ ok, json }` stub does not exercise that path.
     */
    const jsonResponse = (body: unknown): Response =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=UTF-8' },
      });

    it('should query first-party Google MCP endpoints with a preflight-free fetch', async () => {
      // Previously this asserted the call went through gapiRequest. That was
      // the bug: gapi.client rewrites the host to
      // content-bigquery.googleapis.com/mcp?alt=json, which does not serve
      // /mcp. The endpoint is reached directly, with only CORS-safelisted
      // headers so the browser skips the OPTIONS preflight (these endpoints
      // answer OPTIONS with a 404 carrying no CORS headers).
      const mockGapiClient = {
        request: vi.fn(),
        getToken: () => ({ access_token: 'mock-token' }),
      };
      vi.mocked(getGapiClient).mockResolvedValue(mockGapiClient as unknown as GapiClient);

      mockFetch.mockResolvedValue(
        jsonResponse({
          result: {
            tools: [{ name: 'list_dataset_ids', description: 'Lists BigQuery datasets' }],
          },
        }),
      );

      const tools = await listMcpTools('test-project', 'https://bigquery.googleapis.com/mcp');

      expect(mockGapiClient.request).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://bigquery.googleapis.com/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }),
        }),
      );
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('list_dataset_ids');
    });

    it('should query external HTTPS endpoints without leaking Google Bearer tokens', async () => {
      const mockToken = 'mock-access-token';
      const mockGapiClient = {
        getToken: () => ({ access_token: mockToken })
      };
      vi.mocked(getGapiClient).mockResolvedValue(mockGapiClient as unknown as GapiClient);

      const mockResponse = {
        result: {
          tools: [
            { name: 'custom_tool', description: 'A custom tool description' }
          ]
        }
      };

      mockFetch.mockResolvedValue(jsonResponse(mockResponse));

      const tools = await listMcpTools('test-project', 'https://my-custom-mcp.com/tools');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://my-custom-mcp.com/tools',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 0,
            method: "tools/list"
          })
        })
      );
      expect(tools).toEqual(mockResponse.result.tools);
    });

    it('should query trusted Google Cloud Run HTTPS endpoints with auth headers', async () => {
      const mockToken = 'mock-access-token';
      const mockGapiClient = {
        getToken: () => ({ access_token: mockToken })
      };
      vi.mocked(getGapiClient).mockResolvedValue(mockGapiClient as unknown as GapiClient);

      const mockResponse = {
        result: {
          tools: [
            { name: 'cloud_run_tool', description: 'Cloud run tool' }
          ]
        }
      };

      mockFetch.mockResolvedValue(jsonResponse(mockResponse));

      const tools = await listMcpTools('test-project', 'https://my-service-uc.a.run.app/tools');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://my-service-uc.a.run.app/tools',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockToken}`,
            'X-Goog-User-Project': 'test-project'
          }),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 0,
            method: "tools/list"
          })
        })
      );
      expect(tools).toEqual(mockResponse.result.tools);
    });
  });

  describe('fetchConnectorLogs', () => {
    const config = { projectId: 'test-project', appLocation: 'global' } as unknown as Config;
    const connectorName = 'projects/test-project/locations/global/collections/oracle-mcp-3_1775658369011/dataConnector';

    it('should query vertex_ai_search_connector logs with severity>=ERROR when no instanceUri is provided', async () => {
      const mockToken = 'mock-access-token';
      const mockGapiClient = {
        getToken: () => ({ access_token: mockToken }),
        request: vi.fn().mockResolvedValue({ result: { entries: [] } })
      };
      vi.mocked(getGapiClient).mockResolvedValue(mockGapiClient as unknown as GapiClient);

      await fetchConnectorLogs(config, connectorName, 2);

      expect(mockGapiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'https://logging.googleapis.com/v2/entries:list',
          method: 'POST'
        })
      );

      const callArg = mockGapiClient.request.mock.calls[0][0];
      const filter = callArg.body.filter;
      expect(filter).toContain('severity>=ERROR');
      expect(filter).not.toContain('cloud_run_revision');
    });

    it('should include cloud_run_revision logs with severity>=WARNING and status>=400 when instanceUri is provided', async () => {
      const mockToken = 'mock-access-token';
      const mockGapiClient = {
        getToken: () => ({ access_token: mockToken }),
        request: vi.fn().mockResolvedValue({ result: { entries: [] } })
      };
      vi.mocked(getGapiClient).mockResolvedValue(mockGapiClient as unknown as GapiClient);

      const instanceUri = 'https://oracle-mcp-server-123456789012.us-central1.run.app/mcp';
      await fetchConnectorLogs(config, connectorName, 2, instanceUri);

      expect(mockGapiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'https://logging.googleapis.com/v2/entries:list',
          method: 'POST'
        })
      );

      const callArg = mockGapiClient.request.mock.calls[0][0];
      const filter = callArg.body.filter;
      
      expect(filter).toContain('resource.type="vertex_ai_search_connector"');
      expect(filter).toContain('resource.type="cloud_run_revision"');
      expect(filter).toContain('resource.labels.service_name="oracle-mcp-server"');
      expect(filter).toContain('severity>=WARNING OR httpRequest.status>=400');
    });

    it('should include cloud_run_revision logs for new Cloud Run URL format (with hash and region)', async () => {
      const mockToken = 'mock-access-token';
      const mockGapiClient = {
        getToken: () => ({ access_token: mockToken }),
        request: vi.fn().mockResolvedValue({ result: { entries: [] } })
      };
      vi.mocked(getGapiClient).mockResolvedValue(mockGapiClient as unknown as GapiClient);

      const instanceUri = 'https://multi-mcp-vpaohjgvxq-uc.a.run.app/';
      await fetchConnectorLogs(config, connectorName, 2, instanceUri);

      expect(mockGapiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'https://logging.googleapis.com/v2/entries:list',
          method: 'POST'
        })
      );

      const callArg = mockGapiClient.request.mock.calls[0][0];
      const filter = callArg.body.filter;
      
      expect(filter).toContain('resource.type="vertex_ai_search_connector"');
      expect(filter).toContain('resource.type="cloud_run_revision"');
      expect(filter).toContain('resource.labels.service_name="multi-mcp"');
      expect(filter).toContain('severity>=WARNING OR httpRequest.status>=400');
    });
  });

  describe('listAssistants', () => {
    it('should query the correct discovery engine endpoint for assistants', async () => {
      const mockGapiClient = {
        getToken: () => ({ access_token: 'mock-token' }),
        request: vi.fn().mockResolvedValue({
          result: {
            assistants: [{ name: 'projects/test-proj/locations/global/collections/default_collection/engines/eng-1/assistants/custom_assistant' }]
          }
        })
      };
      vi.mocked(getGapiClient).mockResolvedValue(mockGapiClient as unknown as GapiClient);

      const config = {
        projectId: 'test-proj',
        appLocation: 'global',
        collectionId: 'default_collection',
        appId: 'eng-1'
      } as unknown as Config;

      const res = await listAssistants(config);
      expect(mockGapiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('/projects/test-proj/locations/global/collections/default_collection/engines/eng-1/assistants'),
          method: 'GET'
        })
      );
      expect(res.assistants).toHaveLength(1);
    });
  });

  describe('pollDiscoveryOperation', () => {
    it('should return immediately if operation is already done', async () => {
      const op = { name: 'projects/p/locations/global/operations/op-1', done: true, response: {} };
      const res = await pollDiscoveryOperation(op, { projectId: 'p', appLocation: 'global' } as unknown as Config);
      expect(res).toBe(op);
    });

    it('should throw if operation failed with an error', async () => {
      const op = { name: 'projects/p/locations/global/operations/op-1', done: true, error: { code: 3, message: 'Resource invalid' } };
      await expect(
        pollDiscoveryOperation(op, { projectId: 'p', appLocation: 'global' } as unknown as Config)
      ).rejects.toThrow('Resource invalid');
    });
  });

  describe('GapiError', () => {
    it('should construct structured error properties properly', () => {
      const error = new GapiError(
        'Resource quota exceeded',
        429,
        'RESOURCE_EXHAUSTED',
        [{ reason: 'RATE_LIMIT_EXCEEDED' }],
        { raw: true }
      );

      expect(error.name).toBe('GapiError');
      expect(error.message).toBe('Resource quota exceeded');
      expect(error.status).toBe(429);
      expect(error.code).toBe('RESOURCE_EXHAUSTED');
      expect(error.details).toEqual([{ reason: 'RATE_LIMIT_EXCEEDED' }]);
      expect(error.raw).toEqual({ raw: true });
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('createConcurrencyLimiter', () => {
    it('should limit concurrent executions and queue excess operations', async () => {
      const limiter = createConcurrencyLimiter(2);
      let activeCount = 0;
      let maxActiveCount = 0;

      const runTask = (ms: number) =>
        limiter(async () => {
          activeCount++;
          if (activeCount > maxActiveCount) {
            maxActiveCount = activeCount;
          }
          await new Promise((resolve) => setTimeout(resolve, ms));
          activeCount--;
          return 'ok';
        });

      const promises = [runTask(20), runTask(20), runTask(20), runTask(20)];
      const results = await Promise.all(promises);

      expect(results).toEqual(['ok', 'ok', 'ok', 'ok']);
      expect(maxActiveCount).toBe(2);
      expect(activeCount).toBe(0);
    });
  });

  describe('onAuthExpired', () => {
    it('should register subscriber and return an unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = onAuthExpired(listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should notify subscriber when notifyAuthExpired is called', () => {
      resetAuthExpiredCooldown();
      const listener = vi.fn();
      const unsubscribe = onAuthExpired(listener);

      notifyAuthExpired();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('should debounce rapid sequential calls to notifyAuthExpired', () => {
      resetAuthExpiredCooldown();
      const listener = vi.fn();
      const unsubscribe = onAuthExpired(listener);

      notifyAuthExpired();
      notifyAuthExpired();
      notifyAuthExpired();

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
    });
  });
});
