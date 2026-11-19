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

function isUnsafeIpv4Octets(a: number, b: number, c: number, d: number): boolean {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    !Number.isInteger(c) ||
    !Number.isInteger(d) ||
    a < 0 ||
    a > 255 ||
    b < 0 ||
    b > 255 ||
    c < 0 ||
    c > 255 ||
    d < 0 ||
    d > 255
  ) {
    return true;
  }
  // 0.0.0.0/8 (unspecified / "this" network)
  if (a === 0) return true;
  // 10.0.0.0/8 (RFC1918 private)
  if (a === 10) return true;
  // 100.64.0.0/10 (RFC6598 carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local & cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (RFC1918 private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (RFC1918 private)
  if (a === 192 && b === 168) return true;
  // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved / broadcast)
  if (a >= 224) return true;
  return false;
}

/**
 * Validates that a target MCP URL is a public HTTPS endpoint (blocking SSRF
 * targets such as loopback, link-local, metadata, RFC1918 private IPs, and
 * IPv4-mapped / IPv4-compatible IPv6 representations in both dotted and
 * WHATWG-normalized hex forms).
 */
export function isSafeExternalHttpsUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;

  // Also inspect the raw bracketed IPv6 literal before URL canonicalization in case
  // callers pass dotted IPv4-mapped forms or IPv6 zone identifiers (%25eth0).
  const trimmed = rawUrl.trim();
  if (/^https:\/\/\[[^\]]*%/.test(trimmed)) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
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
    host === 'metadata'
  ) {
    return false;
  }

  // Standard dotted-quad IPv4
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, sA, sB, sC, sD] = ipv4Match;
    return !isUnsafeIpv4Octets(Number(sA), Number(sB), Number(sC), Number(sD));
  }

  // IPv6 literals (contain ':')
  if (host.includes(':')) {
    const normalizedV6 = host.replace(/^(?:0+:)+/, '::');
    if (
      host === '::' ||
      host === '::1' ||
      normalizedV6 === '::' ||
      normalizedV6 === '::1'
    ) {
      return false;
    }

    // Unique local (fc00::/7 -> fc.. / fd..), link-local (fe80::/10 -> fe8..feb), multicast (ff00::/8)
    if (
      /^f[cd][0-9a-f]{0,2}:/.test(host) ||
      /^fe[89ab][0-9a-f]:/.test(host) ||
      /^ff[0-9a-f]{0,2}:/.test(host)
    ) {
      return false;
    }

    // Dotted IPv4-mapped / IPv4-compatible IPv6 (e.g. ::ffff:127.0.0.1, ::ffff:169.254.169.254, ::127.0.0.1)
    const dottedV4Mapped = host.match(
      /^(?:::ffff:|0:0:0:0:0:ffff:|::)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
    );
    if (dottedV4Mapped) {
      const [, sA, sB, sC, sD] = dottedV4Mapped;
      return !isUnsafeIpv4Octets(Number(sA), Number(sB), Number(sC), Number(sD));
    }

    // Node WHATWG URL canonicalized hex IPv4-mapped / IPv4-compatible / NAT64 IPv6
    // e.g. [::ffff:127.0.0.1] -> "::ffff:7f00:1", [::ffff:169.254.169.254] -> "::ffff:a9fe:a9fe",
    // [::ffff:10.0.0.1] -> "::ffff:a00:1", [64:ff9b::127.0.0.1] -> "64:ff9b::7f00:1"
    const hexV4Mapped = host.match(
      /^(?:::ffff:|(?:0:){5}ffff:|::|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
    );
    if (hexV4Mapped) {
      const hi = parseInt(hexV4Mapped[1], 16);
      const lo = parseInt(hexV4Mapped[2], 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return !isUnsafeIpv4Octets(a, b, c, d);
    }

    // Single-hextet ::0 / ::ffff:0 edge cases
    if (/^(?:::ffff:|(?:0:){5}ffff:)0+$/.test(host)) {
      return false;
    }
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