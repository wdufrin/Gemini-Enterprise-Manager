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

import React, { useState, useEffect, useMemo, useRef } from "react";
import { CitationMappings, Config } from "../../types";
import { DISCOVERY_API_VERSION } from "../../services/api/core";
import * as dataStoresApi from "../../services/api/dataStores";
import * as operationsApi from "../../services/api/discovery/operations";
import * as mcpApi from "../../services/api/mcp";
import { validateRawCitationMappingsObject } from "./byomcp/citationPointerUtils";
import { useModalA11y } from "../../hooks/useModalA11y";
import { toErrorMessage } from "../../utils/errors";

export const BYO_MCP_COLLECTION_ID_REGEX = /^[a-z0-9][a-z0-9_-]{1,62}$/;

export interface DiscoveredMcpTool {
  name: string;
  description: string;
  enabled: boolean;
  outputSchema?: Record<string, unknown>;
}

export type ByoMcpAuthMode = "none" | "oauth" | "bearer";

export interface CreateByoMcpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdCollectionId: string, createdLocation: string) => void;
  projectId: string;
  defaultLocation?: string;
}

export function isDisallowedMcpHost(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return "MCP Endpoint URL must be a valid URL (e.g. https://my-mcp-server.a.run.app/mcp).";
  }
  if (parsed.protocol !== "https:") {
    return "MCP Endpoint URL must use https://.";
  }
  if (parsed.username || parsed.password) {
    return "MCP Endpoint URL must not embed username/password credentials.";
  }
  const host = parsed.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host.startsWith("::ffff:") ||
    /^f[cd][0-9a-f]{0,2}:/.test(host) ||
    /^fe[89ab][0-9a-f]:/.test(host)
  ) {
    return `MCP Endpoint host "${host}" cannot be a loopback, private, link-local, or metadata address.`;
  }
  return null;
}

export function scaffoldMcpInstructionsAndCitations(
  displayName: string,
  tools: DiscoveredMcpTool[],
): {
  serverDescription: string;
  agentInstructions: string;
  citationMappings: CitationMappings;
} {
  const enabled = tools.filter((t) => t.enabled);
  const targetTools = enabled.length > 0 ? enabled : tools;

  const toolNamesList = targetTools.map((t) => t.name).join(", ");
  const serverDescription = targetTools.length
    ? `${displayName || "Custom MCP Server"} exposing ${targetTools.length} MCP tool(s): ${toolNamesList}.`
    : `${displayName || "Custom MCP Server"} connected via Model Context Protocol.`;

  const toolLines = targetTools.map((t) =>
    t.description
      ? `- \`${t.name}\`: ${t.description}`
      : `- \`${t.name}\`: Invoke when relevant to user queries.`,
  );

  const agentInstructions = [
    `You have access to the "${displayName || "Custom MCP"}" MCP server.`,
    ...(toolLines.length > 0
      ? ["", "AVAILABLE TOOLS:", ...toolLines]
      : []),
    "",
    "RESPONSE & CITATION GUIDELINES:",
    "1. Prefer the most specific tool above based on the user's intent.",
    "2. Summarize retrieved tool outputs clearly and include direct source links/URIs.",
    "3. If a tool returns an empty result or error, report the diagnostic context transparently.",
  ].join("\n");

  const defaultCitationMappings: CitationMappings = {
    "": {
      items: "/results",
      uri: "/uri",
      title: "/title",
      snippet: "/snippet",
      id: "/id",
    },
  };

  return {
    serverDescription,
    agentInstructions,
    citationMappings: defaultCitationMappings,
  };
}

export const CreateByoMcpModal: React.FC<CreateByoMcpModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  defaultLocation = "global",
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useModalA11y({
    isOpen,
    onClose,
    containerRef: dialogRef,
    preventClose: isSubmitting,
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [collectionId, setCollectionId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [region, setRegion] = useState<string>(defaultLocation || "global");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authMode, setAuthMode] = useState<ByoMcpAuthMode>("none");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthAuthUri, setOauthAuthUri] = useState("");
  const [oauthTokenUri, setOauthTokenUri] = useState("");
  const [oauthScopes, setOauthScopes] = useState("");
  const [probeBearerToken, setProbeBearerToken] = useState("");

  // Step 2 state
  const [discoveredTools, setDiscoveredTools] = useState<DiscoveredMcpTool[]>([]);
  const [isProbing, setIsProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [hasProbed, setHasProbed] = useState(false);
  const [serverDescription, setServerDescription] = useState("");
  const [agentInstructions, setAgentInstructions] = useState("");
  const [citationMappingsJson, setCitationMappingsJson] = useState(
    JSON.stringify(
      {
        "": {
          items: "/results",
          uri: "/uri",
          title: "/title",
          snippet: "/snippet",
          id: "/id",
        },
      },
      null,
      2,
    ),
  );

  // Validation & Submit state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lroStatusText, setLroStatusText] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCollectionId("");
      setDisplayName("");
      setRegion(defaultLocation || "global");
      setEndpointUrl("");
      setAuthMode("none");
      setOauthClientId("");
      setOauthClientSecret("");
      setOauthAuthUri("");
      setOauthTokenUri("");
      setOauthScopes("");
      setProbeBearerToken("");
      setDiscoveredTools([]);
      setIsProbing(false);
      setProbeError(null);
      setHasProbed(false);
      setServerDescription("");
      setAgentInstructions("");
      setCitationMappingsJson(
        JSON.stringify(
          {
            "": {
              items: "/results",
              uri: "/uri",
              title: "/title",
              snippet: "/snippet",
              id: "/id",
            },
          },
          null,
          2,
        ),
      );
      setValidationError(null);
      setSubmitError(null);
      setLroStatusText(null);
      setIsSubmitting(false);
    }
  }, [isOpen, defaultLocation]);

  const validateStep1 = (): boolean => {
    setValidationError(null);
    if (!projectId.trim()) {
      setValidationError("Target GCP Project ID / Number is required.");
      return false;
    }
    const cleanColId = collectionId.trim();
    if (!BYO_MCP_COLLECTION_ID_REGEX.test(cleanColId)) {
      setValidationError(
        "Collection ID must match [a-z0-9][a-z0-9_-]{1,62} (2-63 lowercase letters, digits, hyphens, or underscores, starting with alphanumeric).",
      );
      return false;
    }
    if (cleanColId === "default_collection") {
      setValidationError(
        '"default_collection" is reserved by Discovery Engine. Choose a dedicated Collection ID (e.g. "figma-mcp-prod").',
      );
      return false;
    }
    if (!displayName.trim()) {
      setValidationError("Display Name is required.");
      return false;
    }
    if (!["global", "us", "eu"].includes(region)) {
      setValidationError("Region must be global, us, or eu.");
      return false;
    }
    const hostErr = isDisallowedMcpHost(endpointUrl);
    if (hostErr) {
      setValidationError(hostErr);
      return false;
    }
    if (authMode === "oauth") {
      if (!oauthClientId.trim()) {
        setValidationError("OAuth Client ID is required when OAuth 2.0 is selected.");
        return false;
      }
      if (!oauthClientSecret.trim()) {
        setValidationError("OAuth Client Secret is required when OAuth 2.0 is selected.");
        return false;
      }
      if (!oauthTokenUri.trim() || !oauthTokenUri.trim().startsWith("https://")) {
        setValidationError(
          "OAuth Token URI must be a valid https:// URL when OAuth 2.0 is selected.",
        );
        return false;
      }
      if (oauthAuthUri.trim() && !oauthAuthUri.trim().startsWith("https://")) {
        setValidationError("OAuth Authorization URI must use https://.");
        return false;
      }
    }
    if (authMode === "bearer" && !probeBearerToken.trim()) {
      setValidationError("Bearer Token is required when Bearer Token auth is selected.");
      return false;
    }
    return true;
  };

  const parseValidatedCitations = (): {
    ok: boolean;
    mappings?: CitationMappings;
    error?: string;
  } => {
    const rawText = citationMappingsJson.trim();
    if (!rawText) {
      return { ok: true, mappings: undefined };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err: unknown) {
      return {
        ok: false,
        error: `Invalid citation_mappings JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const issues = validateRawCitationMappingsObject(parsed);
    const firstErr = issues.find((i) => i.severity === "error");
    if (firstErr) {
      return { ok: false, error: `Invalid citation_mappings: ${firstErr.message}` };
    }
    return { ok: true, mappings: parsed as CitationMappings };
  };

  const validateStep2 = (): boolean => {
    setValidationError(null);
    const citRes = parseValidatedCitations();
    if (!citRes.ok) {
      setValidationError(citRes.error || "Invalid citation_mappings.");
      return false;
    }
    return true;
  };

  const handleProbeTools = async () => {
    setProbeError(null);
    const hostErr = isDisallowedMcpHost(endpointUrl);
    if (hostErr) {
      setProbeError(hostErr);
      return;
    }
    setIsProbing(true);
    try {
      const rawTools = await mcpApi.listMcpTools(projectId, endpointUrl.trim(), {
        bearerToken: probeBearerToken.trim() || undefined,
      });
      const mapped: DiscoveredMcpTool[] = rawTools
        .filter((t) => t && typeof t.name === "string" && t.name.trim() !== "")
        .map((t) => ({
          name: String(t.name).trim(),
          description: typeof t.description === "string" ? t.description : "",
          enabled: true,
          outputSchema:
            t.outputSchema && typeof t.outputSchema === "object"
              ? (t.outputSchema as Record<string, unknown>)
              : undefined,
        }));

      setDiscoveredTools(mapped);
      setHasProbed(true);

      const scaffolded = scaffoldMcpInstructionsAndCitations(
        displayName.trim(),
        mapped,
      );
      if (!serverDescription.trim()) {
        setServerDescription(scaffolded.serverDescription);
      }
      setAgentInstructions(scaffolded.agentInstructions);
      setCitationMappingsJson(
        JSON.stringify(scaffolded.citationMappings, null, 2),
      );
    } catch (err: unknown) {
      setProbeError(toErrorMessage(err, "Failed to probe tools/list from MCP endpoint."));
    } finally {
      setIsProbing(false);
    }
  };

  const handleToggleTool = (toolName: string) => {
    setDiscoveredTools((prev) =>
      prev.map((t) =>
        t.name === toolName ? { ...t, enabled: !t.enabled } : t,
      ),
    );
  };

  const finalPayload = useMemo(() => {
    const citRes = parseValidatedCitations();
    const actionParams: Record<string, unknown> = {
      instance_uri: endpointUrl.trim(),
      auth_type: authMode === "oauth" ? "OAUTH" : "NO_AUTH",
    };

    if (serverDescription.trim()) {
      actionParams.mcp_server_description = serverDescription.trim();
    }
    if (agentInstructions.trim()) {
      actionParams.mcp_agent_instructions = agentInstructions.trim();
    }
    if (citRes.ok && citRes.mappings && Object.keys(citRes.mappings).length > 0) {
      actionParams.citation_mappings = citRes.mappings;
    }

    if (authMode === "oauth") {
      actionParams.client_id = oauthClientId.trim();
      actionParams.client_secret = oauthClientSecret.trim();
      actionParams.token_uri = oauthTokenUri.trim();
      if (oauthAuthUri.trim()) {
        actionParams.auth_uri = oauthAuthUri.trim();
      }
      if (oauthScopes.trim()) {
        actionParams.scopes = oauthScopes.trim();
      }
    } else if (authMode === "bearer" && probeBearerToken.trim()) {
      actionParams.auth_key = "bearer_token";
      actionParams.auth_token = probeBearerToken.trim();
    }

    const enabledToolNames = discoveredTools
      .filter((t) => t.enabled)
      .map((t) => t.name);

    return {
      collectionId: collectionId.trim(),
      collectionDisplayName: displayName.trim(),
      dataConnector: {
        dataSource: "custom_mcp",
        connectorModes: ["ACTIONS"],
        params: {},
        actionConfig: {
          actionParams,
          createBapConnection: false,
        },
        ...(enabledToolNames.length > 0
          ? {
              bapConfig: {
                enabledActions: enabledToolNames,
              },
            }
          : {}),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    collectionId,
    displayName,
    endpointUrl,
    authMode,
    oauthClientId,
    oauthClientSecret,
    oauthTokenUri,
    oauthAuthUri,
    oauthScopes,
    probeBearerToken,
    serverDescription,
    agentInstructions,
    citationMappingsJson,
    discoveredTools,
  ]);

  const redactedPreviewPayload = useMemo(() => {
    const clone = JSON.parse(JSON.stringify(finalPayload)) as {
      dataConnector: { actionConfig: { actionParams: Record<string, unknown> } };
    };
    const ap = clone.dataConnector.actionConfig.actionParams;
    if (ap.client_secret) ap.client_secret = "***REDACTED***";
    if (ap.auth_token) ap.auth_token = "***REDACTED***";
    return clone;
  }, [finalPayload]);

  const handleProvision = async () => {
    if (!validateStep1() || !validateStep2()) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setLroStatusText("Submitting :setUpDataConnector request...");

    const targetConfig: Config = {
      projectId: projectId.trim(),
      appLocation: region,
      collectionId: collectionId.trim(),
      appId: "",
      assistantId: "",
    };

    try {
      const op = await dataStoresApi.setUpDataConnector(finalPayload, targetConfig);
      if (op?.error) {
        throw new Error(
          op.error.message ||
            `Connector provisioning failed with code ${op.error.code}`,
        );
      }

      if (op?.name && !op.done) {
        setLroStatusText(
          `Waiting for Discovery Engine LRO (${op.name.split("/").pop()})...`,
        );
        const completedOp = await operationsApi.pollDiscoveryOperation(
          op,
          targetConfig,
          DISCOVERY_API_VERSION,
        );
        if (completedOp?.error) {
          throw new Error(
            completedOp.error.message ||
              `Provisioning LRO failed with code ${completedOp.error.code}`,
          );
        }
        if (!completedOp?.done) {
          throw new Error(
            `Operation ${op.name} did not complete within the polling window. Check Google Cloud Operations.`,
          );
        }
      }

      setIsSubmitting(false);
      setLroStatusText(null);
      onSuccess(collectionId.trim(), region);
    } catch (err: unknown) {
      setSubmitError(
        toErrorMessage(err, "Failed to provision BYO MCP connector."),
      );
      setIsSubmitting(false);
      setLroStatusText(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-byo-mcp-title"
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2
              id="create-byo-mcp-title"
              className="text-lg font-bold text-white"
            >
              Create BYO MCP Connector (Day-0 Wizard)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Step {step} of 3:{" "}
              {step === 1
                ? "Collection Identity, Endpoint & Authentication"
                : step === 2
                  ? "Live tools/list Probe, Instructions & Citation Mappings"
                  : "Review Payload & Provision Connector"}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close BYO MCP Wizard"
            className="text-gray-400 hover:text-white px-2 py-1 text-lg font-bold disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {validationError && (
            <div
              role="alert"
              className="bg-red-900/30 border border-red-700/60 text-red-200 p-3 rounded-lg text-xs"
            >
              {validationError}
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="bg-red-900/30 border border-red-700/60 text-red-200 p-3 rounded-lg text-xs"
            >
              <strong>GCP Provisioning Failed:</strong> {submitError}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="byo-mcp-collection-id"
                    className="block text-xs font-semibold text-gray-300 mb-1"
                  >
                    Collection ID *
                  </label>
                  <input
                    id="byo-mcp-collection-id"
                    type="text"
                    value={collectionId}
                    onChange={(e) => setCollectionId(e.target.value)}
                    placeholder="e.g. figma-mcp-prod"
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Lowercase alphanumeric, hyphens, or underscores (2–63 chars).
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="byo-mcp-display-name"
                    className="block text-xs font-semibold text-gray-300 mb-1"
                  >
                    Display Name *
                  </label>
                  <input
                    id="byo-mcp-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Figma Design System MCP"
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label
                    htmlFor="byo-mcp-region"
                    className="block text-xs font-semibold text-gray-300 mb-1"
                  >
                    Region *
                  </label>
                  <select
                    id="byo-mcp-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                  >
                    <option value="global">global</option>
                    <option value="us">us</option>
                    <option value="eu">eu</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor="byo-mcp-endpoint-url"
                    className="block text-xs font-semibold text-gray-300 mb-1"
                  >
                    MCP Server HTTPS Endpoint URL *
                  </label>
                  <input
                    id="byo-mcp-endpoint-url"
                    type="url"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    placeholder="https://my-mcp-server-uc.a.run.app/mcp"
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-4 space-y-3">
                <div>
                  <label
                    htmlFor="byo-mcp-auth-mode"
                    className="block text-xs font-semibold text-gray-300 mb-1"
                  >
                    Authentication Mode
                  </label>
                  <select
                    id="byo-mcp-auth-mode"
                    value={authMode}
                    onChange={(e) => setAuthMode(e.target.value as ByoMcpAuthMode)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white"
                  >
                    <option value="none">
                      No OAuth (Public HTTPS / Cloud Run Service Agent IAM)
                    </option>
                    <option value="oauth">
                      OAuth 2.0 (Client ID, Client Secret &amp; Token URI)
                    </option>
                    <option value="bearer">
                      Static Bearer Token (auth_token + Live Probing)
                    </option>
                  </select>
                </div>

                {authMode === "oauth" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label
                        htmlFor="byo-mcp-client-id"
                        className="block text-xs text-gray-300 mb-1"
                      >
                        OAuth Client ID *
                      </label>
                      <input
                        id="byo-mcp-client-id"
                        type="text"
                        value={oauthClientId}
                        onChange={(e) => setOauthClientId(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="byo-mcp-client-secret"
                        className="block text-xs text-gray-300 mb-1"
                      >
                        OAuth Client Secret *
                      </label>
                      <input
                        id="byo-mcp-client-secret"
                        type="password"
                        value={oauthClientSecret}
                        onChange={(e) => setOauthClientSecret(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="byo-mcp-token-uri"
                        className="block text-xs text-gray-300 mb-1"
                      >
                        OAuth Token URI *
                      </label>
                      <input
                        id="byo-mcp-token-uri"
                        type="url"
                        value={oauthTokenUri}
                        onChange={(e) => setOauthTokenUri(e.target.value)}
                        placeholder="https://idp.example.com/oauth2/token"
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="byo-mcp-auth-uri"
                        className="block text-xs text-gray-300 mb-1"
                      >
                        OAuth Authorization URI (Optional)
                      </label>
                      <input
                        id="byo-mcp-auth-uri"
                        type="url"
                        value={oauthAuthUri}
                        onChange={(e) => setOauthAuthUri(e.target.value)}
                        placeholder="https://idp.example.com/oauth2/authorize"
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="byo-mcp-scopes"
                        className="block text-xs text-gray-300 mb-1"
                      >
                        OAuth Scopes (Optional)
                      </label>
                      <input
                        id="byo-mcp-scopes"
                        type="text"
                        value={oauthScopes}
                        onChange={(e) => setOauthScopes(e.target.value)}
                        placeholder="openid email tools:read"
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="byo-mcp-probe-bearer"
                    className="block text-xs text-gray-300 mb-1"
                  >
                    {authMode === "bearer"
                      ? "Bearer Token *"
                      : "Bearer Token for Live tools/list Probe (Optional)"}
                  </label>
                  <input
                    id="byo-mcp-probe-bearer"
                    type="password"
                    value={probeBearerToken}
                    onChange={(e) => setProbeBearerToken(e.target.value)}
                    placeholder="Optional token used when probing tools/list in Step 2"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Live MCP Tool Discovery
                  </div>
                  <div className="text-xs text-gray-400 font-mono truncate max-w-md">
                    {endpointUrl}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isProbing}
                  onClick={handleProbeTools}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-md whitespace-nowrap"
                >
                  {isProbing ? "Probing tools/list..." : "Probe tools/list"}
                </button>
              </div>

              {probeError && (
                <div
                  role="alert"
                  className="bg-red-900/30 border border-red-700/60 text-red-200 p-3 rounded-lg text-xs"
                >
                  <strong>Probe Failed:</strong> {probeError}
                </div>
              )}

              {hasProbed && (
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-emerald-300">
                    Discovered {discoveredTools.length} MCP Tool(s)
                  </div>
                  {discoveredTools.length === 0 ? (
                    <p className="text-xs text-amber-300">
                      MCP server answered JSON-RPC 2.0 successfully, but returned 0 tools.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {discoveredTools.map((tool) => (
                        <label
                          key={tool.name}
                          className="flex items-start gap-2 p-2 rounded bg-gray-900 border border-gray-700 text-xs cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={tool.enabled}
                            onChange={() => handleToggleTool(tool.name)}
                            className="mt-0.5 rounded bg-gray-800 border-gray-600 text-blue-500"
                          />
                          <div>
                            <div className="font-mono font-semibold text-white">
                              {tool.name}
                            </div>
                            {tool.description && (
                              <div className="text-gray-400 text-[11px]">
                                {tool.description}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label
                  htmlFor="byo-mcp-server-desc"
                  className="block text-xs font-semibold text-gray-300 mb-1"
                >
                  MCP Server Description (<code className="font-mono">mcp_server_description</code>)
                </label>
                <input
                  id="byo-mcp-server-desc"
                  type="text"
                  value={serverDescription}
                  onChange={(e) => setServerDescription(e.target.value)}
                  placeholder="Short description used by Gemini Enterprise planner to route requests"
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="byo-mcp-instructions"
                  className="block text-xs font-semibold text-gray-300 mb-1"
                >
                  Agent Instructions (<code className="font-mono">mcp_agent_instructions</code>)
                </label>
                <textarea
                  id="byo-mcp-instructions"
                  rows={5}
                  value={agentInstructions}
                  onChange={(e) => setAgentInstructions(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor="byo-mcp-citations"
                  className="block text-xs font-semibold text-gray-300 mb-1"
                >
                  RFC 6901 Citation Mappings (<code className="font-mono">citation_mappings</code> JSON)
                </label>
                <textarea
                  id="byo-mcp-citations"
                  rows={6}
                  value={citationMappingsJson}
                  onChange={(e) => setCitationMappingsJson(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 font-mono"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3.5 text-xs space-y-1">
                <div className="text-gray-400">
                  Target Collection Resource:{" "}
                  <span className="text-white font-mono">
                    projects/{projectId}/locations/{region}/collections/{collectionId.trim()}/dataConnector
                  </span>
                </div>
                <div className="text-gray-400">
                  Endpoint:{" "}
                  <span className="text-blue-300 font-mono">{endpointUrl.trim()}</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-300 mb-1">
                  <code className="font-mono">:setUpDataConnector</code> Request Payload Preview
                </div>
                <pre className="p-3 bg-gray-950 border border-gray-800 rounded-lg text-[11px] text-gray-300 font-mono overflow-x-auto max-h-64">
                  {JSON.stringify(redactedPreviewPayload, null, 2)}
                </pre>
              </div>

              {lroStatusText && (
                <div
                  role="status"
                  className="bg-blue-950/50 border border-blue-700 text-blue-200 p-3 rounded-lg text-xs flex items-center gap-2"
                >
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-blue-300 border-t-transparent animate-spin" />
                  <span>{lroStatusText}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-800 border-t border-gray-700 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setValidationError(null);
                  setStep((prev) => (prev === 3 ? 2 : 1));
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-md disabled:opacity-50"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-md disabled:opacity-50"
            >
              Cancel
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && validateStep1()) {
                    setStep(2);
                  } else if (step === 2 && validateStep2()) {
                    setStep(3);
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleProvision}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-semibold rounded-md"
              >
                {isSubmitting
                  ? "Provisioning Connector..."
                  : "Provision BYO MCP Connector"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateByoMcpModal;
