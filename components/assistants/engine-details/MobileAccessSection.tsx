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

interface MobileAccessSectionProps {
    mobileAppAccess: boolean;
    qrCodeWidget: boolean;
    onToggleMobileAppAccess: () => void;
    onToggleQrCodeWidget: () => void;
    isSupportedIdpForQrCode: boolean;
    activeMobileLink: string | null;
}

export const MobileAccessSection: React.FC<MobileAccessSectionProps> = ({
    mobileAppAccess,
    qrCodeWidget,
    onToggleMobileAppAccess,
    onToggleQrCodeWidget,
    isSupportedIdpForQrCode,
    activeMobileLink
}) => {
    return (
        <CollapsibleSection title="Mobile App Link & QR Code">
            <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                <div className="flex flex-col md:flex-row md:items-center gap-6 pb-3 border-b border-gray-700/60 mb-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                            type="checkbox"
                            id="mobileAppAccessToggle"
                            checked={mobileAppAccess}
                            onChange={onToggleMobileAppAccess}
                            className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-semibold text-white">
                            Enable Mobile App Access
                        </span>
                        <InfoTooltip text="Allows users to connect to this app from their mobile devices." />
                    </label>

                    <label className={`flex items-center space-x-2 ${isSupportedIdpForQrCode ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                        <input
                            type="checkbox"
                            id="qrCodeLoginToggle"
                            checked={qrCodeWidget}
                            onChange={onToggleQrCodeWidget}
                            disabled={!isSupportedIdpForQrCode}
                            className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 disabled:bg-gray-800 disabled:border-gray-700"
                        />
                        <span className="text-sm font-semibold text-white">
                            Enable QR Code Login widget
                        </span>
                        <InfoTooltip text="Displays the login QR code widget on the user's web app homepage." />
                        {!isSupportedIdpForQrCode && (
                            <span className="text-xs text-yellow-400 font-medium ml-2">
                                *(Supported for Google Workspace and Entra ID only)*
                            </span>
                        )}
                    </label>
                </div>

                {!isSupportedIdpForQrCode ? (
                    <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-md text-sm text-yellow-300">
                        <strong>QR Code Login Disabled:</strong> The configured Identity Provider is not supported for QR code login. This feature is only available when using Google Workspace (GSuite) or Microsoft Entra ID.
                    </div>
                ) : activeMobileLink && qrCodeWidget ? (
                    <div className="space-y-4">
                        <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-md text-sm text-blue-200">
                            <strong>Mobile Deep Link Active:</strong> Google Cloud mobile app configuration link is ready.
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Generated Mobile URL</label>
                            <div className="flex gap-2">
                                <input type="text" value={activeMobileLink} className="flex-1 bg-gray-700 border-gray-600 rounded px-3 py-1.5 text-xs text-gray-300 font-mono" readOnly />
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(activeMobileLink || '')}
                                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs border border-gray-600 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border border-gray-700 w-fit mx-auto">
                            <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(activeMobileLink)}`} 
                                alt="Mobile Login QR Code" 
                                className="mb-2" 
                            />
                            <span className="text-[10px] text-gray-500 font-medium">Scan to login via Mobile App</span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-md text-sm text-yellow-200">
                            <strong>No Live Mobile Link Found:</strong> Ensure you have configured a workforce identity pool provider under the IDP Configuration section below. 
                        </div>
                    </div>
                )}
            </div>
        </CollapsibleSection>
    );
};

export default MobileAccessSection;
