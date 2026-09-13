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
import InfoTooltip from '../InfoTooltip';
import { AssistantDetailsFormProps, ALL_REASONING_ENGINE_LOCATIONS } from './form/types';
import { useAssistantDetailsForm } from '../../hooks/useAssistantDetailsForm';
import { ModelArmorSection } from './form/ModelArmorSection';
import { AssistantIamSection } from './form/AssistantIamSection';
import { AgentConfigsSection } from './form/AgentConfigsSection';
import { FeatureManagementSection, CollapsibleSection } from './form/FeatureManagementSection';

export type { AssistantDetailsFormProps };
export { ALL_REASONING_ENGINE_LOCATIONS };

const AssistantDetailsForm: React.FC<AssistantDetailsFormProps> = ({ assistant, config, onUpdateSuccess }) => {
  const form = useAssistantDetailsForm(assistant, config, onUpdateSuccess);

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">Assistant Editor</h2>
      <form onSubmit={form.handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="flex items-center text-sm font-medium text-gray-300">
            Display Name (Read-only)
            <InfoTooltip text="The name of the assistant as shown to users. This is currently read-only." />
          </label>
          <input
            type="text"
            id="displayName"
            name="displayName"
            value={form.formData.displayName}
            className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed px-3 py-2"
            required
            disabled
          />
        </div>

        <div>
          <label htmlFor="webGroundingType" className="flex items-center text-sm font-medium text-gray-300">
            Web Grounding Type
            <InfoTooltip text="Enables the assistant to use Google Search or Enterprise Web Search for grounding its responses." />
          </label>
          <select
            id="webGroundingType"
            name="webGroundingType"
            value={form.formData.webGroundingType}
            onChange={form.handleChange}
            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-white px-3 py-2"
          >
            <option value="WEB_GROUNDING_TYPE_DISABLED">Disabled</option>
            <option value="WEB_GROUNDING_TYPE_GOOGLE_SEARCH">Google Search (not Data Residency compliant)</option>
            <option value="WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH">Enterprise Web Search (Data Residency compliant)</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="additionalSystemInstruction" className="flex items-center text-sm font-medium text-gray-300">
              System & Style Instructions
              <InfoTooltip text="Core instructions that define the assistant's behavior, persona, and response formatting guidelines." />
            </label>
            {form.formData.additionalSystemInstruction && (
              <span className="text-[11px] text-orange-400 font-medium flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                User-added instructions may impact Gemini Enterprise behavior
              </span>
            )}
          </div>
          <textarea
            id="additionalSystemInstruction"
            name="additionalSystemInstruction"
            value={form.formData.additionalSystemInstruction}
            onChange={form.handleChange}
            rows={7}
            placeholder="Enter system persona instructions, behavioral guidelines, and formatting rules..."
            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-gray-100 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 font-mono p-3"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Unified configuration for system instructions and style formatting guidelines.
          </p>
        </div>

        <div>
          <label htmlFor="chatHistoryRetentionDays" className="flex items-center text-sm font-medium text-gray-300">
            Chat History Retention (Days)
            <InfoTooltip text="Number of days to retain chat history. stored in Customer Policy." />
          </label>
          <input
            type="number"
            id="chatHistoryRetentionDays"
            name="chatHistoryRetentionDays"
            value={form.formData.chatHistoryRetentionDays}
            onChange={form.handleChange}
            min="1"
            placeholder="e.g. 30"
            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-white px-3 py-2"
          />
        </div>

        {/* Model Armor & Customer Policy */}
        <ModelArmorSection
          customerPolicy={form.formData.customerPolicy}
          handleChange={form.handleChange}
          templates={form.templates}
          selectedInputTemplate={form.selectedInputTemplate}
          selectedOutputTemplate={form.selectedOutputTemplate}
          failureMode={form.failureMode}
          armorEnabled={form.armorEnabled}
          handleInputTemplateChange={form.handleInputTemplateChange}
          handleOutputTemplateChange={form.handleOutputTemplateChange}
          handleFailureModeChange={form.handleFailureModeChange}
        />

        {/* Feature Management & Advanced Config */}
        <FeatureManagementSection
          enableEndUserAgentCreation={form.formData.enableEndUserAgentCreation}
          disableLocationContext={form.formData.disableLocationContext}
          defaultWebGroundingToggleOff={form.formData.defaultWebGroundingToggleOff}
          vertexAiSearchToolConfig={form.formData.vertexAiSearchToolConfig}
          handleChange={form.handleChange}
        />

        {/* App-level IAM Permissions */}
        <CollapsibleSection title="App-level IAM Permissions">
          <AssistantIamSection
            isLoadingIam={form.isLoadingIam}
            iamError={form.iamError}
            iamPolicy={form.iamPolicy}
            memberType={form.memberType}
            setMemberType={form.setMemberType}
            newMember={form.newMember}
            setNewMember={form.setNewMember}
            handleAddIamMember={form.handleAddIamMember}
            handleRemoveIamMember={form.handleRemoveIamMember}
          />
        </CollapsibleSection>

        {/* Attached Vertex AI Agent Configs */}
        <AgentConfigsSection
          agentConfigs={form.agentConfigs}
          handleRemoveAgentConfig={form.handleRemoveAgentConfig}
        />

        {form.error && <p className="text-red-400 text-sm">{form.error}</p>}
        {form.success && <p className="text-green-400 text-sm">{form.success}</p>}

        {/* API Command Preview */}
        {form.curlCommand && (
          <div className="border-t border-gray-700 pt-4 mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              API Command Preview (Pending Changes)
            </label>
            <div className="bg-gray-950 p-3 rounded-lg border border-gray-700 relative group overflow-hidden">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all overflow-x-auto p-2">
                {form.curlCommand}
              </pre>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(form.curlCommand || '')}
                className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-400 rounded hover:text-white hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">This command reflects the changes you are about to save.</p>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-gray-700">
          <button
            type="submit"
            disabled={form.isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800"
          >
            {form.isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AssistantDetailsForm;
