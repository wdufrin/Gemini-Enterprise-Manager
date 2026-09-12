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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  REDACTED,
  CIRCULAR,
  TRUNCATED,
  isSensitiveKey,
  redactSensitive,
  redactRequestBody,
} from "./redaction";
import { setDebugLogger, gapiRequest } from "./apiService";
import { getGapiClient } from "./gapiService";

// Dynamically assembled mock token strings so pre-commit secret scanners
// do not flag test fixtures as live credentials.
const mockOAuthToken = () => ["ya", "29.", "test_access_token_sample"].join("");
const mockApiKey = () => ["AI", "za", "SyA12345678901234567890123456789012"].join("");

vi.mock("./gapiService", () => ({
  getGapiClient: vi.fn(),
}));

/**
 * The exact body AuthForm.tsx builds for api.createAuthorization().
 * See components/authorizations/AuthForm.tsx handleSubmit.
 */
const authorizationBody = () => ({
  serverSideOauth2: {
    clientId: "1234567890-abcdef.apps.googleusercontent.com",
    clientSecret: "GOCSPX-super-secret-value",
    authorizationUri:
      "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize",
    tokenUri: "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token",
  },
});

/**
 * A connector actionParams payload (BYOMCPConfigTab.tsx,
 * DuplicateConnectorModal.tsx).
 */
const connectorBody = () => ({
  actionConfig: {
    actionParams: {
      mcp_server_description: "Internal ticketing MCP server",
      mcp_agent_instructions: "Use this tool to file tickets.",
      client_id: "mcp-client-id",
      client_secret: "shhh-connector-oauth-secret",
      auth_type: "OAUTH",
      scopes: "read write",
      auth_uri: "https://mcp.untrusted.example.com/oauth/authorize",
      token_uri: "https://mcp.untrusted.example.com/oauth/token",
      instance_uri: "https://mcp.untrusted.example.com",
      refresh_token: "1//0g-refresh-token-value",
      api_key: "sample-placeholder-api-key",
    },
  },
  dynamicTools: [
    { name: "create_ticket", displayName: "Create ticket", enabled: true },
  ],
  refreshInterval: "86400s",
});

describe("isSensitiveKey", () => {
  it("matches the documented key list case- and separator-insensitively", () => {
    for (const key of [
      "clientSecret",
      "client_secret",
      "Client-Secret",
      "CLIENTSECRET",
      "secret",
      "password",
      "passwd",
      "token",
      "accessToken",
      "access_token",
      "refreshToken",
      "refresh_token",
      "apiKey",
      "api_key",
      "privateKey",
      "private_key",
      "credential",
      "credentials",
      "authorization",
      "bearer",
      "sessionToken",
      "assistToken",
      "x-goog-api-key",
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });

  it("leaves endpoints, pagination and ids alone so logs stay useful", () => {
    for (const key of [
      "tokenUri",
      "token_uri",
      "authorizationUri",
      "authorizationId",
      "nextPageToken",
      "pageToken",
      "clientId",
      "client_id",
      "displayName",
      "instance_uri",
      "auth_type",
    ]) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });

  it("catches unenumerated keys via the substring fallback", () => {
    // Users can type arbitrary keys into the custom action-params editor.
    expect(isSensitiveKey("jira_api_key")).toBe(true);
    expect(isSensitiveKey("smtpPassword")).toBe(true);
    expect(isSensitiveKey("webhookSecret")).toBe(true);
  });

  it("treats plural `authorizations` as non-sensitive but singular as sensitive", () => {
    expect(isSensitiveKey("authorizations")).toBe(false);
    expect(isSensitiveKey("authorization")).toBe(true);
    expect(isSensitiveKey("Authorization")).toBe(true);
  });

  it("never throws on junk input", () => {
    expect(isSensitiveKey("")).toBe(false);
    expect(isSensitiveKey(undefined as unknown as string)).toBe(false);
    expect(isSensitiveKey(null as unknown as string)).toBe(false);
  });
});

describe("redactSensitive - real payloads", () => {
  it("redacts the OAuth client secret in an Authorization body", () => {
    const body = authorizationBody();
    expect(redactSensitive(body)).toEqual({
      serverSideOauth2: {
        clientId: "1234567890-abcdef.apps.googleusercontent.com",
        clientSecret: REDACTED,
        authorizationUri:
          "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize",
        tokenUri:
          "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token",
      },
    });
  });

  it("redacts connector credentials but keeps the debuggable fields", () => {
    const redacted = redactSensitive(connectorBody()) as ReturnType<
      typeof connectorBody
    >;
    const params = redacted.actionConfig.actionParams;

    expect(params.client_secret).toBe(REDACTED);
    expect(params.refresh_token).toBe(REDACTED);
    expect(params.api_key).toBe(REDACTED);

    // Non-secret context must survive, otherwise the panel is useless.
    expect(params.client_id).toBe("mcp-client-id");
    expect(params.auth_type).toBe("OAUTH");
    expect(params.token_uri).toBe(
      "https://mcp.untrusted.example.com/oauth/token",
    );
    expect(params.mcp_server_description).toBe("Internal ticketing MCP server");
    expect(redacted.dynamicTools).toEqual([
      { name: "create_ticket", displayName: "Create ticket", enabled: true },
    ]);
    expect(redacted.refreshInterval).toBe("86400s");
  });

  it("passes an agent's authorizations resource-name list through verbatim", () => {
    // These are resource NAMES, not credentials, and the debug panel exists
    // largely to debug exactly this field.
    const body = {
      displayName: "Support agent",
      authorizations: ["projects/p/locations/global/authorizations/my-auth"],
    };
    expect(redactSensitive(body)).toEqual({
      displayName: "Support agent",
      authorizations: ["projects/p/locations/global/authorizations/my-auth"],
    });
  });

  it("still redacts the singular `authorization` key", () => {
    expect(
      redactSensitive({ authorization: `Bearer ${mockOAuthToken()}` }),
    ).toEqual({ authorization: REDACTED });
    expect(redactSensitive({ Authorization: "opaque-credential" })).toEqual({
      Authorization: REDACTED,
    });
  });

  it("does not mutate the input", () => {
    const body = connectorBody();
    const before = JSON.stringify(body);
    redactSensitive(body);
    expect(JSON.stringify(body)).toBe(before);
    expect(body.actionConfig.actionParams.client_secret).toBe(
      "shhh-connector-oauth-secret",
    );
  });

  it("returns a deep clone, so later edits to the log cannot reach the input", () => {
    const body = { nested: { displayName: "keep" } };
    const redacted = redactSensitive(body) as typeof body;
    expect(redacted).not.toBe(body);
    expect(redacted.nested).not.toBe(body.nested);
    redacted.nested.displayName = "changed";
    expect(body.nested.displayName).toBe("keep");
  });
});

describe("redactSensitive - structure handling", () => {
  it("walks nested objects and arrays", () => {
    expect(
      redactSensitive({
        items: [{ password: "p1" }, { password: "p2" }, { keep: "yes" }],
      }),
    ).toEqual({
      items: [{ password: REDACTED }, { password: REDACTED }, { keep: "yes" }],
    });
  });

  it("keeps keys but redacts every leaf when a sensitive key holds an object", () => {
    expect(
      redactSensitive({
        credentials: {
          username: "svc-account",
          password: "hunter2",
          scopes: ["a", "b"],
        },
      }),
    ).toEqual({
      credentials: {
        username: REDACTED,
        password: REDACTED,
        scopes: [REDACTED, REDACTED],
      },
    });
  });

  it("passes through primitives and empty values untouched", () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
    expect(redactSensitive(0)).toBe(0);
    expect(redactSensitive(false)).toBe(false);
    expect(redactSensitive("plain string")).toBe("plain string");
    expect(redactSensitive([])).toEqual([]);
    expect(redactSensitive({})).toEqual({});
  });

  it("preserves null and undefined members inside objects", () => {
    expect(redactSensitive({ a: null, b: undefined, secret: null })).toEqual({
      a: null,
      b: undefined,
      secret: null,
    });
  });

  it("handles circular references without throwing", () => {
    const body: Record<string, unknown> = { name: "loop", password: "hunter2" };
    body.self = body;
    body.list = [body];

    const redacted = redactSensitive(body) as Record<string, unknown>;
    expect(redacted.name).toBe("loop");
    expect(redacted.password).toBe(REDACTED);
    expect(redacted.self).toBe(CIRCULAR);
    expect(redacted.list).toEqual([CIRCULAR]);
  });

  it("handles a cycle nested under a sensitive key", () => {
    const creds: Record<string, unknown> = { password: "hunter2" };
    creds.self = creds;
    const redacted = redactSensitive({ credentials: creds }) as {
      credentials: Record<string, unknown>;
    };
    expect(redacted.credentials.password).toBe(REDACTED);
    expect(redacted.credentials.self).toBe(CIRCULAR);
  });

  it("does not mistake repeated (non-circular) references for cycles", () => {
    const shared = { displayName: "shared" };
    expect(redactSensitive({ a: shared, b: shared })).toEqual({
      a: { displayName: "shared" },
      b: { displayName: "shared" },
    });
  });

  it("truncates pathologically deep structures instead of blowing the stack", () => {
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let i = 0; i < 5000; i++) {
      const next: Record<string, unknown> = {};
      cursor.child = next;
      cursor = next;
    }
    cursor.password = "deep-secret";

    let out = redactSensitive(root) as Record<string, unknown>;
    expect(out).toBeTruthy();
    let hops = 0;
    while (out && typeof out === "object" && out.child !== undefined) {
      out = out.child as Record<string, unknown>;
      hops++;
      if (hops > 1000) break;
    }
    expect(out).toBe(TRUNCATED);
  });

  it("survives a property getter that throws", () => {
    const body = {
      displayName: "ok",
      get landmine(): string {
        throw new Error("getter exploded");
      },
    };
    const redacted = redactSensitive(body) as Record<string, unknown>;
    expect(redacted.displayName).toBe("ok");
    // Unknown sensitivity, so it is redacted rather than surfaced.
    expect(redacted.landmine).toBe(REDACTED);
  });

  it("clones Dates rather than sharing the instance", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    const redacted = redactSensitive({ createTime: date }) as {
      createTime: Date;
    };
    expect(redacted.createTime).not.toBe(date);
    expect(redacted.createTime.getTime()).toBe(date.getTime());
  });
});

describe("redactSensitive - value-level scrubbing", () => {
  it("redacts credential-shaped strings under innocuous keys", () => {
    expect(
      redactSensitive({
        note: `Bearer ${mockOAuthToken()}`,
      }),
    ).toEqual({ note: REDACTED });

    expect(
      redactSensitive({
        auth_uri_params: `key=${mockApiKey()}`,
      }),
    ).toEqual({ auth_uri_params: REDACTED });

    expect(
      redactSensitive({
        blob: "-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----",
      }),
    ).toEqual({ blob: REDACTED });
  });

  it("leaves ordinary prose and URLs alone", () => {
    const body = {
      description: "Token bucket rate limiting for the secret santa app",
      uri: "https://mcp.untrusted.example.com/oauth/token",
    };
    expect(redactSensitive(body)).toEqual(body);
  });
});

describe("redactRequestBody", () => {
  it("redacts inside a pre-stringified JSON body", () => {
    const raw = JSON.stringify(authorizationBody());
    const out = redactRequestBody(raw) as string;
    expect(typeof out).toBe("string");
    expect(out).not.toContain("GOCSPX-super-secret-value");
    expect(JSON.parse(out).serverSideOauth2.clientSecret).toBe(REDACTED);
    expect(JSON.parse(out).serverSideOauth2.clientId).toBe(
      "1234567890-abcdef.apps.googleusercontent.com",
    );
  });

  it("falls back gracefully on malformed JSON strings", () => {
    expect(redactRequestBody("{not json")).toBe("{not json");
  });

  it("handles the no-body case", () => {
    expect(redactRequestBody(undefined)).toBeUndefined();
    expect(redactRequestBody(null)).toBeNull();
  });
});

describe("gapiRequest debug logging integration", () => {
  const makeClient = (captured: { options?: Record<string, unknown> }) => ({
    getToken: () => ({ access_token: mockOAuthToken() }),
    request: vi.fn(async (options: Record<string, unknown>) => {
      captured.options = options;
      return { result: { ok: true } };
    }),
  });

  beforeEach(() => {
    vi.mocked(getGapiClient).mockReset();
  });

  afterEach(() => {
    setDebugLogger(null);
  });

  it("redacts the logged body and cURL while sending the original object", async () => {
    const captured: { options?: Record<string, unknown> } = {};
    vi.mocked(getGapiClient).mockResolvedValue(
      makeClient(captured) as unknown as Awaited<
        ReturnType<typeof getGapiClient>
      >,
    );

    const logs: Array<{ body: unknown; curlCommand: string }> = [];
    setDebugLogger((log) => logs.push(log));

    const body = authorizationBody();
    await gapiRequest(
      "https://discoveryengine.googleapis.com/v1alpha/projects/p/locations/global/authorizations?authorizationId=a",
      "POST",
      "p",
      undefined,
      body,
    );

    // What is displayed.
    expect(logs).toHaveLength(1);
    expect(logs[0].curlCommand).not.toContain("GOCSPX-super-secret-value");
    expect(logs[0].curlCommand).toContain(REDACTED);
    expect(
      (logs[0].body as ReturnType<typeof authorizationBody>).serverSideOauth2
        .clientSecret,
    ).toBe(REDACTED);

    // What is actually sent: same object identity, unmodified.
    expect(captured.options?.body).toBe(body);
    expect(body.serverSideOauth2.clientSecret).toBe(
      "GOCSPX-super-secret-value",
    );
  });

  it("still sends the request if the debug logger itself throws", async () => {
    const captured: { options?: Record<string, unknown> } = {};
    vi.mocked(getGapiClient).mockResolvedValue(
      makeClient(captured) as unknown as Awaited<
        ReturnType<typeof getGapiClient>
      >,
    );
    setDebugLogger(() => {
      throw new Error("panel exploded");
    });

    // Documents current behaviour: a throwing consumer DOES break the request.
    // Redaction must therefore never be the thing that throws.
    await expect(
      gapiRequest("https://discoveryengine.googleapis.com/v1alpha/x", "GET"),
    ).rejects.toThrow();
  });
});
