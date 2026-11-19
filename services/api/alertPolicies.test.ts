/**
 * Copyright 2026 Google LLC
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
import { renderHook, act } from "@testing-library/react";

const gapiRequestMock = vi.fn();
const getTokenMock = vi.fn(() => ({ access_token: "FAKE-TEST-SENTINEL-TOKEN" }));

vi.mock("./core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./core")>();
  return {
    ...actual,
    gapiRequest: (...args: unknown[]) => gapiRequestMock(...args),
  };
});

vi.mock("../gapiService", () => ({
  getGapiClient: async () => ({ getToken: getTokenMock }),
}));

import {
  listAlertPolicies,
  listNotificationChannels,
  createAlertPolicy,
  deleteAlertPolicy,
  buildConnectorSyncFailureAlertPolicy,
  buildQuotaThresholdAlertPolicy,
  buildGcloudAlertPolicyCommand,
} from "./alertPolicies";
import { listMcpTools } from "./mcp";
import { isSafeExternalHttpsUrl } from "../../vite.config";
import { generateCodeSnippets } from "../../components/datastores/query/QueryCodeGenerator";
import { useDataStoreQuery } from "../../hooks/useDataStoreQuery";
import * as apiService from "../apiService";

describe("Cloud Monitoring Alert Policies API (services/api/alertPolicies.ts)", () => {
  beforeEach(() => {
    gapiRequestMock.mockReset();
    vi.clearAllMocks();
  });

  it("paginates listAlertPolicies and listNotificationChannels across nextPageToken", async () => {
    gapiRequestMock
      .mockResolvedValueOnce({
        alertPolicies: [
          {
            name: "projects/my-proj-123/alertPolicies/pol-1",
            displayName: "Policy 1",
            combiner: "OR",
            conditions: [],
          },
        ],
        nextPageToken: "tok-page-2",
      })
      .mockResolvedValueOnce({
        alertPolicies: [
          {
            name: "projects/my-proj-123/alertPolicies/pol-2",
            displayName: "Policy 2",
            combiner: "OR",
            conditions: [],
          },
        ],
      });

    const policies = await listAlertPolicies("my-proj-123", 'enabled = true');
    expect(policies).toHaveLength(2);
    expect(policies.map((p) => p.name)).toEqual([
      "projects/my-proj-123/alertPolicies/pol-1",
      "projects/my-proj-123/alertPolicies/pol-2",
    ]);
    expect(gapiRequestMock).toHaveBeenCalledTimes(2);
    expect(gapiRequestMock.mock.calls[0][0]).toContain(
      "https://monitoring.googleapis.com/v3/projects/my-proj-123/alertPolicies?",
    );
    expect(gapiRequestMock.mock.calls[1][0]).toContain("pageToken=tok-page-2");

    gapiRequestMock.mockReset();
    gapiRequestMock
      .mockResolvedValueOnce({
        notificationChannels: [
          {
            name: "projects/my-proj-123/notificationChannels/ch-1",
            type: "email",
            displayName: "SRE Pager",
          },
        ],
        nextPageToken: "ch-page-2",
      })
      .mockResolvedValueOnce({
        notificationChannels: [
          {
            name: "projects/my-proj-123/notificationChannels/ch-2",
            type: "slack",
            displayName: "#ops-alerts",
          },
        ],
      });

    const channels = await listNotificationChannels("my-proj-123");
    expect(channels).toHaveLength(2);
    expect(channels[1].type).toBe("slack");
  });

  it("builds valid log-match sync failure & daily quota policies, deploys via POST, and deletes via DELETE", async () => {
    const syncPolicy = buildConnectorSyncFailureAlertPolicy({
      projectId: "prod-proj-99",
      collectionId: "servicenow_prod",
      collectionDisplayName: "ServiceNow Production",
      notificationChannels: [
        "projects/prod-proj-99/notificationChannels/1001",
      ],
      rateLimitSeconds: 600,
    });

    expect(syncPolicy.combiner).toBe("OR");
    expect(syncPolicy.alertStrategy?.notificationRateLimit?.period).toBe("600s");
    expect(syncPolicy.conditions[0].conditionMatchedLog?.filter).toContain(
      'resource.labels.connector_id="servicenow_prod"',
    );

    gapiRequestMock.mockResolvedValueOnce({
      ...syncPolicy,
      name: "projects/prod-proj-99/alertPolicies/987654",
    });

    const created = await createAlertPolicy("prod-proj-99", syncPolicy);
    expect(created.name).toBe("projects/prod-proj-99/alertPolicies/987654");
    expect(gapiRequestMock).toHaveBeenCalledWith(
      "https://monitoring.googleapis.com/v3/projects/prod-proj-99/alertPolicies",
      "POST",
      "prod-proj-99",
      undefined,
      expect.objectContaining({
        displayName:
          "[Gemini Enterprise] DataConnector Sync Failure - servicenow_prod",
        notificationChannels: [
          "projects/prod-proj-99/notificationChannels/1001",
        ],
      }),
    );

    const quotaPolicy = buildQuotaThresholdAlertPolicy({
      projectId: "prod-proj-99",
      dailyRequestThreshold: 75000,
    });
    expect(quotaPolicy.conditions[0].conditionThreshold?.thresholdValue).toBe(
      75000,
    );
    expect(quotaPolicy.conditions[0].conditionThreshold?.filter).toContain(
      'resource.labels.service="discoveryengine.googleapis.com"',
    );

    const cli = buildGcloudAlertPolicyCommand("prod-proj-99", quotaPolicy);
    expect(cli).toContain(
      "gcloud alpha monitoring policies create",
    );
    expect(cli).toContain("--policy-from-file=");

    gapiRequestMock.mockResolvedValueOnce({});
    await deleteAlertPolicy(
      "prod-proj-99",
      "projects/prod-proj-99/alertPolicies/987654",
    );
    expect(gapiRequestMock).toHaveBeenLastCalledWith(
      "https://monitoring.googleapis.com/v3/projects/prod-proj-99/alertPolicies/987654",
      "DELETE",
      "prod-proj-99",
    );
  });

  it("adversarially rejects hostile project IDs, malformed channels, filter injections, and invalid policy schemas", async () => {
    await expect(listAlertPolicies("")).rejects.toThrow(/Invalid Google Cloud Project/i);
    await expect(listAlertPolicies("../etc/passwd")).rejects.toThrow(
      /Invalid Google Cloud Project/i,
    );
    await expect(listNotificationChannels("proj?alt=media")).rejects.toThrow(
      /Invalid Google Cloud Project/i,
    );

    expect(() =>
      buildConnectorSyncFailureAlertPolicy({
        projectId: "valid-proj",
        collectionId: 'bad" OR severity>=DEFAULT --',
      }),
    ).toThrow(/Invalid connector collectionId/i);

    expect(() =>
      buildQuotaThresholdAlertPolicy({
        projectId: "valid-proj",
        dailyRequestThreshold: -5,
      }),
    ).toThrow(/positive finite number/i);

    await expect(
      createAlertPolicy("valid-proj", {
        displayName: "Bad Channel Policy",
        combiner: "OR",
        conditions: [
          {
            displayName: "Log cond",
            conditionMatchedLog: { filter: "severity>=ERROR" },
          },
        ],
        notificationChannels: ["https://attacker.example.com/webhook"],
      }),
    ).rejects.toThrow(/Invalid Cloud Monitoring notification channel/i);

    await expect(
      createAlertPolicy("valid-proj", {
        displayName: "Empty Conditions",
        combiner: "OR",
        conditions: [],
      }),
    ).rejects.toThrow(/at least one condition/i);

    await expect(
      deleteAlertPolicy("valid-proj", "projects/valid-proj/sinks/not-a-policy"),
    ).rejects.toThrow(/Invalid alert policy resource name/i);

    expect(gapiRequestMock).not.toHaveBeenCalled();
  });
});

describe("SSRF IPv4-mapped IPv6 & Nginx 405 Proxy Hardening", () => {
  it("blocks hostile IPv4-mapped IPv6, NAT64, link-local, RFC1918, and metadata SSRF payloads in isSafeExternalHttpsUrl", () => {
    const hostilePayloads = [
      "https://[::ffff:127.0.0.1]/",
      "https://[::ffff:127.0.0.1]:8080/mcp",
      "https://[::ffff:7f00:1]/mcp",
      "https://[0:0:0:0:0:ffff:127.0.0.1]/",
      "https://[::ffff:169.254.169.254]/latest/meta-data/",
      "https://[::ffff:a9fe:a9fe]/computeMetadata/v1/",
      "https://[::ffff:10.0.0.1]/mcp",
      "https://[::ffff:192.168.1.25]/mcp",
      "https://[::ffff:172.16.0.1]/mcp",
      "https://[::ffff:172.31.255.254]/mcp",
      "https://[::ffff:0.0.0.0]/",
      "https://[64:ff9b::169.254.169.254]/",
      "https://[::1]/mcp",
      "https://[::]/mcp",
      "https://[fc00::1]/mcp",
      "https://[fd12:3456:789a::1]/mcp",
      "https://[fe80::1]/mcp",
      "https://[fe80::1%25eth0]/mcp",
      "https://127.0.0.1/mcp",
      "https://169.254.169.254/computeMetadata/v1/",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://localhost:8080/mcp",
      "https://svc.cluster.local/mcp",
      "http://my-mcp-server.a.run.app/mcp",
      "https://admin:secret@my-mcp-server.a.run.app/mcp",
    ];

    for (const payload of hostilePayloads) {
      expect(isSafeExternalHttpsUrl(payload), `Expected SSRF block for ${payload}`).toBe(
        false,
      );
    }

    // Legitimate public HTTPS endpoints (including domains starting with "fc"/"fd") must pass
    expect(
      isSafeExternalHttpsUrl("https://figma-mcp-12345-uc.a.run.app/mcp"),
    ).toBe(true);
    expect(isSafeExternalHttpsUrl("https://fcompany.com/mcp")).toBe(true);
    expect(isSafeExternalHttpsUrl("https://[::ffff:8.8.8.8]/mcp")).toBe(true);
  });

  it("treats HTTP 405 from static Nginx /api/mcp-proxy the same as 404 and rethrows an actionable CORS TypeError", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://")) {
        throw new TypeError("Failed to fetch");
      }
      // Static Nginx try_files returns 405 Not Allowed HTML for POST /api/mcp-proxy
      return new Response("<html><head><title>405 Not Allowed</title></head></html>", {
        status: 405,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listMcpTools("proj-1", "https://no-cors-mcp.example.com/mcp"),
    ).rejects.toThrow(/CORS.*Access-Control-Allow-Origin/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("Custom Collection DataStore Snippets & Search History rawResponse", () => {
  it("preserves custom connector collection paths across Python, Node.js, cURL, and REST snippets instead of hardcoding default_collection", () => {
    const customDsName =
      "projects/987654321/locations/us/collections/servicenow_prod/dataStores/servicenow_prod_incident";

    const defaultSnippets = generateCodeSnippets({
      projectId: "987654321",
      location: "us",
      dataStoreId: "servicenow_prod_incident",
      dataStoreName: customDsName,
      codeQuery: "network outage",
      pageSize: 10,
      authMode: "default",
      wifPoolId: "",
      wifProviderId: "",
      wifSubjectTokenType: "urn:ietf:params:oauth:token-type:id_token",
    });

    for (const lang of ["python", "nodejs", "curl", "rest"] as const) {
      expect(defaultSnippets[lang]).toContain(customDsName);
      expect(defaultSnippets[lang]).not.toContain("collections/default_collection");
    }

    const wifSnippets = generateCodeSnippets({
      projectId: "987654321",
      location: "us",
      dataStoreId: "servicenow_prod_incident",
      dataStoreName: customDsName,
      codeQuery: "network outage",
      pageSize: 10,
      authMode: "wif",
      wifPoolId: "corp-pool",
      wifProviderId: "okta-oidc",
      wifSubjectTokenType: "urn:ietf:params:oauth:token-type:id_token",
    });

    for (const lang of ["python", "nodejs", "curl", "rest"] as const) {
      expect(wifSnippets[lang]).toContain(customDsName);
      expect(wifSnippets[lang]).not.toContain("collections/default_collection");
    }
  });

  it("attaches rawResponse (preserving summary and queryExpansionInfo) in useDataStoreQuery history entries", async () => {
    const mockRawSearchResponse = {
      results: [
        {
          id: "doc-1",
          document: {
            id: "doc-1",
            name: "projects/123/locations/global/collections/jira_col/dataStores/jira_col_issue/branches/0/documents/doc-1",
          },
        },
      ],
      totalSize: 1,
      summary: { summaryText: "Synthesized answer from Jira issues." },
      queryExpansionInfo: { pinnedResultCount: 1 },
    };

    const querySpy = vi
      .spyOn(apiService, "queryDataStore")
      .mockResolvedValueOnce(mockRawSearchResponse);

    const { result } = renderHook(() =>
      useDataStoreQuery(
        true,
        {
          name: "projects/123/locations/global/collections/jira_col/dataStores/jira_col_issue",
          displayName: "Jira Issues",
        },
        {
          projectId: "123",
          appLocation: "global",
          collectionId: "jira_col",
          appId: "",
        },
      ),
    );

    act(() => {
      result.current.setQuery("vpn timeout");
    });

    await act(async () => {
      await result.current.handleSearch();
    });

    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].rawResponse).toEqual(mockRawSearchResponse);
    querySpy.mockRestore();
  });
});
