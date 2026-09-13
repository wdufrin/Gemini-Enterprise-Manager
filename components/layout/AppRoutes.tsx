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
import { Navigate } from 'react-router-dom';
import { Page, ReasoningEngine, UserProfile } from '../../types';

// Lazy-loaded page components for bundle splitting (Task 7.2)
const AgentsPage = React.lazy(() => import('../../pages/AgentsPage'));
const SkillsRegistryPage = React.lazy(() => import('../../pages/SkillsRegistryPage'));
const AuthorizationsPage = React.lazy(() => import('../../pages/AuthorizationsPage'));
const AgentEnginesPage = React.lazy(() => import('../../pages/AgentEnginesPage'));
const DataStoresPage = React.lazy(() => import('../../pages/DataStoresPage'));
const BackupPage = React.lazy(() => import('../../pages/BackupPage'));
const ModelArmorPage = React.lazy(() => import('../../pages/ModelArmorPage'));
const ObservabilityPage = React.lazy(() => import('../../pages/ObservabilityPage'));
const AgentBuilderPage = React.lazy(() => import('../../pages/AgentBuilderPage'));
const A2aTesterPage = React.lazy(() => import('../../pages/A2aTesterPage'));
const McpServersPage = React.lazy(() => import('../../pages/McpServersPage'));
const CloudRunAgentsPage = React.lazy(() => import('../../pages/CloudRunAgentsPage'));
const DialogflowAgentsPage = React.lazy(() => import('../../pages/DialogflowAgentsPage'));
const ArchitecturePage = React.lazy(() => import('../../pages/ArchitecturePage'));
const AssistantPage = React.lazy(() => import('../../pages/AssistantPage'));
const LicensePage = React.lazy(() => import('../../pages/LicensePage'));
const GEQuotaUsagePage = React.lazy(() => import('../../pages/GEQuotaUsagePage'));
const AgentPermissionsPage = React.lazy(() => import('../../pages/AgentPermissionsPage'));
const ConfigAuditPage = React.lazy(() => import('../../pages/ConfigAuditPage'));

interface AppRoutesProps {
  currentPage: Page;
  pageContext: any;
  projectNumber: string;
  projectId: string;
  accessToken: string;
  userProfile: UserProfile | null;
  onSetProjectNumber: (projectNumber: string) => void;
  onNavigate: (page: Page, context?: any) => void;
  onDirectQuery: (engine: ReasoningEngine) => void;
  onBuildTriggered: (buildId: string, projectId?: string) => void;
}

export const AppRoutes: React.FC<AppRoutesProps> = ({
  currentPage,
  pageContext,
  projectNumber,
  projectId,
  accessToken,
  userProfile,
  onSetProjectNumber,
  onNavigate,
  onDirectQuery,
  onBuildTriggered,
}) => {
  const commonProps = { projectNumber, projectId };
  const projectProps = { ...commonProps, setProjectNumber: onSetProjectNumber };

  switch (currentPage) {
    case Page.AGENTS:
      return <AgentsPage {...projectProps} context={pageContext} accessToken={accessToken} />;
    case Page.SKILLS_REGISTRY:
      return <SkillsRegistryPage {...projectProps} accessToken={accessToken} userProfile={userProfile} />;
    case Page.ASSISTANT:
      return <AssistantPage {...projectProps} accessToken={accessToken} userProfile={userProfile} onBuildTriggered={onBuildTriggered} />;
    case Page.AUTHORIZATIONS:
      return <AuthorizationsPage {...commonProps} />;
    case Page.AGENT_PERMISSIONS:
      return <AgentPermissionsPage {...projectProps} />;
    case Page.AGENT_ENGINES:
      return <AgentEnginesPage {...commonProps} onNavigate={onNavigate} accessToken={accessToken} onDirectQuery={onDirectQuery} />;
    case Page.A2A_TESTER:
      return <A2aTesterPage {...projectProps} onNavigate={onNavigate} accessToken={accessToken} />;
    case Page.AGENT_BUILDER:
      return <AgentBuilderPage {...projectProps} context={pageContext} onBuildTriggered={onBuildTriggered} />;
    case Page.CLOUD_RUN_AGENTS:
      return <CloudRunAgentsPage {...projectProps} />;
    case Page.DIALOGFLOW_AGENTS:
      return <DialogflowAgentsPage {...projectProps} accessToken={accessToken} />;
    case Page.CHAT:
      return <AssistantPage {...projectProps} accessToken={accessToken} userProfile={userProfile} onBuildTriggered={onBuildTriggered} />;
    case Page.DATA_STORES:
      return <DataStoresPage {...projectProps} accessToken={accessToken} />;
    case Page.MCP_SERVERS:
      return <McpServersPage {...commonProps} />;
    case Page.MODEL_ARMOR:
      return <ModelArmorPage {...projectProps} />;
    case Page.OBSERVABILITY:
      return <ObservabilityPage {...projectProps} projectId={projectId} />;
    case Page.BACKUP_RECOVERY:
      return <BackupPage {...projectProps} accessToken={accessToken} />;
    case Page.CONFIG_AUDIT:
      return <ConfigAuditPage projectNumber={projectNumber} projectId={projectId} accessToken={accessToken} />;
    case Page.LICENSE:
      return <LicensePage {...projectProps} onBuildTriggered={onBuildTriggered} />;
    case Page.GE_QUOTA_USAGE:
      return <GEQuotaUsagePage projectNumber={projectNumber} />;
    case Page.ARCHITECTURE:
      return (
        <ArchitecturePage 
          {...projectProps} 
          onNavigate={onNavigate} 
          onDirectQuery={onDirectQuery}
        />
      );
    default:
      return <AgentsPage {...projectProps} accessToken={accessToken} />;
  }
};
