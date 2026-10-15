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

export interface FormField {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "checkbox";
  location: "params" | "actionParams";
  defaultValue: unknown;
  required: boolean;
  description?: string;
}

export interface ConnectorCloneEligibility {
  canClone: boolean;
  eligible?: boolean;
  reason?: string;
}

export const normalizeDataSource = (rawDataSource?: string): string => {
  const ds = (rawDataSource || "").trim().toLowerCase();
  if (ds === "ms-onedrive") return "onedrive";
  if (ds === "ms-outlook") return "outlook";
  if (ds === "ms-teams") return "teams";
  if (["entraid", "entra", "azure_ad", "azure_active_directory"].includes(ds)) {
    return "entra_id";
  }
  return ds;
};

const WORKSPACE_V2_SOURCES = new Set([
  "google_mail",
  "google_drive",
  "google_calendar",
  "google_chat",
]);

const UNSUPPORTED_INTERNAL_OR_CONSOLE_SOURCES = new Set([
  "google_docs",
  "file_upload",
  "notebooklm",
  "google_sites",
  "gcp_fhir",
  "healthcare_fhir",
  "cloud_storage",
  "cloud_identity",
]);

const HEADLESS_INGESTION_SOURCES = new Set([
  "entra_id",
  "teams",
  "outlook",
  "servicenow",
  "servicenow_federated_search",
  "workday",
  "notion",
  "linear",
  "shopify",
  "s4hana",
  "concur",
  "oracle_netsuite",
  "oraclefusion",
  "peoplesoft",
  "pagerduty",
  "airtable",
  "custom_mcp",
  "bigquery_mcp",
  "looker_mcp",
  "geminidataanalytics_mcp",
  "box_mcp",
  "box_custom_mcp",
  "atlan-mcp",
  "custom_connector",
  "gdrive",
  "gmail",
  "gcp_people",
  "google_workspace",
  "bigquery",
  "gcs",
  "spanner",
  "cloudsql",
  "alloydb",
  "firestore",
]);

const HEADLESS_AUTH_TYPES = new Set([
  "OAUTH_TWO_LEGGED",
  "API_KEY",
  "PAT",
  "BASIC",
  "BASIC_AUTH",
  "PASSWORD",
  "NO_AUTH",
  "SERVICE_ACCOUNT",
]);

// Connectors whose top-level authorization_parameters is unused_auth_param or empty
// (all credentials live exclusively inside actionConfig.actionParams)
const ACTION_ONLY_AUTH_SOURCES = new Set([
  "msft",
  "gitlab",
  "notion",
  "airtable",
  "miro",
  "canva",
  "concur",
  "oracle_netsuite",
  "clay",
  "gong",
  "clerk",
  "custom_mcp",
  "looker_mcp",
  "bigquery_mcp",
  "geminidataanalytics_mcp",
  "box_mcp",
  "box_custom_mcp",
  "atlan-mcp",
  "google_cloud_cli",
  "spanner",
  "cloudsql",
  "alloydb",
  "atlassian_rovo",
  "daloopa",
  "airops",
  "dice",
]);

const INTERNAL_SYSTEM_KEYS = new Set([
  "static_ip_enabled",
  "staticIpEnabled",
  "auth_type",
  "authType",
  "auth_key",
  "authKey",
  "refresh_token",
  "unused_auth_param",
  "p4sa_client_id",
  "admin_auth_credentials_secret_id",
  "bap_version",
  "connector_version",
  "create_bap_connection",
  "use_static_secrets",
  "service_name",
  "secret_id",
]);

const EXPLICIT_SECRET_KEYS = new Set([
  "client_secret",
  "password",
  "private_key",
  "api_key",
  "api_token",
  "auth_token",
  "access_token",
  "personal_access_token",
  "security_token",
  "oauth_access_token",
  "token",
  "pat",
  "client_key",
  "pass_phrase",
  "public_certificate",
  "refresh_token",
]);

const NON_SECRET_KEY_EXCEPTIONS = new Set([
  "auth_key",
  "authkey",
  "key_id",
  "key_property_mappings",
  "token_uri",
  "token_endpoint_uri",
  "auth_uri",
]);

export const isSecretKey = (key: string): boolean => {
  const keyLower = key.trim().toLowerCase();
  if (NON_SECRET_KEY_EXCEPTIONS.has(keyLower)) return false;
  if (EXPLICIT_SECRET_KEYS.has(keyLower)) return true;
  return keyLower.includes("secret") || keyLower.includes("password");
};

/**
 * Determines whether a connector can be cloned via the public REST API (:setUpDataConnector)
 * without requiring an interactive browser OAuth token (refresh_token popup) or Cloud Console session.
 */
export const getConnectorCloneEligibility = (
  rawConnectorState: unknown,
): ConnectorCloneEligibility => {
  if (!rawConnectorState || typeof rawConnectorState !== "object") {
    return {
      canClone: false,
      eligible: false,
      reason: "Connector configuration is not loaded.",
    };
  }

  const connectorState = rawConnectorState as Record<string, unknown>;
  const rawDs = String(connectorState.dataSource || "").trim();
  if (!rawDs) {
    return {
      canClone: false,
      eligible: false,
      reason: "Connector dataSource is missing.",
    };
  }

  const ds = normalizeDataSource(rawDs);
  const modes: string[] = Array.isArray(connectorState.connectorModes)
    ? connectorState.connectorModes.map((m: unknown) => String(m).toUpperCase())
    : [];
  const connectorType = String(connectorState.connectorType || "").toUpperCase();
  const params = (connectorState.params || {}) as Record<string, unknown>;
  const actionConfigObj = (connectorState.actionConfig || {}) as Record<string, unknown>;
  const actionParams = (actionConfigObj.actionParams || {}) as Record<string, unknown>;

  if (UNSUPPORTED_INTERNAL_OR_CONSOLE_SOURCES.has(ds)) {
    return {
      canClone: false,
      eligible: false,
      reason: `Cloning '${rawDs}' is not supported via the public REST API (:setUpDataConnector) and must be configured in the Google Cloud Console.`,
    };
  }

  const usesGoogleManagedOAuth =
    params.use_google_managed_oauth === true ||
    actionParams.use_google_managed_oauth === true;

  // 1. Google Workspace V2 (Federated/Actions) and Google-Managed 1P OAuth (e.g. msft suite)
  const isFederatedOrActionsMode =
    connectorType === "THIRD_PARTY_FEDERATED" ||
    modes.includes("FEDERATED") ||
    modes.includes("ACTIONS");

  if (
    (WORKSPACE_V2_SOURCES.has(ds) &&
      (isFederatedOrActionsMode ||
        connectorState.dataSourceVersion === 2 ||
        usesGoogleManagedOAuth)) ||
    ds === "msft" ||
    usesGoogleManagedOAuth
  ) {
    return {
      canClone: false,
      eligible: false,
      reason: `Cloning '${rawDs}' requires Google-managed OAuth or dataSourceVersion: 2, which is stripped by the public REST API and must be created in the Google Cloud Console UI.`,
    };
  }

  // 1b. Legacy 3LO *_federated_search connectors (except slack_federated_search with API Token or Google-managed OAuth)
  if (ds.endsWith("_federated_search")) {
    const authKeyVal = String(params.auth_key || actionParams.auth_key || "");
    const clientIdVal = params.client_id || actionParams.client_id;
    const isAllowedSlackFedSearch =
      ds === "slack_federated_search" &&
      (authKeyVal === "API Token" ||
        (authKeyVal === "OAuth" && !clientIdVal) ||
        usesGoogleManagedOAuth);

    if (!isAllowedSlackFedSearch) {
      return {
        canClone: false,
        eligible: false,
        reason: `Cloning legacy 3LO federated connector '${rawDs}' requires interactive browser OAuth and cannot be cloned headlessly via :setUpDataConnector.`,
      };
    }
  }

  // 2. All 3P Federated & Actions-only connectors do per-user OAuth at query time,
  // so no admin browser OAuth refresh_token is required at connector creation time.
  const hasDataIngestion = modes.includes("DATA_INGESTION");
  if (
    (connectorType === "THIRD_PARTY_FEDERATED" ||
      (isFederatedOrActionsMode && !hasDataIngestion)) &&
    !usesGoogleManagedOAuth
  ) {
    return { canClone: true, eligible: true };
  }

  // 3. Data Ingestion connectors that use headless / non-browser credentials
  // (2-Legged OAuth, Basic/Password grant, API Token, Workday ISU, MCP, or 1P IAM/DWD).
  const authType = String(
    params.auth_type || params.authType || actionParams.auth_type || "",
  ).toUpperCase();

  if (HEADLESS_AUTH_TYPES.has(authType) || HEADLESS_INGESTION_SOURCES.has(ds)) {
    return { canClone: true, eligible: true };
  }

  // 4. Legacy V1 Google Calendar / Drive / Mail strictly in DATA_INGESTION mode with DWD
  if (
    WORKSPACE_V2_SOURCES.has(ds) &&
    hasDataIngestion &&
    !isFederatedOrActionsMode &&
    connectorState.dataSourceVersion !== 2
  ) {
    return { canClone: true, eligible: true };
  }

  // 5. Remaining DATA_INGESTION connectors require an interactive 3-legged browser OAuth refresh_token
  return {
    canClone: false,
    eligible: false,
    reason: `Cloning ingested '${rawDs}' connectors requires an interactive browser OAuth token (refresh_token) and must be created in the Cloud Console UI.`,
  };
};

export const tooltipTexts: Record<string, string> = {
  embedded_images_enabled:
    "Enables parsing, OCR, and indexing of images embedded inside files (e.g., inline images in Word files or SharePoint pages).",
  eeeu_enabled:
    "Enables the End-to-End User (EE-EU) security model. When active, queries are executed using the searcher's personal identity, ensuring real-time security trimming based on their specific access permissions.",
  managed_paths_enabled:
    "If enabled, restricts crawling and indexing to specific SharePoint managed paths (like /sites/ or /teams/) instead of the entire root collection.",
  recursivelyCrawlNestedSites:
    "If enabled, recursively crawls all nested SharePoint sub-sites underneath the specified site collection or root URI.",
};

const isRedactedOrPlaceholder = (val: unknown): boolean => {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return (
    trimmed === "***" ||
    trimmed.toUpperCase().includes("REDACTED") ||
    trimmed.includes("[YOUR_") ||
    trimmed.includes("PROJECT_")
  );
};

const isActionOnlyAuthConnector = (
  dataSource: string,
  connectorState: Record<string, unknown>,
): boolean => {
  const modes: string[] = Array.isArray(connectorState.connectorModes)
    ? connectorState.connectorModes.map((m: unknown) => String(m).toUpperCase())
    : [];

  if (ACTION_ONLY_AUTH_SOURCES.has(dataSource)) {
    // gitlab in DATA_INGESTION mode uses params.personal_access_token
    if (dataSource === "gitlab" && modes.includes("DATA_INGESTION")) {
      return false;
    }
    return true;
  }
  const actionConfig = (connectorState.actionConfig || {}) as Record<string, unknown>;
  const actionParams = (actionConfig.actionParams || {}) as Record<string, unknown>;
  const authKey = String(actionParams.auth_key || "");

  if (
    ["servicenow", "servicenow_federated_search"].includes(dataSource) &&
    (authKey === "ByoOAuth" || authKey === "GoogleManagedOAuth")
  ) {
    return true;
  }

  // V2/V3 BAP Connectors where authorization happens in actionConfig.actionParams
  if (
    [
      "slack",
      "box",
      "salesforce",
      "servicenow",
      "linear",
      "monday",
      "asana",
      "workday",
    ].includes(dataSource) &&
    !modes.includes("DATA_INGESTION") &&
    Boolean(connectorState.actionConfig)
  ) {
    const rawParams = (connectorState.params || {}) as Record<string, unknown>;
    const nonInternalParamKeys = Object.keys(rawParams).filter(
      (k) => !INTERNAL_SYSTEM_KEYS.has(k.toLowerCase()),
    );
    if (
      !connectorState.params ||
      nonInternalParamKeys.length === 0 ||
      authKey === "ByoOAuth" ||
      authKey === "GoogleManagedOAuth"
    ) {
      return true;
    }
  }

  if (
    dataSource === "workday" &&
    !Array.isArray(connectorState.connectorModes)
      ? Boolean(connectorState.actionConfig)
      : dataSource === "workday" &&
        !modes.includes("DATA_INGESTION") &&
        Boolean(connectorState.actionConfig)
  ) {
    return true;
  }
  return false;
};

export const discoverFields = (
  rawConnectorState: unknown,
  includeActions: boolean = true,
): FormField[] => {
  if (!rawConnectorState || typeof rawConnectorState !== "object") return [];
  const connectorState = rawConnectorState as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const fields: FormField[] = [];
  const processedKeys = new Set<string>();

  const rawDataSource = String(connectorState.dataSource || "");
  const dataSource = normalizeDataSource(rawDataSource);
  const isMicrosoft = [
    "sharepoint",
    "onedrive",
    "outlook",
    "teams",
    "entra_id",
    "dynamics365",
    "msft",
  ].includes(dataSource);
  const isAtlassian = ["jira", "confluence"].includes(dataSource);
  const isServiceNow = [
    "servicenow",
    "servicenow_federated_search",
  ].includes(dataSource);

  const modes: string[] = Array.isArray(connectorState.connectorModes)
    ? connectorState.connectorModes.map((m: unknown) => String(m).toUpperCase())
    : [];
  const hasDataIngestion = modes.includes("DATA_INGESTION");

  const params = (connectorState.params || {}) as Record<string, unknown>;
  const actionParams = (connectorState.actionConfig?.actionParams || {}) as Record<string, unknown>;
  const authType = String(
    params.auth_type || params.authType || actionParams.auth_type || "",
  ).toUpperCase();
  const authKey = String(
    actionParams.auth_key || params.auth_key || "",
  );
  const actionOnlyAuth = isActionOnlyAuthConnector(dataSource, connectorState);
  const defaultCredLocation: "params" | "actionParams" = actionOnlyAuth
    ? "actionParams"
    : "params";

  const getLabelAndDesc = (key: string) => {
    switch (key) {
      case "client_id":
        return {
          label: "Client ID (OAuth)",
          desc: "The OAuth 2.0 Client ID (or Consumer Key) for your application.",
        };
      case "client_secret":
        return {
          label: "Client Secret (OAuth)",
          desc: "The OAuth 2.0 Client Secret (or Consumer Secret) redacted by the API.",
        };
      case "refresh_token":
        return {
          label: "Refresh Token (OAuth)",
          desc: "A valid OAuth 2.0 refresh token for offline access.",
        };
      case "tenant_id":
        return {
          label: "Tenant ID",
          desc: "Microsoft Entra ID (Azure Active Directory) Tenant ID.",
        };
      case "instance_id":
        return {
          label: isMicrosoft
            ? "Tenant ID"
            : dataSource === "jira"
              ? "Jira Cloud ID (Instance ID)"
              : "Instance ID / Cloud ID",
          desc: isMicrosoft
            ? "Microsoft Entra ID Tenant ID."
            : "Atlassian Cloud ID (UUID) or target instance identifier.",
        };
      case "instance_uri":
        return {
          label: "Instance URI",
          desc: "The base URL of the service instance (e.g. https://your-org.atlassian.net or https://instance.service-now.com).",
        };
      case "endpoint_uri":
      case "mcp_endpoint":
        return {
          label: key === "mcp_endpoint" ? "MCP Endpoint" : "Endpoint URI",
          desc: "The target server or MCP endpoint URL.",
        };
      case "username":
      case "user_account":
        return {
          label:
            key === "user_account"
              ? isServiceNow
                ? "User Account (ServiceNow User ID)"
                : "User Account"
              : "Username",
          desc: "Service account or integration username for authentication.",
        };
      case "password":
        return {
          label: "Password",
          desc: "Service account or integration password (redacted by the API).",
        };
      case "auth_uri":
        return {
          label: "Auth URI (OAuth)",
          desc: "OAuth 2.0 Authorization endpoint URI (e.g. https://instance.service-now.com/oauth_auth.do).",
        };
      case "token_uri":
      case "token_endpoint_uri":
        return {
          label: "Token URI (OAuth)",
          desc: "OAuth 2.0 Token endpoint URI (e.g. https://instance.service-now.com/oauth_token.do).",
        };
      case "api_key":
      case "api_token":
      case "personal_access_token":
      case "access_token":
      case "auth_token":
      case "token":
        return {
          label: "API Key / Token",
          desc: "API key or personal access token for authenticating requests (redacted by the API).",
        };
      case "private_key":
        return {
          label: "Private Key",
          desc: "Private key for service authentication (redacted by the API).",
        };
      default: {
        const formatted = key
          .replace(/_/g, " ")
          .replace(/([A-Z])/g, " $1")
          .trim();
        const label = formatted.charAt(0).toUpperCase() + formatted.slice(1);
        return { label, desc: "" };
      }
    }
  };

  // Shared keys that exist in both params and actionParams should only be prompted once under "params"
  // and synchronized into actionParams during buildDuplicatePayload — UNLESS the connector is action-only
  // or the key is an action-only credential (e.g., Confluence Basic Auth or GitHub PAT).
  const SHARED_CREDENTIAL_KEYS = new Set([
    "client_id",
    "client_secret",
    "tenant_id",
    "instance_id",
    "azure_tenant",
    "instance_uri",
    "endpoint_uri",
    "username",
    "user_account",
    "password",
    "api_key",
    "api_token",
    "personal_access_token",
  ]);

  const isActionOnlySpecificField = (
    key: string,
    loc: "params" | "actionParams",
  ): boolean => {
    if (actionOnlyAuth) return true;
    if (
      dataSource === "confluence" &&
      loc === "actionParams" &&
      (key === "user_account" || key === "password" || key === "username")
    ) {
      return true;
    }
    if (
      dataSource === "github" &&
      loc === "actionParams" &&
      key === "personal_access_token"
    ) {
      return true;
    }
    if (
      dataSource === "docusign" &&
      loc === "actionParams" &&
      (key === "account_id" || key === "gateway_host")
    ) {
      return true;
    }
    if (
      dataSource === "hubspot" &&
      loc === "actionParams" &&
      (key === "client_id" || key === "client_secret")
    ) {
      return true;
    }
    return false;
  };

  const addField = (
    key: string,
    val: unknown,
    location: "params" | "actionParams",
  ) => {
    if (INTERNAL_SYSTEM_KEYS.has(key)) {
      // Exception: Workday v1 ingestion requires refresh_token
      if (
        !(
          dataSource === "workday" &&
          hasDataIngestion &&
          key === "refresh_token"
        )
      ) {
        return;
      }
    }

    // Skip rendering redundant Microsoft/Atlassian tenant/instance fields
    if (
      isMicrosoft &&
      (key === "instance_id" ||
        key === "azure_tenant" ||
        (key === "tenant_id" &&
          location === "actionParams" &&
          dataSource !== "msft"))
    ) {
      return;
    }
    if (isAtlassian && key === "instance_id" && location === "actionParams") {
      return;
    }

    // Deduplicate shared credential keys across params and actionParams
    const targetLocation: "params" | "actionParams" = isActionOnlySpecificField(
      key,
      location,
    )
      ? "actionParams"
      : location === "actionParams" && SHARED_CREDENTIAL_KEYS.has(key)
        ? "params"
        : location;

    const uniqueKey = `${targetLocation}.${key}`;
    if (processedKeys.has(uniqueKey)) return;
    processedKeys.add(uniqueKey);

    const { label, desc } = getLabelAndDesc(key);

    let type: "text" | "password" | "textarea" | "checkbox" = "text";
    let isRequired = false;
    let defaultValue = val;

    if (isSecretKey(key)) {
      type = "password";
      isRequired = true;
      defaultValue = ""; // Always clear secrets so user provides fresh credentials
    } else if (typeof val === "boolean") {
      type = "checkbox";
    } else if (
      [
        "client_id",
        "tenant_id",
        "instance_id",
        "instance_uri",
        "endpoint_uri",
        "mcp_endpoint",
        "username",
        "user_account",
        "host_address",
        "tenant_alias",
        "account_id",
        "gateway_host",
      ].includes(key)
    ) {
      isRequired = true;
      if (isRedactedOrPlaceholder(val)) {
        defaultValue = "";
      }
    } else if (isRedactedOrPlaceholder(val)) {
      defaultValue = "";
    }

    fields.push({
      key,
      label,
      type,
      location: targetLocation,
      defaultValue,
      required: isRequired,
      description: desc,
    });
  };

  const upsertField = (
    key: string,
    location: "params" | "actionParams",
    rawDefault?: unknown,
    requiredOverride: boolean = true,
  ) => {
    const existing = fields.find(
      (f) =>
        f.key === key &&
        (f.location === location ||
          (!isActionOnlySpecificField(key, location) && f.key === key)),
    );
    if (existing) return;
    const { label, desc } = getLabelAndDesc(key);
    const secret = isSecretKey(key);
    fields.push({
      key,
      label,
      type: secret ? "password" : "text",
      location,
      defaultValue:
        secret || isRedactedOrPlaceholder(rawDefault)
          ? ""
          : (rawDefault ?? ""),
      required: requiredOverride,
      description: desc,
    });
  };

  if (connectorState.params) {
    Object.entries(connectorState.params).forEach(([k, v]) =>
      addField(k, v, "params"),
    );
  }

  if (includeActions && connectorState.actionConfig?.actionParams) {
    Object.entries(connectorState.actionConfig.actionParams).forEach(([k, v]) =>
      addField(k, v, "actionParams"),
    );
  }

  // Handle custom_mcp auth_key modes explicitly
  if (dataSource === "custom_mcp") {
    const mcpUri =
      actionParams.instance_uri ||
      params.instance_uri ||
      connectorState.destinationConfigs?.[0]?.destinations?.[0]?.host ||
      "";
    upsertField("instance_uri", "actionParams", mcpUri);
    if (authKey === "api_token") {
      upsertField("api_token", "actionParams", "");
    } else if (authKey === "bearer_token") {
      upsertField("auth_token", "actionParams", "");
    } else if (authKey === "service_account") {
      upsertField("auth_uri", "actionParams", actionParams.auth_uri || "");
      upsertField("token_uri", "actionParams", actionParams.token_uri || "");
    } else {
      // Default OAuth for custom_mcp
      if (actionParams.mcp_endpoint || params.mcp_endpoint) {
        upsertField(
          "mcp_endpoint",
          "actionParams",
          actionParams.mcp_endpoint || params.mcp_endpoint || "",
        );
      }
      if (actionParams.auth_uri || params.auth_uri) {
        upsertField(
          "auth_uri",
          "actionParams",
          actionParams.auth_uri || params.auth_uri || "",
        );
      }
      if (actionParams.token_uri || params.token_uri) {
        upsertField(
          "token_uri",
          "actionParams",
          actionParams.token_uri || params.token_uri || "",
        );
      }
      upsertField(
        "client_id",
        "actionParams",
        actionParams.client_id || params.client_id || "",
      );
      upsertField("client_secret", "actionParams", "");
    }
    return fields;
  }

  // Handle looker_mcp explicitly
  if (dataSource === "looker_mcp") {
    upsertField(
      "instance_uri",
      "actionParams",
      actionParams.instance_uri ||
        params.instance_uri ||
        connectorState.destinationConfigs?.[0]?.destinations?.[0]?.host ||
        "",
    );
    upsertField(
      "client_id",
      "actionParams",
      actionParams.client_id || params.client_id || "",
    );
    upsertField("client_secret", "actionParams", "");
    return fields;
  }

  // 1P / Partner MCP connectors with no OAuth client secret
  if (
    [
      "bigquery_mcp",
      "geminidataanalytics_mcp",
      "google_cloud_cli",
      "spanner",
      "cloudsql",
      "alloydb",
      "firestore",
      "bigquery",
      "gcs",
      "gdrive",
      "gmail",
      "gcp_people",
      "google_workspace",
      "custom_connector",
      "atlassian_rovo",
      "daloopa",
      "airops",
      "dice",
    ].includes(dataSource)
  ) {
    return fields;
  }

  // Developer & Productivity & Enterprise SaaS specific rules
  if (dataSource === "notion") {
    upsertField("api_token", defaultCredLocation, "");
    return fields;
  }

  if (dataSource === "gitlab") {
    if (hasDataIngestion) {
      upsertField("personal_access_token", "params", "");
    } else {
      upsertField(
        "instance_uri",
        "actionParams",
        actionParams.instance_uri ||
          params.instance_uri ||
          connectorState.destinationConfigs?.[0]?.destinations?.[0]?.host ||
          "",
      );
      upsertField("api_token", "actionParams", "");
    }
    return fields;
  }

  if (dataSource === "coda") {
    const tokenKey =
      "auth_token" in params || "auth_token" in actionParams
        ? "auth_token"
        : "api_token";
    upsertField(tokenKey, defaultCredLocation, "");
    return fields;
  }

  if (dataSource === "trello") {
    upsertField("api_key", defaultCredLocation, "");
    upsertField("token", defaultCredLocation, "");
    return fields;
  }

  if (["clay", "gong", "clerk"].includes(dataSource)) {
    upsertField("api_key", "actionParams", "");
    return fields;
  }

  if (dataSource === "pagerduty") {
    upsertField("api_key", "params", "");
    return fields;
  }

  if (dataSource === "monday") {
    if (authKey === "OAuth" || authKey === "ByoOAuth") {
      upsertField(
        "client_id",
        defaultCredLocation,
        params.client_id || actionParams.client_id || "",
      );
      upsertField("client_secret", defaultCredLocation, "");
    } else {
      upsertField("api_token", defaultCredLocation, "");
    }
    return fields;
  }

  if (dataSource === "linear") {
    if (authKey === "OAuth" || authKey === "ByoOAuth") {
      upsertField(
        "client_id",
        defaultCredLocation,
        params.client_id || actionParams.client_id || "",
      );
      upsertField("client_secret", defaultCredLocation, "");
    } else {
      upsertField("api_key", defaultCredLocation, "");
    }
    return fields;
  }

  if (dataSource === "asana") {
    if (
      authKey === "OAuth" ||
      authKey === "ByoOAuth" ||
      authType.startsWith("OAUTH")
    ) {
      upsertField(
        "client_id",
        defaultCredLocation,
        params.client_id || actionParams.client_id || "",
      );
      upsertField("client_secret", defaultCredLocation, "");
    } else {
      upsertField("access_token", "params", "");
    }
    return fields;
  }

  if (dataSource === "shopify") {
    upsertField(
      "instance_uri",
      "params",
      params.instance_uri || actionParams.instance_uri || "",
    );
    if (authKey === "OAuth" || authKey === "ByoOAuth") {
      upsertField(
        "client_id",
        "params",
        params.client_id || actionParams.client_id || "",
      );
      upsertField("client_secret", "params", "");
    } else {
      upsertField("access_token", "params", "");
    }
    return fields;
  }

  if (dataSource === "hubspot") {
    if (hasDataIngestion || modes.includes("FEDERATED")) {
      upsertField(
        "instance_uri",
        "params",
        params.instance_uri || actionParams.instance_uri || "",
      );
      upsertField("access_token", "params", "");
    }
    if (includeActions && (modes.includes("ACTIONS") || connectorState.actionConfig)) {
      upsertField(
        "client_id",
        "actionParams",
        actionParams.client_id || params.client_id || "",
      );
      upsertField("client_secret", "actionParams", "");
    }
    return fields;
  }

  if (dataSource === "aem") {
    upsertField(
      "instance_uri",
      "params",
      params.instance_uri || actionParams.instance_uri || "",
    );
    upsertField(
      "client_id",
      "params",
      params.client_id || actionParams.client_id || "",
    );
    upsertField("client_secret", "params", "");
    upsertField("private_key", "params", "");
    return fields;
  }

  if (dataSource === "oraclefusion") {
    upsertField(
      "instance_uri",
      "params",
      params.instance_uri || actionParams.instance_uri || "",
    );
    upsertField(
      "user_account",
      "params",
      params.user_account || actionParams.user_account || "",
    );
    upsertField("password", "params", "");
    return fields;
  }

  if (dataSource === "peoplesoft") {
    upsertField(
      "instance_uri",
      "params",
      params.instance_uri ||
        actionParams.instance_uri ||
        connectorState.destinationConfigs?.[0]?.destinations?.[0]?.host ||
        "",
    );
    upsertField(
      "user_account",
      "params",
      params.user_account || actionParams.user_account || "",
    );
    upsertField("password", "params", "");
    return fields;
  }

  if (dataSource === "workday") {
    if (hasDataIngestion) {
      upsertField("client_id", "params", params.client_id || "");
      upsertField("client_secret", "params", "");
      upsertField("refresh_token", "params", "");
      upsertField(
        "token_endpoint_uri",
        "params",
        params.token_endpoint_uri || "",
      );
      upsertField(
        "query_service_endpoint_uri",
        "params",
        params.query_service_endpoint_uri || "",
      );
    } else {
      const hostDefault =
        actionParams.host_address ||
        params.host_address ||
        connectorState.destinationConfigs?.[0]?.destinations?.[0]?.host ||
        "";
      upsertField("host_address", "actionParams", hostDefault);
      upsertField(
        "tenant_alias",
        "actionParams",
        actionParams.tenant_alias || params.tenant_alias || "",
      );
      upsertField(
        "client_id",
        "actionParams",
        actionParams.client_id || params.client_id || "",
      );
      upsertField("client_secret", "actionParams", "");
    }
    return fields;
  }

  if (dataSource === "docusign") {
    upsertField(
      "client_id",
      "params",
      params.client_id || actionParams.client_id || "",
    );
    upsertField("client_secret", "params", "");
    if (includeActions && (modes.includes("ACTIONS") || connectorState.actionConfig)) {
      upsertField(
        "account_id",
        "actionParams",
        actionParams.account_id || params.account_id || "",
      );
      upsertField(
        "gateway_host",
        "actionParams",
        actionParams.gateway_host || params.gateway_host || "",
      );
    }
    return fields;
  }

  if (dataSource === "oracle_netsuite") {
    upsertField(
      "instance_id",
      "actionParams",
      actionParams.instance_id || params.instance_id || "",
    );
    upsertField(
      "client_id",
      "actionParams",
      actionParams.client_id || params.client_id || "",
    );
    upsertField("client_secret", "actionParams", "");
    return fields;
  }

  if (dataSource === "concur") {
    upsertField(
      "instance_uri",
      "actionParams",
      actionParams.instance_uri || params.instance_uri || "",
    );
    upsertField(
      "client_id",
      "actionParams",
      actionParams.client_id || params.client_id || "",
    );
    upsertField("client_secret", "actionParams", "");
    return fields;
  }

  if (["airtable", "miro", "canva"].includes(dataSource)) {
    if (authKey !== "GoogleManagedOAuth") {
      upsertField(
        "client_id",
        "actionParams",
        actionParams.client_id || params.client_id || "",
      );
      upsertField("client_secret", "actionParams", "");
    }
    return fields;
  }

  if (dataSource === "github") {
    upsertField(
      "instance_uri",
      "params",
      params.instance_uri || actionParams.instance_uri || "",
    );
    upsertField(
      "client_id",
      "params",
      params.client_id || actionParams.client_id || "",
    );
    upsertField("client_secret", "params", "");
    if (
      includeActions &&
      ("personal_access_token" in actionParams ||
        authType === "PAT" ||
        authKey === "personal_access_token" ||
        authKey === "PAT")
    ) {
      upsertField("personal_access_token", "actionParams", "");
    }
    return fields;
  }

  const isApiKeyAuth = ["API_KEY", "PAT", "TOKEN"].includes(authType);
  const isNoAuth = authType === "NO_AUTH";
  const isBasicActionAuth =
    String(actionParams.auth_type || "").toUpperCase() === "BASIC_AUTH" ||
    String(actionParams.auth_type || "").toUpperCase() === "BASIC";

  // Determine if OAuth Client ID + Client Secret are needed
  const needsOAuth =
    !isApiKeyAuth &&
    !isNoAuth &&
    authKey !== "GoogleManagedOAuth" &&
    !(dataSource === "jira" && isBasicActionAuth && !params.client_id) &&
    (isMicrosoft ||
      isAtlassian ||
      isServiceNow ||
      authType.startsWith("OAUTH") ||
      Boolean(connectorState.actionConfig) ||
      [
        "slack",
        "box",
        "dropbox",
        "salesforce",
        "zendesk",
        "smartsheet",
        "figma",
        "wrike",
        "s4hana",
        "box_mcp",
        "box_custom_mcp",
        "atlan-mcp",
      ].includes(dataSource));

  if (needsOAuth) {
    // 1. Client ID
    if (!fields.some((f) => f.key === "client_id")) {
      const { label, desc } = getLabelAndDesc("client_id");
      const rawClientId = params.client_id || actionParams.client_id || "";
      fields.push({
        key: "client_id",
        label,
        type: "text",
        location: defaultCredLocation,
        defaultValue: isRedactedOrPlaceholder(rawClientId) ? "" : rawClientId,
        required: true,
        description: desc,
      });
    }
    // 2. Client Secret
    if (!fields.some((f) => f.key === "client_secret")) {
      const { label, desc } = getLabelAndDesc("client_secret");
      fields.push({
        key: "client_secret",
        label,
        type: "password",
        location: defaultCredLocation,
        defaultValue: "",
        required: true,
        description: desc,
      });
    }
  }

  // API Key / Token connectors when configured with API_KEY or PAT
  if (
    isApiKeyAuth &&
    !fields.some((f) =>
      ["api_key", "api_token", "personal_access_token"].includes(f.key),
    )
  ) {
    const tokenKey =
      "api_token" in params
        ? "api_token"
        : "personal_access_token" in params
          ? "personal_access_token"
          : "api_key";
    const { label, desc } = getLabelAndDesc(tokenKey);
    fields.push({
      key: tokenKey,
      label,
      type: "password",
      location: defaultCredLocation,
      defaultValue: "",
      required: true,
      description: desc,
    });
  }

  // ServiceNow / Basic / Atlassian Basic Auth credentials
  const isServiceNowV3OAuth =
    isServiceNow &&
    (authKey === "ByoOAuth" || authKey === "GoogleManagedOAuth");
  const isConfluenceWithActions =
    dataSource === "confluence" &&
    includeActions &&
    (isBasicActionAuth ||
      "user_account" in actionParams ||
      "password" in actionParams);
  const isJiraBasicAuth =
    dataSource === "jira" &&
    includeActions &&
    (isBasicActionAuth ||
      "user_account" in actionParams ||
      "password" in actionParams);

  const needsUsernamePassword =
    (isServiceNow && !isServiceNowV3OAuth) ||
    isConfluenceWithActions ||
    isJiraBasicAuth ||
    ["BASIC", "BASIC_AUTH", "PASSWORD"].includes(authType) ||
    Boolean(
      params.username ||
        actionParams.username ||
        params.user_account ||
        actionParams.user_account,
    );

  if (needsUsernamePassword) {
    const basicLocation: "params" | "actionParams" =
      isConfluenceWithActions || isJiraBasicAuth
        ? "actionParams"
        : defaultCredLocation;
    const userKey =
      "username" in params || "username" in actionParams
        ? "username"
        : isServiceNow ||
            isConfluenceWithActions ||
            isJiraBasicAuth ||
            "user_account" in params ||
            "user_account" in actionParams
          ? "user_account"
          : "username";
    if (!fields.some((f) => f.key === "username" || f.key === "user_account")) {
      const { label, desc } = getLabelAndDesc(userKey);
      const rawUser =
        params[userKey] ||
        actionParams[userKey] ||
        params.user_account ||
        params.username ||
        actionParams.user_account ||
        actionParams.username ||
        "";
      fields.push({
        key: userKey,
        label,
        type: "text",
        location: basicLocation,
        defaultValue: isRedactedOrPlaceholder(rawUser) ? "" : rawUser,
        required: true,
        description: desc,
      });
    }
    if (!fields.some((f) => f.key === "password")) {
      const { label, desc } = getLabelAndDesc("password");
      fields.push({
        key: "password",
        label,
        type: "password",
        location: basicLocation,
        defaultValue: "",
        required: true,
        description: desc,
      });
    }
  }

  // Tenant ID (for Microsoft SaaS & Entra ID)
  // For outlook, do not prompt for tenant_id unless tenant_id/instance_id/azure_tenant already exists on source.
  // For onedrive, only prompt for tenant_id when hasDataIngestion is true or tenant_id already exists on source.
  const hasSourceTenant = Boolean(
    params.tenant_id ||
      params.instance_id ||
      params.azure_tenant ||
      actionParams.tenant_id ||
      actionParams.azure_tenant ||
      actionParams.instance_id,
  );
  const shouldDiscoverTenant =
    isMicrosoft &&
    (dataSource !== "outlook" || hasSourceTenant) &&
    (dataSource !== "onedrive" || hasDataIngestion || hasSourceTenant);

  if (shouldDiscoverTenant && !fields.some((f) => f.key === "tenant_id")) {
    const { label, desc } = getLabelAndDesc("tenant_id");
    const entityParams = connectorState.entities?.[0]?.params;
    const resolvedDefault =
      params.tenant_id ||
      params.instance_id ||
      params.azure_tenant ||
      actionParams.tenant_id ||
      actionParams.azure_tenant ||
      actionParams.instance_id ||
      entityParams?.tenant_id ||
      entityParams?.instance_id ||
      "";
    fields.push({
      key: "tenant_id",
      label,
      type: "text",
      location: dataSource === "msft" ? "actionParams" : "params",
      defaultValue: isRedactedOrPlaceholder(resolvedDefault)
        ? ""
        : resolvedDefault,
      required: true,
      description: desc,
    });
  }

  // Instance ID (for Atlassian SaaS - Jira always needs instance_id; Confluence if present or Atlassian)
  if (
    (dataSource === "jira" ||
      (dataSource === "confluence" &&
        ("instance_id" in params || "instance_id" in actionParams))) &&
    !fields.some((f) => f.key === "instance_id")
  ) {
    const { label, desc } = getLabelAndDesc("instance_id");
    const resolvedDefault =
      params.instance_id || actionParams.instance_id || "";
    fields.push({
      key: "instance_id",
      label,
      type: "text",
      location: "params",
      defaultValue: isRedactedOrPlaceholder(resolvedDefault)
        ? ""
        : resolvedDefault,
      required: true,
      description: desc,
    });
  }

  // Instance URI / Endpoint URI fallback for SaaS & MCP connectors
  const hasSourceInstanceUri = Boolean(
    params.instance_uri ||
      params.endpoint_uri ||
      actionParams.instance_uri ||
      actionParams.endpoint_uri,
  );
  const isSlackWithUri =
    dataSource === "slack" &&
    (hasDataIngestion || hasSourceInstanceUri || rawDataSource === "slack_federated_search");
  const isOneDriveWithUri =
    dataSource === "onedrive" && (hasDataIngestion || hasSourceInstanceUri);

  const needsInstanceUri =
    [
      "sharepoint",
      "dynamics365",
      "jira",
      "confluence",
      "servicenow",
      "servicenow_federated_search",
      "salesforce",
      "zendesk",
      "teams",
      "s4hana",
      "box_mcp",
      "box_custom_mcp",
      "atlan-mcp",
    ].includes(dataSource) ||
    isSlackWithUri ||
    isOneDriveWithUri;

  if (
    needsInstanceUri &&
    !fields.some((f) => f.key === "instance_uri" || f.key === "endpoint_uri")
  ) {
    const uriKey = "endpoint_uri" in params ? "endpoint_uri" : "instance_uri";
    const { label, desc } = getLabelAndDesc(uriKey);
    let resolvedDefault =
      params[uriKey] ||
      params.instance_uri ||
      params.endpoint_uri ||
      actionParams.instance_uri ||
      actionParams.endpoint_uri ||
      (dataSource === "teams" ? "https://graph.microsoft.com" : "");
    if (!resolvedDefault && connectorState.destinationConfigs?.length > 0) {
      const dest = connectorState.destinationConfigs[0]?.destinations?.[0];
      if (dest?.host) {
        resolvedDefault = dest.host;
      }
    }
    fields.push({
      key: uriKey,
      label,
      type: "text",
      location: defaultCredLocation,
      defaultValue: isRedactedOrPlaceholder(resolvedDefault)
        ? ""
        : resolvedDefault,
      required: true,
      description: desc,
    });
  }

  return fields;
};

export interface BuildDuplicatePayloadArgs {
  sourceConnectorState: unknown;
  targetCollectionId: string;
  targetCollectionDisplayName: string;
  fieldValues: Record<string, unknown>;
  includeActions: boolean;
}

export function buildDuplicatePayload({
  sourceConnectorState: rawSourceConnectorState,
  targetCollectionId,
  targetCollectionDisplayName,
  fieldValues,
  includeActions,
}: BuildDuplicatePayloadArgs) {
  if (!rawSourceConnectorState || typeof rawSourceConnectorState !== "object") {
    return null;
  }
  const sourceConnectorState = rawSourceConnectorState as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  const dataSource = normalizeDataSource(sourceConnectorState.dataSource);
  const isMicrosoft = [
    "sharepoint",
    "onedrive",
    "outlook",
    "teams",
    "entra_id",
  ].includes(dataSource);
  const isAtlassian = ["jira", "confluence"].includes(dataSource);
  const actionOnlyAuth = isActionOnlyAuthConnector(
    dataSource,
    sourceConnectorState,
  );

  const hasActionInputs = Object.keys(fieldValues).some((k) =>
    k.startsWith("actionParams."),
  );
  const newParams: Record<string, any> = actionOnlyAuth // eslint-disable-line @typescript-eslint/no-explicit-any
    ? {}
    : { ...sourceConnectorState.params };
  const newActionParams: Record<string, any> | undefined = // eslint-disable-line @typescript-eslint/no-explicit-any
    sourceConnectorState.actionConfig?.actionParams ||
    (includeActions && (sourceConnectorState.actionConfig || actionOnlyAuth || hasActionInputs))
      ? { ...(sourceConnectorState.actionConfig?.actionParams || {}) }
      : undefined;

  // When actionOnlyAuth is true, preserve auth_key and auth_type from sourceConnectorState.params if missing in newActionParams
  if (actionOnlyAuth && newActionParams) {
    if (!newActionParams.auth_key && sourceConnectorState.params?.auth_key) {
      newActionParams.auth_key = sourceConnectorState.params.auth_key;
    }
    if (!newActionParams.auth_type && (sourceConnectorState.params?.auth_type || sourceConnectorState.params?.authType)) {
      newActionParams.auth_type = sourceConnectorState.params.auth_type || sourceConnectorState.params.authType;
    }
  }

  // Overwrite with user input values
  Object.entries(fieldValues).forEach(([compoundKey, val]) => {
    const [location, key] = compoundKey.split(".");
    if (location === "params") {
      if (actionOnlyAuth && newActionParams) {
        newActionParams[key] = val;
      } else {
        newParams[key] = val;
      }
    } else if (location === "actionParams" && newActionParams) {
      newActionParams[key] = val;
    }
  });

  // Never allow Confluence Basic Auth (user_account/password) or GitHub PAT to leak into top-level params
  if (dataSource === "confluence") {
    if (newActionParams) {
      if (newParams.user_account && !newActionParams.user_account) {
        newActionParams.user_account = newParams.user_account;
      }
      if (newParams.password && !newActionParams.password) {
        newActionParams.password = newParams.password;
      }
    }
    delete newParams.user_account;
    delete newParams.username;
    delete newParams.password;
  }
  if (dataSource === "github") {
    if (newActionParams && newParams.personal_access_token) {
      newActionParams.personal_access_token = newParams.personal_access_token;
    }
    delete newParams.personal_access_token;
  }

  const topTenantVal =
    newParams.tenant_id ||
    newParams.instance_id ||
    newParams.azure_tenant ||
    newActionParams?.tenant_id;

  const cleanEntities =
    sourceConnectorState.entities?.map((e: Record<string, unknown>) => {
      const entityParams = e.params as Record<string, unknown> | undefined;
      const rest = { ...e };
      delete rest.dataStore;
      delete rest.params;
      const newEntityParams = entityParams ? { ...entityParams } : {};

      if (isMicrosoft) {
        const tenantVal =
          newEntityParams.tenant_id ||
          newEntityParams.instance_id ||
          newEntityParams.azure_tenant ||
          topTenantVal;
        if (tenantVal) {
          if (["sharepoint", "onedrive", "entra_id"].includes(dataSource)) {
            newEntityParams.tenant_id = tenantVal;
            delete newEntityParams.instance_id;
            delete newEntityParams.azure_tenant;
          } else {
            newEntityParams.instance_id = tenantVal;
            delete newEntityParams.tenant_id;
            delete newEntityParams.azure_tenant;
          }
        }
      }

      return {
        ...rest,
        ...(Object.keys(newEntityParams).length > 0 || entityParams
          ? { params: newEntityParams }
          : {}),
      };
    }) || [];

  // Synchronize shared credentials into actionParams whenever actionConfig is present
  if (newActionParams && !actionOnlyAuth) {
    for (const sharedKey of [
      "client_id",
      "client_secret",
      "instance_uri",
      "endpoint_uri",
      "username",
      "user_account",
      "password",
      "api_key",
      "api_token",
      "access_token",
      "auth_token",
      "personal_access_token",
      "tenant_id",
      "instance_id",
    ]) {
      // Do not copy Confluence or GitHub action-only secrets or HubSpot params into wrong places
      if (
        dataSource === "confluence" &&
        (sharedKey === "user_account" ||
          sharedKey === "username" ||
          sharedKey === "password")
      ) {
        continue;
      }
      if (dataSource === "hubspot" && sharedKey === "access_token") {
        continue;
      }

      const isKnownActionCred =
        sharedKey === "client_id" ||
        sharedKey === "client_secret" ||
        sharedKey === "instance_uri" ||
        sharedKey === "endpoint_uri" ||
        ((sharedKey === "user_account" || sharedKey === "username" || sharedKey === "password") &&
          ["servicenow", "servicenow_federated_search", "peoplesoft", "oraclefusion"].includes(dataSource)) ||
        ((sharedKey === "api_key" || sharedKey === "api_token") &&
          ["pagerduty", "monday", "linear", "shopify", "coda"].includes(dataSource)) ||
        ((sharedKey === "access_token" || sharedKey === "auth_token") &&
          ["asana", "shopify", "slack"].includes(dataSource)) ||
        (sharedKey === "tenant_id" && ["sharepoint", "onedrive"].includes(dataSource)) ||
        (sharedKey === "instance_id" && ["jira", "oracle_netsuite"].includes(dataSource));

      if (
        newParams[sharedKey] !== undefined &&
        newParams[sharedKey] !== "" &&
        (sharedKey in newActionParams || isKnownActionCred)
      ) {
        newActionParams[sharedKey] = newParams[sharedKey];
      }
    }
  }

  // Preserve mcp_endpoint relative path on looker_mcp / bigquery_mcp / geminidataanalytics_mcp
  if (
    ["looker_mcp", "bigquery_mcp", "geminidataanalytics_mcp"].includes(
      dataSource,
    ) &&
    newActionParams
  ) {
    const origEndpoint =
      sourceConnectorState.actionConfig?.actionParams?.mcp_endpoint;
    if (
      typeof newActionParams.mcp_endpoint === "string" &&
      /^https?:\/\//i.test(newActionParams.mcp_endpoint)
    ) {
      if (origEndpoint && !/^https?:\/\//i.test(String(origEndpoint))) {
        newActionParams.mcp_endpoint = origEndpoint;
      } else {
        delete newActionParams.mcp_endpoint;
      }
    }
  }

  // ServiceNow actionParams defaults (auth_key="OAuth", auth_type="OAUTH", auth_uri, token_uri)
  if (
    ["servicenow", "servicenow_federated_search"].includes(dataSource) &&
    newActionParams
  ) {
    newActionParams.auth_key = newActionParams.auth_key || "OAuth";
    newActionParams.auth_type = newActionParams.auth_type || "OAUTH";
    const instanceUri = String(
      newActionParams.instance_uri || newParams.instance_uri || "",
    )
      .trim()
      .replace(/\/+$/, "");
    if (instanceUri) {
      newActionParams.instance_uri = instanceUri;
      if (
        newActionParams.auth_key !== "ByoOAuth" &&
        newActionParams.auth_key !== "GoogleManagedOAuth"
      ) {
        newActionParams.auth_uri =
          newActionParams.auth_uri || `${instanceUri}/oauth_auth.do`;
        newActionParams.token_uri =
          newActionParams.token_uri || `${instanceUri}/oauth_token.do`;
      }
    }
  }

  // 1. Microsoft-specific cross-mapping rules
  if (isMicrosoft) {
    if (newActionParams) {
      if (["outlook", "onedrive", "sharepoint"].includes(dataSource)) {
        newActionParams.o365_environment_type =
          newActionParams.o365_environment_type || "com";
        newActionParams.azure_environment =
          newActionParams.azure_environment || "GLOBAL";
        newActionParams.auth_type = newActionParams.auth_type || "OAUTH";
      }
    }

    const tenantVal =
      newParams.tenant_id || newParams.instance_id || newParams.azure_tenant;
    if (tenantVal) {
      if (newActionParams) {
        if (dataSource === "sharepoint") {
          newActionParams.tenant_id = tenantVal;
          delete newActionParams.instance_id;
          delete newActionParams.azure_tenant;
        } else if (dataSource === "onedrive") {
          newActionParams.tenant_id = tenantVal;
          newActionParams.azure_tenant = tenantVal;
          delete newActionParams.instance_id;
        } else {
          newActionParams.azure_tenant = tenantVal;
          newActionParams.instance_id = tenantVal;
          delete newActionParams.tenant_id;
        }
      }

      if (["sharepoint", "onedrive", "entra_id", "teams"].includes(dataSource)) {
        newParams.tenant_id = tenantVal;
        delete newParams.instance_id;
        delete newParams.azure_tenant;
      } else {
        newParams.instance_id = tenantVal;
        delete newParams.tenant_id;
        delete newParams.azure_tenant;
      }

      // Auto-update Microsoft auth_uri and token_uri when tenant_id changes
      const updateMicrosoftUri = (uri: unknown) => {
        if (typeof uri === "string" && uri.includes("login.microsoftonline.com/")) {
          return uri.replace(
            /login\.microsoftonline\.com\/[^/]+/,
            `login.microsoftonline.com/${tenantVal}`,
          );
        }
        return uri;
      };

      if (newParams.auth_uri) {
        newParams.auth_uri = updateMicrosoftUri(newParams.auth_uri);
      }
      if (newParams.token_uri) {
        newParams.token_uri = updateMicrosoftUri(newParams.token_uri);
      }
      if (newActionParams?.auth_uri) {
        newActionParams.auth_uri = updateMicrosoftUri(newActionParams.auth_uri);
      }
      if (newActionParams?.token_uri) {
        newActionParams.token_uri = updateMicrosoftUri(newActionParams.token_uri);
      }
    }

    if (["outlook", "teams", "entra_id"].includes(dataSource)) {
      newParams.auth_type = newParams.auth_type || "OAUTH_TWO_LEGGED";
    }

    if (dataSource === "sharepoint") {
      newParams.o365_environment_type =
        newParams.o365_environment_type ||
        newActionParams?.o365_environment_type ||
        "com";
      newParams.auth_type = newParams.auth_type || "OAUTH";
    }
  }

  // 2. If Atlassian (Jira/Confluence) connector has actionConfig
  if (isAtlassian && newActionParams) {
    if (newParams.client_id && !newActionParams.client_id) {
      newActionParams.client_id = newParams.client_id;
    }
    if (newParams.client_secret && !newActionParams.client_secret) {
      newActionParams.client_secret = newParams.client_secret;
    }
    if (newParams.instance_id) {
      newActionParams.instance_id = newParams.instance_id;
    }
    if (newParams.instance_uri) {
      newActionParams.instance_uri = newParams.instance_uri;
    }
  }

  // 3. For Microsoft M365 connectors, strictly limit both params and actionParams to allowed keys
  if (["sharepoint", "onedrive", "outlook", "teams"].includes(dataSource)) {
    let allowedParamsKeys: string[] = [];
    let allowedActionParamsKeys: string[] = [];

    if (dataSource === "sharepoint") {
      allowedParamsKeys = [
        "instance_uri",
        "tenant_id",
        "client_id",
        "client_secret",
        "o365_environment_type",
        "embedded_images_enabled",
        "eeeu_enabled",
        "managed_paths_enabled",
        "recursivelyCrawlNestedSites",
        "admin_filter",
        "admin_exclusion_filter",
        "auth_key",
        "auth_type",
        "auth_uri",
        "token_uri",
      ];
      allowedActionParamsKeys = [
        "instance_uri",
        "tenant_id",
        "client_id",
        "client_secret",
        "o365_environment_type",
        "azure_environment",
        "auth_key",
        "auth_type",
        "auth_uri",
        "token_uri",
      ];
    } else if (dataSource === "onedrive") {
      allowedParamsKeys = [
        "client_id",
        "client_secret",
        "tenant_id",
        "instance_uri",
        "picker_config_provider",
        "sync_since",
        "max_qps",
        "decrypt_mip_files",
        "structured_search_filter",
        "structured_exclusion_search_filter",
        "auth_key",
        "auth_uri",
        "token_uri",
      ];
      allowedActionParamsKeys = [
        "client_id",
        "client_secret",
        "tenant_id",
        "azure_tenant",
        "picker_config_provider",
        "instance_uri",
        "auth_key",
        "auth_type",
        "auth_uri",
        "token_uri",
        "o365_environment_type",
        "azure_environment",
      ];
    } else if (dataSource === "outlook") {
      allowedParamsKeys = [
        "client_id",
        "client_secret",
        "instance_id",
        "azure_tenant",
        "include_all_groups",
        "include_all_users",
        "auth_key",
        "auth_type",
        "auth_uri",
        "token_uri",
      ];
      allowedActionParamsKeys = [
        "client_id",
        "client_secret",
        "instance_id",
        "azure_tenant",
        "include_all_groups",
        "include_all_users",
        "auth_key",
        "auth_type",
        "auth_uri",
        "token_uri",
        "o365_environment_type",
        "azure_environment",
      ];
    } else if (dataSource === "teams") {
      allowedParamsKeys = [
        "client_id",
        "client_secret",
        "instance_id",
        "instance_uri",
        "tenant_id",
        "azure_tenant",
        "include_all_groups",
        "include_all_users",
        "domain_url",
        "auth_key",
        "auth_type",
        "auth_uri",
        "token_uri",
      ];
      allowedActionParamsKeys = [
        "client_id",
        "client_secret",
        "instance_id",
        "instance_uri",
        "tenant_id",
        "azure_tenant",
        "include_all_groups",
        "include_all_users",
        "domain_url",
        "auth_key",
        "auth_type",
        "auth_uri",
        "token_uri",
      ];
    }

    Object.keys(newParams).forEach((k) => {
      if (!allowedParamsKeys.includes(k)) {
        delete newParams[k];
      }
    });

    if (newActionParams) {
      Object.keys(newActionParams).forEach((k) => {
        if (!allowedActionParamsKeys.includes(k)) {
          delete newActionParams[k];
        }
      });
    }
  }

  // Strip internal/read-only keys from params and actionParams
  for (const sysKey of [
    "static_ip_enabled",
    "staticIpEnabled",
    "unused_auth_param",
    "p4sa_client_id",
    "admin_auth_credentials_secret_id",
    "bap_version",
    "connector_version",
    "create_bap_connection",
    "use_static_secrets",
    "service_name",
    "secret_id",
  ]) {
    delete newParams[sysKey];
    if (newActionParams) {
      delete newActionParams[sysKey];
    }
  }

  // Normalize BEARER_AUTH_TOKEN to API_TOKEN for API_TOKEN schema connectors
  if (
    [
      "coda",
      "pagerduty",
      "aem",
      "adobe_experience_manager",
      "linear",
      "notion",
      "airtable",
      "github",
    ].includes(dataSource)
  ) {
    if (newParams.auth_type === "BEARER_AUTH_TOKEN") {
      newParams.auth_type = "API_TOKEN";
    }
    if (newActionParams?.auth_type === "BEARER_AUTH_TOKEN") {
      newActionParams.auth_type = "API_TOKEN";
    }
  }

  if (!newParams.refresh_token) {
    delete newParams.refresh_token;
  }
  if (newActionParams && !newActionParams.refresh_token) {
    delete newActionParams.refresh_token;
  }

  // Build or update destinationConfigs when host/URI is present
  const resolvedHostUri = String(
    newParams.instance_uri ||
      newActionParams?.instance_uri ||
      newActionParams?.host_address ||
      newParams.host_address ||
      "",
  ).trim();

  let updatedDestinationConfigs = sourceConnectorState.destinationConfigs;
  if (
    Array.isArray(sourceConnectorState.destinationConfigs) &&
    sourceConnectorState.destinationConfigs.length > 0
  ) {
    updatedDestinationConfigs = sourceConnectorState.destinationConfigs.map(
      (dc: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (
          resolvedHostUri &&
          Array.isArray(dc.destinations) &&
          dc.destinations.length > 0
        ) {
          return {
            ...dc,
            destinations: dc.destinations.map(
              (dest: Record<string, unknown>, idx: number) =>
                idx === 0 ? { ...dest, host: resolvedHostUri } : dest,
            ),
          };
        }
        return dc;
      },
    );
  } else if (includeActions && resolvedHostUri) {
    const authKeyVal = String(
      newActionParams?.auth_key || newParams.auth_key || "",
    );
    if (
      ["servicenow", "servicenow_federated_search"].includes(dataSource) &&
      authKeyVal !== "ByoOAuth" &&
      authKeyVal !== "GoogleManagedOAuth"
    ) {
      updatedDestinationConfigs = [
        { key: "host_url", destinations: [{ host: resolvedHostUri }] },
      ];
    } else if (dataSource === "confluence" || dataSource === "zendesk") {
      updatedDestinationConfigs = [
        { key: "url", destinations: [{ host: resolvedHostUri }] },
      ];
    } else if (dataSource === "gitlab") {
      updatedDestinationConfigs = [
        { key: "base_url", destinations: [{ host: resolvedHostUri }] },
      ];
    } else if (dataSource === "peoplesoft") {
      updatedDestinationConfigs = [
        { key: "host_address", destinations: [{ host: resolvedHostUri }] },
        {
          key: "host_address_search",
          destinations: [{ host: resolvedHostUri }],
        },
      ];
    } else if (dataSource === "workday") {
      updatedDestinationConfigs = [
        { key: "host_address", destinations: [{ host: resolvedHostUri }] },
      ];
    }
  }

  let cleanedActionConfig:
    | {
        actionParams?: Record<string, unknown>;
        createBapConnection?: boolean;
        [key: string]: unknown;
      }
    | undefined = undefined;
  if (
    includeActions &&
    (sourceConnectorState.actionConfig || newActionParams)
  ) {
    const restActionConfig = {
      ...(sourceConnectorState.actionConfig || {}),
    };
    delete restActionConfig.secretId;
    delete restActionConfig.otherSecretId;
    delete restActionConfig.serviceName;
    delete restActionConfig.actionState;

    const shouldDisableBapByDefault =
      dataSource === "custom_mcp" || dataSource === "outlook";
    cleanedActionConfig = {
      ...restActionConfig,
      actionParams: newActionParams,
      createBapConnection: shouldDisableBapByDefault
        ? Boolean(sourceConnectorState.actionConfig?.createBapConnection)
        : (sourceConnectorState.actionConfig?.createBapConnection ?? true),
    };
  }

  return {
    collectionId: targetCollectionId,
    collectionDisplayName: targetCollectionDisplayName,
    dataConnector: {
      dataSource: sourceConnectorState.dataSource,
      staticIpEnabled:
        sourceConnectorState.staticIpEnabled !== undefined
          ? sourceConnectorState.staticIpEnabled
          : sourceConnectorState.params?.static_ip_enabled,
      params: newParams,
      entities: cleanEntities,
      refreshInterval: sourceConnectorState.refreshInterval,
      connectorType: sourceConnectorState.connectorType,
      connectorModes: includeActions
        ? sourceConnectorState.connectorModes
        : (sourceConnectorState.connectorModes || []).filter(
            (m: string) => m !== "ACTIONS",
          ),
      actionConfig: cleanedActionConfig,
      bapConfig:
        includeActions && sourceConnectorState.bapConfig
          ? {
              ...sourceConnectorState.bapConfig,
              enabledActions: (
                sourceConnectorState.bapConfig.enabledActions || []
              ).filter((act: string) => {
                if (dataSource === "onedrive") return act !== "download_file";
                if (dataSource === "sharepoint")
                  return act !== "download_document";
                return true;
              }),
            }
          : undefined,
      ...(sourceConnectorState.dynamicTools
        ? { dynamicTools: sourceConnectorState.dynamicTools }
        : {}),
      destinationConfigs: updatedDestinationConfigs,
    },
  };
}


