/// <reference types="vitest/config" />
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

import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

// Ensure docs screenshots are available under public/docs/assets for in-app User Guide
const docsAssetsSrc = path.resolve(import.meta.dirname, 'docs/assets');
const docsAssetsDest = path.resolve(import.meta.dirname, 'public/docs/assets');
if (fs.existsSync(docsAssetsSrc)) {
  fs.mkdirSync(docsAssetsDest, { recursive: true });
  fs.cpSync(docsAssetsSrc, docsAssetsDest, { recursive: true });
}

/**
 * Validates that a target MCP URL is a public HTTPS endpoint (blocking SSRF
 * targets such as loopback, link-local, metadata, and RFC1918 private IPs).
 */
function isSafeExternalHttpsUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:')
  ) {
    return false;
  }
  return true;
}

/**
 * Same-origin server proxy middleware (`/api/mcp-proxy`) so browser-initiated
 * BYOMCP tool discovery (`tools/list`) and live citation probing (`tools/call`)
 * never fail with browser CORS preflight errors when talking to Cloud Run or
 * third-party MCP servers that do not emit `Access-Control-Allow-Origin`.
 * Also handles MCP Streamable HTTP session initialization when the upstream
 * server requires an `Mcp-Session-Id`.
 */
function mcpCorsProxyPlugin(): Plugin {
  const attachMiddleware = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api/mcp-proxy', (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          const parsed = JSON.parse(rawBody) as {
            targetUrl?: string;
            payload?: Record<string, unknown>;
            headers?: Record<string, string>;
          };

          const targetUrl = typeof parsed.targetUrl === 'string' ? parsed.targetUrl.trim() : '';
          if (!isSafeExternalHttpsUrl(targetUrl)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: `Refusing to proxy to unsafe or non-HTTPS MCP URL: "${targetUrl}"`,
              }),
            );
            return;
          }

          const forwardHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          };

          if (parsed.headers && typeof parsed.headers === 'object') {
            if (typeof parsed.headers['Authorization'] === 'string') {
              forwardHeaders['Authorization'] = parsed.headers['Authorization'];
            }
            if (typeof parsed.headers['X-Goog-User-Project'] === 'string') {
              forwardHeaders['X-Goog-User-Project'] = parsed.headers['X-Goog-User-Project'];
            }
          }

          let upstreamRes = await fetch(targetUrl, {
            method: 'POST',
            headers: forwardHeaders,
            body: JSON.stringify(parsed.payload ?? {}),
          });

          let upstreamText = await upstreamRes.text();

          // Some MCP Streamable HTTP servers (e.g. FastMCP / Python MCP SDK)
          // require an `initialize` handshake and `Mcp-Session-Id` header before
          // `tools/list` or `tools/call`. If the direct stateless POST returns
          // HTTP 400/404/406 mentioning session/initialization, perform the
          // handshake automatically.
          const needsSessionInit =
            !upstreamRes.ok &&
            (upstreamRes.status === 400 || upstreamRes.status === 406) &&
            /session|initialize/i.test(upstreamText);

          if (needsSessionInit) {
            const initRes = await fetch(targetUrl, {
              method: 'POST',
              headers: forwardHeaders,
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 0,
                method: 'initialize',
                params: {
                  protocolVersion: '2025-03-26',
                  capabilities: {},
                  clientInfo: { name: 'gemini-enterprise-manager', version: '1.0.0' },
                },
              }),
            });

            const sessionId =
              initRes.headers.get('mcp-session-id') || initRes.headers.get('Mcp-Session-Id');
            if (sessionId) {
              const sessionHeaders = {
                ...forwardHeaders,
                'Mcp-Session-Id': sessionId,
              };
              await fetch(targetUrl, {
                method: 'POST',
                headers: sessionHeaders,
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'notifications/initialized',
                }),
              }).catch(() => undefined);

              upstreamRes = await fetch(targetUrl, {
                method: 'POST',
                headers: sessionHeaders,
                body: JSON.stringify(parsed.payload ?? {}),
              });
              upstreamText = await upstreamRes.text();
            }
          }

          res.statusCode = upstreamRes.status;
          res.setHeader(
            'Content-Type',
            upstreamRes.headers.get('content-type') || 'application/json; charset=UTF-8',
          );
          res.end(upstreamText);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `MCP proxy upstream error: ${message}` }));
        }
      });
    });
  };

  return {
    name: 'mcp-cors-proxy',
    configureServer(server) {
      attachMiddleware(server);
    },
    configurePreviewServer(server) {
      attachMiddleware(server);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), mcpCorsProxyPlugin()],
  server: {
    watch: {
      ignored: [
        '**/.venv/**',
        '**/venv/**',
        '**/.git/**',
        '**/dist/**',
        '**/scratch/**',
        '**/examples/**'
      ]
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // `scratch/` and `examples/` are gitignored. Without this, a throwaway
    // *.test.ts dropped in there joins the suite locally but does not exist in
    // CI -- so the two disagree about what "all tests pass" means.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.venv/**',
      '**/scratch/**',
      '**/examples/**'
    ],
  },
  build: {
    outDir: 'dist',
    target: 'esnext'
  }
})