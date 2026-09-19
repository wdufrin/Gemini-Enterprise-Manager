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
import ConnectorDetailsModal from "../components/ConnectorDetailsModal";
import DuplicateConnectorModal from "../components/connectors/DuplicateConnectorModal";
import ConfirmationModal from "../components/ConfirmationModal";
import { ConnectorConfigHeader } from "../components/connectors/ConnectorConfigHeader";
import { ConnectorCollectionTable } from "../components/connectors/ConnectorCollectionTable";
import { useConnectorsPage } from "../hooks/useConnectorsPage";
import { detectConnectorVendor } from "../components/connectors/checklist/checklistRegistry";

export { type ValidationResult } from "../components/connectors/connectorDiagnostics";

interface ConnectorsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
}

const ConnectorsPage: React.FC<ConnectorsPageProps> = ({
  projectNumber,
  setProjectNumber,
}) => {
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
  } = useConnectorsPage({ projectNumber });

  const activeVendors = React.useMemo(() => {
    const set = new Set<string>();
    collections.forEach((col) => {
      const dataConnector =
        col.dataConnector && typeof col.dataConnector === "object"
          ? (col.dataConnector as Record<string, unknown>)
          : {};
      const v = detectConnectorVendor({
        displayName: col.displayName,
        collectionDisplayName: col.displayName,
        ...dataConnector,
        name: (dataConnector.name as string | undefined) || col.name,
      });
      if (v && v !== "GENERIC") set.add(v);
    });
    return Array.from(set);
  }, [collections]);

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
