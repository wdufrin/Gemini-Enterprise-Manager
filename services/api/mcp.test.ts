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
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { tools: [] } }),
    }));
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

  it("still routes genuine Google API endpoints through gapiRequest", async () => {
    const googleUrl =
      "https://discoveryengine.googleapis.com/v1alpha/projects/p/locations/global/mcp";

    await listMcpTools("my-project", googleUrl);

    expect(gapiRequestMock).toHaveBeenCalledTimes(1);
    expect(gapiRequestMock.mock.calls[0][0]).toBe(googleUrl);
  });
});
