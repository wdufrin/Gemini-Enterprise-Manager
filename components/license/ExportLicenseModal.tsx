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

import React, { useState, useEffect } from 'react';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';

interface ExportLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectNumber: string;
  userLicenses: any[];
  filteredUserLicenses: any[];
  licenseNames: Record<string, string>;
  onExportSuccess?: () => void;
}

const ExportLicenseModal: React.FC<ExportLicenseModalProps> = ({
  isOpen,
  onClose,
  projectNumber,
  userLicenses,
  filteredUserLicenses,
  licenseNames,
  onExportSuccess
}) => {
  const [exportType, setExportType] = useState<'csv' | 'bigquery'>('csv');
  const [exportSource, setExportSource] = useState<'all' | 'filtered'>('filtered');
  
  // BigQuery-specific states
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [newDatasetId, setNewDatasetId] = useState<string>('gemini_licenses');
  const [tableId, setTableId] = useState<string>('license_assignments');
  const [isLoadingDatasets, setIsLoadingDatasets] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Set default export source based on whether filters are active
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMessage(null);
      if (filteredUserLicenses.length < userLicenses.length) {
        setExportSource('filtered');
      } else {
        setExportSource('all');
      }
    }
  }, [isOpen, filteredUserLicenses.length, userLicenses.length]);

  // Fetch BigQuery datasets when BQ export is selected
  useEffect(() => {
    if (isOpen && exportType === 'bigquery' && projectNumber) {
      const fetchDatasets = async () => {
        setIsLoadingDatasets(true);
        setError(null);
        try {
          const res = await api.listBigQueryDatasets(projectNumber);
          const list = res.datasets || [];
          setDatasets(list);
          
          // Auto-select first dataset if available, otherwise set to create new
          if (list.length > 0) {
            setSelectedDatasetId(list[0].datasetReference?.datasetId || '');
          } else {
            setSelectedDatasetId('__create_new__');
          }
        } catch (err: any) {
          console.warn("Failed to fetch BigQuery datasets", err);
          // Don't crash, let them type a new dataset
          setSelectedDatasetId('__create_new__');
        } finally {
          setIsLoadingDatasets(false);
        }
      };
      fetchDatasets();
    }
  }, [isOpen, exportType, projectNumber]);

  if (!isOpen) return null;

  const dataToExport = exportSource === 'filtered' ? filteredUserLicenses : userLicenses;

  const handleExportCsv = () => {
    setError(null);
    setSuccessMessage(null);
    try {
      if (dataToExport.length === 0) {
        throw new Error("No license records to export.");
      }

      const headers = ['User Principal', 'State', 'License Config Resource', 'License Config Name', 'License ID', 'Last Login Time'];
      
      const rows = dataToExport.map(l => {
        const resourceName = l.licenseConfig || '';
        const friendlyName = licenseNames[resourceName] || resourceName.split('/').pop() || 'N/A';
        const licenseId = l.name ? l.name.split('/').pop() : 'N/A';
        return [
          l.userPrincipal || 'Unknown',
          l.licenseAssignmentState || 'N/A',
          resourceName,
          friendlyName,
          licenseId,
          l.lastLoginTime ? new Date(l.lastLoginTime).toISOString() : 'Never'
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `gemini_licenses_${projectNumber}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccessMessage(`Successfully exported and downloaded CSV containing ${dataToExport.length} licenses.`);
      
      if (onExportSuccess) {
         onExportSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Failed to export CSV.");
    }
  };

  const handleExportBigQuery = async () => {
    setIsExporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (dataToExport.length === 0) {
        throw new Error("No license records to export.");
      }

      let targetDataset = selectedDatasetId;
      if (selectedDatasetId === '__create_new__') {
        const dId = newDatasetId.trim();
        if (!dId) {
          throw new Error("Please enter a valid Dataset ID.");
        }
        targetDataset = dId;
        
        // Try creating dataset
        try {
          await api.createBigQueryDataset(projectNumber, targetDataset);
        } catch (err: any) {
          if (err.message && (err.message.includes('Already Exists') || err.message.includes('409'))) {
            console.log("Dataset already exists, proceeding.");
          } else {
            throw new Error(`Failed to create BigQuery dataset: ${err.message}`);
          }
        }
      }

      if (!targetDataset) {
        throw new Error("Please select or specify a Dataset ID.");
      }

      const tId = tableId.trim();
      if (!tId) {
        throw new Error("Please enter a Table ID.");
      }

      // 1. Check if table exists in dataset
      let tables: any[] = [];
      try {
        const res = await api.listBigQueryTables(projectNumber, targetDataset);
        tables = res.tables || [];
      } catch (err: any) {
        console.warn("Failed to list tables, will attempt to create table assuming it might not exist", err);
      }

      const tableExists = tables.some((t: any) => t.tableReference?.tableId === tId);

      if (!tableExists) {
        // Create table with schema
        const schema = {
          fields: [
            { name: "user_principal", type: "STRING", mode: "REQUIRED", description: "GSuite user principal email address." },
            { name: "state", type: "STRING", mode: "NULLABLE", description: "State of license assignment (ASSIGNED, UNASSIGNED)." },
            { name: "license_config", type: "STRING", mode: "NULLABLE", description: "License configuration resource path." },
            { name: "license_config_friendly", type: "STRING", mode: "NULLABLE", description: "Friendly name of the license config." },
            { name: "license_id", type: "STRING", mode: "NULLABLE", description: "License assignment ID." },
            { name: "last_login_time", type: "TIMESTAMP", mode: "NULLABLE", description: "User last login timestamp." },
            { name: "exported_at", type: "TIMESTAMP", mode: "REQUIRED", description: "Timestamp when this record was exported." }
          ]
        };

        try {
          await api.createBigQueryTableWithSchema(projectNumber, targetDataset, tId, schema);
        } catch (err: any) {
          throw new Error(`Failed to create BigQuery table: ${err.message}`);
        }
      }

      // 2. Format rows
      const now = new Date().toISOString();
      const rows = dataToExport.map(l => {
        const resourceName = l.licenseConfig || '';
        const friendlyName = licenseNames[resourceName] || resourceName.split('/').pop() || 'N/A';
        const licenseId = l.name ? l.name.split('/').pop() : '';

        return {
          user_principal: l.userPrincipal || 'Unknown',
          state: l.licenseAssignmentState || 'N/A',
          license_config: resourceName,
          license_config_friendly: friendlyName,
          license_id: licenseId,
          last_login_time: l.lastLoginTime || null,
          exported_at: now
        };
      });

      // 3. Insert rows in chunks of 500
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await api.insertBigQueryRows(projectNumber, targetDataset, tId, chunk);
      }

      setSuccessMessage(`Successfully exported ${rows.length} records to BigQuery table '${targetDataset}.${tId}'.`);
      
      if (onExportSuccess) {
        onExportSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Failed to export to BigQuery.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = () => {
    if (exportType === 'csv') {
      handleExportCsv();
    } else {
      handleExportBigQuery();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col border border-gray-700">
        <header className="p-4 border-b border-gray-700 flex items-center bg-gray-900/40">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <h2 className="text-xl font-bold text-white">Export License Information</h2>
        </header>

        <main className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-800 rounded text-sm text-red-400">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="p-3 bg-green-900/20 border border-green-800 rounded text-sm text-green-400">
              {successMessage}
            </div>
          )}

          {/* Export Source Option */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-400">Data to Export</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportSource('filtered')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  exportSource === 'filtered'
                    ? 'border-blue-500 bg-blue-950/20 text-white'
                    : 'border-gray-700 bg-gray-900/30 text-gray-400 hover:bg-gray-900/50'
                }`}
              >
                <span className="font-semibold text-sm">Filtered Licenses</span>
                <span className="text-xs mt-1 text-gray-400">
                  {filteredUserLicenses.length} matching item{filteredUserLicenses.length !== 1 ? 's' : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setExportSource('all')}
                className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  exportSource === 'all'
                    ? 'border-blue-500 bg-blue-950/20 text-white'
                    : 'border-gray-700 bg-gray-900/30 text-gray-400 hover:bg-gray-900/50'
                }`}
              >
                <span className="font-semibold text-sm">All Licenses</span>
                <span className="text-xs mt-1 text-gray-400">
                  {userLicenses.length} total item{userLicenses.length !== 1 ? 's' : ''}
                </span>
              </button>
            </div>
          </div>

          {/* Export Type Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-400">Export Destination</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportType('csv')}
                className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center transition-colors ${
                  exportType === 'csv'
                    ? 'border-blue-500 bg-blue-950/20 text-white'
                    : 'border-gray-700 bg-gray-900/30 text-gray-400 hover:bg-gray-900/50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-semibold text-sm">Download CSV</span>
              </button>
              
              <button
                type="button"
                onClick={() => setExportType('bigquery')}
                className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center transition-colors ${
                  exportType === 'bigquery'
                    ? 'border-blue-500 bg-blue-950/20 text-white'
                    : 'border-gray-700 bg-gray-900/30 text-gray-400 hover:bg-gray-900/50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                <span className="font-semibold text-sm">BigQuery Table</span>
              </button>
            </div>
          </div>

          {/* Conditional Configuration Section */}
          {exportType === 'csv' ? (
            <div className="bg-gray-900/30 border border-gray-700 p-4 rounded-lg">
              <p className="text-xs text-gray-300">
                This option compiles the selected license data into a comma-separated values (CSV) file.
                The download will start immediately when you confirm.
              </p>
              <ul className="list-disc pl-5 mt-2 text-xs text-gray-400 space-y-1">
                <li>Includes user principal, state, config, friendly config name, and last login.</li>
                <li>Fully client-side, runs instantly.</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-4 bg-gray-900/30 border border-gray-700 p-4 rounded-lg">
              <p className="text-xs text-gray-300">
                Exporting to BigQuery appends license assignments to a target table.
                If the table does not exist, it will be created automatically with the correct schema.
              </p>

              {/* Dataset Selection */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-400">Dataset ID</label>
                {isLoadingDatasets ? (
                  <div className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-gray-400 flex items-center h-[38px]">
                    <Spinner className="w-3 h-3 mr-2" /> Loading datasets...
                  </div>
                ) : (
                  <select
                    value={selectedDatasetId}
                    onChange={(e) => setSelectedDatasetId(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                  >
                    {datasets.map(d => {
                      const id = d.datasetReference?.datasetId;
                      return <option key={id} value={id}>{id}</option>;
                    })}
                    <option value="__create_new__">+ Create New Dataset...</option>
                  </select>
                )}
              </div>

              {/* New Dataset Input */}
              {selectedDatasetId === '__create_new__' && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="block text-xs font-medium text-gray-400">New Dataset ID Name</label>
                  <input
                    type="text"
                    value={newDatasetId}
                    onChange={(e) => setNewDatasetId(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    placeholder="Enter new dataset ID"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-gray-500">Only alphanumeric characters and underscores allowed.</span>
                </div>
              )}

              {/* Table Input */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-400">Table ID</label>
                <input
                  type="text"
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="license_assignments"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-gray-500">Appends to this table. New tables will be created automatically.</span>
              </div>
            </div>
          )}
        </main>

        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          
          <button
            onClick={handleExport}
            disabled={isExporting || dataToExport.length === 0 || (exportType === 'bigquery' && selectedDatasetId === '__create_new__' && !newDatasetId)}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
          >
            {isExporting ? (
              <>
                <Spinner className="w-4 h-4 mr-2" />
                Exporting...
              </>
            ) : exportType === 'csv' ? 'Download CSV' : 'Export to BQ'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ExportLicenseModal;
