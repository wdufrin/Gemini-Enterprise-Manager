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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Config } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import { useModalA11y } from '../../hooks/useModalA11y';

interface NotebookListViewerProps {
  config: Config;
}

const NotebookListViewer: React.FC<NotebookListViewerProps> = ({ config }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [notebooks, setNotebooks] = useState<any[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useModalA11y({
    isOpen: !!selectedNotebook,
    onClose: () => setSelectedNotebook(null),
    containerRef: modalRef,
  });

  const fetchNotebooks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listNotebooks(config);
      setNotebooks(response.notebooks || []);
    } catch (err: any) {
      console.error("Failed to fetch notebooks", err);
      setError(err.message || 'Failed to fetch notebooks.');
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);


  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-900/20 border border-red-800 rounded-lg text-center shadow-inner">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-medium text-red-400 mb-1">Failed to load Notebooks</h3>
        <p className="text-sm text-red-300">{error}</p>
        <div className="mt-4 flex justify-center">
          <button onClick={fetchNotebooks} className="px-4 py-2 bg-red-800/50 hover:bg-red-700/50 text-white text-sm font-medium rounded-md transition-colors border border-red-700/50">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (notebooks.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700/50">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <h3 className="text-lg font-medium text-gray-300 mb-1">No Notebooks Found</h3>
        <p className="text-sm text-gray-500">There are no NotebookLM projects in this Gemini Enterprise environment.</p>
        <button
          onClick={fetchNotebooks}
          className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-md transition-colors"
        >
          Refresh List
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-700">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
              <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
            </svg>
            NotebookLM Projects ({notebooks.length})
          </h3>
          <p className="text-sm text-gray-400 mt-1">Recently viewed notebooks in this environment.</p>
        </div>
        <button
          onClick={fetchNotebooks}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md text-gray-300 transition-colors tooltip-trigger"
          title="Refresh List"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {notebooks.map((notebook) => (
          <div
            key={notebook.name}
            onClick={() => setSelectedNotebook(notebook)}
            className="bg-gray-800 rounded-lg p-5 shadow-md border border-gray-700 hover:border-indigo-500/50 hover:bg-gray-750 transition-all flex flex-col h-full group cursor-pointer"
          >
            <div className="flex-1">
              <h4 className="font-semibold text-white text-lg mb-2 line-clamp-2 leading-tight group-hover:text-indigo-300 transition-colors">
                {notebook.title || notebook.displayName || 'Untitled Notebook'}
              </h4>
              <div className="mt-4 space-y-2">
                <div className="text-xs flex flex-col gap-1">
                  <span className="text-gray-500 uppercase font-semibold">Created</span>
                  <span className="text-gray-300 bg-gray-900/50 px-2 py-1 rounded w-fit italic">
                    {notebook.metadata?.createTime ? new Date(notebook.metadata.createTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                  </span>
                </div>
                <div className="text-xs flex flex-col gap-1">
                  <span className="text-gray-500 uppercase font-semibold">Last Modified</span>
                  <span className="text-gray-300 bg-gray-900/50 px-2 py-1 rounded w-fit italic">
                    {notebook.metadata?.lastViewed ? new Date(notebook.metadata.lastViewed).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-700/50 flex justify-end">
              <div className="text-[10px] font-mono text-gray-600 truncate max-w-full" title={notebook.name}>
                ID: {notebook.name.split('/').pop()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* JSON Details Modal */}
      {selectedNotebook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-10 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notebook-details-title"
          onClick={() => setSelectedNotebook(null)}
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-4xl max-h-full flex flex-col"
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 id="notebook-details-title" className="text-lg font-bold text-white">
                Notebook Details: {selectedNotebook.title || selectedNotebook.displayName || 'Untitled Notebook'}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedNotebook(null)}
                aria-label="Close dialog"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 max-h-[70vh] flex flex-col gap-6">

              {/* Highlight extracted sources before raw dump */}
              {selectedNotebook?.sources && selectedNotebook.sources.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-gray-300 mb-3 border-b border-gray-700 pb-2">
                    Notebook Sources ({selectedNotebook.sources.length})
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedNotebook.sources.map((source: any, i: number) => {
                      const webUrl = source.metadata?.webpageMetadata?.webpageUrl || source.webScrapeConfig?.url || source.url;
                      const driveMime = source.metadata?.googleDocsMetadata?.mimeType;
                      const ytUrl = source.metadata?.youtubeMetadata?.youtubeUrl || source.metadata?.youtubeMetadata?.uri;

                      return (
                        <div key={source.name || i} className="bg-gray-750 p-3 rounded border border-gray-700 flex flex-col">
                          <span className="font-medium text-indigo-300 text-sm">{source.title || source.displayName || 'Untitled Source'}</span>
                          <span className="text-xs text-gray-500 mt-1 truncate">
                            {webUrl ? `Web: ${webUrl}` : driveMime ? `Google Drive (${driveMime})` : ytUrl ? `YouTube: ${ytUrl}` : 'Text / Document Source'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-md font-semibold text-gray-300 mb-2">Raw JSON Metadata</h4>
                <pre className="bg-gray-900 border border-gray-700 text-gray-300 p-4 rounded-md text-xs font-mono overflow-x-auto max-h-[400px]">
                  {JSON.stringify(selectedNotebook, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebookListViewer;
