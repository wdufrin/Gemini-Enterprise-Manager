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

export interface FeatureDefinition {
    key: string;
    displayName: string;
    description: string;
    isInverted: boolean;
    category: 'Access & Security' | 'Models & Intelligence' | 'Canvas & UI' | 'Connectors & Grounding' | 'Observability & Analytics';
    isCustom?: boolean;
}

export const FEATURE_CATEGORIES = ['All', 'Access & Security', 'Models & Intelligence', 'Canvas & UI', 'Connectors & Grounding', 'Observability & Analytics'] as const;

export const FEATURE_DEFS: FeatureDefinition[] = [
    // Access & Security
    { key: 'mobile-app-access', displayName: 'Mobile App Access', description: 'Enables mobile app authentication and access for end users on iOS and Android.', isInverted: false, category: 'Access & Security' },
    { key: 'disable-mobile-app-access', displayName: 'Legacy Mobile Access (Inverted)', description: 'Legacy inverted toggle for mobile app access.', isInverted: true, category: 'Access & Security' },
    { key: 'enable-qr-code-widget', displayName: 'QR Code Mobile Login Widget', description: 'Renders an instant QR code pairing modal for mobile app login.', isInverted: false, category: 'Access & Security' },
    { key: 'disable-agent-sharing', displayName: 'Workspace Agent Sharing', description: 'Allows team members to share and discover custom agents across the enterprise workspace.', isInverted: true, category: 'Access & Security' },
    { key: 'agent-sharing-without-admin-approval', displayName: 'Auto-Approve Agent Sharing', description: 'Allows team members to share and publish agents instantly without requiring explicit workspace admin approval.', isInverted: false, category: 'Access & Security' },
    { key: 'skill-sharing', displayName: 'Workspace Skill Sharing', description: 'Allows team members to share and discover custom skills across the enterprise workspace.', isInverted: false, category: 'Access & Security' },
    { key: 'skill-sharing-without-admin-approval', displayName: 'Auto-Approve Skill Sharing', description: 'Allows team members to share and publish skills instantly without requiring explicit workspace admin approval.', isInverted: false, category: 'Access & Security' },
    { key: 'enable-end-user-sharing-with-groups', displayName: 'End Users Share with Groups', description: 'Allow End Users to share agents directly with Workforce Identity groups (Google Identity & WIF+SCIM).', isInverted: false, category: 'Access & Security' },
    { key: 'disable-welcome-emails', displayName: 'Automated Welcome Emails', description: 'Sends automated onboarding and welcome emails to new end users upon first login.', isInverted: true, category: 'Access & Security' },

    // Models & Intelligence
    { key: 'model-selector', displayName: 'Dynamic Model Selector', description: 'Enables end users to select between available Gemini models (Flash, Pro, Thinking) in active sessions.', isInverted: false, category: 'Models & Intelligence' },
    { key: 'workflow-agents', displayName: 'Autonomous Workflow Agents', description: 'Allows assistants to trigger autonomous workflow sequences and multi-step execution tasks.', isInverted: false, category: 'Models & Intelligence' },
    { key: 'single-agent-orchestration', displayName: 'Single-Agent Intent Routing', description: 'Enables automated intent classification and routing to specialized single-agent endpoints.', isInverted: false, category: 'Models & Intelligence' },
    { key: 'multi-agent-orchestration', displayName: 'Multi-Agent Coordinator', description: 'Enables multi-agent coordination and cross-agent task delegation for complex enterprise workflows.', isInverted: false, category: 'Models & Intelligence' },
    { key: 'sobi', displayName: 'Sobi Asynchronous Agent Tasks', description: 'Enables background asynchronous task execution and long-running job processing for agents.', isInverted: false, category: 'Models & Intelligence' },
    { key: 'skills', displayName: 'Specialized Skills Engine', description: 'Enables the assistant to dynamically invoke specialized skills and plugins.', isInverted: false, category: 'Models & Intelligence' },
    { key: 'disable-skills', displayName: 'Developer Skills System (Inverted)', description: 'Allows the assistant to use specialized developer skills and execution plugins.', isInverted: true, category: 'Models & Intelligence' },
    { key: 'personalization-memory', displayName: 'Personalization & Persistent Memory', description: 'Remembers context from past conversations and user preferences to personalize future assistant answers.', isInverted: false, category: 'Models & Intelligence' },
    { key: 'personalization-suggested-highlights', displayName: 'AI Suggested Highlights', description: 'Provides proactive contextual highlights and suggested follow-up actions based on user conversation patterns.', isInverted: false, category: 'Models & Intelligence' },
    { key: 'bi-directional-audio', displayName: 'Bi-directional Real-Time Audio', description: 'Enables real-time two-way voice conversations with conversational Gemini models.', isInverted: false, category: 'Models & Intelligence' },

    // Canvas & UI
    { key: 'speech-to-text', displayName: 'Speech-to-Text (Voice Dictation)', description: 'Enables speech-to-text voice dictation microphone in the Enterprise Web App (Desktop / Browser) search interface.', isInverted: false, category: 'Canvas & UI' },
    { key: 'projects', displayName: 'Projects Workspace', description: 'Enables end users to create, organize, and manage persistent project workspaces in the Enterprise Web App.', isInverted: false, category: 'Canvas & UI' },
    { key: 'disable-projects', displayName: 'Legacy Projects Workspace (Inverted)', description: 'Legacy inverted toggle for the Projects workspace.', isInverted: true, category: 'Canvas & UI' },
    { key: 'agent-gallery', displayName: 'Workspace Agent Gallery', description: 'Shows the enterprise catalog and gallery of published agents to end users.', isInverted: false, category: 'Canvas & UI' },
    { key: 'no-code-agent-builder', displayName: 'No-Code Agent Designer', description: 'Empowers non-technical users to build and test custom assistants and agents inside the web app.', isInverted: false, category: 'Canvas & UI' },
    { key: 'canvas-app-builder', displayName: 'Canvas App Builder', description: 'Allows end users to build, preview, and iterate on interactive apps directly inside the Canvas workspace.', isInverted: false, category: 'Canvas & UI' },
    { key: 'prompt-gallery', displayName: 'Prompt Template Gallery', description: 'Shows recommended prompt starters and company-wide template libraries in the search interface.', isInverted: false, category: 'Canvas & UI' },
    { key: 'notebook-lm', displayName: 'Gemini Notebook Integration', description: 'Allows users to ground queries against interactive Notebooks and multi-source research notebooks.', isInverted: false, category: 'Canvas & UI' },
    { key: 'in-app-notifications', displayName: 'In-App Notifications & Alerts', description: 'Renders in-app notifications and proactive assistant announcements in the web app.', isInverted: false, category: 'Canvas & UI' },
    { key: 'disable-canvas-workspace', displayName: 'Canvas Interactive Workspace', description: 'Side-by-side interactive document and artifact editing canvas attached to chat conversations.', isInverted: true, category: 'Canvas & UI' },
    { key: 'disable-canvas', displayName: 'Legacy Canvas Workspace', description: 'Enables legacy side-by-side canvas for document generation and editing.', isInverted: true, category: 'Canvas & UI' },
    { key: 'disable-image-generation', displayName: 'Imagen 3 Image Generation', description: 'Allows end users to generate and iterate on images in conversational chat.', isInverted: true, category: 'Canvas & UI' },
    { key: 'disable-video-generation', displayName: 'Veo Video Generation (EAP)', description: 'Allows end users to synthesize short video clips and animations directly in chat.', isInverted: true, category: 'Canvas & UI' },

    // Connectors & Grounding
    { key: 'cross-domain-documents', displayName: 'Cross-Domain Document Grounding', description: 'Indexes and searches documents shared across organizational domains when using Drive and SharePoint connectors.', isInverted: false, category: 'Connectors & Grounding' },
    { key: 'cross-product-intelligence', displayName: 'Cross-Product Workspace Intelligence', description: 'Integrates contextual insights and data sources across Google Workspace and connected SaaS apps.', isInverted: false, category: 'Connectors & Grounding' },
    { key: 'disable-onedrive-upload', displayName: 'OneDrive Direct File Upload', description: 'Enables users to directly attach and ground documents from Microsoft OneDrive.', isInverted: true, category: 'Connectors & Grounding' },
    { key: 'disable-google-drive-upload', displayName: 'Google Drive Direct File Upload', description: 'Enables users to directly attach and ground documents from Google Drive.', isInverted: true, category: 'Connectors & Grounding' },
    { key: 'disable-talk-to-content', displayName: 'Talk to Content (Document Q&A)', description: 'Allows conversational deep-dives over attached documents with exact source citations.', isInverted: true, category: 'Connectors & Grounding' },
    { key: 'people-search', displayName: 'People & Employee Directory Search', description: 'Allows searching for employees, team members, and role directories within the company.', isInverted: false, category: 'Connectors & Grounding' },
    { key: 'people-search-org-chart', displayName: 'Org Chart in People Search', description: 'Displays organizational tree charts in people search results.', isInverted: false, category: 'Connectors & Grounding' },

    // Observability & Analytics
    { key: 'feedback', displayName: 'Thumbs Up/Down Quality Feedback', description: 'Collects user response ratings and feedback to monitor agent answer quality.', isInverted: false, category: 'Observability & Analytics' },
    { key: 'session-sharing', displayName: 'Conversation Session Sharing', description: 'Allows end users to generate shareable links for assistant conversations.', isInverted: false, category: 'Observability & Analytics' }
];
