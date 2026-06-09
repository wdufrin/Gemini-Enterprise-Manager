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

import React, { useState } from 'react';
import { Page } from '../types';
import { useGlobalDebug, ApiHistoryItem } from '../context/GlobalDebugContext';
import CurlDetailsModal from './CurlDetailsModal';
// ... imports

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  onShowInfo: (infoKey: string) => void;
}

const NavItem: React.FC<{
  page: Page;
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  icon: React.ReactElement;
  onShowInfo: (infoKey: string) => void;
}> = ({ page, currentPage, setCurrentPage, icon, onShowInfo }) => {
  const isCurrent = currentPage === page;

  return (
    <div className="flex items-center w-full group mb-1">
      <button
        onClick={() => setCurrentPage(page)}
        className={`flex items-center flex-grow pl-4 pr-2 py-2 text-sm font-medium rounded-l-lg transition-colors duration-200 focus:outline-none focus:z-10 ${
          isCurrent
            ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:bg-gray-700 hover:text-white'
        }`}
      >
        <span className="w-5 h-5 flex-shrink-0">{icon}</span>
        <span className="ml-3 truncate">{page}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onShowInfo(page);
        }}
        className={`px-2 py-2 h-full rounded-r-lg transition-colors duration-200 focus:outline-none focus:z-10 ${
          isCurrent
            ? 'bg-blue-600 text-blue-200 hover:bg-blue-500 hover:text-white'
          : 'text-gray-500 hover:bg-gray-700 hover:text-white'
        }`}
        title={`Show API commands for ${page}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage, onShowInfo }) => {
  const { showCurlPreview, setShowCurlPreview, apiHistory, clearHistory } = useGlobalDebug();
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ApiHistoryItem | null>(null);
  const [filterGet, setFilterGet] = useState(false);

  const filteredHistory = apiHistory.filter(item => !filterGet || item.method !== 'GET');

  const navCategories = [
    {
      title: "Agent Management",
      items: [
        { page: Page.AGENTS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg> },
        { page: Page.AGENT_BUILDER, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg> },
        { page: Page.AGENT_CATALOG, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg> },

        { page: Page.AGENT_ENGINES, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" /><path d="M2 10a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" /><path d="M2 16a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" /></svg> },
        // { page: Page.DIALOGFLOW_AGENTS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" /></svg> },
        // { page: Page.CLOUD_RUN_AGENTS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg> },
      ]
    },
    {
      title: "Knowledge & Resources",
      items: [
        { page: Page.DATA_STORES, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" /><path d="M3 8a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" /><path d="M3 12a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" /></svg> },
        { page: Page.GE_QUOTA_USAGE, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg> },
      ]
    },
    {
      title: "Testing & Analysis",
      items: [
        // { page: Page.CHAT, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" /></svg> },
        // { page: Page.A2A_TESTER, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm0 2v10h12V5H3z" clipRule="evenodd"/></svg> }, // Simple square for now as icon wasn't in original list
        { page: Page.ASSISTANT, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h2a2 2 0 002-2V4a2 2 0 00-2-2H9z" /><path d="M4 12a2 2 0 012-2h10a2 2 0 110 4H6a2 2 0 01-2-2z" /></svg> },
        { page: Page.CONNECTORS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" /></svg> },
        { page: Page.ARCHITECTURE, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 1a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-1z" /></svg> },
      ]
    },
    {
      title: "Security & Access",
      items: [
        { page: Page.AUTHORIZATIONS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" /></svg> },
        { page: Page.AGENT_PERMISSIONS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg> },
        { page: Page.MODEL_ARMOR, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2L3 5v6c0 3.55 3.14 6.84 7 7.93 3.86-1.09 7-4.38 7-7.93V5l-7-3z" /></svg> },
        { page: Page.OBSERVABILITY, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg> },
      ]
    },
    {
      title: "System",
      items: [
        { page: Page.BACKUP_RECOVERY, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" /></svg> },
        { page: Page.LICENSE, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4 4h3a3 3 0 006 0h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45 4a2.5 2.5 0 10-4.9 0h4.9zM12 9a1 1 0 100 2h3a1 1 0 100-2h-3zm-1 4a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd" /></svg> },
        { page: Page.VANITY_URLS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" /></svg> },
      ]
    }
  ];

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center p-4 bg-gray-900 border-b border-gray-800 shrink-0 h-16">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <div className="flex flex-col ml-3 justify-center">
            <span className="text-lg font-bold text-gray-100 tracking-tight leading-none">Gemini Enterprise</span>
            <span className="text-[10px] text-gray-500 font-mono mt-1">v0.0609.277</span>
        </div>
      </div>
      
      {/* Scrollable Navigation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
        {navCategories.map((group, index) => (
          <div key={index} className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {group.title}
            </h3>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavItem
                  key={item.page}
                  page={item.page}
                  currentPage={currentPage}
                  setCurrentPage={setCurrentPage}
                  icon={item.icon}
                  onShowInfo={onShowInfo}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Debug Settings Section */}
        <div className="pt-4 border-t border-gray-800 mt-4">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Settings & Debug
          </h3>
          <div className="px-3">
            <label className="flex items-center space-x-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={showCurlPreview}
                  onChange={(e) => setShowCurlPreview(e.target.checked)}
                />
                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </div>
              <span className="text-sm font-medium text-gray-400 group-hover:text-gray-300">
                Show Interaction Details
              </span>
            </label>
            <p className="text-[10px] text-gray-600 mt-1 ml-1 mb-2">
              Intercepts save actions to show cURL commands.
            </p>
          </div>

          {/* API History List */}
          {showCurlPreview && apiHistory.length > 0 && (
            <div className="mt-4 px-3">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    History ({filteredHistory.length})
                  </h4>
                  <button
                    onClick={() => setFilterGet(!filterGet)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${filterGet
                      ? 'bg-blue-900/50 text-blue-300 border-blue-800'
                      : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
                      }`}
                    title="Toggle GET requests"
                  >
                    {filterGet ? 'No GET' : 'All'}
                  </button>
                </div>
                <button
                  onClick={clearHistory}
                  className="text-[10px] text-red-400 hover:text-red-300 uppercase"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                {filteredHistory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedHistoryItem(item)}
                    className="w-full text-left p-2 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-colors group"
                  >


                    <div className="flex justify-between items-start">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.method === 'GET' ? 'bg-blue-900 text-blue-200' :
                        item.method === 'POST' ? 'bg-green-900 text-green-200' :
                          item.method === 'PATCH' ? 'bg-yellow-900 text-yellow-200' :
                            item.method === 'DELETE' ? 'bg-red-900 text-red-200' :
                              'bg-gray-700 text-gray-300'
                        }`}>
                        {item.method}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-300 truncate font-mono" title={item.url}>
                      {item.url.split('/').pop()?.split('?')[0] || item.url}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>


        {/* Footer padding to ensure last items are clickable */}
        <div className="h-4"></div>
      </div>

      <CurlDetailsModal
        isOpen={!!selectedHistoryItem}
        onClose={() => setSelectedHistoryItem(null)}
        curlCommand={selectedHistoryItem?.curlCommand || ''}
        title={`API Details: ${selectedHistoryItem?.method} ${selectedHistoryItem?.url.split('/').pop()?.split('?')[0]}`}
      />

    </aside>
  );
};

export default Sidebar;
