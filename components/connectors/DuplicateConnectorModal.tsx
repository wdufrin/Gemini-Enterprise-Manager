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

import React, { useState, useEffect, useMemo } from "react";
import WizardStepper from "../agent-starter-pack/WizardStepper";
import * as api from "../../services/apiService";
import { Config } from "../../types";
import InfoTooltip from "../InfoTooltip";

interface DuplicateConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sourceCollectionName: string;
  sourceConnectorState: any;
  currentProjectId: string;
  currentLocation: string;
}

interface FormField {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "checkbox";
  location: "params" | "actionParams";
  defaultValue: any;
  required: boolean;
  description?: string;
}

const tooltipTexts: Record<string, string> = {
  embedded_images_enabled: "Enables parsing, OCR, and indexing of images embedded inside files (e.g., inline images in Word files or SharePoint pages).",
  eeeu_enabled: "Enables the End-to-End User (EE-EU) security model. When active, queries are executed using the searcher's personal identity, ensuring real-time security trimming based on their specific access permissions.",
  managed_paths_enabled: "If enabled, restricts crawling and indexing to specific SharePoint managed paths (like /sites/ or /teams/) instead of the entire root collection.",
  recursivelyCrawlNestedSites: "If enabled, recursively crawls all nested SharePoint sub-sites underneath the specified site collection or root URI."
};

const discoverFields = (connectorState: any, includeActions: boolean = true): FormField[] => {
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
      default:
        const formatted = key
          .replace(/_/g, " ")
          .replace(/([A-Z])/g, " $1")
          .trim();
        const label = formatted.charAt(0).toUpperCase() + formatted.slice(1);
        return { label, desc: "" };
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

const DuplicateConnectorModal: React.FC<DuplicateConnectorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  sourceCollectionName,
  sourceConnectorState,
  currentProjectId,
  currentLocation,
}) => {
  const sourceCollectionId = sourceCollectionName.split("/").pop() || "";

  // Wizard Step State
  const [currentStep, setCurrentStep] = useState(1);

  // Target Destination Configuration
  const [targetProjectId, setTargetProjectId] = useState(currentProjectId);
  const [targetLocation, setTargetLocation] = useState(currentLocation);
  const [targetCollectionId, setTargetCollectionId] = useState(
    `${sourceCollectionId}-clone`,
  );
  const [targetCollectionDisplayName, setTargetCollectionDisplayName] = useState(
    `Cloned ${sourceCollectionId}`,
  );

  // Credentials / Fields Values State
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [includeActions, setIncludeActions] = useState(true);

  // Parse fields
  const formFields = useMemo(() => {
    return discoverFields(sourceConnectorState, includeActions);
  }, [sourceConnectorState, includeActions]);

  // Pre-populate defaults once when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setTargetProjectId(currentProjectId);
      setTargetLocation(currentLocation);
      setTargetCollectionId(`${sourceCollectionId}-clone`);
      setTargetCollectionDisplayName(`Cloned ${sourceCollectionId}`);
      setValidationError(null);
      setSubmitError(null);

      // Default includeActions to false for OneDrive and SharePoint
      const ds = sourceConnectorState?.dataSource?.toLowerCase() || "";
      const defaultInclude = !["sharepoint", "onedrive", "ms-onedrive"].includes(ds);
      setIncludeActions(defaultInclude);

      const initialFields = discoverFields(sourceConnectorState, defaultInclude);
      const initialValues: Record<string, any> = {};
      initialFields.forEach((field) => {
        const valueKey = `${field.location}.${field.key}`;
        initialValues[valueKey] = field.defaultValue ?? "";
      });
      setFieldValues(initialValues);
    }
  }, [isOpen, currentProjectId, currentLocation, sourceCollectionId, sourceConnectorState]);

  if (!isOpen) return null;

  const handleFieldChange = (
    fieldKey: string,
    value: string | boolean,
  ) => {
    setFieldValues((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const steps = ["Destination", "Identifier", "Credentials", "Review"];

  // Helper to validate current step before proceeding
  const validateStep = () => {
    setValidationError(null);
    if (currentStep === 1) {
      if (!targetProjectId.trim()) {
        setValidationError("Target Project ID / Number is required.");
        return false;
      }
      if (!targetLocation.trim()) {
        setValidationError("Target Region / Location is required.");
        return false;
      }
    } else if (currentStep === 2) {
      if (!targetCollectionId.trim()) {
        setValidationError("Target Collection ID is required.");
        return false;
      }
      if (!/^[a-z0-9-_]{1,63}$/.test(targetCollectionId)) {
        setValidationError(
          "Collection ID must be lowercase alphanumeric, dashes, or underscores, up to 63 characters.",
        );
        return false;
      }
      if (!targetCollectionDisplayName.trim()) {
        setValidationError("Target Collection Display Name is required.");
        return false;
      }
    } else if (currentStep === 3) {
      // Validate required fields in Step 3
      for (const field of formFields) {
        if (field.required) {
          const valueKey = `${field.location}.${field.key}`;
          const val = fieldValues[valueKey];
          if (
            val === undefined ||
            val === null ||
            (typeof val === "string" && !val.trim())
          ) {
            setValidationError(`Credential '${field.label}' is required.`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length));
    }
  };

  const handleBack = () => {
    setValidationError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Re-construct the full payload for setUpDataConnector
  const finalPayload = useMemo(() => {
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
        let newEntityParams = entityParams ? { ...entityParams } : {};
        
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
  }, [
    sourceConnectorState,
    targetCollectionId,
    targetCollectionDisplayName,
    fieldValues,
    includeActions,
  ]);

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsSubmitting(true);
    setSubmitError(null);

    const config: Config = {
      projectId: targetProjectId,
      appLocation: targetLocation,
      collectionId: targetCollectionId,
      appId: "",
      assistantId: "",
    };

    try {
      await api.setUpDataConnector(finalPayload, config);
      setIsSubmitting(false);
      onSuccess();
    } catch (err: any) {
      console.error("Failed to set up duplicated connector:", err);
      setSubmitError(err.message || "Failed to duplicate data connector.");
      setIsSubmitting(false);
    }
  };

  const isAtlassian = ["jira", "confluence"].includes(
    sourceConnectorState?.dataSource?.toLowerCase(),
  );
  const isMicrosoft = ["sharepoint", "onedrive", "outlook", "teams"].includes(
    sourceConnectorState?.dataSource?.toLowerCase(),
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700 ring-1 ring-white/10">
        <header className="p-4 border-b border-gray-700 bg-gray-900/40 flex justify-between items-center rounded-t-lg shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg
              className="w-5 h-5 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
              />
            </svg>
            Duplicate Connector: {sourceCollectionId}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-gray-900 flex flex-col">
          <WizardStepper
            currentStep={currentStep}
            steps={steps}
            onStepClick={(step) => {
              if (step < currentStep) setCurrentStep(step);
            }}
          />

          <div className="flex-1">
            {/* Step 1: Destination */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-md font-semibold text-white">
                  Step 1: Choose Target Project & Region
                </h3>
                <p className="text-xs text-gray-400">
                  Select the Google Cloud Project and Vertex AI Search region
                  where you want to recreate this connector.
                </p>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Target Project ID / Number
                    </label>
                    <input
                      type="text"
                      value={targetProjectId}
                      onChange={(e) => setTargetProjectId(e.target.value)}
                      placeholder="e.g. my-target-gcp-project"
                      className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Target Location / Region
                    </label>
                    <select
                      value={targetLocation}
                      onChange={(e) => setTargetLocation(e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-blue-500"
                    >
                      <option value="global">global</option>
                      <option value="us">us</option>
                      <option value="eu">eu</option>
                    </select>
                  </div>

                  {sourceConnectorState?.actionConfig && (
                    <div className="bg-gray-800/40 p-4 border border-gray-700/60 rounded-lg mt-4">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          id="include-actions"
                          checked={includeActions}
                          onChange={(e) => setIncludeActions(e.target.checked)}
                          className="mt-1 rounded bg-gray-900 border-gray-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <label htmlFor="include-actions" className="font-semibold text-gray-200 block cursor-pointer">
                            Enable Client-Side Actions (BAP)
                          </label>
                          <span className="text-gray-400 mt-0.5 block">
                            Recreate client-side search/write actions (e.g., download document, send message). Deselect if actions are not supported or fail to deploy in the target region.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Identification */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-md font-semibold text-white">
                  Step 2: Connector Identification
                </h3>
                <p className="text-xs text-gray-400">
                  Provide a new Collection ID and Display Name for the duplicated
                  connector.
                </p>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Collection ID
                    </label>
                    <input
                      type="text"
                      value={targetCollectionId}
                      onChange={(e) => setTargetCollectionId(e.target.value)}
                      placeholder="e.g. jira-connector-prod"
                      className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-blue-500"
                      pattern="[a-z0-9-_]{1,63}"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Only lowercase letters, numbers, hyphens, and underscores, up to 63 chars.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={targetCollectionDisplayName}
                      onChange={(e) =>
                        setTargetCollectionDisplayName(e.target.value)
                      }
                      placeholder="e.g. Jira Production Connector"
                      className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Credentials */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <h3 className="text-md font-semibold text-white">
                    Step 3: Connector Credentials & Settings
                  </h3>
                  <span className="text-[10px] font-bold uppercase bg-gray-800 text-indigo-400 border border-gray-700 px-2 py-0.5 rounded">
                    Type: {sourceConnectorState?.dataSource}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Because credentials are redacted by Google Cloud APIs, you must
                  re-enter the secrets and configure target variables to provision
                  the connector in the new environment.
                </p>

                {/* Specific SaaS Credentials tips */}
                {isAtlassian && (
                  <div className="bg-blue-950/40 border border-blue-900/60 p-3 rounded-lg text-xs text-blue-200 space-y-1">
                    <div className="font-bold flex items-center gap-1 text-blue-300">
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Jira/Confluence Clone Notes:
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>
                        Enable the <strong>offline_access</strong> scope in your
                        Atlassian Developer Console to request a refresh token.
                      </li>
                      <li>
                        The <strong>Instance ID (Cloud ID)</strong> is site-specific.
                        Ensure the target environment site matches this ID.
                      </li>
                    </ul>
                  </div>
                )}

                {isMicrosoft && (
                  <div className="bg-blue-950/40 border border-blue-900/60 p-3 rounded-lg text-xs text-blue-200 space-y-1">
                    <div className="font-bold flex items-center gap-1 text-blue-300">
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Microsoft Graph Connector Notes:
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>
                        A Microsoft Tenant ID is required. If deploying to another Entra tenant, specify its Tenant ID.
                      </li>
                      <li>
                        Ensure the Azure AD Application registration allows access from the target GCP Project service accounts.
                      </li>
                    </ul>
                  </div>
                )}

                <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
                  {formFields.length === 0 ? (
                    <p className="text-sm italic text-gray-500">
                      No configurable parameters found. Click Next to continue.
                    </p>
                  ) : (
                    formFields.map((field) => {
                      const valueKey = `${field.location}.${field.key}`;
                      const currentVal = fieldValues[valueKey] ?? "";

                      return (
                        <div key={valueKey} className="border-b border-gray-800 pb-3">
                          <div className="flex justify-between items-baseline mb-1">
                            <label className="text-sm font-semibold text-gray-300 flex items-center">
                              {field.label}
                              {field.required && (
                                <span className="text-red-400 ml-1 font-bold">*</span>
                              )}
                              {tooltipTexts[field.key] && (
                                <InfoTooltip text={tooltipTexts[field.key]} />
                              )}
                            </label>
                            <span className="text-[10px] text-gray-500 font-mono">
                              ({field.location}.{field.key})
                            </span>
                          </div>

                          {field.type === "textarea" ? (
                            <textarea
                              value={currentVal}
                              onChange={(e) =>
                                handleFieldChange(valueKey, e.target.value)
                              }
                              placeholder={`Enter ${field.label}`}
                              className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 w-full h-20 font-mono focus:ring-blue-500"
                              required={field.required}
                            />
                          ) : field.type === "password" ? (
                            <input
                              type="password"
                              value={currentVal}
                              onChange={(e) =>
                                handleFieldChange(valueKey, e.target.value)
                              }
                              placeholder={`Enter ${field.label}`}
                              className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 w-full focus:ring-blue-500"
                              required={field.required}
                            />
                          ) : field.type === "checkbox" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                type="checkbox"
                                checked={!!currentVal}
                                onChange={(e) =>
                                  handleFieldChange(valueKey, e.target.checked)
                                }
                                className="rounded bg-gray-850 border-gray-750 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs text-gray-400">Enabled</span>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={currentVal}
                              onChange={(e) =>
                                handleFieldChange(valueKey, e.target.value)
                              }
                              placeholder={`Enter ${field.label}`}
                              className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 w-full focus:ring-blue-500"
                              required={field.required}
                            />
                          )}
                          {field.description && (
                            <p className="text-[10px] text-gray-400 mt-1">
                              {field.description}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {currentStep === 4 && (
              <div className="space-y-4 animate-fadeIn flex flex-col h-full">
                <h3 className="text-md font-semibold text-white">
                  Step 4: Review and Provision Connector
                </h3>
                <p className="text-xs text-gray-400">
                  Review the destination and credentials payload. Clicking
                  "Provision" will invoke the `setUpDataConnector` API in the target
                  project/location.
                </p>

                <div className="grid grid-cols-2 gap-4 bg-gray-900/60 p-3 rounded border border-gray-800 text-xs">
                  <div>
                    <span className="text-gray-400 block">Target Project</span>
                    <span className="font-semibold text-white">
                      {targetProjectId}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Target Location</span>
                    <span className="font-semibold text-white">
                      {targetLocation}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Collection ID</span>
                    <span className="font-semibold text-white font-mono">
                      {targetCollectionId}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Display Name</span>
                    <span className="font-semibold text-white">
                      {targetCollectionDisplayName}
                    </span>
                  </div>
                </div>

                <div className="flex-1 flex flex-col">
                  <span className="text-xs font-bold text-gray-400 mb-1">
                    API Request Body:
                  </span>
                  <pre className="text-[11px] bg-gray-950 p-4 rounded overflow-auto border border-gray-800 text-gray-300 font-mono max-h-[220px] custom-scrollbar flex-1 select-all">
                    {JSON.stringify(finalPayload, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {validationError && (
            <div className="mt-4 p-2.5 bg-red-950/40 border border-red-900/50 rounded text-xs text-red-300 flex items-center gap-1.5">
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              {validationError}
            </div>
          )}

          {submitError && (
            <div className="mt-4 p-3 bg-red-950/40 border border-red-900/50 rounded text-xs text-red-300 flex items-start gap-1.5">
              <svg
                className="w-4 h-4 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1 break-words">{submitError}</div>
            </div>
          )}
        </main>

        <footer className="p-4 bg-gray-800 border-t border-gray-700 rounded-b-lg shrink-0 flex justify-between items-center">
          <div>
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gray-750 hover:bg-gray-700 border border-gray-650 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-650 border border-gray-600 text-white text-xs font-semibold rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            {currentStep < steps.length ? (
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded transition-colors disabled:bg-gray-700 disabled:text-gray-500 shadow-lg flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin h-3.5 w-3.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Duplicating...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    Provision Connector
                  </>
                )}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default DuplicateConnectorModal;
