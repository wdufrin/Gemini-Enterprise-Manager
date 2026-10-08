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

import React, { useState, useMemo } from "react";
import { Collection } from "../../types";
import { ValidationResult } from "./connectorDiagnostics";

interface ConnectorCollectionTableProps {
  collections: Collection[];
  validationResults: Record<string, ValidationResult>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editName: string;
  setEditName: (name: string) => void;
  isSavingName: boolean;
  onSaveName: (collection: Collection) => void;
  getAssociatedApps: (collectionName: string) => string[];
  onCheckDataConnector: (collection: Collection) => void;
  onOpenDetails: (collection: Collection) => void;
  onSelectResult: (payload: { result: ValidationResult; title: string }) => void;
  onDuplicateConnector: (collection: Collection) => void;
  onRequestDelete: (collection: Collection) => void;
}

export const ConnectorCollectionTable: React.FC<ConnectorCollectionTableProps> = ({
  collections,
  validationResults,
  editingId,
  setEditingId,
  editName,
  setEditName,
  isSavingName,
  onSaveName,
  getAssociatedApps,
  onCheckDataConnector,
  onOpenDetails,
  onSelectResult,
  onDuplicateConnector,
  onRequestDelete,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredCollections = useMemo(() => {
    return collections.filter((collection) => {
      const collectionId = collection.name.split("/").pop() || "";
      const displayName = collection.displayName || collectionId;
      const apps = getAssociatedApps(collection.name);
      const result = validationResults[collection.name];
      const status = result ? result.status : "unchecked";

      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = displayName.toLowerCase().includes(q);
        const matchesId = collectionId.toLowerCase().includes(q);
        const matchesApps = apps.some((a) => a.toLowerCase().includes(q));
        if (!matchesName && !matchesId && !matchesApps) {
          return false;
        }
      }

      return true;
    });
  }, [collections, validationResults, getAssociatedApps, searchQuery, statusFilter]);

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
      <div className="p-4 border-b border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">
            Collections ({collections.length})
          </h3>
          {(searchQuery.trim() || statusFilter !== "all") && (
            <span className="text-xs bg-gray-900 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full font-mono">
              Showing {filteredCollections.length}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections or apps..."
              aria-label="Search collections"
              className="bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-52 sm:w-64"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                aria-label="Clear collection search"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter collections by diagnostic status"
            className="bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="success">PASS</option>
            <option value="error">FAIL</option>
            <option value="n/a">N/A</option>
            <option value="unchecked">Not Checked</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Display Name
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Collection ID
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Associated App
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {filteredCollections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No collections match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredCollections.map((collection) => {
                const collectionId = collection.name.split("/").pop() || "";
                const result = validationResults[collection.name];

                return (
                  <tr
                    key={collection.name}
                    className="hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-white">
                      {editingId === collection.name ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            onSaveName(collection);
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            autoFocus
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                          />
                          <button
                            type="submit"
                            disabled={isSavingName}
                            className="text-blue-400 hover:text-blue-300 font-semibold text-xs disabled:opacity-50"
                          >
                            {isSavingName ? "..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-gray-400 hover:text-gray-300 font-semibold text-xs"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span className="truncate max-w-[200px] xl:max-w-[280px]" title={collection.displayName || collectionId}>
                            {collection.displayName || collectionId}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(collection.name);
                              setEditName(
                                collection.displayName || collectionId
                              );
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 transition-opacity shrink-0"
                            title="Edit Name"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono max-w-[180px] xl:max-w-[240px] truncate"
                      title={collectionId}
                    >
                      {collectionId}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {result ? (
                        <button
                          type="button"
                          disabled={result.status === "n/a"}
                          className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors shadow-sm ${
                            result.status === "success"
                              ? "bg-green-900/80 text-green-200 border border-green-700 hover:bg-green-800 cursor-pointer"
                              : result.status === "error"
                                ? "bg-red-900/80 text-red-200 border border-red-700 hover:bg-red-800 cursor-pointer"
                                : result.status === "n/a"
                                  ? "bg-gray-700/80 text-gray-300 border border-gray-600 cursor-default"
                                  : "bg-blue-900/80 text-blue-200 border border-blue-700 cursor-pointer"
                          }`}
                          onClick={() => {
                            if (result.status !== "n/a") {
                              const displayLabel =
                                collection.displayName &&
                                collection.displayName !== collectionId
                                  ? `${collection.displayName} (${collectionId})`
                                  : collectionId;
                              onSelectResult({
                                result: {
                                  ...result,
                                  details: result.details
                                    ? {
                                        ...result.details,
                                        collectionDisplayName:
                                          collection.displayName,
                                      }
                                    : result.details,
                                },
                                title: `Connector Diagnostics: ${displayLabel}`,
                              });
                            }
                          }}
                        >
                          {result.status === "pending" && (
                            <svg
                              className="animate-spin h-3 w-3 mr-2 shrink-0"
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
                          )}
                          {result.status === "success"
                            ? "PASS"
                            : result.status === "error"
                              ? "FAIL"
                              : result.status === "n/a"
                                ? "N/A"
                                : "CHECKING"}
                        </button>
                      ) : (
                        <span className="text-gray-500 text-xs italic whitespace-nowrap">
                          Not checked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-normal text-sm">
                      {(() => {
                        const apps = getAssociatedApps(collection.name);
                        if (apps.length === 0) {
                          return (
                            <span className="text-gray-500 text-xs italic">
                              None
                            </span>
                          );
                        }
                        return (
                          <div className="flex flex-wrap gap-1.5">
                            {apps.map((app, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50"
                              >
                                {app}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        type="button"
                        onClick={() => onCheckDataConnector(collection)}
                        className="text-blue-400 hover:text-blue-300 font-semibold text-xs border border-blue-500/30 px-2.5 xl:px-3 py-1.5 rounded hover:bg-blue-500/10 transition-colors whitespace-nowrap shrink-0"
                      >
                        Run Diagnostics
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDetails(collection)}
                        className="text-gray-300 hover:text-white font-semibold text-xs border border-gray-600 px-2.5 xl:px-3 py-1.5 rounded hover:bg-gray-700 transition-colors ml-1.5 xl:ml-2 whitespace-nowrap shrink-0"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateConnector(collection)}
                        className="text-amber-400 hover:text-amber-300 font-semibold text-xs border border-amber-500/30 px-2.5 xl:px-3 py-1.5 rounded hover:bg-amber-500/10 transition-colors ml-1.5 xl:ml-2 whitespace-nowrap shrink-0"
                        title="Duplicate this connector configuration"
                      >
                        Duplicate
                      </button>
                      {collectionId !== "default_collection" && (
                        <button
                          type="button"
                          onClick={() => onRequestDelete(collection)}
                          className="text-red-400 hover:text-red-300 font-semibold text-xs border border-red-500/30 px-2.5 xl:px-3 py-1.5 rounded hover:bg-red-500/10 transition-colors ml-1.5 xl:ml-2 whitespace-nowrap shrink-0"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
