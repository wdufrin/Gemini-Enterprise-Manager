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

import React, { useState, useEffect, useCallback } from "react";
import { Config, Collection, DataConnector, AppEngine, DataStore, Operation } from "../types";
import * as api from "../services/apiService";
import { toErrorMessage } from "../utils/errors";
import {
  ValidationResult,
  runConnectorDiagnostics,
} from "../components/connectors/connectorDiagnostics";

interface UseConnectorsPageProps {
  projectNumber: string;
}

export function useConnectorsPage({ projectNumber }: UseConnectorsPageProps) {
  const [config, setConfig] = useState<Config>({
    projectId: projectNumber,
    appLocation: "global",
    collectionId: "default_collection",
    appId: "",
    assistantId: "",
  });

  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<string, ValidationResult>
  >({});
  const [selectedResult, setSelectedResult] = useState<{
    result: ValidationResult;
    title: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Duplicate states
  const [duplicatingCollection, setDuplicatingCollection] = useState<Collection | null>(null);
  const [duplicatingConnectorState, setDuplicatingConnectorState] = useState<DataConnector | null>(null);

  // Delete states
  const [deletingCollection, setDeletingCollection] = useState<Collection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Associations mapping states
  const [engines, setEngines] = useState<AppEngine[]>([]);
  const [dataStores, setDataStores] = useState<DataStore[]>([]);

  const [isBulkScanning, setIsBulkScanning] = useState(false);
  const [scanDurationHours, setScanDurationHours] = useState<number | "">(2);

  useEffect(() => {
    setConfig((prev) => ({ ...prev, projectId: projectNumber }));
  }, [projectNumber]);

  const fetchCollections = useCallback(async () => {
    if (!config.projectId) return;
    setIsLoading(true);
    setError(null);
    setCollections([]);
    setValidationResults({});
    setEngines([]);
    setDataStores([]);

    try {
      const response = await api.listResources("collections", config);
      const cols = response.collections || [];
      setCollections(cols);

      // Fetch engines for associations mapping
      try {
        const enginesRes = await api.listResources("engines", { ...config, appId: "" });
        setEngines(enginesRes.engines || []);
      } catch (e) {
        console.error("Failed to fetch engines for associations:", e);
      }

      // Fetch data stores for associations mapping
      try {
        const dataStoresRes = await api.listResources("dataStores", {
          ...config,
          collectionId: "default_collection",
        });
        setDataStores(dataStoresRes.dataStores || []);
      } catch (e) {
        console.error("Failed to fetch data stores for associations:", e);
      }
    } catch (err: unknown) {
      console.error("Failed to fetch collections:", err);
      setError(toErrorMessage(err, "Failed to fetch collections."));
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  useEffect(() => {
    if (config.projectId) {
      fetchCollections();
    }
  }, [config.projectId, fetchCollections]);

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    setConfig((prev) => ({ ...prev, appLocation: value }));
  };

  const handleSaveName = async (collection: Collection) => {
    if (editName === collection.displayName || !editName.trim()) {
      setEditingId(null);
      return;
    }
    setIsSavingName(true);
    try {
      await api.updateCollection(
        collection.name,
        { displayName: editName },
        ["display_name"],
        config
      );
      fetchCollections();
    } catch (err: unknown) {
      console.error("Failed to update collection name:", err);
      setError(toErrorMessage(err, "Failed to update collection name."));
    } finally {
      setIsSavingName(false);
      setEditingId(null);
    }
  };

  const getAssociatedApps = (collectionName: string) => {
    const collectionId = collectionName.split("/").pop() || "";
    if (collectionId === "default_collection") {
      return ["Default Search"];
    }

    const matchingDsIds = dataStores
      .map((ds) => ds.name.split("/").pop() || "")
      .filter(
        (dsId) =>
          dsId.startsWith(collectionId) || dsId.includes(collectionId)
      );

    if (matchingDsIds.length === 0) return [];

    const associatedEngines = engines.filter((engine) =>
      engine.dataStoreIds?.some((dsId: string) =>
        matchingDsIds.includes(dsId)
      )
    );

    return associatedEngines.map(
      (e) => e.displayName || e.name.split("/").pop() || ""
    );
  };

  const checkDataConnector = async (collection: Collection) => {
    setValidationResults((prev) => ({
      ...prev,
      [collection.name]: { status: "pending" },
    }));

    const result = await runConnectorDiagnostics(
      collection,
      config,
      scanDurationHours
    );

    setValidationResults((prev) => ({
      ...prev,
      [collection.name]: result,
    }));
  };

  const handleOpenDetails = async (collection: Collection) => {
    const collectionId =
      collection.name.split("/").pop() || "default_collection";
    const result = validationResults[collection.name];

    if (result && result.dataConnector) {
      setSelectedResult({
        result,
        title: `Connector Details: ${collectionId}`,
      });
      return;
    }

    const collectionConfig = { ...config, collectionId: collectionId };
    try {
      const connector = await api.getDataConnector(collectionConfig);
      const unvalidatedResult: ValidationResult = {
        status: "unvalidated",
        message: "Not validated",
        dataConnector: connector,
        details: {
          summary: "Not validated",
          connectorState: connector,
          diagnostics: { steps: [], warnings: [], errors: [] },
        },
      };
      setSelectedResult({
        result: unvalidatedResult,
        title: `Connector Details: ${collectionId}`,
      });
    } catch (err: unknown) {
      console.error("Failed to fetch connector config:", err);
      setError(toErrorMessage(err, "Failed to fetch connector configuration."));
    }
  };

  const handleDuplicateConnector = async (collection: Collection) => {
    const collectionId =
      collection.name.split("/").pop() || "default_collection";
    const collectionConfig = { ...config, collectionId: collectionId };
    setIsLoading(true);
    setError(null);
    try {
      const connector = await api.getDataConnector(collectionConfig);
      const dataSource = connector.dataSource?.toLowerCase() || "";
      const ALLOWED_DUPLICATE_SOURCES = [
        "jira",
        "confluence",
        "sharepoint",
        "onedrive",
        "ms-onedrive",
        "teams",
        "ms-teams",
        "outlook",
        "ms-outlook",
      ];

      if (!ALLOWED_DUPLICATE_SOURCES.includes(dataSource)) {
        setError(
          `Duplication is currently only supported and validated for Jira, Confluence, and Office 365 (SharePoint, OneDrive, Teams, Outlook) connectors. Duplication of '${connector.dataSource}' is restricted.`
        );
        return;
      }

      if (connector.connectorType !== "THIRD_PARTY_FEDERATED") {
        setError(
          `Duplication is currently only supported and validated for Federated connectors. Duplication of ingested connector '${collectionId}' (${connector.connectorType || "THIRD_PARTY"}) is restricted.`
        );
        return;
      }

      setDuplicatingConnectorState(connector);
      setDuplicatingCollection(collection);
    } catch (err: unknown) {
      console.error("Failed to load connector config for duplication:", err);
      setError(
        toErrorMessage(err, "Failed to load connector configuration for duplication.")
      );
    } finally {
      setIsLoading(false);
    }
  };

  const pollOperation = async (operation: Operation | unknown, maxAttempts: number = 60) => {
    let currentOperation = operation as Operation | null | undefined;
    if (!currentOperation || typeof currentOperation !== "object") return;
    let attempts = 0;
    while (!currentOperation.done) {
      if (attempts++ >= maxAttempts) {
        throw new Error(
          `Operation timed out after ${maxAttempts * 2}s waiting for completion. It may still be running in Google Cloud: ${currentOperation.name}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      currentOperation = (await api.getDiscoveryOperation(
        currentOperation.name,
        config
      )) as Operation;
    }
    if (currentOperation.error) {
      throw new Error(currentOperation.error.message || "Operation failed.");
    }
    return currentOperation.response;
  };

  const handleRequestDelete = (collection: Collection) => {
    setDeletingCollection(collection);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCollection) return;
    setIsDeleting(true);
    setError(null);
    try {
      const operation = (await api.deleteResource(
        deletingCollection.name,
        config
      )) as Operation;
      await pollOperation(operation);
      setDeletingCollection(null);
      fetchCollections();
    } catch (err: unknown) {
      console.error("Failed to delete collection:", err);
      setError(toErrorMessage(err, "Failed to delete collection."));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDiagnostics = async () => {
    setIsBulkScanning(true);
    await Promise.all(
      collections.map((collection) => checkDataConnector(collection))
    );
    setIsBulkScanning(false);
  };

  return {
    config,
    collections,
    isLoading,
    error,
    setError,
    validationResults,
    selectedResult,
    setSelectedResult,
    editingId,
    setEditingId,
    editName,
    setEditName,
    isSavingName,
    handleSaveName,
    getAssociatedApps,
    checkDataConnector,
    handleOpenDetails,
    handleDuplicateConnector,
    duplicatingCollection,
    setDuplicatingCollection,
    duplicatingConnectorState,
    setDuplicatingConnectorState,
    deletingCollection,
    setDeletingCollection,
    isDeleting,
    handleRequestDelete,
    handleConfirmDelete,
    scanDurationHours,
    setScanDurationHours,
    isBulkScanning,
    handleBulkDiagnostics,
    fetchCollections,
    handleLocationChange,
  };
}
