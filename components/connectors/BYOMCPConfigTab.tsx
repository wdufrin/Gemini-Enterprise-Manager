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

import React, { useState, useRef } from 'react';
import { BYOMCPConfigTabProps } from './byomcp/types';
import { useBYOMCPConfig } from '../../hooks/useBYOMCPConfig';
import { AgentGuidelinesSection } from './byomcp/AgentGuidelinesSection';
import { DiscoveredToolsSection } from './byomcp/DiscoveredToolsSection';
import { CitationMappingsSection } from './byomcp/CitationMappingsSection';
import { AuthSettingsSection } from './byomcp/AuthSettingsSection';
import { AdvancedParamsSection } from './byomcp/AdvancedParamsSection';
import { RawJsonEditorSection } from './byomcp/RawJsonEditorSection';
import { BYOMCPFooterActions } from './byomcp/BYOMCPFooterActions';

type VisualSectionFilter = 'all' | 'tools' | 'guidelines' | 'auth';

const BYOMCPConfigTab: React.FC<BYOMCPConfigTabProps> = ({
  connector,
  config,
  onConnectorUpdated,
  onRefreshSuccess,
}) => {
  const [sectionFilter, setSectionFilter] = useState<VisualSectionFilter>('all');
  const [focusedCitationTool, setFocusedCitationTool] = useState<string | null>(null);
  const citationsContainerRef = useRef<HTMLDivElement>(null);

  const {
    editorMode,
    mcpServerDescription,
    setMcpServerDescription,
    mcpAgentInstructions,
    setMcpAgentInstructions,
    instanceUri,
    setInstanceUri,
    authType,
    setAuthType,
    scopes,
    setScopes,
    authUri,
    setAuthUri,
    tokenUri,
    setTokenUri,
    authUriParams,
    setAuthUriParams,
    clientId,
    setClientId,
    clientSecret,
    setClientSecret,
    showClientSecret,
    setShowClientSecret,
    citationMappings,
    customActionParams,
    dynamicTools,
    isRefreshingTools,
    refreshToolsError,
    refreshToolsSuccess,
    refreshInterval,
    setRefreshInterval,
    staticIpEnabled,
    setStaticIpEnabled,
    rawJsonText,
    setRawJsonText,
    rawJsonError,
    setRawJsonError,
    customUpdateMask,
    setCustomUpdateMask,
    useAutoUpdateMask,
    setUseAutoUpdateMask,
    isSaving,
    saveSuccess,
    saveError,
    copiedCurl,
    copiedJson,
    showAdvancedAuth,
    setShowAdvancedAuth,
    isTestingConnectivity,
    connectivityResult,
    targetedPayload,
    computedUpdateMask,
    handleSwitchMode,
    handleTestConnectivity,
    handleRefreshToolsFromEndpoint,
    handleProbeLiveTool,
    handleApplyPreset,
    handleToggleTool,
    handleToggleAllTools,
    handleAddCitationMapping,
    handleUpdateCitationMapping,
    handleRemoveCitationMapping,
    handleClearAllCitationMappings,
    handleAddCustomParam,
    handleUpdateCustomParam,
    handleRemoveCustomParam,
    handleCopyCurl,
    handleCopyJson,
    handleBeautifyJson,
    handleSave,
  } = useBYOMCPConfig({
    connector,
    config,
    onConnectorUpdated,
    onRefreshSuccess,
  });

  const handleConfigureToolCitations = (toolName: string) => {
    const alreadyMapped = citationMappings.some((r) => r.toolName === toolName);
    if (!alreadyMapped) {
      const defaultRule = citationMappings.find((r) => r.toolName === '');
      handleAddCitationMapping({
        toolName,
        items: defaultRule ? '' : '/results',
        itemsIsRoot: false,
        uri: defaultRule?.uri ? '' : '/link',
        title: defaultRule?.title ? '' : '/name',
        snippet: '',
        id: '',
      });
    }
    setFocusedCitationTool(toolName);
    if (sectionFilter !== 'all' && sectionFilter !== 'tools') {
      setSectionFilter('tools');
    }
    if (typeof citationsContainerRef.current?.scrollIntoView === 'function') {
      citationsContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const enabledToolsCount = dynamicTools.filter((t) => t.enabled).length;

  return (
    <div className="space-y-5 animate-fadeIn text-gray-200">
      {/* Top Header & Mode Switcher */}
      <div className="bg-gray-900/80 p-4 rounded-lg border border-gray-700/80 space-y-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                BYOMCP Connector Settings & Configuration
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                BYO_MCP
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Configure MCP server endpoint, discovered tools, RFC 6901 citation mappings, agent guidelines, and OAuth/API key settings.
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-950 p-1 rounded-lg border border-gray-800 shrink-0">
            <button
              type="button"
              onClick={() => handleSwitchMode('visual')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                editorMode === 'visual'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              Visual Form
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('json')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                editorMode === 'json'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5 font-mono" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Raw JSON Editor
            </button>
          </div>
        </div>

        {/* Section Focus Filter Pills (Visual Mode) */}
        {editorMode === 'visual' && (
          <div
            className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-gray-800"
            role="group"
            aria-label="Filter configuration sections"
          >
            <span className="text-[11px] font-semibold text-gray-400 mr-1">Focus view:</span>
            <button
              type="button"
              onClick={() => setSectionFilter('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sectionFilter === 'all'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              All Sections
            </button>
            <button
              type="button"
              onClick={() => setSectionFilter('tools')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                sectionFilter === 'tools'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              <span>Endpoint, Tools &amp; Citations</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-900/90 text-purple-300 border border-purple-800/60">
                {enabledToolsCount}/{dynamicTools.length} tools &bull; {citationMappings.length} rules
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSectionFilter('guidelines')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sectionFilter === 'guidelines'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              Agent Guidelines
            </button>
            <button
              type="button"
              onClick={() => setSectionFilter('auth')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                sectionFilter === 'auth'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              <span>Auth &amp; Advanced Sync</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-gray-900/90 text-gray-300 border border-gray-700">
                {authType}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-3 bg-green-950/40 border border-green-800 text-green-300 rounded-lg text-xs flex items-center gap-2 animate-fadeIn">
          <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          BYOMCP settings successfully updated in Discovery Engine!
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-lg text-xs flex items-start gap-2 animate-fadeIn">
          <svg className="w-4 h-4 shrink-0 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <div className="font-semibold">Failed to save settings:</div>
            <div className="mt-0.5">{saveError}</div>
          </div>
        </div>
      )}

      {/* VISUAL FORM MODE */}
      {editorMode === 'visual' ? (
        <div className="space-y-5">
          {(sectionFilter === 'all' || sectionFilter === 'guidelines') && (
            <AgentGuidelinesSection
              mcpServerDescription={mcpServerDescription}
              setMcpServerDescription={setMcpServerDescription}
              mcpAgentInstructions={mcpAgentInstructions}
              setMcpAgentInstructions={setMcpAgentInstructions}
              onApplyPreset={handleApplyPreset}
            />
          )}

          {(sectionFilter === 'all' || sectionFilter === 'tools') && (
            <>
              <DiscoveredToolsSection
                instanceUri={instanceUri}
                setInstanceUri={setInstanceUri}
                isTestingConnectivity={isTestingConnectivity}
                connectivityResult={connectivityResult}
                onTestConnectivity={handleTestConnectivity}
                isRefreshingTools={isRefreshingTools}
                refreshToolsSuccess={refreshToolsSuccess}
                refreshToolsError={refreshToolsError}
                onRefreshTools={handleRefreshToolsFromEndpoint}
                dynamicTools={dynamicTools}
                onToggleTool={handleToggleTool}
                onToggleAllTools={handleToggleAllTools}
                citationMappings={citationMappings}
                onConfigureToolCitations={handleConfigureToolCitations}
              />

              <div ref={citationsContainerRef}>
                <CitationMappingsSection
                  citationMappings={citationMappings}
                  dynamicTools={dynamicTools}
                  onAddCitationMapping={handleAddCitationMapping}
                  onUpdateCitationMapping={handleUpdateCitationMapping}
                  onRemoveCitationMapping={handleRemoveCitationMapping}
                  onClearAllCitationMappings={handleClearAllCitationMappings}
                  focusedToolName={focusedCitationTool}
                  instanceUri={instanceUri}
                  onProbeLiveTool={handleProbeLiveTool}
                />
              </div>
            </>
          )}

          {(sectionFilter === 'all' || sectionFilter === 'auth') && (
            <>
              <AuthSettingsSection
                showAdvancedAuth={showAdvancedAuth}
                setShowAdvancedAuth={setShowAdvancedAuth}
                authType={authType}
                setAuthType={setAuthType}
                scopes={scopes}
                setScopes={setScopes}
                authUri={authUri}
                setAuthUri={setAuthUri}
                tokenUri={tokenUri}
                setTokenUri={setTokenUri}
                authUriParams={authUriParams}
                setAuthUriParams={setAuthUriParams}
                clientId={clientId}
                setClientId={setClientId}
                clientSecret={clientSecret}
                setClientSecret={setClientSecret}
                showClientSecret={showClientSecret}
                setShowClientSecret={setShowClientSecret}
              />

              <AdvancedParamsSection
                refreshInterval={refreshInterval}
                setRefreshInterval={setRefreshInterval}
                staticIpEnabled={staticIpEnabled}
                setStaticIpEnabled={setStaticIpEnabled}
                customActionParams={customActionParams}
                onAddCustomParam={handleAddCustomParam}
                onUpdateCustomParam={handleUpdateCustomParam}
                onRemoveCustomParam={handleRemoveCustomParam}
              />
            </>
          )}
        </div>
      ) : (
        /* RAW JSON EDITOR MODE */
        <RawJsonEditorSection
          rawJsonText={rawJsonText}
          setRawJsonText={setRawJsonText}
          rawJsonError={rawJsonError}
          setRawJsonError={setRawJsonError}
          useAutoUpdateMask={useAutoUpdateMask}
          setUseAutoUpdateMask={setUseAutoUpdateMask}
          computedUpdateMask={computedUpdateMask}
          customUpdateMask={customUpdateMask}
          setCustomUpdateMask={setCustomUpdateMask}
          targetedPayload={targetedPayload}
          onBeautifyJson={handleBeautifyJson}
        />
      )}

      {/* Action Buttons & cURL preview */}
      <BYOMCPFooterActions
        copiedCurl={copiedCurl}
        onCopyCurl={handleCopyCurl}
        copiedJson={copiedJson}
        onCopyJson={handleCopyJson}
        computedUpdateMask={computedUpdateMask}
        isSaving={isSaving}
        disableSave={isSaving || (editorMode === 'json' && Boolean(rawJsonError))}
        onSave={handleSave}
      />
    </div>
  );
};

export default BYOMCPConfigTab;
