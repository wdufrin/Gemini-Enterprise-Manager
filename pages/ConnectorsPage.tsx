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

import React from "react";
import { Config } from "../types";
import ConnectorDetailsModal from "../components/ConnectorDetailsModal";
import DuplicateConnectorModal from "../components/connectors/DuplicateConnectorModal";
import ConfirmationModal from "../components/ConfirmationModal";
import { ConnectorConfigHeader } from "../components/connectors/ConnectorConfigHeader";
import { ConnectorCollectionTable } from "../components/connectors/ConnectorCollectionTable";
import { useConnectorsPage } from "../hooks/useConnectorsPage";
import { detectConnectorVendor } from "../components/connectors/checklist/checklistRegistry";

export { type ValidationResult } from "../components/connectors/connectorDiagnostics";

interface ConnectorsPageProps {
  projectNumber?: string;
  setProjectNumber?: (projectNumber: string) => void;
  accessToken?: string;
  config?: Config;
}

const ConnectorsPage: React.FC<ConnectorsPageProps> = ({
  projectNumber: propProjectNumber,
  setProjectNumber: propSetProjectNumber,
  config: propConfig,
}) => {
  const projectNumber = propProjectNumber ?? propConfig?.projectId ?? "";
  const setProjectNumber = propSetProjectNumber ?? (() => {});

  const {
    config,
    collections,
    isLoading,
    error,
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
    associationWarning,
    setAssociationWarning,
  } = useConnectorsPage({ projectNumber });

  const activeVendors = React.useMemo(() => {
    const set = new Set<string>();
    collections.forEach((col) => {
      const valResult = validationResults[col.name];
      const valDetails = valResult?.details as
        | { connectorState?: Record<string, unknown>; dataStores?: Record<string, unknown>[] }
        | undefined;
      const dataConnector =
        (valResult?.dataConnector && typeof valResult.dataConnector === "object"
          ? (valResult.dataConnector as Record<string, unknown>)
          : undefined) ||
        valDetails?.connectorState ||
        (col.dataConnector && typeof col.dataConnector === "object"
          ? (col.dataConnector as Record<string, unknown>)
          : {});
      const v = detectConnectorVendor({
        displayName: col.displayName,
        collectionDisplayName: col.displayName,
        dataStores: valDetails?.dataStores,
        ...dataConnector,
        name: (dataConnector.name as string | undefined) || col.name,
      });
      if (v && v !== "GENERIC") set.add(v);
    });
    return Array.from(set);
  }, [collections, validationResults]);

  return (
    <div className="space-y-6">
      <ConnectorConfigHeader
        projectNumber={projectNumber}
        setProjectNumber={setProjectNumber}
        appLocation={config.appLocation}
        onLocationChange={handleLocationChange}
        scanDurationHours={scanDurationHours}
        setScanDurationHours={setScanDurationHours}
        isLoading={isLoading}
        isBulkScanning={isBulkScanning}
        collectionsCount={collections.length}
        onScanCollections={fetchCollections}
        onBulkDiagnostics={handleBulkDiagnostics}
      />

      {associationWarning && (
        <div
          role="alert"
          data-testid="connector-association-warning"
          className="bg-amber-900/30 border border-amber-700/60 text-amber-200 p-3 rounded-lg text-xs flex items-center justify-between"
        >
          <span>
            <strong>Association Discovery Warning:</strong> {associationWarning}
          </span>
          <button
            type="button"
            onClick={() => setAssociationWarning(null)}
            className="ml-3 text-amber-300 hover:text-white underline text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 text-red-300 p-4 rounded-lg">
          {error}
        </div>
      )}

      {!isLoading && collections.length > 0 && (
        <ConnectorCollectionTable
          collections={collections}
          validationResults={validationResults}
          editingId={editingId}
          setEditingId={setEditingId}
          editName={editName}
          setEditName={setEditName}
          isSavingName={isSavingName}
          onSaveName={handleSaveName}
          getAssociatedApps={getAssociatedApps}
          onCheckDataConnector={checkDataConnector}
          onOpenDetails={handleOpenDetails}
          onSelectResult={setSelectedResult}
          onDuplicateConnector={handleDuplicateConnector}
          onRequestDelete={handleRequestDelete}
          associationWarning={associationWarning}
        />
      )}

      <ConnectorDetailsModal
        isOpen={!!selectedResult}
        onClose={() => setSelectedResult(null)}
        title={selectedResult?.title || "Details"}
        data={selectedResult?.result.details || selectedResult?.result.message}
        status={
          selectedResult?.result.status === "success" ? "success" : "error"
        }
        config={config}
        onRefreshSuccess={fetchCollections}
        activeVendors={activeVendors}
      />

      {duplicatingCollection && (
        <DuplicateConnectorModal
          isOpen={!!duplicatingCollection}
          onClose={() => {
            setDuplicatingCollection(null);
            setDuplicatingConnectorState(null);
          }}
          onSuccess={() => {
            setDuplicatingCollection(null);
            setDuplicatingConnectorState(null);
            fetchCollections();
          }}
          sourceCollectionName={duplicatingCollection.name}
          sourceConnectorState={duplicatingConnectorState}
          currentProjectId={config.projectId}
          currentLocation={config.appLocation}
        />
      )}

      {deletingCollection && (
        <ConfirmationModal
          isOpen={!!deletingCollection}
          onClose={() => setDeletingCollection(null)}
          onConfirm={handleConfirmDelete}
          title="Delete Connector"
          confirmText="Delete"
          isConfirming={isDeleting}
        >
          <p>
            Are you sure you want to delete the connector{" "}
            <strong className="text-white">
              {deletingCollection.displayName || deletingCollection.name.split("/").pop()}
            </strong>
            ? This will permanently delete the collection and all connector configurations.
          </p>
        </ConfirmationModal>
      )}
    </div>
  );
};

export default ConnectorsPage;
