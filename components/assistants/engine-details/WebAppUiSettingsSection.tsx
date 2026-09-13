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
import CollapsibleSection from './CollapsibleSection';
import InfoTooltip from '../../InfoTooltip';

interface WebAppUiSettingsSectionProps {
    enableWebApp: boolean;
    enableAutocomplete: boolean;
    enableQualityFeedback: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const WebAppUiSettingsSection: React.FC<WebAppUiSettingsSectionProps> = ({
    enableWebApp,
    enableAutocomplete,
    enableQualityFeedback,
    onChange
}) => {
    return (
        <CollapsibleSection title="Gemini Web App UI Settings">
            <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                <div className="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="enableWebApp"
                        id="enableWebApp"
                        checked={enableWebApp}
                        onChange={onChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="enableWebApp" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                        Enable User-Facing Web App Endpoint
                        <InfoTooltip text="Enables or disables the default Google-hosted web interface portal for this assistant/search app." />
                    </label>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="enableAutocomplete"
                        id="enableAutocomplete"
                        checked={enableAutocomplete}
                        onChange={onChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="enableAutocomplete" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                        Enable Autocomplete Suggestions
                        <InfoTooltip text="Shows matching autocomplete suggestion dropdowns as users type queries in the search/chat bar." />
                    </label>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="enableQualityFeedback"
                        id="enableQualityFeedback"
                        checked={enableQualityFeedback}
                        onChange={onChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="enableQualityFeedback" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                        Enable Thumbs Up/Down Quality Ratings
                        <InfoTooltip text="Renders standard quality rating feedback icons (thumbs up/down) next to assistant/chat replies." />
                    </label>
                </div>
            </div>
        </CollapsibleSection>
    );
};

export default WebAppUiSettingsSection;
