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

import { beforeEach, describe, expect, it, vi } from "vitest";

const gapiRequestMock = vi.fn();
// NOTE: this fixture deliberately avoids anything shaped like a real Google
// OAuth access token. Realistic-looking values trip the pre-commit secret
// scanner and block the commit. The value is a sentinel only -- no assertion
// depends on its shape, just on whether it is transmitted.
const getTokenMock = vi.fn(() => ({ access_token: "FAKE-OAUTH-TOKEN-FOR-TESTS" }));

vi.mock("./core", () => ({
  gapiRequest: (...args: unknown[]) => gapiRequestMock(...args),
}));

vi.mock("../gapiService", () => ({
  getGapiClient: async () => ({ getToken: getTokenMock }),
}));

vi.mock("./project", () => ({
  checkServiceEnabled: vi.fn(async () => true),
}));

import { listMcpTools } from "./mcp";

/**
 * Builds a genuine `Response`, not a `{ ok, json }` stand-in.
 *
 * The production reader inspects `content-type` and consumes the body via
 * `text()` so it can distinguish JSON from SSE framing. A hand-rolled stub
 * exposing only `json()` would make the parser untestable and would silently
 * pass even if the reader were broken.
 */
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });


/**
 * Regression suite for the credential-egress boundary on BYO-MCP endpoints.
 *
 * The endpoint URL is free text in the connector config. Before this guard,
 * the branch condition was:
 *
 *     if (url.startsWith("https://") && !isGoogleApiEndpoint(url)) { safe }
 *     else { gapiRequest(url, ...) }   // <- attaches the OAuth bearer token
 *
 * so any URL that was not https:// -- including plain http:// and the
 * protocol-relative //host form -- fell through to gapiRequest and had the
 * caller's `cloud-platform` token attached. These tests pin the inverted
 * form and FAIL against the pre-fix implementation.
 */
describe("listMcpTools credential egress", () => {
  beforeEach(() => {
    gapiRequestMock.mockReset();
    gapiRequestMock.mockResolvedValue({ result: { tools: [] } });
    getTokenMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  const untrustedUrls = [
    "http://attacker.example.com/mcp",
    "//attacker.example.com/mcp",
    "ftp://attacker.example.com/mcp",
    "HTTP://attacker.example.com/mcp",
  ];

  it.each(untrustedUrls)(
    "rejects %s instead of handing it to gapiRequest",
    async (url) => {
      await expect(listMcpTools("my-project", url)).rejects.toThrow(
        /must use https/i,
      );

      // The critical assertion: the token-attaching path was never reached.
      expect(gapiRequestMock).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it("never sends an Authorization header to a non-Google https host", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { tools: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await listMcpTools("my-project", "https://attacker.example.com/mcp");

    expect(gapiRequestMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers["Authorization"]).toBeUndefined();
    expect(init.headers["X-Goog-User-Project"]).toBeUndefined();
  });
});

/**
 * Regression suite for the CORS failure that made every first-party MCP
 * endpoint unreachable from the Agent Builder tab.
 *
 * Two independent defects compounded, and both are pinned here:
 *
 *   1. The Google branch called `gapiRequest`. `gapi.client.request` rewrites
 *      `https://<svc>.googleapis.com/mcp` to
 *      `https://content-<svc>.googleapis.com/mcp?alt=json`. That host does not
 *      serve /mcp and answers 404 with an HTML error page.
 *
 *   2. Even against the correct host, `Authorization`, `X-Goog-User-Project`
 *      and `Content-Type: application/json` are each non-safelisted, so the
 *      browser issues an OPTIONS preflight first. These endpoints return 404
 *      with no `Access-Control-Allow-Origin` for OPTIONS, so the preflight
 *      fails and the POST is never sent.
 *
 * Verified against the live endpoints on 2026-09-13: the POST alone returns
 * HTTP 200 with `access-control-allow-origin` echoing the caller's Origin.
 */
describe("listMcpTools against first-party Google MCP endpoints", () => {
  const GOOGLE_URL = "https://bigquery.googleapis.com/mcp";

  beforeEach(() => {
    gapiRequestMock.mockReset();
    gapiRequestMock.mockResolvedValue({ result: { tools: [] } });
    getTokenMock.mockClear();
  });

  const callWith = async (response: Response, url = GOOGLE_URL) => {
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);
    const tools = await listMcpTools("my-project", url);
    return { fetchMock, tools };
  };

  it("uses fetch rather than gapiRequest", async () => {
    const { fetchMock } = await callWith(jsonResponse({ result: { tools: [] } }));

    expect(gapiRequestMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the URL byte-for-byte, with no content- prefix and no ?alt=json", async () => {
    const { fetchMock } = await callWith(jsonResponse({ result: { tools: [] } }));

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(GOOGLE_URL);
    expect(url).not.toContain("content-");
    expect(url).not.toContain("alt=json");
  });

  it("sends only CORS-safelisted headers so no preflight is triggered", async () => {
    const { fetchMock } = await callWith(jsonResponse({ result: { tools: [] } }));

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];

    // `text/plain` is one of the three safelisted content types. Anything else
    // -- including application/json -- forces the OPTIONS preflight that 404s.
    expect(init.headers["Content-Type"]).toBe("text/plain;charset=UTF-8");

    const safelisted = new Set([
      "accept",
      "accept-language",
      "content-language",
      "content-type",
    ]);
    for (const header of Object.keys(init.headers)) {
      expect(safelisted.has(header.toLowerCase())).toBe(true);
    }
  });

  it("does not attach credentials to the public tools/list call", async () => {
    const { fetchMock } = await callWith(jsonResponse({ result: { tools: [] } }));

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers["Authorization"]).toBeUndefined();
    expect(init.headers["X-Goog-User-Project"]).toBeUndefined();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("posts a well-formed tools/list JSON-RPC body", async () => {
    const { fetchMock } = await callWith(jsonResponse({ result: { tools: [] } }));

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      jsonrpc: "2.0",
      id: 0,
      method: "tools/list",
    });
  });

  it("parses the plain-JSON response shape the endpoints actually return", async () => {
    const { tools } = await callWith(
      jsonResponse({
        id: 0,
        jsonrpc: "2.0",
        result: { tools: [{ name: "list_dataset_ids" }, { name: "execute_sql" }] },
      }),
    );

    expect(tools.map((t) => t.name)).toEqual(["list_dataset_ids", "execute_sql"]);
  });

  it("parses an SSE-framed response without a JSON syntax error", async () => {
    const body = [
      "event: message",
      `data: ${JSON.stringify({ result: { tools: [{ name: "from_sse" }] } })}`,
      "",
    ].join("\n");

    const { tools } = await callWith(
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    expect(tools.map((t) => t.name)).toEqual(["from_sse"]);
  });

  it("throws with the status and body when the endpoint rejects the call", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("upstream said no", { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listMcpTools("my-project", GOOGLE_URL)).rejects.toThrow(
      /403.*upstream said no/s,
    );
  });

  it("propagates a network/CORS failure instead of reporting zero tools", async () => {
    // A CORS rejection surfaces in the browser as a rejected fetch with no
    // response. It must not be flattened into an empty tool list, which is how
    // the UI came to display a green "Ready (0 tools)" while nothing worked.
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listMcpTools("my-project", GOOGLE_URL)).rejects.toThrow(
      /Failed to fetch/,
    );
  });
});

