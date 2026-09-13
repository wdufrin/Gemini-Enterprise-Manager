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
  defaultValue: any;
  required: boolean;
  description?: string;
}

export const tooltipTexts: Record<string, string> = {
  embedded_images_enabled: "Enables parsing, OCR, and indexing of images embedded inside files (e.g., inline images in Word files or SharePoint pages).",
  eeeu_enabled: "Enables the End-to-End User (EE-EU) security model. When active, queries are executed using the searcher's personal identity, ensuring real-time security trimming based on their specific access permissions.",
  managed_paths_enabled: "If enabled, restricts crawling and indexing to specific SharePoint managed paths (like /sites/ or /teams/) instead of the entire root collection.",
  recursivelyCrawlNestedSites: "If enabled, recursively crawls all nested SharePoint sub-sites underneath the specified site collection or root URI.",
};

export const discoverFields = (connectorState: any, includeActions: boolean = true): FormField[] => {
  if (!connectorState) return [];
  const fields: FormField[] = [];
  const processedKeys = new Set<string>();

  const getLabelAndDesc = (key: string, dataSource: string) => {
    const isMicrosoft = ["sharepoint", "onedrive", "outlook", "teams", "entraid", "entra"].includes(
      dataSource?.toLowerCase(),
    );
    switch (key) {
      case "client_id":
        return {
          label: "Client ID (OAuth)",
          desc: "The OAuth 2.0 Client ID for your application.",
        };
      case "client_secret":
        return {
          label: "Client Secret (OAuth)",
          desc: "The OAuth 2.0 Client Secret.",
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
          label: isMicrosoft ? "Tenant ID" : "Instance ID / Cloud ID",
          desc: isMicrosoft
            ? "Microsoft Entra ID Tenant ID."
            : "Atlassian Cloud ID (UUID) for your Jira/Confluence site.",
        };
      case "instance_uri":
        return {
          label: "Instance URI",
          desc: "The base URL of the service instance (e.g. https://your-org.atlassian.net).",
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

  const addField = (
    key: string,
    val: any,
    location: "params" | "actionParams",
  ) => {
    if (
      ["static_ip_enabled", "staticIpEnabled", "auth_type", "authType"].includes(
        key,
      )
    ) {
      return;
    }

    const ds = connectorState.dataSource?.toLowerCase();
    const isMS = ["sharepoint", "onedrive", "outlook", "teams"].includes(ds);
    const isAtl = ["jira", "confluence"].includes(ds);

    // Skip rendering redundant fields in wizard UI (handled programmatically in finalPayload)
    if (isMS && (key === "instance_id" || key === "azure_tenant" || (key === "tenant_id" && location === "actionParams"))) {
      return;
    }
    if (isAtl && key === "instance_id" && location === "actionParams") {
      return;
    }

    const uniqueKey = `${location}.${key}`;
    if (processedKeys.has(uniqueKey)) return;
    processedKeys.add(uniqueKey);

    const { label, desc } = getLabelAndDesc(key, connectorState.dataSource);

    let type: "text" | "password" | "textarea" | "checkbox" = "text";
    let isRequired = false;
    let defaultValue = val;

    if (
      key.includes("secret") ||
      key.includes("password") ||
      key.includes("key") ||
      key.includes("token")
    ) {
      type = key === "refresh_token" ? "textarea" : "password";
      isRequired = key !== "refresh_token"; // Optional for refresh_token, required for other secret tokens
      defaultValue = ""; // Clear secrets
    } else if (typeof val === "boolean") {
      type = "checkbox";
    } else if (["client_id", "tenant_id", "instance_id"].includes(key)) {
      isRequired = true;
      if (
        typeof val === "string" &&
        (val.includes("[") || val.includes("YOUR_") || val.includes("PROJECT_"))
      ) {
        defaultValue = "";
      }
    }

    fields.push({
      key,
      label,
      type,
      location,
      defaultValue,
      required: isRequired,
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

  const dataSource = connectorState.dataSource?.toLowerCase();

  // Define known credentials per dataSource
  const isMicrosoft = ["sharepoint", "onedrive", "outlook", "teams"].includes(dataSource);
  const isAtlassian = ["jira", "confluence"].includes(dataSource);

  // Base OAuth credentials needed for all SaaS connectors
  const needsOAuth =
    isMicrosoft ||
    isAtlassian ||
    [
      "slack",
      "box",
      "dropbox",
      "salesforce",
      "servicenow",
      "hubspot",
      "monday",
      "shopify",
      "zendesk",
      "notion",
    ].includes(dataSource);

  if (needsOAuth) {
    // 1. Client ID
    if (!fields.some((f) => f.key === "client_id")) {
      const { label, desc } = getLabelAndDesc("client_id", connectorState.dataSource);
      fields.push({
        key: "client_id",
        label,
        type: "text",
        location: "params",
        defaultValue: "",
        required: true,
        description: desc,
      });
    }
    // 2. Client Secret
    if (!fields.some((f) => f.key === "client_secret")) {
      const { label, desc } = getLabelAndDesc("client_secret", connectorState.dataSource);
      fields.push({
        key: "client_secret",
        label,
        type: "password",
        location: "params",
        defaultValue: "",
        required: true,
        description: desc,
      });
    }
    // 3. Refresh Token
    if (
      !fields.some((f) => f.key === "refresh_token") &&
      dataSource !== "custom_mcp"
    ) {
      const { label, desc } = getLabelAndDesc("refresh_token", connectorState.dataSource);
      fields.push({
        key: "refresh_token",
        label,
        type: "textarea",
        location: "params",
        defaultValue: "",
        required: false,
        description: desc,
      });
    }
  }

  // 4. Tenant ID (for Microsoft SaaS)
  if (isMicrosoft && !fields.some((f) => f.key === "tenant_id")) {
    const { label, desc } = getLabelAndDesc("tenant_id", connectorState.dataSource);
    const resolvedDefault =
      connectorState.params?.tenant_id ||
      connectorState.params?.instance_id ||
      connectorState.actionConfig?.actionParams?.azure_tenant ||
      "";
    fields.push({
      key: "tenant_id",
      label,
      type: "text",
      location: "params",
      defaultValue: resolvedDefault,
      required: true,
      description: desc,
    });
  }

  // 5. Instance ID (for Atlassian SaaS)
  if (isAtlassian && !fields.some((f) => f.key === "instance_id")) {
    const { label, desc } = getLabelAndDesc("instance_id", connectorState.dataSource);
    const resolvedDefault =
      connectorState.params?.instance_id ||
      connectorState.actionConfig?.actionParams?.instance_id ||
      "";
    fields.push({
      key: "instance_id",
      label,
      type: "text",
      location: "params",
      defaultValue: resolvedDefault,
      required: true,
      description: desc,
    });
  }

  // 6. Instance URI fallback (for SharePoint/OneDrive/Jira/Confluence)
  const needsInstanceUri = ["sharepoint", "onedrive", "jira", "confluence"].includes(dataSource);
  if (needsInstanceUri && !fields.some((f) => f.key === "instance_uri")) {
    const { label, desc } = getLabelAndDesc("instance_uri", connectorState.dataSource);
    let resolvedDefault = connectorState.params?.instance_uri || "";
    if (!resolvedDefault && connectorState.destinationConfigs?.length > 0) {
      const dest = connectorState.destinationConfigs[0]?.destinations?.[0];
      if (dest?.host) {
        resolvedDefault = dest.host;
      }
    }
    fields.push({
      key: "instance_uri",
      label,
      type: "text",
      location: "params",
      defaultValue: resolvedDefault,
      required: true,
      description: desc,
    });
  }

  return fields;
};

export interface BuildDuplicatePayloadArgs {
  sourceConnectorState: any;
  targetCollectionId: string;
  targetCollectionDisplayName: string;
  fieldValues: Record<string, any>;
  includeActions: boolean;
}

export function buildDuplicatePayload({
  sourceConnectorState,
  targetCollectionId,
  targetCollectionDisplayName,
  fieldValues,
  includeActions,
}: BuildDuplicatePayloadArgs) {
  if (!sourceConnectorState) return null;

  const dataSource = sourceConnectorState.dataSource?.toLowerCase();
  const isMicrosoft = ["sharepoint", "onedrive", "outlook", "teams"].includes(dataSource);
  const isAtlassian = ["jira", "confluence"].includes(dataSource);

  const newParams = { ...sourceConnectorState.params };
  const newActionParams = sourceConnectorState.actionConfig?.actionParams
    ? { ...sourceConnectorState.actionConfig.actionParams }
    : undefined;

  // Overwrite with user input values
  Object.entries(fieldValues).forEach(([compoundKey, val]) => {
    const [location, key] = compoundKey.split(".");
    if (location === "params") {
      newParams[key] = val;
    } else if (location === "actionParams" && newActionParams) {
      newActionParams[key] = val;
    }
  });

  const topTenantVal = newParams.tenant_id || newParams.instance_id || newParams.azure_tenant;

  const cleanEntities =
    sourceConnectorState.entities?.map((e: any) => {
      const { dataStore, params: entityParams, ...rest } = e;
      const newEntityParams = entityParams ? { ...entityParams } : {};
      
      if (isMicrosoft) {
        const tenantVal = newEntityParams.tenant_id || newEntityParams.instance_id || newEntityParams.azure_tenant || topTenantVal;
        if (tenantVal) {
          if (["sharepoint", "onedrive"].includes(dataSource)) {
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
        ...(newEntityParams ? { params: newEntityParams } : {}),
      };
    }) || [];

  // Explicit cross-mapping/duplication rules to satisfy API schemas:

  // 1. If Microsoft connector has actionConfig
  if (isMicrosoft) {
    if (newActionParams) {
      if (newParams.client_id) newActionParams.client_id = newParams.client_id;
      if (newParams.client_secret) newActionParams.client_secret = newParams.client_secret;

      // Add default environment fields for Outlook/OneDrive/SharePoint if missing
      if (["outlook", "onedrive", "sharepoint"].includes(dataSource)) {
        newActionParams.o365_environment_type = newActionParams.o365_environment_type || "com";
        newActionParams.azure_environment = newActionParams.azure_environment || "GLOBAL";
        newActionParams.auth_type = newActionParams.auth_type || "OAUTH";
      }
    }
    
    const tenantVal = newParams.tenant_id || newParams.instance_id || newParams.azure_tenant;
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
      
      // Map to correct top-level params key based on datasource
      if (["sharepoint", "onedrive"].includes(dataSource)) {
        newParams.tenant_id = tenantVal;
        delete newParams.instance_id;
        delete newParams.azure_tenant;
      } else {
        newParams.instance_id = tenantVal;
        delete newParams.tenant_id;
        delete newParams.azure_tenant;
      }
    }

    // Set ingestion auth_type for Outlook/Teams only
    if (["outlook", "teams"].includes(dataSource)) {
      newParams.auth_type = newParams.auth_type || "OAUTH_TWO_LEGGED";
    }

    // Cross-map environment types and auth defaults to top level params for Microsoft crawling connectors
    if (["sharepoint", "onedrive"].includes(dataSource)) {
      newParams.o365_environment_type = newParams.o365_environment_type || newActionParams?.o365_environment_type || "com";
      newParams.auth_type = newParams.auth_type || "OAUTH";
      newParams.refresh_token = newParams.refresh_token !== undefined ? newParams.refresh_token : "";
    }
  }

  // 2. If Atlassian (Jira/Confluence) connector has actionConfig
  if (isAtlassian && newActionParams) {
    if (newParams.client_id) newActionParams.client_id = newParams.client_id;
    if (newParams.client_secret) newActionParams.client_secret = newParams.client_secret;
    if (newParams.instance_id) newActionParams.instance_id = newParams.instance_id;
  }

  // 3. For Microsoft connectors, strictly limit both params and actionParams to allowed keys
  if (isMicrosoft) {
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
        "auth_type",
      ];
      allowedActionParamsKeys = [
        "instance_uri",
        "tenant_id",
        "client_id",
        "client_secret",
        "o365_environment_type",
        "azure_environment",
        "auth_type",
      ];
    } else if (dataSource === "onedrive") {
      allowedParamsKeys = [
        "client_id",
        "client_secret",
        "tenant_id",
        "refresh_token",
        "picker_config_provider",
        "instance_uri",
        "auth_type",
      ];
      allowedActionParamsKeys = [
        "client_id",
        "client_secret",
        "tenant_id",
        "azure_tenant",
        "refresh_token",
        "picker_config_provider",
        "instance_uri",
        "auth_type",
        "o365_environment_type",
        "azure_environment",
      ];
    } else if (dataSource === "outlook") {
      allowedParamsKeys = [
        "client_id",
        "client_secret",
        "instance_id",
        "refresh_token",
        "azure_tenant",
        "include_all_groups",
        "include_all_users",
        "auth_type",
      ];
      allowedActionParamsKeys = [
        "client_id",
        "client_secret",
        "instance_id",
        "refresh_token",
        "azure_tenant",
        "include_all_groups",
        "include_all_users",
        "auth_type",
        "o365_environment_type",
        "azure_environment",
      ];
    } else if (dataSource === "teams") {
      allowedParamsKeys = [
        "client_id",
        "client_secret",
        "instance_id",
        "refresh_token",
        "azure_tenant",
        "include_all_groups",
        "include_all_users",
        "domain_url",
      ];
      allowedActionParamsKeys = [
        "client_id",
        "client_secret",
        "instance_id",
        "refresh_token",
        "azure_tenant",
        "include_all_groups",
        "include_all_users",
        "domain_url",
      ];
    }
    
    // Clean params
    Object.keys(newParams).forEach((k) => {
      if (!allowedParamsKeys.includes(k)) {
        delete newParams[k];
      }
    });

    // Clean actionParams
    if (newActionParams) {
      Object.keys(newActionParams).forEach((k) => {
        if (!allowedActionParamsKeys.includes(k)) {
          delete newActionParams[k];
        }
      });
    }
  }

  // Strip static_ip_enabled references to let standard setup handle it
  delete newParams.static_ip_enabled;
  delete newParams.staticIpEnabled;

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
        : (sourceConnectorState.connectorModes || []).filter((m: string) => m !== "ACTIONS"),
      actionConfig: includeActions && !isAtlassian && sourceConnectorState.actionConfig
        ? {
            ...sourceConnectorState.actionConfig,
            actionParams: newActionParams,
          }
        : undefined,
      bapConfig: includeActions && !isAtlassian && sourceConnectorState.bapConfig
        ? {
            ...sourceConnectorState.bapConfig,
            enabledActions: (sourceConnectorState.bapConfig.enabledActions || []).filter(
              (act: string) => {
                if (dataSource === "onedrive") return act !== "download_file";
                if (dataSource === "sharepoint") return act !== "download_document";
                return true;
              }
            ),
          }
        : undefined,
      destinationConfigs: sourceConnectorState.destinationConfigs,
    },
  };
}
