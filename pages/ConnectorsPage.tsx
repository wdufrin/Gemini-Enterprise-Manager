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
import { Collection, Config } from "../types";
import ConnectorDetailsModal from "../components/ConnectorDetailsModal";
import DuplicateConnectorModal from "../components/connectors/DuplicateConnectorModal";
import CreateByoMcpModal from "../components/connectors/CreateByoMcpModal";
import DeadLetterInspectorModal from "../components/connectors/DeadLetterInspectorModal";
import ConnectorAlertPolicyModal from "../components/connectors/ConnectorAlertPolicyModal";
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
    setConfig,
    collections,
    isLoading,
    error,
    validationResults,
    selectedResult,
    setSelectedResult,
    loadingDetailsCollectionId,
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

  const [enableExperimentalClone, setEnableExperimentalClone] = React.useState(true);
  const [isCreateByoMcpOpen, setIsCreateByoMcpOpen] = React.useState(false);
  const [deadLetterModalState, setDeadLetterModalState] = React.useState<{
    collection?: Collection;
    gcsPrefix?: string;
  } | null>(null);
  const [alertModalState, setAlertModalState] = React.useState<{
    collectionId?: string;
  } | null>(null);

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

      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-800/80 border border-gray-700 rounded-lg px-4 py-3">
        <div className="text-xs text-gray-400">
          Provision custom MCP tool servers, inspect GCS ingestion dead-letter JSONL logs, or deploy 1-click Cloud Monitoring sync alerts.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!projectNumber}
            onClick={() => setIsCreateByoMcpOpen(true)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-semibold rounded-md transition-colors shadow-sm"
          >
            + Create BYO MCP Connector
          </button>
          <button
            type="button"
            disabled={!projectNumber}
            onClick={() => setDeadLetterModalState({})}
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 border border-gray-600 text-gray-200 text-xs font-semibold rounded-md transition-colors"
          >
            GCS Dead-Letter Inspector
          </button>
          <button
            type="button"
            disabled={!projectNumber}
            onClick={() => setAlertModalState({})}
            className="px-3 py-1.5 bg-purple-900/50 hover:bg-purple-800/60 disabled:opacity-50 border border-purple-600/60 text-purple-200 text-xs font-semibold rounded-md transition-colors"
          >
            Cloud Monitoring Alerts
          </button>
        </div>
      </div>

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
          onOpenDeadLetter={(collection, gcsPrefix) =>
            setDeadLetterModalState({ collection, gcsPrefix })
          }
          onOpenAlertPolicy={(collection) =>
            setAlertModalState({
              collectionId: collection.name.split("/").pop() || "",
            })
          }
          associationWarning={associationWarning}
          enableExperimentalClone={enableExperimentalClone}
          onToggleExperimentalClone={setEnableExperimentalClone}
          loadingDetailsCollectionId={loadingDetailsCollectionId}
        />
      )}

      <ConnectorDetailsModal
        isOpen={!!selectedResult}
        onClose={() => setSelectedResult(null)}
        title={selectedResult?.title || "Details"}
        data={selectedResult?.result.details || selectedResult?.result.message}
        status={
          selectedResult?.result.status === "success"
            ? "success"
            : selectedResult?.result.status === "pending"
              ? "loading"
              : selectedResult?.result.status === "unvalidated"
                ? "unvalidated"
                : "error"
        }
        isLoading={Boolean(selectedResult?.isLoadingDetails || selectedResult?.result.status === "pending")}
        config={config}
        onRefreshSuccess={fetchCollections}
        onCloneConnector={
          enableExperimentalClone
            ? (connectorState) => {
                const collectionName =
                  connectorState.name?.replace(/\/dataConnector$/, "") ||
                  `projects/${config.projectId}/locations/${config.appLocation}/collections/${selectedResult?.title.split(": ").pop() || "default_collection"}`;
                const matchedCollection = collections.find(
                  (c) => c.name === collectionName,
                ) || {
                  name: collectionName,
                  displayName: collectionName.split("/").pop() || "",
                };
                setSelectedResult(null);
                handleDuplicateConnector(matchedCollection, connectorState);
              }
            : undefined
        }
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

      <CreateByoMcpModal
        isOpen={isCreateByoMcpOpen}
        onClose={() => setIsCreateByoMcpOpen(false)}
        onSuccess={(_createdCollectionId, createdLocation) => {
          setIsCreateByoMcpOpen(false);
          if (createdLocation !== config.appLocation) {
            setConfig((prev) => ({ ...prev, appLocation: createdLocation }));
          } else {
            fetchCollections();
          }
        }}
        projectId={config.projectId}
        defaultLocation={config.appLocation}
      />

      <DeadLetterInspectorModal
        isOpen={!!deadLetterModalState}
        onClose={() => setDeadLetterModalState(null)}
        projectId={config.projectId}
        collectionName={deadLetterModalState?.collection?.name}
        initialGcsPrefix={deadLetterModalState?.gcsPrefix}
      />

      <ConnectorAlertPolicyModal
        isOpen={!!alertModalState}
        onClose={() => setAlertModalState(null)}
        projectId={config.projectId}
        collections={collections}
        initialCollectionId={alertModalState?.collectionId}
      />
    </div>
  );
};

export default ConnectorsPage;
