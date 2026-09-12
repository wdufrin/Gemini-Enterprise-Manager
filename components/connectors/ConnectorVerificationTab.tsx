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
import JiraVerification from './verification/JiraVerification';
import ConfluenceVerification from './verification/ConfluenceVerification';
import SalesforceVerification from './verification/SalesforceVerification';
import ServiceNowVerification from './verification/ServiceNowVerification';
import EntraIdVerification from './verification/EntraIdVerification';
import SharePointVerification from './verification/SharePointVerification';
import OutlookVerification from './verification/OutlookVerification';
import TeamsVerification from './verification/TeamsVerification';
import SlackVerification from './verification/SlackVerification';
import JiraDcVerification from './verification/JiraDcVerification';
import ConfluenceDcVerification from './verification/ConfluenceDcVerification';
import DropboxVerification from './verification/DropboxVerification';
import NotionVerification from './verification/NotionVerification';
import ZendeskVerification from './verification/ZendeskVerification';
import GenericVerification from './verification/GenericVerification';
import OneDriveVerification from './verification/OneDriveVerification';
import BoxVerification from './verification/BoxVerification';
import GitHubVerification from './verification/GitHubVerification';
import HubSpotVerification from './verification/HubSpotVerification';
import LinearVerification from './verification/LinearVerification';
import MondayVerification from './verification/MondayVerification';
import ShopifyVerification from './verification/ShopifyVerification';

interface ConnectorVerificationTabProps {
    connector: any;
}

export type VerificationType = 'JIRA' | 'JIRA_DC' | 'CONFLUENCE' | 'CONFLUENCE_DC' | 'SALESFORCE' | 'SERVICENOW' | 'ENTRA_ID' | 'SHAREPOINT' | 'OUTLOOK' | 'TEAMS' | 'ONEDRIVE' | 'SLACK' | 'DROPBOX' | 'NOTION' | 'ZENDESK' | 'BOX' | 'GITHUB' | 'HUBSPOT' | 'LINEAR' | 'MONDAY' | 'SHOPIFY' | 'GENERIC';
export type DataMode = 'INGESTION' | 'FEDERATED';

const ConnectorVerificationTab: React.FC<ConnectorVerificationTabProps> = ({ connector }) => {
    const connectorState = connector.connectorState || {};
    const stateString = JSON.stringify(connectorState).toLowerCase();
    const nameString = (connector.name || '').toLowerCase();

    // Detection Logic
    const getInitialType = (): VerificationType => {
        if (stateString.includes('jira_dc') || stateString.includes('jira-dc') || nameString.includes('jira_dc') || nameString.includes('jira-dc')) return 'JIRA_DC';
        if (stateString.includes('jira') || nameString.includes('jira')) return 'JIRA';
        if (stateString.includes('confluence_dc') || stateString.includes('confluence-dc') || nameString.includes('confluence_dc') || nameString.includes('confluence-dc')) return 'CONFLUENCE_DC';
        if (stateString.includes('confluence') || nameString.includes('confluence')) return 'CONFLUENCE';
        if (stateString.includes('salesforce') || nameString.includes('salesforce')) return 'SALESFORCE';
        if (stateString.includes('servicenow') || nameString.includes('servicenow')) return 'SERVICENOW';
        if (stateString.includes('entra') || nameString.includes('entra') || nameString.includes('azure')) return 'ENTRA_ID';
        if (stateString.includes('sharepoint')) return 'SHAREPOINT';
        if (stateString.includes('outlook')) return 'OUTLOOK';
        if (stateString.includes('teams') || nameString.includes('teams')) return 'TEAMS';
        if (stateString.includes('onedrive')) return 'ONEDRIVE';
        if (stateString.includes('slack') || nameString.includes('slack')) return 'SLACK';
        if (stateString.includes('dropbox') || nameString.includes('dropbox')) return 'DROPBOX';
        if (stateString.includes('notion') || nameString.includes('notion')) return 'NOTION';
        if (stateString.includes('zendesk') || nameString.includes('zendesk')) return 'ZENDESK';
        if (stateString.includes('box') || nameString.includes('box')) return 'BOX';
        if (stateString.includes('github') || nameString.includes('github')) return 'GITHUB';
        if (stateString.includes('hubspot') || nameString.includes('hubspot')) return 'HUBSPOT';
        if (stateString.includes('linear') || nameString.includes('linear')) return 'LINEAR';
        if (stateString.includes('monday') || nameString.includes('monday')) return 'MONDAY';
        if (stateString.includes('shopify') || nameString.includes('shopify')) return 'SHOPIFY';
        return 'GENERIC';
    };

    const [activeType, setActiveType] = useState<VerificationType>(getInitialType());
    const [dataMode, setDataMode] = useState<DataMode>('INGESTION');

    const supportsDataMode = (type: VerificationType) => {
        return ['JIRA', 'JIRA_DC', 'CONFLUENCE', 'CONFLUENCE_DC', 'SALESFORCE', 'SERVICENOW', 'SHAREPOINT', 'OUTLOOK', 'TEAMS', 'ONEDRIVE', 'SLACK', 'BOX'].includes(type);
    };

    const renderContent = () => {
        const props = { dataMode }; // Pass dataMode to all verification components

        switch (activeType) {
            case 'JIRA_DC': return <JiraDcVerification {...props} />;
            case 'JIRA': return <JiraVerification {...props} />;
            case 'CONFLUENCE_DC': return <ConfluenceDcVerification {...props} />;
            case 'CONFLUENCE': return <ConfluenceVerification {...props} />;
            case 'SALESFORCE': return <SalesforceVerification {...props} />;
            case 'SERVICENOW': return <ServiceNowVerification {...props} />;
            case 'ENTRA_ID': return <EntraIdVerification {...props} />;
            case 'SHAREPOINT': return <SharePointVerification {...props} />;
            case 'OUTLOOK': return <OutlookVerification {...props} />;
            case 'TEAMS': return <TeamsVerification {...props} />;
            case 'ONEDRIVE': return <OneDriveVerification {...props} />;
            case 'SLACK': return <SlackVerification {...props} />;
            case 'DROPBOX': return <DropboxVerification />;
            case 'NOTION': return <NotionVerification />;
            case 'ZENDESK': return <ZendeskVerification />;
            case 'BOX': return <BoxVerification {...props} />;
            case 'GITHUB': return <GitHubVerification />;
            case 'HUBSPOT': return <HubSpotVerification />;
            case 'LINEAR': return <LinearVerification />;
            case 'MONDAY': return <MondayVerification />;
            case 'SHOPIFY': return <ShopifyVerification />;
            default: return <GenericVerification {...props} />;
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-900/50 p-3 rounded-lg border border-gray-700 gap-3">
                <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-sm font-medium text-gray-300">Pre-Flight Readiness Checklist</span>
                </div>

                <div className="flex items-center gap-4">
                    {/* Data Mode Toggle */}
                    {supportsDataMode(activeType) && (
                        <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-gray-600">
                            <button
                                onClick={() => setDataMode('INGESTION')}
                                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${dataMode === 'INGESTION'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Ingestion
                            </button>
                            <button
                                onClick={() => setDataMode('FEDERATED')}
                                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${dataMode === 'FEDERATED'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                Federated
                            </button>
                        </div>
                    )}

                    {/* Connector Type Selector */}
                    <select
                        value={activeType}
                        onChange={(e) => setActiveType(e.target.value as VerificationType)}
                        className="bg-gray-800 text-white text-xs border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-blue-500 hover:border-blue-400 transition-colors cursor-pointer"
                    >
                        <option value="GENERIC">Generic / Other</option>
                        <option value="JIRA">Atlassian Jira Cloud</option>
                        <option value="JIRA_DC">Atlassian Jira Data Center</option>
                        <option value="CONFLUENCE">Atlassian Confluence Cloud</option>
                        <option value="CONFLUENCE_DC">Atlassian Confluence Data Center</option>
                        <option value="SALESFORCE">Salesforce</option>
                        <option value="SERVICENOW">ServiceNow</option>
                        <option value="SHAREPOINT">Microsoft SharePoint</option>
                        <option value="OUTLOOK">Microsoft Outlook</option>
                        <option value="TEAMS">Microsoft Teams</option>
                        <option value="ONEDRIVE">Microsoft OneDrive</option>
                        <option value="ENTRA_ID">Microsoft Entra ID</option>
                        <option value="SLACK">Slack</option>
                        <option value="DROPBOX">Dropbox</option>
                        <option value="NOTION">Notion</option>
                        <option value="ZENDESK">Zendesk</option>
                        <option value="BOX">Box</option>
                        <option value="GITHUB">GitHub</option>
                        <option value="HUBSPOT">HubSpot</option>
                        <option value="LINEAR">Linear</option>
                        <option value="MONDAY">Monday</option>
                        <option value="SHOPIFY">Shopify</option>
                    </select>
                </div>
            </div>

            {supportsDataMode(activeType) && (
                <div className={`p-1 rounded border-l-4 ${dataMode === 'INGESTION' ? 'border-blue-500 bg-blue-500/10' : 'border-purple-500 bg-purple-500/10'}`}>
                    <p className="text-xs text-gray-300 px-2 py-1">
                        Showing instructions for <strong>{dataMode === 'INGESTION' ? 'Data Ingestion' : 'Federated Search'}</strong> mode.
                        {dataMode === 'INGESTION' ? ' (Data is copied to Vertex AI)' : ' (Live real-time querying)'}
                    </p>
                </div>
            )}

            {renderContent()}

            {/* Diagnostics Section */}
            <div className="mt-8 pt-6 border-t border-gray-700">
                <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider flex items-center">
                    <svg className="w-4 h-4 mr-2 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Diagnostics & Troubleshooting
                </h3>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-semibold text-white">Cloud Logging</h4>
                            <p className="text-xs text-gray-400 mt-1">
                                Check for authentication failures, permission denied errors, or other internal connector issues.
                            </p>
                        </div>
                        <a
                            href={`https://console.cloud.google.com/logs/query;query=(resource.type%3D%22vertex_ai_search_connector%22%20AND%20resource.labels.connector_id%3D%22${connector.name?.split('/').pop()}%22)%20OR%20(jsonPayload.connectorRunPayload.dataConnector%3D%22${connector.name}%22)%20AND%20severity%3E%3DERROR?project=${connector.name?.split('/')[1]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded transition-colors border border-gray-600"
                        >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            View Connector Errors
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConnectorVerificationTab;
