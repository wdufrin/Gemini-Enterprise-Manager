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

import React, { useMemo, useRef } from 'react';
import Spinner from '../Spinner';
import { useDataStoreQuery } from '../../hooks/useDataStoreQuery';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  DataStoreQueryModalProps,
  SearchResultItem,
  QueryHistoryEntry,
  CodeLanguage,
  AuthMode,
  TOKEN_TYPE_OPTIONS,
} from './query/types';
import { CodeBlock, generateCodeSnippets, QueryCodePanel } from './query/QueryCodeGenerator';
import { WifAuthPanel } from './query/WifAuthPanel';
import { QueryHistoryList, getDocumentPreview } from './query/QueryHistoryList';

export type { DataStoreQueryModalProps, SearchResultItem, QueryHistoryEntry, CodeLanguage, AuthMode };
export { CodeBlock, getDocumentPreview, TOKEN_TYPE_OPTIONS };

const DataStoreQueryModal: React.FC<DataStoreQueryModalProps> = ({ isOpen, onClose, dataStore, config }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const queryState = useDataStoreQuery(isOpen, dataStore, config);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: queryState.isSearching || queryState.isExchangingToken,
  });

  const dataStoreId = dataStore.name.split('/').pop() || '';

  const generatedCode = useMemo(() => {
    return generateCodeSnippets({
      projectId: queryState.projectId,
      location: queryState.location,
      dataStoreId,
      dataStoreName: dataStore.name,
      codeQuery: queryState.codeQuery,
      pageSize: queryState.pageSize,
      authMode: queryState.authMode,
      wifPoolId: queryState.wifPoolId,
      wifProviderId: queryState.wifProviderId,
      wifSubjectTokenType: queryState.wifSubjectTokenType,
    });
  }, [
    queryState.projectId,
    queryState.location,
    dataStoreId,
    dataStore.name,
    queryState.codeQuery,
    queryState.pageSize,
    queryState.authMode,
    queryState.wifPoolId,
    queryState.wifProviderId,
    queryState.wifSubjectTokenType,
  ]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="query-datastore-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !(queryState.isSearching || queryState.isExchangingToken)) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
          <div>
            <h2 id="query-datastore-title" className="text-xl font-bold text-white flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Query Data Store
            </h2>
            <p className="text-sm text-gray-400 mt-1 font-mono">{dataStoreId}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => queryState.setShowCodePanel(prev => !prev)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
                queryState.showCodePanel ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
              }`}
              title="View exportable code snippets"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              {queryState.showCodePanel ? 'Hide Code' : 'View Code'}
            </button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
          </div>
        </header>

        {/* Settings Bar */}
        <div className="px-4 py-2 border-b border-gray-700 bg-gray-900/50 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="pageSize" className="text-sm text-gray-400">Results per query:</label>
              <select
                id="pageSize"
                value={queryState.pageSize}
                onChange={(e) => queryState.setPageSize(Number(e.target.value))}
                className="bg-gray-700 border-gray-600 rounded-md text-sm text-gray-200 h-8 px-2"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* Auth Mode Toggle */}
            <div className="flex items-center gap-2 ml-4">
              <label className="text-sm text-gray-400">Auth:</label>
              <div className="flex rounded-md overflow-hidden border border-gray-600">
                <button
                  type="button"
                  onClick={() => { queryState.setAuthMode('default'); queryState.setShowWifConfig(false); }}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    queryState.authMode === 'default' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => { queryState.setAuthMode('wif'); queryState.setShowWifConfig(true); }}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    queryState.authMode === 'wif' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  WIF
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500 ml-auto">
              Serving Config: <span className="font-mono text-gray-400">default_serving_config</span>
            </div>
          </div>

          {/* WIF Configuration Panel */}
          <WifAuthPanel
            authMode={queryState.authMode}
            showWifConfig={queryState.showWifConfig}
            setShowWifConfig={queryState.setShowWifConfig}
            wifPoolId={queryState.wifPoolId}
            setWifPoolId={queryState.setWifPoolId}
            wifProviderId={queryState.wifProviderId}
            setWifProviderId={queryState.setWifProviderId}
            availablePools={queryState.availablePools}
            availableProviders={queryState.availableProviders}
            isLoadingPools={queryState.isLoadingPools}
            isLoadingProviders={queryState.isLoadingProviders}
            handleSignIn={queryState.handleSignIn}
            isSigningIn={queryState.isSigningIn}
            wifSignedInEmail={queryState.wifSignedInEmail}
            wifProviderDisplayName={queryState.wifProviderDisplayName}
            wifSubjectToken={queryState.wifSubjectToken}
            setWifSubjectToken={queryState.setWifSubjectToken}
            wifSubjectTokenType={queryState.wifSubjectTokenType}
            setWifSubjectTokenType={queryState.setWifSubjectTokenType}
            setWifSignedInEmail={queryState.setWifSignedInEmail}
            wifTokenError={queryState.wifTokenError}
            wifAccessToken={queryState.wifAccessToken}
            showManualToken={queryState.showManualToken}
            setShowManualToken={queryState.setShowManualToken}
          />
        </div>

        {/* Main Content Area */}
        <div className={`flex-1 overflow-hidden flex ${queryState.showCodePanel ? 'divide-x divide-gray-700' : ''}`}>
          <QueryHistoryList
            history={queryState.history}
            isSearching={queryState.isSearching}
            expandedResult={queryState.expandedResult}
            toggleExpandResult={queryState.toggleExpandResult}
            resultsEndRef={queryState.resultsEndRef}
            showCodePanel={queryState.showCodePanel}
          />

          {queryState.showCodePanel && (
            <QueryCodePanel
              codeLanguage={queryState.codeLanguage}
              setCodeLanguage={queryState.setCodeLanguage}
              generatedCode={generatedCode}
              authMode={queryState.authMode}
            />
          )}
        </div>

        {/* Search Footer */}
        <footer className="p-4 border-t border-gray-700 shrink-0">
          <form onSubmit={queryState.handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={queryState.query}
              onChange={(e) => queryState.setQuery(e.target.value)}
              placeholder={queryState.authMode === 'wif' ? (queryState.isWifSignedIn ? 'Enter query (authenticated via WIF)...' : 'Sign in above first, then enter your query...') : 'Enter your search query...'}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
              disabled={queryState.isSearching}
              autoFocus
            />
            <button
              type="submit"
              disabled={queryState.isSearching || !queryState.query.trim() || (queryState.authMode === 'wif' && !queryState.isWifConfigValid)}
              className={`px-5 py-2 font-semibold rounded-md flex items-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed ${
                queryState.authMode === 'wif'
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              title={queryState.authMode === 'wif' && !queryState.isWifConfigValid ? 'Sign in with your identity provider first' : undefined}
            >
              {queryState.isExchangingToken ? (
                <>
                  <Spinner />
                  Exchanging Token...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {queryState.authMode === 'wif' ? 'Search (WIF)' : 'Search'}
                </>
              )}
            </button>
          </form>
          {queryState.authMode === 'wif' && !queryState.isWifSignedIn && (
            <p className="text-xs text-amber-400 mt-1.5 ml-1">
              Enter your Pool ID and Provider ID above, then click &quot;Sign In with Identity Provider&quot; to authenticate.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
};

export default DataStoreQueryModal;
