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

import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  renderHook,
  act,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMcpToolsMock = vi.fn();
const setUpDataConnectorMock = vi.fn();
const pollDiscoveryOperationMock = vi.fn();
const listGcsObjectsMock = vi.fn();
const getGcsObjectContentMock = vi.fn();
const listAlertPoliciesMock = vi.fn();
const listNotificationChannelsMock = vi.fn();
const createAlertPolicyMock = vi.fn();
const deleteAlertPolicyMock = vi.fn();
const listResourcesMock = vi.fn();

vi.mock("../../services/api/mcp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api/mcp")>();
  return {
    ...actual,
    listMcpTools: (...args: unknown[]) => listMcpToolsMock(...args),
  };
});

vi.mock("../../services/api/dataStores", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/api/dataStores")>();
  return {
    ...actual,
    setUpDataConnector: (...args: unknown[]) => setUpDataConnectorMock(...args),
  };
});

vi.mock("../../services/api/discovery/operations", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../services/api/discovery/operations")
    >();
  return {
    ...actual,
    pollDiscoveryOperation: (...args: unknown[]) =>
      pollDiscoveryOperationMock(...args),
  };
});

vi.mock("../../services/api/cloudStorage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/api/cloudStorage")>();
  return {
    ...actual,
    listGcsObjects: (...args: unknown[]) => listGcsObjectsMock(...args),
    getGcsObjectContent: (...args: unknown[]) =>
      getGcsObjectContentMock(...args),
  };
});

vi.mock("../../services/api/alertPolicies", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/api/alertPolicies")>();
  return {
    ...actual,
    listAlertPolicies: (...args: unknown[]) => listAlertPoliciesMock(...args),
    listNotificationChannels: (...args: unknown[]) =>
      listNotificationChannelsMock(...args),
    createAlertPolicy: (...args: unknown[]) => createAlertPolicyMock(...args),
    deleteAlertPolicy: (...args: unknown[]) => deleteAlertPolicyMock(...args),
  };
});

vi.mock("../../services/apiService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/apiService")>();
  return {
    ...actual,
    setUpDataConnector: (...args: unknown[]) => setUpDataConnectorMock(...args),
    pollDiscoveryOperation: (...args: unknown[]) =>
      pollDiscoveryOperationMock(...args),
    listResources: (...args: unknown[]) => listResourcesMock(...args),
  };
});

import CreateByoMcpModal from "./CreateByoMcpModal";
import DeadLetterInspectorModal, {
  parseGcsPrefixUri,
  parseDeadLetterContent,
  buildDeadLetterCsv,
} from "./DeadLetterInspectorModal";
import ConnectorAlertPolicyModal from "./ConnectorAlertPolicyModal";
import {
  ConnectorCollectionTable,
  parseRefreshIntervalMs,
  evaluateConnectorSyncSla,
} from "./ConnectorCollectionTable";
import ConnectorsPage from "../../pages/ConnectorsPage";
import { useDuplicateConnector } from "../../hooks/useDuplicateConnector";

describe("CreateByoMcpModal (Item #10b Day-0 BYO MCP Wizard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces Step 1 validation for Collection ID regex, reserved default_collection, non-HTTPS, SSRF loopback/metadata hosts, and OAuth fields", () => {
    render(
      <CreateByoMcpModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        projectId="proj-123"
        defaultLocation="global"
      />,
    );

    const colInput = screen.getByLabelText(/Collection ID \*/i);
    const nameInput = screen.getByLabelText(/Display Name \*/i);
    const urlInput = screen.getByLabelText(/MCP Server HTTPS Endpoint URL \*/i);

    // 1. Invalid uppercase collection ID
    fireEvent.change(colInput, { target: { value: "Invalid_Upper" } });
    fireEvent.change(nameInput, { target: { value: "My MCP" } });
    fireEvent.change(urlInput, { target: { value: "https://mcp.example.com/mcp" } });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /\[a-z0-9\]\[a-z0-9_-\]\{1,62\}/,
    );

    // 2. Reserved default_collection
    fireEvent.change(colInput, { target: { value: "default_collection" } });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/reserved/i);

    // 3. Insecure http:// URL
    fireEvent.change(colInput, { target: { value: "figma-mcp-1" } });
    fireEvent.change(urlInput, { target: { value: "http://mcp.example.com/mcp" } });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/must use https:\/\//i);

    // 4. SSRF metadata IP
    fireEvent.change(urlInput, {
      target: { value: "https://169.254.169.254/latest/meta-data/" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /cannot be a loopback, private, link-local, or metadata/i,
    );

    // 5. OAuth mode missing client secret
    fireEvent.change(urlInput, { target: { value: "https://mcp.example.com/mcp" } });
    fireEvent.change(screen.getByLabelText(/Authentication Mode/i), {
      target: { value: "oauth" },
    });
    fireEvent.change(screen.getByLabelText(/OAuth Client ID \*/i), {
      target: { value: "cid-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /OAuth Client Secret is required/i,
    );
  });

  it("probes tools/list live, auto-scaffolds instructions & RFC 6901 citation_mappings, and polls LRO until completion", async () => {
    listMcpToolsMock.mockResolvedValueOnce([
      {
        name: "search_design_tokens",
        description: "Search enterprise Figma design tokens",
      },
      {
        name: "get_component_spec",
        description: "Fetch component accessibility specification",
      },
    ]);

    setUpDataConnectorMock.mockResolvedValueOnce({
      name: "projects/proj-123/locations/us/operations/setup-mcp-op-1",
      done: false,
    });

    pollDiscoveryOperationMock.mockResolvedValueOnce({
      name: "projects/proj-123/locations/us/operations/setup-mcp-op-1",
      done: true,
      response: {
        name: "projects/proj-123/locations/us/collections/figma-mcp-us/dataConnector",
      },
    });

    const onSuccess = vi.fn();

    render(
      <CreateByoMcpModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        projectId="proj-123"
        defaultLocation="global"
      />,
    );

    // Step 1
    fireEvent.change(screen.getByLabelText(/Collection ID \*/i), {
      target: { value: "figma-mcp-us" },
    });
    fireEvent.change(screen.getByLabelText(/Display Name \*/i), {
      target: { value: "Figma MCP US" },
    });
    fireEvent.change(screen.getByLabelText(/Region \*/i), {
      target: { value: "us" },
    });
    fireEvent.change(screen.getByLabelText(/MCP Server HTTPS Endpoint URL \*/i), {
      target: { value: "https://figma-mcp-xyz.a.run.app/mcp" },
    });
    fireEvent.change(
      screen.getByLabelText(/Bearer Token for Live tools\/list Probe/i),
      { target: { value: "probe-token-abc" } },
    );

    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));

    // Step 2: Probe tools/list
    fireEvent.click(screen.getByRole("button", { name: /Probe tools\/list/i }));

    await waitFor(() => {
      expect(listMcpToolsMock).toHaveBeenCalledWith(
        "proj-123",
        "https://figma-mcp-xyz.a.run.app/mcp",
        { bearerToken: "probe-token-abc" },
      );
      expect(screen.getByText("search_design_tokens")).toBeInTheDocument();
      expect(screen.getByText("get_component_spec")).toBeInTheDocument();
    });

    const instructionsInput = screen.getByLabelText(
      /Agent Instructions/i,
    ) as HTMLTextAreaElement;
    expect(instructionsInput.value).toContain("search_design_tokens");

    // Verify adversarial RFC 6901 pointer validation on Step 2
    const citationsInput = screen.getByLabelText(
      /RFC 6901 Citation Mappings/i,
    ) as HTMLTextAreaElement;
    const validScaffoldedCitations = citationsInput.value;
    fireEvent.change(citationsInput, {
      target: { value: JSON.stringify({ "": { uri: "missing_leading_slash" } }) },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/RFC 6901 JSON Pointer/i);

    // Restore valid RFC 6901 citations and proceed to Step 3
    fireEvent.change(citationsInput, { target: { value: validScaffoldedCitations } });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));

    // Step 3: Provision & verify LRO polling
    fireEvent.click(
      screen.getByRole("button", { name: /Provision BYO MCP Connector/i }),
    );

    await waitFor(() => {
      expect(setUpDataConnectorMock).toHaveBeenCalledTimes(1);
      expect(pollDiscoveryOperationMock).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith("figma-mcp-us", "us");
    });

    expect(setUpDataConnectorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId: "figma-mcp-us",
        collectionDisplayName: "Figma MCP US",
        dataConnector: expect.objectContaining({
          dataSource: "custom_mcp",
          connectorModes: ["ACTIONS"],
          bapConfig: {
            enabledActions: ["search_design_tokens", "get_component_spec"],
          },
          actionConfig: expect.objectContaining({
            actionParams: expect.objectContaining({
              instance_uri: "https://figma-mcp-xyz.a.run.app/mcp",
              auth_type: "NO_AUTH",
            }),
          }),
        }),
      }),
      expect.objectContaining({
        projectId: "proj-123",
        appLocation: "us",
        collectionId: "figma-mcp-us",
      }),
    );
  });

  it("surfaces GCP LRO failure errors in Step 3 without calling onSuccess", async () => {
    setUpDataConnectorMock.mockResolvedValueOnce({
      name: "projects/proj-123/locations/global/operations/op-fail-99",
      done: false,
    });
    pollDiscoveryOperationMock.mockRejectedValueOnce(
      new Error("PERMISSION_DENIED: Caller lacks discoveryengine.dataConnectors.create"),
    );

    const onSuccess = vi.fn();
    render(
      <CreateByoMcpModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
        projectId="proj-123"
      />,
    );

    fireEvent.change(screen.getByLabelText(/Collection ID \*/i), {
      target: { value: "mcp-denied-col" },
    });
    fireEvent.change(screen.getByLabelText(/Display Name \*/i), {
      target: { value: "Denied MCP" },
    });
    fireEvent.change(screen.getByLabelText(/MCP Server HTTPS Endpoint URL \*/i), {
      target: { value: "https://mcp.example.com/mcp" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Provision BYO MCP Connector/i }),
    );

    const errBanner = await screen.findByRole("alert");
    expect(errBanner.textContent).toContain(
      "PERMISSION_DENIED: Caller lacks discoveryengine.dataConnectors.create",
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("Item #6 Sync SLA Monitor, Dead-Letter JSONL Inspector, Alert Modal & Duplicate LRO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses ISO-8601 and seconds refreshIntervals and flags SLA Stale when age > 2 * refreshInterval or latestRun FAILED", () => {
    expect(parseRefreshIntervalMs("86400s")).toBe(86_400_000);
    expect(parseRefreshIntervalMs("P1D")).toBe(86_400_000);
    expect(parseRefreshIntervalMs("PT6H")).toBe(21_600_000);
    expect(parseRefreshIntervalMs("P1DT12H")).toBe(129_600_000);
    expect(parseRefreshIntervalMs("invalid")).toBeNull();
    expect(parseRefreshIntervalMs("0s")).toBeNull();

    const nowMs = Date.parse("2026-11-19T16:00:00Z");

    const healthy = evaluateConnectorSyncSla(
      {
        refreshInterval: "PT6H",
        latestRun: { state: "SUCCEEDED", endTime: "2026-11-19T12:00:00Z" },
      },
      nowMs,
    );
    expect(healthy.breached).toBe(false);

    const stale = evaluateConnectorSyncSla(
      {
        refreshInterval: "P1D",
        latestRun: { state: "SUCCEEDED", endTime: "2026-11-17T14:00:00Z" },
      },
      nowMs,
    );
    expect(stale.breached).toBe(true);
    expect(stale.label).toBe("SLA Stale");
    expect(stale.severity).toBe("warning");

    const failedRun = evaluateConnectorSyncSla(
      {
        refreshInterval: "P7D",
        latestRun: {
          state: "FAILED",
          error: { message: "OAuth refresh token revoked" },
        },
      },
      nowMs,
    );
    expect(failedRun.breached).toBe(true);
    expect(failedRun.severity).toBe("error");

    render(
      <ConnectorCollectionTable
        collections={[
          {
            name: "projects/123/locations/global/collections/sharepoint-stale",
            displayName: "SharePoint Stale",
          },
        ]}
        validationResults={{
          "projects/123/locations/global/collections/sharepoint-stale": {
            status: "success",
            dataConnector: {
              refreshInterval: "PT6H",
              latestRun: {
                state: "SUCCEEDED",
                endTime: new Date(Date.now() - 20 * 3600_000).toISOString(),
              },
            },
          },
        }}
        editingId={null}
        setEditingId={vi.fn()}
        editName=""
        setEditName={vi.fn()}
        isSavingName={false}
        onSaveName={vi.fn()}
        getAssociatedApps={() => []}
        onCheckDataConnector={vi.fn()}
        onOpenDetails={vi.fn()}
        onSelectResult={vi.fn()}
        onDuplicateConnector={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("sla-stale-badge-sharepoint-stale"),
    ).toHaveTextContent("SLA Stale");
  });

  it("inspects GCS dead-letter JSONL files, groups errors, reports malformed JSONL lines, and escapes CSV formula injection", async () => {
    expect(() => parseGcsPrefixUri("https://storage.googleapis.com/bucket")).toThrow(
      /must start with "gs:\/\//i,
    );
    expect(parseGcsPrefixUri("gs://my-dlq-bucket/connectors/sp/")).toEqual({
      bucket: "my-dlq-bucket",
      prefix: "connectors/sp/",
    });

    const sampleJsonl = [
      JSON.stringify({
        status: { code: 7, message: "ACL principal not found in Identity Store" },
        uri: "https://contoso.sharepoint.com/sites/hr/handbook.pdf",
        id: "doc-101",
      }),
      JSON.stringify({
        status: { code: 3, message: "=CMD|' /C calc'!A0" },
        uri: "https://contoso.sharepoint.com/sites/eng/corrupt.docx",
        id: "doc-102",
      }),
      "{corrupted_jsonl_line_without_closing_brace",
    ].join("\n");

    const parsed = parseDeadLetterContent(sampleJsonl, "errors-0001.jsonl");
    expect(parsed.records).toHaveLength(3);
    expect(parsed.parseErrorCount).toBe(1);
    expect(parsed.records[2].errorCode).toBe("MALFORMED_JSONL");

    const csv = buildDeadLetterCsv(parsed.records);
    expect(csv).toContain("'=CMD|'");

    listGcsObjectsMock.mockResolvedValue({
      items: [{ bucket: "my-dlq-bucket", name: "connectors/sp/errors-0001.jsonl" }],
    });
    getGcsObjectContentMock.mockResolvedValue(sampleJsonl);

    render(
      <DeadLetterInspectorModal
        isOpen={true}
        onClose={vi.fn()}
        projectId="proj-123"
        collectionName="projects/proj-123/locations/global/collections/sp-col"
        initialGcsPrefix="gs://my-dlq-bucket/connectors/sp/"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/https:\/\/contoso\.sharepoint\.com\/sites\/hr\/handbook\.pdf/),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/PERMISSION_DENIED \(7\): 1/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter dead-letter records"), {
      target: { value: "corrupt.docx" },
    });
    expect(screen.queryByText(/handbook\.pdf/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/https:\/\/contoso\.sharepoint\.com\/sites\/eng\/corrupt\.docx/),
    ).toBeInTheDocument();
  });

  it("loads channels and deploys a 1-click Cloud Monitoring alert policy in ConnectorAlertPolicyModal", async () => {
    listAlertPoliciesMock.mockResolvedValue([]);
    listNotificationChannelsMock.mockResolvedValue([
      {
        name: "projects/proj-123/notificationChannels/ch-email-1",
        type: "email",
        displayName: "Platform On-Call",
      },
    ]);
    createAlertPolicyMock.mockResolvedValueOnce({
      name: "projects/proj-123/alertPolicies/pol-new-1",
      displayName: "[Gemini Enterprise] DataConnector Sync Failure - jira_prod",
      combiner: "OR",
      conditions: [],
    });

    render(
      <ConnectorAlertPolicyModal
        isOpen={true}
        onClose={vi.fn()}
        projectId="proj-123"
        collections={[
          {
            name: "projects/proj-123/locations/global/collections/jira_prod",
            displayName: "Jira Prod",
          },
        ]}
        initialCollectionId="jira_prod"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Platform On-Call/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: /1-Click Deploy Alert Policy/i }),
    );

    await waitFor(() => {
      expect(createAlertPolicyMock).toHaveBeenCalledWith(
        "proj-123",
        expect.objectContaining({
          notificationChannels: [
            "projects/proj-123/notificationChannels/ch-email-1",
          ],
        }),
      );
      expect(screen.getByRole("status").textContent).toContain(
        "Deployed alert policy",
      );
    });
  });

  it("awaits pollDiscoveryOperation in useDuplicateConnector when setUpDataConnector returns a non-done LRO", async () => {
    setUpDataConnectorMock.mockResolvedValueOnce({
      name: "projects/p-target/locations/global/operations/clone-op-77",
      done: false,
    });
    pollDiscoveryOperationMock.mockResolvedValueOnce({
      name: "projects/p-target/locations/global/operations/clone-op-77",
      done: true,
    });
    const onSuccess = vi.fn();

    const sourceConnectorState = {
      dataSource: "notion",
      connectorModes: ["FEDERATED", "ACTIONS"],
      params: { unused_auth_param: "true" },
      actionConfig: { isActionConfigured: true, actionParams: {} },
    };

    const { result } = renderHook(() =>
      useDuplicateConnector({
        isOpen: true,
        onSuccess,
        sourceCollectionName: "projects/p-src/locations/global/collections/notion-1",
        sourceConnectorState,
        currentProjectId: "p-target",
        currentLocation: "global",
      }),
    );

    act(() => {
      result.current.handleFieldChange("actionParams.api_token", "ntn_live_tok");
      result.current.setCurrentStep(4);
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(setUpDataConnectorMock).toHaveBeenCalledTimes(1);
    expect(pollDiscoveryOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "projects/p-target/locations/global/operations/clone-op-77",
        done: false,
      }),
      expect.objectContaining({
        projectId: "p-target",
        collectionId: "notion-1-clone",
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("resolves Associated Apps for custom connector collections via <collectionId>_* datastore IDs and enables Clone by default on ConnectorsPage", async () => {
    listResourcesMock.mockImplementation(async (resourceType: string) => {
      if (resourceType === "collections") {
        return {
          collections: [
            {
              name: "projects/123456/locations/global/collections/servicenow_it",
              displayName: "ServiceNow IT",
              dataConnector: {
                dataSource: "servicenow",
                connectorType: "THIRD_PARTY",
                connectorModes: ["DATA_INGESTION"],
              },
            },
          ],
        };
      }
      if (resourceType === "engines") {
        return {
          engines: [
            {
              name: "projects/123456/locations/global/collections/default_collection/engines/it-assistant",
              displayName: "IT Helpdesk Enterprise App",
              dataStoreIds: ["servicenow_it_incident", "servicenow_it_kb_knowledge"],
            },
          ],
        };
      }
      return { dataStores: [] };
    });

    render(<ConnectorsPage projectNumber="123456" setProjectNumber={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("ServiceNow IT")).toBeInTheDocument();
    });

    expect(screen.getByText("IT Helpdesk Enterprise App")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /\+ Create BYO MCP Connector/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Clone$/i })).toBeInTheDocument();
  });
});
