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

import React from 'react';
import { AgentFormProps, AgentType, getCompatibleReasoningEngineLocation } from './form/types';
import { useAgentForm } from '../../hooks/useAgentForm';
import { AgentBasicFields } from './form/AgentBasicFields';
import { AgentBackendConfig } from './form/AgentBackendConfig';
import { AgentCurlPreview } from './form/AgentCurlPreview';

export type { AgentFormProps, AgentType };
export { getCompatibleReasoningEngineLocation };

const AgentForm: React.FC<AgentFormProps> = ({ config, onSuccess, onCancel, agentToEdit }) => {
  const form = useAgentForm(config, agentToEdit, onSuccess);

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-2xl font-bold text-white">{agentToEdit ? 'Update Agent' : 'Register New Agent'}</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white">&larr; Back to list</button>
      </div>

      {form.isEditingDisabled && (
        <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-sm rounded-md p-3 mb-6" role="alert">
          Editing is disabled for this agent because it is a private no-code agent. Its configuration cannot be modified.
        </div>
      )}

      {form.rewriteError && <p className="text-red-400 text-sm mb-4">{form.rewriteError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Column 1: The Form */}
        <form id="agent-form" onSubmit={form.handleSubmit} className="space-y-4">
          <fieldset disabled={form.isEditingDisabled} className="space-y-4">
            <AgentBasicFields
              formData={form.formData}
              handleChange={form.handleChange}
              agentToEdit={Boolean(agentToEdit)}
              isEditingDisabled={form.isEditingDisabled}
              iconPreviewError={form.iconPreviewError}
              setIconPreviewError={form.setIconPreviewError}
              rewritingField={form.rewritingField}
              handleRewrite={form.handleRewrite}
              handleStarterPromptChange={form.handleStarterPromptChange}
              addStarterPrompt={form.addStarterPrompt}
              removeStarterPrompt={form.removeStarterPrompt}
              authIds={form.formData.authIds}
              handleAuthIdChange={form.handleAuthIdChange}
              addAuthId={form.addAuthId}
              removeAuthId={form.removeAuthId}
              authInputMode={form.authInputMode}
              setAuthInputMode={form.setAuthInputMode}
              authorizations={form.authorizations}
              isLoadingAuths={form.isLoadingAuths}
              authLoadError={form.authLoadError}
              handleLoadAuthorizations={form.handleLoadAuthorizations}
            />

            <AgentBackendConfig
              config={config}
              formData={form.formData}
              handleChange={form.handleChange}
              agentType={form.agentType}
              setAgentType={form.setAgentType}
              agentToEdit={Boolean(agentToEdit)}
              isEditingDisabled={form.isEditingDisabled}
              isCrossProject={form.isCrossProject}
              setIsCrossProject={form.setIsCrossProject}
              sourceProjectId={form.sourceProjectId}
              setSourceProjectId={form.setSourceProjectId}
              isLoadingEngines={form.isLoadingEngines}
              engineLoadError={form.engineLoadError}
              reasoningEngines={form.reasoningEngines}
              handleLoadEngines={form.handleLoadEngines}
              handleEngineSelect={form.handleEngineSelect}
              useCloudRunPicker={form.useCloudRunPicker}
              setUseCloudRunPicker={form.setUseCloudRunPicker}
              cloudRunRegion={form.cloudRunRegion}
              setCloudRunRegion={form.setCloudRunRegion}
              isLoadingServices={form.isLoadingServices}
              cloudRunServices={form.cloudRunServices}
              handleLoadServices={form.handleLoadServices}
              handleServiceSelect={form.handleServiceSelect}
              a2aStreaming={form.a2aStreaming}
              setA2aStreaming={form.setA2aStreaming}
              a2aExtensions={form.a2aExtensions}
              setA2aExtensions={form.setA2aExtensions}
            />
          </fieldset>
        </form>

        {/* Column 2: The Preview */}
        <AgentCurlPreview
          curlCommand={form.curlCommand}
          copySuccessCurl={form.copySuccessCurl}
          handleCopyCurlCommand={form.handleCopyCurlCommand}
          agentToEdit={Boolean(agentToEdit)}
        />
      </div>

      {/* Buttons and Error outside the grid */}
      <div className="mt-6">
        {form.error && <p className="text-red-400 mb-4 text-center">{form.error}</p>}
        <div className="flex justify-end space-x-3 border-t border-gray-700 pt-4">
          <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
          <button
            type="submit"
            form="agent-form"
            disabled={form.isSubmitting || form.isEditingDisabled}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed"
          >
            {form.isSubmitting ? 'Saving...' : 'Save Agent'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentForm;
