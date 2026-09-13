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
import { Config } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';

export interface CreateDataStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  config: Config;
}

export const CreateDataStoreModal: React.FC<CreateDataStoreModalProps> = ({ isOpen, onClose, onSuccess, config }) => {
  const [displayName, setDisplayName] = useState('');
  const [dataStoreId, setDataStoreId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State for advanced parser config
  const [defaultParser, setDefaultParser] = useState<'digital' | 'layout' | 'ocr'>('digital');
  const [overrides, setOverrides] = useState<Record<string, 'default' | 'digital' | 'layout' | 'ocr'>>({
    pdf: 'default',
    docx: 'default',
    xlsx: 'default',
    pptx: 'default',
    html: 'default',
  });
  const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'html'];

  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setDataStoreId('');
      setError(null);
      setStatusMessage(null);
      setDefaultParser('digital');
      setOverrides({
        pdf: 'default',
        docx: 'default',
        xlsx: 'default',
        pptx: 'default',
        html: 'default',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;
  
  const handleOverrideChange = (ext: string, value: 'default' | 'digital' | 'layout' | 'ocr') => {
    setOverrides(prev => ({ ...prev, [ext]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !dataStoreId.trim()) {
      setError("Display Name and Data Store ID are required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
        const buildDocumentProcessingConfig = () => {
            const config: any = { defaultParsingConfig: {} };
            if (defaultParser === 'layout') {
                config.defaultParsingConfig.layoutParsingConfig = {};
            } else if (defaultParser === 'ocr') {
                config.defaultParsingConfig.ocrParsingConfig = {};
            } else { // 'digital'
                config.defaultParsingConfig.digitalParsingConfig = {};
            }

            const parsingConfigOverrides: any = {};
            for (const ext of SUPPORTED_EXTENSIONS) {
                const overrideSetting = overrides[ext];
                if (overrideSetting !== 'default') {
                    parsingConfigOverrides[ext] = {};
                    if (overrideSetting === 'layout') {
                        parsingConfigOverrides[ext].layoutParsingConfig = {};
                    } else if (overrideSetting === 'ocr') {
                        parsingConfigOverrides[ext].ocrParsingConfig = {};
                    } else { // 'digital'
                        parsingConfigOverrides[ext].digitalParsingConfig = {};
                    }
                }
            }

            if (Object.keys(parsingConfigOverrides).length > 0) {
                config.parsingConfigOverrides = parsingConfigOverrides;
            }
            return config;
        };

      const payload = {
        displayName,
        industryVertical: 'GENERIC',
        solutionTypes: ["SOLUTION_TYPE_SEARCH"],
        contentConfig: "CONTENT_REQUIRED",
        documentProcessingConfig: buildDocumentProcessingConfig(),
      };
      setStatusMessage("Submitting data store creation request...");
      const operation = await api.createDataStore(dataStoreId, payload, config);
      if (operation && operation.name) {
        setStatusMessage("Provisioning Data Store in Google Cloud... (this may take 2-4 minutes)");
        const resultOp = await api.pollDiscoveryOperation(operation, config, 'v1beta', 60, 5000);
        if (!resultOp.done) {
          throw new Error(
            `Data Store creation is taking longer than expected. It is still provisioning in Google Cloud: ${operation.name}`,
          );
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create data store.');
    } finally {
      setIsSubmitting(false);
      setStatusMessage(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <header className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">Create New Data Store</h2>
          </header>
          <main className="p-6 space-y-4 overflow-y-auto">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="dataStoreId" className="block text-sm font-medium text-gray-300">Data Store ID</label>
              <input
                id="dataStoreId"
                type="text"
                value={dataStoreId}
                onChange={(e) => setDataStoreId(e.target.value)}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                pattern="[a-z0-9-]{1,63}"
                title="Must be lowercase letters, numbers, and hyphens, up to 63 characters."
                required
              />
              <p className="mt-1 text-xs text-gray-400">A unique ID for the data store. Must use lowercase, numbers, and hyphens.</p>
            </div>
            
            <div className="pt-4 border-t border-gray-700">
              <h3 className="text-lg font-semibold text-white">Document Processing Configuration</h3>
              <p className="text-xs text-gray-400 mt-1 mb-3">
                Specify how to parse documents for ingestion.
                <a href="https://cloud.google.com/generative-ai-app-builder/docs/parse-chunk-documents" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">
                  Learn more about parsing and chunking.
                </a>
              </p>
              
              <div className="space-y-4">
                <div>
                    <label htmlFor="defaultParser" className="block text-sm font-medium text-gray-300">Default Parser</label>
                    <select
                        id="defaultParser"
                        value={defaultParser}
                        onChange={(e) => setDefaultParser(e.target.value as 'digital' | 'layout' | 'ocr')}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm h-10"
                    >
                        <option value="digital">Digital Parser - Default for all file types unless overridden.</option>
                        <option value="layout">Layout Parser - Recommended for HTML, PDF, or DOCX files for RAG.</option>
                        <option value="ocr">OCR Parser - For scanned PDFs or PDFs with text inside images.</option>
                    </select>
                </div>

                <div>
                    <h4 className="text-md font-medium text-gray-300 mb-2">Parser Overrides</h4>
                    <div className="space-y-2 bg-gray-900/50 p-3 rounded-md">
                        {SUPPORTED_EXTENSIONS.map(ext => (
                            <div key={ext} className="grid grid-cols-3 items-center gap-4">
                                <label htmlFor={`override-${ext}`} className="text-sm font-mono text-gray-300 justify-self-end">.{ext}</label>
                                <select
                                    id={`override-${ext}`}
                                    value={overrides[ext]}
                                    onChange={(e) => handleOverrideChange(ext, e.target.value as 'default' | 'digital' | 'layout' | 'ocr')}
                                    className="col-span-2 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm h-9"
                                >
                                    <option value="default">Use Default ({defaultParser})</option>
                                    <option value="digital">Digital Parser</option>
                                    <option value="layout">Layout Parser</option>
                                    <option value="ocr">OCR Parser</option>
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
              </div>
            </div>

            {statusMessage && (
              <div className="p-3 bg-blue-900/40 border border-blue-600/50 rounded-md flex items-center space-x-3 text-sm text-blue-200">
                <Spinner className="h-4 w-4 border-2 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </main>
          <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3 shrink-0">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800 flex items-center gap-2">
              {isSubmitting && <Spinner className="h-4 w-4 border-2 shrink-0" />}
              {isSubmitting ? (statusMessage ? 'Provisioning...' : 'Creating...') : 'Create'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default CreateDataStoreModal;
